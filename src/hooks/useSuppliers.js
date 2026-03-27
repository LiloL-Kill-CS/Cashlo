import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export function useSuppliers(ownerId) {
    const [suppliers, setSuppliers] = useState([]);
    const [ingredients, setIngredients] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (ownerId) loadData();
    }, [ownerId]);

    async function loadData() {
        try {
            const { data: sups } = await supabase
                .from('suppliers')
                .select('*')
                .eq('owner_id', ownerId)
                .order('name');

            const { data: ings } = await supabase
                .from('ingredients')
                .select('*')
                .eq('owner_id', ownerId)
                .order('name');

            setSuppliers(sups || []);
            setIngredients(ings || []);
        } catch (error) {
            console.error('Error loading suppliers:', error);
        } finally {
            setLoading(false);
        }
    }

    async function addSupplier(supplier) {
        const id = `sup-${Date.now()}`;
        const { error } = await supabase.from('suppliers').insert([{
            id,
            ...supplier,
            owner_id: ownerId,
            created_at: new Date().toISOString()
        }]);
        if (error) throw error;
        await loadData();
        return id;
    }

    async function updateSupplier(id, updates) {
        const { error } = await supabase.from('suppliers').update(updates).eq('id', id);
        if (error) throw error;
        await loadData();
    }

    async function deleteSupplier(id) {
        const { error } = await supabase.from('suppliers').delete().eq('id', id);
        if (error) throw error;
        await loadData();
    }

    async function addIngredient(ingredient) {
        const id = `ing-${Date.now()}`;
        const { error } = await supabase.from('ingredients').insert([{
            id,
            ...ingredient,
            owner_id: ownerId,
            created_at: new Date().toISOString()
        }]);
        if (error) throw error;
        await loadData();
        return id;
    }

    async function updateIngredient(id, updates) {
        const { error } = await supabase.from('ingredients').update(updates).eq('id', id);
        if (error) throw error;
        await loadData();
    }

    async function deleteIngredient(id) {
        const { error } = await supabase.from('ingredients').delete().eq('id', id);
        if (error) throw error;
        await loadData();
    }

    return {
        suppliers, ingredients, loading,
        addSupplier, updateSupplier, deleteSupplier,
        addIngredient, updateIngredient, deleteIngredient,
        reload: loadData
    };
}
