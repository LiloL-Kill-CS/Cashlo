import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import { createStockTestDatabase } from './stockTestDatabase.mjs';

// Browser requests use synthetic owner data and isolated PGlite, never live SQL.
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.INVENTORY_TEST_URL || 'http://localhost:3100';
const artifactDir = path.resolve('.test-artifacts');
await mkdir(artifactDir, { recursive: true });
const db = await createStockTestDatabase(await mkdtemp(path.join(artifactDir, 'product-supply-db-')));
await db.exec(`
  insert into public.users(id,name,username,password_hash,role,owner_id)
  values ('test-owner','Test Cafe','test-owner','!no-login!','admin','test-owner');
  insert into public.products(id,name,owner_id,category,sell_price,cost_price,modifiers,is_active)
  values ('test-vanila','Vanila Coffee','test-owner','coffee',18000,6000,'[]',true);
`);
const jwt = JSON.stringify({ role: 'authenticated', sub: 'test-owner', owner_id: 'test-owner', user_role: 'admin' });
await db.transaction(async tx => {
    await tx.exec('set local role authenticated');
    await tx.query("select set_config('request.jwt.claims',$1,true)", [jwt]);
    await tx.query('select * from public.create_supply($1::jsonb)', [JSON.stringify({ name: 'Butter syrup', unit: 'ml', pack_size: 750, servings_per_pack: 50, initial_packs: 1 })]);
    await tx.query('select * from public.create_supply($1::jsonb)', [JSON.stringify({ name: 'Vanila syrup', unit: 'ml', pack_size: 750, initial_packs: 1 })]);
    await tx.query('select * from public.create_supply($1::jsonb)', [JSON.stringify({ name: 'Gula', unit: 'g', pack_size: 1000, initial_packs: 1 })]);
});
let failNextProductSave = false;
let failNextProductRefresh = false;
let productSaveCalls = 0;
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
const page = await context.newPage();
const runtimeErrors = [];
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
    if (endpoint === 'products' && method === 'GET' && failNextProductRefresh) {
        failNextProductRefresh = false;
        return await route.fulfill({ status: 503, json: { message: 'Synthetic product catalog refresh failure' } });
    }
    if (endpoint === 'rpc/save_product_with_supplies') {
        productSaveCalls++;
        if (failNextProductSave) {
            failNextProductSave = false;
            return await route.fulfill({ status: 503, json: { message: 'Synthetic product save failure' } });
        }
    }
    try {
        const result = await db.transaction(async tx => {
            await tx.exec('set local role authenticated');
            await tx.query("select set_config('request.jwt.claims',$1,true)", [jwt]);
            if (endpoint === 'products') return (await tx.query("select * from public.products where owner_id='test-owner' order by name")).rows
                .map(row => ({ ...row, sell_price: Number(row.sell_price), cost_price: Number(row.cost_price) }));
            if (endpoint === 'categories') return [{ id: 'coffee', name: 'Coffee', owner_id: 'test-owner', order: 1 }];
            if (endpoint === 'supplies') return (await tx.query('select * from public.supplies order by name')).rows;
            if (endpoint === 'supply_menu_links') return (await tx.query("select l.*,jsonb_build_object('id',s.id,'name',s.name,'unit',s.unit,'pack_size',s.pack_size,'stock',s.stock) as supplies,jsonb_build_object('name',p.name) as products from public.supply_menu_links l join public.supplies s on s.id=l.supply_id join public.products p on p.id=l.product_id")).rows;
            if (endpoint === 'rpc/save_product_with_supplies') {
                const input = request.postDataJSON();
                return (await tx.query('select * from public.save_product_with_supplies($1::jsonb,$2::jsonb)', [JSON.stringify(input.p_data), input.p_supplies == null ? null : JSON.stringify(input.p_supplies)])).rows[0];
            }
            if (endpoint === 'transactions') {
                if (method === 'POST') {
                    const body = request.postDataJSON();
                    const item = Array.isArray(body) ? body[0] : body;
                    const fields = ['id','datetime','user_id','owner_id','customer_id','items','subtotal','total_cost','total_profit','payment_method','cash_received','change','status','inventory_source','manual_txn_count','created_at'];
                    return (await tx.query(`insert into public.transactions (${fields.join(',')}) values (${fields.map((_,i)=>`$${i+1}`).join(',')}) returning *`, fields.map(key => item[key] ?? null))).rows;
                }
                const id = url.searchParams.get('id')?.replace(/^eq\./, '');
                const rows = (await tx.query(id ? 'select * from public.transactions where id=$1 and owner_id=$2' : 'select * from public.transactions where owner_id=$1 order by datetime desc', id ? [id,'test-owner'] : ['test-owner'])).rows;
                const values = rows.map(row => ({ ...row, subtotal:Number(row.subtotal),total_cost:Number(row.total_cost),total_profit:Number(row.total_profit),cash_received:Number(row.cash_received),change:Number(row.change) }));
                return request.headers().accept?.includes('object+json') ? values[0] || null : values;
            }
            if (endpoint === 'supply_stock_logs') return (await tx.query('select * from public.supply_stock_logs order by created_at desc limit 50')).rows;
            return [];
        });
        await route.fulfill({ json: result });
    } catch (error) {
        await route.fulfill({ status: 400, json: { message: error.message, code: error.code } });
    }
});

