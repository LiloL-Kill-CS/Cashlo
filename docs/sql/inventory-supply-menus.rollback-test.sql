-- Run after inventory-supply-menus.sql on an isolated PostgreSQL test database.
-- Every synthetic user, product, supply, and log is rolled back.

begin;

do $seed$
declare
  owner_a text := gen_random_uuid()::text;
  owner_b text := gen_random_uuid()::text;
  menu_a text := gen_random_uuid()::text;
  menu_b text := gen_random_uuid()::text;
  menu_foreign text := gen_random_uuid()::text;
begin
  insert into public.users (id, name, username, password_hash, role, owner_id)
  values
    (owner_a, 'Multi menu test owner A', 'menu_test_' || replace(owner_a, '-', ''),
     '!rollback-only-no-login!', 'admin', owner_a),
    (owner_b, 'Multi menu test owner B', 'menu_test_' || replace(owner_b, '-', ''),
     '!rollback-only-no-login!', 'admin', owner_b);
  insert into public.products (id, name, owner_id)
  values
    (menu_a, 'Coffee A original', owner_a),
    (menu_b, 'Coffee B original', owner_a),
    (menu_foreign, 'Other business coffee', owner_b);
  perform set_config('test.menu_owner_a', owner_a, true);
  perform set_config('test.menu_owner_b', owner_b, true);
  perform set_config('test.menu_a', menu_a, true);
  perform set_config('test.menu_b', menu_b, true);
  perform set_config('test.menu_foreign', menu_foreign, true);
end;
$seed$;

set local role authenticated;
select set_config('request.jwt.claims',
  jsonb_build_object('role', 'authenticated', 'sub', current_setting('test.menu_owner_a'),
                     'owner_id', current_setting('test.menu_owner_a'), 'user_role', 'admin')::text,
  true);

do $exercise$
declare
  s public.supplies%rowtype;
  original_name text;
  failed boolean;
  invalid_name text := 'Invalid menu save ' || txid_current()::text;
