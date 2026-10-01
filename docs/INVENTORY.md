# Reusable cafe inventory

Inventory is the single place to create and refill supplies. An item stores its
name, base unit, package size, optional portions per package, and low-stock limit.
It stays in the catalog when stock reaches zero. Restocking needs only a package
count; it adds to the current balance. Existing Purchasing supplies use the same
catalog and appear here after the migration.

For a 750 ml bottle making 50 coffees, the saved dose is 15 ml. Recording 30 coffees
leaves 300 ml, or 20 more coffees. Sugar and other supplies without a portion yield
can be consumed by their base quantity, including decimal amounts. Unit changes
are blocked while stock exists. Metadata edits preserve stock.

Usage is recorded manually in Inventory. POS sales do not currently consume these
supplies; HPP recipes remain a separate cost-calculation tool. Supply balances are
business-wide; the existing sellable-product stock remains per warehouse.

## Release setup

1. Apply `docs/sql/inventory-supplies.sql` to the app's Supabase project through a
   reviewed migration before releasing the updated app. It adds supply quantity
   fields, stock history, atomic creation/stock RPCs, and admin write policies.
2. Existing supply records start with zero stock and package size 1. Edit their
   saved package details and use **Hitung ulang** to record their actual balance.
   No stock is inferred from earlier purchasing records.
3. Keep the existing server `SUPABASE_JWT_SECRET` configured. Stock mutations
   require the signed `owner_id`, `sub`, `user_role=admin`, and authenticated role.
   Cashiers can read inventory. Anonymous and foreign-owner changes are blocked.
4. Deploy the app using its normal release process.

The migration was applied to the live database on October 1, 2026 as
`20261001133634_reusable_cafe_inventory_stock`. Its rollback suite passed in both
isolated and live PostgreSQL. Live REST checks used a separate synthetic owner
and verified the syrup calculation, concurrent consumption, stock history, and
owner/cashier/anonymous permissions. The existing `adminangga` account and its
business records matched the pre-migration checksums across 21 tables.

The two stock RPCs intentionally use `SECURITY DEFINER` for atomic balance and
ledger writes. They pin the search path, check signed admin/owner claims, reject
foreign-owner items, and deny anonymous execution. Supabase's advisor flags this
intentional design for review. The existing server-only `users` table remains
protected by RLS without client policies.

Stock updates lock the item row and write the balance and history in one database
transaction. Insufficient stock rejects the entire change. Direct balance edits
are guarded. Logged items are kept to preserve history. A successful write whose
refresh fails is shown as saved, with a retry warning; another change is blocked
until refreshed.

## Repeat the tests

```powershell
npm ci
npm test
npx playwright install chromium
npm run dev -- --webpack -p 3100
# In another terminal:
npm run test:inventory-ui
npm run build -- --webpack
```

`npm test` covers quantity calculations and executes the real migration and its
rollback SQL suite in PGlite PostgreSQL. The baseline reproduces the relevant
live table columns, foreign keys, roles, and ownership policy.

The browser test opens the real Inventory page with synthetic authentication and
an HTTP adapter that executes supply queries and RPCs against isolated PostgreSQL.
It checks creation, usage, restocking, repeated submit, errors, history, metadata,
cashier permissions, phone/tablet/laptop/desktop dialogs, and persistence after database
reopening. It does not sign in to the production app or modify production data.
Screenshots and isolated test databases go into ignored `.test-artifacts/`.

Optional environment variables: `INVENTORY_TEST_URL` overrides localhost:3100;
`PLAYWRIGHT_CHANNEL=chrome` uses installed Chrome; `PLAYWRIGHT_MODULE` points to
an existing Playwright package. In a worktree using a dependency junction outside
the project root, `--webpack` avoids Turbopack's external-symlink limitation.
