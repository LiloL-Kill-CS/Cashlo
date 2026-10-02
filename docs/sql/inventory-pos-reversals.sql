-- Return the exact ingredient quantities consumed by a POS receipt when it is
-- canceled or deleted. Requires inventory-pos-consumption.sql. Existing rows
-- are not backfilled or refunded by this migration.

begin;

alter table public.supply_stock_logs
  add column if not exists reversal_of_log_id uuid;

do $constraint$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.supply_stock_logs'::regclass
      and conname = 'supply_stock_logs_reversal_of_log_id_fkey'
  ) then
    alter table public.supply_stock_logs
      add constraint supply_stock_logs_reversal_of_log_id_fkey
      foreign key (reversal_of_log_id) references public.supply_stock_logs(id)
      on delete restrict;
  end if;
end;
$constraint$;

create unique index if not exists supply_stock_logs_one_reversal_idx
  on public.supply_stock_logs (reversal_of_log_id)
  where reversal_of_log_id is not null;

alter table public.supply_stock_logs
  drop constraint if exists supply_stock_logs_action_check;
alter table public.supply_stock_logs
  add constraint supply_stock_logs_action_check
  check (action in ('initial', 'restock', 'consume', 'consume_quantity', 'adjust', 'reversal'));

-- A reversal keeps the receipt reference, but only original consumption may
-- participate in the once-per-receipt uniqueness check.
drop index if exists public.supply_stock_logs_pos_once_idx;
create unique index supply_stock_logs_pos_once_idx
  on public.supply_stock_logs (transaction_id, supply_id, product_id)
  where transaction_id is not null and action = 'consume';

create or replace function public.reverse_pos_supply_stock()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_owner text := auth.jwt() ->> 'owner_id';
  v_actor text := auth.jwt() ->> 'sub';
  v_role text := auth.jwt() ->> 'user_role';
  v_user_owner text;
  v_user_role text;
  v_user_active boolean;
  v_has_consumption boolean;
  v_has_reversal boolean;
  v_supply public.supplies%rowtype;
  v_original public.supply_stock_logs%rowtype;
  v_running numeric;
  v_credit numeric;
  v_old_unit text;
  v_current_unit text;
