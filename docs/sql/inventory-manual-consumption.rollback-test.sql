-- Run after the generated manual-consumption migration on an isolated DB.
-- Every fixture is synthetic and the entire suite ends with ROLLBACK.

begin;

do $seed$
declare
  owner_a text := gen_random_uuid()::text;
  owner_b text := gen_random_uuid()::text;
  cashier text := gen_random_uuid()::text;
  kopder text := gen_random_uuid()::text;
  other_menu text := gen_random_uuid()::text;
  foreign_menu text := gen_random_uuid()::text;
  foreign_supply text := gen_random_uuid()::text;
begin
  insert into public.users (id, name, username, password_hash, role, owner_id, is_active)
  values
    (owner_a, 'Manual test owner A', 'manual_a_' || replace(owner_a, '-', ''), '!rollback!', 'admin', owner_a, true),
    (owner_b, 'Manual test owner B', 'manual_b_' || replace(owner_b, '-', ''), '!rollback!', 'admin', owner_b, true),
    (cashier, 'Manual test cashier', 'manual_k_' || replace(cashier, '-', ''), '!rollback!', 'kasir', owner_a, true);
  insert into public.products (id, name, owner_id)
  values (kopder, 'Kopder', owner_a),
         (other_menu, 'Unlinked menu', owner_a),
         (foreign_menu, 'Foreign menu', owner_b);
  -- Product and supply IDs intentionally collide; the type flag separates them.
  insert into public.supplies (id, owner_id, name, unit, pack_size, stock)
  values (kopder, owner_a, 'Collision supply', 'pcs', 20, 0),
         (foreign_supply, owner_b, 'Foreign supply', 'pcs', 10, 0);
  perform set_config('test.man_owner_a', owner_a, true);
  perform set_config('test.man_owner_b', owner_b, true);
  perform set_config('test.man_cashier', cashier, true);
  perform set_config('test.man_kopder', kopder, true);
  perform set_config('test.man_other_menu', other_menu, true);
  perform set_config('test.man_foreign_menu', foreign_menu, true);
  perform set_config('test.man_foreign_supply', foreign_supply, true);
end;
$seed$;

set local role authenticated;
select set_config('request.jwt.claims',
  jsonb_build_object('role', 'authenticated', 'sub', current_setting('test.man_owner_a'),
                     'owner_id', current_setting('test.man_owner_a'), 'user_role', 'admin')::text, true);

do $catalog$
declare
  syrup public.supplies%rowtype;
  sugar public.supplies%rowtype;
  cups public.supplies%rowtype;
begin
  select * into syrup from public.save_supply_with_menus(
    jsonb_build_object('name', 'Manual syrup ' || txid_current(),
                       'unit', 'ml', 'pack_size', 750, 'initial_packs', 1),
    jsonb_build_array(jsonb_build_object('product_id', current_setting('test.man_kopder'),
                                         'quantity_per_serving', 15, 'quantity_tolerance', 3)));
  select * into sugar from public.save_supply_with_menus(
    jsonb_build_object('name', 'Manual sugar ' || txid_current(),
                       'unit', 'gram', 'pack_size', 100, 'initial_packs', 1),
    jsonb_build_array(jsonb_build_object('product_id', current_setting('test.man_kopder'),
                                         'quantity_per_serving', 5)));
  select * into cups from public.save_supply_with_menus(
    jsonb_build_object('name', 'Manual cups ' || txid_current(),
                       'unit', 'pcs', 'pack_size', 10, 'initial_packs', 5),
    '[]'::jsonb);
  perform public.adjust_supply_stock(current_setting('test.man_kopder'), 'restock', 2, 'collision packages');
  perform set_config('test.man_syrup', syrup.id, true);
  perform set_config('test.man_sugar', sugar.id, true);
  perform set_config('test.man_cups', cups.id, true);
end;
$catalog$;

do $kopder$
declare
  first_receipt text := gen_random_uuid()::text;
  second_receipt text := gen_random_uuid()::text;
