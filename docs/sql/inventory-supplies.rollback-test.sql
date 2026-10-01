-- Run only after inventory-supplies.sql has been applied to a test database.
-- All synthetic rows and claim changes are rolled back, even after success.
-- A SQL runner must permit SET ROLE authenticated/anon (for example postgres).

begin;

-- supplies.owner_id references users(id). Create valid, isolated businesses
-- before adopting a client role; a self-reference satisfies the owner FK.
do $actors$
declare
  owner_a text := gen_random_uuid()::text;
  owner_b text := gen_random_uuid()::text;
begin
  insert into public.users (id, name, username, password_hash, role, owner_id)
  values
    (owner_a, 'Synthetic stock owner A', 'stock_test_' || replace(owner_a, '-', ''),
     '!rollback-only-no-login!', 'admin', owner_a),
    (owner_b, 'Synthetic stock owner B', 'stock_test_' || replace(owner_b, '-', ''),
     '!rollback-only-no-login!', 'admin', owner_b);
  perform set_config('test.owner_a', owner_a, true);
  perform set_config('test.owner_b', owner_b, true);
end;
$actors$;

set local role authenticated;

select set_config('request.jwt.claims',
  jsonb_build_object('role', 'authenticated', 'sub', current_setting('test.owner_a'),
                     'owner_id', current_setting('test.owner_a'), 'user_role', 'admin')::text, true);

do $test$
declare
  s public.supplies%rowtype;
  before_logs integer;
  failed boolean;
begin
  select * into s from public.create_supply(jsonb_build_object(
    'name', 'Syrup integration test ' || txid_current()::text,
    'unit', 'ml',
    'pack_size', 750,
    'servings_per_pack', 50,
    'usage_label', 'coffee',
    'min_stock_level', 150,
    'initial_packs', 1
  ));
  if s.stock <> 750 or s.pack_size <> 750 or s.servings_per_pack <> 50 then
    raise exception 'Creation or initial stock failed';
  end if;
  perform set_config('test.supply_id', s.id, true);

  select * into s from public.adjust_supply_stock(s.id, 'consume', 30, '30 coffees');
  if s.stock <> 300 then
    raise exception '750 ml / 50 coffees * 30 should leave 300 ml, got %', s.stock;
  end if;

  select * into s from public.adjust_supply_stock(s.id, 'restock', 1, 'new bottle');
  if s.stock <> 1050 then
    raise exception 'Restocking saved item failed';
  end if;
  select * into s from public.adjust_supply_stock(s.id, 'consume_quantity', 50, 'spill');
  if s.stock <> 1000 then
    raise exception 'Base-unit consumption failed';
  end if;
  select * into s from public.adjust_supply_stock(s.id, 'adjust', 0, 'counted empty');
  if s.stock <> 0 then
    raise exception 'Absolute adjustment to zero failed';
  end if;
  select * into s from public.adjust_supply_stock(s.id, 'restock', 1, 'reuse catalog item');
  if s.stock <> 750 then
    raise exception 'Empty item could not be reused';
  end if;

  select count(*) into before_logs from public.supply_stock_logs where supply_id = s.id;
  if before_logs <> 6 then
    raise exception 'Expected initial + five stock changes, got % logs', before_logs;
  end if;
  if exists (
    select 1 from public.supply_stock_logs where supply_id = s.id
      and (stock_after <> stock_before + change_amount
           or owner_id <> current_setting('test.owner_a')
           or actor_id <> current_setting('test.owner_a')
           or supply_name <> s.name or unit <> 'ml')
  ) then
    raise exception 'Log snapshot or balance is inconsistent';
  end if;

  failed := false;
  begin
    perform public.adjust_supply_stock(s.id, 'consume', 51, 'overspend');
  exception when check_violation then
    failed := true;
  end;
  if not failed then
    raise exception 'Overspending stock was accepted';
  end if;
  if (select stock from public.supplies where id = s.id) <> 750
      or (select count(*) from public.supply_stock_logs where supply_id = s.id) <> before_logs then
    raise exception 'Failed overspend changed stock or log';
  end if;

  failed := false;
  begin
    update public.supplies set stock = 700 where id = s.id;
  exception when invalid_parameter_value then
    failed := true;
  end;
  if not failed then
    raise exception 'Direct stock update bypassed the ledger';
  end if;

  failed := false;
  begin
    update public.supplies set unit = 'gram' where id = s.id;
  exception when invalid_parameter_value then
    failed := true;
  end;
  if not failed then
    raise exception 'Unit changed while stock was nonzero';
  end if;

  failed := false;
  begin
    perform public.adjust_supply_stock(s.id, 'restock', 0.5, 'fractional pack');
  exception when invalid_parameter_value then
    failed := true;
  end;
  if not failed then
    raise exception 'Fractional pack was accepted';
  end if;

  failed := false;
  begin
    perform public.adjust_supply_stock(s.id, 'consume_quantity', 0.0000001, 'too precise');
  exception when invalid_parameter_value then
    failed := true;
  end;
  if not failed then
    raise exception 'Excess precision was accepted';
  end if;

  failed := false;
  begin
    perform public.adjust_supply_stock(s.id, 'restock', 'NaN'::numeric, 'invalid numeric');
  exception when invalid_parameter_value then
    failed := true;
  end;
  if not failed then
    raise exception 'NaN stock amount was accepted';
  end if;

  failed := false;
  begin
    perform public.adjust_supply_stock(s.id, 'consume_quantity', -1, 'negative quantity');
  exception when invalid_parameter_value then
    failed := true;
  end;
  if not failed then
    raise exception 'Negative stock amount was accepted';
  end if;

  failed := false;
  begin
    perform public.create_supply(jsonb_build_object(
      'name', 'Invalid pack ' || txid_current()::text,
      'unit', 'ml', 'pack_size', 0.1234567, 'initial_packs', 1));
  exception when invalid_parameter_value then
    failed := true;
  end;
  if not failed then
    raise exception 'Excess pack precision was accepted';
  end if;

  failed := false;
  begin
    perform public.create_supply(jsonb_build_object(
      'name', s.name, 'unit', 'ml', 'pack_size', 750, 'initial_packs', 1));
  exception when unique_violation then
    failed := true;
  end;
  if not failed then
    raise exception 'Duplicate catalog creation was accepted';
  end if;

  select * into s from public.adjust_supply_stock(s.id, 'consume_quantity', 0.25, 'decimal quantity');
  if s.stock <> 749.75 then
    raise exception 'Decimal base-unit consumption failed';
  end if;
  select * into s from public.adjust_supply_stock(s.id, 'adjust', 750, 'restore after count');
  if s.stock <> 750 or
      (select count(*) from public.supply_stock_logs where supply_id = s.id) <> before_logs + 2 then
    raise exception 'Decimal quantity log or balance failed';
  end if;
