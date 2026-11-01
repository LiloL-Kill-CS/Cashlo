import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Sidebar from '@/components/layout/Sidebar';
import { useAuth } from '@/hooks/useAuth';
import { useProducts } from '@/hooks/useProducts';
import { formatCurrency, formatNumberInput, parseNumberInput } from '@/lib/db';
import { parseSupplyQuantity, quantityPerServing } from '@/lib/inventoryQuantities';
import styles from '@/styles/Products.module.css';

const unitLabel = unit => unit === 'gram' ? 'g' : unit;
const formatDose = value => new Intl.NumberFormat('id-ID', { maximumFractionDigits: 6 }).format(Number(value) || 0);

export default function ProductsPage() {
    const { user, loading: authLoading } = useAuth();
    const { products, categories, loading, productError, supplyCatalog = [], supplyLinks = [], recipeLoading = false, recipeError,
        addProduct, updateProduct, deleteProduct, addCategory, refreshRecipes, reload } = useProducts((user?.owner_id || user?.id), user?.role, { includeSupplies: true });

    const [showModal, setShowModal] = useState(false);
    const [editingProduct, setEditingProduct] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('all');
    const [showCategoryModal, setShowCategoryModal] = useState(false);
    const [newCategoryName, setNewCategoryName] = useState('');
    const [recipeRows, setRecipeRows] = useState([]);
    const [untrackedAcknowledged, setUntrackedAcknowledged] = useState(false);
    const [saveError, setSaveError] = useState('');
    const [saving, setSaving] = useState(false);
    const submitLock = useRef(false);
    const draftProductId = useRef(null);
    const nextRecipeRowId = useRef(0);
    const dialogRef = useRef(null);
    const openerRef = useRef(null);

    // Form state
    const [formData, setFormData] = useState({
        name: '',
        category: '',
        sell_price: '',
        cost_price: '',
        modifiers: []
    });

    useEffect(() => {
        if (!authLoading && !user) {
            window.location.href = '/';
        }
    }, [user, authLoading]);

    useEffect(() => {
        if (!showModal) return;
        const previous = openerRef.current;
        dialogRef.current?.querySelector('input, select, button')?.focus();
        return () => previous?.focus();
    }, [showModal]);

    const filteredProducts = products.filter(p => {
        const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesCategory = selectedCategory === 'all' || p.category === selectedCategory;
        return matchesSearch && matchesCategory;
    });

    const openAddModal = () => {
        if (recipeLoading || recipeError || productError) return;
        openerRef.current = document.activeElement;
        draftProductId.current = `prod-${crypto.randomUUID()}`;
        setEditingProduct(null);
        setRecipeRows([]);
        setUntrackedAcknowledged(false);
        setSaveError('');
        setFormData({
            name: '',
            category: categories[0]?.id || '',
            sell_price: '',
            cost_price: '',
            modifiers: []
        });
        setShowModal(true);
    };

    const openEditModal = (product) => {
        if (recipeLoading || recipeError || productError) return;
        openerRef.current = document.activeElement;
        draftProductId.current = null;
        setEditingProduct(product);
        setRecipeRows(supplyLinks.filter(link => String(link.product_id) === String(product.id)).map(link => ({
            rowId: ++nextRecipeRowId.current,
            supply_id: String(link.supply_id),
            quantity_per_serving: String(link.quantity_per_serving),
            quantity_tolerance: String(link.quantity_tolerance ?? 0)
        })));
        setUntrackedAcknowledged(false);
        setSaveError('');
        setFormData({
            name: product.name,
            category: product.category,
            sell_price: product.sell_price.toString(),
            cost_price: product.cost_price.toString(),
            modifiers: JSON.parse(product.modifiers || '[]')
        });
        setShowModal(true);
    };

    const closeModal = () => {
        if (submitLock.current) return;
        setShowModal(false);
        setSaveError('');
    };

    const addRecipeRow = () => {
        if (recipeRows.length >= 100 || recipeRows.length >= supplyCatalog.length) return;
        setRecipeRows(previous => [...previous, { rowId: ++nextRecipeRowId.current, supply_id: '', quantity_per_serving: '', quantity_tolerance: '0' }]);
        setUntrackedAcknowledged(false);
    };

    const updateRecipeRow = (rowId, field, value) => {
        setRecipeRows(previous => previous.map(row => {
            if (row.rowId !== rowId) return row;
            if (field !== 'supply_id') return { ...row, [field]: value };
            const supply = supplyCatalog.find(item => String(item.id) === value);
            let suggestedDose = '';
            if (supply?.servings_per_pack) {
                try { suggestedDose = String(quantityPerServing(supply.pack_size, supply.servings_per_pack)); }
                catch { suggestedDose = ''; }
            }
            return { ...row, supply_id: value, quantity_per_serving: suggestedDose, quantity_tolerance: '0' };
        }));
    };

    const removeRecipeRow = rowId => setRecipeRows(previous => previous.filter(row => row.rowId !== rowId));

    const recipeFor = productId => supplyLinks.filter(link => String(link.product_id) === String(productId));

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (submitLock.current) return;
        if (recipeLoading || recipeError || productError) {
            setSaveError('Data produk atau bahan belum siap. Muat ulang sebelum menyimpan lagi.');
            return;
        }
        if (!recipeRows.length && !untrackedAcknowledged) {
            setSaveError('Tambahkan bahan per porsi, atau centang bahwa produk ini tidak memakai bahan inventory.');
            return;
        }

        submitLock.current = true;
        setSaving(true);
        setSaveError('');
        try {
            const supplies = recipeRows.map((row, index) => {
                if (!row.supply_id || !supplyCatalog.some(item => String(item.id) === row.supply_id)) {
                    throw new Error(`Pilih bahan ${index + 1} yang tersedia di inventory.`);
                }
                const quantity = parseSupplyQuantity(row.quantity_per_serving, `Takaran bahan ${index + 1}`);
                const tolerance = parseSupplyQuantity(row.quantity_tolerance, `Variasi bahan ${index + 1}`, { allowZero: true });
                if (tolerance >= quantity) throw new Error(`Variasi bahan ${index + 1} harus lebih kecil dari takarannya.`);
                return { supply_id: row.supply_id, quantity_per_serving: quantity, quantity_tolerance: tolerance };
            });
            if (new Set(supplies.map(item => item.supply_id)).size !== supplies.length) {
                throw new Error('Satu bahan cukup ditambahkan sekali untuk menu ini.');
            }
            // Clean up modifiers - ensure price is numeric and filter empty ones
            const cleanModifiers = formData.modifiers
                .filter(m => m.name.trim() !== '')
                .map(m => ({
                    name: m.name.trim(),
                    price: parseInt(m.price) || 0,
                    cost: parseInt(m.cost) || 0
                }));

            const productData = {
                ...(!editingProduct ? { id: draftProductId.current } : {}),
                name: formData.name.trim(),
                category: formData.category,
                sell_price: parseInt(formData.sell_price) || 0,
                cost_price: parseInt(formData.cost_price) || 0,
                modifiers: cleanModifiers
            };

            if (editingProduct) {
                await updateProduct(editingProduct.id, productData, supplies);
            } else {
                await addProduct(productData, supplies);
            }

            setShowModal(false);
            draftProductId.current = null;
        } catch (error) {
            console.error('Error saving product:', error);
            setSaveError(error?.message || 'Gagal menyimpan produk. Coba lagi tanpa mengubah formulir.');
        } finally {
            submitLock.current = false;
            setSaving(false);
        }
    };

    const handleDelete = async (product) => {
        if (confirm(`Hapus produk "${product.name}"?`)) {
            await deleteProduct(product.id);
        }
    };

    const handleAddCategory = async () => {
        if (!newCategoryName.trim()) {
            alert('Nama kategori tidak boleh kosong');
            return;
        }
        try {
            await addCategory(newCategoryName.trim());
            setNewCategoryName('');
            alert('Kategori berhasil ditambahkan!');
        } catch (error) {
            alert('Gagal menambah kategori: ' + error.message);
        }
    };

    const addModifier = () => {
        setFormData(prev => ({
            ...prev,
            modifiers: [...prev.modifiers, { name: '', price: '', cost: '' }]
        }));
    };

    const updateModifier = (index, field, value) => {
        setFormData(prev => ({
            ...prev,
            modifiers: prev.modifiers.map((m, i) =>
                i === index ? {
                    ...m,
                    [field]: field === 'name' ? value : (value === '' ? '' : parseInt(value) || 0)
                } : m
            )
        }));
    };

    const removeModifier = (index) => {
        setFormData(prev => ({
            ...prev,
            modifiers: prev.modifiers.filter((_, i) => i !== index)
        }));
    };

    if (authLoading || loading) {
        return (
            <div className="app-container">
                <Sidebar activePage="products" userRole={user?.role} />
                <main className="main-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div className="animate-pulse text-muted">Memuat...</div>
                </main>
            </div>
        );
    }

    // No full page block - Kasir can see products, but can't edit

    return (
        <div className="app-container">
            <Sidebar activePage="products" userRole={user?.role} />

            <main className="main-content">
                <header className="page-header">
                    <div>
                        <h1 className="page-title">Produk</h1>
                        <p className="text-secondary text-sm">Kelola menu, harga, dan bahan per porsi</p>
                    </div>

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--spacing-sm)', minWidth: 0 }}>
                        {user?.role === 'admin' && (
                            <>
                                <button className="btn btn-secondary" onClick={() => setShowCategoryModal(true)}>
                                    📁 Kategori
                                </button>
                                <button className="btn btn-primary" onClick={openAddModal} disabled={recipeLoading || Boolean(recipeError) || Boolean(productError)}>
                                    + Tambah Produk
                                </button>
                            </>
                        )}
                    </div>
                </header>

                <div style={{ padding: 'var(--spacing-lg)' }}>
                    {productError && <div className={styles.recipeLoadError} role="alert">{productError} <button type="button" className="btn btn-secondary" onClick={() => reload?.()}>Muat ulang produk</button></div>}
                    {recipeError && <div className={styles.recipeLoadError} role="alert">Data bahan belum bisa dimuat. Produk belum dapat diedit agar hubungan bahan yang sudah tersimpan tetap aman. <button type="button" className="btn btn-secondary" onClick={() => refreshRecipes?.()}>Coba lagi</button></div>}
                    {/* Filters */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--spacing-md)', marginBottom: 'var(--spacing-lg)' }}>
                        <input
                            type="text"
                            className="input"
                            placeholder="Cari produk..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            style={{ flex: '1 1 200px', minWidth: '150px' }}
                        />
                        <select
                            className="input"
                            value={selectedCategory}
                            onChange={e => setSelectedCategory(e.target.value)}
                            style={{ flex: '0 1 200px', minWidth: '150px' }}
                        >
                            <option value="all">Semua Kategori</option>
                            {categories.map(cat => (
                                <option key={cat.id} value={cat.id}>{cat.name}</option>
                            ))}
                        </select>
                    </div>

                    {/* Products Grid */}
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
                        gap: 'var(--spacing-md)'
                    }}>
                        {filteredProducts.map(product => {
                            const modifiers = JSON.parse(product.modifiers || '[]');
                            const category = categories.find(c => c.id === product.category);
                            const linkedSupplies = recipeFor(product.id);
                            const profit = product.sell_price - product.cost_price;
                            const margin = ((profit / product.sell_price) * 100).toFixed(0);

                            return (
                                <div key={product.id} className="card">
                                    <div className="card-body">
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--spacing-md)' }}>
                                            <div>
                                                <h4 style={{ marginBottom: '4px' }}>{product.name}</h4>
                                                <span className="badge badge-neutral">{category?.name || 'Unknown'}</span>
                                            </div>
                                            <div className={styles.cardActions}>
                                                {user?.role === 'admin' && (
                                                    <>
                                                        <button className="btn btn-ghost btn-sm" aria-label={`Edit ${product.name}`} disabled={recipeLoading || Boolean(recipeError) || Boolean(productError)} onClick={() => openEditModal(product)}>
                                                            ✏️ Edit
                                                        </button>
                                                        <button className="btn btn-ghost btn-sm" aria-label={`Hapus ${product.name}`} onClick={() => handleDelete(product)}>
                                                            🗑️
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        </div>

                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--spacing-sm)' }}>
                                            <span className="text-secondary text-sm">Harga Jual</span>
                                            <span style={{ fontWeight: '600' }}>{formatCurrency(product.sell_price)}</span>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--spacing-sm)' }}>
                                            <span className="text-secondary text-sm">HPP</span>
                                            <span className="text-warning">{formatCurrency(product.cost_price)}</span>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 'var(--spacing-sm)', borderTop: '1px solid var(--color-border)' }}>
                                            <span className="text-secondary text-sm">Profit</span>
                                            <span style={{ color: 'var(--color-success)', fontWeight: '600' }}>
                                                {formatCurrency(profit)} ({margin}%)
                                            </span>
                                        </div>

                                        {modifiers.length > 0 && (
                                            <div style={{ marginTop: 'var(--spacing-sm)', paddingTop: 'var(--spacing-sm)', borderTop: '1px solid var(--color-border)' }}>
                                                <span className="text-muted text-xs">Modifier: </span>
                                                <span className="text-xs">{modifiers.map(m => m.name).join(', ')}</span>
                                            </div>
                                        )}
                                        <section className={styles.recipeCard} aria-label={`Bahan per porsi ${product.name}`}>
                                            {recipeLoading ? <p>Memuat bahan per porsi…</p> : recipeError ? <p>Status bahan belum tersedia.</p> : linkedSupplies.length ? <>
                                                <strong>Bahan per porsi</strong>
                                                <ul>{linkedSupplies.map(link => {
                                                    const supply = supplyCatalog.find(item => String(item.id) === String(link.supply_id));
                                                    return <li key={link.supply_id}><span>{supply?.name || 'Bahan tersimpan'}</span><span>{formatDose(link.quantity_per_serving)} {unitLabel(supply?.unit || '')}{Number(link.quantity_tolerance) > 0 ? ` ±${formatDose(link.quantity_tolerance)}` : ''} / porsi</span></li>;
                                                })}</ul>
                                            </> : <div className={styles.unlinked}><strong>Belum terhubung — stok bahan tidak berkurang</strong><span>Atur takaran bahan agar penjualan menu ini mengurangi inventory.</span>{user?.role === 'admin' && <button type="button" className="btn btn-secondary btn-sm" aria-label={`Atur bahan ${product.name}`} disabled={recipeLoading || Boolean(recipeError) || Boolean(productError)} onClick={() => openEditModal(product)}>Atur bahan</button>}</div>}
                                        </section>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {filteredProducts.length === 0 && (
                        <div style={{ textAlign: 'center', padding: 'var(--spacing-3xl)', color: 'var(--color-text-muted)' }}>
                            <div style={{ fontSize: '48px', marginBottom: '16px' }}>📦</div>
                            <p>Tidak ada produk ditemukan</p>
                        </div>
                    )}
                </div>
            </main>

            {/* Add/Edit Product Modal */}
            {showModal && (
                <div className="modal-overlay" onClick={event => { if (event.target === event.currentTarget) closeModal(); }}>
                    <div ref={dialogRef} className={`modal ${styles.productDialog}`} role="dialog" aria-modal="true" aria-labelledby="product-dialog-title" aria-busy={saving} onClick={e => e.stopPropagation()} onKeyDown={event => {
                        if (event.key === 'Escape') { event.preventDefault(); if (!submitLock.current) closeModal(); }
                        if (event.key !== 'Tab') return;
                        const focusable = [...dialogRef.current.querySelectorAll('button, input, select, a[href]')].filter(element => !element.disabled);
                        const first = focusable[0], last = focusable.at(-1);
                        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
                        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
                    }}>
                        <div className="modal-header">
                            <h3 id="product-dialog-title" className="modal-title">
                                {editingProduct ? 'Edit Produk' : 'Tambah Produk'}
                            </h3>
                            <button type="button" className="btn btn-ghost btn-icon" aria-label="Tutup formulir produk" disabled={saving} onClick={closeModal}>✕</button>
                        </div>

                        <form onSubmit={handleSubmit}>
                            <fieldset disabled={saving} className={styles.formFieldset}>
                            <div className={`modal-body ${styles.productBody}`}>
                                <div style={{ marginBottom: 'var(--spacing-md)' }}>
                                    <label htmlFor="product-name" className="text-sm text-secondary" style={{ display: 'block', marginBottom: '4px' }}>
                                        Nama Produk *
                                    </label>
                                    <input
                                        id="product-name"
                                        type="text"
                                        className="input"
                                        value={formData.name}
                                        onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                                        required
                                    />
                                </div>

                                <div style={{ marginBottom: 'var(--spacing-md)' }}>
                                    <label htmlFor="product-category" className="text-sm text-secondary" style={{ display: 'block', marginBottom: '4px' }}>
                                        Kategori *
                                    </label>
                                    <select
                                        id="product-category"
                                        className="input"
                                        value={formData.category}
                                        onChange={e => setFormData(prev => ({ ...prev, category: e.target.value }))}
                                        required
                                    >
                                        {categories.map(cat => (
                                            <option key={cat.id} value={cat.id}>{cat.name}</option>
                                        ))}
                                    </select>
                                </div>

                                <div className={styles.priceGrid}>
                                    <div>
                                        <label htmlFor="product-sell-price" className="text-sm text-secondary" style={{ display: 'block', marginBottom: '4px' }}>
                                            Harga Jual (Rp) *
                                        </label>
                                        <input
                                            id="product-sell-price"
                                            type="text"
                                            className="input"
                                            value={formatNumberInput(formData.sell_price)}
                                            onChange={e => setFormData(prev => ({ ...prev, sell_price: parseNumberInput(e.target.value) }))}
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label htmlFor="product-cost-price" className="text-sm text-secondary" style={{ display: 'block', marginBottom: '4px' }}>
                                            HPP (Rp) *
                                        </label>
                                        <input
                                            id="product-cost-price"
                                            type="text"
                                            className="input"
                                            value={formatNumberInput(formData.cost_price)}
                                            onChange={e => setFormData(prev => ({ ...prev, cost_price: parseNumberInput(e.target.value) }))}
                                            required
                                        />
                                    </div>
                                </div>

                                {/* Profit Preview */}
                                {formData.sell_price && formData.cost_price && (
                                    <div style={{
                                        padding: 'var(--spacing-md)',
                                        background: 'var(--color-success-bg)',
                                        borderRadius: 'var(--radius-md)',
                                        marginBottom: 'var(--spacing-md)'
                                    }}>
                                        <span className="text-sm" style={{ color: 'var(--color-success)' }}>
                                            Profit: {formatCurrency(parseInt(formData.sell_price) - parseInt(formData.cost_price))}
                                            ({(((parseInt(formData.sell_price) - parseInt(formData.cost_price)) / parseInt(formData.sell_price)) * 100).toFixed(0)}%)
                                        </span>
                                    </div>
                                )}

                                {/* Modifiers */}
                                <div style={{ marginBottom: 'var(--spacing-md)' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--spacing-sm)' }}>
                                        <label className="text-sm text-secondary">Modifier (Opsional)</label>
                                        <button type="button" className="btn btn-secondary btn-sm" onClick={addModifier}>
                                            + Tambah
                                        </button>
                                    </div>

                                    {formData.modifiers.map((mod, idx) => (
                                        <div key={idx} className={styles.modifierRow}>
                                            <input
                                                type="text"
                                                className="input"
                                                aria-label={`Nama opsi ${idx + 1}`}
                                                placeholder="Nama opsi"
                                                value={mod.name}
                                                onChange={e => updateModifier(idx, 'name', e.target.value)}
                                            />
                                            <input
                                                type="text"
                                                className="input"
                                                aria-label={`Harga opsi ${idx + 1}`}
                                                placeholder="Harga"
                                                value={formatNumberInput(mod.price)}
                                                onChange={e => updateModifier(idx, 'price', parseNumberInput(e.target.value))}
                                            />
                                            <button type="button" className="btn btn-ghost btn-icon" aria-label={`Hapus opsi ${idx + 1}`} onClick={() => removeModifier(idx)}>
                                                ✕
                                            </button>
                                        </div>
                                    ))}
                                </div>

                                <section className={styles.recipeEditor} aria-labelledby="product-recipe-title">
                                    <div className={styles.recipeHeading}>
                                        <div><h4 id="product-recipe-title">Bahan per porsi</h4><p>Pilih bahan yang benar-benar dipakai untuk satu porsi menu ini. Penjualan berikutnya akan mengurangi stok sesuai takaran yang disimpan.</p></div>
                                        <button type="button" className="btn btn-secondary" onClick={addRecipeRow} disabled={recipeRows.length >= Math.min(100, supplyCatalog.length)}>+ Tambah bahan</button>
                                    </div>
                                    {supplyCatalog.length === 0 && <p className={styles.recipeHelp}>Belum ada bahan inventory. {saving ? 'Selesaikan penyimpanan dahulu.' : <Link href="/inventory">Tambah bahan di Inventory</Link>} lalu kembali ke produk ini.</p>}
                                    {recipeRows.map((row, index) => {
                                        const supply = supplyCatalog.find(item => String(item.id) === row.supply_id);
                                        const usedByOthers = new Set(recipeRows.filter(other => other.rowId !== row.rowId).map(other => other.supply_id));
                                        return <div key={row.rowId} className={styles.recipeRow}>
                                            <label>Bahan {index + 1}
                                                <select className="input" required value={row.supply_id} onChange={event => updateRecipeRow(row.rowId, 'supply_id', event.target.value)}>
                                                    <option value="">Pilih bahan</option>
                                                    {supplyCatalog.filter(item => String(item.id) === row.supply_id || !usedByOthers.has(String(item.id))).map(item => <option key={item.id} value={item.id}>{item.name} ({unitLabel(item.unit)})</option>)}
                                                </select>
                                            </label>
                                            <label>Takaran bahan {index + 1} ({unitLabel(supply?.unit || 'satuan')} / porsi)
                                                <input className="input" type="number" inputMode="decimal" min="0.000001" step="any" required value={row.quantity_per_serving} placeholder="Isi takaran" onChange={event => updateRecipeRow(row.rowId, 'quantity_per_serving', event.target.value)} />
                                            </label>
                                            <label>Variasi bahan {index + 1} (± {unitLabel(supply?.unit || 'satuan')})
                                                <input className="input" type="number" inputMode="decimal" min="0" step="any" required value={row.quantity_tolerance} onChange={event => updateRecipeRow(row.rowId, 'quantity_tolerance', event.target.value)} />
                                            </label>
                                            <div className={styles.recipeRowActions}>
                                                {supply?.unit === 'ml' && !row.quantity_per_serving && <button type="button" className="btn btn-secondary btn-sm" onClick={() => setRecipeRows(previous => previous.map(item => item.rowId === row.rowId ? { ...item, quantity_per_serving: '15', quantity_tolerance: '3' } : item))}>Isi 15 ml ±3 ml</button>}
                                                <button type="button" className="btn btn-ghost btn-sm" aria-label={`Hapus bahan ${index + 1}`} onClick={() => removeRecipeRow(row.rowId)}>Hapus</button>
                                            </div>
                                        </div>;
                                    })}
                                    {recipeRows.length === 0 && <label className={styles.untrackedChoice}><input type="checkbox" checked={untrackedAcknowledged} onChange={event => setUntrackedAcknowledged(event.target.checked)} /> Produk ini tidak memakai bahan inventory</label>}
                                    {recipeRows.length === 0 && !untrackedAcknowledged && <p className={styles.recipeHelp}>Pilih bahan, atau konfirmasi bahwa menu ini memang tidak menggunakan bahan yang dicatat di Inventory.</p>}
                                    {recipeRows.length > 0 && <p className={styles.recipeHelp}>Takaran per porsi memakai satuan bahan. Ubah tiap menu sesuai resepnya; variasi boleh 0. Menyimpan resep tidak mengubah sisa stok yang sudah ada.</p>}
                                </section>
                                {saveError && <div className={styles.saveError} role="alert">{saveError}</div>}
                            </div>

                            <div className={`modal-footer ${styles.productFooter}`}>
                                <button type="button" className="btn btn-ghost" onClick={closeModal}>
                                    Batal
                                </button>
                                <button type="submit" className="btn btn-primary" disabled={saving || recipeLoading || Boolean(recipeError) || Boolean(productError)}>
                                    {saving ? 'Menyimpan…' : editingProduct ? 'Simpan Perubahan' : 'Tambah Produk'}
                                </button>
                            </div>
                            </fieldset>
                        </form>
                    </div>
                </div>
            )}

            {/* Category Management Modal */}
            {showCategoryModal && (
                <div className="modal-overlay" onClick={() => setShowCategoryModal(false)}>
                    <div className="modal" style={{ maxWidth: '400px' }} onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3 className="modal-title">Kelola Kategori</h3>
                            <button className="btn btn-ghost btn-icon" onClick={() => setShowCategoryModal(false)}>✕</button>
                        </div>
                        <div className="modal-body">
                            {/* Add New Category */}
                            <div style={{ display: 'flex', gap: 'var(--spacing-sm)', marginBottom: 'var(--spacing-lg)' }}>
                                <input
                                    type="text"
                                    className="input"
                                    placeholder="Nama kategori baru..."
                                    value={newCategoryName}
                                    onChange={e => setNewCategoryName(e.target.value)}
                                    onKeyPress={e => e.key === 'Enter' && handleAddCategory()}
                                    style={{ flex: 1 }}
                                />
                                <button className="btn btn-primary" onClick={handleAddCategory}>
                                    + Tambah
                                </button>
                            </div>

                            {/* Category List */}
                            <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 'var(--spacing-md)' }}>
                                <h4 className="text-sm text-secondary" style={{ marginBottom: 'var(--spacing-sm)' }}>
                                    Kategori Saat Ini ({categories.length})
                                </h4>
                                {categories.length === 0 ? (
                                    <p className="text-muted text-sm">Belum ada kategori. Tambahkan kategori pertama Anda!</p>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-sm)' }}>
                                        {categories.map(cat => (
                                            <div key={cat.id} style={{
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'center',
                                                padding: 'var(--spacing-sm) var(--spacing-md)',
                                                background: 'var(--color-bg-secondary)',
                                                borderRadius: 'var(--radius-md)'
                                            }}>
                                                <span>{cat.name}</span>
                                                <span className="text-muted text-xs">
                                                    {products.filter(p => p.category === cat.id).length} produk
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={() => setShowCategoryModal(false)}>
                                Tutup
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}


export const getServerSideProps = async () => { return { props: {} }; };
