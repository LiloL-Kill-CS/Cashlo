import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import { createStockTestDatabase } from './stockTestDatabase.mjs';

// Exercise the real UI and SQL migration. Auth and unrelated menu APIs use
// synthetic fixtures; supplies/RPC requests execute against isolated Postgres.
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.INVENTORY_TEST_URL || 'http://localhost:3100';
const artifactDir = path.resolve('.test-artifacts');
await mkdir(artifactDir, { recursive: true });
const dataDir = await mkdtemp(path.join(artifactDir, 'stock-db-'));
let db = await createStockTestDatabase(dataDir);
await db.exec("insert into users(id,name,username,password_hash,role,owner_id) values ('test-owner','Test Cafe','test-cafe','!no-login!','admin','test-owner')");
await db.exec("insert into products(id,name,owner_id) values ('test-latte','Vanilla Latte','test-owner'),('test-caramel','Caramel Coffee','test-owner')");
let appRole = 'admin';
let refreshFailure = false;
let failMutation = false;
let stockCalls = 0;
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await context.route('**/api/auth/me', route => route.fulfill({ json: { user: { id: 'test-owner', owner_id: 'test-owner', name: 'Test Cafe', role: appRole }, supabaseToken: null } }));
await context.route('**/rest/v1/**', async route => {
    const request = route.request(), url = new URL(request.url());
    const endpoint = url.pathname.split('/rest/v1/')[1];
    try {
        if (refreshFailure && request.method() === 'GET' && endpoint === 'supplies') {
            refreshFailure = false;
            return await route.fulfill({ status: 503, json: { message: 'Synthetic reload failure' } });
        }
        if (failMutation && endpoint.startsWith('rpc/')) {
            failMutation = false;
            return await route.fulfill({ status: 503, json: { message: 'Synthetic save failure' } });
        }
        const result = await db.transaction(async tx => {
            await tx.exec('set local role authenticated');
            await tx.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role: 'authenticated', sub: 'test-owner', owner_id: 'test-owner', user_role: appRole })]);
            if (endpoint === 'supplies') {
                if (request.method() === 'PATCH') {
                    const input = request.postDataJSON();
                    const id = url.searchParams.get('id')?.replace(/^eq\./, '');
                    const keys = Object.keys(input).filter(key => ['name', 'unit', 'pack_size', 'servings_per_pack', 'usage_label', 'min_stock_level', 'default_price', 'updated_at'].includes(key));
                    return (await tx.query(`update public.supplies set ${keys.map((key, i) => `${key}=$${i + 1}`).join(',')} where id=$${keys.length + 1} returning *`, [...keys.map(key => input[key]), id])).rows[0];
                }
                return (await tx.query('select * from public.supplies order by name')).rows;
            }
            if (endpoint === 'supply_stock_logs') return (await tx.query('select * from public.supply_stock_logs order by created_at desc limit 50')).rows;
            if (endpoint === 'products') return (await tx.query('select id,name from public.products order by name')).rows;
            if (endpoint === 'supply_menu_links') return (await tx.query("select l.*,jsonb_build_object('name',p.name) as products from public.supply_menu_links l join public.products p on p.id=l.product_id")).rows;
            if (endpoint === 'rpc/save_supply_with_menus') {
                const input = request.postDataJSON();
                return (await tx.query('select * from public.save_supply_with_menus($1::jsonb,$2::jsonb)', [JSON.stringify(input.p_data), JSON.stringify(input.p_menus)])).rows;
            }
            if (endpoint === 'rpc/consume_supply_menu') {
                stockCalls++;
                const input = request.postDataJSON();
                return (await tx.query('select * from public.consume_supply_menu($1,$2,$3,$4)', [input.p_supply_id,input.p_product_id,input.p_servings,input.p_note])).rows[0];
            }
            if (endpoint === 'rpc/create_supply') return (await tx.query('select * from public.create_supply($1::jsonb)', [JSON.stringify(request.postDataJSON().p_data)])).rows;
            if (endpoint === 'rpc/adjust_supply_stock') {
                stockCalls++;
                const input = request.postDataJSON();
                const row = (await tx.query('select * from public.adjust_supply_stock($1,$2,$3,$4)', [input.p_supply_id, input.p_action, input.p_amount, input.p_note])).rows[0];
                // Exercise both composite response formats supported by PostgREST.
                return stockCalls % 2 ? [row] : row;
            }
            if (endpoint === 'warehouses') return [{ id: '00000000-0000-0000-0000-000000000001', name: 'Kedai utama', is_primary: true }];
            return [];
        });
        await route.fulfill({ json: result });
    } catch (error) { await route.fulfill({ status: 400, json: { message: error.message, code: error.code } }); }
});

