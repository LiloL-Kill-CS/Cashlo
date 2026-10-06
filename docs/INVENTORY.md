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

Choose saved menu products when editing a supply. One syrup can link to several
menus, each with its own base-unit dose and variation. The menu name comes from
the existing Menu catalog, so it does not need to be entered twice. For ml items,
the shared dose starts at 15 ml with a 3 ml variation (12-18 ml); change the
variation to 2 ml for a 13-17 ml range, or customize either value per menu.
**Hubungkan semua menu** adds available menus using the shared settings.
**Terapkan ke semua menu terhubung** applies the shared dose and variation to
all selected menus in one action. Save once to persist the item and all links
atomically. Linking or changing doses does not change the existing stock.

**Catat pakai** records usage outside POS sales, such as samples or waste. It lets
you choose a linked menu and its portion count. Menu doses
debit the same supply balance. Usage history snapshots the menu name, dose, and
variation, even if a menu is later renamed, unlinked, or removed. Portion counts
shown for each menu are alternative uses of the same stock, not quantities to add.

Stock deductions use the nominal saved dose. The variation range describes
estimated usage for the current batch, not a measured remaining balance or a
statistical confidence interval. Use **Hitung ulang** after measuring physical
stock to reconcile it. Legacy unlinked items keep their saved yield and label.

Completed POS payments automatically consume every supply linked to the sold
menus, using saved nominal dose times quantity. A menu can consume several
supplies, and several menus can consume one shared supply. Modifier cart rows for
the same menu are combined. The payment, supply balances, and usage history commit
in one database transaction; insufficient stock rejects the entire save and keeps
the cart with an actionable error. Cashiers can consume ingredients through a
completed sale but cannot edit supply settings or manually adjust balances.

Repeated payment confirmation is blocked. An unchanged checkout retains its
receipt ID across retries; a lost response recovers the saved receipt without
deducting ingredients twice. History includes the receipt ID and menu/dose
snapshots. Inventory reloads when its tab becomes visible again.

**Input Data Lama** now deducts supplies when a newly added receipt is saved.
Selecting a coffee menu is sufficient: its saved supply links determine the
ingredients. For example, one Kopder with a 15 ml Kopder syrup dose changes
750 ml to 735 ml; 30 portions use 450 ml and leave 300 ml. Several selected menus
can share a supply, and one menu can use several ingredients. Quantities are
whole portions and can be entered directly. The summary previews the combined
ingredient use; the database validates the current recipe and balance on save.

Direct supply selections mean whole packages/bottles using the saved package
size: one 750 ml bottle consumes 750 ml. Do not add that same ingredient directly
when it is already represented by a selected menu unless both usages occurred.
The receipt, every ingredient deduction, and its history commit together.
Insufficient stock keeps the form open and leaves all balances and the receipt
unchanged. An unchanged retry retains its receipt ID to avoid double deduction.
Canceling or deleting these new manual receipts returns the recorded menu doses
and direct package amounts exactly once, even after later recipe/package edits.

A backdated receipt subtracts from today's recorded stock when entered. It does
not reconstruct historical balances. Existing unmarked historic receipts stay
unchanged, and customer points and warehouse product stock are not modified by
manual entry. Use saved stock correction if physical usage was already counted;
do not re-enter a sale already saved through POS.

Use **Batalkan transaksi** in Reports to correct a whole wrong-input sale while
keeping its receipt marked canceled. Permanently deleting a receipt also returns
its linked ingredients. Both actions restore the exact original deduction to the
current balance, once only: 750 ml becomes 735 ml after payment and 750 ml after
cancellation. Canceling twice or deleting an already-canceled receipt cannot
refill it again. Later restocking, waste, recipe edits, unlinking, and menu removal
do not change the amount returned. Ingredient history retains the original use
and a linked cancellation entry even after the receipt or menu is deleted.

Cancellation and ingredient returns commit together. A unit mismatch or permission
error leaves both receipt and stock intact and is shown in Reports. Admins can
reverse their business's receipts; cashier database permissions cover their own
receipts only. Reports remains an admin screen. Canceled receipts are excluded
from sales totals and cannot be reactivated; enter the corrected sale anew.

Do not manually record an already-paid POS sale in **Catat pakai**. Existing
unmarked historic entries are not retroactively consumed and have no deduction
to return. Removing a catalog menu does not cancel its earlier sales. Use
**Hitung ulang** to reconcile physical usage when needed. HPP recipes remain a separate cost-calculation tool.
Supply balances are business-wide; sellable-product stock remains per warehouse.

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
4. Apply `docs/sql/inventory-supply-menus.sql` after the first migration. It adds
   menu links, dose/variation snapshots, and atomic item/link saving and menu
   consumption RPCs. It does not infer links or change existing stock or menus.
5. Apply `docs/sql/inventory-pos-consumption.sql` before deploying the payment
   update. New checkout rows carry `inventory_source=pos`; the insert trigger
   consumes ingredients only for completed POS payments. Existing receipts and
   stock are left intact. Its internal trigger function cannot be called through
   the public RPC API.
