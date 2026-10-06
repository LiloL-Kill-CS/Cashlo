import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import { createStockTestDatabase } from './stockTestDatabase.mjs';

// Real Reports form and SQL triggers against an isolated PostgreSQL instance.
// No production credentials, products, receipts, or inventory are touched.
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.INVENTORY_TEST_URL || 'http://localhost:3100';
const artifactDir = path.resolve('.test-artifacts');
await mkdir(artifactDir, { recursive: true });
const db = await createStockTestDatabase(await mkdtemp(path.join(artifactDir, 'manual-stock-db-')));
await db.exec(`
  insert into public.users(id,name,username,password_hash,role,owner_id)
  values ('test-owner','Test Cafe','test-owner','!no-login!','admin','test-owner');
  insert into public.products(id,name,owner_id,category,sell_price,cost_price,modifiers,is_active)
  values
    ('test-kopder','Kopder','test-owner','Coffee',18000,6000,'[]',true),
    ('test-caramel','Caramel Coffee','test-owner','Coffee',20000,7000,'[]',true);
`);
const ownerJwt = JSON.stringify({ role: 'authenticated', sub: 'test-owner', owner_id: 'test-owner', user_role: 'admin' });
const supplies = await db.transaction(async tx => {
    await tx.exec('set local role authenticated');
    await tx.query("select set_config('request.jwt.claims',$1,true)", [ownerJwt]);
    const syrup = (await tx.query('select * from public.save_supply_with_menus($1::jsonb,$2::jsonb)', [
        JSON.stringify({ name: 'Syrup vanilla', unit: 'ml', pack_size: 750, initial_packs: 1, min_stock_level: 60 }),
        JSON.stringify([
            { product_id: 'test-kopder', quantity_per_serving: 15, quantity_tolerance: 3 },
            { product_id: 'test-caramel', quantity_per_serving: 20, quantity_tolerance: 2 },
        ]),
    ])).rows[0];
    const sugar = (await tx.query('select * from public.save_supply_with_menus($1::jsonb,$2::jsonb)', [
        JSON.stringify({ name: 'Gula', unit: 'g', pack_size: 1000, initial_packs: 1 }),
        JSON.stringify([{ product_id: 'test-kopder', quantity_per_serving: 10, quantity_tolerance: 1 }]),
    ])).rows[0];
    const cups = (await tx.query('select * from public.save_supply_with_menus($1::jsonb,$2::jsonb)', [
        JSON.stringify({ name: 'Paper cups', unit: 'pcs', pack_size: 50, initial_packs: 2 }),
        JSON.stringify([]),
    ])).rows[0];
    return { syrup, sugar, cups };
});
for (const item of Object.values(supplies)) assert.ok(item?.id);

