import { useState, useEffect } from 'react';
import { useRegionalData } from '@/hooks/useRegionalData';

export function useDynamicPricing() {
    const { data: regionalData } = useRegionalData();
    const [activePromo, setActivePromo] = useState(null);

    useEffect(() => {
        checkConditions();
        // Check every minute
        const interval = setInterval(checkConditions, 60000);
        return () => clearInterval(interval);
    }, [regionalData]);

    const checkConditions = () => {
        const now = new Date();
        const hours = now.getHours();
        const day = now.getDay(); // 0 = Sunday
        const weather = regionalData?.weather?.[0]?.weather_desc?.toLowerCase() || '';

        let promo = null;

        // RULE 1: Happy Hour (2 PM - 5 PM, Weekdays)
        if (day >= 1 && day <= 5 && hours >= 14 && hours < 17) {
            promo = {
                id: 'happy_hour',
                name: '⚡ Happy Hour (2-5PM)',
                type: 'percentage',
                value: 10, // 10% off
                condition: 'Weekday Afternoon'
            };
        }

        // RULE 2: Rainy Day Special
        if (weather.includes('hujan') || weather.includes('rain')) {
            promo = {
                id: 'rainy_day',
                name: '☔ Rainy Day Special',
                type: 'percentage',
                value: 15,
                condition: 'Weather Triggered'
            };
        }

        // RULE 3: Closing Sale (Last hour, e.g., 9 PM - 10 PM)
        if (hours === 21) {
            promo = {
                id: 'closing_sale',
                name: '🌙 Closing Sale',
                type: 'percentage',
                value: 20,
                condition: 'Inventory Clearance'
            };
        }

        setActivePromo(promo);
    };

    const calculateTotal = (subtotal) => {
        if (!activePromo || !subtotal) return subtotal;

        const discountAmount = subtotal * (activePromo.value / 100);
        return subtotal - discountAmount;
    };

    return {
        activePromo,
        calculateTotal
    };
}
