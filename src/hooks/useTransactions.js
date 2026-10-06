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
            // Include the owner's employees when loading business receipts.
            let userIds = [userId];
            try {
                const res = await fetch('/api/users', { credentials: 'same-origin' });
                const data = await res.json();
                if (res.ok && Array.isArray(data.users) && data.users.length > 0) {
                    userIds = data.users.map(u => u.id);
                }
            } catch (e) {
                console.warn('Falling back to single-user transactions:', e.message);
            }
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

    async function createTransaction(cartItems, paymentMethod = 'cash', cashReceived = 0, customerId = null, pointsRedeemed = 0, discount = null, checkoutId = null) {
        const id = checkoutId || `${generateTransactionId()}-${crypto.randomUUID()}`;
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
            owner_id: userId,
            customer_id: customerId,
            items: JSON.stringify(items),
            subtotal: finalSubtotal,
            total_cost: totalCost,
            total_profit: totalProfit,
            payment_method: paymentMethod,
            cash_received: cashReceived,
            change: cashReceived - finalSubtotal,
            status: 'completed',
            inventory_source: 'pos',
            created_at: now
        };

        const { error } = await supabase.from('transactions').insert([transaction]);
        if (error) {
            // A response can be lost after the payment and its supply deductions
            // commit. Recover the same receipt instead of creating another sale.
            const { data: existing } = await supabase.from('transactions').select('*')
                .eq('id', id).eq('owner_id', userId).eq('user_id', currentUserId).maybeSingle();
            if (existing && existing.status === 'completed' && existing.inventory_source === 'pos'
                && existing.items === transaction.items) {
                await loadTransactions();
                return existing;
            }
            console.error('Error creating transaction:', error);
            throw error;
        }

        // Linked supply balances and their ledger are already committed by the
        // database with the completed payment. Keep sellable-product stock here.
        try {
            // Get Primary Warehouse for this user (or any primary)
            const warehouseQuery = supabase.from('warehouses').select('id')
                .eq('is_primary', true).eq('owner_id', userId).limit(1);
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

        // --- UPDATE CUSTOMER POINTS: 1 produk = 1 poin ---
        if (customerId) {
            try {
                const totalProductsBought = items.reduce((sum, item) => sum + (item.qty || 1), 0);
                const { data: customer } = await supabase.from('customers').select('points').eq('id', customerId).single();
                if (customer) {
                    const newPoints = (customer.points || 0) + totalProductsBought;
                    await supabase.from('customers').update({ points: newPoints }).eq('id', customerId);
                }
            } catch (ptError) {
                console.error('Error updating customer points:', ptError);
            }
        }

        await loadTransactions();
        return transaction;
    }

    async function createManualTransaction(data, checkoutId = null) {
        if (userRole !== 'admin' || !userId || !currentUserId) {
            throw new Error('Hanya admin bisnis yang dapat menambahkan transaksi lama.');
        }
        const id = checkoutId || `${generateTransactionId()}-${crypto.randomUUID()}`;
        const { datetime, count, total_sell, total_cost, notes, items: providedItems } = data;
        if (!Array.isArray(providedItems) || !providedItems.length) {
            throw new Error('Pilih menu atau bahan beserta jumlahnya agar stok dapat dihitung.');
        }
        const items = providedItems.map((item, index) => ({
            ...item,
            is_supply: item.is_supply ?? false,
            ...(index === 0 && typeof notes === 'string' && notes.trim() ? { transaction_note: notes.trim() } : {}),
        }));
        const now = new Date().toISOString();

        const transaction = {
            id,
            datetime: datetime || now,
            user_id: currentUserId, // Log the actual user who made the manual transaction
            owner_id: userId,
            customer_id: null,
            items: JSON.stringify(items),
            subtotal: total_sell,
            total_cost: total_cost,
            total_profit: total_sell - total_cost,
            payment_method: data.payment_method === 'qris' ? 'qr' : data.payment_method || 'qr',
            cash_received: total_sell,
            change: 0,
            status: 'completed',
            inventory_source: 'manual',
            manual_txn_count: count || 1, // Store the bulk count
            created_at: now
        };

        const { error } = await supabase.from('transactions').insert([transaction]);
        if (error) {
            // A lost response must recover the same backdated receipt and its
            // ingredient deductions, rather than record the input a second time.
            const { data: existing } = await supabase.from('transactions').select('*')
                .eq('id', id).eq('owner_id', userId).eq('user_id', currentUserId).maybeSingle();
            if (existing && existing.status === 'completed' && existing.inventory_source === 'manual'
                && existing.items === transaction.items
                && new Date(existing.datetime).getTime() === new Date(transaction.datetime).getTime()) {
                await loadTransactions();
                return existing;
            }
            throw error;
        }

        // The database commits this receipt and its linked/direct ingredient
        // consumption together. Historical input does not award customer points.
        await loadTransactions();
        return transaction;
    }

    async function voidTransaction(transactionId) {
        if (!confirm('Batalkan transaksi ini? Pendapatan akan dikeluarkan dari laporan. Bahan yang terpotong saat pembayaran otomatis dikembalikan satu kali.')) return false;
        let query = supabase.from('transactions').update({ status: 'voided' }).eq('id', transactionId);
        const receipt = transactions.find(transaction => transaction.id === transactionId);
        query = receipt?.owner_id == null && receipt?.user_id
            ? query.is('owner_id', null).eq('user_id', receipt.user_id)
            : query.eq('owner_id', userId);
        const { data, error } = await query.select('id');
        if (error) throw error;
        if (!data?.length) throw new Error('Transaksi tidak ditemukan atau Anda tidak memiliki izin. Muat ulang laporan.');
        await loadTransactions();
        return true;
    }

    async function deleteTransaction(transactionId) {
        if (!confirm('Hapus transaksi ini secara permanen? Bahan yang terpotong saat pembayaran otomatis dikembalikan satu kali. Transaksi yang sudah dibatalkan tidak menambah stok lagi. Data transaksi tidak dapat dikembalikan.')) {
            return false;
        }

        let query = supabase.from('transactions').delete().eq('id', transactionId);
        const receipt = transactions.find(transaction => transaction.id === transactionId);
        query = receipt?.owner_id == null && receipt?.user_id
            ? query.is('owner_id', null).eq('user_id', receipt.user_id)
            : query.eq('owner_id', userId);
        const { data, error } = await query.select('id');
        if (error) throw error;
        if (!data?.length) throw new Error('Transaksi tidak ditemukan atau Anda tidak memiliki izin. Muat ulang laporan.');
        await loadTransactions();
        return true;
    }

    function getTransactionsByDateRange(startDate, endDate) {
        return transactions.filter(txn => {
            if (['voided', 'canceled', 'cancelled'].includes(txn.status)) return false;
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
