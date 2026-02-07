/**
 * Regional Data API Endpoint
 * Provides regional intelligence data for Palangka Raya
 */

import {
    PALANGKA_RAYA_CONTEXT,
    BPS_DATA,
    fetchWeatherData,
    fetchLocalTrends,
    calculateDailyPrediction,
    generateAIContext,
    generateMenuRecommendations
} from '@/lib/regionalIntelligence';

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { type } = req.query;

    try {
        switch (type) {
            case 'weather':
                const weather = await fetchWeatherData();
                return res.status(200).json({ success: true, data: weather });

            case 'trends':
                const trends = await fetchLocalTrends();
                return res.status(200).json({ success: true, data: trends });

            case 'prediction':
                const dateParam = req.query.date ? new Date(req.query.date) : new Date();
                const prediction = calculateDailyPrediction(dateParam);
                return res.status(200).json({ success: true, data: prediction });

            case 'context':
                const businessData = req.query.businessData ? JSON.parse(req.query.businessData) : {};
                const context = generateAIContext(businessData);
                return res.status(200).json({ success: true, data: context });

            case 'demographics':
                return res.status(200).json({
                    success: true,
                    data: PALANGKA_RAYA_CONTEXT.demographics
                });

            case 'economy':
                return res.status(200).json({
                    success: true,
                    data: {
                        ...PALANGKA_RAYA_CONTEXT.economy,
                        bps: BPS_DATA
                    }
                });

            case 'events':
                const upcoming = PALANGKA_RAYA_CONTEXT.events.filter(e => {
                    const eventDate = new Date(e.date);
                    const today = new Date();
                    return eventDate >= today;
                }).slice(0, 5);
                return res.status(200).json({ success: true, data: upcoming });

            case 'full':
            default:
                // Return comprehensive data
                const [weatherData, trendData] = await Promise.all([
                    fetchWeatherData(),
                    fetchLocalTrends()
                ]);

                const todayPrediction = calculateDailyPrediction(new Date());
                const upcomingEvents = PALANGKA_RAYA_CONTEXT.events.filter(e => {
                    const eventDate = new Date(e.date);
                    return eventDate >= new Date();
                }).slice(0, 3);

                return res.status(200).json({
                    success: true,
                    data: {
                        weather: weatherData,
                        trends: trendData,
                        prediction: todayPrediction,
                        upcoming_events: upcomingEvents,
                        demographics: PALANGKA_RAYA_CONTEXT.demographics,
                        economy: {
                            minimum_wage: PALANGKA_RAYA_CONTEXT.economy.minimum_wage_2024,
                            avg_food_expenditure: BPS_DATA.avg_monthly_expenditure.food
                        },
                        consumer_patterns: PALANGKA_RAYA_CONTEXT.consumer_patterns,
                        menu_recommendations: generateMenuRecommendations(),
                        timestamp: new Date().toISOString()
                    }
                });
        }
    } catch (error) {
        console.error('Regional data error:', error);
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
}
