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
        const { error } = await supabase.from('products').update({ is_active: false }).eq('id', id);
        if (error) console.error('Error deleting product:', error);
        await loadData();
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
