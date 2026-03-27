import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export function useRecipes(ownerId) {
    const [recipes, setRecipes] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (ownerId) loadRecipes();
    }, [ownerId]);

    async function loadRecipes() {
        try {
            const { data } = await supabase
                .from('recipes')
                .select('*')
                .eq('owner_id', ownerId)
                .order('product_name');

            setRecipes(data || []);
        } catch (error) {
            console.error('Error loading recipes:', error);
        } finally {
            setLoading(false);
        }
    }

    async function saveRecipe(productId, productName, ingredientsList) {
        // ingredientsList = [{ ingredient_id, ingredient_name, qty_used, unit, unit_cost, line_cost }]
        const id = `rcp-${Date.now()}`;
        const totalCost = ingredientsList.reduce((sum, i) => sum + (i.line_cost || 0), 0);

        const recipeData = {
            id,
            product_id: productId,
            product_name: productName,
            ingredients: JSON.stringify(ingredientsList),
            total_cost: totalCost,
            owner_id: ownerId,
            updated_at: new Date().toISOString()
        };

        // Upsert: delete old recipe for this product, insert new
        await supabase.from('recipes').delete().eq('product_id', productId).eq('owner_id', ownerId);
        const { error } = await supabase.from('recipes').insert([recipeData]);
        if (error) throw error;

        await loadRecipes();
        return recipeData;
    }

    async function deleteRecipe(productId) {
        await supabase.from('recipes').delete().eq('product_id', productId).eq('owner_id', ownerId);
        await loadRecipes();
    }

    function getRecipeForProduct(productId) {
        return recipes.find(r => r.product_id === productId);
    }

    function calculateHPP(ingredientsList) {
        return ingredientsList.reduce((sum, i) => sum + (i.line_cost || 0), 0);
    }

    return {
        recipes, loading,
        saveRecipe, deleteRecipe, getRecipeForProduct, calculateHPP,
        reload: loadRecipes
    };
}