begin
  perform set_config('test.man_first', first_receipt, true);
  perform set_config('test.man_second', second_receipt, true);
  insert into public.transactions
    (id, owner_id, user_id, items, status, inventory_source, manual_txn_count)
  values
    (first_receipt, current_setting('test.man_owner_a'), current_setting('test.man_owner_a'),
     jsonb_build_array(jsonb_build_object('product_id', current_setting('test.man_kopder'), 'qty', 1))::text,
     'completed', 'manual', 99);
  if (select stock from public.supplies where id = current_setting('test.man_syrup')) <> 735
      or (select stock from public.supplies where id = current_setting('test.man_sugar')) <> 95
      or (select count(*) from public.supply_stock_logs
          where transaction_id = first_receipt and action = 'consume'
            and source_item_key = 'menu:' || current_setting('test.man_kopder')
            and quantity_per_serving in (15, 5)) <> 2 then
    raise exception 'Kopder one serving should consume 15 ml syrup and 5 gram sugar';
  end if;
  insert into public.transactions
    (id, owner_id, user_id, items, status, inventory_source)
  values
    (second_receipt, current_setting('test.man_owner_a'), current_setting('test.man_owner_a'),
     jsonb_build_array(jsonb_build_object('product_id', current_setting('test.man_kopder'),
                                         'qty', 2, 'is_supply', false))::text,
     'completed', 'manual');
  if (select stock from public.supplies where id = current_setting('test.man_syrup')) <> 705
      or (select stock from public.supplies where id = current_setting('test.man_sugar')) <> 85 then
    raise exception 'Two further Kopder servings should leave 705 ml syrup';
  end if;
  update public.transactions set status = 'voided' where id = second_receipt;
  delete from public.transactions where id = first_receipt;
  if (select stock from public.supplies where id = current_setting('test.man_syrup')) <> 750
      or (select stock from public.supplies where id = current_setting('test.man_sugar')) <> 100 then
    raise exception 'Manual menu cancellation/deletion did not restore exact stock';
  end if;
end;
$kopder$;

-- Two cart rows for each typed item become one log per supply and typed key.
select public.adjust_supply_stock(current_setting('test.man_syrup'), 'restock', 1, 'mixed test bottle');
do $mixed$
declare receipt text := gen_random_uuid()::text;
begin
  perform set_config('test.man_mixed', receipt, true);
  insert into public.transactions
    (id, owner_id, user_id, items, status, inventory_source, manual_txn_count)
  values
    (receipt, current_setting('test.man_owner_a'), current_setting('test.man_owner_a'),
     jsonb_build_array(
       jsonb_build_object('product_id', current_setting('test.man_kopder'), 'qty', 1),
       jsonb_build_object('product_id', current_setting('test.man_kopder'), 'qty', 1, 'is_supply', false),
       jsonb_build_object('product_id', current_setting('test.man_syrup'), 'qty', 1, 'is_supply', true),
       jsonb_build_object('product_id', current_setting('test.man_cups'), 'qty', 1, 'is_supply', true),
       jsonb_build_object('product_id', current_setting('test.man_cups'), 'qty', 1, 'is_supply', true))::text,
     'completed', 'manual', 500);
  if (select stock from public.supplies where id = current_setting('test.man_syrup')) <> 720
      or (select stock from public.supplies where id = current_setting('test.man_sugar')) <> 90
      or (select stock from public.supplies where id = current_setting('test.man_cups')) <> 30
      or (select count(*) from public.supply_stock_logs
          where transaction_id = receipt and action = 'consume') <> 4
      or (select count(*) from public.supply_stock_logs
          where transaction_id = receipt and supply_id = current_setting('test.man_syrup')
            and source_item_key in ('menu:' || current_setting('test.man_kopder'),
                                    'supply:' || current_setting('test.man_syrup'))) <> 2
      or (select input_amount from public.supply_stock_logs
          where transaction_id = receipt and supply_id = current_setting('test.man_cups')) <> 2 then
    raise exception 'Mixed menu and package quantities were not aggregated/debited correctly';
  end if;

  -- A duplicate insert is skipped before AFTER INSERT; no second deduction.
  insert into public.transactions
    (id, owner_id, user_id, items, status, inventory_source)
  values (receipt, current_setting('test.man_owner_a'), current_setting('test.man_owner_a'),
          jsonb_build_array(jsonb_build_object('product_id', current_setting('test.man_cups'),
                                               'qty', 1, 'is_supply', true))::text,
          'completed', 'manual')
  on conflict (id) do nothing;
  if (select stock from public.supplies where id = current_setting('test.man_syrup')) <> 720
      or (select count(*) from public.supply_stock_logs
          where transaction_id = receipt and action = 'consume') <> 4 then
    raise exception 'Retry consumed stock a second time';
  end if;
