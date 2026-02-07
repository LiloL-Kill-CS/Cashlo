/**
 * useRegionalData Hook
 * Provides regional intelligence data for components
 */

import { useState, useEffect } from 'react';

export function useRegionalData() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        fetchRegionalData();
    }, []);

    async function fetchRegionalData() {
        try {
            setLoading(true);
            const response = await fetch('/api/regional-data?type=full');
            const result = await response.json();

            if (result.success) {
                setData(result.data);
            } else {
                throw new Error(result.error);
            }
        } catch (err) {
            console.error('Regional data error:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }

    async function getPrediction(date = new Date()) {
        try {
            const dateStr = date.toISOString().split('T')[0];
            const response = await fetch(`/api/regional-data?type=prediction&date=${dateStr}`);
            const result = await response.json();
            return result.success ? result.data : null;
        } catch (err) {
            console.error('Prediction error:', err);
            return null;
        }
    }

    async function getAIContext(businessData = {}) {
        try {
            const response = await fetch(`/api/regional-data?type=context&businessData=${JSON.stringify(businessData)}`);
            const result = await response.json();
            return result.success ? result.data : '';
        } catch (err) {
            console.error('AI context error:', err);
            return '';
        }
    }

    return {
        data,
        loading,
        error,
        getPrediction,
        getAIContext,
        reload: fetchRegionalData
    };
}