begin
  select * into s from public.save_supply_with_menus(
    jsonb_build_object('name', 'Shared syrup ' || txid_current()::text,
                       'unit', 'ml', 'pack_size', 750, 'initial_packs', 1),
    jsonb_build_array(
      jsonb_build_object('product_id', current_setting('test.menu_a'), 'quantity_per_serving', 15,
                         'quantity_tolerance', 3),
      jsonb_build_object('product_id', current_setting('test.menu_b'), 'quantity_per_serving', 10,
                         'quantity_tolerance', 2)
    )
  );
  original_name := s.name;
  perform set_config('test.menu_supply', s.id, true);
  if s.stock <> 750 or
      (select count(*) from public.supply_menu_links where supply_id = s.id) <> 2 or
      (select count(*) from public.supply_stock_logs where supply_id = s.id) <> 1 or
      (select quantity_tolerance from public.supply_menu_links
        where supply_id = s.id and product_id = current_setting('test.menu_a')) <> 3 then
    raise exception 'Atomic creation, links, or initial stock log failed';
  end if;
  failed := false;
  begin
    update public.supply_menu_links set quantity_per_serving = 1
      where supply_id = s.id and product_id = current_setting('test.menu_a');
  exception when insufficient_privilege then failed := true;
  end;
  if not failed then raise exception 'Direct menu-link mutation was accepted'; end if;

  select * into s from public.consume_supply_menu(s.id, current_setting('test.menu_a'), 10, 'ten A coffees');
  if s.stock <> 600 then
    raise exception 'Coffee A should debit 150 ml; got %', s.stock;
  end if;
  select * into s from public.consume_supply_menu(s.id, current_setting('test.menu_b'), 20, 'twenty B coffees');
  if s.stock <> 400 then
    raise exception 'Coffee B should debit 200 ml from the same syrup; got %', s.stock;
  end if;

  select * into s from public.save_supply_with_menus(
    jsonb_build_object('id', s.id, 'name', s.name, 'unit', 'ml', 'pack_size', 750),
    jsonb_build_array(
      jsonb_build_object('product_id', current_setting('test.menu_a'), 'quantity_per_serving', 20,
                         'quantity_tolerance', 1),
      jsonb_build_object('product_id', current_setting('test.menu_b'), 'quantity_per_serving', 5)
    )
  );
  if s.stock <> 400 or
      (select count(*) from public.supply_menu_links where supply_id = s.id) <> 2 or
      (select count(*) from public.supply_stock_logs where supply_id = s.id) <> 3 or
      (select quantity_per_serving from public.supply_menu_links
        where supply_id = s.id and product_id = current_setting('test.menu_a')) <> 20 or
      (select quantity_tolerance from public.supply_menu_links
        where supply_id = s.id and product_id = current_setting('test.menu_a')) <> 1 or
      (select quantity_tolerance from public.supply_menu_links
        where supply_id = s.id and product_id = current_setting('test.menu_b')) <> 0 then
    raise exception 'Editing menu doses changed stock or history';
  end if;

  select * into s from public.consume_supply_menu(s.id, current_setting('test.menu_a'), 5, 'new A dose');
  if s.stock <> 300 then
    raise exception 'Edited dose was not used for subsequent consumption';
  end if;
  if exists (
    select 1 from public.supply_stock_logs where supply_id = s.id
      and (stock_after <> stock_before + change_amount
           or owner_id <> current_setting('test.menu_owner_a'))
  ) or (select count(*) from public.supply_stock_logs where supply_id = s.id) <> 4 then
    raise exception 'Menu consumption log balance or owner is invalid';
  end if;
  if (select count(*) from public.supply_stock_logs
      where supply_id = s.id and action = 'consume' and product_id is not null
        and product_name is not null and input_amount > 0) <> 3 then
    raise exception 'Menu log is missing product identity or portion count';
  end if;
  if (select count(*) from public.supply_stock_logs
      where supply_id = s.id and product_id = current_setting('test.menu_a')
        and quantity_per_serving = 15 and quantity_tolerance = 3) <> 1 or
     (select count(*) from public.supply_stock_logs
      where supply_id = s.id and product_id = current_setting('test.menu_a')
        and quantity_per_serving = 20 and quantity_tolerance = 1) <> 1 then
    raise exception 'Historical dose or tolerance snapshots were not retained';
  end if;

  failed := false;
  begin
    perform public.save_supply_with_menus(
      jsonb_build_object('id', s.id, 'name', 'Should not replace name'),
      jsonb_build_array(
        jsonb_build_object('product_id', current_setting('test.menu_a'), 'quantity_per_serving', 1),
        jsonb_build_object('product_id', current_setting('test.menu_a'), 'quantity_per_serving', 2)
      )
    );
  exception when unique_violation then failed := true;
  end;
  if not failed or (select name from public.supplies where id = s.id) <> original_name
      or (select count(*) from public.supply_menu_links where supply_id = s.id) <> 2 then
    raise exception 'Duplicate menu did not roll back the whole save';
  end if;

  failed := false;
  begin
    perform public.save_supply_with_menus(
      jsonb_build_object('id', s.id, 'name', 'Foreign menu should roll back'),
      jsonb_build_array(
        jsonb_build_object('product_id', current_setting('test.menu_foreign'), 'quantity_per_serving', 3)
      )
    );
  exception when foreign_key_violation then failed := true;
  end;
  if not failed or (select name from public.supplies where id = s.id) <> original_name
      or (select quantity_per_serving from public.supply_menu_links
          where supply_id = s.id and product_id = current_setting('test.menu_a')) <> 20 then
    raise exception 'Foreign menu changed metadata or links';
  end if;

  failed := false;
  begin
    perform public.save_supply_with_menus(
      jsonb_build_object('name', invalid_name, 'unit', 'ml', 'pack_size', 750, 'initial_packs', 1),
      jsonb_build_array(
        jsonb_build_object('product_id', current_setting('test.menu_foreign'), 'quantity_per_serving', 3)
      )
    );
  exception when foreign_key_violation then failed := true;
  end;
  if not failed or exists (select 1 from public.supplies where name = invalid_name)
      or exists (select 1 from public.supply_stock_logs where supply_name = invalid_name) then
    raise exception 'Invalid menu left behind a newly created supply or log';
  end if;

  failed := false;
  begin
    perform public.save_supply_with_menus(
      jsonb_build_object('id', s.id),
      jsonb_build_array(
        jsonb_build_object('product_id', current_setting('test.menu_a'),
                           'quantity_per_serving', 0.0000001)
      )
    );
  exception when invalid_parameter_value then failed := true;
  end;
  if not failed then raise exception 'Overprecise menu dose was accepted'; end if;

  failed := false;
  begin
    perform public.save_supply_with_menus(
      jsonb_build_object('id', s.id),
      jsonb_build_array(jsonb_build_object(
        'product_id', current_setting('test.menu_a'),
        'quantity_per_serving', 15, 'quantity_tolerance', 15))
    );
  exception when invalid_parameter_value then failed := true;
  end;
  if not failed then raise exception 'Tolerance equal to dose was accepted'; end if;

  failed := false;
  begin
    perform public.save_supply_with_menus(
      jsonb_build_object('id', s.id),
      jsonb_build_array(jsonb_build_object(
        'product_id', current_setting('test.menu_a'),
        'quantity_per_serving', 15, 'quantity_tolerance', -1))
    );
  exception when invalid_parameter_value then failed := true;
  end;
  if not failed then raise exception 'Negative tolerance was accepted'; end if;

  failed := false;
  begin
    perform public.save_supply_with_menus(
      jsonb_build_object('id', s.id),
      jsonb_build_array(jsonb_build_object(
        'product_id', current_setting('test.menu_a'),
        'quantity_per_serving', 15, 'quantity_tolerance', 0.0000001))
    );
  exception when invalid_parameter_value then failed := true;
  end;
  if not failed then raise exception 'Overprecise tolerance was accepted'; end if;
  if (select stock from public.supplies where id = s.id) <> 300 or
      (select count(*) from public.supply_menu_links where supply_id = s.id) <> 2 or
      (select quantity_tolerance from public.supply_menu_links
        where supply_id = s.id and product_id = current_setting('test.menu_a')) <> 1 then
    raise exception 'Rejected tolerance changed stock or saved links';
  end if;

  failed := false;
  begin
    perform public.consume_supply_menu(s.id, current_setting('test.menu_a'), 0.5, 'fractional portions');
  exception when invalid_parameter_value then failed := true;
  end;
  if not failed then raise exception 'Fractional portions were accepted'; end if;

  failed := false;
  begin
    perform public.consume_supply_menu(s.id, current_setting('test.menu_a'), 16, 'overspend');
  exception when check_violation then failed := true;
  end;
  if not failed or (select stock from public.supplies where id = s.id) <> 300
      or (select count(*) from public.supply_stock_logs where supply_id = s.id) <> 4 then
    raise exception 'Overspend altered the stock or log';
  end if;

  update public.products set name = 'Coffee A renamed' where id = current_setting('test.menu_a');
  if (select count(*) from public.supply_stock_logs
      where supply_id = s.id and product_id = current_setting('test.menu_a')
        and product_name = 'Coffee A original'
        and quantity_per_serving in (15, 20)
        and quantity_tolerance in (3, 1)) <> 2 then
    raise exception 'Renaming a menu rewrote historical name snapshots';
  end if;
  delete from public.products where id = current_setting('test.menu_a');
  if (select count(*) from public.supply_stock_logs
      where supply_id = s.id and product_id is null
        and product_name = 'Coffee A original'
        and quantity_per_serving in (15, 20)
        and quantity_tolerance in (3, 1)) <> 2
      or (select count(*) from public.supply_menu_links where supply_id = s.id) <> 1 then
    raise exception 'Deleting a menu did not preserve log snapshots and cascade its link';
  end if;
