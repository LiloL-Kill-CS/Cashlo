import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import { createStockTestDatabase } from './stockTestDatabase.mjs';

// Real POS and Inventory pages, real PostgreSQL triggers, synthetic users and
// menu data. The browser's Supabase requests never reach a live database.
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.INVENTORY_TEST_URL || 'http://localhost:3100';
const artifactDir = path.resolve('.test-artifacts');
await mkdir(artifactDir, { recursive: true });
const db = await createStockTestDatabase(await mkdtemp(path.join(artifactDir, 'pos-stock-db-')));
await db.exec(`
  insert into public.users(id,name,username,password_hash,role,owner_id) values
    ('test-owner','Test Cafe','test-owner','!no-login!','admin','test-owner'),
    ('test-cashier','Test Cashier','test-cashier','!no-login!','kasir','test-owner');
  insert into public.products(id,name,owner_id,category,sell_price,cost_price,modifiers,is_active) values
    ('test-latte','Vanilla Latte','test-owner','Coffee',18000,6000,'[]',true),
    ('test-caramel','Caramel Coffee','test-owner','Coffee',20000,7000,'[]',true),
    ('test-unlinked','Black Coffee','test-owner','Coffee',12000,4000,'[]',true);
`);
const ownerJwt = JSON.stringify({ role: 'authenticated', sub: 'test-owner', owner_id: 'test-owner', user_role: 'admin' });
const syrup = await db.transaction(async tx => {
    await tx.exec('set local role authenticated');
    await tx.query("select set_config('request.jwt.claims',$1,true)", [ownerJwt]);
    return (await tx.query('select * from public.save_supply_with_menus($1::jsonb,$2::jsonb)', [
        JSON.stringify({ name: 'Syrup vanilla', unit: 'ml', pack_size: 750, initial_packs: 1, min_stock_level: 100 }),
        JSON.stringify([
            { product_id: 'test-latte', quantity_per_serving: 15, quantity_tolerance: 3 },
            { product_id: 'test-caramel', quantity_per_serving: 20, quantity_tolerance: 2 },
        ]),
    ])).rows[0];
});
assert.ok(syrup?.id, 'Seeded syrup has an ID');

let appRole = 'admin';
let actorId = 'test-owner';
let delayNextSale = false;
let loseNextSaleResponse = false;
let loseNextRecoveryGet = false;
let salePosts = 0;
const errors = [];
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
page.on('pageerror', error => errors.push(error.message));

