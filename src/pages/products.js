import { useEffect, useState } from 'react';
import Sidebar from '@/components/layout/Sidebar';
import { useAuth } from '@/hooks/useAuth';
import { useProducts } from '@/hooks/useProducts';
import { formatCurrency, formatNumberInput, parseNumberInput } from '@/lib/db';

export default function ProductsPage() {
    const { user, loading: authLoading } = useAuth();
    const { products, categories, loading, addProduct, updateProduct, deleteProduct, addCategory, reload } = useProducts(user?.id, user?.role);

    const [showModal, setShowModal] = useState(false);
    const [editingProduct, setEditingProduct] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('all');

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

    const filteredProducts = products.filter(p => {
        const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesCategory = selectedCategory === 'all' || p.category === selectedCategory;
        return matchesSearch && matchesCategory;
    });

    const openAddModal = () => {
        setEditingProduct(null);
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
        setEditingProduct(product);
        setFormData({
            name: product.name,
            category: product.category,
            sell_price: product.sell_price.toString(),
            cost_price: product.cost_price.toString(),
            modifiers: JSON.parse(product.modifiers || '[]')
        });
        setShowModal(true);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        try {
            // Clean up modifiers - ensure price is numeric and filter empty ones
            const cleanModifiers = formData.modifiers
                .filter(m => m.name.trim() !== '')
                .map(m => ({
                    name: m.name.trim(),
                    price: parseInt(m.price) || 0,
                    cost: parseInt(m.cost) || 0
                }));

            const productData = {
                name: formData.name,
                category: formData.category,
                sell_price: parseInt(formData.sell_price) || 0,
                cost_price: parseInt(formData.cost_price) || 0,
                modifiers: cleanModifiers
            };

            if (editingProduct) {
                await updateProduct(editingProduct.id, productData);
                alert('Produk berhasil diperbarui!');
            } else {
                await addProduct(productData);
                alert('Produk berhasil ditambahkan!');
            }

            setShowModal(false);
        } catch (error) {
            console.error('Error saving product:', error);
            alert('Gagal menyimpan produk: ' + error.message);
        }
    };

    const handleDelete = async (product) => {
        if (confirm(`Hapus produk "${product.name}"?`)) {
            await deleteProduct(product.id);
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
                <Sidebar activePage="products" />
                <main className="main-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div className="animate-pulse text-muted">Memuat...</div>
                </main>
            </div>
        );
    }

    // Only admin can access
    if (user?.role !== 'admin') {
        return (
            <div className="app-container">
                <Sidebar activePage="products" />
                <main className="main-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '48px', marginBottom: '16px' }}>🔒</div>
                        <h2>Akses Ditolak</h2>
                        <p className="text-secondary">Hanya Admin yang dapat mengakses halaman ini</p>
                    </div>
                </main>
            </div>
        );
    }

    return (
        <div className="app-container">
            <Sidebar activePage="products" />

            <main className="main-content">
                <header className="page-header">
                    <div>
                        <h1 className="page-title">Produk</h1>
                        <p className="text-secondary text-sm">Kelola menu dan harga</p>
                    </div>

                    <button className="btn btn-primary" onClick={openAddModal}>
                        + Tambah Produk
                    </button>
                </header>

                <div style={{ padding: 'var(--spacing-lg)' }}>
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
                                            <div style={{ display: 'flex', gap: '4px' }}>
                                                <button className="btn btn-ghost btn-sm" onClick={() => openEditModal(product)}>
                                                    ✏️
                                                </button>
                                                <button className="btn btn-ghost btn-sm" onClick={() => handleDelete(product)}>
                                                    🗑️
                                                </button>
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
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="modal" style={{ width: '100%', maxWidth: '500px', maxHeight: '90vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3 className="modal-title">
                                {editingProduct ? 'Edit Produk' : 'Tambah Produk'}
                            </h3>
                            <button className="btn btn-ghost btn-icon" onClick={() => setShowModal(false)}>✕</button>
                        </div>

                        <form onSubmit={handleSubmit}>
                            <div className="modal-body">
                                <div style={{ marginBottom: 'var(--spacing-md)' }}>
                                    <label className="text-sm text-secondary" style={{ display: 'block', marginBottom: '4px' }}>
                                        Nama Produk *
                                    </label>
                                    <input
                                        type="text"
                                        className="input"
                                        value={formData.name}
                                        onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                                        required
                                    />
                                </div>

                                <div style={{ marginBottom: 'var(--spacing-md)' }}>
                                    <label className="text-sm text-secondary" style={{ display: 'block', marginBottom: '4px' }}>
                                        Kategori *
                                    </label>
                                    <select
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

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--spacing-md)', marginBottom: 'var(--spacing-md)' }}>
                                    <div>
                                        <label className="text-sm text-secondary" style={{ display: 'block', marginBottom: '4px' }}>
                                            Harga Jual (Rp) *
                                        </label>
                                        <input
                                            type="text"
                                            className="input"
                                            value={formatNumberInput(formData.sell_price)}
                                            onChange={e => setFormData(prev => ({ ...prev, sell_price: parseNumberInput(e.target.value) }))}
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label className="text-sm text-secondary" style={{ display: 'block', marginBottom: '4px' }}>
                                            HPP (Rp) *
                                        </label>
                                        <input
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
                                        <div key={idx} style={{
                                            display: 'grid',
                                            gridTemplateColumns: '2fr 1fr auto',
                                            gap: '8px',
                                            marginBottom: '8px'
                                        }}>
                                            <input
                                                type="text"
                                                className="input"
                                                placeholder="Nama opsi"
                                                value={mod.name}
                                                onChange={e => updateModifier(idx, 'name', e.target.value)}
                                            />
                                            <input
                                                type="text"
                                                className="input"
                                                placeholder="Harga"
                                                value={formatNumberInput(mod.price)}
                                                onChange={e => updateModifier(idx, 'price', parseNumberInput(e.target.value))}
                                            />
                                            <button type="button" className="btn btn-ghost btn-icon" onClick={() => removeModifier(idx)}>
                                                ✕
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="modal-footer">
                                <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>
                                    Batal
                                </button>
                                <button type="submit" className="btn btn-primary">
                                    {editingProduct ? 'Simpan Perubahan' : 'Tambah Produk'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
