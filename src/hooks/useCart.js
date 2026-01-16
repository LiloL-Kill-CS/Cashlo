import { useState, useCallback } from 'react';

export function useCart() {
    const [items, setItems] = useState([]);

    const addItem = useCallback((product, modifiers = []) => {
        setItems(current => {
            // Check if same product with same modifiers exists
            const modKey = modifiers.map(m => m.name).sort().join(',');
            const existingIndex = current.findIndex(item => {
                const itemModKey = item.modifiers.map(m => m.name).sort().join(',');
                return item.product_id === product.id && itemModKey === modKey;
            });

            if (existingIndex >= 0) {
                // Increase quantity
                const updated = [...current];
                updated[existingIndex] = {
                    ...updated[existingIndex],
                    qty: updated[existingIndex].qty + 1
                };
                return updated;
            }

            // Add new item
            const modifierCost = modifiers.reduce((sum, m) => sum + (m.cost || 0), 0);
            const modifierPrice = modifiers.reduce((sum, m) => sum + (m.price || 0), 0);

            return [...current, {
                id: `item-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                product_id: product.id,
                name: product.name,
                qty: 1,
                sell_price: product.sell_price + modifierPrice,
                cost_price: product.cost_price + modifierCost,
                base_sell_price: product.sell_price,
                base_cost_price: product.cost_price,
                modifiers
            }];
        });
    }, []);

    const updateQuantity = useCallback((itemId, delta) => {
        setItems(current => {
            const updated = current.map(item => {
                if (item.id === itemId) {
                    const newQty = item.qty + delta;
                    if (newQty <= 0) return null;
                    return { ...item, qty: newQty };
                }
                return item;
            }).filter(Boolean);
            return updated;
        });
    }, []);

    const removeItem = useCallback((itemId) => {
        setItems(current => current.filter(item => item.id !== itemId));
    }, []);

    const clearCart = useCallback(() => {
        setItems([]);
    }, []);

    const setCartItems = useCallback((newItems) => {
        setItems(newItems);
    }, []);

    // Calculate totals
    const subtotal = items.reduce((sum, item) => sum + (item.sell_price * item.qty), 0);
    const totalCost = items.reduce((sum, item) => sum + (item.cost_price * item.qty), 0);
    const totalProfit = subtotal - totalCost;
    const itemCount = items.reduce((sum, item) => sum + item.qty, 0);

    return {
        items,
        addItem,
        updateQuantity,
        removeItem,
        clearCart,
        setCartItems,
        subtotal,
        totalCost,
        totalProfit,
        itemCount
    };
}
