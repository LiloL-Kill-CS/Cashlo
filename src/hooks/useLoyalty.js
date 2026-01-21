import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export function useLoyalty(userId) {
    const [tiers, setTiers] = useState([]);
    const [rewards, setRewards] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (userId) {
            loadData();
        }
    }, [userId]);

    async function loadData() {
        if (!userId) return;

        try {
            const [tiersResult, rewardsResult] = await Promise.all([
                supabase.from('membership_tiers').select('*').eq('owner_id', userId).order('min_spend', { ascending: true }),
                supabase.from('point_rewards').select('*').eq('owner_id', userId).order('points_cost', { ascending: true })
            ]);

            if (tiersResult.error) throw tiersResult.error;
            if (rewardsResult.error) throw rewardsResult.error;

            setTiers(tiersResult.data);
            setRewards(rewardsResult.data);
        } catch (error) {
            console.error('Error loading loyalty data:', error);
        } finally {
            setLoading(false);
        }
    }

    // --- Tiers ---
    async function addTier(tierData) {
        const { error } = await supabase.from('membership_tiers').insert([{
            ...tierData,
            owner_id: userId
        }]);
        if (error) throw error;
        await loadData();
    }

    async function updateTier(id, updates) {
        const { error } = await supabase.from('membership_tiers').update(updates).eq('id', id).eq('owner_id', userId);
        if (error) throw error;
        await loadData();
    }

    async function deleteTier(id) {
        const { error } = await supabase.from('membership_tiers').delete().eq('id', id).eq('owner_id', userId);
        if (error) throw error;
        await loadData();
    }

    // --- Rewards ---
    async function addReward(rewardData) {
        const { error } = await supabase.from('point_rewards').insert([{
            ...rewardData,
            owner_id: userId
        }]);
        if (error) throw error;
        await loadData();
    }

    async function updateReward(id, updates) {
        const { error } = await supabase.from('point_rewards').update(updates).eq('id', id).eq('owner_id', userId);
        if (error) throw error;
        await loadData();
    }

    async function deleteReward(id) {
        const { error } = await supabase.from('point_rewards').delete().eq('id', id).eq('owner_id', userId);
        if (error) throw error;
        await loadData();
    }

    return {
        tiers,
        rewards,
        loading,
        addTier,
        updateTier,
        deleteTier,
        addReward,
        updateReward,
        deleteReward,
        reload: loadData
    };
}
