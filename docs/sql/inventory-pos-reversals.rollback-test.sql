-- Run after inventory-pos-reversals.sql on an isolated PostgreSQL test DB.
-- Synthetic rows and all stock changes are rolled back at the end.

begin;

do $seed$
declare
  owner_a text := gen_random_uuid()::text;
  owner_b text := gen_random_uuid()::text;
  cashier_a text := gen_random_uuid()::text;
  cashier_b text := gen_random_uuid()::text;
  latte text := gen_random_uuid()::text;
  caramel text := gen_random_uuid()::text;
  unlinked text := gen_random_uuid()::text;
begin
  insert into public.users (id, name, username, password_hash, role, owner_id, is_active)
  values
    (owner_a, 'Reversal owner A', 'rev_owner_' || replace(owner_a, '-', ''), '!rollback-only!', 'admin', owner_a, true),
    (owner_b, 'Reversal owner B', 'rev_owner_' || replace(owner_b, '-', ''), '!rollback-only!', 'admin', owner_b, true),
    (cashier_a, 'Reversal cashier A', 'rev_cashier_' || replace(cashier_a, '-', ''), '!rollback-only!', 'kasir', owner_a, true),
    (cashier_b, 'Reversal cashier B', 'rev_cashier_' || replace(cashier_b, '-', ''), '!rollback-only!', 'kasir', owner_a, true);
  insert into public.products (id, name, owner_id)
  values (latte, 'Original latte', owner_a),
         (caramel, 'Original caramel', owner_a),
         (unlinked, 'Unlinked drink', owner_a);
  perform set_config('test.rev_owner_a', owner_a, true);
  perform set_config('test.rev_owner_b', owner_b, true);
  perform set_config('test.rev_cashier_a', cashier_a, true);
  perform set_config('test.rev_cashier_b', cashier_b, true);
  perform set_config('test.rev_latte', latte, true);
  perform set_config('test.rev_caramel', caramel, true);
  perform set_config('test.rev_unlinked', unlinked, true);
end;
$seed$;

set local role authenticated;
select set_config('request.jwt.claims',
  jsonb_build_object('role', 'authenticated', 'sub', current_setting('test.rev_owner_a'),
                     'owner_id', current_setting('test.rev_owner_a'), 'user_role', 'admin')::text, true);

do $catalog$
declare
  syrup public.supplies%rowtype;
  sugar public.supplies%rowtype;
begin
  select * into syrup from public.save_supply_with_menus(
    jsonb_build_object('name', 'Reversal syrup ' || txid_current(),
                       'unit', 'ml', 'pack_size', 750, 'initial_packs', 1),
    jsonb_build_array(
      jsonb_build_object('product_id', current_setting('test.rev_latte'),
                         'quantity_per_serving', 15, 'quantity_tolerance', 3),
      jsonb_build_object('product_id', current_setting('test.rev_caramel'),
                         'quantity_per_serving', 20, 'quantity_tolerance', 2)));
  select * into sugar from public.save_supply_with_menus(
    jsonb_build_object('name', 'Reversal sugar ' || txid_current(),
                       'unit', 'gram', 'pack_size', 100, 'initial_packs', 1),
    jsonb_build_array(
      jsonb_build_object('product_id', current_setting('test.rev_latte'),
                         'quantity_per_serving', 5)));
  perform set_config('test.rev_syrup', syrup.id, true);
  perform set_config('test.rev_sugar', sugar.id, true);
end;
$catalog$;

select set_config('request.jwt.claims',
  jsonb_build_object('role', 'authenticated', 'sub', current_setting('test.rev_cashier_a'),
                     'owner_id', current_setting('test.rev_owner_a'), 'user_role', 'kasir')::text, true);

do $basic$
declare
  receipt text := gen_random_uuid()::text;
  failed boolean;
