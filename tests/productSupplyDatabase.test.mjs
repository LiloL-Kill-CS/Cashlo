import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createStockTestDatabase } from './stockTestDatabase.mjs';

const owner = { role: 'authenticated', sub: 'product-owner', owner_id: 'product-owner', user_role: 'admin' };
const other = { role: 'authenticated', sub: 'product-other', owner_id: 'product-other', user_role: 'admin' };

async function asUser(db, claims, run) {
    return db.transaction(async tx => {
        await tx.exec('set local role authenticated');
        await tx.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify(claims)]);
        return run(tx);
    });
}

async function save(db, data, supplies, claims = owner) {
    const result = await asUser(db, claims, tx => tx.query(
        'select * from public.save_product_with_supplies($1::jsonb,$2::jsonb)',
        [JSON.stringify(data), supplies === null ? null : JSON.stringify(supplies)],
    ));
    return result.rows[0];
}

async function createSupply(db, name, packSize = 750, claims = owner) {
    const result = await asUser(db, claims, tx => tx.query(
        'select * from public.create_supply($1::jsonb)',
        [JSON.stringify({ name, unit: 'ml', pack_size: packSize, initial_packs: 1 })],
    ));
    return result.rows[0].id;
}

async function stock(db, id) {
    return Number((await db.query('select stock from public.supplies where id=$1', [id])).rows[0].stock);
}

test('rollback-only SQL suite leaves no product or ingredient test records', async () => {
    const db = await createStockTestDatabase();
    try {
        await db.exec(await readFile(new URL('../docs/sql/product-supplies.rollback-test.sql', import.meta.url), 'utf8'));
        for (const table of ['users', 'products', 'supplies', 'supply_menu_links', 'supply_stock_logs']) {
            assert.equal((await db.query(`select count(*)::int n from public.${table}`)).rows[0].n, 0, table);
        }
    } finally { await db.close(); }
});

test('product and ingredient recipe save atomically through PostgreSQL', async () => {
    const db = await createStockTestDatabase();
    try {
        await db.exec(`
            insert into public.users (id, name, username, password_hash, role, owner_id, is_active)
            values ('product-owner', 'Product owner', 'product-owner', '!test!', 'admin', 'product-owner', true);
        `);
        const result = await db.transaction(async tx => {
            await tx.exec('set local role authenticated');
            await tx.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({
                role: 'authenticated', sub: 'product-owner', owner_id: 'product-owner', user_role: 'admin',
            })]);
            return tx.query('select * from public.save_product_with_supplies($1::jsonb,$2::jsonb)', [
                JSON.stringify({ id: 'prod-butter', name: 'Butter Coffee', sell_price: 25000, cost_price: 8000, modifiers: [] }),
                JSON.stringify([]),
            ]);
        });
        assert.equal(result.rows[0].id, 'prod-butter');
        assert.equal(result.rows[0].owner_id, 'product-owner');
    } finally {
        await db.close();
    }
});

test('saved recipes feed POS and manual sales, while cancellation returns original doses once', async () => {
    const db = await createStockTestDatabase();
    try {
        await db.exec(`
            insert into public.users (id,name,username,password_hash,role,owner_id,is_active) values
              ('product-owner','Owner','product-owner','!test!','admin','product-owner',true);
            insert into public.products (id,name,owner_id,category,sell_price,cost_price,modifiers)
              values ('prod-vanila','Vanila','product-owner','coffee',22000,7000,'[]');
        `);
        const syrup = await createSupply(db, 'Test syrup');
        const milk = await createSupply(db, 'Test milk', 500);
        await db.exec("insert into public.products (id,name,owner_id,modifiers) values ('prod-legacy','Legacy','product-owner','old-format')");
        const legacyBefore = (await db.query("select * from public.products where id='prod-legacy'")).rows[0];
        await save(db, { id: 'prod-legacy' }, [{ supply_id: syrup, quantity_per_serving: 12 }]);
        assert.deepEqual((await db.query("select * from public.products where id='prod-legacy'")).rows[0], legacyBefore);
        await save(db, { id: 'prod-butter', name: 'Butter Coffee', category: 'coffee',
            sell_price: 25000, cost_price: 8000,
            modifiers: [{ name: 'Extra shot', price: 4000, cost: 1000 }] }, [
            { supply_id: syrup, quantity_per_serving: 15, quantity_tolerance: 3 },
            { supply_id: milk, quantity_per_serving: 50, quantity_tolerance: 5 },
        ]);
        const vanilaBefore = (await db.query("select * from public.products where id='prod-vanila'")).rows[0];
        await save(db, { id: 'prod-vanila' }, [{ supply_id: syrup, quantity_per_serving: 20, quantity_tolerance: 2 }]);
        const vanilaAfter = (await db.query("select * from public.products where id='prod-vanila'")).rows[0];
        assert.deepEqual(vanilaAfter, vanilaBefore, 'recipe-only repair changed product metadata');
        const logsBefore = (await db.query('select count(*)::int n from public.supply_stock_logs')).rows[0].n;
        await save(db, { id: 'prod-butter' }, null);
        assert.equal((await db.query("select count(*)::int n from public.supply_menu_links where product_id='prod-butter'")).rows[0].n, 2);
        assert.equal(await stock(db, syrup), 750);
        assert.equal((await db.query('select count(*)::int n from public.supply_stock_logs')).rows[0].n, logsBefore);

        await asUser(db, owner, tx => tx.query(
            `insert into public.transactions (id,user_id,owner_id,items,inventory_source,status)
             values ('product-pos','product-owner','product-owner',$1,'pos','completed')`,
            [JSON.stringify([{ product_id: 'prod-butter', qty: 2 }])],
        ));
        assert.equal(await stock(db, syrup), 720);
        assert.equal(await stock(db, milk), 400);
        await asUser(db, owner, tx => tx.query(
            `insert into public.transactions (id,user_id,owner_id,items,inventory_source,status)
             values ('product-manual','product-owner','product-owner',$1,'manual','completed')`,
            [JSON.stringify([{ product_id: 'prod-butter', qty: 1 }, { product_id: 'prod-vanila', qty: 1 }])],
        ));
        assert.equal(await stock(db, syrup), 685);
        assert.equal(await stock(db, milk), 350);
        await save(db, { id: 'prod-butter' }, [{ supply_id: syrup, quantity_per_serving: 25 }]);
        assert.equal(await stock(db, syrup), 685);
        assert.equal((await db.query("select quantity_per_serving from public.supply_menu_links where product_id='prod-vanila'")).rows[0].quantity_per_serving, '20.000000');
        await asUser(db, owner, tx => tx.query("update public.transactions set status='cancelled' where id='product-pos'"));
        assert.equal(await stock(db, syrup), 715);
        assert.equal(await stock(db, milk), 450);
        await asUser(db, owner, tx => tx.query("delete from public.transactions where id='product-pos'"));
        assert.equal(await stock(db, syrup), 715);
        await asUser(db, owner, tx => tx.query("delete from public.transactions where id='product-manual'"));
        assert.equal(await stock(db, syrup), 750);
        assert.equal(await stock(db, milk), 500);
        assert.equal((await db.query("select count(*)::int n from public.supply_stock_logs where action='reversal'")).rows[0].n, 5);
    } finally { await db.close(); }
});

