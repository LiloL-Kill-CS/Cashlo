import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export function useProducts(userId, userRole) {
    const [products, setProducts] = useState([]);
    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (userId) {
            loadData();
        }
    }, [userId]);

    async function loadData() {
        try {
            // Build query - admin sees all, others see only their own
            let prodQuery = supabase.from('products').select('*').eq('is_active', true);
            let catQuery = supabase.from('categories').select('*').order('order', { ascending: true });

            if (userRole !== 'admin') {
                prodQuery = prodQuery.eq('owner_id', userId);
                catQuery = catQuery.eq('owner_id', userId);
            }

            const { data: allProds, error: prodError } = await prodQuery;
            const { data: cats, error: catError } = await catQuery;

            if (prodError) throw prodError;
            if (catError) throw catError;

            const prods = allProds.map(p => ({
                ...p,
                modifiers: p.modifiers
            }));

            setProducts(prods);
            setCategories(cats);
        } catch (error) {
            console.error('Error loading products:', error);
        } finally {
            setLoading(false);
        }
    }

    async function addProduct(product) {
        const id = `prod-${Date.now()}`;
        const newProduct = {
            ...product,
            id,
            owner_id: userId, // Set owner to current user
            modifiers: JSON.stringify(product.modifiers || []),
            is_active: true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };

        const { error } = await supabase.from('products').insert([newProduct]);
        if (error) console.error('Error adding product:', error);

        await loadData();
        return id;
    }

    async function updateProduct(id, updates) {
        const updateData = {
            ...updates,
            updated_at: new Date().toISOString()
        };

        if (updates.modifiers) {
            updateData.modifiers = JSON.stringify(updates.modifiers);
        }

        const { error } = await supabase.from('products').update(updateData).eq('id', id);
        if (error) console.error('Error updating product:', error);

        await loadData();
    }

    async function deleteProduct(id) {
        try {
            // Delete all related records first (in order of dependencies)
            // 1. Delete from transaction_items (sales history)
            await supabase.from('transaction_items').delete().eq('product_id', id);
            // 2. Delete from purchase_items (purchase history)
            await supabase.from('purchase_items').delete().eq('product_id', id);
            // 3. Delete inventory logs
            await supabase.from('inventory_logs').delete().eq('product_id', id);
            // 4. Delete product stocks
            await supabase.from('product_stocks').delete().eq('product_id', id);
            // 5. Finally delete the product itself
            const { error } = await supabase.from('products').delete().eq('id', id);
            if (error) {
                console.error('Error deleting product:', error);
                throw error;
            }
            await loadData();
        } catch (error) {
            console.error('Error in deleteProduct:', error);
            throw error;
        }
    }

    async function addCategory(name) {
        const maxOrder = categories.length > 0
            ? Math.max(...categories.map(c => c.order))
            : 0;
        const id = `cat-${Date.now()}`;

        const { error } = await supabase.from('categories').insert([{
            id,
            name,
            owner_id: userId, // Set owner to current user
            order: maxOrder + 1
        }]);

        if (error) console.error('Error adding category:', error);

        await loadData();
        return id;
    }

    return {
        products,
        categories,
        loading,
        addProduct,
        updateProduct,
        deleteProduct,
        addCategory,
        reload: loadData
    };
}
