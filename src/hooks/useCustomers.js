import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export function useCustomers(userId, userRole) {
    const [customers, setCustomers] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (userId) {
            loadCustomers();
        }
    }, [userId]);

    async function loadCustomers() {
        try {
            let query = supabase
                .from('customers')
                .select(`
                    *,
                    membership_tiers (
                        name,
                        discount_percent
                    )
                `)
                .eq('owner_id', userId) // Always filter by owner
                .order('created_at', { ascending: false });

            const { data, error } = await query;

            if (error) throw error;
            setCustomers(data);
        } catch (error) {
            console.error('Error loading customers:', error);
        } finally {
            setLoading(false);
        }
    }

    async function addCustomer(customerData) {
        // Check if phone exists for this owner (only if phone is provided)
        if (customerData.phone) {
            let checkQuery = supabase.from('customers').select('id').eq('phone', customerData.phone).eq('owner_id', userId);
            const { data: existing } = await checkQuery;

            if (existing && existing.length > 0) {
                throw new Error('Nomor HP sudah terdaftar');
            }
        }

        const { data, error } = await supabase
            .from('customers')
            .insert([{
                ...customerData,
                owner_id: userId, // Set owner to current user
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

        let searchQuery = supabase
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

        // Filter by owner unless admin
        if (userRole !== 'admin') {
            searchQuery = searchQuery.eq('owner_id', userId);
        }

        const { data, error } = await searchQuery;

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