begin
  perform set_config('test.rev_first_receipt', receipt, true);
  insert into public.transactions (id, user_id, owner_id, items, status, inventory_source)
  values (receipt, current_setting('test.rev_cashier_a'), current_setting('test.rev_owner_a'),
          jsonb_build_array(jsonb_build_object('product_id', current_setting('test.rev_latte'), 'qty', 1))::text,
          'completed', 'pos');
  if (select stock from public.supplies where id = current_setting('test.rev_syrup')) <> 735
      or (select stock from public.supplies where id = current_setting('test.rev_sugar')) <> 95 then
    raise exception 'One latte did not debit 15 ml and 5 gram';
  end if;

  -- A tracked receipt cannot be rewritten to conceal its original stock use.
  failed := false;
  begin
    update public.transactions set items = '[]' where id = receipt;
  exception when check_violation then failed := true;
  end;
  if not failed then raise exception 'Tracked receipt items changed'; end if;
  failed := false;
  begin
    update public.transactions set user_id = current_setting('test.rev_cashier_b') where id = receipt;
  exception when check_violation then failed := true;
  end;
  if not failed then raise exception 'Tracked receipt user changed'; end if;
  failed := false;
  begin
    update public.transactions set status = 'pending' where id = receipt;
  exception when check_violation then failed := true;
  end;
  if not failed then raise exception 'Tracked completed receipt entered a non-refunding status'; end if;

  update public.transactions set status = 'voided' where id = receipt;
  if (select stock from public.supplies where id = current_setting('test.rev_syrup')) <> 750
      or (select stock from public.supplies where id = current_setting('test.rev_sugar')) <> 100
      or (select count(*) from public.supply_stock_logs
          where transaction_id = receipt and action = 'reversal') <> 2 then
    raise exception 'Voiding did not restore the exact original quantities';
  end if;
  update public.transactions set status = 'voided' where id = receipt;
  failed := false;
  begin
    update public.transactions set status = 'completed' where id = receipt;
  exception when check_violation then failed := true;
  end;
  if not failed then raise exception 'Reversed receipt was reactivated'; end if;
  delete from public.transactions where id = receipt;
  if (select stock from public.supplies where id = current_setting('test.rev_syrup')) <> 750
      or (select count(*) from public.supply_stock_logs
          where transaction_id = receipt and action = 'reversal') <> 2
      or (select count(*) from public.supply_stock_logs original
          join public.supply_stock_logs reversal on reversal.reversal_of_log_id = original.id
          where original.transaction_id = receipt and original.action = 'consume') <> 2 then
    raise exception 'Repeated void/delete credited twice or lost receipt history';
  end if;
end;
$basic$;

do $mixed$
declare
  receipt text := gen_random_uuid()::text;
begin
  perform set_config('test.rev_mixed_receipt', receipt, true);
  insert into public.transactions (id, user_id, owner_id, items, status, inventory_source)
  values (receipt, current_setting('test.rev_cashier_a'), current_setting('test.rev_owner_a'),
          jsonb_build_array(
            jsonb_build_object('product_id', current_setting('test.rev_latte'), 'qty', 2, 'modifiers', jsonb_build_array('ice')),
            jsonb_build_object('product_id', current_setting('test.rev_latte'), 'qty', 1, 'modifiers', jsonb_build_array('oat')),
            jsonb_build_object('product_id', current_setting('test.rev_caramel'), 'qty', 1))::text,
          'completed', 'pos');
  if (select stock from public.supplies where id = current_setting('test.rev_syrup')) <> 685
      or (select stock from public.supplies where id = current_setting('test.rev_sugar')) <> 85
      or (select count(*) from public.supply_stock_logs
          where transaction_id = receipt and action = 'consume') <> 3 then
    raise exception 'Mixed duplicate menus did not debit 65 ml and 15 gram';
  end if;
end;
$mixed$;

-- Restock and waste after the sale, then edit the saved recipe and catalog.
select set_config('request.jwt.claims',
  jsonb_build_object('role', 'authenticated', 'sub', current_setting('test.rev_owner_a'),
                     'owner_id', current_setting('test.rev_owner_a'), 'user_role', 'admin')::text, true);

do $edit$
declare
  syrup public.supplies%rowtype;
