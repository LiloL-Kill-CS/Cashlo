-- Run once in the Supabase SQL editor or through a reviewed migration.
-- Inventory quantities are stored in the item's base unit (ml, gram, pcs, etc.).
-- Existing supply rows start at zero stock; this does not infer purchases.

begin;

alter table public.supplies
  add column if not exists pack_size numeric(18, 6) not null default 1,
  add column if not exists servings_per_pack integer,
  add column if not exists stock numeric(18, 6) not null default 0,
  add column if not exists min_stock_level numeric(18, 6) not null default 0,
  add column if not exists usage_label text;

do $constraints$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.supplies'::regclass and conname = 'supplies_pack_size_positive') then
    alter table public.supplies add constraint supplies_pack_size_positive check (pack_size > 0);
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.supplies'::regclass and conname = 'supplies_servings_positive') then
    alter table public.supplies add constraint supplies_servings_positive check (servings_per_pack is null or servings_per_pack > 0);
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.supplies'::regclass and conname = 'supplies_stock_nonnegative') then
    alter table public.supplies add constraint supplies_stock_nonnegative check (stock >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.supplies'::regclass and conname = 'supplies_min_stock_nonnegative') then
    alter table public.supplies add constraint supplies_min_stock_nonnegative check (min_stock_level >= 0);
  end if;
end;
$constraints$;

-- The catalog is visible to the business owner; only admins may change it.
-- Replace the older owner_rw FOR ALL policy, which also let cashier tokens edit.
alter table public.supplies enable row level security;
drop policy if exists owner_rw on public.supplies;
drop policy if exists supply_owner_read on public.supplies;
drop policy if exists supply_owner_insert on public.supplies;
drop policy if exists supply_owner_update on public.supplies;
drop policy if exists supply_owner_delete on public.supplies;
create policy supply_owner_read on public.supplies for select to authenticated
  using (owner_id = (auth.jwt() ->> 'owner_id'));
create policy supply_owner_insert on public.supplies for insert to authenticated
  with check (owner_id = (auth.jwt() ->> 'owner_id') and (auth.jwt() ->> 'user_role') = 'admin');
create policy supply_owner_update on public.supplies for update to authenticated
  using (owner_id = (auth.jwt() ->> 'owner_id') and (auth.jwt() ->> 'user_role') = 'admin')
  with check (owner_id = (auth.jwt() ->> 'owner_id') and (auth.jwt() ->> 'user_role') = 'admin');
create policy supply_owner_delete on public.supplies for delete to authenticated
  using (owner_id = (auth.jwt() ->> 'owner_id') and (auth.jwt() ->> 'user_role') = 'admin');

create table if not exists public.supply_stock_logs (
  id uuid primary key default gen_random_uuid(),
  supply_id text not null references public.supplies(id) on delete restrict,
  owner_id text not null,
  actor_id text not null,
  supply_name text not null,
  unit text not null,
  action text not null check (action in ('initial', 'restock', 'consume', 'consume_quantity', 'adjust')),
  input_amount numeric(18, 6) not null check (input_amount >= 0),
  change_amount numeric(18, 6) not null,
  stock_before numeric(18, 6) not null check (stock_before >= 0),
  stock_after numeric(18, 6) not null check (stock_after >= 0),
  note text not null default '',
  created_at timestamptz not null default now(),
  constraint supply_stock_logs_balance check (stock_after = stock_before + change_amount)
);

create index if not exists supply_stock_logs_owner_created_idx
  on public.supply_stock_logs (owner_id, created_at desc);
create index if not exists supply_stock_logs_supply_created_idx
  on public.supply_stock_logs (supply_id, created_at desc);

alter table public.supply_stock_logs enable row level security;
drop policy if exists supply_stock_logs_owner_read on public.supply_stock_logs;
create policy supply_stock_logs_owner_read on public.supply_stock_logs
  for select to authenticated
  using (owner_id = (auth.jwt() ->> 'owner_id'));

revoke all on public.supply_stock_logs from public, anon, authenticated;
grant select on public.supply_stock_logs to authenticated;

-- Stock may only change inside the SECURITY DEFINER functions below. The
-- ledger is therefore the record of every stock change, and existing stock
-- cannot silently change meaning from ml to pcs through a metadata edit.
create or replace function public.guard_supply_stock_write()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if tg_op = 'INSERT' then
    if new.stock <> 0 and (current_setting('app.supply_stock_rpc', true) is distinct from '1'
        or current_user in ('authenticated', 'anon')) then
      raise exception 'Set opening stock with create_supply' using errcode = '22023';
    end if;
  else
    if new.unit is distinct from old.unit and old.stock <> 0 then
      raise exception 'Empty the stock before changing its unit' using errcode = '22023';
    end if;
    if new.stock is distinct from old.stock
        and (current_setting('app.supply_stock_rpc', true) is distinct from '1'
             or current_user in ('authenticated', 'anon')) then
      raise exception 'Change stock with adjust_supply_stock' using errcode = '22023';
    end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists guard_supply_stock_write on public.supplies;
create trigger guard_supply_stock_write
  before insert or update on public.supplies
  for each row execute function public.guard_supply_stock_write();

create or replace function public.create_supply(p_data jsonb)
returns public.supplies
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_owner text := auth.jwt() ->> 'owner_id';
  v_actor text := auth.jwt() ->> 'sub';
  v_name text;
  v_unit text;
  v_usage_label text;
  v_pack_size numeric;
  v_servings integer;
  v_min_stock numeric;
  v_price numeric;
  v_packs numeric;
  v_stock numeric;
  v_supply public.supplies%rowtype;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'authenticated'
      or coalesce(auth.jwt() ->> 'user_role', '') <> 'admin'
      or nullif(v_owner, '') is null or nullif(v_actor, '') is null then
    raise exception 'Only an authenticated inventory admin can add supplies' using errcode = '42501';
  end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then
    raise exception 'Supply data must be an object' using errcode = '22023';
  end if;

  v_name := btrim(p_data ->> 'name');
  v_unit := btrim(coalesce(nullif(p_data ->> 'unit', ''), 'pcs'));
  v_usage_label := nullif(btrim(coalesce(p_data ->> 'usage_label', '')), '');
  v_pack_size := coalesce((p_data ->> 'pack_size')::numeric, 1);
  v_servings := nullif(p_data ->> 'servings_per_pack', '')::integer;
  v_min_stock := coalesce((p_data ->> 'min_stock_level')::numeric, 0);
  v_price := coalesce((p_data ->> 'default_price')::numeric, 0);
  v_packs := coalesce((p_data ->> 'initial_packs')::numeric, 0);

  if v_name is null or length(v_name) < 1 or length(v_name) > 120
      or length(v_unit) < 1 or length(v_unit) > 24
      or (v_usage_label is not null and length(v_usage_label) > 120) then
    raise exception 'Name, unit, or usage label is invalid' using errcode = '22023';
  end if;
  if v_pack_size <= 0 or v_pack_size > 999999999999.999999 or v_pack_size <> round(v_pack_size, 6)
      or v_min_stock < 0 or v_min_stock > 999999999999.999999 or v_min_stock <> round(v_min_stock, 6)
      or v_price < 0 or v_price > 999999999999.999999 or v_price <> round(v_price, 6)
      or v_packs < 0 or v_packs > 999999999999 or v_packs <> trunc(v_packs)
      or (v_servings is not null and (v_servings <= 0 or v_pack_size / v_servings < 0.000001)) then
    raise exception 'Supply quantities must be nonnegative with at most 6 decimal places; packs and servings must be whole' using errcode = '22023';
  end if;
  v_stock := v_pack_size * v_packs;
  if v_stock > 999999999999.999999 then
    raise exception 'Initial stock exceeds the supported range' using errcode = '22023';
  end if;

  -- Serialize same-owner/same-name creation without imposing a new constraint
  -- on possible duplicate legacy rows. Existing catalog rows remain reusable.
  perform pg_advisory_xact_lock(hashtextextended(v_owner || ':' || lower(v_name), 0));
  if exists (select 1 from public.supplies s
             where s.owner_id = v_owner and lower(btrim(s.name)) = lower(v_name)) then
    raise exception 'Supply already exists; restock the saved item' using errcode = '23505';
  end if;

  perform set_config('app.supply_stock_rpc', '1', true);
  insert into public.supplies
    (owner_id, name, unit, default_price, pack_size, servings_per_pack,
     stock, min_stock_level, usage_label)
  values
    (v_owner, v_name, v_unit, v_price, v_pack_size, v_servings,
     v_stock, v_min_stock, v_usage_label)
  returning * into v_supply;
  perform set_config('app.supply_stock_rpc', '0', true);

  if v_stock > 0 then
    insert into public.supply_stock_logs
      (supply_id, owner_id, actor_id, supply_name, unit, action, input_amount,
       change_amount, stock_before, stock_after, note)
    values
      (v_supply.id, v_owner, v_actor, v_supply.name, v_supply.unit, 'initial', v_packs,
       v_stock, 0, v_stock, 'Initial stock');
  end if;
  return v_supply;
end;
$function$;

create or replace function public.adjust_supply_stock(
  p_supply_id text,
  p_action text,
  p_amount numeric,
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
  v_change numeric;
  v_after numeric;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'authenticated'
      or coalesce(auth.jwt() ->> 'user_role', '') <> 'admin'
      or nullif(v_owner, '') is null or nullif(v_actor, '') is null then
    raise exception 'Only an authenticated inventory admin can change stock' using errcode = '42501';
  end if;
  if p_action is null or p_amount is null or p_amount < 0 or p_amount > 999999999999.999999
      or p_amount <> round(p_amount, 6) or p_amount::text in ('NaN', 'Infinity', '-Infinity')
      or p_action not in ('restock', 'consume', 'consume_quantity', 'adjust') then
    raise exception 'Invalid stock action or amount' using errcode = '22023';
  end if;
  if p_action <> 'adjust' and p_amount = 0 then
    raise exception 'Amount must be positive' using errcode = '22023';
  end if;
  if p_action in ('restock', 'consume') and p_amount <> trunc(p_amount) then
    raise exception 'Packs and servings must be whole numbers' using errcode = '22023';
  end if;
  if length(coalesce(p_note, '')) > 500 then
    raise exception 'Note is too long' using errcode = '22023';
  end if;

  select * into v_supply from public.supplies
    where id = p_supply_id and owner_id = v_owner
    for update;
  if not found then
    raise exception 'Supply not found' using errcode = 'P0002';
  end if;

  case p_action
    when 'restock' then v_change := p_amount * v_supply.pack_size;
    when 'consume' then
      if v_supply.servings_per_pack is null
          or v_supply.pack_size / v_supply.servings_per_pack < 0.000001 then
        raise exception 'Configure a valid serving yield first' using errcode = '22023';
      end if;
      v_change := -round(p_amount * v_supply.pack_size / v_supply.servings_per_pack, 6);
    when 'consume_quantity' then v_change := -p_amount;
    when 'adjust' then v_change := p_amount - v_supply.stock;
  end case;
  v_after := v_supply.stock + v_change;
  if v_after < 0 then
    raise exception 'Insufficient supply stock' using errcode = '23514';
  end if;
  if v_after > 999999999999.999999 then
    raise exception 'Stock exceeds the supported range' using errcode = '22003';
  end if;

  if v_change = 0 then
    return v_supply;
  end if;
  perform set_config('app.supply_stock_rpc', '1', true);
  update public.supplies set stock = v_after, updated_at = now()
    where id = v_supply.id
    returning * into v_supply;
  perform set_config('app.supply_stock_rpc', '0', true);
  insert into public.supply_stock_logs
    (supply_id, owner_id, actor_id, supply_name, unit, action, input_amount,
     change_amount, stock_before, stock_after, note)
  values
    (v_supply.id, v_owner, v_actor, v_supply.name, v_supply.unit, p_action, p_amount,
     v_change, v_supply.stock - v_change, v_supply.stock, coalesce(p_note, ''));
  return v_supply;
end;
$function$;

revoke all on function public.create_supply(jsonb) from public, anon, authenticated;
revoke all on function public.adjust_supply_stock(text, text, numeric, text) from public, anon, authenticated;
grant execute on function public.create_supply(jsonb) to authenticated;
grant execute on function public.adjust_supply_stock(text, text, numeric, text) to authenticated;

-- Make the new RPC signatures available through the REST API immediately.
notify pgrst, 'reload schema';

commit;
