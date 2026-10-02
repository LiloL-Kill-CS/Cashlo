import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import { createStockTestDatabase } from './stockTestDatabase.mjs';

// Browser UI with isolated PostgreSQL. All POS sale and reversal stock changes
// are made by the actual database triggers; no production API is contacted.
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.INVENTORY_TEST_URL || 'http://localhost:3100';
const artifactDir = path.resolve('.test-artifacts');
await mkdir(artifactDir, { recursive: true });
const db = await createStockTestDatabase(await mkdtemp(path.join(artifactDir, 'reversal-db-')));
await db.exec(`
  insert into public.users(id,name,username,password_hash,role,owner_id)
  values ('test-owner','Test Cafe','test-owner','!no-login!','admin','test-owner');
  insert into public.products(id,name,owner_id,category,sell_price,cost_price,modifiers,is_active)
  values ('test-latte','Vanilla Latte','test-owner','Coffee',18000,6000,'[]',true);
`);
const ownerJwt = JSON.stringify({ role: 'authenticated', sub: 'test-owner', owner_id: 'test-owner', user_role: 'admin' });
const syrup = await db.transaction(async tx => {
    await tx.exec('set local role authenticated');
    await tx.query("select set_config('request.jwt.claims',$1,true)", [ownerJwt]);
    return (await tx.query('select * from public.save_supply_with_menus($1::jsonb,$2::jsonb)', [
        JSON.stringify({ name: 'Syrup vanilla', unit: 'ml', pack_size: 750, initial_packs: 1 }),
        JSON.stringify([{ product_id: 'test-latte', quantity_per_serving: 15, quantity_tolerance: 3 }]),
    ])).rows[0];
});
assert.ok(syrup?.id);

let failNextPatch = false;
let failNextDelete = false;
const browserErrors = [];
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
page.on('pageerror', error => browserErrors.push(error.message));
await context.route('**/api/auth/me', route => route.fulfill({ json: {
    user: { id: 'test-owner', owner_id: 'test-owner', name: 'Test Cafe', role: 'admin' }, supabaseToken: null,
} }));
await context.route('**/api/users', route => route.fulfill({ json: { users: [{ id: 'test-owner' }] } }));
await context.route('**/rest/v1/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const endpoint = url.pathname.split('/rest/v1/')[1];
    const method = request.method();
    if (endpoint === 'transactions' && method === 'PATCH' && failNextPatch) {
        failNextPatch = false;
        return await route.fulfill({ status: 503, json: { message: 'Synthetic cancellation failure' } });
    }
    if (endpoint === 'transactions' && method === 'DELETE' && failNextDelete) {
        failNextDelete = false;
        return await route.fulfill({ status: 503, json: { message: 'Synthetic deletion failure' } });
    }
    try {
        const result = await db.transaction(async tx => {
            await tx.exec('set local role authenticated');
            await tx.query("select set_config('request.jwt.claims',$1,true)", [ownerJwt]);
            if (endpoint === 'products') {
                const rows = (await tx.query('select * from public.products where owner_id=$1 and is_active=true order by name', ['test-owner'])).rows;
                return rows.map(row => ({ ...row, sell_price: Number(row.sell_price), cost_price: Number(row.cost_price) }));
            }
            if (endpoint === 'transactions') {
                const id = url.searchParams.get('id')?.replace(/^eq\./, '');
                if (method === 'POST') {
                    const body = request.postDataJSON();
                    const item = Array.isArray(body) ? body[0] : body;
                    const fields = ['id', 'datetime', 'user_id', 'owner_id', 'customer_id', 'items', 'subtotal', 'total_cost', 'total_profit', 'payment_method', 'cash_received', 'change', 'status', 'inventory_source', 'created_at'];
                    const row = (await tx.query(`insert into public.transactions (${fields.join(',')}) values (${fields.map((_, i) => `$${i + 1}`).join(',')}) returning id`, fields.map(key => item[key] ?? null))).rows[0];
                    return [row];
                }
                if (method === 'PATCH') {
                    const body = request.postDataJSON();
                    return (await tx.query('update public.transactions set status=$1 where id=$2 and owner_id=$3 returning id', [body.status, id, 'test-owner'])).rows;
                }
                if (method === 'DELETE') {
                    return (await tx.query('delete from public.transactions where id=$1 and owner_id=$2 returning id', [id, 'test-owner'])).rows;
                }
                const rows = (await tx.query(id
                    ? 'select * from public.transactions where id=$1 and owner_id=$2'
                    : 'select * from public.transactions where owner_id=$1 order by datetime desc',
                id ? [id, 'test-owner'] : ['test-owner'])).rows;
                return request.headers().accept?.includes('object+json') ? rows[0] || null : rows;
            }
            if (endpoint === 'supplies') return (await tx.query('select * from public.supplies order by name')).rows;
            if (endpoint === 'supply_stock_logs') return (await tx.query('select * from public.supply_stock_logs order by created_at desc limit 50')).rows;
            if (endpoint === 'supply_menu_links') return (await tx.query("select l.*,jsonb_build_object('name',p.name) as products from public.supply_menu_links l join public.products p on p.id=l.product_id")).rows;
            return [];
        });
        await route.fulfill({ json: result });
    } catch (error) {
        await route.fulfill({ status: 400, json: { message: error.message, code: error.code } });
    }
});

