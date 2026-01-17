import { useState, useEffect } from 'react';
import { generateTransactionId } from '@/lib/db';
import { supabase } from '@/lib/supabase';

export function useTransactions() {
    const [transactions, setTransactions] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadTransactions();
    }, []);

    async function loadTransactions() {
        try {
            const { data: txns, error } = await supabase
                .from('transactions')
                .select('*')
                .order('datetime', { ascending: false });

            if (error) throw error;
            setTransactions(txns);
        } catch (error) {
            console.error('Error loading transactions:', error);
        } finally {
            setLoading(false);
        }
    }

    async function createTransaction(cartItems, userId, paymentMethod = 'cash', cashReceived = 0, customerId = null, pointsRedeemed = 0, rewardId = null) {
        const id = generateTransactionId();
        const now = new Date().toISOString();

        const items = cartItems.map(item => ({
            product_id: item.product_id || item.id, // Ensure we have product ID
            name: item.name,
            qty: item.qty,
            sell_price: item.sell_price,
            cost_price: item.cost_price,
            modifiers: item.modifiers,
            total_sell: item.sell_price * item.qty,
            total_cost: item.cost_price * item.qty,
            profit: (item.sell_price - item.cost_price) * item.qty
        }));

        const subtotal = items.reduce((sum, item) => sum + item.total_sell, 0);
        const totalCost = items.reduce((sum, item) => sum + item.total_cost, 0);
        // Calculate total profit accounting for any points redeemed (treated as discount expense or reduction in revenue? usually reduction in revenue)
        // For simplicity: profit = (subtotal - pointsRedeemed) - totalCost
        const totalProfit = (subtotal - pointsRedeemed) - totalCost;

        const transaction = {
            id,
            datetime: now,
            user_id: userId,
            customer_id: customerId,
            items: JSON.stringify(items),
            subtotal,
            total_cost: totalCost,
            total_profit: totalProfit,
            payment_method: paymentMethod,
            cash_received: cashReceived,
            change: cashReceived - (subtotal - pointsRedeemed),
            points_redeemed: pointsRedeemed,
            points_earned: Math.floor((subtotal - pointsRedeemed) / 10000), // 1 point per 10k
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
            // 1. Get Primary Warehouse
            const { data: warehouses } = await supabase
                .from('warehouses')
                .select('id')
                .eq('is_primary', true)
                .limit(1);

            const warehouseId = warehouses?.[0]?.id;

            if (warehouseId) {
                // 2. Process each item
                for (const item of items) {
                    // Decrement Stock
                    // We need to fetch current first to know what it is? Or can we blindly decrement?
                    // Supabase doesn't have a simple 'decrement' without rpc.

                    const { data: stockData } = await supabase
                        .from('product_stocks')
                        .select('quantity')
                        .eq('product_id', item.product_id)
                        .eq('warehouse_id', warehouseId)
                        .maybeSingle();

                    const currentQty = stockData ? parseFloat(stockData.quantity) : 0;
                    const newQty = currentQty - item.qty;

                    // Update Stock
                    await supabase.from('product_stocks').upsert({
                        product_id: item.product_id,
                        warehouse_id: warehouseId,
                        quantity: newQty
                    }, { onConflict: 'product_id, warehouse_id' });

                    // Log Movement
                    await supabase.from('inventory_logs').insert([{
                        product_id: item.product_id,
                        warehouse_id: warehouseId,
                        change_amount: -item.qty,
                        final_stock: newQty,
                        type: 'sale',
                        reference_id: id,
                        created_by: userId,
                        notes: `Penjualan Kasir: ${id}`
                    }]);
                }
            }
        } catch (invError) {
            console.error('Error updating inventory:', invError);
            // We don't block the transaction success even if inventory fails, but we verify logs
        }

        // --- UPDATE CUSTOMER POINTS ---
        if (customerId) {
            // Fetch current points
            const { data: customer } = await supabase.from('customers').select('points').eq('id', customerId).single();
            if (customer) {
                const newPoints = (customer.points || 0) - pointsRedeemed + transaction.points_earned;
                await supabase.from('customers').update({ points: newPoints }).eq('id', customerId);
            }
        }

        await loadTransactions();
        return transaction;
    }

    async function voidTransaction(transactionId) {
        const { error } = await supabase.from('transactions').update({ status: 'voided' }).eq('id', transactionId);
        if (error) console.error('Error voiding transaction:', error);
        await loadTransactions();
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
            count: todayTxns.length,
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
        getTransactionsByDateRange,
        getTodayStats,
        getTopProducts,
        reload: loadTransactions
    };
}
