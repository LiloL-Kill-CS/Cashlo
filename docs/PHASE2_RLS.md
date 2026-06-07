# Phase 2 — Per-owner data isolation (RLS)

Goal: replace the 17 `"Allow All Access"` policies so each business (`owner_id`) can
only see/modify its own rows. The browser stops using the shared anon key for
data and instead sends a per-user Supabase JWT minted on login (carries
`owner_id`). PostgREST exposes the claim to RLS via `auth.jwt() ->> 'owner_id'`.

Prereq: `SUPABASE_JWT_SECRET` set (server) — used by `src/lib/supabaseToken.js`.

## Status
- [x] Server mints token (`src/lib/supabaseToken.js`); returned by `/api/auth/login` + `/api/auth/me` (null until secret set).
- [ ] Client wiring: attach token to the supabase client (gated — do with RLS, see below).
- [ ] RLS policies per table (below), table-by-table with verification.

## Tables with `owner_id` (text) — direct policy
attendance, categories, customers, expenses*, membership_tiers, point_rewards,
products, purchases, recipes, shifts, suppliers, supplies*, transactions,
warehouses, ingredients.  (*expenses/supplies already have owner-scoped policies — review + standardize to the claim form below.)

Per-table SQL (run one table at a time, test, then next):
```sql
-- example for products; repeat per table name
drop policy if exists "Allow All Access" on public.products;
create policy "owner_read"  on public.products for select to authenticated
  using (owner_id = (auth.jwt() ->> 'owner_id'));
create policy "owner_write" on public.products for all to authenticated
  using      (owner_id = (auth.jwt() ->> 'owner_id'))
  with check (owner_id = (auth.jwt() ->> 'owner_id'));
```
(`service_role` bypasses RLS automatically — server APIs keep working.)

## Tables WITHOUT `owner_id` — add column + backfill, then policy
product_stocks, purchase_items, inventory_logs, held_orders.
```sql
-- product_stocks ← products.owner_id
alter table public.product_stocks add column if not exists owner_id text;
update public.product_stocks ps set owner_id = p.owner_id
  from public.products p where p.id = ps.product_id and ps.owner_id is null;

-- purchase_items ← purchases.owner_id
alter table public.purchase_items add column if not exists owner_id text;
update public.purchase_items pi set owner_id = pu.owner_id
  from public.purchases pu where pu.id = pi.purchase_id and pi.owner_id is null;

-- inventory_logs ← products.owner_id
alter table public.inventory_logs add column if not exists owner_id text;
update public.inventory_logs il set owner_id = p.owner_id
  from public.products p where p.id = il.product_id and il.owner_id is null;

-- held_orders ← users.owner_id (held_orders has user_id only)
alter table public.held_orders add column if not exists owner_id text;
update public.held_orders ho set owner_id = u.owner_id
  from public.users u where u.id = ho.user_id and ho.owner_id is null;
```
Then apply the same `owner_read`/`owner_write` policy pattern. Also set owner_id
on insert in the client hooks for these 4 (or default via trigger) so new rows
carry it.

## Client wiring (do together with first table flip)
- `src/lib/supabase.js`: allow setting the Authorization token (recreate client
  or `supabase.realtime/headers` + `global.headers`). Simplest: export a setter
  that recreates the client with `global: { headers: { Authorization: 'Bearer <token>' } }`.
- `src/hooks/useAuth.js`: after `/api/auth/login` and `/api/auth/me`, call the
  setter with `supabaseToken`; clear on logout.
- Until the token is set, the client uses anon → which (after policies) returns
  nothing, so wiring must land in the SAME deploy as the policy changes.

## ⚠️ Timing caveat (handle when flipping RLS)
On page load the localStorage cache sets `user` instantly, so data hooks can fire
BEFORE `/api/auth/me` returns the token. With RLS on, those early anon queries
return 0 rows (empty flash) and won't auto-refetch. Fix when flipping RLS: gate
data fetches on token-ready (e.g. expose an `authReady` flag from useAuth and
have hooks wait for it), OR trigger a reload after `setSupabaseToken`. Not an
issue now (no secret → anon → allow-all policies still permit).

## Verification per step
1. As adminlilo token: can read own rows, cannot read adminangga rows.
2. As adminangga token: sees 12 products / 202 txns; cannot see adminlilo.
3. Anon key: 0 rows on locked tables.
4. App smoke test on https://aplikasibisnis.vercel.app (POS sale, dashboard, reports).

## Rollback
Re-create the open policy on a table if it misbehaves:
```sql
create policy "Allow All Access" on public.<table> for all to public using (true) with check (true);
```