begin
  perform public.adjust_supply_stock(current_setting('test.rev_syrup'), 'restock', 1, 'later bottle');
  perform public.adjust_supply_stock(current_setting('test.rev_syrup'), 'consume_quantity', 7, 'later waste');
  if (select stock from public.supplies where id = current_setting('test.rev_syrup')) <> 1428 then
    raise exception 'Later stock activity was not applied';
  end if;
  select * into syrup from public.supplies where id = current_setting('test.rev_syrup');
  perform public.save_supply_with_menus(
    jsonb_build_object('id', syrup.id, 'name', syrup.name,
                       'unit', syrup.unit, 'pack_size', syrup.pack_size),
    jsonb_build_array(jsonb_build_object('product_id', current_setting('test.rev_latte'),
                                         'quantity_per_serving', 30, 'quantity_tolerance', 1)));
  update public.products set name = 'Renamed latte' where id = current_setting('test.rev_latte');
  delete from public.products where id = current_setting('test.rev_caramel');
end;
$edit$;

select set_config('request.jwt.claims',
  jsonb_build_object('role', 'authenticated', 'sub', current_setting('test.rev_cashier_a'),
                     'owner_id', current_setting('test.rev_owner_a'), 'user_role', 'kasir')::text, true);

do $snapshot$
declare
  receipt text := current_setting('test.rev_mixed_receipt');
  direct_delete text := gen_random_uuid()::text;
begin
  update public.transactions set status = 'cancelled' where id = receipt;
  if (select stock from public.supplies where id = current_setting('test.rev_syrup')) <> 1493
      or (select stock from public.supplies where id = current_setting('test.rev_sugar')) <> 100
      or not exists (
        select 1 from public.supply_stock_logs l
        where l.transaction_id = receipt and l.action = 'reversal'
          and l.product_name = 'Original caramel' and l.product_id is null
          and l.quantity_per_serving = 20 and l.quantity_tolerance = 2
          and l.change_amount = 20) then
    raise exception 'Edited/deleted menu changed the original refund or its snapshot';
  end if;

  -- A newly completed sale uses the new dose; direct deletion reverses it.
  insert into public.transactions (id, user_id, owner_id, items, status, inventory_source)
  values (direct_delete, current_setting('test.rev_cashier_a'), current_setting('test.rev_owner_a'),
          jsonb_build_array(jsonb_build_object('product_id', current_setting('test.rev_latte'), 'qty', 1))::text,
          'completed', 'pos');
  if (select stock from public.supplies where id = current_setting('test.rev_syrup')) <> 1463 then
    raise exception 'Edited dose did not apply to new sale';
  end if;
  delete from public.transactions where id = direct_delete;
  if (select stock from public.supplies where id = current_setting('test.rev_syrup')) <> 1493
      or (select count(*) from public.supply_stock_logs
          where transaction_id = direct_delete and action = 'reversal'
            and change_amount = 30) <> 1 then
    raise exception 'Direct deletion did not refund the new saved dose';
  end if;
end;
$snapshot$;

-- An unlinked POS receipt and legacy/manual receipt have no ingredient debit.
do $unlinked$
declare
  unlinked_receipt text := gen_random_uuid()::text;
  legacy_receipt text := gen_random_uuid()::text;
  before_stock numeric;
begin
  before_stock := (select stock from public.supplies where id = current_setting('test.rev_syrup'));
  insert into public.transactions (id, user_id, owner_id, items, status, inventory_source)
  values (unlinked_receipt, current_setting('test.rev_cashier_a'), current_setting('test.rev_owner_a'),
          jsonb_build_array(jsonb_build_object('product_id', current_setting('test.rev_unlinked'), 'qty', 1))::text,
          'completed', 'pos');
  insert into public.transactions (id, user_id, owner_id, items, status)
  values (legacy_receipt, current_setting('test.rev_cashier_a'), current_setting('test.rev_owner_a'),
          jsonb_build_array(jsonb_build_object('product_id', current_setting('test.rev_latte'), 'qty', 1))::text,
          'completed');
  update public.transactions set status = 'canceled' where id = unlinked_receipt;
  delete from public.transactions where id = legacy_receipt;
  if (select stock from public.supplies where id = current_setting('test.rev_syrup')) <> before_stock
      or exists (select 1 from public.supply_stock_logs
                 where transaction_id in (unlinked_receipt, legacy_receipt)) then
    raise exception 'Unlinked or legacy receipt invented an ingredient credit';
  end if;
