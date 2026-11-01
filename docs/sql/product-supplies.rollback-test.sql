-- Run after save_product_with_supplies migration. Synthetic rows are rolled back.
begin;

do $seed$
declare
  v_owner text := gen_random_uuid()::text;
  v_other text := gen_random_uuid()::text;
begin
  insert into public.users (id,name,username,password_hash,role,owner_id,is_active)
  values (v_owner,'Recipe test owner','recipe_' || replace(v_owner,'-',''),'!test!','admin',v_owner,true),
         (v_other,'Recipe test other','recipe_' || replace(v_other,'-',''),'!test!','admin',v_other,true);
  perform set_config('test.product_owner',v_owner,true);
  perform set_config('test.product_other',v_other,true);
  perform set_config('test.product_butter',gen_random_uuid()::text,true);
  perform set_config('test.product_vanila',gen_random_uuid()::text,true);
end;
$seed$;

set local role authenticated;
select set_config('request.jwt.claims',
  jsonb_build_object('role','authenticated','sub',current_setting('test.product_owner'),
    'owner_id',current_setting('test.product_owner'),'user_role','admin')::text,true);

do $exercise$
declare
  v_syrup public.supplies%rowtype;
  v_milk public.supplies%rowtype;
  v_product public.products%rowtype;
  v_before timestamptz;
  v_failed boolean;
begin
  select * into v_syrup from public.create_supply(jsonb_build_object(
    'name','Recipe syrup ' || txid_current()::text,'unit','ml','pack_size',750,'initial_packs',1));
  select * into v_milk from public.create_supply(jsonb_build_object(
    'name','Recipe milk ' || txid_current()::text,'unit','ml','pack_size',500,'initial_packs',1));
  perform set_config('test.product_syrup',v_syrup.id,true);
  perform set_config('test.product_milk',v_milk.id,true);
  insert into public.products (id,name,owner_id,category,sell_price,cost_price,modifiers)
  values (current_setting('test.product_vanila'),'Vanila',current_setting('test.product_owner'),
          'coffee',22000,7000,'[]');
  select updated_at into v_before from public.products where id=current_setting('test.product_vanila');
  select * into v_product from public.save_product_with_supplies(
    jsonb_build_object('id',current_setting('test.product_butter'), 'name','Butter Coffee',
      'category','coffee','sell_price',25000,'cost_price',8000,
      'modifiers',jsonb_build_array(jsonb_build_object('name','Extra shot','price',4000,'cost',1000))),
    jsonb_build_array(
      jsonb_build_object('supply_id',v_syrup.id,'quantity_per_serving',15,'quantity_tolerance',3),
      jsonb_build_object('supply_id',v_milk.id,'quantity_per_serving',50,'quantity_tolerance',5)));
  if v_product.owner_id <> current_setting('test.product_owner')
      or (select count(*) from public.supply_menu_links where product_id=v_product.id) <> 2 then
    raise exception 'New product and its two ingredients were not saved together';
  end if;
  perform public.save_product_with_supplies(
    jsonb_build_object('id',current_setting('test.product_vanila')),
    jsonb_build_array(jsonb_build_object('supply_id',v_syrup.id,
      'quantity_per_serving',20,'quantity_tolerance',2)));
  if (select updated_at from public.products where id=current_setting('test.product_vanila'))
       is distinct from v_before
      or (select sell_price from public.products where id=current_setting('test.product_vanila')) <> 22000
      or (select quantity_per_serving from public.supply_menu_links
          where product_id=current_setting('test.product_vanila')) <> 20 then
    raise exception 'Recipe-only repair changed existing product metadata';
  end if;
  perform public.save_product_with_supplies(jsonb_build_object('id',v_product.id),null);
  if (select count(*) from public.supply_menu_links where product_id=v_product.id) <> 2 then
    raise exception 'Null recipe should preserve existing ingredients';
  end if;
  v_failed := false;
  begin
    perform public.save_product_with_supplies(
      jsonb_build_object('id',v_product.id,'name','Corrupted'),
      jsonb_build_array(
        jsonb_build_object('supply_id',v_syrup.id,'quantity_per_serving',15),
        jsonb_build_object('supply_id',v_syrup.id,'quantity_per_serving',20)));
  exception when unique_violation then v_failed := true;
  end;
  if not v_failed or (select name from public.products where id=v_product.id) <> 'Butter Coffee' then
    raise exception 'Duplicate ingredient did not roll back product metadata';
  end if;
  perform public.save_product_with_supplies(jsonb_build_object('id',v_product.id),
    jsonb_build_array(jsonb_build_object('supply_id',v_syrup.id,'quantity_per_serving',25)));
  if (select count(*) from public.supply_menu_links where product_id=v_product.id) <> 1
      or (select count(*) from public.supply_menu_links
          where product_id=current_setting('test.product_vanila')) <> 1
      or (select stock from public.supplies where id=v_syrup.id) <> 750
      or (select stock from public.supplies where id=v_milk.id) <> 500
      or (select count(*) from public.supply_stock_logs
          where supply_id in (v_syrup.id,v_milk.id)) <> 2 then
    raise exception 'Replacing one recipe changed other links, balances, or history';
  end if;
end;
$exercise$;

select set_config('request.jwt.claims',
  jsonb_build_object('role','authenticated','sub',current_setting('test.product_other'),
    'owner_id',current_setting('test.product_other'),'user_role','admin')::text,true);
do $foreign$
declare v_failed boolean := false;
begin
  begin
    perform public.save_product_with_supplies(
      jsonb_build_object('id',current_setting('test.product_butter'),'name','Stolen'),null);
  exception when insufficient_privilege then v_failed := true;
  end;
  if not v_failed then raise exception 'Foreign owner changed another product'; end if;
end;
$foreign$;

rollback;