let checks = 0;
const check = message => { checks++; console.log(`PASS ${message}`); };
const card = name => page.getByRole('article', { name, exact: true });
const modal = () => page.getByRole('dialog');
const waitClosed = () => modal().waitFor({ state: 'hidden' });
const expectText = async (locator, text) => { await locator.filter({ hasText: text }).waitFor({ state: 'visible' }); };

try {
    await page.goto(`${base}/inventory`);
    await page.getByRole('heading', { name: 'Sisa syrup, tanpa menebak.' }).waitFor();
    assert.equal(await page.locator('a[href="/loyalty"]').count(), 0);
    check('empty state and Membership removed');
    await page.getByRole('button', { name: '+ Tambah item', exact: true }).click();
    await modal().getByLabel('Nama item', { exact: true }).fill('Syrup vanilla');
    await modal().getByLabel('Porsi per kemasan').fill('50');
    await modal().getByLabel('Ingatkan saat sisa').fill('150');
    await expectText(modal(), '15 ml');
    await modal().getByRole('button', { name: 'Simpan', exact: true }).click();
    await waitClosed(); await card('Syrup vanilla').waitFor();
    await expectText(card('Syrup vanilla'), '750');
    check('create bottle with saved yield and opening stock');
    await card('Syrup vanilla').getByRole('button', { name: 'Catat pakai' }).click();
    await modal().getByLabel('Jumlah porsi yang dibuat').fill('30');
    await expectText(modal(), '300 ml tersisa');
    await modal().getByRole('button', { name: 'Simpan pemakaian' }).click();
    await waitClosed(); await expectText(card('Syrup vanilla'), '≈ 20 porsi');
    assert.equal(Number((await db.query("select stock from supplies where name='Syrup vanilla'")).rows[0].stock), 300);
    check('30 coffees leave 300 ml and 20 portions');
    await card('Syrup vanilla').getByRole('button', { name: 'Catat pakai' }).click();
    const callsBefore = stockCalls;
    await modal().locator('form').evaluate(form => {
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    await waitClosed();
    assert.equal(stockCalls - callsBefore, 1);
    assert.equal(Number((await db.query("select stock from supplies where name='Syrup vanilla'")).rows[0].stock), 285);
    await card('Syrup vanilla').getByRole('button', { name: 'Hitung ulang' }).click();
    await modal().getByLabel('Jumlah stok sebenarnya').fill('300');
    await modal().getByRole('button', { name: 'Simpan', exact: true }).click(); await waitClosed();
    check('repeated submit applies usage once');
    await page.reload(); await expectText(card('Syrup vanilla'), '≈ 20 porsi');
    check('saved stock survives page reload');
    await card('Syrup vanilla').getByRole('button', { name: 'Catat pakai' }).click();
    await modal().getByLabel('Jumlah porsi yang dibuat').fill('21');
    assert.equal(await modal().getByRole('button', { name: 'Simpan pemakaian' }).isDisabled(), true);
    await page.keyboard.press('Escape'); await waitClosed();
    check('overspend disabled and dialog Escape closes');
    await card('Syrup vanilla').getByRole('button', { name: 'Edit item' }).click();
    assert.equal(await modal().getByLabel(/^Satuan/).isDisabled(), true);
    await modal().getByLabel('Nama item', { exact: true }).fill('Syrup premium');
    await modal().getByRole('button', { name: 'Simpan', exact: true }).click(); await waitClosed();
    assert.equal(Number((await db.query("select stock from supplies where name='Syrup premium'")).rows[0].stock), 300);
    check('metadata edit preserves balance and locks unit');
    await card('Syrup premium').getByRole('button', { name: '+ Isi ulang' }).click();
    await modal().getByLabel('Tambah berapa kemasan?').fill('1');
    refreshFailure = true;
    await modal().getByRole('button', { name: 'Simpan isi ulang' }).click(); await waitClosed();
    assert.equal(Number((await db.query("select stock from supplies where name='Syrup premium'")).rows[0].stock), 1050);
    await page.getByRole('alert').filter({ hasText: 'tersimpan' }).waitFor();
    await page.reload(); await expectText(card('Syrup premium'), '≈ 70 porsi');
    check('restock uses saved pack; refresh failure does not encourage repeat write');
    await card('Syrup premium').getByRole('button', { name: 'Catat pakai' }).click();
    failMutation = true;
    await modal().getByRole('button', { name: 'Simpan pemakaian' }).click();
    await modal().getByRole('alert').waitFor();
    assert.equal(Number((await db.query("select stock from supplies where name='Syrup premium'")).rows[0].stock), 1050);
    await modal().getByRole('button', { name: 'Batal' }).click(); await waitClosed();
    check('failed save keeps dialog open and stock unchanged');
    await card('Syrup premium').getByRole('button', { name: 'Hitung ulang' }).click();
    await modal().getByLabel('Jumlah stok sebenarnya').fill('0');
    await modal().getByRole('button', { name: 'Simpan', exact: true }).click(); await waitClosed();
    assert.equal(await card('Syrup premium').getByRole('button', { name: 'Catat pakai' }).isDisabled(), true);
    await card('Syrup premium').getByRole('button', { name: '+ Isi ulang' }).click();
    await modal().getByRole('button', { name: 'Simpan isi ulang' }).click(); await waitClosed();
    await expectText(card('Syrup premium'), '≈ 50 porsi');
    check('empty item can be refilled without entering details again');
    await page.getByRole('button', { name: '+ Tambah item', exact: true }).click();
    await modal().getByLabel('Nama item', { exact: true }).fill('Gula');
    await modal().getByLabel(/^Satuan/).selectOption('g');
    await modal().getByLabel('Isi satu kemasan').fill('1000');
    await modal().getByRole('button', { name: 'Simpan', exact: true }).click(); await waitClosed();
    await card('Gula').getByRole('button', { name: 'Catat pakai' }).click();
    await modal().getByLabel('Jumlah terpakai (g)').fill('125.5');
    await modal().getByRole('button', { name: 'Simpan pemakaian' }).click(); await waitClosed();
    assert.equal(Number((await db.query("select stock from supplies where name='Gula'")).rows[0].stock), 874.5);
    check('arbitrary supply with decimal base-unit usage');
    await card('Syrup premium').getByRole('button', { name: 'Edit item' }).click();
    assert.equal(await modal().getByLabel('Nama porsi', { exact: true }).count(), 0);
    assert.equal(await modal().getByLabel('Takaran umum (ml / porsi)', { exact: true }).inputValue(), '15');
    assert.equal(await modal().getByLabel('Variasi umum (± ml / porsi)', { exact: true }).inputValue(), '3');
    await modal().getByRole('button', { name: '+ Hubungkan menu', exact: true }).click();
    await modal().getByLabel('Menu 1', { exact: true }).selectOption('test-latte');
    await modal().getByRole('button', { name: 'Hubungkan semua menu', exact: true }).click();
    await modal().getByLabel('Menu 2', { exact: true }).selectOption('test-caramel');
    assert.equal(await modal().getByLabel('Menu 2', { exact: true }).locator('option[value="test-latte"]').count(), 0);
    await modal().getByLabel('Takaran menu 2 (ml / porsi)', { exact: true }).fill('20');
    await modal().getByLabel('Variasi menu 2 (± ml)', { exact: true }).fill('2');
    await modal().getByRole('button', { name: 'Simpan', exact: true }).click(); await waitClosed();
    const links = (await db.query('select product_id,quantity_per_serving,quantity_tolerance from supply_menu_links order by product_id')).rows;
    assert.deepEqual(links.map(row => [row.product_id,Number(row.quantity_per_serving),Number(row.quantity_tolerance)]), [['test-caramel',20,2],['test-latte',15,3]]);
    assert.equal(Number((await db.query("select stock from supplies where name='Syrup premium'")).rows[0].stock), 750);
    check('existing menu picker links all menus; per-menu dose and variation edits preserve stock');
    for (const [productId,expected] of [['test-latte',600],['test-caramel',400]]) {
        await card('Syrup premium').getByRole('button', { name: 'Catat pakai' }).click();
        await modal().getByLabel('Menu yang dibuat', { exact: true }).selectOption(productId);
        await modal().getByLabel('Jumlah porsi yang dibuat', { exact: true }).fill('10');
        await expectText(modal(), productId === 'test-latte' ? '120–180' : '180–220');
        await modal().getByRole('button', { name: 'Simpan pemakaian' }).click(); await waitClosed();
        assert.equal(Number((await db.query("select stock from supplies where name='Syrup premium'")).rows[0].stock), expected);
    }
    await page.reload(); await card('Syrup premium').filter({ hasText: 'Vanilla Latte' }).waitFor();
    await expectText(card('Syrup premium'), 'Caramel Coffee');
    assert.equal((await db.query("select count(*)::int n from supply_stock_logs where product_name in ('Vanilla Latte','Caramel Coffee') and quantity_per_serving in (15,20)")).rows[0].n, 2);
    check('mixed menu usage debits shared stock and keeps menu/dose history across reload');
    await card('Syrup premium').getByRole('button', { name: 'Edit item' }).click();
    await modal().getByLabel('Takaran umum (ml / porsi)', { exact: true }).fill('15');
    await modal().getByLabel('Variasi umum (± ml / porsi)', { exact: true }).fill('3');
    await modal().getByRole('button', { name: 'Terapkan ke semua menu terhubung', exact: true }).click();
    for (const index of [1,2]) {
        assert.equal(await modal().getByLabel(`Takaran menu ${index} (ml / porsi)`, { exact: true }).inputValue(), '15');
        assert.equal(await modal().getByLabel(`Variasi menu ${index} (± ml)`, { exact: true }).inputValue(), '3');
    }
    await modal().getByRole('button', { name: 'Simpan', exact: true }).click(); await waitClosed();
    await page.reload(); await card('Syrup premium').filter({ hasText: 'Vanilla Latte' }).waitFor();
    assert.equal((await db.query('select count(*)::int n from supply_menu_links where quantity_per_serving=15 and quantity_tolerance=3')).rows[0].n, 2);
    assert.equal(Number((await db.query("select stock from supplies where name='Syrup premium'")).rows[0].stock), 400);
    check('apply 15 ml and variation to all linked menus with one action, persisted without stock changes');
    await page.getByLabel('Cari bahan atau perlengkapan').fill('Gula');
    assert.equal(await page.getByRole('article').count(), 1);
    await page.getByLabel('Cari bahan atau perlengkapan').fill('');
    await page.getByRole('button', { name: 'Riwayat bahan', exact: true }).click();
    await page.getByRole('cell', { name: 'Pemakaian', exact: true }).first().waitFor();
    await page.getByRole('cell', { name: '300 ml', exact: true }).first().waitFor();
    await page.getByRole('cell', { name: 'Vanilla Latte', exact: true }).first().waitFor();
    check('search and history with unit/name snapshots');
    await page.getByRole('button', { name: 'Bahan & perlengkapan', exact: true }).click();
    await page.screenshot({ path: path.join(artifactDir, 'inventory-desktop.png'), fullPage: true });
    for (const device of [
        { name: 'phone-small', width: 320, height: 844 },
        { name: 'phone', width: 390, height: 844 },
        { name: 'tablet-portrait', width: 768, height: 1024 },
        { name: 'tablet-wide', width: 820, height: 1180 },
        { name: 'tablet-landscape', width: 1024, height: 768 },
        { name: 'short-landscape', width: 1024, height: 600 },
        { name: 'laptop', width: 1366, height: 768 },
        { name: 'desktop', width: 1440, height: 1000 },
    ]) {
        await page.setViewportSize({ width: device.width, height: device.height });
        await page.waitForFunction(() => {
            const active = document.querySelector('nav[aria-label="Navigasi utama"] a[aria-current="page"]');
            const bounds = active.getBoundingClientRect();
            return bounds.x >= 0 && bounds.right <= innerWidth;
        });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `Page overflow: ${device.name}`);
        for (const button of ['Semua', 'Edit item']) {
            const bounds = await page.getByRole('button', { name: button, exact: true }).first().boundingBox();
            assert.ok(bounds.height >= 44, `Small touch target ${button}: ${device.name}`);
        }
        await card('Syrup premium').getByRole('button', { name: 'Edit item', exact: true }).click();
        const bounds = await modal().boundingBox();
        assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= device.width, `Dialog clipped: ${device.name}`);
        assert.ok(bounds.y >= 0 && bounds.y + bounds.height <= device.height, `Dialog too tall: ${device.name}`);
        assert.equal(await modal().evaluate(element => element.scrollWidth > element.clientWidth), false);
        const save = modal().getByRole('button', { name: 'Simpan', exact: true });
        await save.scrollIntoViewIfNeeded();
        const saveBounds = await save.boundingBox();
        assert.ok(saveBounds.y >= 0 && saveBounds.y + saveBounds.height <= device.height, `Save unreachable: ${device.name}`);
        await page.keyboard.press('Escape'); await waitClosed();
        await page.locator('summary').filter({ hasText: 'Lainnya' }).click();
        const settings = page.getByRole('link', { name: 'Pengaturan', exact: true });
        await settings.scrollIntoViewIfNeeded();
        const settingsBounds = await settings.boundingBox();
        assert.ok(settingsBounds.y >= 0 && settingsBounds.y + settingsBounds.height <= device.height, `Settings unreachable: ${device.name}`);
        await settings.focus(); await page.keyboard.press('Escape');
        assert.equal(await page.locator('details[open]').count(), 0);
        await page.screenshot({ path: path.join(artifactDir, `inventory-${device.name}.png`), fullPage: true });
        check(`${device.name}: page, dialog, touch targets, active navigation, settings`);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
    await page.getByRole('button', { name: '+ Tambah item', exact: true }).click();
    await modal().waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
    for (const width of [320, 390]) {
        await page.setViewportSize({ width, height: 844 });
        const bounds = await modal().boundingBox();
        assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width, `Dialog clipped at ${width}px`);
        assert.equal(await modal().evaluate(element => element.scrollWidth > element.clientWidth), false);
        const saveBounds = await modal().getByRole('button', { name: 'Simpan', exact: true }).boundingBox();
        assert.ok(saveBounds.x + saveBounds.width <= width, `Save button clipped at ${width}px`);
    }
    await page.screenshot({ path: path.join(artifactDir, 'inventory-mobile-dialog.png') });
    await page.keyboard.press('Escape');
    await page.locator('summary').filter({ hasText: 'Lainnya' }).click();
    await page.getByRole('link', { name: 'Pengaturan', exact: true }).waitFor();
    await page.keyboard.press('Escape');
    await page.screenshot({ path: path.join(artifactDir, 'inventory-mobile.png'), fullPage: true });
    check('mobile layout, dialog, and secondary navigation');
    await card('Syrup premium').getByRole('button', { name: 'Edit item' }).click();
    await modal().getByRole('button', { name: /^Hapus Menu/ }).last().click();
    await modal().getByRole('button', { name: 'Simpan', exact: true }).click(); await waitClosed();
    assert.equal((await db.query('select count(*)::int n from supply_menu_links')).rows[0].n, 1);
    assert.equal(Number((await db.query("select stock from supplies where name='Syrup premium'")).rows[0].stock), 400);
    assert.equal((await db.query("select count(*)::int n from supply_stock_logs where product_name is not null")).rows[0].n, 2);
    check('unlinking a menu preserves shared balance and historical menu snapshots');
    appRole = 'kasir';
    await page.reload(); await card('Gula').waitFor();
    assert.equal(await page.getByRole('button', { name: '+ Tambah item', exact: true }).count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Catat pakai', exact: true }).count(), 0);
    check('cashier read-only UI');
    assert.deepEqual(errors, []);
    await browser.close(); await db.close();
    db = await createStockTestDatabase(dataDir, { existing: true });
    const persisted = (await db.query('select name,stock from supplies order by name')).rows;
    assert.deepEqual(persisted.map(row => [row.name, Number(row.stock)]), [['Gula', 874.5], ['Syrup premium', 400]]);
    assert.equal((await db.query('select count(*)::int n from supply_menu_links')).rows[0].n, 1);
    check('stock persists after PostgreSQL shutdown and reopening');
    console.log(`PASS ${checks} browser checks; no runtime errors. Screenshots: ${artifactDir}`);
} catch (error) {
    if (!page.isClosed()) {
        await page.screenshot({ path: path.join(artifactDir, 'inventory-test-failure.png'), fullPage: true }).catch(() => {});
        console.error((await page.locator('body').innerText()).slice(-2200));
        console.error(await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth,
            overflow: [...document.querySelectorAll('body *')].filter(element => !element.closest('aside')).map(element => ({ tag: element.tagName, class: element.className, right: element.getBoundingClientRect().right, width: element.getBoundingClientRect().width })).filter(element => element.right > innerWidth + 1).slice(0, 15) })));
    }
    throw error;
} finally { await browser.close(); await db.close(); }