end;
$unlinked$;

-- Another cashier cannot reverse a co-worker's receipt; an admin can.
do $staff_sale$
declare receipt text := gen_random_uuid()::text;
begin
  perform set_config('test.rev_staff_receipt', receipt, true);
  insert into public.transactions (id, user_id, owner_id, items, status, inventory_source)
  values (receipt, current_setting('test.rev_cashier_a'), current_setting('test.rev_owner_a'),
          jsonb_build_array(jsonb_build_object('product_id', current_setting('test.rev_latte'), 'qty', 1))::text,
          'completed', 'pos');
end;
$staff_sale$;

select set_config('request.jwt.claims',
  jsonb_build_object('role', 'authenticated', 'sub', current_setting('test.rev_cashier_b'),
                     'owner_id', current_setting('test.rev_owner_a'), 'user_role', 'kasir')::text, true);
do $other_cashier$
declare denied boolean := false;
begin
  begin
    delete from public.transactions where id = current_setting('test.rev_staff_receipt');
  exception when insufficient_privilege then denied := true;
  end;
  if not denied then raise exception 'Cashier deleted another cashier receipt'; end if;
end;
$other_cashier$;

select set_config('request.jwt.claims',
  jsonb_build_object('role', 'authenticated', 'sub', current_setting('test.rev_owner_a'),
                     'owner_id', current_setting('test.rev_owner_a'), 'user_role', 'admin')::text, true);
delete from public.transactions where id = current_setting('test.rev_staff_receipt');
do $admin_check$
begin
  if (select stock from public.supplies where id = current_setting('test.rev_syrup')) <> 1493
      or (select count(*) from public.supply_stock_logs
          where transaction_id = current_setting('test.rev_staff_receipt') and action = 'reversal') <> 2 then
    raise exception 'Admin could not reverse a staff receipt';
  end if;
end;
$admin_check$;

-- A unit change after the original supply reaches zero blocks a refund. All
-- other supply credits in that same cancellation must roll back as well.
do $unit_catalog$
declare
  unit_supply public.supplies%rowtype;
begin
  select * into unit_supply from public.save_supply_with_menus(
    jsonb_build_object('name', 'Unit reversal ' || txid_current(),
                       'unit', 'ml', 'pack_size', 15, 'initial_packs', 1),
    jsonb_build_array(jsonb_build_object('product_id', current_setting('test.rev_latte'),
                                         'quantity_per_serving', 15)));
  perform set_config('test.rev_unit_supply', unit_supply.id, true);
end;
$unit_catalog$;

select set_config('request.jwt.claims',
  jsonb_build_object('role', 'authenticated', 'sub', current_setting('test.rev_cashier_a'),
                     'owner_id', current_setting('test.rev_owner_a'), 'user_role', 'kasir')::text, true);
do $unit_sale$
declare receipt text := gen_random_uuid()::text;
begin
  perform set_config('test.rev_unit_receipt', receipt, true);
  insert into public.transactions (id, user_id, owner_id, items, status, inventory_source)
  values (receipt, current_setting('test.rev_cashier_a'), current_setting('test.rev_owner_a'),
          jsonb_build_array(jsonb_build_object('product_id', current_setting('test.rev_latte'), 'qty', 1))::text,
          'completed', 'pos');
  if (select stock from public.supplies where id = current_setting('test.rev_unit_supply')) <> 0 then
    raise exception 'Unit test supply was not emptied';
  end if;
end;
$unit_sale$;

select set_config('request.jwt.claims',
  jsonb_build_object('role', 'authenticated', 'sub', current_setting('test.rev_owner_a'),
                     'owner_id', current_setting('test.rev_owner_a'), 'user_role', 'admin')::text, true);
do $unit_edit$
declare s public.supplies%rowtype;
begin
  select * into s from public.supplies where id = current_setting('test.rev_unit_supply');
  perform public.save_supply_with_menus(
    jsonb_build_object('id', s.id, 'name', s.name, 'unit', 'gram', 'pack_size', s.pack_size),
    jsonb_build_array(jsonb_build_object('product_id', current_setting('test.rev_latte'),
                                         'quantity_per_serving', 15)));
