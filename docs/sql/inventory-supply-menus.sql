-- Adds menu-specific doses to the reusable supply catalog.
-- Requires docs/sql/inventory-supplies.sql. Existing supplies and logs stay intact.

begin;

create table if not exists public.supply_menu_links (
  supply_id text not null references public.supplies(id) on delete cascade,
  product_id text not null references public.products(id) on delete cascade,
  owner_id text not null,
  quantity_per_serving numeric(18, 6) not null
    check (quantity_per_serving > 0 and
           quantity_per_serving::text not in ('NaN', 'Infinity', '-Infinity')),
  quantity_tolerance numeric(18, 6) not null default 0,
  created_at timestamptz not null default now(),
  constraint supply_menu_links_tolerance_range
    check (quantity_tolerance >= 0 and quantity_tolerance < quantity_per_serving
           and quantity_tolerance::text not in ('NaN', 'Infinity', '-Infinity')),
  primary key (supply_id, product_id)
);

create index if not exists supply_menu_links_owner_product_idx
  on public.supply_menu_links (owner_id, product_id);
create index if not exists supply_menu_links_product_idx
  on public.supply_menu_links (product_id);

alter table public.supply_menu_links enable row level security;
drop policy if exists supply_menu_links_owner_read on public.supply_menu_links;
create policy supply_menu_links_owner_read on public.supply_menu_links
  for select to authenticated
  using (owner_id = (auth.jwt() ->> 'owner_id'));
revoke all on public.supply_menu_links from public, anon, authenticated;
grant select on public.supply_menu_links to authenticated;

alter table public.supply_stock_logs
  add column if not exists product_id text,
  add column if not exists product_name text,
  add column if not exists quantity_per_serving numeric(18, 6),
  add column if not exists quantity_tolerance numeric(18, 6);

do $constraint$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.supply_stock_logs'::regclass
      and conname = 'supply_stock_logs_product_id_fkey'
  ) then
    alter table public.supply_stock_logs
      add constraint supply_stock_logs_product_id_fkey
      foreign key (product_id) references public.products(id) on delete set null;
  end if;
end;
$constraint$;

