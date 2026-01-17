import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export function useInventory(userId, userRole) {
    const [warehouses, setWarehouses] = useState([]);
    const [stocks, setStocks] = useState([]);
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedWarehouseId, setSelectedWarehouseId] = useState(null);

    // Load Warehouses on mount
    useEffect(() => {
        if (userId) {
            loadWarehouses();
        }
    }, [userId]);

    // Load stocks when warehouse changes
    useEffect(() => {
        if (selectedWarehouseId) {
            loadStocks(selectedWarehouseId);
            loadLogs(selectedWarehouseId);
        }
    }, [selectedWarehouseId]);

    async function loadWarehouses() {
        try {
            let query = supabase.from('warehouses').select('*').order('created_at');

            // Filter by owner unless admin
            if (userRole !== 'admin') {
                query = query.eq('owner_id', userId);
            }

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
            // Get products for this user (or all for admin)
            let prodQuery = supabase.from('products').select('id, name, category, sell_price');
            if (userRole !== 'admin') {
                prodQuery = prodQuery.eq('owner_id', userId);
            }
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
        // 1. Get current stock
        const { data: currentStockData } = await supabase
            .from('product_stocks')
            .select('quantity')
            .eq('product_id', productId)
            .eq('warehouse_id', warehouseId)
            .maybeSingle();

        const currentQty = currentStockData ? parseFloat(currentStockData.quantity) : 0;
        const changeAmount = parseFloat(newQuantity) - currentQty;

        if (changeAmount === 0 && type !== 'opname') return;

        // 2. Upsert stock
        const { error: stockError } = await supabase
            .from('product_stocks')
            .upsert({
                product_id: productId,
                warehouse_id: warehouseId,
                quantity: newQuantity
            }, { onConflict: 'product_id, warehouse_id' });

        if (stockError) throw stockError;

        // 3. Create Log
        const { error: logError } = await supabase
            .from('inventory_logs')
            .insert([{
                product_id: productId,
                warehouse_id: warehouseId,
                change_amount: changeAmount,
                final_stock: newQuantity,
                type: type,
                notes: notes,
                created_by: userId
            }]);

        if (logError) console.error('Error creating log:', logError);

        await loadStocks(warehouseId);
        await loadLogs(warehouseId);
    }

    return {
        warehouses,
        stocks,
        logs,
        loading,
        selectedWarehouseId,
        setSelectedWarehouseId,
        loadStocks,
        loadLogs,
        addWarehouse,
        updateWarehouse,
        deleteWarehouse,
        updateStock,
        reload: loadWarehouses
    };
}