end;
$unit_edit$;

select set_config('request.jwt.claims',
  jsonb_build_object('role', 'authenticated', 'sub', current_setting('test.rev_cashier_a'),
                     'owner_id', current_setting('test.rev_owner_a'), 'user_role', 'kasir')::text, true);
do $unit_guard$
declare
  denied boolean := false;
  syrup_before numeric;
  sugar_before numeric;
begin
  syrup_before := (select stock from public.supplies where id = current_setting('test.rev_syrup'));
  sugar_before := (select stock from public.supplies where id = current_setting('test.rev_sugar'));
  begin
    update public.transactions set status = 'voided' where id = current_setting('test.rev_unit_receipt');
  exception when check_violation then denied := true;
  end;
  if not denied
      or (select status from public.transactions where id = current_setting('test.rev_unit_receipt')) <> 'completed'
      or (select stock from public.supplies where id = current_setting('test.rev_syrup')) <> syrup_before
      or (select stock from public.supplies where id = current_setting('test.rev_sugar')) <> sugar_before
      or exists (select 1 from public.supply_stock_logs
                 where transaction_id = current_setting('test.rev_unit_receipt') and action = 'reversal') then
    raise exception 'Unit mismatch did not atomically reject cancellation';
  end if;
end;
$unit_guard$;

-- Restore the original unit and verify the failed refund remains available.
select set_config('request.jwt.claims',
  jsonb_build_object('role', 'authenticated', 'sub', current_setting('test.rev_owner_a'),
                     'owner_id', current_setting('test.rev_owner_a'), 'user_role', 'admin')::text, true);
update public.supplies set unit = 'ml' where id = current_setting('test.rev_unit_supply');
select set_config('request.jwt.claims',
  jsonb_build_object('role', 'authenticated', 'sub', current_setting('test.rev_cashier_a'),
                     'owner_id', current_setting('test.rev_owner_a'), 'user_role', 'kasir')::text, true);
update public.transactions set status = 'voided' where id = current_setting('test.rev_unit_receipt');

-- Gram and g are equivalent display units. The original five grams can be
-- credited after a zero-stock rename without converting the amount.
select set_config('request.jwt.claims',
  jsonb_build_object('role', 'authenticated', 'sub', current_setting('test.rev_owner_a'),
                     'owner_id', current_setting('test.rev_owner_a'), 'user_role', 'admin')::text, true);
do $gram_catalog$
declare s public.supplies%rowtype;
begin
  select * into s from public.save_supply_with_menus(
    jsonb_build_object('name', 'Gram reversal ' || txid_current(),
                       'unit', 'gram', 'pack_size', 5, 'initial_packs', 1),
    jsonb_build_array(jsonb_build_object('product_id', current_setting('test.rev_latte'),
                                         'quantity_per_serving', 5)));
  perform set_config('test.rev_gram_supply', s.id, true);
end;
$gram_catalog$;
select set_config('request.jwt.claims',
  jsonb_build_object('role', 'authenticated', 'sub', current_setting('test.rev_cashier_a'),
                     'owner_id', current_setting('test.rev_owner_a'), 'user_role', 'kasir')::text, true);
do $gram_sale$
declare receipt text := gen_random_uuid()::text;
begin
  perform set_config('test.rev_gram_receipt', receipt, true);
  insert into public.transactions (id, user_id, owner_id, items, status, inventory_source)
  values (receipt, current_setting('test.rev_cashier_a'), current_setting('test.rev_owner_a'),
          jsonb_build_array(jsonb_build_object('product_id', current_setting('test.rev_latte'), 'qty', 1))::text,
          'completed', 'pos');
end;
$gram_sale$;
select set_config('request.jwt.claims',
  jsonb_build_object('role', 'authenticated', 'sub', current_setting('test.rev_owner_a'),
                     'owner_id', current_setting('test.rev_owner_a'), 'user_role', 'admin')::text, true);