end;
$mixed$;

-- Save later recipe and pack changes; refund must use original ledger amounts.
do $edit$
declare s public.supplies%rowtype;
begin
  select * into s from public.supplies where id = current_setting('test.man_syrup');
  perform public.save_supply_with_menus(
    jsonb_build_object('id', s.id, 'name', s.name, 'unit', s.unit,
                       'pack_size', 500, 'min_stock_level', s.min_stock_level),
    jsonb_build_array(jsonb_build_object('product_id', current_setting('test.man_kopder'),
                                         'quantity_per_serving', 10, 'quantity_tolerance', 2)));
  update public.products set name = 'Renamed Kopder' where id = current_setting('test.man_kopder');
  update public.transactions set status = 'cancelled' where id = current_setting('test.man_mixed');
  update public.transactions set status = 'cancelled' where id = current_setting('test.man_mixed');
  delete from public.transactions where id = current_setting('test.man_mixed');
  if (select stock from public.supplies where id = current_setting('test.man_syrup')) <> 1500
      or (select stock from public.supplies where id = current_setting('test.man_sugar')) <> 100
      or (select stock from public.supplies where id = current_setting('test.man_cups')) <> 50
      or (select count(*) from public.supply_stock_logs
          where transaction_id = current_setting('test.man_mixed') and action = 'reversal') <> 4
      or not exists (
        select 1 from public.supply_stock_logs
        where transaction_id = current_setting('test.man_mixed') and action = 'reversal'
          and source_item_key is null and change_amount = 750
          and quantity_per_serving = 750) then
    raise exception 'Recipe/pack edit or repeated cancel/delete changed exact refund';
  end if;
end;
$edit$;

do $collision$
declare receipt text := gen_random_uuid()::text;
begin
  insert into public.transactions
    (id, owner_id, user_id, items, status, inventory_source)
  values (receipt, current_setting('test.man_owner_a'), current_setting('test.man_owner_a'),
          jsonb_build_array(
            jsonb_build_object('product_id', current_setting('test.man_kopder'), 'qty', 1, 'is_supply', false),
            jsonb_build_object('product_id', current_setting('test.man_kopder'), 'qty', 1, 'is_supply', true))::text,
          'completed', 'manual');
  if (select stock from public.supplies where id = current_setting('test.man_syrup')) <> 1490
      or (select stock from public.supplies where id = current_setting('test.man_sugar')) <> 95
      or (select stock from public.supplies where id = current_setting('test.man_kopder')) <> 20
      or (select count(*) from public.supply_stock_logs
          where transaction_id = receipt and action = 'consume') <> 3 then
    raise exception 'Matching product/supply IDs were conflated';
  end if;
  delete from public.transactions where id = receipt;
  if (select stock from public.supplies where id = current_setting('test.man_kopder')) <> 40 then
    raise exception 'Matching-ID direct package did not refund';
  end if;
end;
$collision$;