await context.route('**/api/auth/me', route => route.fulfill({ json: {
    user: { id: actorId, owner_id: 'test-owner', name: actorId === 'test-owner' ? 'Test Cafe' : 'Test Cashier', role: appRole },
    supabaseToken: null,
} }));
await context.route('**/api/users', route => route.fulfill({ json: { users: [{ id: 'test-owner' }, { id: 'test-cashier' }] } }));
await context.route('**/rest/v1/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const endpoint = url.pathname.split('/rest/v1/')[1];
    try {
        if (endpoint === 'transactions' && request.method() === 'POST') {
            salePosts++;
            if (delayNextSale) {
                delayNextSale = false;
                await new Promise(resolve => setTimeout(resolve, 400));
            }
        }
        if (endpoint === 'transactions' && request.method() === 'GET'
            && url.searchParams.has('id') && loseNextRecoveryGet) {
            loseNextRecoveryGet = false;
            return await route.fulfill({ status: 503, json: { message: 'Synthetic receipt lookup failure' } });
        }
        const result = await db.transaction(async tx => {
            await tx.exec('set local role authenticated');
            await tx.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({
                role: 'authenticated', sub: actorId, owner_id: 'test-owner', user_role: appRole,
            })]);
            if (endpoint === 'products') {
                const rows = (await tx.query('select * from public.products where owner_id=$1 and is_active=true order by name', ['test-owner'])).rows;
                return rows.map(row => ({ ...row, sell_price: Number(row.sell_price), cost_price: Number(row.cost_price) }));
            }
            if (endpoint === 'transactions') {
                if (request.method() === 'POST') {
                    const body = request.postDataJSON();
                    const item = Array.isArray(body) ? body[0] : body;
                    const fields = ['id', 'datetime', 'user_id', 'customer_id', 'items', 'subtotal', 'total_cost', 'total_profit', 'payment_method', 'cash_received', 'change', 'status', 'inventory_source', 'created_at'];
                    const placeholders = fields.map((_, i) => `$${i + 1}`).join(',');
                    const row = (await tx.query(`insert into public.transactions (${fields.join(',')}) values (${placeholders}) returning *`, fields.map(key => item[key] ?? null))).rows[0];
                    return row;
                }
                const id = url.searchParams.get('id')?.replace(/^eq\./, '');
                const rows = (await tx.query(id
                    ? 'select * from public.transactions where id=$1 and owner_id=$2 and user_id=$3'
                    : 'select * from public.transactions where owner_id=$1 order by datetime desc',
                id ? [id, 'test-owner', actorId] : ['test-owner'])).rows;
                return request.headers().accept?.includes('object+json') ? rows[0] || null : rows;
            }
            if (endpoint === 'supplies') return (await tx.query('select * from public.supplies order by name')).rows;
            if (endpoint === 'supply_stock_logs') return (await tx.query('select * from public.supply_stock_logs order by created_at desc limit 50')).rows;
            if (endpoint === 'supply_menu_links') return (await tx.query("select l.*,jsonb_build_object('name',p.name) as products from public.supply_menu_links l join public.products p on p.id=l.product_id order by l.product_id")).rows;
            return [];
        });
        if (endpoint === 'transactions' && request.method() === 'POST' && loseNextSaleResponse) {
            loseNextSaleResponse = false;
            return await route.fulfill({ status: 503, json: { message: 'Synthetic response lost after commit' } });
        }
        await route.fulfill({ json: result });
    } catch (error) {
        await route.fulfill({ status: 400, json: { message: error.message, code: error.code } });
    }
});

const stock = async () => Number((await db.query('select stock from public.supplies where id=$1', [syrup.id])).rows[0].stock);
const txnCount = async () => Number((await db.query('select count(*)::int n from public.transactions')).rows[0].n);
const posLogs = async () => (await db.query('select * from public.supply_stock_logs where transaction_id is not null order by created_at,id')).rows;
const payment = () => page.getByRole('dialog', { name: 'Pembayaran' });
const receipt = () => page.getByRole('heading', { name: 'Pembayaran Berhasil!' });
const product = name => page.locator('.product-btn').filter({ hasText: name });
const openSale = async (lines) => {
    for (const [name, quantity] of lines) {
        for (let i = 0; i < quantity; i++) await product(name).click();
    }
    await page.getByRole('button', { name: /Bayar Rp/ }).click();
    await payment().getByRole('button', { name: /QRIS/ }).click();
};
const confirm = async () => {
    await payment().getByRole('button', { name: /Konfirmasi Pembayaran/ }).click();
    await receipt().waitFor();
};
const newOrder = async () => {
    await page.getByRole('button', { name: 'Pesanan Baru' }).click();
    await receipt().waitFor({ state: 'hidden' });
};
let checks = 0;
const check = message => { checks++; console.log(`PASS ${message}`); };

