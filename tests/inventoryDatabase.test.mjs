import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createStockTestDatabase } from './stockTestDatabase.mjs';

test('PostgreSQL migration: atomic stock, reusable items, precision, ledger, owner and role isolation', async () => {
    const db = await createStockTestDatabase();
    try {
        await db.exec(await readFile(new URL('../docs/sql/inventory-supplies.rollback-test.sql', import.meta.url), 'utf8'));
        assert.equal((await db.query('select count(*)::int n from public.supplies')).rows[0].n, 0);
        assert.equal((await db.query('select count(*)::int n from public.supply_stock_logs')).rows[0].n, 0);
        assert.equal((await db.query('select count(*)::int n from public.users')).rows[0].n, 0);
    } finally { await db.close(); }
});

test('PostgreSQL menu links: shared stock, custom doses, variation, atomic save, history and owner isolation', async () => {
    const db = await createStockTestDatabase();
    try {
        await db.exec(await readFile(new URL('../docs/sql/inventory-supply-menus.rollback-test.sql', import.meta.url), 'utf8'));
        for (const table of ['supplies', 'supply_stock_logs', 'supply_menu_links', 'products', 'users']) {
            assert.equal((await db.query(`select count(*)::int n from public.${table}`)).rows[0].n, 0, `Residual rows in ${table}`);
        }
    } finally { await db.close(); }
});

test('PostgreSQL POS payments: atomic ingredient deductions, cashier permissions, retries and historical data preservation', async () => {
    const db = await createStockTestDatabase();
    try {
        await db.exec(await readFile(new URL('../docs/sql/inventory-pos-consumption.rollback-test.sql', import.meta.url), 'utf8'));
        for (const table of ['transactions', 'supplies', 'supply_stock_logs', 'supply_menu_links', 'products', 'users']) {
            assert.equal((await db.query(`select count(*)::int n from public.${table}`)).rows[0].n, 0, `Residual rows in ${table}`);
        }
    } finally { await db.close(); }
});
