import { useState, useEffect } from 'react';
import { generateTransactionId } from '@/lib/db';
import { supabase } from '@/lib/supabase';

export function useTransactions(userId, userRole, actualUserId) {
    const [transactions, setTransactions] = useState([]);
    const [loading, setLoading] = useState(true);

    // If actualUserId is not provided (e.g., from an older call), we fallback to userId
    const currentUserId = actualUserId || userId;

    useEffect(() => {
        if (userId) {
            loadTransactions();
        }
    }, [userId]);

    async function loadTransactions() {
        try {
            // We want to fetch transactions belonging to the business owner
            // This means any transaction where the user_id's owner_id is the current userId
            // Wait, the easiest way is to add business_id or owner_id to transactions.
            // Since we haven't, we need to query transactions where user_id IN (admin, kasir1, kasir2)
            // Let's first get all user IDs that belong to this owner
            const { data: users } = await supabase.from('users').select('id').eq('owner_id', userId);
            const userIds = users ? users.map(u => u.id) : [userId];
            // Also include the owner themselves just in case
            if (!userIds.includes(userId)) userIds.push(userId);

            let query = supabase
                .from('transactions')
                .select('*')
                .in('user_id', userIds)
                .order('datetime', { ascending: false });

            const { data: txns, error } = await query;

            if (error) throw error;
            setTransactions(txns);
        } catch (error) {
            console.error('Error loading transactions:', error);
        } finally {
            setLoading(false);
        }
    }

    async function createTransaction(cartItems, paymentMethod = 'cash', cashReceived = 0, customerId = null, pointsRedeemed = 0, discount = null) {
        const id = generateTransactionId();
        const now = new Date().toISOString();

        const items = cartItems.map(item => ({
            product_id: item.product_id || item.id,
            name: item.name,
            qty: item.qty,
            sell_price: item.sell_price,
            cost_price: item.cost_price,
            modifiers: item.modifiers,
            total_sell: item.sell_price * item.qty,
            total_cost: item.cost_price * item.qty,
            profit: (item.sell_price - item.cost_price) * item.qty
        }));

        const rawSubtotal = items.reduce((sum, item) => sum + item.total_sell, 0);
        const totalCost = items.reduce((sum, item) => sum + item.total_cost, 0);

        // Apply Discount
        let discountAmount = 0;
        if (discount) {
            discountAmount = rawSubtotal * (discount.value / 100);
        }

        const finalSubtotal = rawSubtotal - discountAmount;
        const totalProfit = (finalSubtotal - pointsRedeemed) - totalCost;

        const transaction = {
            id,
            datetime: now,
            user_id: currentUserId, // Log the actual user who made the transaction
            customer_id: customerId,
            items: JSON.stringify(items),
            subtotal: finalSubtotal,
            total_cost: totalCost,
            total_profit: totalProfit,
            payment_method: paymentMethod,
            cash_received: cashReceived,
            change: cashReceived - finalSubtotal,
            status: 'completed',
            created_at: now
        };

        const { error } = await supabase.from('transactions').insert([transaction]);
        if (error) {
            console.error('Error creating transaction:', error);
            throw error;
        }

        // --- INVENTORY UPDATE LOGIC ---
        try {
            // Get Primary Warehouse for this user (or any primary)
            let warehouseQuery = supabase.from('warehouses').select('id').eq('is_primary', true).limit(1);
            if (userRole !== 'admin') {
                warehouseQuery = warehouseQuery.eq('owner_id', userId);
            }
            const { data: warehouses } = await warehouseQuery;
            const warehouseId = warehouses?.[0]?.id;

            if (warehouseId) {
                for (const item of items) {
                    const { data: stockData } = await supabase
                        .from('product_stocks')
                        .select('quantity')
                        .eq('product_id', item.product_id)
                        .eq('warehouse_id', warehouseId)
                        .maybeSingle();

                    const currentQty = stockData ? parseFloat(stockData.quantity) : 0;
                    const newQty = currentQty - item.qty;

                    await supabase.from('product_stocks').upsert({
                        product_id: item.product_id,
                        warehouse_id: warehouseId,
                        quantity: newQty
                    }, { onConflict: 'product_id, warehouse_id' });

                    await supabase.from('inventory_logs').insert([{
                        product_id: item.product_id,
                        warehouse_id: warehouseId,
                        change_amount: -item.qty,
                        final_stock: newQty,
                        type: 'sale',
                        created_by: currentUserId,
                        notes: `Penjualan Kasir: ${id}`
                    }]);
                }
            }
        } catch (invError) {
            console.error('Error updating inventory:', invError);
        }

        // --- UPDATE CUSTOMER POINTS (Skipped if columns missing) ---
        /*
        if (customerId) {
            const { data: customer } = await supabase.from('customers').select('points').eq('id', customerId).single();
            if (customer) {
                const newPoints = (customer.points || 0) + 1; // Simplified logic
                await supabase.from('customers').update({ points: newPoints }).eq('id', customerId);
            }
        }
        */

        await loadTransactions();
        return transaction;
    }

    async function createManualTransaction(data) {
        const id = generateTransactionId();
        const { datetime, count, total_sell, total_cost, notes, items: providedItems } = data;

        // Use provided items or create dummy item
        const items = providedItems || [{
            product_id: 'manual',
            name: notes || 'Manual Transaction',
            qty: count || 1,
            sell_price: total_sell,
            cost_price: total_cost,
            total_sell: total_sell,
            total_cost: total_cost,
            profit: total_sell - total_cost
        }];

        const transaction = {
            id,
            datetime: datetime || new Date().toISOString(),
            user_id: currentUserId, // Log the actual user who made the manual transaction
            customer_id: null,
            items: JSON.stringify(items),
            subtotal: total_sell,
            total_cost: total_cost,
            total_profit: total_sell - total_cost,
            payment_method: data.payment_method || 'qr',
            cash_received: total_sell,
            change: 0,
            status: 'completed',
            manual_txn_count: count || 1, // Store the bulk count
            created_at: new Date().toISOString()
        };

        const { error } = await supabase.from('transactions').insert([transaction]);
        if (error) {
            console.error('Error creating manual transaction:', error);
            throw error;
        }

        // NOTE: We SKIP inventory and customer updates for manual historic entries
        await loadTransactions();
        return transaction;
    }

    async function voidTransaction(transactionId) {
        const { error } = await supabase.from('transactions').update({ status: 'voided' }).eq('id', transactionId);
        if (error) console.error('Error voiding transaction:', error);
        await loadTransactions();
    }

    async function deleteTransaction(transactionId) {
        if (!confirm('Apakah Anda yakin ingin menghapus transaksi ini secara permanen? Data tidak dapat dikembalikan.')) {
            return false;
        }

        try {
            const { error } = await supabase
                .from('transactions')
                .delete()
                .eq('id', transactionId);

            if (error) {
                console.error('Error deleting transaction:', error);
                throw error;
            }

            await loadTransactions();
            return true;
        } catch (error) {
            console.error('Failed to delete transaction:', error);
            return false;
        }
    }

    function getTransactionsByDateRange(startDate, endDate) {
        return transactions.filter(txn => {
            if (txn.status === 'voided') return false;
            const txnDate = new Date(txn.datetime);
            return txnDate >= startDate && txnDate <= endDate;
        });
    }

    function getTodayStats() {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        const todayTxns = getTransactionsByDateRange(today, tomorrow);

        return {
            revenue: todayTxns.reduce((sum, t) => sum + t.subtotal, 0),
            profit: todayTxns.reduce((sum, t) => sum + t.total_profit, 0),
            count: todayTxns.reduce((sum, t) => sum + (t.manual_txn_count || 1), 0),
            transactions: todayTxns
        };
    }

    function getTopProducts(startDate, endDate, limit = 5) {
        const txns = getTransactionsByDateRange(startDate, endDate);
        const productSales = {};

        txns.forEach(txn => {
            const items = JSON.parse(txn.items || '[]');
            items.forEach(item => {
                if (!productSales[item.name]) {
                    productSales[item.name] = { name: item.name, qty: 0, revenue: 0 };
                }
                productSales[item.name].qty += item.qty;
                productSales[item.name].revenue += item.total_sell;
            });
        });

        return Object.values(productSales)
            .sort((a, b) => b.qty - a.qty)
            .slice(0, limit);
    }

    return {
        transactions,
        loading,
        createTransaction,
        voidTransaction,
        deleteTransaction,
        createManualTransaction,
        getTransactionsByDateRange,
        getTodayStats,
        getTopProducts,
        reload: loadTransactions
    };
}
