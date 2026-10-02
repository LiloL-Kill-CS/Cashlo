-- Run after inventory-pos-consumption.sql on an isolated PostgreSQL test DB.
-- Uses only synthetic rows and ends with ROLLBACK.

begin;

do $seed$
declare
  owner_a text := gen_random_uuid()::text;
  owner_b text := gen_random_uuid()::text;
  cashier_a text := gen_random_uuid()::text;
  latte text := gen_random_uuid()::text;
  caramel text := gen_random_uuid()::text;
  unlinked text := gen_random_uuid()::text;
  foreign_menu text := gen_random_uuid()::text;
begin
  insert into public.users (id, name, username, password_hash, role, owner_id, is_active)
  values
    (owner_a, 'POS test owner A', 'pos_owner_' || replace(owner_a, '-', ''),
     '!rollback-only-no-login!', 'admin', owner_a, true),
    (owner_b, 'POS test owner B', 'pos_owner_' || replace(owner_b, '-', ''),
     '!rollback-only-no-login!', 'admin', owner_b, true),
    (cashier_a, 'POS test cashier', 'pos_cashier_' || replace(cashier_a, '-', ''),
     '!rollback-only-no-login!', 'kasir', owner_a, true);
  insert into public.products (id, name, owner_id)
  values
    (latte, 'Test latte', owner_a),
    (caramel, 'Test caramel coffee', owner_a),
    (unlinked, 'Test unlinked menu', owner_a),
    (foreign_menu, 'Foreign coffee', owner_b);
  perform set_config('test.pos_owner_a', owner_a, true);
  perform set_config('test.pos_owner_b', owner_b, true);
  perform set_config('test.pos_cashier_a', cashier_a, true);
  perform set_config('test.pos_latte', latte, true);
  perform set_config('test.pos_caramel', caramel, true);
  perform set_config('test.pos_unlinked', unlinked, true);
  perform set_config('test.pos_foreign', foreign_menu, true);
end;
$seed$;

set local role authenticated;
select set_config('request.jwt.claims',
  jsonb_build_object('role', 'authenticated', 'sub', current_setting('test.pos_owner_a'),
                     'owner_id', current_setting('test.pos_owner_a'), 'user_role', 'admin')::text,
  true);

do $catalog$
declare
  syrup public.supplies%rowtype;
  sugar public.supplies%rowtype;
begin
  select * into syrup from public.save_supply_with_menus(
    jsonb_build_object('name', 'POS test syrup ' || txid_current()::text,
                       'unit', 'ml', 'pack_size', 750, 'initial_packs', 1),
    jsonb_build_array(
      jsonb_build_object('product_id', current_setting('test.pos_latte'),
                         'quantity_per_serving', 15, 'quantity_tolerance', 3),
      jsonb_build_object('product_id', current_setting('test.pos_caramel'),
                         'quantity_per_serving', 20, 'quantity_tolerance', 2)
    )
  );
  select * into sugar from public.save_supply_with_menus(
    jsonb_build_object('name', 'POS test sugar ' || txid_current()::text,
                       'unit', 'gram', 'pack_size', 100, 'initial_packs', 1),
    jsonb_build_array(
      jsonb_build_object('product_id', current_setting('test.pos_latte'),
                         'quantity_per_serving', 5, 'quantity_tolerance', 1)
    )
  );
  perform set_config('test.pos_syrup', syrup.id, true);
  perform set_config('test.pos_sugar', sugar.id, true);
end;
$catalog$;

select set_config('request.jwt.claims',
  jsonb_build_object('role', 'authenticated', 'sub', current_setting('test.pos_cashier_a'),
                     'owner_id', current_setting('test.pos_owner_a'), 'user_role', 'kasir')::text,
  true);

do $sales$
declare
  txn_one text := gen_random_uuid()::text;
  txn_mixed text := gen_random_uuid()::text;
  txn_deferred text := gen_random_uuid()::text;
  failed boolean;
  before_syrup numeric;
  before_sugar numeric;
  before_logs integer;
