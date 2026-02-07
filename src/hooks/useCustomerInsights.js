import { useMemo } from 'react';

export function useCustomerInsights(customers, transactions) {
    const insights = useMemo(() => {
        if (!customers || !transactions) return null;

        const customerStats = {};

        // 1. Map transactions to customers
        transactions.forEach(txn => {
            if (!txn.customer_id) return;

            if (!customerStats[txn.customer_id]) {
                customerStats[txn.customer_id] = {
                    visitDates: [],
                    totalSpent: 0,
                    lastVisit: null
                };
            }

            customerStats[txn.customer_id].visitDates.push(new Date(txn.datetime));
            customerStats[txn.customer_id].totalSpent += txn.subtotal || 0;
        });

        // 2. Calculate metrics for each customer
        const enhancedCustomers = customers.map(cust => {
            const stats = customerStats[cust.id];
            if (!stats) return { ...cust, status: 'New', risk_score: 0 };

            // Sort dates
            stats.visitDates.sort((a, b) => a - b);
            const lastVisit = stats.visitDates[stats.visitDates.length - 1];

            // Calculate Average Days Between Visits (Frequency)
            let totalIntervals = 0;
            let intervalCount = 0;

            if (stats.visitDates.length > 1) {
                for (let i = 1; i < stats.visitDates.length; i++) {
                    const diffTime = Math.abs(stats.visitDates[i] - stats.visitDates[i - 1]);
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                    totalIntervals += diffDays;
                    intervalCount++;
                }
            }

            const avgInterval = intervalCount > 0 ? totalIntervals / intervalCount : 7; // Default to 7 days if only 1 visit

            // Days since last visit
            const today = new Date();
            const daysSinceLast = Math.ceil((today - lastVisit) / (1000 * 60 * 60 * 24));

            // Determine Status
            // If they haven't visited in 2.5x their usual interval -> CHURNED
            // If they haven't visited in 1.5x their usual interval -> AT RISK
            let status = 'Active';
            let riskColor = 'green';
            let usageRatio = daysSinceLast / avgInterval;

            if (usageRatio > 3) {
                status = 'Lost';
                riskColor = 'red';
            } else if (usageRatio > 1.5) {
                status = 'At Risk';
                riskColor = 'orange';
            }

            return {
                ...cust,
                stats: {
                    total_visits: stats.visitDates.length,
                    total_spent: stats.totalSpent,
                    avg_interval: Math.round(avgInterval),
                    days_since_last: daysSinceLast,
                    last_visit_date: lastVisit
                },
                health: {
                    status,
                    risk_color: riskColor,
                    usage_ratio: usageRatio.toFixed(1)
                }
            };
        });

        // 3. Aggregate Segment Stats
        const segments = {
            active: enhancedCustomers.filter(c => c.health?.status === 'Active').length,
            at_risk: enhancedCustomers.filter(c => c.health?.status === 'At Risk').length,
            lost: enhancedCustomers.filter(c => c.health?.status === 'Lost').length,
            total: enhancedCustomers.length
        };

        return {
            customerData: enhancedCustomers.sort((a, b) => {
                // Sort by Risk (At Risk first), then by value
                if (a.health?.status === 'At Risk' && b.health?.status !== 'At Risk') return -1;
                if (b.health?.status === 'At Risk' && a.health?.status !== 'At Risk') return 1;
                return (b.stats?.total_spent || 0) - (a.stats?.total_spent || 0);
            }),
            segments
        };

    }, [customers, transactions]);

    return insights;
}
