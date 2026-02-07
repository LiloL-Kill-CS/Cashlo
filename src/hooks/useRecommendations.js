import { useState, useEffect, useMemo } from 'react';

/**
 * useRecommendations Hook
 * Implements Market Basket Analysis (Association Rules) to suggest products
 */
export function useRecommendations(transactions, products) {
    const [rules, setRules] = useState({});

    // Retrain the model whenever transactions change
    useEffect(() => {
        if (transactions.length > 0) {
            trainModel(transactions);
        }
    }, [transactions]);

    const trainModel = (txns) => {
        const pairCounts = {}; // Key: "ProdID_A", Value: { "ProdID_B": 5 }
        const itemCounts = {}; // Key: "ProdID_A", Value: 10

        txns.forEach(txn => {
            try {
                const items = typeof txn.items === 'string' ? JSON.parse(txn.items) : txn.items;
                if (!Array.isArray(items) || items.length < 2) return;

                // Unique items (using ID)
                const itemIds = [...new Set(items.map(i => i.product_id).filter(id => id))];

                // Count pairs
                for (let i = 0; i < itemIds.length; i++) {
                    const idA = itemIds[i];
                    itemCounts[idA] = (itemCounts[idA] || 0) + 1;

                    for (let j = 0; j < itemIds.length; j++) {
                        if (i === j) continue;
                        const idB = itemIds[j];

                        if (!pairCounts[idA]) pairCounts[idA] = {};
                        pairCounts[idA][idB] = (pairCounts[idA][idB] || 0) + 1;
                    }
                }
            } catch (e) {
                console.warn('Error parsing transaction items for AI model:', e);
            }
        });

        // Convert counts to Confidence Scores
        const rulesMap = {};
        Object.keys(pairCounts).forEach(idA => {
            rulesMap[idA] = [];
            Object.keys(pairCounts[idA]).forEach(idB => {
                const countAB = pairCounts[idA][idB];
                const countA = itemCounts[idA];
                const confidence = countAB / countA;

                if (confidence > 0.1) {
                    rulesMap[idA].push({ id: idB, score: confidence });
                }
            });
            rulesMap[idA].sort((a, b) => b.score - a.score);
        });

        setRules(rulesMap);
    };

    const getRecommendations = (cartItems, limit = 3) => {
        if (!cartItems || cartItems.length === 0) return [];

        const scores = {};

        // Aggregate scores from all items in cart
        cartItems.forEach(cartItem => {
            const currentId = cartItem.product_id || cartItem.id;
            const suggestions = rules[currentId];

            if (suggestions) {
                suggestions.forEach(sugg => {
                    scores[sugg.id] = (scores[sugg.id] || 0) + sugg.score;
                });
            }
        });

        // Convert to array and sort
        const sortedIds = Object.entries(scores)
            .sort((a, b) => b[1] - a[1])
            .map(([id, score]) => id)
            .filter(id => !cartItems.some(i => (i.product_id || i.id) === id));

        // Hydrate with full product object details
        const recommendedProducts = [];
        sortedIds.forEach(id => {
            // Loose comparison in case ID type mismatch (string vs int)
            const product = products.find(p => p.id == id);
            if (product) {
                recommendedProducts.push({
                    ...product,
                    reason: 'Sering dibeli bersamaan'
                });
            }
        });

        return recommendedProducts.slice(0, limit);
    };

    return {
        getRecommendations
    };
}