begin
  perform set_config('test.pos_txn_one', txn_one, true);
  insert into public.transactions
    (id, user_id, owner_id, items, status, inventory_source)
  values
    (txn_one, current_setting('test.pos_cashier_a'), current_setting('test.pos_owner_a'),
     jsonb_build_array(jsonb_build_object('product_id', current_setting('test.pos_latte'),
                                         'qty', 1, 'name', 'Test latte'))::text,
     'completed', 'pos');
  if (select stock from public.supplies where id = current_setting('test.pos_syrup')) <> 735
      or (select stock from public.supplies where id = current_setting('test.pos_sugar')) <> 95 then
    raise exception 'One latte should change syrup 750 -> 735 and sugar 100 -> 95';
  end if;
  if (select count(*) from public.supply_stock_logs where transaction_id = txn_one) <> 2
      or (select count(*) from public.supply_stock_logs
          where transaction_id = txn_one and product_id = current_setting('test.pos_latte')
            and quantity_per_serving = 15 and quantity_tolerance = 3
            and product_name = 'Test latte' and actor_id = current_setting('test.pos_cashier_a')) <> 1 then
    raise exception 'First POS sale did not create both correct snapshot logs';
  end if;

  perform set_config('test.pos_txn_mixed', txn_mixed, true);
  insert into public.transactions
    (id, user_id, owner_id, items, status, inventory_source)
  values
    (txn_mixed, current_setting('test.pos_cashier_a'), current_setting('test.pos_owner_a'),
     jsonb_build_array(
       jsonb_build_object('product_id', current_setting('test.pos_latte'), 'qty', 2,
                          'modifiers', jsonb_build_array('less ice')),
       jsonb_build_object('product_id', current_setting('test.pos_latte'), 'qty', 1,
                          'modifiers', jsonb_build_array('oat milk')),
       jsonb_build_object('product_id', current_setting('test.pos_caramel'), 'qty', 1)
     )::text, 'completed', 'pos');
  if (select stock from public.supplies where id = current_setting('test.pos_syrup')) <> 670
      or (select stock from public.supplies where id = current_setting('test.pos_sugar')) <> 80
      or (select count(*) from public.supply_stock_logs where transaction_id = txn_mixed) <> 3
      or (select input_amount from public.supply_stock_logs
          where transaction_id = txn_mixed and supply_id = current_setting('test.pos_syrup')
            and product_id = current_setting('test.pos_latte')) <> 3 then
    raise exception 'Mixed and duplicate cart lines did not debit shared ingredients once per menu';
  end if;

  before_syrup := (select stock from public.supplies where id = current_setting('test.pos_syrup'));
  before_sugar := (select stock from public.supplies where id = current_setting('test.pos_sugar'));
  before_logs := (select count(*) from public.supply_stock_logs
                  where transaction_id is not null);

  -- An unlinked menu, a legacy sale, and a POS row completed by UPDATE do
  -- not change ingredient stock. manual_txn_count is deliberately ignored.
  insert into public.transactions (id, user_id, owner_id, items, status, inventory_source)
  values (gen_random_uuid()::text, current_setting('test.pos_cashier_a'),
          current_setting('test.pos_owner_a'),
          jsonb_build_array(jsonb_build_object('product_id', current_setting('test.pos_unlinked'),
                                               'qty', 1))::text, 'completed', 'pos');
  insert into public.transactions (id, user_id, owner_id, items, status)
  values (gen_random_uuid()::text, current_setting('test.pos_cashier_a'),
          current_setting('test.pos_owner_a'),
          jsonb_build_array(jsonb_build_object('product_id', current_setting('test.pos_latte'),
                                               'qty', 1))::text, 'completed');
  insert into public.transactions (id, user_id, owner_id, items, status, inventory_source)
  values (txn_deferred, current_setting('test.pos_cashier_a'),
          current_setting('test.pos_owner_a'),
          jsonb_build_array(jsonb_build_object('product_id', current_setting('test.pos_latte'),
                                               'qty', 1))::text, 'voided', 'pos');
  update public.transactions set status = 'completed' where id = txn_deferred;
  if (select stock from public.supplies where id = current_setting('test.pos_syrup')) <> before_syrup
      or (select stock from public.supplies where id = current_setting('test.pos_sugar')) <> before_sugar
      or (select count(*) from public.supply_stock_logs where transaction_id is not null) <> before_logs then
    raise exception 'Unlinked, legacy, or status-updated row changed ingredient stock';
  end if;

  -- A late stock shortage rejects the whole payment row and all stock/log
  -- writes, even when the cart also touches another supply.
  failed := false;
  begin
    insert into public.transactions (id, user_id, owner_id, items, status, inventory_source)
    values ('pos-fail-' || txid_current()::text, current_setting('test.pos_cashier_a'),
            current_setting('test.pos_owner_a'),
            jsonb_build_array(jsonb_build_object('product_id', current_setting('test.pos_latte'),
                                                'qty', 100))::text,
            'completed', 'pos');
  exception when check_violation then failed := true;
  end;
  if not failed or exists (select 1 from public.transactions
                           where id = 'pos-fail-' || txid_current()::text)
      or (select stock from public.supplies where id = current_setting('test.pos_syrup')) <> before_syrup
      or (select stock from public.supplies where id = current_setting('test.pos_sugar')) <> before_sugar
      or (select count(*) from public.supply_stock_logs where transaction_id is not null) <> before_logs then
    raise exception 'Insufficient stock left a payment row, stock change, or log';
  end if;

  -- A retry with the original receipt ID cannot fire an AFTER INSERT trigger.
  insert into public.transactions (id, user_id, owner_id, items, status, inventory_source)
  values (txn_one, current_setting('test.pos_cashier_a'), current_setting('test.pos_owner_a'),
          jsonb_build_array(jsonb_build_object('product_id', current_setting('test.pos_latte'),
                                               'qty', 1))::text, 'completed', 'pos')
  on conflict (id) do nothing;
  if (select stock from public.supplies where id = current_setting('test.pos_syrup')) <> before_syrup
      or (select count(*) from public.supply_stock_logs where transaction_id = txn_one) <> 2 then
    raise exception 'Retry consumed ingredients a second time';
  end if;

  failed := false;
  begin
    perform public.consume_supply_menu(current_setting('test.pos_syrup'),
                                       current_setting('test.pos_latte'), 1, 'cashier direct');
  exception when insufficient_privilege then failed := true;
  end;
  if not failed then raise exception 'Cashier could call admin-only direct consumption'; end if;

  failed := false;
  begin
    insert into public.transactions (id, user_id, owner_id, items, status, inventory_source)
    values (gen_random_uuid()::text, current_setting('test.pos_owner_a'),
            current_setting('test.pos_owner_a'),
            jsonb_build_array(jsonb_build_object('product_id', current_setting('test.pos_latte'),
                                                 'qty', 1))::text, 'completed', 'pos');
  exception when insufficient_privilege then failed := true;
  end;
  if not failed then raise exception 'Cashier signed a sale for another actor'; end if;

  failed := false;
  begin
    insert into public.transactions (id, user_id, owner_id, items, status, inventory_source)
    values (gen_random_uuid()::text, current_setting('test.pos_cashier_a'),
            current_setting('test.pos_owner_a'),
            jsonb_build_array(jsonb_build_object('product_id', current_setting('test.pos_foreign'),
                                                 'qty', 1))::text, 'completed', 'pos');
  exception when foreign_key_violation then failed := true;
  end;
  if not failed then raise exception 'Foreign menu product was accepted'; end if;

  failed := false;
  begin
    insert into public.transactions (id, user_id, owner_id, items, status, inventory_source)
    values (gen_random_uuid()::text, current_setting('test.pos_cashier_a'),
            current_setting('test.pos_owner_b'),
            jsonb_build_array(jsonb_build_object('product_id', current_setting('test.pos_latte'),
                                                 'qty', 1))::text, 'completed', 'pos');
  exception when insufficient_privilege then failed := true;
  end;
  if not failed then raise exception 'Foreign owner transaction was accepted'; end if;

  failed := false;
  begin
    insert into public.transactions (id, user_id, owner_id, items, status, inventory_source)
    values (gen_random_uuid()::text, current_setting('test.pos_cashier_a'),
            current_setting('test.pos_owner_a'), 'not-json', 'completed', 'pos');
  exception when invalid_parameter_value then failed := true;
  end;
  if not failed then raise exception 'Malformed cart was accepted'; end if;

  failed := false;
  begin
    insert into public.transactions (id, user_id, owner_id, items, status, inventory_source)
    values (gen_random_uuid()::text, current_setting('test.pos_cashier_a'),
            current_setting('test.pos_owner_a'),
            jsonb_build_array(jsonb_build_object('product_id', current_setting('test.pos_latte'),
                                                 'qty', 0.5))::text, 'completed', 'pos');
  exception when invalid_parameter_value then failed := true;
  end;
  if not failed then raise exception 'Fractional cart quantity was accepted'; end if;
  if (select stock from public.supplies where id = current_setting('test.pos_syrup')) <> before_syrup
      or (select stock from public.supplies where id = current_setting('test.pos_sugar')) <> before_sugar
      or (select count(*) from public.supply_stock_logs where transaction_id is not null) <> before_logs then
    raise exception 'Rejected sale altered ingredient stock or logs';
  end if;

  update public.transactions set status = 'voided' where id = txn_one;
  if (select stock from public.supplies where id = current_setting('test.pos_syrup')) <> before_syrup then
    raise exception 'Voiding a receipt unexpectedly restored ingredients';
  end if;
  delete from public.transactions where id = txn_one;
  if (select count(*) from public.supply_stock_logs
      where transaction_id = txn_one and product_name = 'Test latte') <> 2
      or (select stock from public.supplies where id = current_setting('test.pos_syrup')) <> before_syrup then
    raise exception 'Receipt deletion removed ingredient history or changed stock';
  end if;