let delayNextPost = false;
let failNextCommittedResponse = false;
let failNextRecoveryGet = false;
let postCount = 0;
const runtimeErrors = [];
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
page.on('pageerror', error => runtimeErrors.push(error.message));
page.on('dialog', dialog => { if (dialog.type() === 'alert') void dialog.accept(); });
await context.route('**/api/auth/me', route => route.fulfill({ json: {
    user: { id: 'test-owner', owner_id: 'test-owner', name: 'Test Cafe', role: 'admin' }, supabaseToken: null,
} }));
await context.route('**/api/users', route => route.fulfill({ json: { users: [{ id: 'test-owner' }] } }));
await context.route('**/rest/v1/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const endpoint = url.pathname.split('/rest/v1/')[1];
    const method = request.method();
    if (endpoint === 'transactions' && method === 'POST') {
        postCount++;
        if (delayNextPost) {
            delayNextPost = false;
            await new Promise(resolve => setTimeout(resolve, 400));
        }
    }
    if (endpoint === 'transactions' && method === 'GET' && url.searchParams.has('id') && failNextRecoveryGet) {
        failNextRecoveryGet = false;
        return await route.fulfill({ status: 503, json: { message: 'Synthetic receipt lookup failure' } });
    }
    try {
        const result = await db.transaction(async tx => {
            await tx.exec('set local role authenticated');
            await tx.query("select set_config('request.jwt.claims',$1,true)", [ownerJwt]);
            if (endpoint === 'products') {
                const rows = (await tx.query("select * from public.products where owner_id='test-owner' and is_active=true order by name")).rows;
                return rows.map(row => ({ ...row, sell_price: Number(row.sell_price), cost_price: Number(row.cost_price) }));
            }
            if (endpoint === 'transactions') {
                const id = url.searchParams.get('id')?.replace(/^eq\./, '');
                if (method === 'POST') {
                    const body = request.postDataJSON();
                    const item = Array.isArray(body) ? body[0] : body;
                    const fields = ['id', 'datetime', 'user_id', 'owner_id', 'customer_id', 'items', 'subtotal', 'total_cost', 'total_profit', 'payment_method', 'cash_received', 'change', 'status', 'inventory_source', 'manual_txn_count', 'created_at'];
                    return (await tx.query(`insert into public.transactions (${fields.join(',')}) values (${fields.map((_, i) => `$${i + 1}`).join(',')}) returning *`, fields.map(key => item[key] ?? null))).rows;
                }
                if (method === 'PATCH') return (await tx.query('update public.transactions set status=$1 where id=$2 and owner_id=$3 returning id', [request.postDataJSON().status, id, 'test-owner'])).rows;
                if (method === 'DELETE') return (await tx.query('delete from public.transactions where id=$1 and owner_id=$2 returning id', [id, 'test-owner'])).rows;
                const rows = (await tx.query(id
                    ? 'select * from public.transactions where id=$1 and owner_id=$2 and user_id=$3'
                    : 'select * from public.transactions where owner_id=$1 order by datetime desc',
                id ? [id, 'test-owner', 'test-owner'] : ['test-owner'])).rows;
                const values = rows.map(row => ({ ...row,
                    subtotal: Number(row.subtotal), total_cost: Number(row.total_cost),
                    total_profit: Number(row.total_profit), cash_received: Number(row.cash_received),
                    change: Number(row.change),
                }));
                return request.headers().accept?.includes('object+json') ? values[0] || null : values;
            }
            if (endpoint === 'supplies') return (await tx.query('select * from public.supplies order by name')).rows;
            if (endpoint === 'supply_stock_logs') return (await tx.query('select * from public.supply_stock_logs order by created_at desc limit 50')).rows;
            if (endpoint === 'supply_menu_links') return (await tx.query("select l.*,jsonb_build_object('name',p.name) as products from public.supply_menu_links l join public.products p on p.id=l.product_id order by l.product_id")).rows;
            return [];
        });
        if (endpoint === 'transactions' && method === 'POST' && failNextCommittedResponse) {
            failNextCommittedResponse = false;
            return await route.fulfill({ status: 503, json: { message: 'Synthetic committed response lost' } });
        }
        await route.fulfill({ json: result });
    } catch (error) {
        await route.fulfill({ status: 400, json: { message: error.message, code: error.code } });
    }
});

const balance = async item => Number((await db.query('select stock from public.supplies where id=$1', [item.id])).rows[0].stock);
const transactionCount = async () => Number((await db.query('select count(*)::int n from public.transactions')).rows[0].n);
const recent = async () => (await db.query('select * from public.transactions order by created_at desc,id desc limit 1')).rows[0];
const logs = async id => (await db.query('select * from public.supply_stock_logs where transaction_id=$1 order by created_at,id', [id])).rows;
const row = id => page.getByTestId(`transaction-row-${id}`);
const dialog = () => page.getByRole('dialog', { name: 'Input Data Transaksi Lama' });
const date = new Date();
const dateInput = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}T12:00`;
const openForm = async () => {
    await page.goto(`${base}/reports`);
    await page.getByRole('button', { name: /Input Data Lama/ }).click();
    await dialog().waitFor();
    await dialog().getByLabel('Tanggal & Waktu').fill(dateInput);
};
const addMenu = async (name, quantity = 1) => {
    await dialog().getByRole('button', { name: new RegExp(name) }).first().click();
    await dialog().getByRole('spinbutton', { name: `Jumlah porsi ${name}` }).fill(String(quantity));
};
const addSupply = async (name, quantity = 1) => {
    await dialog().getByRole('button', { name: new RegExp(name) }).first().click();
    await dialog().getByRole('spinbutton', { name: `Jumlah kemasan ${name}` }).fill(String(quantity));
};
const save = async () => {
    await dialog().getByRole('button', { name: 'Simpan Data Lama' }).click();
    await dialog().waitFor({ state: 'hidden' });
    return recent();
};
const action = async (id, verb) => {
    page.once('dialog', confirmation => confirmation.accept());
    await row(id).getByRole('button', { name: `${verb} transaksi ${id}` }).click();
};
const adjust = async (item, quantity) => db.transaction(async tx => {
    await tx.exec('set local role authenticated');
    await tx.query("select set_config('request.jwt.claims',$1,true)", [ownerJwt]);
    await tx.query('select * from public.adjust_supply_stock($1,$2,$3,$4)', [item.id, 'adjust', quantity, 'Synthetic test fixture']);
});
const noOverflow = async label => {
    const offenders = await page.evaluate(() => [...document.querySelectorAll('body *')]
        .filter(element => element.getBoundingClientRect().right > innerWidth + 1)
        .slice(0, 8)
        .map(element => ({ tag: element.tagName, className: String(element.className).slice(0, 60), right: Math.round(element.getBoundingClientRect().right) })));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${label} overflow ${JSON.stringify(offenders)}`);
};
let checks = 0;
const check = message => { checks++; console.log(`PASS ${message}`); };

