import test from 'node:test';
import assert from 'node:assert/strict';
import {
    quantityPerServing,
    remainingSupplyServings,
    supplyStockPreview,
    parseSupplyQuantity,
} from '../src/lib/inventoryQuantities.js';

test('a 750 ml bottle serving 50 coffees uses 15 ml per coffee', () => {
    const bottle = { stock: 750, pack_size: 750, servings_per_pack: 50 };
    assert.equal(quantityPerServing(bottle.pack_size, bottle.servings_per_pack), 15);
    assert.deepEqual(supplyStockPreview(bottle, 'consume', 30), { change: -450, remaining: 300 });
    assert.equal(remainingSupplyServings({ ...bottle, stock: 300 }), 20);
});

test('restocking reuses saved pack size and adds to the remaining amount', () => {
    assert.deepEqual(
        supplyStockPreview({ stock: 300, pack_size: 750, servings_per_pack: 50 }, 'restock', 2),
        { change: 1500, remaining: 1800 },
    );
});

test('ordinary supplies can use fractional base units and manual correction', () => {
    const sugar = { stock: '120.5', pack_size: '1000.25' };
    assert.deepEqual(supplyStockPreview(sugar, 'restock', 1), { change: 1000.25, remaining: 1120.75 });
    assert.deepEqual(supplyStockPreview(sugar, 'consume_quantity', '20.25'), { change: -20.25, remaining: 100.25 });
    assert.deepEqual(supplyStockPreview(sugar, 'adjust', '0'), { change: -120.5, remaining: 0 });
    assert.equal(remainingSupplyServings(sugar), null);
});

test('a batch consumption rounds once, so a complete pack is removed exactly', () => {
    assert.deepEqual(supplyStockPreview({ stock: 1, pack_size: 1, servings_per_pack: 3 }, 'consume', 3), {
        change: -1,
        remaining: 0,
    });
});

test('rejects overspend and malformed quantities instead of storing invalid stock', () => {
    const bottle = { stock: 300, pack_size: 750, servings_per_pack: 50 };
    assert.throws(() => supplyStockPreview(bottle, 'consume', 21), /Stok tidak cukup/);
    for (const input of ['', '-1', 'NaN', 'Infinity', '1e3', '1.0000001', '0']) {
        assert.throws(() => parseSupplyQuantity(input, 'Jumlah'), /Jumlah/);
    }
    assert.throws(() => supplyStockPreview(bottle, 'restock', 1.5), /bilangan bulat/);
    assert.throws(() => quantityPerServing(0.000001, 2), /terlalu besar/);
});

test('available portions never round up beyond the stock that funds them', () => {
    const almost = { stock: 2.999999, pack_size: 3, servings_per_pack: 1 };
    assert.equal(remainingSupplyServings(almost), 0);
    assert.throws(() => supplyStockPreview(almost, 'consume', 1), /Stok tidak cukup/);
    const repeating = { stock: 0.666667, pack_size: 1, servings_per_pack: 3 };
    assert.equal(remainingSupplyServings(repeating), 2);
    assert.equal(supplyStockPreview(repeating, 'consume', 2).remaining, 0);
});