end;
$sales$;

reset role;
update public.users set is_active = false where id = current_setting('test.pos_cashier_a');
set local role authenticated;

do $inactive$
declare
  denied boolean := false;
begin
  begin
    insert into public.transactions (id, user_id, owner_id, items, status, inventory_source)
    values (gen_random_uuid()::text, current_setting('test.pos_cashier_a'),
            current_setting('test.pos_owner_a'),
            jsonb_build_array(jsonb_build_object('product_id', current_setting('test.pos_latte'),
                                                 'qty', 1))::text, 'completed', 'pos');
  exception when insufficient_privilege then denied := true;
  end;
  if not denied then raise exception 'Inactive cashier created a POS sale'; end if;
end;
$inactive$;

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

do $anonymous$
declare
  denied boolean := false;
begin
  begin
    insert into public.transactions (id, user_id, owner_id, items, status, inventory_source)
    values (gen_random_uuid()::text, current_setting('test.pos_cashier_a'),
            current_setting('test.pos_owner_a'),
            jsonb_build_array(jsonb_build_object('product_id', current_setting('test.pos_latte'),
                                                 'qty', 1))::text, 'completed', 'pos');
  exception when insufficient_privilege then denied := true;
  end;
  if not denied then raise exception 'Anonymous POS sale was accepted'; end if;
end;
$anonymous$;

rollback;