update public.supplies set unit = 'g' where id = current_setting('test.rev_gram_supply');
select set_config('request.jwt.claims',
  jsonb_build_object('role', 'authenticated', 'sub', current_setting('test.rev_cashier_a'),
                     'owner_id', current_setting('test.rev_owner_a'), 'user_role', 'kasir')::text, true);
update public.transactions set status = 'canceled' where id = current_setting('test.rev_gram_receipt');
do $gram_check$
begin
  if (select stock from public.supplies where id = current_setting('test.rev_gram_supply')) <> 5
      or (select count(*) from public.supply_stock_logs
          where transaction_id = current_setting('test.rev_gram_receipt')
            and supply_id = current_setting('test.rev_gram_supply')
            and action = 'reversal' and change_amount = 5) <> 1 then
    raise exception 'Equivalent gram/g units did not refund five grams';
  end if;
end;
$gram_check$;

-- A later adjustment near the numeric ceiling must not overflow on refund.
select set_config('request.jwt.claims',
  jsonb_build_object('role', 'authenticated', 'sub', current_setting('test.rev_owner_a'),
                     'owner_id', current_setting('test.rev_owner_a'), 'user_role', 'admin')::text, true);
do $overflow_catalog$
declare s public.supplies%rowtype;
begin
  select * into s from public.save_supply_with_menus(
    jsonb_build_object('name', 'Overflow reversal ' || txid_current(),
                       'unit', 'ml', 'pack_size', 1, 'initial_packs', 1),
    jsonb_build_array(jsonb_build_object('product_id', current_setting('test.rev_latte'),
                                         'quantity_per_serving', 1)));
  perform set_config('test.rev_overflow_supply', s.id, true);
end;
$overflow_catalog$;
select set_config('request.jwt.claims',
  jsonb_build_object('role', 'authenticated', 'sub', current_setting('test.rev_cashier_a'),
                     'owner_id', current_setting('test.rev_owner_a'), 'user_role', 'kasir')::text, true);
do $overflow_sale$
declare receipt text := gen_random_uuid()::text;
begin
  perform set_config('test.rev_overflow_receipt', receipt, true);
  insert into public.transactions (id, user_id, owner_id, items, status, inventory_source)
  values (receipt, current_setting('test.rev_cashier_a'), current_setting('test.rev_owner_a'),
          jsonb_build_array(jsonb_build_object('product_id', current_setting('test.rev_latte'), 'qty', 1))::text,
          'completed', 'pos');
end;
$overflow_sale$;
select set_config('request.jwt.claims',
  jsonb_build_object('role', 'authenticated', 'sub', current_setting('test.rev_owner_a'),
                     'owner_id', current_setting('test.rev_owner_a'), 'user_role', 'admin')::text, true);
select public.adjust_supply_stock(current_setting('test.rev_overflow_supply'),
                                  'adjust', 999999999999.999999, 'range test');
select set_config('request.jwt.claims',
  jsonb_build_object('role', 'authenticated', 'sub', current_setting('test.rev_cashier_a'),
                     'owner_id', current_setting('test.rev_owner_a'), 'user_role', 'kasir')::text, true);
do $overflow_guard$
declare
  denied boolean := false;
  syrup_before numeric;
begin
  syrup_before := (select stock from public.supplies where id = current_setting('test.rev_syrup'));
  begin
    delete from public.transactions where id = current_setting('test.rev_overflow_receipt');
  exception when numeric_value_out_of_range then denied := true;
  end;
  if not denied
      or not exists (select 1 from public.transactions where id = current_setting('test.rev_overflow_receipt'))
      or (select stock from public.supplies where id = current_setting('test.rev_overflow_supply')) <> 999999999999.999999
      or (select stock from public.supplies where id = current_setting('test.rev_syrup')) <> syrup_before
      or exists (select 1 from public.supply_stock_logs
                 where transaction_id = current_setting('test.rev_overflow_receipt') and action = 'reversal') then
    raise exception 'Stock overflow did not atomically reject deletion';
  end if;
end;
$overflow_guard$;
select set_config('request.jwt.claims',
  jsonb_build_object('role', 'authenticated', 'sub', current_setting('test.rev_owner_a'),
                     'owner_id', current_setting('test.rev_owner_a'), 'user_role', 'admin')::text, true);