create or replace function public.save_supply_with_menus(p_data jsonb, p_menus jsonb)
returns public.supplies
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_owner text := auth.jwt() ->> 'owner_id';
  v_actor text := auth.jwt() ->> 'sub';
  v_supply public.supplies%rowtype;
  v_id text;
  v_name text;
  v_unit text;
  v_usage_label text;
  v_pack_size numeric;
  v_servings integer;
  v_min_stock numeric;
  v_price numeric;
  v_entry jsonb;
  v_product_id text;
  v_product_name text;
  v_dose numeric;
  v_tolerance numeric;
  v_seen text[] := array[]::text[];
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'authenticated'
      or coalesce(auth.jwt() ->> 'user_role', '') <> 'admin'
      or nullif(v_owner, '') is null or nullif(v_actor, '') is null then
    raise exception 'Only an authenticated inventory admin can save supplies' using errcode = '42501';
  end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object'
      or p_menus is null or jsonb_typeof(p_menus) <> 'array' then
    raise exception 'Supply data must be an object and menus must be an array' using errcode = '22023';
  end if;
  if jsonb_array_length(p_menus) > 100 then
    raise exception 'A supply can link to at most 100 menus' using errcode = '22023';
  end if;

  v_id := nullif(btrim(p_data ->> 'id'), '');
  if v_id is null then
    -- The existing RPC validates metadata, prevents duplicate names, and
    -- records any initial stock in the same transaction as these links.
    select * into v_supply from public.create_supply(p_data);
    select * into v_supply from public.supplies
      where id = v_supply.id and owner_id = v_owner for update;
  else
    select * into v_supply from public.supplies
      where id = v_id and owner_id = v_owner for update;
    if not found then
      raise exception 'Supply not found' using errcode = 'P0002';
    end if;
  end if;

  -- Every link writer and menu consumer locks the supply first, then its links.
  perform 1 from public.supply_menu_links l
    where l.supply_id = v_supply.id
    order by l.product_id for update;

  if v_id is not null then
    v_name := btrim(coalesce(p_data ->> 'name', v_supply.name));
    v_unit := btrim(coalesce(p_data ->> 'unit', v_supply.unit));
    v_usage_label := case when p_data ? 'usage_label'
      then nullif(btrim(coalesce(p_data ->> 'usage_label', '')), '')
      else v_supply.usage_label end;
    v_pack_size := coalesce((p_data ->> 'pack_size')::numeric, v_supply.pack_size);
    v_servings := case when p_data ? 'servings_per_pack'
      then nullif(p_data ->> 'servings_per_pack', '')::integer
      else v_supply.servings_per_pack end;
    v_min_stock := coalesce((p_data ->> 'min_stock_level')::numeric, v_supply.min_stock_level);
    v_price := coalesce((p_data ->> 'default_price')::numeric, v_supply.default_price, 0);

    if v_name is null or length(v_name) < 1 or length(v_name) > 120
        or v_unit is null or length(v_unit) < 1 or length(v_unit) > 24
        or (v_usage_label is not null and length(v_usage_label) > 120) then
      raise exception 'Name, unit, or usage label is invalid' using errcode = '22023';
    end if;
    if v_pack_size is null or v_pack_size <= 0 or v_pack_size > 999999999999.999999
        or v_pack_size <> round(v_pack_size, 6)
        or v_min_stock is null or v_min_stock < 0 or v_min_stock > 999999999999.999999
        or v_min_stock <> round(v_min_stock, 6)
        or v_price < 0 or v_price > 999999999999.999999 or v_price <> round(v_price, 6)
        or (v_servings is not null and
            case when v_servings <= 0 then true else v_pack_size / v_servings < 0.000001 end) then
      raise exception 'Invalid supply metadata quantities' using errcode = '22023';
    end if;

    perform pg_advisory_xact_lock(hashtextextended(v_owner || ':' || lower(v_name), 0));
    if exists (select 1 from public.supplies s
               where s.owner_id = v_owner and s.id <> v_supply.id
                 and lower(btrim(s.name)) = lower(v_name)) then
      raise exception 'Supply already exists; reuse its saved item' using errcode = '23505';
    end if;
  end if;

  -- Validate the complete replacement before changing metadata or links.
  for v_entry in select value from jsonb_array_elements(p_menus) loop
    if jsonb_typeof(v_entry) <> 'object' then
      raise exception 'Each menu entry must be an object' using errcode = '22023';
    end if;
    v_product_id := nullif(btrim(v_entry ->> 'product_id'), '');
    v_dose := (v_entry ->> 'quantity_per_serving')::numeric;
    v_tolerance := coalesce((v_entry ->> 'quantity_tolerance')::numeric, 0);
    if v_product_id is null or v_dose is null or v_dose <= 0
        or v_dose > 999999999999.999999 or v_dose <> round(v_dose, 6)
        or v_dose::text in ('NaN', 'Infinity', '-Infinity')
        or v_tolerance < 0 or v_tolerance >= v_dose
        or v_tolerance > 999999999999.999999
        or v_tolerance <> round(v_tolerance, 6)
        or v_tolerance::text in ('NaN', 'Infinity', '-Infinity') then
      raise exception 'Menu dose and tolerance must be valid with at most 6 decimals; tolerance must be less than dose' using errcode = '22023';
    end if;
    if v_product_id = any(v_seen) then
      raise exception 'The same menu was supplied twice' using errcode = '23505';
    end if;
    select p.name into v_product_name from public.products p
      where p.id = v_product_id and p.owner_id = v_owner for share;
    if not found then
      raise exception 'Menu product not found for this owner' using errcode = '23503';
    end if;
    v_seen := array_append(v_seen, v_product_id);
  end loop;

  if v_id is not null then
    update public.supplies set
      name = v_name, unit = v_unit, usage_label = v_usage_label,
      pack_size = v_pack_size, servings_per_pack = v_servings,
      min_stock_level = v_min_stock, default_price = v_price,
      updated_at = now()
    where id = v_supply.id
    returning * into v_supply;
  end if;

  delete from public.supply_menu_links where supply_id = v_supply.id;
  for v_entry in select value from jsonb_array_elements(p_menus) loop
    insert into public.supply_menu_links
      (supply_id, product_id, owner_id, quantity_per_serving, quantity_tolerance)
    values
      (v_supply.id, btrim(v_entry ->> 'product_id'), v_owner,
       (v_entry ->> 'quantity_per_serving')::numeric,
       coalesce((v_entry ->> 'quantity_tolerance')::numeric, 0));
  end loop;
  return v_supply;
