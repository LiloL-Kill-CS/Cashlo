-- Opt-in, atomic ingredient consumption for newly completed POS sales.
-- Requires inventory-supplies.sql and inventory-supply-menus.sql.
-- Existing transactions remain unmarked and unchanged.

begin;

alter table public.transactions
  add column if not exists inventory_source text;

alter table public.supply_stock_logs
  add column if not exists transaction_id text;

-- One ledger row per sale, supply, and menu. Cart lines with different
-- modifiers are combined before consumption. The receipt reference remains
-- readable after a transaction is voided or deleted.
create unique index if not exists supply_stock_logs_pos_once_idx
  on public.supply_stock_logs (transaction_id, supply_id, product_id)
  where transaction_id is not null;

create or replace function public.consume_pos_supply_stock()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_jwt_owner text := auth.jwt() ->> 'owner_id';
  v_jwt_actor text := auth.jwt() ->> 'sub';
  v_jwt_role text := auth.jwt() ->> 'user_role';
  v_user_owner text;
  v_user_role text;
  v_user_active boolean;
  v_items jsonb;
  v_item jsonb;
  v_product_id text;
  v_qty numeric;
  v_total numeric;
  v_cart jsonb := '{}'::jsonb;
  v_names jsonb := '{}'::jsonb;
  v_expected_products integer;
  v_found_products integer := 0;
  v_locked_supplies text[] := array[]::text[];
  v_supply public.supplies%rowtype;
  v_link public.supply_menu_links%rowtype;
  v_product record;
  v_running numeric;
  v_before numeric;
  v_debit numeric;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'authenticated'
      or coalesce(v_jwt_role, '') not in ('admin', 'kasir')
      or nullif(v_jwt_owner, '') is null or nullif(v_jwt_actor, '') is null
      or new.owner_id is distinct from v_jwt_owner
      or new.user_id is distinct from v_jwt_actor then
    raise exception 'Identitas kasir tidak cocok dengan transaksi' using errcode = '42501';
  end if;

  select coalesce(u.owner_id, u.id), u.role, u.is_active
    into v_user_owner, v_user_role, v_user_active
  from public.users u where u.id = new.user_id;
  if not found or v_user_active is not true
      or v_user_owner is distinct from new.owner_id
      or v_user_role is distinct from v_jwt_role
      or v_user_role not in ('admin', 'kasir') then
    raise exception 'Akun kasir tidak aktif atau tidak memiliki bisnis ini' using errcode = '42501';
  end if;

  begin
    v_items := new.items::jsonb;
  exception when invalid_text_representation then
    raise exception 'Keranjang penjualan tidak berisi JSON yang valid' using errcode = '22023';
  end;
  if v_items is null or jsonb_typeof(v_items) <> 'array'
      or jsonb_array_length(v_items) < 1 or jsonb_array_length(v_items) > 1000 then
    raise exception 'Keranjang penjualan harus berisi 1 sampai 1000 item' using errcode = '22023';
  end if;

  -- Validate every line, then aggregate equal products. This preserves
  -- modifier-specific cart lines while consuming each linked dose only once.
  for v_item in select value from jsonb_array_elements(v_items) loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'Item keranjang tidak valid' using errcode = '22023';
    end if;
    v_product_id := nullif(btrim(v_item ->> 'product_id'), '');
    begin
      v_qty := (v_item ->> 'qty')::numeric;
    exception when invalid_text_representation then
      raise exception 'Jumlah item keranjang harus angka bulat positif' using errcode = '22023';
    end;
    if v_product_id is null or v_qty is null or v_qty <= 0
        or v_qty > 999999999999 or v_qty <> trunc(v_qty)
        or v_qty::text in ('NaN', 'Infinity', '-Infinity') then
      raise exception 'Item menu dan jumlahnya harus valid' using errcode = '22023';
    end if;
    v_total := coalesce((v_cart ->> v_product_id)::numeric, 0) + v_qty;
    if v_total > 999999999999 then
      raise exception 'Jumlah menu dalam satu transaksi terlalu besar' using errcode = '22023';
    end if;
    v_cart := jsonb_set(v_cart, array[v_product_id], to_jsonb(v_total), true);
  end loop;

  -- Lock every affected supply before any link or product lock. Sorting makes
  -- concurrent sales of several shared ingredients take locks in one order.
  for v_supply in
    select s.* from public.supplies s
    where s.owner_id = new.owner_id and exists (
      select 1 from public.supply_menu_links l
      where l.supply_id = s.id and l.owner_id = new.owner_id
        and l.product_id in (
          select cart_product.product_id
          from jsonb_object_keys(v_cart) as cart_product(product_id))
    )
    order by s.id for update of s
  loop
    v_locked_supplies := array_append(v_locked_supplies, v_supply.id);
  end loop;

  perform 1 from public.supply_menu_links l
    where l.owner_id = new.owner_id
      and l.supply_id = any(v_locked_supplies)
      and l.product_id in (
        select cart_product.product_id
        from jsonb_object_keys(v_cart) as cart_product(product_id))
    order by l.supply_id, l.product_id for update;

  select count(*) into v_expected_products from jsonb_object_keys(v_cart);
  for v_product in
    select p.id, p.name from public.products p
    where p.owner_id = new.owner_id
      and p.id in (
        select cart_product.product_id
        from jsonb_object_keys(v_cart) as cart_product(product_id))
    order by p.id for share of p
  loop
    v_found_products := v_found_products + 1;
    v_names := jsonb_set(v_names, array[v_product.id], to_jsonb(v_product.name), true);
  end loop;
  if v_found_products <> v_expected_products then
    raise exception 'Ada menu yang tidak ditemukan dalam bisnis ini' using errcode = '23503';
  end if;

  for v_supply in
    select s.* from public.supplies s
    where s.id = any(v_locked_supplies) order by s.id
  loop
    v_running := v_supply.stock;
    for v_link in
      select l.* from public.supply_menu_links l
      where l.supply_id = v_supply.id and l.owner_id = new.owner_id
        and l.product_id in (
          select cart_product.product_id
          from jsonb_object_keys(v_cart) as cart_product(product_id))
      order by l.product_id
    loop
      v_qty := (v_cart ->> v_link.product_id)::numeric;
      v_debit := v_qty * v_link.quantity_per_serving;
      if v_debit > v_running then
        raise exception 'Stok % tidak cukup untuk penjualan ini. Sisa % %; perlu % % untuk % porsi %.',
          v_supply.name, v_running, v_supply.unit, v_debit, v_supply.unit,
          v_qty, v_names ->> v_link.product_id
          using errcode = '23514';
      end if;
      v_before := v_running;
      v_running := v_running - v_debit;
      insert into public.supply_stock_logs
        (supply_id, owner_id, actor_id, supply_name, unit, action, input_amount,
         change_amount, stock_before, stock_after, note, product_id, product_name,
         quantity_per_serving, quantity_tolerance, transaction_id)
      values
        (v_supply.id, new.owner_id, new.user_id, v_supply.name, v_supply.unit,
         'consume', v_qty, -v_debit, v_before, v_running,
         'Penjualan kasir: ' || new.id, v_link.product_id,
         v_names ->> v_link.product_id, v_link.quantity_per_serving,
         v_link.quantity_tolerance, new.id);
    end loop;
    if v_running is distinct from v_supply.stock then
      perform set_config('app.supply_stock_rpc', '1', true);
      update public.supplies set stock = v_running, updated_at = now()
        where id = v_supply.id;
      perform set_config('app.supply_stock_rpc', '0', true);
    end if;
  end loop;

  return new;
end;
$function$;

drop trigger if exists consume_pos_supply_stock on public.transactions;
create trigger consume_pos_supply_stock
  after insert on public.transactions
  for each row
  when (new.inventory_source = 'pos' and new.status = 'completed')
  execute function public.consume_pos_supply_stock();

revoke all on function public.consume_pos_supply_stock() from public, anon, authenticated;
notify pgrst, 'reload schema';
commit;
