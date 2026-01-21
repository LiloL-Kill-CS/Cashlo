import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export function usePurchasing(userId, userRole) {
    const [suppliers, setSuppliers] = useState([]);
    const [purchases, setPurchases] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (userId) {
            loadSuppliers();
            loadPurchases();
        }
    }, [userId]);

    async function loadSuppliers() {
        try {
            let query = supabase.from('suppliers').select('*').eq('owner_id', userId).order('name');

            const { data, error } = await query;
            if (error) throw error;
            setSuppliers(data);
        } catch (error) {
            console.error('Error loading suppliers:', error);
        }
    }

    async function loadPurchases() {
        try {
            let query = supabase
                .from('purchases')
                .select(`
                    *,
                    suppliers (name),
                    warehouses (name),
                    users (name)
                `)
                .eq('created_by', userId) // Always filter by owner
                .order('purchase_date', { ascending: false });

            const { data, error } = await query;
            if (error) throw error;
            setPurchases(data);
        } catch (error) {
            console.error('Error loading purchases:', error);
        } finally {
            setLoading(false);
        }
    }

    async function addSupplier(data) {
        const { error } = await supabase.from('suppliers').insert([{
            ...data,
            owner_id: userId // Set owner to current user
        }]);
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

    async function createPurchase(purchaseData, items) {
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

            // b. Update Product Cost Price
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
                reference_id: purchase.id,
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