-- Combined menu dose plus direct packages must fit the same locked balance.
do $shortage$
declare
  receipt text := gen_random_uuid()::text;
  rejected boolean := false;
  before_logs integer;
begin
  select count(*) into before_logs from public.supply_stock_logs;
  begin
    insert into public.transactions
      (id, owner_id, user_id, items, status, inventory_source)
    values (receipt, current_setting('test.man_owner_a'), current_setting('test.man_owner_a'),
            jsonb_build_array(
              jsonb_build_object('product_id', current_setting('test.man_kopder'), 'qty', 1),
              jsonb_build_object('product_id', current_setting('test.man_syrup'), 'qty', 3, 'is_supply', true))::text,
            'completed', 'manual');
  exception when check_violation then rejected := true;
  end;
  if not rejected or exists (select 1 from public.transactions where id = receipt)
      or (select stock from public.supplies where id = current_setting('test.man_syrup')) <> 1500
      or (select count(*) from public.supply_stock_logs) <> before_logs then
    raise exception 'Cumulative shortage did not roll back receipt and every log';
  end if;
end;
$shortage$;

-- Legacy NULL-source receipts remain untouched; a POS receipt still uses its
-- own trigger and can be reversed without a manual source key.
do $legacy_pos$
declare
  legacy text := gen_random_uuid()::text;
  pos_receipt text := gen_random_uuid()::text;
begin
  insert into public.transactions (id, owner_id, user_id, items, status)
  values (legacy, current_setting('test.man_owner_a'), current_setting('test.man_owner_a'),
          jsonb_build_array(jsonb_build_object('product_id', current_setting('test.man_kopder'), 'qty', 1))::text,
          'completed');
  update public.transactions set status = 'voided' where id = legacy;
  if (select stock from public.supplies where id = current_setting('test.man_syrup')) <> 1500
      or exists (select 1 from public.supply_stock_logs where transaction_id = legacy) then
    raise exception 'Legacy receipt was processed retroactively';
  end if;
  insert into public.transactions (id, owner_id, user_id, items, status, inventory_source)
  values (pos_receipt, current_setting('test.man_owner_a'), current_setting('test.man_owner_a'),
          jsonb_build_array(jsonb_build_object('product_id', current_setting('test.man_kopder'), 'qty', 1))::text,
          'completed', 'pos');
  if (select stock from public.supplies where id = current_setting('test.man_syrup')) <> 1490
      or exists (select 1 from public.supply_stock_logs
                 where transaction_id = pos_receipt and source_item_key is not null) then
    raise exception 'POS trigger changed after manual migration';
  end if;
  delete from public.transactions where id = pos_receipt;
  if (select stock from public.supplies where id = current_setting('test.man_syrup')) <> 1500 then
    raise exception 'POS reversal changed after manual migration';
  end if;
end;
$legacy_pos$;

-- A linked dose and a package of the same supply can use its exact balance.
do $exact_catalog$
declare s public.supplies%rowtype;
begin
  select * into s from public.supplies where id = current_setting('test.man_cups');
  perform public.save_supply_with_menus(
    jsonb_build_object('id', s.id, 'name', s.name, 'unit', s.unit, 'pack_size', s.pack_size),
    jsonb_build_array(jsonb_build_object('product_id', current_setting('test.man_kopder'),
                                         'quantity_per_serving', 5)));
  perform public.adjust_supply_stock(s.id, 'adjust', 15, 'exact combined balance');