end;
$test$;

select set_config('request.jwt.claims',
  jsonb_build_object('role', 'authenticated', 'sub', current_setting('test.owner_b'),
                     'owner_id', current_setting('test.owner_b'), 'user_role', 'admin')::text, true);

do $ownership$
declare
  failed boolean := false;
begin
  if exists (select 1 from public.supplies where id = current_setting('test.supply_id'))
      or exists (select 1 from public.supply_stock_logs where supply_id = current_setting('test.supply_id')) then
    raise exception 'Another owner can read the supply or its log';
  end if;
  begin
    perform public.adjust_supply_stock(current_setting('test.supply_id'), 'restock', 1, 'foreign stock');
  exception when no_data_found then
    failed := true;
  end;
  if not failed then
    raise exception 'Another owner changed the stock';
  end if;
end;
$ownership$;

select set_config('request.jwt.claims',
  jsonb_build_object('role', 'authenticated', 'sub', current_setting('test.owner_a'),
                     'owner_id', current_setting('test.owner_a'), 'user_role', 'kasir')::text, true);

do $cashier$
declare
  failed boolean := false;
begin
  begin
    perform public.adjust_supply_stock(current_setting('test.supply_id'), 'restock', 1, 'cashier');
  exception when insufficient_privilege then
    failed := true;
  end;
  if not failed then
    raise exception 'Cashier changed stock';
  end if;
  failed := false;
  begin
    insert into public.supplies (owner_id, name, unit, stock)
    values (current_setting('test.owner_a'), 'Unauthorized cashier item', 'pcs', 0);
  exception when insufficient_privilege then
    failed := true;
  end;
  if not failed then
    raise exception 'Cashier created a catalog item';
  end if;
end;
$cashier$;

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

do $anonymous$
declare
  failed boolean := false;
begin
  begin
    perform public.adjust_supply_stock(current_setting('test.supply_id'), 'restock', 1, 'anonymous');
  exception when insufficient_privilege then
    failed := true;
  end;
  if not failed then
    raise exception 'Anonymous stock change was accepted';
  end if;
end;
$anonymous$;

rollback;

-- Concurrency check in two separate SQL sessions, if a test database is available:
-- Session A: BEGIN; SELECT * FROM public.adjust_supply_stock(...); keep open.
-- Session B: same supply_id; the call waits for A's FOR UPDATE row lock.
-- Commit A, then B observes A's new stock and either applies its change or
-- raises insufficient stock. Neither call can overwrite the other's balance.