end;
$exercise$;

select set_config('request.jwt.claims',
  jsonb_build_object('role', 'authenticated', 'sub', current_setting('test.menu_owner_b'),
                     'owner_id', current_setting('test.menu_owner_b'), 'user_role', 'admin')::text,
  true);

do $foreign_owner$
declare
  failed boolean := false;
begin
  if exists (select 1 from public.supply_menu_links
      where supply_id = current_setting('test.menu_supply')) then
    raise exception 'Another owner can read menu links';
  end if;
  begin
    perform public.consume_supply_menu(current_setting('test.menu_supply'),
                                       current_setting('test.menu_b'), 1, 'foreign owner');
  exception when no_data_found then failed := true;
  end;
  if not failed then raise exception 'Another owner consumed supply stock'; end if;
  failed := false;
  begin
    perform public.save_supply_with_menus(
      jsonb_build_object('id', current_setting('test.menu_supply')),
      '[]'::jsonb);
  exception when no_data_found then failed := true;
  end;
  if not failed then raise exception 'Another owner changed menu links'; end if;
end;
$foreign_owner$;

select set_config('request.jwt.claims',
  jsonb_build_object('role', 'authenticated', 'sub', current_setting('test.menu_owner_a'),
                     'owner_id', current_setting('test.menu_owner_a'), 'user_role', 'kasir')::text,
  true);

do $cashier$
declare
  denied boolean := false;
begin
  begin
    perform public.consume_supply_menu(current_setting('test.menu_supply'),
                                       current_setting('test.menu_b'), 1, 'cashier');
  exception when insufficient_privilege then denied := true;
  end;
  if not denied then raise exception 'Cashier consumed supply'; end if;
  denied := false;
  begin
    perform public.save_supply_with_menus(
      jsonb_build_object('id', current_setting('test.menu_supply')),
      '[]'::jsonb);
  exception when insufficient_privilege then denied := true;
  end;
  if not denied then raise exception 'Cashier changed menu links'; end if;
end;
$cashier$;

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

do $anonymous$
declare
  denied boolean := false;
begin
  begin
    perform public.consume_supply_menu(current_setting('test.menu_supply'),
                                       current_setting('test.menu_b'), 1, 'anon');
  exception when insufficient_privilege then denied := true;
  end;
  if not denied then raise exception 'Anonymous consumption was accepted'; end if;
  denied := false;
  begin
    perform public.save_supply_with_menus(
      jsonb_build_object('id', current_setting('test.menu_supply')),
      '[]'::jsonb);
  exception when insufficient_privilege then denied := true;
  end;
  if not denied then raise exception 'Anonymous save was accepted'; end if;
end;
$anonymous$;

rollback;
