-- Opt-in stock consumption for newly inserted completed manual receipts.
-- Historic receipts keep their NULL inventory_source and are never replayed.
-- Requires the supply, menu, POS consumption, and reversal migrations.

begin;

alter table public.supply_stock_logs
  add column if not exists source_item_key text;

-- A source key survives product deletion, unlike product_id (ON DELETE SET
-- NULL). It also distinguishes a direct supply package from a menu dose when
-- both draw from the same supply in one receipt.
create unique index if not exists supply_stock_logs_manual_once_idx
  on public.supply_stock_logs (transaction_id, supply_id, source_item_key)
  where transaction_id is not null and action = 'consume'
    and source_item_key is not null;

create or replace function public.consume_manual_supply_stock()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_owner text := auth.jwt() ->> 'owner_id';
  v_actor text := auth.jwt() ->> 'sub';
  v_user_owner text;
  v_user_role text;
  v_user_active boolean;
  v_items jsonb;
  v_item jsonb;
  v_item_id text;
  v_is_supply boolean;
  v_qty numeric;
  v_total numeric;
  v_menu_cart jsonb := '{}'::jsonb;
  v_supply_cart jsonb := '{}'::jsonb;
  v_names jsonb := '{}'::jsonb;
  v_expected_menus integer;
  v_found_menus integer := 0;
  v_expected_direct integer;
  v_found_direct integer := 0;
  v_locked_supplies text[] := array[]::text[];
  v_supply public.supplies%rowtype;
  v_link public.supply_menu_links%rowtype;
  v_product record;
  v_ledger_note text;
  v_running numeric;
  v_before numeric;
  v_debit numeric;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'authenticated'
      or coalesce(auth.jwt() ->> 'user_role', '') <> 'admin'
      or nullif(v_owner, '') is null or nullif(v_actor, '') is null
      or new.owner_id is distinct from v_owner
      or new.user_id is distinct from v_actor then
    raise exception 'Hanya admin bisnis yang dapat mencatat transaksi lama dengan stok'
      using errcode = '42501';
  end if;

  select coalesce(u.owner_id, u.id), u.role, u.is_active
    into v_user_owner, v_user_role, v_user_active
  from public.users u where u.id = v_actor;
  if not found or v_user_active is not true
      or v_user_owner is distinct from new.owner_id
      or v_user_role is distinct from 'admin' then
    raise exception 'Akun admin tidak aktif atau tidak memiliki bisnis ini'
      using errcode = '42501';
  end if;

  begin
    v_items := new.items::jsonb;
  exception when invalid_text_representation then
    raise exception 'Keranjang transaksi lama bukan JSON yang valid'
      using errcode = '22023';
  end;
  if v_items is null or jsonb_typeof(v_items) <> 'array' then
    raise exception 'Keranjang transaksi lama harus berupa daftar item'
      using errcode = '22023';
  end if;
  if jsonb_array_length(v_items) < 1 or jsonb_array_length(v_items) > 1000 then
    raise exception 'Keranjang transaksi lama harus berisi 1 sampai 1000 item'
      using errcode = '22023';
  end if;
  v_ledger_note := 'Input transaksi lama: ' || new.id ||
    ' (tanggal ' || coalesce(new.datetime::text, 'tidak tersedia') || ')';
  if nullif(btrim(v_items -> 0 ->> 'transaction_note'), '') is not null then
    v_ledger_note := v_ledger_note || '; Catatan: ' ||
      left(btrim(v_items -> 0 ->> 'transaction_note'), 300);
  end if;
  v_ledger_note := left(v_ledger_note, 500);

  -- Type is part of the cart identity. A product and a supply may happen to
  -- have the same text ID; their quantities must never be merged.
  for v_item in select value from jsonb_array_elements(v_items) loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'Item transaksi lama tidak valid' using errcode = '22023';
    end if;
    if v_item ? 'is_supply' and jsonb_typeof(v_item -> 'is_supply') <> 'boolean' then
      raise exception 'Penanda bahan harus bernilai benar atau salah'
        using errcode = '22023';
    end if;
    v_is_supply := coalesce((v_item ->> 'is_supply')::boolean, false);
    v_item_id := nullif(btrim(v_item ->> 'product_id'), '');
    begin
      v_qty := (v_item ->> 'qty')::numeric;
    exception when invalid_text_representation or numeric_value_out_of_range then
      raise exception 'Jumlah item harus angka bulat positif'
        using errcode = '22023';
    end;
    if v_item_id is null or v_qty is null or v_qty <= 0
        or v_qty > 999999999999 or v_qty <> trunc(v_qty)
        or v_qty::text in ('NaN', 'Infinity', '-Infinity') then
      raise exception 'Item dan jumlah transaksi lama harus valid'
        using errcode = '22023';
    end if;
    if v_is_supply then
      v_total := coalesce((v_supply_cart ->> v_item_id)::numeric, 0) + v_qty;
      if v_total > 999999999999 then
        raise exception 'Jumlah paket bahan dalam satu transaksi terlalu besar'
          using errcode = '22023';
      end if;
      v_supply_cart := jsonb_set(v_supply_cart, array[v_item_id], to_jsonb(v_total), true);
    else
      v_total := coalesce((v_menu_cart ->> v_item_id)::numeric, 0) + v_qty;
      if v_total > 999999999999 then
        raise exception 'Jumlah menu dalam satu transaksi terlalu besar'
          using errcode = '22023';
      end if;
      v_menu_cart := jsonb_set(v_menu_cart, array[v_item_id], to_jsonb(v_total), true);
    end if;
  end loop;

  select count(*) into v_expected_direct from jsonb_object_keys(v_supply_cart);

  -- Lock the union of directly selected supplies and menu-linked supplies in
  -- one sorted pass. All writers lock supplies before links/products.
  for v_supply in
    select s.* from public.supplies s
    where s.owner_id = new.owner_id
      and (v_supply_cart ? s.id or exists (
        select 1 from public.supply_menu_links l
        where l.supply_id = s.id and l.owner_id = new.owner_id
          and l.product_id in (
            select cart_id.id from jsonb_object_keys(v_menu_cart) as cart_id(id))
      ))
    order by s.id for update of s
  loop
    v_locked_supplies := array_append(v_locked_supplies, v_supply.id);
    if v_supply_cart ? v_supply.id then
      v_found_direct := v_found_direct + 1;
    end if;
  end loop;
  if v_found_direct <> v_expected_direct then
    raise exception 'Ada bahan yang tidak ditemukan dalam bisnis ini'
      using errcode = '23503';
  end if;

  perform 1 from public.supply_menu_links l
    where l.owner_id = new.owner_id
      and l.supply_id = any(v_locked_supplies)
      and l.product_id in (
        select cart_id.id from jsonb_object_keys(v_menu_cart) as cart_id(id))
    order by l.supply_id, l.product_id for update;

  select count(*) into v_expected_menus from jsonb_object_keys(v_menu_cart);
  for v_product in
    select p.id, p.name from public.products p
    where p.owner_id = new.owner_id
      and p.id in (
        select cart_id.id from jsonb_object_keys(v_menu_cart) as cart_id(id))
    order by p.id for update of p
  loop
    v_found_menus := v_found_menus + 1;
    v_names := jsonb_set(v_names, array[v_product.id], to_jsonb(v_product.name), true);
  end loop;
  if v_found_menus <> v_expected_menus then
    raise exception 'Ada menu yang tidak ditemukan dalam bisnis ini'
      using errcode = '23503';
  end if;

  -- Recipe saves also lock products before writing new links. After these
  -- product locks, recheck for a link added while we waited for supplies;
  -- otherwise that new ingredient could be silently omitted.
  if exists (
    select 1 from public.supply_menu_links l
    where l.owner_id = new.owner_id
      and l.product_id in (
        select cart_id.id from jsonb_object_keys(v_menu_cart) as cart_id(id))
      and not (l.supply_id = any(v_locked_supplies))
  ) then
    raise exception 'Resep menu berubah saat transaksi disimpan; coba lagi'
      using errcode = '40001';
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
          select cart_id.id from jsonb_object_keys(v_menu_cart) as cart_id(id))
      order by l.product_id
    loop
      v_qty := (v_menu_cart ->> v_link.product_id)::numeric;
      v_debit := v_qty * v_link.quantity_per_serving;
      if v_debit > 999999999999.999999 then
        raise exception 'Penggunaan % melewati batas stok yang didukung', v_supply.name
          using errcode = '22003';
      end if;
      if v_debit > v_running then
        raise exception 'Stok % tidak cukup. Sisa % %; perlu % % untuk % porsi %.',
          v_supply.name, v_running, v_supply.unit, v_debit, v_supply.unit,
          v_qty, v_names ->> v_link.product_id
          using errcode = '23514';
      end if;
      v_before := v_running;
      v_running := v_running - v_debit;
      insert into public.supply_stock_logs
        (supply_id, owner_id, actor_id, supply_name, unit, action, input_amount,
         change_amount, stock_before, stock_after, note, product_id, product_name,
         quantity_per_serving, quantity_tolerance, transaction_id, source_item_key)
      values
        (v_supply.id, new.owner_id, new.user_id, v_supply.name, v_supply.unit,
         'consume', v_qty, -v_debit, v_before, v_running,
         v_ledger_note, v_link.product_id,
         v_names ->> v_link.product_id, v_link.quantity_per_serving,
         v_link.quantity_tolerance, new.id, 'menu:' || v_link.product_id);
    end loop;

    if v_supply_cart ? v_supply.id then
      v_qty := (v_supply_cart ->> v_supply.id)::numeric;
      v_debit := v_qty * v_supply.pack_size;
      if v_debit > 999999999999.999999 then
        raise exception 'Penggunaan % melewati batas stok yang didukung', v_supply.name
          using errcode = '22003';
      end if;
      if v_debit > v_running then
        raise exception 'Stok % tidak cukup. Sisa % %; perlu % paket (% %).',
          v_supply.name, v_running, v_supply.unit, v_qty, v_debit, v_supply.unit
          using errcode = '23514';
      end if;
      v_before := v_running;
      v_running := v_running - v_debit;
      insert into public.supply_stock_logs
        (supply_id, owner_id, actor_id, supply_name, unit, action, input_amount,
         change_amount, stock_before, stock_after, note, product_id, product_name,
         quantity_per_serving, quantity_tolerance, transaction_id, source_item_key)
      values
        (v_supply.id, new.owner_id, new.user_id, v_supply.name, v_supply.unit,
         'consume', v_qty, -v_debit, v_before, v_running,
         v_ledger_note, null, null,
         v_supply.pack_size, 0, new.id, 'supply:' || v_supply.id);
    end if;

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

drop trigger if exists consume_manual_supply_stock on public.transactions;
create trigger consume_manual_supply_stock
  after insert on public.transactions
  for each row
  when (new.inventory_source = 'manual' and new.status = 'completed')
  execute function public.consume_manual_supply_stock();

revoke all on function public.consume_manual_supply_stock()
  from public, anon, authenticated;
notify pgrst, 'reload schema';
commit;
