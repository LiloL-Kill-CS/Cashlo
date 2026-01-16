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

    async function createTransaction(cartItems, userId, paymentMethod = 'cash', cashReceived = 0, customerId = null) {
        const id = generateTransactionId();
        const now = new Date().toISOString();

        const items = cartItems.map(item => ({
            product_id: item.product_id,
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
        const totalProfit = subtotal - totalCost;

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
            change: cashReceived - subtotal,
            status: 'completed',
            created_at: now
        };

        const { error } = await supabase.from('transactions').insert([transaction]);
        if (error) console.error('Error creating transaction:', error);

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