const stock = async () => Number((await db.query('select stock from public.supplies where id=$1', [syrup.id])).rows[0].stock);
const txn = async id => (await db.query('select * from public.transactions where id=$1', [id])).rows[0] || null;
const lastTxnId = async () => (await db.query('select id from public.transactions order by created_at desc,id desc limit 1')).rows[0].id;
const reversalLogs = async id => (await db.query("select * from public.supply_stock_logs where action='reversal' and transaction_id=$1", [id])).rows;
const row = id => page.getByTestId(`transaction-row-${id}`);
const noOverflow = async label => {
    const offenders = await page.evaluate(() => [...document.querySelectorAll('body *')]
        .filter(element => element.getBoundingClientRect().right > innerWidth + 1)
        .slice(0, 10)
        .map(element => ({ tag: element.tagName, className: String(element.className).slice(0, 70), right: Math.round(element.getBoundingClientRect().right) })));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${label} horizontal overflow ${JSON.stringify(offenders)}`);
};
const expectInventory = async quantity => {
    await page.goto(`${base}/inventory`);
    await page.getByRole('article', { name: 'Syrup vanilla' }).waitFor();
    assert.match(await page.getByRole('article', { name: 'Syrup vanilla' }).innerText(), new RegExp(`\\b${quantity}\\b`));
};
const sale = async () => {
    await page.goto(`${base}/pos`);
    await page.locator('.product-btn').filter({ hasText: 'Vanilla Latte' }).click();
    await page.getByRole('button', { name: /Bayar Rp/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Pembayaran' });
    await dialog.getByRole('button', { name: /QRIS/ }).click();
    await dialog.getByRole('button', { name: /Konfirmasi Pembayaran/ }).click();
    await page.getByRole('heading', { name: 'Pembayaran Berhasil!' }).waitFor();
    const id = await lastTxnId();
    await page.getByRole('button', { name: 'Pesanan Baru' }).click();
    assert.equal(await stock(), 735);
    return id;
};
const reports = async id => {
    await page.goto(`${base}/reports`);
    await row(id).waitFor();
    return row(id);
};
const confirmAction = async (button, accept = true) => {
    page.once('dialog', dialog => accept ? dialog.accept() : dialog.dismiss());
    await button.click();
};
let checks = 0;
const check = message => { checks++; console.log(`PASS ${message}`); };

try {
    const canceledId = await sale();
    await reports(canceledId);
    await confirmAction(row(canceledId).getByRole('button', { name: `Batalkan transaksi ${canceledId}` }), false);
    assert.equal((await txn(canceledId)).status, 'completed');
    assert.equal(await stock(), 735);
    check('declined cancellation leaves receipt and stock unchanged');
    await confirmAction(row(canceledId).getByRole('button', { name: `Batalkan transaksi ${canceledId}` }));
    await row(canceledId).getByText('Dibatalkan').waitFor();
    assert.equal((await txn(canceledId)).status, 'voided');
    assert.equal(await stock(), 750);
    assert.equal((await reversalLogs(canceledId)).length, 1);
    check('Reports cancellation refunds the exact POS deduction once');
    await expectInventory(750);
    check('Inventory displays restored balance after cancellation');
    await reports(canceledId);
    await confirmAction(row(canceledId).getByRole('button', { name: `Hapus transaksi ${canceledId}` }));
    await row(canceledId).waitFor({ state: 'hidden' });
    assert.equal(await txn(canceledId), null);
    assert.equal(await stock(), 750);
    assert.equal((await reversalLogs(canceledId)).length, 1);
    check('deleting canceled receipt does not refund stock twice');

    const deletedId = await sale();
    await reports(deletedId);
    await confirmAction(row(deletedId).getByRole('button', { name: `Hapus transaksi ${deletedId}` }));
    await row(deletedId).waitFor({ state: 'hidden' });
    assert.equal(await txn(deletedId), null);
    assert.equal(await stock(), 750);
    assert.equal((await reversalLogs(deletedId)).length, 1);
    check('direct deletion of completed receipt restores exact POS usage');

    const failureId = await sale();
    await reports(failureId);
    failNextPatch = true;
    await confirmAction(row(failureId).getByRole('button', { name: `Batalkan transaksi ${failureId}` }));
    await page.getByRole('alert').filter({ hasText: 'Synthetic cancellation failure' }).waitFor();
    assert.equal((await txn(failureId)).status, 'completed');
    assert.equal(await stock(), 735);
    assert.equal((await reversalLogs(failureId)).length, 0);
    check('failed cancellation is visible and preserves receipt, stock and ledger');
    failNextDelete = true;
    await confirmAction(row(failureId).getByRole('button', { name: `Hapus transaksi ${failureId}` }));
    await page.getByRole('alert').filter({ hasText: 'Synthetic deletion failure' }).waitFor();
    assert.ok(await txn(failureId));
    assert.equal(await stock(), 735);
    check('failed deletion is visible and preserves receipt and stock');
    await confirmAction(row(failureId).getByRole('button', { name: `Batalkan transaksi ${failureId}` }));
    await row(failureId).getByText('Dibatalkan').waitFor();
    assert.equal(await stock(), 750);

    // Historical entries are created without the POS marker and have no
    // consumption ledger. Deleting one must never credit a supply balance.
    const manualId = 'manual-history-fixture';
    await db.transaction(async tx => {
        await tx.exec('set local role authenticated');
        await tx.query("select set_config('request.jwt.claims',$1,true)", [ownerJwt]);
        await tx.query("insert into public.transactions(id,datetime,user_id,owner_id,items,subtotal,total_cost,total_profit,payment_method,cash_received,change,status) values ($1,now(),'test-owner','test-owner',$2,18000,6000,12000,'qr',18000,0,'completed')", [manualId, JSON.stringify([{ product_id: 'test-latte', name: 'Vanilla Latte', qty: 1, sell_price: 18000, cost_price: 6000 }])]);
    });
    await reports(manualId);
    await confirmAction(row(manualId).getByRole('button', { name: `Hapus transaksi ${manualId}` }));
    await row(manualId).waitFor({ state: 'hidden' });
    assert.equal(await stock(), 750);
    assert.equal((await reversalLogs(manualId)).length, 0);
    check('manual historical receipt deletion never adds phantom stock');

    for (const device of [
        { name: 'phone', width: 390, height: 844 },
        { name: 'tablet', width: 820, height: 1180 },
        { name: 'laptop', width: 1366, height: 768 },
    ]) {
        await page.setViewportSize({ width: device.width, height: device.height });
        const id = await sale();
        await noOverflow(`${device.name} POS receipt`);
        await reports(id);
        await noOverflow(`${device.name} Reports`);
        const button = row(id).getByRole('button', { name: `Batalkan transaksi ${id}` });
        await button.scrollIntoViewIfNeeded();
        assert.equal(await button.isVisible(), true);
        await confirmAction(button);
        await row(id).getByText('Dibatalkan').waitFor();
        assert.equal(await stock(), 750);
        await noOverflow(`${device.name} canceled Reports`);
        await page.screenshot({ path: path.join(artifactDir, `reversal-${device.name}.png`), fullPage: true });
        await expectInventory(750);
        await noOverflow(`${device.name} Inventory`);
        check(`${device.name}: POS payment, Reports cancellation, Inventory restore and no overflow`);
    }
    assert.deepEqual(browserErrors, []);
    console.log(`PASS ${checks} isolated transaction reversal browser checks; no runtime errors`);
} finally {
    await browser.close();
    await db.close();
}
