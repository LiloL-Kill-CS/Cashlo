import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export function useExpenses(userId) {
    const [expenses, setExpenses] = useState([]);
    const [loading, setLoading] = useState(true);

    async function getExpensesByDateRange(startDate, endDate) {
        if (!userId) return [];

        try {
            // Format as YYYY-MM-DD for DATE column comparison
            const startStr = startDate.toISOString().split('T')[0];
            const endStr = endDate.toISOString().split('T')[0];

            const { data, error } = await supabase
                .from('expenses')
                .select('*')
                .eq('owner_id', userId)
                .gte('date', startStr)
                .lte('date', endStr)
                .order('date', { ascending: false });

            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error fetching expenses:', error);
            return [];
        }
    }

    async function addExpense(expenseData) {
        if (!userId) return;

        try {
            const { data, error } = await supabase
                .from('expenses')
                .insert([{
                    ...expenseData,
                    owner_id: userId
                }])
                .select();

            if (error) throw error;
            return data[0];
        } catch (error) {
            console.error('Error adding expense:', error);
            throw error;
        }
    }

    async function deleteExpense(id) {
        if (!userId) return;

        try {
            const { error } = await supabase
                .from('expenses')
                .delete()
                .eq('id', id)
                .eq('owner_id', userId);

            if (error) throw error;
        } catch (error) {
            console.error('Error deleting expense:', error);
            throw error;
        }
    }

    return {
        getExpensesByDateRange,
        addExpense,
        deleteExpense
    };
}