select public.adjust_supply_stock(current_setting('test.rev_overflow_supply'),
                                  'adjust', 0, 'restore refund capacity');
select set_config('request.jwt.claims',
  jsonb_build_object('role', 'authenticated', 'sub', current_setting('test.rev_cashier_a'),
                     'owner_id', current_setting('test.rev_owner_a'), 'user_role', 'kasir')::text, true);
delete from public.transactions where id = current_setting('test.rev_overflow_receipt');

-- Foreign-owner, inactive and anonymous actors must not reverse receipts.
select set_config('request.jwt.claims',
  jsonb_build_object('role', 'authenticated', 'sub', current_setting('test.rev_owner_b'),
                     'owner_id', current_setting('test.rev_owner_b'), 'user_role', 'admin')::text, true);
do $foreign$
declare affected integer;
begin
  update public.transactions set status = 'canceled'
    where id = current_setting('test.rev_unit_receipt');
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Foreign owner changed another business receipt'; end if;
end;
$foreign$;

reset role;
update public.users set is_active = false where id = current_setting('test.rev_cashier_a');
set local role authenticated;
select set_config('request.jwt.claims',
  jsonb_build_object('role', 'authenticated', 'sub', current_setting('test.rev_cashier_a'),
                     'owner_id', current_setting('test.rev_owner_a'), 'user_role', 'kasir')::text, true);
do $inactive$
declare denied boolean := false;
begin
  begin
    delete from public.transactions where id = current_setting('test.rev_unit_receipt');
  exception when insufficient_privilege then denied := true;
  end;
  if not denied then raise exception 'Inactive cashier deleted a receipt'; end if;
end;
$inactive$;

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $anonymous$
declare denied boolean := false;
        affected integer := 0;
begin
  begin
    delete from public.transactions where id = current_setting('test.rev_unit_receipt');
    get diagnostics affected = row_count;
  exception when insufficient_privilege then denied := true;
  end;
  if not denied and affected <> 0 then
    raise exception 'Anonymous receipt deletion was accepted';
  end if;
end;
$anonymous$;

reset role;
do $integrity$
declare
  sample public.supply_stock_logs%rowtype;
  rejected boolean;
begin
  if has_table_privilege('authenticated', 'public.supply_stock_logs', 'INSERT')
      or has_table_privilege('anon', 'public.supply_stock_logs', 'INSERT')
      or has_function_privilege('authenticated', 'public.reverse_pos_supply_stock()', 'EXECUTE')
      or has_function_privilege('anon', 'public.reverse_pos_supply_stock()', 'EXECUTE') then
    raise exception 'Ledger mutation or internal trigger function is exposed to clients';
  end if;
  select * into sample from public.supply_stock_logs
    where action = 'reversal' limit 1;
  if not found then raise exception 'Expected a reversal log for integrity checks'; end if;

  rejected := false;
  begin
    insert into public.supply_stock_logs
      (supply_id, owner_id, actor_id, supply_name, unit, action,
       input_amount, change_amount, stock_before, stock_after,
       transaction_id, reversal_of_log_id)
    values
      (sample.supply_id, sample.owner_id, sample.actor_id, sample.supply_name,
       sample.unit, 'reversal', sample.input_amount, 0, sample.stock_after,
       sample.stock_after, sample.transaction_id, sample.reversal_of_log_id);
  exception when unique_violation then rejected := true;
  end;
  if not rejected then raise exception 'The same original log was reversed twice'; end if;

  rejected := false;
  begin
    insert into public.supply_stock_logs
      (supply_id, owner_id, actor_id, supply_name, unit, action,
       input_amount, change_amount, stock_before, stock_after,
       transaction_id, reversal_of_log_id)
    values
      (sample.supply_id, sample.owner_id, sample.actor_id, sample.supply_name,
       sample.unit, 'reversal', sample.input_amount, 0, sample.stock_after,
       sample.stock_after, sample.transaction_id, gen_random_uuid());
  exception when foreign_key_violation then rejected := true;
  end;
  if not rejected then raise exception 'A reversal referenced a missing original log'; end if;
end;
$integrity$;

rollback;
