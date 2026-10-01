import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { parseSupplyQuantity, quantityPerServing } from '@/lib/inventoryQuantities';

export function useInventory(userId, userRole, ownerId) {
    const [warehouses, setWarehouses] = useState([]);
    const [stocks, setStocks] = useState([]);
    const [logs, setLogs] = useState([]);
    const [supplies, setSupplies] = useState([]);
    const [supplyLogs, setSupplyLogs] = useState([]);
    const [supplyMenus, setSupplyMenus] = useState([]);
    const [menuProducts, setMenuProducts] = useState([]);
    const [suppliesLoading, setSuppliesLoading] = useState(true);
    const [supplyError, setSupplyError] = useState(null);
    const [loading, setLoading] = useState(true);
    const [selectedWarehouseId, setSelectedWarehouseId] = useState(null);

    // Load Warehouses on mount
    useEffect(() => {
        if (userId) {
            loadWarehouses();
        }
    }, [userId]);

    useEffect(() => {
        setSupplies([]);
        setSupplyLogs([]);
        setSupplyMenus([]);
        setMenuProducts([]);
        setSupplyError(null);
        if (ownerId) {
            loadSupplies().catch(() => {});
        } else {
            setSuppliesLoading(false);
        }
    }, [ownerId]);

    // Load stocks when warehouse changes
    useEffect(() => {
        if (selectedWarehouseId) {
            loadStocks(selectedWarehouseId);
            loadLogs(selectedWarehouseId);
        }
    }, [selectedWarehouseId]);

    async function loadWarehouses() {
        try {
            let query = supabase.from('warehouses').select('*').eq('owner_id', userId).order('created_at');

            const { data, error } = await query;
            if (error) throw error;
            setWarehouses(data);

            // Set default if none selected
            if (data.length > 0 && !selectedWarehouseId) {
                const primary = data.find(w => w.is_primary) || data[0];
                setSelectedWarehouseId(primary.id);
            }
        } catch (error) {
            console.error('Error loading warehouses:', error);
        } finally {
            setLoading(false);
        }
    }

    async function loadStocks(warehouseId) {
        setLoading(true);
        try {
            // Get products for this user only
            let prodQuery = supabase.from('products').select('id, name, category, sell_price').eq('owner_id', userId);
            const { data: products } = await prodQuery;

            // Get stocks for this warehouse
            const { data: stockRecords, error } = await supabase
                .from('product_stocks')
                .select('*')
                .eq('warehouse_id', warehouseId);

            if (error) throw error;

            // Merge
            const merged = products.map(p => {
                const record = stockRecords.find(s => s.product_id === p.id);
                return {
                    ...p,
                    quantity: record ? record.quantity : 0,
                    min_stock_level: record ? record.min_stock_level : 5,
                    stock_id: record ? record.id : null
                };
            });

            setStocks(merged);
        } catch (error) {
            console.error('Error loading stocks:', error);
        } finally {
            setLoading(false);
        }
    }

    async function loadLogs(warehouseId, limit = 50) {
        try {
            const { data, error } = await supabase
                .from('inventory_logs')
                .select(`
                    *,
                    products (name),
                    users (name)
                `)
                .eq('warehouse_id', warehouseId)
                .order('created_at', { ascending: false })
                .limit(limit);

            if (error) throw error;
            setLogs(data);
        } catch (error) {
            console.error('Error loading logs:', error);
        }
    }

    async function addWarehouse(data) {
        const { error } = await supabase.from('warehouses').insert([{
            ...data,
            owner_id: userId // Set owner to current user
        }]);
        if (error) throw error;
        await loadWarehouses();
    }

    async function updateWarehouse(id, data) {
        const { error } = await supabase.from('warehouses').update(data).eq('id', id);
        if (error) throw error;
        await loadWarehouses();
    }

    async function deleteWarehouse(id) {
        const { error } = await supabase.from('warehouses').delete().eq('id', id);
        if (error) throw error;
        await loadWarehouses();
    }

    async function updateStock(productId, warehouseId, newQuantity, type, notes) {
        if (!productId || !warehouseId) throw new Error('Pilih produk dan lokasi stok');
        const quantity = parseSupplyQuantity(newQuantity, 'Jumlah stok baru', { allowZero: true });
        // 1. Get current stock
        const { data: currentStockData, error: currentStockError } = await supabase
            .from('product_stocks')
            .select('quantity')
            .eq('product_id', productId)
            .eq('warehouse_id', warehouseId)
            .maybeSingle();
        if (currentStockError) throw currentStockError;

        const currentQty = currentStockData ? parseFloat(currentStockData.quantity) : 0;
        const changeAmount = quantity - currentQty;

        if (changeAmount === 0 && type !== 'opname') return;

        // 2. Upsert stock
        const { error: stockError } = await supabase
            .from('product_stocks')
            .upsert({
                product_id: productId,
                warehouse_id: warehouseId,
                quantity
            }, { onConflict: 'product_id, warehouse_id' });

        if (stockError) throw stockError;

        // 3. Create Log
        const { error: logError } = await supabase
            .from('inventory_logs')
            .insert([{
                product_id: productId,
                warehouse_id: warehouseId,
                change_amount: changeAmount,
                final_stock: quantity,
                type: type,
                notes: notes,
                created_by: userId
            }]);

        if (logError) console.error('Error creating log:', logError);

        await loadStocks(warehouseId);
        await loadLogs(warehouseId);
    }

    async function deleteStock(productId, warehouseId) {
        // Delete stock record
        const { error } = await supabase
            .from('product_stocks')
            .delete()
            .eq('product_id', productId)
            .eq('warehouse_id', warehouseId);

        if (error) throw error;
        await loadStocks(warehouseId);
    }

    async function fetchSupplies() {
        const { data, error } = await supabase.from('supplies')
            .select('*').eq('owner_id', ownerId).order('name');
        if (error) throw error;
        setSupplies(data || []);
        return data || [];
    }

    async function fetchSupplyLogs(limit = 50) {
        const { data, error } = await supabase.from('supply_stock_logs')
            .select('*').eq('owner_id', ownerId)
            .order('created_at', { ascending: false }).limit(limit);
        if (error) throw error;
        setSupplyLogs(data || []);
        return data || [];
    }

    async function fetchSupplyMenus() {
        const { data, error } = await supabase.from('supply_menu_links')
            .select('supply_id,product_id,quantity_per_serving,quantity_tolerance,products(name)').eq('owner_id', ownerId);
        if (error) throw error;
        const links = (data || []).map(link => ({ ...link, product_name: link.products?.name || '' }));
        setSupplyMenus(links);
        return links;
    }

    async function fetchMenuProducts() {
        const { data, error } = await supabase.from('products')
            .select('id,name').eq('owner_id', ownerId).order('name');
        if (error) throw error;
        setMenuProducts(data || []);
        return data || [];
    }

    async function loadSupplies() {
        setSuppliesLoading(true);
        try {
            const results = await Promise.allSettled([fetchSupplies(), fetchSupplyLogs(), fetchSupplyMenus(), fetchMenuProducts()]);
            const failed = results.find(result => result.status === 'rejected');
            if (failed) throw failed.reason;
            setSupplyError(null);
            return results[0].value;
        } catch (error) {
            setSupplyError('Gagal memuat data bahan atau riwayat. Coba lagi.');
            console.error('Error loading supply inventory:', error);
            throw error;
        } finally {
            setSuppliesLoading(false);
        }
    }

    async function loadSupplyLogs(limit = 50) {
        try {
            return await fetchSupplyLogs(limit);
        } catch (error) {
            setSupplyError('Gagal memuat riwayat bahan. Coba lagi.');
            console.error('Error loading supply logs:', error);
            throw error;
        }
    }

    async function refreshSupplyAfterWrite() {
        try {
            await loadSupplies();
        } catch {
            // The database write already committed. Keep the mutation successful
            // so the user cannot mistake a retry for the first stock change.
            setSupplyError('Perubahan telah tersimpan, tetapi data terbaru belum bisa dimuat. Muat ulang data sebelum mencatat perubahan lain.');
        }
    }

    function requireSupplyAdmin() {
        if (userRole !== 'admin') throw new Error('Hanya admin yang dapat mengubah stok bahan');
        if (!userId || !ownerId) throw new Error('Sesi pengguna tidak tersedia');
        if (supplyError) throw new Error('Muat ulang data bahan sebelum mencatat perubahan berikutnya');
    }

    function supplyMetadata(input) {
        const name = String(input.name ?? '').trim();
        const unit = String(input.unit ?? 'pcs').trim();
        const usageLabel = String(input.usage_label ?? '').trim();
        if (!name || name.length > 120) throw new Error('Nama bahan wajib diisi (maksimal 120 karakter)');
        if (!unit || unit.length > 24) throw new Error('Satuan wajib diisi (maksimal 24 karakter)');
        if (usageLabel.length > 120) throw new Error('Nama menu terlalu panjang');
        const packSize = parseSupplyQuantity(input.pack_size ?? 1, 'Ukuran kemasan');
        const servings = input.servings_per_pack === '' || input.servings_per_pack == null
            ? null : parseSupplyQuantity(input.servings_per_pack, 'Porsi per kemasan', { whole: true });
        if (servings != null) quantityPerServing(packSize, servings);
        return {
            name,
            unit,
            pack_size: packSize,
            servings_per_pack: servings,
            usage_label: usageLabel || null,
            min_stock_level: parseSupplyQuantity(input.min_stock_level === '' ? 0 : input.min_stock_level ?? 0, 'Batas stok menipis', { allowZero: true }),
            default_price: parseSupplyQuantity(input.default_price === '' ? 0 : input.default_price ?? 0, 'Harga kemasan', { allowZero: true }),
        };
    }

    async function saveSupply(input) {
        requireSupplyAdmin();
        const metadata = supplyMetadata(input);
        const duplicate = supplies.find(s => s.id !== input.id && s.name.trim().toLocaleLowerCase() === metadata.name.toLocaleLowerCase());
        if (duplicate) throw new Error(`Bahan "${duplicate.name}" sudah tersimpan. Pilih bahan itu untuk menambah stok.`);
        const existing = input.id ? supplies.find(s => s.id === input.id) : null;
        if (existing && Number(existing.stock) > 0 && existing.unit !== metadata.unit) {
            throw new Error('Kosongkan stok sebelum mengubah satuan bahan');
        }
        const rawMenus = input.menus ?? (input.id ? supplyMenus.filter(link => link.supply_id === input.id) : []);
        if (!Array.isArray(rawMenus) || rawMenus.length > 100) throw new Error('Pilih maksimal 100 menu untuk satu bahan');
        const seen = new Set();
        const menus = rawMenus.map(menu => {
            const productId = String(menu.product_id ?? '').trim();
            if (!menuProducts.some(product => product.id === productId)) throw new Error('Pilih menu yang tersedia di kedai Anda');
            if (seen.has(productId)) throw new Error('Menu yang sama cukup dihubungkan sekali');
            seen.add(productId);
            const dose = parseSupplyQuantity(menu.quantity_per_serving, 'Takaran per porsi menu');
            const tolerance = parseSupplyQuantity(menu.quantity_tolerance ?? 0, 'Variasi takaran menu', { allowZero: true });
            if (tolerance >= dose) throw new Error('Variasi takaran harus lebih kecil dari takaran per porsi');
            return { product_id: productId, quantity_per_serving: dose, quantity_tolerance: tolerance };
        });
        const initialPacks = input.id ? 0 : parseSupplyQuantity(input.initial_packs === '' ? 0 : input.initial_packs ?? 0, 'Jumlah kemasan awal', { allowZero: true, whole: true });
        const { data, error } = await supabase.rpc('save_supply_with_menus', {
            p_data: { ...metadata, ...(input.id ? { id: input.id } : { initial_packs: initialPacks }) },
            p_menus: menus,
        });
        if (error) throw error;
        const result = Array.isArray(data) ? data[0] : data;
        if (result?.id) {
            setSupplies(previous => input.id
                ? previous.map(item => item.id === result.id ? result : item)
                : [...previous, result].sort((a, b) => a.name.localeCompare(b.name)));
        }
        await refreshSupplyAfterWrite();
        return result;
    }

    async function changeSupplyStock(id, action, amount, note = '') {
        requireSupplyAdmin();
        if (!id) throw new Error('Pilih bahan terlebih dahulu');
        const whole = action === 'restock' || action === 'consume';
        const quantity = parseSupplyQuantity(amount, action === 'restock' ? 'Jumlah kemasan' : action === 'consume' ? 'Jumlah porsi' : 'Jumlah stok', {
            allowZero: action === 'adjust', whole,
        });
        const { data, error } = await supabase.rpc('adjust_supply_stock', {
            p_supply_id: id,
            p_action: action,
            p_amount: quantity,
            p_note: String(note ?? '').trim().slice(0, 500),
        });
        if (error) throw error;
        const row = Array.isArray(data) ? data[0] : data;
        if (row?.id) {
            setSupplies(previous => previous.map(item => item.id === row.id ? row : item));
        }
        await refreshSupplyAfterWrite();
        return row;
    }

    async function restockSupply(id, packs, note) {
        return changeSupplyStock(id, 'restock', packs, note);
    }

    async function consumeSupply(id, servings, note) {
        return changeSupplyStock(id, 'consume', servings, note);
    }

    async function consumeSupplyQuantity(id, quantity, note) {
        return changeSupplyStock(id, 'consume_quantity', quantity, note);
    }

    async function consumeSupplyMenu(id, productId, servings, note = '') {
        requireSupplyAdmin();
        if (!supplyMenus.some(link => link.supply_id === id && link.product_id === productId)) {
            throw new Error('Pilih menu yang terhubung dengan bahan ini');
        }
        const quantity = parseSupplyQuantity(servings, 'Jumlah porsi menu', { whole: true });
        const { data, error } = await supabase.rpc('consume_supply_menu', {
            p_supply_id: id, p_product_id: productId, p_servings: quantity,
            p_note: String(note ?? '').trim().slice(0, 500),
        });
        if (error) throw error;
        const row = Array.isArray(data) ? data[0] : data;
        if (row?.id) setSupplies(previous => previous.map(item => item.id === row.id ? row : item));
        await refreshSupplyAfterWrite();
        return row;
    }

    async function adjustSupply(id, quantity, note) {
        return changeSupplyStock(id, 'adjust', quantity, note);
    }

    return {
        warehouses,
        stocks,
        logs,
        supplies,
        supplyLogs,
        supplyMenus,
        menuProducts,
        suppliesLoading,
        supplyError,
        loading,
        selectedWarehouseId,
        setSelectedWarehouseId,
        loadStocks,
        loadLogs,
        addWarehouse,
        updateWarehouse,
        deleteWarehouse,
        updateStock,
        deleteStock,
        loadSupplies,
        loadSupplyLogs,
        saveSupply,
        restockSupply,
        consumeSupply,
        consumeSupplyQuantity,
        consumeSupplyMenu,
        adjustSupply,
        reload: loadWarehouses
    };
}
