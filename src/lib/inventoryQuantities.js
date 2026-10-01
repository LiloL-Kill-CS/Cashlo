// Supply stock is kept in its base unit (for example ml, gram, or pcs).
// The database uses numeric(18, 6), so calculations shown in the UI use the
// same precision. The database RPC remains the authority for stock changes.
const PRECISION = 1_000_000;

export function roundSupplyQuantity(value) {
    return Math.round((value + Number.EPSILON) * PRECISION) / PRECISION;
}

export function parseSupplyQuantity(value, label, { allowZero = false, whole = false } = {}) {
    const raw = typeof value === 'number' ? String(value) : String(value ?? '').trim();
    if (!/^\d+(?:[.,]\d+)?$/.test(raw)) {
        throw new Error(`${label} harus berupa angka yang valid`);
    }
    const quantity = Number(raw.replace(',', '.'));
    if (!Number.isFinite(quantity) || quantity >= 1_000_000_000_000 ||
        quantity < 0 || (!allowZero && quantity === 0) ||
        (whole && !Number.isSafeInteger(quantity)) ||
        roundSupplyQuantity(quantity) !== quantity) {
        throw new Error(`${label} harus ${whole ? 'bilangan bulat positif' : `antara ${allowZero ? '0' : '0,000001'} dan 1 triliun (maksimal 6 angka desimal)`}`);
    }
    return quantity;
}

export function quantityPerServing(packSize, servingsPerPack) {
    const pack = parseSupplyQuantity(packSize, 'Ukuran kemasan');
    const servings = parseSupplyQuantity(servingsPerPack, 'Porsi per kemasan', { whole: true });
    if (pack / servings < 1 / PRECISION) {
        throw new Error('Porsi per kemasan terlalu besar untuk ukuran kemasan');
    }
    const amount = roundSupplyQuantity(pack / servings);
    if (amount <= 0) throw new Error('Porsi per kemasan terlalu besar untuk ukuran kemasan');
    return amount;
}

export function supplyStockPreview(supply, action, amount) {
    const stock = parseSupplyQuantity(supply.stock ?? 0, 'Stok saat ini', { allowZero: true });
    const packSize = parseSupplyQuantity(supply.pack_size ?? 1, 'Ukuran kemasan');
    let change;
    if (action === 'restock') {
        const packs = parseSupplyQuantity(amount, 'Jumlah kemasan', { whole: true });
        change = roundSupplyQuantity(packs * packSize);
    } else if (action === 'consume') {
        const servings = parseSupplyQuantity(amount, 'Jumlah porsi', { whole: true });
        const yieldCount = parseSupplyQuantity(supply.servings_per_pack, 'Porsi per kemasan', { whole: true });
        quantityPerServing(packSize, yieldCount);
        change = -roundSupplyQuantity(servings * packSize / yieldCount);
    } else if (action === 'consume_quantity') {
        change = -parseSupplyQuantity(amount, 'Jumlah dipakai');
    } else if (action === 'adjust') {
        const next = parseSupplyQuantity(amount, 'Stok baru', { allowZero: true });
        change = roundSupplyQuantity(next - stock);
    } else {
        throw new Error('Jenis perubahan stok tidak dikenal');
    }
    const remaining = roundSupplyQuantity(stock + change);
    if (remaining < 0) throw new Error('Stok tidak cukup untuk jumlah porsi tersebut');
    if (remaining > 1_000_000_000_000) throw new Error('Stok melebihi batas maksimum');
    return { change, remaining };
}

export function remainingSupplyServings(supply) {
    if (!supply.servings_per_pack) return null;
    const stock = parseSupplyQuantity(supply.stock ?? 0, 'Stok saat ini', { allowZero: true });
    const packSize = parseSupplyQuantity(supply.pack_size, 'Ukuran kemasan');
    const yieldCount = parseSupplyQuantity(supply.servings_per_pack, 'Porsi per kemasan', { whole: true });
    quantityPerServing(packSize, yieldCount);
    // Do not round the ratio up to a whole serving the balance cannot fund.
    // Confirm against the same batch rounding used by the stock RPC.
    let count = Math.floor(stock * yieldCount / packSize);
    if (roundSupplyQuantity((count + 1) * packSize / yieldCount) <= stock) count += 1;
    if (roundSupplyQuantity(count * packSize / yieldCount) > stock) count -= 1;
    return Math.max(0, count);
}
