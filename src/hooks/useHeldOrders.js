import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export function useHeldOrders(userId) {
    const [heldOrders, setHeldOrders] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadHeldOrders();
    }, [userId]);

    async function loadHeldOrders() {
        try {
            const { data: orders, error } = await supabase
                .from('held_orders')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;
            setHeldOrders(orders);
        } catch (error) {
            console.error('Error loading held orders:', error);
        } finally {
            setLoading(false);
        }
    }

    async function holdOrder(name, items) {
        const id = crypto.randomUUID(); // Use native UUID or let DB handle it. DB defaults to uuid_generate_v4(). 
        // But hook expects to return id. Let's let DB generate it? 
        // Actually the schema has default uuid_generate_v4() for id.
        // We can just insert and select back or assume success.
        // The original code generated 'hold-' + Date.now().

        // Let's rely on supabase returning the inserted data.
        const { data, error } = await supabase.from('held_orders').insert([{
            name,
            items: JSON.stringify(items),
            user_id: userId,
            created_at: new Date().toISOString()
        }]).select();

        if (error) {
            console.error('Error holding order:', error);
            return null;
        }

        await loadHeldOrders();
        return data[0].id;
    }

    async function recallOrder(orderId) {
        const { data: orders, error } = await supabase
            .from('held_orders')
            .select('*')
            .eq('id', orderId);

        const order = orders ? orders[0] : null;

        if (order) {
            await supabase.from('held_orders').delete().eq('id', orderId);
            await loadHeldOrders();
            return JSON.parse(order.items);
        }
        return null;
    }

    async function deleteHeldOrder(orderId) {
        await supabase.from('held_orders').delete().eq('id', orderId);
        await loadHeldOrders();
    }

    return {
        heldOrders,
        loading,
        holdOrder,
        recallOrder,
        deleteHeldOrder,
        reload: loadHeldOrders
    };
}