try {
    await openForm();
    await addMenu('Kopder');
    await dialog().getByRole('region', { name: 'Perkiraan pemakaian bahan' }).getByText(/15 ml/).waitFor();
    const one = await save();
    assert.equal(one.inventory_source, 'manual');
    assert.equal(JSON.parse(one.items)[0].product_id, 'test-kopder');
    assert.equal(await balance(supplies.syrup), 735);
    assert.equal(await balance(supplies.sugar), 990);
    assert.deepEqual((await logs(one.id)).filter(log => log.action === 'consume').map(log => [log.source_item_key, Number(log.change_amount)]).sort(),
        [['menu:test-kopder', -10], ['menu:test-kopder', -15]]);
    check('saved Kopder dose consumes 15 ml syrup and 10 g sugar');
    await action(one.id, 'Batalkan');
    await row(one.id).getByText('Dibatalkan').waitFor();
    assert.equal(await balance(supplies.syrup), 750);
    assert.equal(await balance(supplies.sugar), 1000);
    await action(one.id, 'Hapus');
    await row(one.id).waitFor({ state: 'hidden' });
    assert.equal(await balance(supplies.syrup), 750);
    check('cancel and then delete returns exact stock once');

    await openForm();
    await addMenu('Kopder', 30);
    const thirty = await save();
    assert.equal(await balance(supplies.syrup), 300);
    assert.equal(await balance(supplies.sugar), 700);
    check('quantity 30 uses saved recipe and leaves 300 ml syrup');
    await action(thirty.id, 'Hapus');
    await row(thirty.id).waitFor({ state: 'hidden' });
    assert.equal(await balance(supplies.syrup), 750);
    assert.equal(await balance(supplies.sugar), 1000);
    check('direct delete of completed manual receipt refunds ingredients');

    await openForm();
    await addMenu('Kopder', 2);
    await addMenu('Caramel Coffee', 1);
    await addSupply('Paper cups', 1);
    const mixed = await save();
    assert.equal(await balance(supplies.syrup), 700);
    assert.equal(await balance(supplies.sugar), 980);
    assert.equal(await balance(supplies.cups), 50);
    assert.deepEqual((await logs(mixed.id)).filter(log => log.action === 'consume').map(log => log.source_item_key).sort(),
        [`menu:test-caramel`, `menu:test-kopder`, `menu:test-kopder`, `supply:${supplies.cups.id}`].sort());
    check('mixed menus and direct cup package consume three saved supplies atomically');
    await action(mixed.id, 'Hapus');
    await row(mixed.id).waitFor({ state: 'hidden' });
    assert.equal(await balance(supplies.syrup), 750);
    assert.equal(await balance(supplies.cups), 100);

    await adjust(supplies.syrup, 1500);
    await openForm();
    await addMenu('Kopder', 1);
    await addSupply('Syrup vanilla', 1);
    const sameSupply = await save();
    assert.equal(await balance(supplies.syrup), 735);
    assert.deepEqual((await logs(sameSupply.id)).filter(log => log.action === 'consume').map(log => [log.source_item_key, Number(log.change_amount)]).sort(),
        [[`menu:test-kopder`, -10], [`menu:test-kopder`, -15], [`supply:${supplies.syrup.id}`, -750]].sort());
    assert.equal(JSON.parse(sameSupply.items).some(item => item.product_id === supplies.syrup.id && item.is_supply === true), true);
    check('same receipt can consume a menu dose and a saved 750 ml bottle without merging IDs');
    await action(sameSupply.id, 'Hapus');
    await row(sameSupply.id).waitFor({ state: 'hidden' });
    assert.equal(await balance(supplies.syrup), 1500);
    await adjust(supplies.syrup, 750);

    await adjust(supplies.syrup, 10);
    await openForm();
    await addMenu('Kopder');
    const beforeFailed = await transactionCount();
    await dialog().getByRole('button', { name: 'Simpan Data Lama' }).click();
    await dialog().getByRole('alert').filter({ hasText: /stok|stock/i }).waitFor();
    assert.equal(await dialog().isVisible(), true);
    assert.equal(await dialog().getByRole('spinbutton', { name: 'Jumlah porsi Kopder' }).inputValue(), '1');
    assert.equal(await transactionCount(), beforeFailed);
    assert.equal(await balance(supplies.syrup), 10);
    check('shortage error keeps the form and prevents receipt and ledger writes');
    await dialog().getByRole('button', { name: 'Tutup input data lama' }).click();
    await adjust(supplies.syrup, 750);

    await openForm();
    await addMenu('Kopder');
    const beforeDoublePosts = postCount;
    delayNextPost = true;
    await dialog().locator('form').evaluate(form => {
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    await dialog().waitFor({ state: 'hidden' });
    const doubled = await recent();
    assert.equal(postCount - beforeDoublePosts, 1);
    assert.equal(await balance(supplies.syrup), 735);
    check('rapid double-submit sends one manual receipt and one deduction');
    await action(doubled.id, 'Hapus');
    await row(doubled.id).waitFor({ state: 'hidden' });

    await openForm();
    await addMenu('Kopder');
    failNextCommittedResponse = true;
    failNextRecoveryGet = true;
    await dialog().getByRole('button', { name: 'Simpan Data Lama' }).click();
    await dialog().getByRole('alert').waitFor();
    const lost = await recent();
    assert.equal(await balance(supplies.syrup), 735);
    assert.equal((await logs(lost.id)).filter(log => log.action === 'consume').length, 2);
    const beforeRetry = await transactionCount();
    await dialog().getByRole('button', { name: 'Simpan Data Lama' }).click();
    await dialog().waitFor({ state: 'hidden' });
    assert.equal(await transactionCount(), beforeRetry);
    assert.equal(await balance(supplies.syrup), 735);
    assert.equal((await logs(lost.id)).filter(log => log.action === 'consume').length, 2);
    check('lost committed response and recovery lookup retry same ID without a second deduction');
    await action(lost.id, 'Hapus');
    await row(lost.id).waitFor({ state: 'hidden' });

    const legacyId = 'legacy-manual-null-source';
    await db.transaction(async tx => {
        await tx.exec('set local role authenticated');
        await tx.query("select set_config('request.jwt.claims',$1,true)", [ownerJwt]);
        await tx.query("insert into public.transactions(id,datetime,user_id,owner_id,items,subtotal,total_cost,total_profit,payment_method,cash_received,change,status) values ($1,now(),'test-owner','test-owner',$2,18000,6000,12000,'qr',18000,0,'completed')", [legacyId, JSON.stringify([{ product_id: 'test-kopder', qty: 1 }])]);
    });
    await page.reload();
    await row(legacyId).waitFor();
    await action(legacyId, 'Hapus');
    await row(legacyId).waitFor({ state: 'hidden' });
    assert.equal(await balance(supplies.syrup), 750);
    assert.equal((await logs(legacyId)).length, 0);
    check('legacy manual receipt with NULL source deletes without phantom stock credit');

    for (const device of [
        { name: 'phone', width: 390, height: 844 },
        { name: 'tablet', width: 820, height: 1180 },
        { name: 'laptop', width: 1366, height: 768 },
    ]) {
        await page.setViewportSize({ width: device.width, height: device.height });
        await openForm();
        await addMenu('Kopder');
        const bounds = await dialog().boundingBox();
        assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= device.width, `${device.name} modal clipped`);
        assert.ok(bounds.y >= 0 && bounds.y + bounds.height <= device.height, `${device.name} modal too tall`);
        await noOverflow(`${device.name} manual form`);
        const id = (await save()).id;
        assert.equal(await balance(supplies.syrup), 735);
        await noOverflow(`${device.name} Reports after save`);
        await page.screenshot({ path: path.join(artifactDir, `manual-${device.name}.png`), fullPage: true });
        await page.reload();
        await row(id).waitFor();
        await action(id, 'Batalkan');
        await row(id).getByText('Dibatalkan').waitFor();
        assert.equal(await balance(supplies.syrup), 750);
        await openForm();
        await dialog().getByRole('button', { name: 'Tutup input data lama' }).click();
        await dialog().waitFor({ state: 'hidden' });
        check(`${device.name}: accessible manual form, persisted receipt, and exact refund`);
    }
    assert.deepEqual(runtimeErrors, []);
    console.log(`PASS ${checks} isolated manual transaction browser checks; no runtime errors`);
} finally {
    await browser.close();
    await db.close();
}
