-- Save a menu product and exactly its ingredient recipe in one transaction.
-- Existing balances, usage logs, and every other product's recipe are untouched.
begin;

create or replace function public.save_product_with_supplies(
  p_data jsonb,
  p_supplies jsonb default null
)
returns public.products
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_claims jsonb := auth.jwt();
  v_owner text := auth.jwt() ->> 'owner_id';
  v_actor text := auth.jwt() ->> 'sub';
  v_id text;
  v_product public.products%rowtype;
  v_existing boolean := false;
  v_name text;
  v_category text;
  v_sell_price numeric;
  v_cost_price numeric;
  v_modifiers jsonb;
  v_active boolean;
  v_entry jsonb;
  v_supply_id text;
  v_dose numeric;
  v_tolerance numeric;
  v_seen text[] := array[]::text[];
begin
  if coalesce(v_claims ->> 'role', '') <> 'authenticated'
      or coalesce(v_claims ->> 'user_role', '') <> 'admin'
      or nullif(v_owner, '') is null or nullif(v_actor, '') is null
      or not exists (
        select 1 from public.users u
        where u.id = v_actor and u.role = 'admin' and u.is_active = true
          and coalesce(u.owner_id, u.id) = v_owner
      ) then
    raise exception 'Only an active inventory admin can save menu products' using errcode = '42501';
  end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object'
      or (p_supplies is not null and jsonb_typeof(p_supplies) <> 'array') then
    raise exception 'Product data must be an object and supplies must be an array or null' using errcode = '22023';
  end if;
  v_id := nullif(btrim(p_data ->> 'id'), '');
  if v_id is null or length(v_id) > 200 then
    raise exception 'A stable product ID is required' using errcode = '22023';
  end if;
  if p_data ? 'owner_id' and p_data ->> 'owner_id' is distinct from v_owner then
    raise exception 'Product owner does not match the signed account' using errcode = '42501';
  end if;
  if p_supplies is not null and jsonb_array_length(p_supplies) > 100 then
    raise exception 'A product can use at most 100 supplies' using errcode = '22023';
  end if;

  -- All writers and sale consumers lock supplies before recipes/products.
  -- Locking the small owner catalog also serializes concurrent recipe changes.
  perform 1 from public.supplies s
    where s.owner_id = v_owner order by s.id for update;

  if p_supplies is not null then
    for v_entry in select value from jsonb_array_elements(p_supplies) loop
      if jsonb_typeof(v_entry) <> 'object' then
        raise exception 'Each ingredient must be an object' using errcode = '22023';
      end if;
      v_supply_id := nullif(btrim(v_entry ->> 'supply_id'), '');
      v_dose := (v_entry ->> 'quantity_per_serving')::numeric;
      v_tolerance := coalesce((v_entry ->> 'quantity_tolerance')::numeric, 0);
      if v_supply_id is null or v_dose is null or v_dose <= 0
          or v_dose > 999999999999.999999 or v_dose <> round(v_dose, 6)
          or v_dose::text in ('NaN', 'Infinity', '-Infinity')
          or v_tolerance < 0 or v_tolerance >= v_dose
          or v_tolerance > 999999999999.999999
          or v_tolerance <> round(v_tolerance, 6)
          or v_tolerance::text in ('NaN', 'Infinity', '-Infinity') then
        raise exception 'Ingredient dose or variation is invalid' using errcode = '22023';
      end if;
      if v_supply_id = any(v_seen) then
        raise exception 'The same ingredient appears twice' using errcode = '23505';
      end if;
      if not exists (select 1 from public.supplies s
                     where s.id = v_supply_id and s.owner_id = v_owner) then
        raise exception 'Ingredient does not belong to this account' using errcode = '23503';
      end if;
      v_seen := array_append(v_seen, v_supply_id);
    end loop;
  end if;

  -- The advisory lock serializes first creation of the same client-generated ID.
  perform pg_advisory_xact_lock(hashtextextended('product:' || v_id, 0));
  select * into v_product from public.products p where p.id = v_id for update;
  v_existing := found;
  if v_existing and v_product.owner_id is distinct from v_owner then
    raise exception 'Product does not belong to this account' using errcode = '42501';
  end if;

  -- Linking an existing product with {id} must not parse or rewrite legacy
  -- metadata, including old modifier formats that this RPC would not create.
  if not v_existing or p_data ? 'name' or p_data ? 'category'
      or p_data ? 'sell_price' or p_data ? 'cost_price'
      or p_data ? 'modifiers' or p_data ? 'is_active' then
  v_name := case when p_data ? 'name' then btrim(p_data ->> 'name')
    else v_product.name end;
  v_category := case when p_data ? 'category'
    then nullif(btrim(p_data ->> 'category'), '') else v_product.category end;
  v_sell_price := case when p_data ? 'sell_price'
    then (p_data ->> 'sell_price')::numeric
    else coalesce(v_product.sell_price, 0) end;
  v_cost_price := case when p_data ? 'cost_price'
    then (p_data ->> 'cost_price')::numeric
    else coalesce(v_product.cost_price, 0) end;
  v_modifiers := case when p_data ? 'modifiers' then
    case when jsonb_typeof(p_data -> 'modifiers') = 'string'
      then (p_data ->> 'modifiers')::jsonb else p_data -> 'modifiers' end
    else coalesce(v_product.modifiers, '[]')::jsonb end;
  v_active := case when p_data ? 'is_active'
    then (p_data ->> 'is_active')::boolean else coalesce(v_product.is_active, true) end;

  if v_name is null or length(v_name) < 1 or length(v_name) > 200
      or (v_category is not null and length(v_category) > 200)
      or v_sell_price is null or v_sell_price < 0 or v_sell_price > 999999999999.999999
      or v_sell_price <> round(v_sell_price, 6)
      or v_sell_price::text in ('NaN', 'Infinity', '-Infinity')
      or v_cost_price is null or v_cost_price < 0 or v_cost_price > 999999999999.999999
      or v_cost_price <> round(v_cost_price, 6)
      or v_cost_price::text in ('NaN', 'Infinity', '-Infinity')
      or v_active is null or v_modifiers is null or jsonb_typeof(v_modifiers) <> 'array'
      or jsonb_array_length(v_modifiers) > 100 then
    raise exception 'Invalid product name, price, status, or modifiers' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(v_modifiers) m(value)
    where jsonb_typeof(m.value) <> 'object'
       or nullif(btrim(m.value ->> 'name'), '') is null
       or length(m.value ->> 'name') > 120
       or coalesce(m.value ->> 'price', '') !~ '^([0-9]+)(\.[0-9]{1,6})?$'
       or coalesce(m.value ->> 'cost', '') !~ '^([0-9]+)(\.[0-9]{1,6})?$'
       or (m.value ->> 'price')::numeric > 999999999999.999999
       or (m.value ->> 'cost')::numeric > 999999999999.999999
  ) then
    raise exception 'Invalid product modifier' using errcode = '22023';
  end if;

  if v_existing and (p_data ? 'name' or p_data ? 'category'
      or p_data ? 'sell_price' or p_data ? 'cost_price'
      or p_data ? 'modifiers' or p_data ? 'is_active') then
    update public.products set name = v_name, category = v_category,
      sell_price = v_sell_price, cost_price = v_cost_price,
      modifiers = v_modifiers::text, is_active = v_active, updated_at = now()
      where id = v_id and owner_id = v_owner returning * into v_product;
  elsif not v_existing then
    insert into public.products
      (id, owner_id, name, category, sell_price, cost_price, modifiers, is_active)
    values
      (v_id, v_owner, v_name, v_category, v_sell_price, v_cost_price,
       v_modifiers::text, v_active)
    returning * into v_product;
  end if;
  end if;

  if p_supplies is not null then
    delete from public.supply_menu_links l
      where l.product_id = v_id and l.owner_id = v_owner;
    for v_entry in select value from jsonb_array_elements(p_supplies) loop
      insert into public.supply_menu_links
        (supply_id, product_id, owner_id, quantity_per_serving, quantity_tolerance)
      values
        (btrim(v_entry ->> 'supply_id'), v_id, v_owner,
         (v_entry ->> 'quantity_per_serving')::numeric,
         coalesce((v_entry ->> 'quantity_tolerance')::numeric, 0));
    end loop;
  end if;
  return v_product;
end;
$function$;

revoke all on function public.save_product_with_supplies(jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.save_product_with_supplies(jsonb, jsonb)
  to authenticated;
notify pgrst, 'reload schema';
commit;
