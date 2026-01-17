import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export function useCustomers() {
    const [customers, setCustomers] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadCustomers();
    }, []);

    async function loadCustomers() {
        try {
            const { data, error } = await supabase
                .from('customers')
                .select(`
                    *,
                    membership_tiers (
                        name,
                        discount_percent
                    )
                `)
                .order('created_at', { ascending: false });

            if (error) throw error;
            setCustomers(data);
        } catch (error) {
            console.error('Error loading customers:', error);
        } finally {
            setLoading(false);
        }
    }

    async function addCustomer(customerData) {
        // Check if phone exists
        const { data: existing } = await supabase
            .from('customers')
            .select('id')
            .eq('phone', customerData.phone);

        if (existing && existing.length > 0) {
            throw new Error('Nomor HP sudah terdaftar');
        }

        // Auto-assign tier based on total_spend (0 for new)
        // For now just insert default
        const { data, error } = await supabase
            .from('customers')
            .insert([{
                ...customerData,
                points: 0,
                total_spend: 0,
                created_at: new Date().toISOString()
            }])
            .select();

        if (error) throw error;
        await loadCustomers();
        return data[0];
    }

    async function updateCustomer(id, updates) {
        const { error } = await supabase
            .from('customers')
            .update(updates)
            .eq('id', id);

        if (error) throw error;
        await loadCustomers();
    }

    async function deleteCustomer(id) {
        const { error } = await supabase
            .from('customers')
            .delete()
            .eq('id', id);

        if (error) throw error;
        await loadCustomers();
    }

    async function searchCustomers(query) {
        if (!query) {
            await loadCustomers();
            return;
        }

        const { data, error } = await supabase
            .from('customers')
            .select(`
                *,
                membership_tiers (
                    name,
                    discount_percent
                )
            `)
            .or(`name.ilike.%${query}%,phone.ilike.%${query}%`)
            .limit(10);

        if (error) {
            console.error('Error searching customers:', error);
            return;
        }
        setCustomers(data);
    }

    return {
        customers,
        loading,
        addCustomer,
        updateCustomer,
        deleteCustomer,
        searchCustomers,
        reload: loadCustomers
    };
}