const dialog = name => page.getByRole('dialog', { name });
const stock = async name => Number((await db.query('select stock from public.supplies where name=$1', [name])).rows[0].stock);
const supplyId = async name => (await db.query('select id from public.supplies where name=$1', [name])).rows[0].id;
const productId = async name => (await db.query('select id from public.products where name=$1', [name])).rows[0]?.id;
const links = async id => (await db.query('select s.name,l.quantity_per_serving,l.quantity_tolerance from public.supply_menu_links l join public.supplies s on s.id=l.supply_id where l.product_id=$1 order by s.name', [id])).rows
    .map(link => [link.name, Number(link.quantity_per_serving), Number(link.quantity_tolerance)]);
const setBalance = async (name, quantity) => {
    const id = await supplyId(name);
    return db.transaction(async tx => {
        await tx.exec('set local role authenticated');
        await tx.query("select set_config('request.jwt.claims',$1,true)", [jwt]);
        await tx.query('select * from public.adjust_supply_stock($1,$2,$3,$4)', [id, 'adjust', quantity, 'Synthetic browser fixture']);
    });
};
const noOverflow = async label => assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${label} overflow`);
const addIngredient = async (container, index, name, dose, tolerance = 0) => {
    await container.getByRole('button', { name: '+ Tambah bahan' }).click();
    // The category select comes first; ingredient selects follow in row order.
    await container.getByRole('combobox').nth(index).selectOption(await supplyId(name));
    if (dose !== 'suggested') await container.getByLabel(new RegExp(`Takaran bahan ${index}`)).fill(String(dose));
    await container.getByLabel(new RegExp(`Variasi bahan ${index}`)).fill(String(tolerance));
};
const saveProduct = async (container, buttonName) => {
    await container.getByRole('button', { name: buttonName, exact: true }).click();
    await container.waitFor({ state: 'hidden' });
};
const date = new Date();
const localDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}T12:00`;
let checks = 0;
const check = message => { checks++; console.log(`PASS ${message}`); };

