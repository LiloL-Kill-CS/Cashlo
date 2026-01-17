import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { generateTransactionId } from '@/lib/db'; // We can reuse this or simple uuid

export function usePurchasing() {
    const [suppliers, setSuppliers] = useState([]);
    const [purchases, setPurchases] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadSuppliers();
        loadPurchases();
    }, []);

    async function loadSuppliers() {
        try {
            const { data, error } = await supabase.from('suppliers').select('*').order('name');
            if (error) throw error;
            setSuppliers(data);
        } catch (error) {
            console.error('Error loading suppliers:', error);
        }
    }

    async function loadPurchases() {
        try {
            const { data, error } = await supabase
                .from('purchases')
                .select(`
                    *,
                    suppliers (name),
                    warehouses (name),
                    users (name)
                `)
                .order('purchase_date', { ascending: false });
            if (error) throw error;
            setPurchases(data);
        } catch (error) {
            console.error('Error loading purchases:', error);
        } finally {
            setLoading(false);
        }
    }

    async function addSupplier(data) {
        const { error } = await supabase.from('suppliers').insert([data]);
        if (error) throw error;
        await loadSuppliers();
    }

    async function updateSupplier(id, data) {
        const { error } = await supabase.from('suppliers').update(data).eq('id', id);
        if (error) throw error;
        await loadSuppliers();
    }

    async function deleteSupplier(id) {
        const { error } = await supabase.from('suppliers').delete().eq('id', id);
        if (error) throw error;
        await loadSuppliers();
    }

    async function createPurchase(purchaseData, items, userId) {
        // purchaseData: { supplier_id, warehouse_id, notes, total_amount }
        // items: [{ product_id, quantity, cost_price }]

        // 1. Create Purchase Record
        const { data: purchase, error: purchaseError } = await supabase
            .from('purchases')
            .insert([{
                ...purchaseData,
                created_by: userId,
                status: 'completed'
            }])
            .select()
            .single();

        if (purchaseError) throw purchaseError;

        // 2. Insert Items & Update Stock
        for (const item of items) {
            const subtotal = item.quantity * item.cost_price;

            // a. Insert Item
            await supabase.from('purchase_items').insert([{
                purchase_id: purchase.id,
                product_id: item.product_id,
                quantity: item.quantity,
                cost_price: item.cost_price,
                subtotal: subtotal
            }]);

            // b. Update Product Cost Price (Optional: Moving Average or Last Price?)
            // Let's update to Last Price for simplicity
            await supabase.from('products').update({ cost_price: item.cost_price }).eq('id', item.product_id);

            // c. Update Stock
            const { data: stockData } = await supabase
                .from('product_stocks')
                .select('quantity')
                .eq('product_id', item.product_id)
                .eq('warehouse_id', purchaseData.warehouse_id)
                .maybeSingle();

            const currentQty = stockData ? parseFloat(stockData.quantity) : 0;
            const newQty = currentQty + parseFloat(item.quantity);

            await supabase.from('product_stocks').upsert({
                product_id: item.product_id,
                warehouse_id: purchaseData.warehouse_id,
                quantity: newQty
            }, { onConflict: 'product_id, warehouse_id' });

            // d. Log Inventory
            await supabase.from('inventory_logs').insert([{
                product_id: item.product_id,
                warehouse_id: purchaseData.warehouse_id,
                change_amount: item.quantity,
                final_stock: newQty,
                type: 'purchase',
                reference_id: purchase.id, // ID refers to purchase ID now
                notes: `Pembelian dari Supplier`,
                created_by: userId
            }]);
        }

        await loadPurchases();
        return purchase;
    }

    return {
        suppliers,
        purchases,
        loading,
        addSupplier,
        updateSupplier,
        deleteSupplier,
        createPurchase,
        reload: () => { loadSuppliers(); loadPurchases(); }
    };
}