end;
$exact_catalog$;
do $exact_balance$
declare receipt text := gen_random_uuid()::text;
begin
  insert into public.transactions (id, owner_id, user_id, items, status, inventory_source)
  values (receipt, current_setting('test.man_owner_a'), current_setting('test.man_owner_a'),
          jsonb_build_array(
            jsonb_build_object('product_id', current_setting('test.man_kopder'), 'qty', 1),
            jsonb_build_object('product_id', current_setting('test.man_cups'), 'qty', 1, 'is_supply', true))::text,
          'completed', 'manual');
  if (select stock from public.supplies where id = current_setting('test.man_cups')) <> 0
      or (select count(*) from public.supply_stock_logs
          where transaction_id = receipt and supply_id = current_setting('test.man_cups')
            and action = 'consume') <> 2 then
    raise exception 'Exact shared balance was not consumed completely';
  end if;
  update public.transactions set status = 'voided' where id = receipt;
  if (select stock from public.supplies where id = current_setting('test.man_cups')) <> 15
      or (select stock from public.supplies where id = current_setting('test.man_syrup')) <> 1500 then
    raise exception 'Exact shared balance was not refunded';
  end if;
end;
$exact_balance$;

do $multiplication_overflow$
declare
  receipt text := gen_random_uuid()::text;
  rejected boolean := false;
  before_logs integer;
begin
  select count(*) into before_logs from public.supply_stock_logs;
  begin
    insert into public.transactions (id, owner_id, user_id, items, status, inventory_source)
    values (receipt, current_setting('test.man_owner_a'), current_setting('test.man_owner_a'),
            jsonb_build_array(jsonb_build_object('product_id', current_setting('test.man_syrup'),
                                                 'qty', 999999999999, 'is_supply', true))::text,
            'completed', 'manual');
  exception when numeric_value_out_of_range then rejected := true;
  end;
  if not rejected or exists (select 1 from public.transactions where id = receipt)
      or (select stock from public.supplies where id = current_setting('test.man_syrup')) <> 1500
      or (select count(*) from public.supply_stock_logs) <> before_logs then
    raise exception 'Package multiplication overflow changed receipt or stock';
  end if;
end;
$multiplication_overflow$;

do $invalid_cart$
declare
  rejected boolean;
  payload text;
  fixture text;
begin
  for payload in select value from unnest(array[
    'not-json', '[]', '{}',
    jsonb_build_array(jsonb_build_object('product_id', current_setting('test.man_kopder'), 'qty', 0.5))::text,
    jsonb_build_array(jsonb_build_object('product_id', current_setting('test.man_kopder'), 'qty', -1))::text,
    jsonb_build_array(jsonb_build_object('product_id', current_setting('test.man_kopder'), 'qty', 1000000000000))::text,
    jsonb_build_array(jsonb_build_object('product_id', current_setting('test.man_kopder'), 'qty', 1, 'is_supply', 'true'))::text,
    jsonb_build_array(jsonb_build_object('product_id', 'missing-' || txid_current(), 'qty', 1))::text,
    jsonb_build_array(jsonb_build_object('product_id', current_setting('test.man_foreign_menu'), 'qty', 1))::text,
    jsonb_build_array(jsonb_build_object('product_id', 'missing-' || txid_current(), 'qty', 1, 'is_supply', true))::text,
    jsonb_build_array(jsonb_build_object('product_id', current_setting('test.man_foreign_supply'), 'qty', 1, 'is_supply', true))::text
  ]) as value loop
    fixture := gen_random_uuid()::text;
    rejected := false;
    begin
      insert into public.transactions (id, owner_id, user_id, items, status, inventory_source)
      values (fixture, current_setting('test.man_owner_a'), current_setting('test.man_owner_a'),
              payload, 'completed', 'manual');
    exception when invalid_parameter_value or foreign_key_violation then rejected := true;
    end;
    if not rejected or exists (select 1 from public.transactions where id = fixture) then
      raise exception 'Invalid cart was accepted: %', payload;
    end if;
  end loop;
  if (select stock from public.supplies where id = current_setting('test.man_syrup')) <> 1500 then
    raise exception 'Invalid cart changed stock';
  end if;
end;
$invalid_cart$;

-- Actor tests use a valid menu, but an invalid signed identity must fail
-- before any ingredient or ledger mutation.
select set_config('request.jwt.claims',
  jsonb_build_object('role', 'authenticated', 'sub', current_setting('test.man_cashier'),
                     'owner_id', current_setting('test.man_owner_a'), 'user_role', 'kasir')::text, true);