try {
    await page.goto(`${base}/products`);
    await page.getByRole('heading', { name: 'Produk' }).waitFor();
    await page.getByRole('button', { name: 'Atur bahan Vanila Coffee' }).waitFor();
    await page.getByRole('button', { name: 'Atur bahan Vanila Coffee' }).click();
    const existing = dialog('Edit Produk');
    await existing.getByRole('heading', { name: 'Bahan per porsi' }).waitFor();
    await addIngredient(existing, 1, 'Butter syrup', 20, 2);
    await addIngredient(existing, 2, 'Vanila syrup', 20, 0);
    await addIngredient(existing, 3, 'Gula', 5, 0);
    await saveProduct(existing, 'Simpan Perubahan');
    assert.deepEqual(await links('test-vanila'), [['Butter syrup',20,2],['Gula',5,0],['Vanila syrup',20,0]]);
    assert.equal(await stock('Butter syrup'), 750);
    check('existing unlinked Vanila menu gains custom 20 ml doses without changing stock');

    await page.getByRole('button', { name: '+ Tambah Produk' }).click();
    const fresh = dialog('Tambah Produk');
    await fresh.getByRole('heading', { name: 'Bahan per porsi' }).waitFor();
    await fresh.getByLabel('Nama Produk').fill('Butter Latte');
    await fresh.getByLabel('Kategori').selectOption('coffee');
    await fresh.getByLabel('Harga Jual (Rp)').fill('19000');
    await fresh.getByLabel('HPP (Rp)').fill('7000');
    await addIngredient(fresh, 1, 'Butter syrup', 'suggested', 3);
    assert.equal(await fresh.getByLabel(/Takaran bahan 1/).inputValue(), '15');
    await addIngredient(fresh, 2, 'Gula', 5, 0);
    await saveProduct(fresh, 'Tambah Produk');
    const butterId = await productId('Butter Latte');
    assert.ok(butterId);
    assert.deepEqual(await links(butterId), [['Butter syrup',15,3],['Gula',5,0]]);
    assert.equal(await stock('Butter syrup'), 750);
    check('new Butter menu saves suggested 750/50=15 ml dose and sugar atomically');

    await page.reload();
    await page.getByRole('button', { name: 'Edit Butter Latte' }).click();
    const metadata = dialog('Edit Produk');
    assert.equal(Number(await metadata.getByLabel(/Takaran bahan 1/).inputValue()), 15);
    await metadata.getByLabel('Harga Jual (Rp)').fill('19500');
    await saveProduct(metadata, 'Simpan Perubahan');
    assert.deepEqual(await links(butterId), [['Butter syrup',15,3],['Gula',5,0]]);
    await page.getByRole('button', { name: 'Edit Vanila Coffee' }).click();
    const vanilaMetadata = dialog('Edit Produk');
    await vanilaMetadata.getByLabel('Harga Jual (Rp)').fill('18500');
    await saveProduct(vanilaMetadata, 'Simpan Perubahan');
    assert.deepEqual(await links('test-vanila'), [['Butter syrup',20,2],['Gula',5,0],['Vanila syrup',20,0]]);
    check('reload and metadata edits preserve both recipes including custom 20 ml dose');

    await page.goto(`${base}/pos`);
    await page.locator('.product-btn').filter({ hasText: 'Butter Latte' }).click();
    await page.getByRole('button', { name: /Bayar Rp/ }).click();
    const payment = dialog('Pembayaran');
    await payment.getByRole('button', { name: /QRIS/ }).click();
    await payment.getByRole('button', { name: /Konfirmasi Pembayaran/ }).click();
    await page.getByRole('heading', { name: 'Pembayaran Berhasil!' }).waitFor();
    assert.equal(await stock('Butter syrup'), 735);
    assert.equal(await stock('Gula'), 995);
    assert.equal(await stock('Vanila syrup'), 750);
    check('POS payment consumes newly configured Butter 15 ml plus sugar 5 g');

    await setBalance('Butter syrup', 750);
    await setBalance('Gula', 1000);
    await page.goto(`${base}/reports`);
    await page.getByRole('button', { name: /Input Data Lama/ }).click();
    const manual = dialog('Input Data Transaksi Lama');
    await manual.getByLabel('Tanggal & Waktu').fill(localDate);
    await manual.getByRole('button', { name: 'Tambah menu Butter Latte' }).click();
    await manual.getByRole('spinbutton', { name: 'Jumlah porsi Butter Latte' }).fill('30');
    await manual.getByRole('button', { name: 'Simpan Data Lama' }).click();
    await manual.waitFor({ state: 'hidden' });
    assert.equal(await stock('Butter syrup'), 300);
    assert.equal(await stock('Gula'), 850);
    check('Input Data Lama uses newly configured recipe for 30 Butter portions');

    await setBalance('Butter syrup', 750);
    await setBalance('Gula', 1000);
    await page.goto(`${base}/pos`);
    await page.locator('.product-btn').filter({ hasText: 'Butter Latte' }).click();
    await page.locator('.product-btn').filter({ hasText: 'Vanila Coffee' }).click();
    await page.getByRole('button', { name: /Bayar Rp/ }).click();
    await dialog('Pembayaran').getByRole('button', { name: /QRIS/ }).click();
    await dialog('Pembayaran').getByRole('button', { name: /Konfirmasi Pembayaran/ }).click();
    await page.getByRole('heading', { name: 'Pembayaran Berhasil!' }).waitFor();
    assert.equal(await stock('Butter syrup'), 715);
    assert.equal(await stock('Vanila syrup'), 730);
    assert.equal(await stock('Gula'), 990);
    check('two menus share Butter syrup while Vanila also uses its custom syrup and both use sugar');

    await page.goto(`${base}/products`);
    await page.getByRole('button', { name: '+ Tambah Produk' }).click();
    const failed = dialog('Tambah Produk');
    await failed.getByLabel('Nama Produk').fill('Failed Latte');
    await failed.getByLabel('Kategori').selectOption('coffee');
    await failed.getByLabel('Harga Jual (Rp)').fill('18000');
    await failed.getByLabel('HPP (Rp)').fill('6000');
    await addIngredient(failed, 1, 'Butter syrup', 'suggested');
    failNextProductSave = true;
    const savesBefore = productSaveCalls;
    await failed.getByRole('button', { name: 'Tambah Produk', exact: true }).click();
    await failed.getByRole('alert').filter({ hasText: 'Synthetic product save failure' }).waitFor();
    assert.equal(productSaveCalls - savesBefore, 1);
    assert.equal(await productId('Failed Latte'), undefined);
    assert.deepEqual(await links('test-vanila'), [['Butter syrup',20,2],['Gula',5,0],['Vanila syrup',20,0]]);
    assert.equal(await stock('Butter syrup'), 715);
    check('failed atomic product save leaves product, recipes, and stock unchanged');
    await failed.getByRole('button', { name: 'Tutup formulir produk' }).click();

    await page.getByRole('button', { name: '+ Tambah Produk' }).click();
    const savedWithoutRefresh = dialog('Tambah Produk');
    await savedWithoutRefresh.getByLabel('Nama Produk').fill('Refresh Latte');
    await savedWithoutRefresh.getByLabel('Kategori').selectOption('coffee');
    await savedWithoutRefresh.getByLabel('Harga Jual (Rp)').fill('18000');
    await savedWithoutRefresh.getByLabel('HPP (Rp)').fill('6000');
    await addIngredient(savedWithoutRefresh, 1, 'Butter syrup', 'suggested');
    failNextProductRefresh = true;
    const savesBeforeRefreshFailure = productSaveCalls;
    await saveProduct(savedWithoutRefresh, 'Tambah Produk');
    assert.equal(productSaveCalls - savesBeforeRefreshFailure, 1);
    assert.ok(await productId('Refresh Latte'), 'RPC committed the product before refresh failed');
    await page.getByRole('alert').filter({ hasText: 'Produk dan bahan sudah tersimpan' }).waitFor({ timeout: 3000 });
    await page.getByRole('button', { name: '+ Tambah Produk' }).waitFor({ state: 'visible' });
    assert.equal(await page.getByRole('button', { name: '+ Tambah Produk' }).isDisabled(), true);
    await page.getByRole('button', { name: 'Muat ulang produk' }).click();
    await page.getByRole('button', { name: 'Edit Refresh Latte' }).waitFor();
    assert.equal((await db.query("select count(*)::int as count from public.products where name='Refresh Latte'")).rows[0].count, 1);
    assert.equal(productSaveCalls - savesBeforeRefreshFailure, 1);
    assert.equal(await stock('Butter syrup'), 715);
    check('successful RPC with failed catalog refresh reports saved state and reloads without duplicate write');

    for (const device of [
        { name: 'small-phone', width: 320, height: 700 },
        { name: 'phone', width: 390, height: 844 },
        { name: 'tablet', width: 820, height: 1180 },
        { name: 'laptop', width: 1366, height: 768 },
    ]) {
        await page.setViewportSize({ width: device.width, height: device.height });
        await page.goto(`${base}/products`);
        await page.getByRole('button', { name: 'Edit Vanila Coffee' }).click();
        const responsive = dialog('Edit Produk');
        await responsive.getByRole('heading', { name: 'Bahan per porsi' }).waitFor();
        const bounds = await responsive.boundingBox();
        assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= device.width, `${device.name} dialog clipped`);
        assert.ok(bounds.y >= 0 && bounds.y + bounds.height <= device.height, `${device.name} dialog too tall`);
        assert.equal(Number(await responsive.getByLabel(/Takaran bahan 1/).inputValue()), 20);
        await noOverflow(`${device.name} Products`);
        await responsive.getByRole('button', { name: 'Simpan Perubahan' }).scrollIntoViewIfNeeded();
        await page.screenshot({ path: path.join(artifactDir, `product-supply-${device.name}.png`), fullPage: true });
        await responsive.getByRole('button', { name: 'Tutup formulir produk' }).click();
        check(`${device.name}: Products recipe edit stays visible without overflow`);
    }
    assert.deepEqual(runtimeErrors, []);
    console.log(`PASS ${checks} product recipe and stock browser checks; no runtime errors`);
} finally {
    await browser.close();
    await db.close();
}
