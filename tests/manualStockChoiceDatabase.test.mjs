import test from 'node:test';
import assert from 'node:assert/strict';
import { createStockTestDatabase } from './stockTestDatabase.mjs';

// Per-menu stock choice for Input Data Lama, on an isolated PostgreSQL copy.
const ownerJwt = JSON.stringify({ role: 'authenticated', sub: 'o1', owner_id: 'o1', user_role: 'admin' });

async function asOwner(db, fn) {
    return db.transaction(async tx => {
        await tx.exec('set local role authenticated');
        await tx.query("select set_config('request.jwt.claims',$1,true)", [ownerJwt]);
        return fn(tx);
    });
}

const receipt = (id, items, source = 'manual') => [
    `insert into public.transactions (id,datetime,user_id,owner_id,items,subtotal,total_cost,total_profit,payment_method,cash_received,change,status,inventory_source,manual_txn_count)
     values ($1, now() - interval '30 days', 'o1', 'o1', $2, 0, 0, 0, 'qr', 0, 0, 'completed', $3, 1)`,
    [id, JSON.stringify(items), source],
];

test('Input Data Lama: each menu line chooses whether it consumes stock', async () => {
    const db = await createStockTestDatabase();
    try {
        await db.exec(`
          insert into public.users(id,name,username,password_hash,role,owner_id) values ('o1','Cafe','o1','!','admin','o1');
          insert into public.products(id,name,owner_id,sell_price,cost_price,modifiers,is_active) values
            ('kopder','Kopder','o1',18000,6000,'[]',true), ('caramel','Caramel','o1',20000,7000,'[]',true);
        `);
        const syrup = await asOwner(db, async tx => (await tx.query('select * from public.save_supply_with_menus($1::jsonb,$2::jsonb)', [
            JSON.stringify({ name: 'Syrup', unit: 'ml', pack_size: 750, initial_packs: 0 }),
            JSON.stringify([
                { product_id: 'kopder', quantity_per_serving: 15, quantity_tolerance: 3 },
                { product_id: 'caramel', quantity_per_serving: 20, quantity_tolerance: 2 },
            ]),
        ])).rows[0]);
        const stock = async () => Number((await db.query('select stock from public.supplies where id=$1', [syrup.id])).rows[0].stock);
        const logCount = async id => (await db.query('select count(*)::int n from public.supply_stock_logs where transaction_id=$1', [id])).rows[0].n;
        assert.equal(await stock(), 0);

        // The original problem: 0 ml blocks a stock-consuming old sale.
        await assert.rejects(asOwner(db, tx => tx.query(...receipt('t-old', [{ product_id: 'kopder', qty: 2 }]))), /tidak cukup/);

        // Every line sale-only at 0 ml: saves, no stock change.
        await asOwner(db, tx => tx.query(...receipt('t-skip', [{ product_id: 'kopder', qty: 2, skip_stock: true }])));
        assert.equal(await stock(), 0);
        assert.equal(await logCount('t-skip'), 0);

        // Mixed receipt: Kopder skipped, Caramel consumes 3 x 20 ml.
        await asOwner(db, tx => tx.exec(`select * from public.adjust_supply_stock('${syrup.id}','adjust',750,'fixture')`));
        await asOwner(db, tx => tx.query(...receipt('t-mixed', [
            { product_id: 'kopder', qty: 5, skip_stock: true },
            { product_id: 'caramel', qty: 3, skip_stock: false },
        ])));
        assert.equal(await stock(), 690);
        assert.equal(await logCount('t-mixed'), 1);

        // Skipped line is not counted even when stock is short for it.
        await asOwner(db, tx => tx.exec(`select * from public.adjust_supply_stock('${syrup.id}','adjust',20,'fixture')`));
        await asOwner(db, tx => tx.query(...receipt('t-short', [
            { product_id: 'kopder', qty: 100, skip_stock: true },
            { product_id: 'caramel', qty: 1 },
        ])));
        assert.equal(await stock(), 0);

        // Cancel returns only what was used.
        await asOwner(db, tx => tx.exec(`update public.transactions set status='voided' where id='t-short'`));
        assert.equal(await stock(), 20);
        await asOwner(db, tx => tx.exec(`delete from public.transactions where id='t-skip'`));
        assert.equal(await stock(), 20);

        // Invalid flag types are rejected.
        await assert.rejects(asOwner(db, tx => tx.query(...receipt('t-bad', [{ product_id: 'kopder', qty: 1, skip_stock: 'yes' }]))), /tanpa stok/);
    } finally { await db.close(); }
});