do $cashier$
declare denied boolean := false;
begin
  begin
    insert into public.transactions (id, owner_id, user_id, items, status, inventory_source)
    values (gen_random_uuid()::text, current_setting('test.man_owner_a'), current_setting('test.man_cashier'),
            jsonb_build_array(jsonb_build_object('product_id', current_setting('test.man_kopder'), 'qty', 1))::text,
            'completed', 'manual');
  exception when insufficient_privilege then denied := true;
  end;
  if not denied then raise exception 'Cashier created stock-changing manual receipt'; end if;
end;
$cashier$;

select set_config('request.jwt.claims',
  jsonb_build_object('role', 'authenticated', 'sub', current_setting('test.man_owner_b'),
                     'owner_id', current_setting('test.man_owner_b'), 'user_role', 'admin')::text, true);
do $foreign_actor$
declare denied boolean := false;
begin
  begin
    insert into public.transactions (id, owner_id, user_id, items, status, inventory_source)
    values (gen_random_uuid()::text, current_setting('test.man_owner_a'), current_setting('test.man_owner_b'),
            jsonb_build_array(jsonb_build_object('product_id', current_setting('test.man_kopder'), 'qty', 1))::text,
            'completed', 'manual');
  exception when insufficient_privilege then denied := true;
  end;
  if not denied then raise exception 'Foreign owner created stock-changing manual receipt'; end if;
end;
$foreign_actor$;

select set_config('request.jwt.claims',
  jsonb_build_object('role', 'authenticated', 'sub', current_setting('test.man_owner_a'),
                     'owner_id', current_setting('test.man_owner_a'), 'user_role', 'admin')::text, true);
do $spoofed_actor$
declare denied boolean := false;
begin
  begin
    insert into public.transactions (id, owner_id, user_id, items, status, inventory_source)
    values (gen_random_uuid()::text, current_setting('test.man_owner_a'), current_setting('test.man_cashier'),
            jsonb_build_array(jsonb_build_object('product_id', current_setting('test.man_kopder'), 'qty', 1))::text,
            'completed', 'manual');
  exception when insufficient_privilege then denied := true;
  end;
  if not denied then raise exception 'Admin forged another actor'; end if;
end;
$spoofed_actor$;

reset role;
update public.users set is_active = false where id = current_setting('test.man_owner_a');
set local role authenticated;
do $inactive$
declare denied boolean := false;
begin
  begin
    insert into public.transactions (id, owner_id, user_id, items, status, inventory_source)
    values (gen_random_uuid()::text, current_setting('test.man_owner_a'), current_setting('test.man_owner_a'),
            jsonb_build_array(jsonb_build_object('product_id', current_setting('test.man_kopder'), 'qty', 1))::text,
            'completed', 'manual');
  exception when insufficient_privilege then denied := true;
  end;
  if not denied then raise exception 'Inactive admin created stock-changing manual receipt'; end if;
end;
$inactive$;

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $anonymous$
declare denied boolean := false;
begin
  begin
    insert into public.transactions (id, owner_id, user_id, items, status, inventory_source)
    values (gen_random_uuid()::text, current_setting('test.man_owner_a'), current_setting('test.man_owner_a'),
            jsonb_build_array(jsonb_build_object('product_id', current_setting('test.man_kopder'), 'qty', 1))::text,
            'completed', 'manual');
  exception when insufficient_privilege then denied := true;
  end;
  if not denied then raise exception 'Anonymous manual receipt was accepted'; end if;
end;
$anonymous$;

reset role;
do $privileges$
begin
  if has_function_privilege('authenticated', 'public.consume_manual_supply_stock()', 'EXECUTE')
      or has_function_privilege('anon', 'public.consume_manual_supply_stock()', 'EXECUTE') then
    raise exception 'Internal manual trigger function is client-callable';
  end if;
end;
$privileges$;

rollback;
