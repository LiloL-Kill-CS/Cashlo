import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export function useHR(userId) {
    const [shifts, setShifts] = useState([]);
    const [attendanceHistory, setAttendanceHistory] = useState([]);
    const [currentSession, setCurrentSession] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (userId) {
            loadShifts();
            loadAttendanceHistory();
            checkCurrentStatus();
        }
    }, [userId]);

    async function loadShifts() {
        try {
            const { data, error } = await supabase
                .from('shifts')
                .select('*, users(name)')
                .order('start_time', { ascending: true });
            if (error) throw error;
            setShifts(data);
        } catch (error) {
            console.error('Error loading shifts:', error);
        }
    }

    async function loadAttendanceHistory() {
        try {
            let query = supabase
                .from('attendance')
                .select('*, users(name)')
                .order('created_at', { ascending: false })
                .limit(50);

            // If not admin, maybe restrict? For now, let's load all or filter in UI
            // simpler: load all for admin, allow filter.

            const { data, error } = await query;
            if (error) throw error;
            setAttendanceHistory(data);
        } catch (error) {
            console.error('Error loading history:', error);
        } finally {
            setLoading(false);
        }
    }

    async function checkCurrentStatus() {
        try {
            // Find active attendance (clocked in but not out)
            const { data, error } = await supabase
                .from('attendance')
                .select('*')
                .eq('user_id', userId)
                .is('clock_out', null)
                .maybeSingle();

            if (error) throw error;
            setCurrentSession(data);
        } catch (error) {
            console.error('Error checking status:', error);
        }
    }

    async function clockIn(notes = '') {
        const { data, error } = await supabase
            .from('attendance')
            .insert([{
                user_id: userId,
                clock_in: new Date().toISOString(),
                status: 'present',
                notes: notes
            }])
            .select()
            .single();

        if (error) throw error;
        await checkCurrentStatus();
        await loadAttendanceHistory();
        return data;
    }

    async function clockOut(notes = '') {
        if (!currentSession) return;

        const { error } = await supabase
            .from('attendance')
            .update({
                clock_out: new Date().toISOString(),
                notes: notes ? (currentSession.notes ? currentSession.notes + '; ' + notes : notes) : currentSession.notes
            })
            .eq('id', currentSession.id);

        if (error) throw error;
        await checkCurrentStatus();
        await loadAttendanceHistory();
    }

    async function createShift(shiftData) {
        const { error } = await supabase.from('shifts').insert([shiftData]);
        if (error) throw error;
        await loadShifts();
    }

    async function deleteShift(shiftId) {
        const { error } = await supabase.from('shifts').delete().eq('id', shiftId);
        if (error) throw error;
        await loadShifts();
    }

    return {
        shifts,
        attendanceHistory,
        currentSession,
        loading,
        clockIn,
        clockOut,
        createShift,
        deleteShift,
        reload: () => { loadShifts(); loadAttendanceHistory(); }
    };
}