begin
  select exists (
    select 1 from public.supply_stock_logs l
    where l.transaction_id = old.id and l.owner_id = old.owner_id
      and l.action = 'consume'
  ) into v_has_consumption;

  if tg_op = 'UPDATE' then
    if v_has_consumption and (
        new.id is distinct from old.id
        or new.owner_id is distinct from old.owner_id
        or new.user_id is distinct from old.user_id
        or new.items is distinct from old.items
        or new.inventory_source is distinct from old.inventory_source
    ) then
      raise exception 'Transaksi yang memakai stok tidak dapat mengubah identitas atau item'
        using errcode = '23514';
    end if;

    if v_has_consumption then
      select exists (
        select 1 from public.supply_stock_logs original
        join public.supply_stock_logs reversal
          on reversal.reversal_of_log_id = original.id
        where original.transaction_id = old.id
          and original.owner_id = old.owner_id
          and original.action = 'consume'
      ) into v_has_reversal;

      if v_has_reversal and new.status = 'completed' then
        raise exception 'Transaksi yang sudah dibatalkan tidak dapat diaktifkan kembali'
          using errcode = '23514';
      end if;
      if old.status = 'completed' and new.status is distinct from 'completed'
          and coalesce(new.status, '') not in ('voided', 'cancelled', 'canceled') then
        raise exception 'Batalkan transaksi untuk mengembalikan bahan'
          using errcode = '23514';
      end if;
    end if;

    if coalesce(new.status, '') not in ('voided', 'cancelled', 'canceled') then
      return new;
    end if;
  end if;

  -- Both cancellation and deletion require an active, signed business user.
  -- A cashier can reverse only receipts attributed to that same cashier.
  if coalesce(auth.jwt() ->> 'role', '') <> 'authenticated'
      or coalesce(v_role, '') not in ('admin', 'kasir')
      or nullif(v_owner, '') is null or nullif(v_actor, '') is null
      or old.owner_id is distinct from v_owner
      or (v_role = 'kasir' and old.user_id is distinct from v_actor) then
    raise exception 'Tidak memiliki izin untuk membatalkan transaksi ini'
      using errcode = '42501';
  end if;

  select coalesce(u.owner_id, u.id), u.role, u.is_active
    into v_user_owner, v_user_role, v_user_active
  from public.users u where u.id = v_actor;
  if not found or v_user_active is not true
      or v_user_owner is distinct from old.owner_id
      or v_user_role is distinct from v_role
      or v_user_role not in ('admin', 'kasir') then
    raise exception 'Akun tidak aktif atau tidak memiliki bisnis ini'
      using errcode = '42501';
  end if;

  if not v_has_consumption then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;

  -- Every stock-changing path locks supplies first. Sorted IDs prevent two
  -- receipts sharing ingredients from taking locks in opposite orders.
  for v_supply in
    select s.* from public.supplies s
    where s.owner_id = old.owner_id and exists (
      select 1 from public.supply_stock_logs l
      where l.supply_id = s.id and l.transaction_id = old.id
        and l.owner_id = old.owner_id and l.action = 'consume'
    )
    order by s.id for update of s
  loop
    v_running := v_supply.stock;
    v_current_unit := lower(btrim(v_supply.unit));
    if v_current_unit in ('g', 'gram') then v_current_unit := 'gram'; end if;

    for v_original in
      select l.* from public.supply_stock_logs l
      where l.supply_id = v_supply.id and l.transaction_id = old.id
        and l.owner_id = old.owner_id and l.action = 'consume'
      order by l.id
    loop
      if exists (
        select 1 from public.supply_stock_logs r
        where r.reversal_of_log_id = v_original.id
      ) then
        continue;
      end if;

      v_old_unit := lower(btrim(v_original.unit));
      if v_old_unit in ('g', 'gram') then v_old_unit := 'gram'; end if;
      if v_old_unit is distinct from v_current_unit then
        raise exception 'Satuan bahan % berubah dari % ke %. Samakan satuan sebelum membatalkan transaksi.',
          v_original.supply_name, v_original.unit, v_supply.unit
          using errcode = '23514';
      end if;
      if v_original.change_amount >= 0 then
        raise exception 'Catatan penggunaan bahan tidak valid untuk pengembalian'
          using errcode = '23514';
      end if;
      v_credit := -v_original.change_amount;
      if v_running + v_credit > 999999999999.999999 then
        raise exception 'Stok % akan melewati batas setelah transaksi dibatalkan',
          v_supply.name using errcode = '22003';
      end if;

      insert into public.supply_stock_logs
        (supply_id, owner_id, actor_id, supply_name, unit, action,
         input_amount, change_amount, stock_before, stock_after, note,
         product_id, product_name, quantity_per_serving, quantity_tolerance,
         transaction_id, reversal_of_log_id)
      values
        (v_original.supply_id, v_original.owner_id, v_actor,
         v_original.supply_name, v_original.unit, 'reversal',
         v_original.input_amount, v_credit, v_running, v_running + v_credit,
         case when tg_op = 'DELETE' then 'Penghapusan transaksi: '
              else 'Pembatalan transaksi: ' end || old.id,
         null, v_original.product_name, v_original.quantity_per_serving,
         v_original.quantity_tolerance, old.id, v_original.id);
      v_running := v_running + v_credit;
    end loop;

    if v_running is distinct from v_supply.stock then
      perform set_config('app.supply_stock_rpc', '1', true);
      update public.supplies set stock = v_running, updated_at = now()
        where id = v_supply.id;
      perform set_config('app.supply_stock_rpc', '0', true);
    end if;
  end loop;

  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$function$;

drop trigger if exists reverse_pos_supply_stock on public.transactions;
create trigger reverse_pos_supply_stock
  before update or delete on public.transactions
  for each row execute function public.reverse_pos_supply_stock();

revoke all on function public.reverse_pos_supply_stock()
  from public, anon, authenticated;
notify pgrst, 'reload schema';
commit;