try {
    await page.goto(`${base}/pos`);
    await page.getByRole('heading', { name: 'Kasir' }).waitFor();
    await product('Vanilla Latte').waitFor();
    await openSale([['Vanilla Latte', 1]]);
    await confirm();
    assert.equal(await stock(), 735);
    assert.equal(await txnCount(), 1);
    assert.deepEqual((await posLogs()).map(log => [log.product_name, Number(log.change_amount)]), [['Vanilla Latte', -15]]);
    check('completed POS sale and ledger deduct 15 ml from 750 ml');
    await newOrder();

    await openSale([['Vanilla Latte', 3], ['Caramel Coffee', 2], ['Black Coffee', 1]]);
    await confirm();
    assert.equal(await stock(), 650);
    assert.equal(await txnCount(), 2);
    assert.equal((await posLogs()).length, 3);
    assert.deepEqual((await posLogs()).map(log => [log.product_name, Number(log.change_amount)]).sort(),
        [['Caramel Coffee', -40], ['Vanilla Latte', -15], ['Vanilla Latte', -45]]);
    check('mixed menu quantities share one syrup balance; unlinked menu consumes none');
    await newOrder();

    await openSale([['Vanilla Latte', 1]]);
    await payment().getByRole('button', { name: 'Batal' }).click();
    await payment().waitFor({ state: 'hidden' });
    assert.equal(await stock(), 650);
    assert.equal(await txnCount(), 2);
    check('cancel payment preserves stock and transaction count');
    // The canceled order stays in the cart; clear it before the next case.
    await page.getByRole('button', { name: /Hapus/ }).click();

    await openSale([['Vanilla Latte', 1]]);
    delayNextSale = true;
    const beforeDouble = salePosts;
    await payment().getByRole('button', { name: /Konfirmasi Pembayaran/ }).evaluate(button => {
        button.click(); button.click();
    });
    await receipt().waitFor();
    assert.equal(salePosts - beforeDouble, 1);
    assert.equal(await txnCount(), 3);
    assert.equal(await stock(), 635);
    check('double confirmation during delayed POST creates one sale and one debit');
    await newOrder();

    await openSale([['Caramel Coffee', 1]]);
    loseNextSaleResponse = true;
    await confirm();
    assert.equal(await txnCount(), 4);
    assert.equal(await stock(), 615);
    assert.equal((await posLogs()).length, 5);
    check('lost post-commit response recovers existing receipt without a second debit');
    await newOrder();

    await openSale([['Caramel Coffee', 1]]);
    loseNextSaleResponse = true;
    loseNextRecoveryGet = true;
    await payment().getByRole('button', { name: /Konfirmasi Pembayaran/ }).click();
    await payment().getByRole('alert').waitFor();
    assert.equal(await stock(), 595);
    assert.equal(await txnCount(), 5);
    const existingSale = (await db.query("select id,payment_method from public.transactions order by created_at desc limit 1")).rows[0];
    assert.equal(existingSale.payment_method, 'qr');
    await payment().getByRole('button', { name: /Tunai/ }).click();
    await payment().getByPlaceholder('Masukkan nominal...').fill('20000');
    await confirm();
    assert.equal(await stock(), 595);
    assert.equal(await txnCount(), 5);
    assert.equal((await posLogs()).length, 6);
    assert.equal((await db.query('select payment_method from public.transactions where id=$1', [existingSale.id])).rows[0].payment_method, 'qr');
    check('retry after two lost responses finds original receipt despite changed tender, without a second debit');
    await newOrder();

    // Deliberately lower only this test database's balance. The failed sale
    // must roll back its transaction and every attempted stock ledger row.
    await db.transaction(async tx => {
        await tx.exec('set local role authenticated');
        await tx.query("select set_config('request.jwt.claims',$1,true)", [ownerJwt]);
        await tx.query('select * from public.adjust_supply_stock($1,$2,$3,$4)', [syrup.id, 'adjust', 5, 'Synthetic shortage']);
    });
    const beforeInsufficientLogs = (await posLogs()).length;
    await openSale([['Vanilla Latte', 1]]);
    await payment().getByRole('button', { name: /Konfirmasi Pembayaran/ }).click();
    await payment().getByRole('alert').filter({ hasText: /Stok.*tidak cukup/i }).waitFor();
    assert.equal(await payment().isVisible(), true);
    assert.equal(await page.locator('.cart-item').count(), 1);
    assert.equal(await stock(), 5);
    assert.equal(await txnCount(), 5);
    assert.equal((await posLogs()).length, beforeInsufficientLogs);
    check('insufficient stock leaves payment and cart intact with no sale or ledger entry');
    await payment().getByRole('button', { name: 'Batal' }).click();
    await page.getByRole('button', { name: /Hapus/ }).click();

    await db.transaction(async tx => {
        await tx.exec('set local role authenticated');
        await tx.query("select set_config('request.jwt.claims',$1,true)", [ownerJwt]);
        await tx.query('select * from public.adjust_supply_stock($1,$2,$3,$4)', [syrup.id, 'adjust', 750, 'Restore synthetic fixture']);
    });
    appRole = 'kasir'; actorId = 'test-cashier';
    await page.reload();
    await product('Vanilla Latte').waitFor();
    await openSale([['Vanilla Latte', 1]]);
    await confirm();
    assert.equal(await stock(), 735);
    assert.equal(await txnCount(), 6);
    assert.equal((await db.query("select user_id from public.transactions order by created_at desc limit 1")).rows[0].user_id, 'test-cashier');
    check('active cashier can sell and debit owner stock');
    await newOrder();

    appRole = 'admin'; actorId = 'test-owner';
    await page.goto(`${base}/inventory`);
    await page.getByRole('article', { name: 'Syrup vanilla' }).waitFor();
    assert.match(await page.getByRole('article', { name: 'Syrup vanilla' }).innerText(), /735/);
    await page.getByRole('button', { name: 'Riwayat bahan' }).click();
    await page.getByRole('cell', { name: 'Vanilla Latte' }).first().waitFor();
    check('Inventory displays POS debit and menu history after cashier sale');

    let remainingAfterResponsiveSales = 735;
    let transactionsAfterResponsiveSales = 6;
    for (const device of [
        { name: 'phone-small', width: 320, height: 844 },
        { name: 'phone', width: 390, height: 844 },
        { name: 'tablet', width: 768, height: 1024 },
        { name: 'tablet-wide', width: 820, height: 1180 },
        { name: 'laptop', width: 1366, height: 768 },
        { name: 'desktop', width: 1440, height: 1000 },
    ]) {
        await page.setViewportSize({ width: device.width, height: device.height });
        await page.goto(`${base}/pos`);
        await product('Vanilla Latte').waitFor();
        await openSale([['Vanilla Latte', 1]]);
        const bounds = await payment().boundingBox();
        assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= device.width, `Payment clipped: ${device.name}`);
        assert.ok(bounds.y >= 0 && bounds.y + bounds.height <= device.height, `Payment too tall: ${device.name}`);
        const overflowing = await page.evaluate(() => [...document.querySelectorAll('body *')]
            .filter(element => element.getBoundingClientRect().right > innerWidth + 1)
            .slice(0, 8)
            .map(element => ({ tag: element.tagName, className: String(element.className).slice(0, 80), right: Math.round(element.getBoundingClientRect().right) })));
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `Horizontal overflow: ${device.name} ${JSON.stringify(overflowing)}`);
        const pay = payment().getByRole('button', { name: /Konfirmasi Pembayaran/ });
        await pay.scrollIntoViewIfNeeded();
        assert.equal(await pay.isVisible(), true, `Confirm unavailable: ${device.name}`);
        if (['phone', 'tablet-wide', 'laptop'].includes(device.name)) {
            await confirm();
            remainingAfterResponsiveSales -= 15;
            transactionsAfterResponsiveSales++;
            assert.equal(await stock(), remainingAfterResponsiveSales, `${device.name} syrup balance`);
            assert.equal(await txnCount(), transactionsAfterResponsiveSales, `${device.name} transaction count`);
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `Receipt overflow: ${device.name}`);
            const receiptBounds = await page.locator('.modal-overlay .modal').boundingBox();
            assert.ok(receiptBounds && receiptBounds.x >= 0 && receiptBounds.x + receiptBounds.width <= device.width, `Receipt clipped: ${device.name}`);
            await page.screenshot({ path: path.join(artifactDir, `pos-stock-${device.name}-receipt.png`), fullPage: true });
            await newOrder();
            check(`${device.name}: completed sale, receipt, and exact 15 ml debit`);
        } else {
            await payment().getByRole('button', { name: 'Batal' }).click();
            check(`${device.name}: payment usable without clipping or stock mutation`);
        }
        await page.screenshot({ path: path.join(artifactDir, `pos-stock-${device.name}.png`), fullPage: true });
    }
    assert.equal(await stock(), 690);
    assert.equal(await txnCount(), 9);
    assert.deepEqual(errors, []);
    console.log(`PASS ${checks} isolated POS and inventory checks; no browser runtime errors`);
} finally {
    await browser.close();
    await db.close();
}
