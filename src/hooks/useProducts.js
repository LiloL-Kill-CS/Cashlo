import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export function useProducts(userId, userRole, { includeSupplies = false } = {}) {
    const [products, setProducts] = useState([]);
    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(true);
    const [supplyCatalog, setSupplyCatalog] = useState([]);
    const [supplyLinks, setSupplyLinks] = useState([]);
    const [recipeLoading, setRecipeLoading] = useState(includeSupplies);
    const [recipeError, setRecipeError] = useState('');
    const [productError, setProductError] = useState('');

    useEffect(() => {
        if (userId) {
            loadData();
        }
    }, [userId, includeSupplies]);

    async function refreshRecipes() {
        if (!includeSupplies || !userId) return;
        setRecipeLoading(true);
        setRecipeError('');
        try {
            const [catalog, links] = await Promise.all([
                supabase.from('supplies').select('id,name,unit,pack_size,servings_per_pack').eq('owner_id', userId).order('name'),
                supabase.from('supply_menu_links').select('*').eq('owner_id', userId),
            ]);
            if (catalog.error) throw catalog.error;
            if (links.error) throw links.error;
            setSupplyCatalog(catalog.data || []);
            setSupplyLinks(links.data || []);
        } catch (error) {
            setRecipeError(error.message || 'Bahan dan takaran gagal dimuat. Coba muat ulang sebelum menyimpan.');
        } finally {
            setRecipeLoading(false);
        }
    }

    async function loadData() {
        const recipesReady = refreshRecipes();
        setProductError('');
        try {
            // Always filter by owner - each user sees only their own data
            const prodQuery = supabase.from('products').select('*').eq('is_active', true).eq('owner_id', userId);
            const catQuery = supabase.from('categories').select('*').eq('owner_id', userId).order('order', { ascending: true });

            const [{ data: allProds, error: prodError }, { data: cats, error: catError }] = await Promise.all([prodQuery, catQuery]);

            if (prodError) throw prodError;
            if (catError) throw catError;

            const prods = allProds.map(p => ({
                ...p,
                modifiers: p.modifiers
            }));

            setProducts(prods);
            setCategories(cats);
            return true;
        } catch (error) {
            console.error('Error loading products:', error);
            setProductError('Daftar produk gagal dimuat. Muat ulang sebelum menambah atau mengubah produk.');
            return false;
        } finally {
            await recipesReady;
            setLoading(false);
        }
    }

    async function addProduct(product, supplies = []) {
        if (userRole !== 'admin') throw new Error('Hanya admin yang dapat menambah produk');
        const id = product.id || `prod-${crypto.randomUUID()}`;
        const { error } = await supabase.rpc('save_product_with_supplies', {
            p_data: { ...product, id },
            p_supplies: supplies,
        });
        if (error) throw error;
        if (!await loadData()) setProductError('Produk dan bahan sudah tersimpan. Daftar produk gagal dimuat; muat ulang daftar tanpa menambahkan produk yang sama lagi.');
        return id;
    }

    async function updateProduct(id, updates, supplies = null) {
        if (userRole !== 'admin') throw new Error('Hanya admin yang dapat mengubah produk');
        const { error } = await supabase.rpc('save_product_with_supplies', {
            p_data: { ...updates, id },
            p_supplies: supplies,
        });
        if (error) throw error;
        if (!await loadData()) setProductError('Produk dan bahan sudah tersimpan. Daftar produk gagal dimuat; muat ulang daftar tanpa menyimpan ulang.');
    }

    async function deleteProduct(id) {
        if (userRole === 'kasir') throw new Error('Kasir tidak diizinkan menghapus produk');
        try {
            // Assert Ownership first (IDOR fix)
            const { data: ownCheck } = await supabase.from('products').select('id').eq('id', id).eq('owner_id', userId).single();
            if (!ownCheck) throw new Error('Product not found or unauthorized');

            // Delete all related records first (in order of dependencies)
            // 1. Delete from transaction_items (sales history)
            await supabase.from('transaction_items').delete().eq('product_id', id);
            // 2. Delete from purchase_items (purchase history)
            await supabase.from('purchase_items').delete().eq('product_id', id);
            // 3. Delete inventory logs
            await supabase.from('inventory_logs').delete().eq('product_id', id);
            // 4. Delete product stocks
            await supabase.from('product_stocks').delete().eq('product_id', id);
            // 5. Finally delete the product itself
            const { error } = await supabase.from('products').delete().eq('id', id).eq('owner_id', userId);
            if (error) {
                console.error('Error deleting product:', error);
                throw error;
            }
            await loadData();
        } catch (error) {
            console.error('Error in deleteProduct:', error);
            throw error;
        }
    }

    async function addCategory(name) {
        if (userRole === 'kasir') throw new Error('Kasir tidak diizinkan menambah kategori');
        const maxOrder = categories.length > 0
            ? Math.max(...categories.map(c => c.order))
            : 0;
        const id = `cat-${Date.now()}`;

        const { error } = await supabase.from('categories').insert([{
            id,
            name,
            owner_id: userId, // Set owner to current user
            order: maxOrder + 1
        }]);

        if (error) console.error('Error adding category:', error);

        await loadData();
        return id;
    }

    return {
        products,
        categories,
        loading,
        supplyCatalog,
        supplyLinks,
        recipeLoading,
        recipeError,
        productError,
        refreshRecipes,
        addProduct,
        updateProduct,
        deleteProduct,
        addCategory,
        reload: loadData
    };
}