end;
$function$;

create or replace function public.consume_supply_menu(
  p_supply_id text,
  p_product_id text,
  p_servings numeric,
  p_note text default ''
)
returns public.supplies
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_owner text := auth.jwt() ->> 'owner_id';
  v_actor text := auth.jwt() ->> 'sub';
  v_supply public.supplies%rowtype;
  v_dose numeric;
  v_tolerance numeric;
  v_product_name text;
  v_before numeric;
  v_after numeric;
  v_debit numeric;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'authenticated'
      or coalesce(auth.jwt() ->> 'user_role', '') <> 'admin'
      or nullif(v_owner, '') is null or nullif(v_actor, '') is null then
    raise exception 'Only an authenticated inventory admin can consume supplies' using errcode = '42501';
  end if;
  if nullif(p_supply_id, '') is null or nullif(p_product_id, '') is null
      or p_servings is null or p_servings <= 0 or p_servings > 999999999999
      or p_servings <> trunc(p_servings)
      or p_servings::text in ('NaN', 'Infinity', '-Infinity')
      or length(coalesce(p_note, '')) > 500 then
    raise exception 'Invalid supply, menu, servings, or note' using errcode = '22023';
  end if;

  select * into v_supply from public.supplies
    where id = p_supply_id and owner_id = v_owner for update;
  if not found then
    raise exception 'Supply not found' using errcode = 'P0002';
  end if;
  select l.quantity_per_serving, l.quantity_tolerance into v_dose, v_tolerance
    from public.supply_menu_links l
    where l.supply_id = v_supply.id and l.product_id = p_product_id and l.owner_id = v_owner
    for update;
  if not found then
    raise exception 'Menu is not linked to this supply' using errcode = 'P0002';
  end if;
  select p.name into v_product_name from public.products p
    where p.id = p_product_id and p.owner_id = v_owner for share;
  if not found then
    raise exception 'Menu product not found for this owner' using errcode = 'P0002';
  end if;

  v_before := v_supply.stock;
  v_debit := v_dose * p_servings;
  v_after := v_before - v_debit;
  if v_after < 0 then
    raise exception 'Insufficient supply stock' using errcode = '23514';
  end if;

  perform set_config('app.supply_stock_rpc', '1', true);
  update public.supplies set stock = v_after, updated_at = now()
    where id = v_supply.id returning * into v_supply;
  perform set_config('app.supply_stock_rpc', '0', true);
  insert into public.supply_stock_logs
    (supply_id, owner_id, actor_id, supply_name, unit, action, input_amount,
     change_amount, stock_before, stock_after, note, product_id, product_name,
     quantity_per_serving, quantity_tolerance)
  values
    (v_supply.id, v_owner, v_actor, v_supply.name, v_supply.unit, 'consume', p_servings,
     -v_debit, v_before, v_after, coalesce(p_note, ''), p_product_id, v_product_name,
     v_dose, v_tolerance);
  return v_supply;
end;
$function$;

revoke all on function public.save_supply_with_menus(jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.consume_supply_menu(text, text, numeric, text) from public, anon, authenticated;
grant execute on function public.save_supply_with_menus(jsonb, jsonb) to authenticated;
grant execute on function public.consume_supply_menu(text, text, numeric, text) to authenticated;

notify pgrst, 'reload schema';
commit;