6. Apply `docs/sql/inventory-pos-reversals.sql` after the payment migration. It
   adds linked, unique reversal history and an internal transaction update/delete
   trigger. Existing account data, receipt statuses, and stock stay intact;
   historical cancellations are not automatically rewritten.
7. Apply `supabase/migrations/20261006133343_manual_transaction_supply_consumption.sql`
   after the preceding migrations. It adds a private insert trigger for new
   completed `inventory_source=manual` receipts and typed ledger keys. It keeps
   existing account records, recipes, receipts, and stock untouched. Manual entry
   requires an active signed business admin; POS keeps its cashier permissions.
8. Deploy the app using its normal release process.

The migrations were applied to the live database on October 1, 2026 as
`20261001133634_reusable_cafe_inventory_stock` and
`20261001150439_supply_menu_doses_and_variation`. Both rollback suites passed in
isolated and live PostgreSQL. Live REST checks used separate synthetic owners
and verified shared stock across two menus, custom doses and variation, concurrent
consumption, atomic save rollback, stock history snapshots, and
owner/cashier/anonymous permissions. The existing `adminangga` account and its
business records matched the pre-migration checksums across 21 tables.

The payment fix uses migration
`20261002140101_pos_payments_consume_linked_supplies`. Its rollback suite passed
in isolated and live PostgreSQL, including inactive cashier, owner isolation,
duplicate receipt IDs, multi-ingredient shortage rollback, and receipt deletion.
Live REST payments verified 750 ml becomes 735 ml for one 15 ml menu and concurrent
payments cannot overdraw ingredients. A fresh protected snapshot also covers
the saved supply, its menu links, and ingredient history across 23 tables.

Receipt reversal uses migration
`20261002151813_pos_cancellation_returns_consumed_supplies`. Its isolated and live
rollback suites verify exact credits, once-only returns after cancel/delete,
recipe and catalog edits, later restocks/waste, ownership and role restrictions,
unit mismatches, equivalent gram/g units, numeric overflow, and audit integrity.
Live REST checks also verify concurrent cancellation/deletion and cashier-owned
receipt reversal. The protected account snapshot matches across 23 tables.

Manual entry uses live migration
`20261006134153_manual_transaction_supply_consumption` (October 6, 2026).
Its isolated and live rollback suites verify linked Kopder doses, direct saved
packages, shared balances, typed item IDs, atomic shortage/overflow errors,
owner/admin restrictions, and exact refunds after recipe or package changes.
Live REST checks with a separate synthetic owner verify 750 -> 735 -> 750 ml,
30 coffees leaving 300 ml, saved package sizes, duplicate receipt IDs, mixed
menus, shortage rollback, POS regression, and concurrent cancel/cancel/delete.
The protected account snapshot still matches across 23 tables. The production
build and 39 isolated browser checks passed, including phone/tablet/laptop flows.

The stock and menu RPCs intentionally use `SECURITY DEFINER` for atomic balance and
ledger writes. They pin the search path, check signed admin/owner claims, reject
foreign-owner items, and deny anonymous execution. Supabase's advisor flags this
intentional design for review ([advisor guidance](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)). The existing server-only `users` table remains
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
npm run test:pos-inventory-ui
npm run test:transaction-reversal-ui
npm run test:manual-transaction-ui
npm run build -- --webpack
```

`npm test` covers quantity calculations and executes the real migration and its
rollback SQL suite in PGlite PostgreSQL. The baseline reproduces the relevant
live table columns, foreign keys, roles, and ownership policy.

The browser test opens the real Inventory page with synthetic authentication and
an HTTP adapter that executes supply queries and RPCs against isolated PostgreSQL.
It checks creation, usage, restocking, repeated submit, errors, history, metadata,
multiple menu links, custom doses/variation, bulk application, unlinking,
cashier permissions, phone/tablet/laptop/desktop dialogs, and persistence after database
reopening. It does not sign in to the production app or modify production data.
Screenshots and isolated test databases go into ignored `.test-artifacts/`.

The POS browser test runs completed payments against the same isolated database,
then opens Inventory to check the resulting balance and history. It covers mixed
menus, cashier sales, cancellation, simultaneous clicks, committed responses lost
in transit, retries after payment details change, and stock-shortage errors.

The reversal browser test pays through POS, cancels or deletes through Reports,
and checks Inventory and the real PostgreSQL ledger. It covers once-only returns,
manual history, cancellation/deletion errors, and phone/tablet/laptop layouts.

The manual-entry browser test uses the real Reports dialog and isolated
PostgreSQL. It verifies Kopder menu doses, bulk quantities, direct packages,
shared ingredients, stock-shortage rollback, repeated submit/lost responses,
exact cancellation/deletion returns, and phone/tablet/laptop dialog layouts.

Optional environment variables: `INVENTORY_TEST_URL` overrides localhost:3100;
`PLAYWRIGHT_CHANNEL=chrome` uses installed Chrome; `PLAYWRIGHT_MODULE` points to
an existing Playwright package. In a worktree using a dependency junction outside
the project root, `--webpack` avoids Turbopack's external-symlink limitation.