test('foreign, cashier, inactive, and invalid recipe edits cannot change products or stock', async () => {
    const db = await createStockTestDatabase();
    try {
        await db.exec(`
            insert into public.users (id,name,username,password_hash,role,owner_id,is_active) values
              ('product-owner','Owner','product-owner','!test!','admin','product-owner',true),
              ('product-other','Other','product-other','!test!','admin','product-other',true),
              ('product-cashier','Cashier','product-cashier','!test!','kasir','product-owner',true),
              ('product-inactive','Inactive','product-inactive','!test!','admin','product-owner',false);
        `);
        const syrup = await createSupply(db, 'Own syrup');
        const foreignSupply = await createSupply(db, 'Foreign syrup', 750, other);
        await save(db, { id: 'prod-own', name: 'Original', sell_price: 10000, cost_price: 4000, modifiers: [] },
            [{ supply_id: syrup, quantity_per_serving: 15 }]);
        const invalid = [
            [{ supply_id: syrup, quantity_per_serving: 15 }, { supply_id: syrup, quantity_per_serving: 20 }],
            [{ supply_id: foreignSupply, quantity_per_serving: 15 }],
            [{ supply_id: syrup, quantity_per_serving: 0 }],
            [{ supply_id: syrup, quantity_per_serving: 15, quantity_tolerance: 15 }],
            [{ supply_id: syrup, quantity_per_serving: 0.0000001 }],
        ];
        for (const links of invalid) {
            await assert.rejects(save(db, { id: 'prod-own', name: 'Corrupted' }, links));
            assert.equal((await db.query("select name from public.products where id='prod-own'")).rows[0].name, 'Original');
            assert.equal(Number((await db.query("select quantity_per_serving from public.supply_menu_links where product_id='prod-own'")).rows[0].quantity_per_serving), 15);
        }
        await assert.rejects(save(db, { id: 'prod-new', name: 'Invalid', modifiers: [] }, [{ supply_id: foreignSupply, quantity_per_serving: 5 }]));
        assert.equal((await db.query("select count(*)::int n from public.products where id='prod-new'")).rows[0].n, 0);
        await save(db, { id: 'prod-foreign', name: 'Other product', modifiers: [] }, [], other);
        await assert.rejects(save(db, { id: 'prod-foreign', name: 'Stolen' }, null));
        const rejected = [
            { role: 'authenticated', sub: 'product-cashier', owner_id: 'product-owner', user_role: 'kasir' },
            { role: 'authenticated', sub: 'product-inactive', owner_id: 'product-owner', user_role: 'admin' },
            { role: 'authenticated', sub: 'product-other', owner_id: 'product-owner', user_role: 'admin' },
            { role: 'anon', sub: 'product-owner', owner_id: 'product-owner', user_role: 'admin' },
        ];
        for (const claims of rejected) {
            await assert.rejects(save(db, { id: 'prod-own', name: 'Unauthorized' }, null, claims));
        }
        await save(db, { id: 'prod-own' }, []);
        assert.equal((await db.query("select count(*)::int n from public.supply_menu_links where product_id='prod-own'")).rows[0].n, 0);
        assert.equal(await stock(db, syrup), 750);
    } finally { await db.close(); }
});
