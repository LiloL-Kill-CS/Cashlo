import { useState, useEffect } from 'react';
import Sidebar from '@/components/layout/Sidebar';
import { useAuth } from '@/hooks/useAuth';
import { useProducts } from '@/hooks/useProducts';
import { useSuppliers } from '@/hooks/useSuppliers';
import { useRecipes } from '@/hooks/useRecipes';
import { formatCurrency, formatNumberInput, parseNumberInput } from '@/lib/db';

export default function HPPPage() {
    const { user, loading: authLoading } = useAuth();
    const ownerId = user?.owner_id || user?.id;
    const { products, categories } = useProducts(ownerId, user?.role);
    const { suppliers, ingredients, addSupplier, updateSupplier, deleteSupplier, addIngredient, updateIngredient, deleteIngredient, loading: supLoading } = useSuppliers(ownerId);
    const { recipes, saveRecipe, deleteRecipe, getRecipeForProduct, loading: recLoading } = useRecipes(ownerId);

    const [activeTab, setActiveTab] = useState('dashboard');
    const [showSupplierModal, setShowSupplierModal] = useState(false);
    const [showIngredientModal, setShowIngredientModal] = useState(false);
    const [showRecipeModal, setShowRecipeModal] = useState(false);
    const [editingSupplier, setEditingSupplier] = useState(null);
    const [editingIngredient, setEditingIngredient] = useState(null);
    const [selectedProduct, setSelectedProduct] = useState(null);
    const [recipeLines, setRecipeLines] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');

    // Supplier form
    const [supForm, setSupForm] = useState({ name: '', contact: '', phone: '', address: '', notes: '' });
    // Ingredient form
    const [ingForm, setIngForm] = useState({ name: '', supplier_id: '', unit: 'gram', pack_size: '', pack_price: '' });

    useEffect(() => {
        if (!authLoading && !user) window.location.href = '/';
    }, [user, authLoading]);

    // --- Supplier CRUD ---
    const openAddSupplier = () => { setEditingSupplier(null); setSupForm({ name: '', contact: '', phone: '', address: '', notes: '' }); setShowSupplierModal(true); };
    const openEditSupplier = (s) => { setEditingSupplier(s); setSupForm({ name: s.name, contact: s.contact || '', phone: s.phone || '', address: s.address || '', notes: s.notes || '' }); setShowSupplierModal(true); };
    const handleSaveSupplier = async (e) => {
        e.preventDefault();
        try {
            if (editingSupplier) { await updateSupplier(editingSupplier.id, supForm); }
            else { await addSupplier(supForm); }
            setShowSupplierModal(false);
        } catch (err) { alert('Gagal: ' + err.message); }
    };

    // --- Ingredient CRUD ---
    const openAddIngredient = () => { setEditingIngredient(null); setIngForm({ name: '', supplier_id: '', unit: 'gram', pack_size: '', pack_price: '' }); setShowIngredientModal(true); };
    const openEditIngredient = (i) => {
        setEditingIngredient(i);
        setIngForm({ name: i.name, supplier_id: i.supplier_id || '', unit: i.unit || 'gram', pack_size: (i.pack_size || '').toString(), pack_price: (i.pack_price || '').toString() });
        setShowIngredientModal(true);
    };
    const handleSaveIngredient = async (e) => {
        e.preventDefault();
        const data = { ...ingForm, pack_size: parseFloat(ingForm.pack_size) || 0, pack_price: parseFloat(ingForm.pack_price) || 0 };
        try {
            if (editingIngredient) { await updateIngredient(editingIngredient.id, data); }
            else { await addIngredient(data); }
            setShowIngredientModal(false);
        } catch (err) { alert('Gagal: ' + err.message); }
    };

    // --- Recipe / HPP Calculator ---
    const openRecipeEditor = (product) => {
        setSelectedProduct(product);
        const existing = getRecipeForProduct(product.id);
        if (existing) {
            setRecipeLines(JSON.parse(existing.ingredients || '[]'));
        } else {
            setRecipeLines([]);
        }
        setShowRecipeModal(true);
    };

    const addRecipeLine = () => {
        setRecipeLines(prev => [...prev, { ingredient_id: '', ingredient_name: '', qty_used: '', unit: '', unit_cost: 0, line_cost: 0 }]);
    };

    const updateRecipeLine = (idx, field, value) => {
        setRecipeLines(prev => prev.map((line, i) => {
            if (i !== idx) return line;
            const updated = { ...line, [field]: value };
            // If ingredient changed, auto-fill unit cost
            if (field === 'ingredient_id') {
                const ing = ingredients.find(ig => ig.id === value);
                if (ing) {
                    updated.ingredient_name = ing.name;
                    updated.unit = ing.unit;
                    updated.unit_cost = ing.pack_size > 0 ? (ing.pack_price / ing.pack_size) : 0;
                }
            }
            // Recalculate line cost
            const qty = parseFloat(updated.qty_used) || 0;
            updated.line_cost = qty * updated.unit_cost;
            return updated;
        }));
    };

    const removeRecipeLine = (idx) => {
        setRecipeLines(prev => prev.filter((_, i) => i !== idx));
    };

    const recipeTotalCost = recipeLines.reduce((sum, l) => sum + (l.line_cost || 0), 0);

    const handleSaveRecipe = async () => {
        if (!selectedProduct) return;
        try {
            await saveRecipe(selectedProduct.id, selectedProduct.name, recipeLines);
            alert('Resep HPP berhasil disimpan!');
            setShowRecipeModal(false);
        } catch (err) { alert('Gagal: ' + err.message); }
    };

    // --- Dashboard calculations ---
    const getProductHPP = (product) => {
        const recipe = getRecipeForProduct(product.id);
        if (recipe) return recipe.total_cost;
        return product.cost_price;
    };

    const menuData = products.map(p => {
        const hpp = getProductHPP(p);
        const margin = p.sell_price > 0 ? ((p.sell_price - hpp) / p.sell_price * 100) : 0;
        const category = categories.find(c => c.id === p.category);
        return { ...p, hpp, margin: margin.toFixed(1), profit: p.sell_price - hpp, categoryName: category?.name || '-', hasRecipe: !!getRecipeForProduct(p.id) };
    });

    const avgMargin = menuData.length > 0 ? (menuData.reduce((s, m) => s + parseFloat(m.margin), 0) / menuData.length).toFixed(1) : '0';
    const lowMarginItems = menuData.filter(m => parseFloat(m.margin) < 30);
    const totalIngredients = ingredients.length;
    const totalSuppliers = suppliers.length;

    const filteredMenu = menuData.filter(m => m.name.toLowerCase().includes(searchQuery.toLowerCase()));

    if (authLoading || supLoading || recLoading) {
        return (
            <div className="app-container">
                <Sidebar activePage="hpp" userRole={user?.role} />
                <main className="main-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div className="animate-pulse text-muted">Memuat HPP Calculator...</div>
                </main>
            </div>
        );
    }

    const tabStyle = (tab) => ({
        padding: '10px 20px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: '600', fontSize: '13px',
        background: activeTab === tab ? 'var(--color-primary)' : 'var(--color-bg-secondary)',
        color: activeTab === tab ? 'white' : 'var(--color-text-secondary)',
        transition: 'all 0.2s'
    });

    return (
        <div className="app-container">
            <Sidebar activePage="hpp" userRole={user?.role} />
            <main className="main-content">
                <header className="page-header">
                    <div>
                        <h1 className="page-title">📊 HPP / COGS Calculator</h1>
                        <p className="text-secondary text-sm">Hitung biaya produksi & margin otomatis dari komposisi bahan</p>
                    </div>
                </header>

                <div style={{ padding: 'var(--spacing-lg)' }}>
                    {/* Tabs */}
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', flexWrap: 'wrap' }}>
                        <button style={tabStyle('dashboard')} onClick={() => setActiveTab('dashboard')}>📋 Dashboard Menu</button>
                        <button style={tabStyle('suppliers')} onClick={() => setActiveTab('suppliers')}>🏭 Database Supplier</button>
                        <button style={tabStyle('ingredients')} onClick={() => setActiveTab('ingredients')}>🧪 Bahan Baku</button>
                        <button style={tabStyle('calculator')} onClick={() => setActiveTab('calculator')}>🧮 Kalkulator HPP</button>
                    </div>

                    {/* ========== TAB: DASHBOARD MENU ========== */}
                    {activeTab === 'dashboard' && (
                        <div>
                            {/* Summary Cards */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
                                <div className="card" style={{ background: 'linear-gradient(135deg, #667eea, #764ba2)', color: 'white', border: 'none' }}>
                                    <div className="card-body" style={{ padding: '20px' }}>
                                        <div style={{ fontSize: '12px', opacity: 0.8, marginBottom: '4px' }}>Total Menu</div>
                                        <div style={{ fontSize: '28px', fontWeight: '800' }}>{products.length}</div>
                                    </div>
                                </div>
                                <div className="card" style={{ background: 'linear-gradient(135deg, #f093fb, #f5576c)', color: 'white', border: 'none' }}>
                                    <div className="card-body" style={{ padding: '20px' }}>
                                        <div style={{ fontSize: '12px', opacity: 0.8, marginBottom: '4px' }}>Avg Gross Margin</div>
                                        <div style={{ fontSize: '28px', fontWeight: '800' }}>{avgMargin}%</div>
                                    </div>
                                </div>
                                <div className="card" style={{ background: 'linear-gradient(135deg, #4facfe, #00f2fe)', color: 'white', border: 'none' }}>
                                    <div className="card-body" style={{ padding: '20px' }}>
                                        <div style={{ fontSize: '12px', opacity: 0.8, marginBottom: '4px' }}>Bahan Baku</div>
                                        <div style={{ fontSize: '28px', fontWeight: '800' }}>{totalIngredients}</div>
                                    </div>
                                </div>
                                <div className="card" style={{ background: 'linear-gradient(135deg, #43e97b, #38f9d7)', color: 'white', border: 'none' }}>
                                    <div className="card-body" style={{ padding: '20px' }}>
                                        <div style={{ fontSize: '12px', opacity: 0.8, marginBottom: '4px' }}>Supplier</div>
                                        <div style={{ fontSize: '28px', fontWeight: '800' }}>{totalSuppliers}</div>
                                    </div>
                                </div>
                            </div>

                            {/* Low Margin Warning */}
                            {lowMarginItems.length > 0 && (
                                <div className="card" style={{ marginBottom: '20px', borderLeft: '4px solid var(--color-warning)' }}>
                                    <div className="card-body" style={{ padding: '16px' }}>
                                        <strong style={{ color: 'var(--color-warning)' }}>⚠️ {lowMarginItems.length} menu dengan margin &lt; 30%</strong>
                                        <p className="text-sm text-secondary" style={{ marginTop: '4px' }}>
                                            {lowMarginItems.map(m => m.name).join(', ')}
                                        </p>
                                    </div>
                                </div>
                            )}

                            {/* Search */}
                            <input type="text" className="input" placeholder="🔍 Cari menu..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                                style={{ marginBottom: '16px', maxWidth: '400px' }} />

                            {/* Menu Table */}
                            <div className="card">
                                <div className="card-body" style={{ padding: 0, overflowX: 'auto' }}>
                                    <table className="table" style={{ minWidth: '700px' }}>
                                        <thead>
                                            <tr>
                                                <th>Menu</th>
                                                <th>Kategori</th>
                                                <th style={{ textAlign: 'right' }}>Harga Jual</th>
                                                <th style={{ textAlign: 'right' }}>HPP (COGS)</th>
                                                <th style={{ textAlign: 'right' }}>Profit</th>
                                                <th style={{ textAlign: 'right' }}>Margin</th>
                                                <th style={{ textAlign: 'center' }}>Resep</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {filteredMenu.map(m => (
                                                <tr key={m.id}>
                                                    <td style={{ fontWeight: '600' }}>{m.name}</td>
                                                    <td><span className="badge badge-neutral">{m.categoryName}</span></td>
                                                    <td style={{ textAlign: 'right' }}>{formatCurrency(m.sell_price)}</td>
                                                    <td style={{ textAlign: 'right', color: 'var(--color-warning)' }}>{formatCurrency(m.hpp)}</td>
                                                    <td style={{ textAlign: 'right', color: 'var(--color-success)', fontWeight: '600' }}>{formatCurrency(m.profit)}</td>
                                                    <td style={{ textAlign: 'right' }}>
                                                        <span className="badge" style={{
                                                            background: parseFloat(m.margin) >= 50 ? 'var(--color-success-bg)' : parseFloat(m.margin) >= 30 ? '#fef3c7' : '#fee2e2',
                                                            color: parseFloat(m.margin) >= 50 ? 'var(--color-success)' : parseFloat(m.margin) >= 30 ? '#92400e' : '#dc2626'
                                                        }}>{m.margin}%</span>
                                                    </td>
                                                    <td style={{ textAlign: 'center' }}>
                                                        {m.hasRecipe
                                                            ? <span className="badge badge-success" style={{ cursor: 'pointer' }} onClick={() => openRecipeEditor(m)}>✅ Edit</span>
                                                            : <button className="btn btn-sm btn-outline" onClick={() => openRecipeEditor(m)}>+ Buat</button>
                                                        }
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ========== TAB: SUPPLIERS ========== */}
                    {activeTab === 'suppliers' && (
                        <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
                                <h3>Database Supplier ({suppliers.length})</h3>
                                <button className="btn btn-primary" onClick={openAddSupplier}>+ Tambah Supplier</button>
                            </div>

                            {suppliers.length === 0 ? (
                                <div className="card" style={{ textAlign: 'center', padding: '60px 20px' }}>
                                    <div style={{ fontSize: '48px', marginBottom: '12px' }}>🏭</div>
                                    <p className="text-secondary">Belum ada supplier. Tambahkan supplier pertama Anda!</p>
                                </div>
                            ) : (
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
                                    {suppliers.map(s => (
                                        <div key={s.id} className="card">
                                            <div className="card-body">
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                                                    <div>
                                                        <h4 style={{ marginBottom: '4px' }}>{s.name}</h4>
                                                        {s.contact && <span className="text-sm text-secondary">👤 {s.contact}</span>}
                                                    </div>
                                                    <div style={{ display: 'flex', gap: '4px' }}>
                                                        <button className="btn btn-ghost btn-sm" onClick={() => openEditSupplier(s)}>✏️</button>
                                                        <button className="btn btn-ghost btn-sm" onClick={() => { if (confirm('Hapus supplier?')) deleteSupplier(s.id); }}>🗑️</button>
                                                    </div>
                                                </div>
                                                {s.phone && <div className="text-sm" style={{ marginBottom: '4px' }}>📞 {s.phone}</div>}
                                                {s.address && <div className="text-sm text-secondary">📍 {s.address}</div>}
                                                {s.notes && <div className="text-xs text-muted" style={{ marginTop: '8px', fontStyle: 'italic' }}>{s.notes}</div>}
                                                <div className="text-xs text-muted" style={{ marginTop: '8px' }}>
                                                    {ingredients.filter(i => i.supplier_id === s.id).length} bahan terdaftar
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* ========== TAB: INGREDIENTS ========== */}
                    {activeTab === 'ingredients' && (
                        <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
                                <h3>Bahan Baku ({ingredients.length})</h3>
                                <button className="btn btn-primary" onClick={openAddIngredient}>+ Tambah Bahan</button>
                            </div>

                            {ingredients.length === 0 ? (
                                <div className="card" style={{ textAlign: 'center', padding: '60px 20px' }}>
                                    <div style={{ fontSize: '48px', marginBottom: '12px' }}>🧪</div>
                                    <p className="text-secondary">Belum ada bahan baku. Tambahkan bahan pertama!</p>
                                </div>
                            ) : (
                                <div className="card">
                                    <div className="card-body" style={{ padding: 0, overflowX: 'auto' }}>
                                        <table className="table" style={{ minWidth: '600px' }}>
                                            <thead>
                                                <tr>
                                                    <th>Bahan</th>
                                                    <th>Supplier</th>
                                                    <th>Satuan</th>
                                                    <th style={{ textAlign: 'right' }}>Ukuran Kemasan</th>
                                                    <th style={{ textAlign: 'right' }}>Harga Kemasan</th>
                                                    <th style={{ textAlign: 'right' }}>Harga/Satuan</th>
                                                    <th style={{ textAlign: 'right' }}>Aksi</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {ingredients.map(i => {
                                                    const sup = suppliers.find(s => s.id === i.supplier_id);
                                                    const unitCost = i.pack_size > 0 ? i.pack_price / i.pack_size : 0;
                                                    return (
                                                        <tr key={i.id}>
                                                            <td style={{ fontWeight: '600' }}>{i.name}</td>
                                                            <td><span className="badge badge-neutral">{sup?.name || '-'}</span></td>
                                                            <td>{i.unit}</td>
                                                            <td style={{ textAlign: 'right' }}>{formatNumberInput(i.pack_size?.toString())} {i.unit}</td>
                                                            <td style={{ textAlign: 'right' }}>{formatCurrency(i.pack_price)}</td>
                                                            <td style={{ textAlign: 'right', fontWeight: '600', color: 'var(--color-primary)' }}>{formatCurrency(Math.round(unitCost))}/{i.unit}</td>
                                                            <td style={{ textAlign: 'right' }}>
                                                                <button className="btn btn-ghost btn-sm" onClick={() => openEditIngredient(i)}>✏️</button>
                                                                <button className="btn btn-ghost btn-sm" onClick={() => { if (confirm('Hapus bahan?')) deleteIngredient(i.id); }}>🗑️</button>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ========== TAB: CALCULATOR ========== */}
                    {activeTab === 'calculator' && (
                        <div>
                            <h3 style={{ marginBottom: '16px' }}>Pilih Menu untuk Hitung HPP</h3>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '12px' }}>
                                {products.map(p => {
                                    const recipe = getRecipeForProduct(p.id);
                                    const hpp = recipe ? recipe.total_cost : p.cost_price;
                                    const margin = p.sell_price > 0 ? ((p.sell_price - hpp) / p.sell_price * 100).toFixed(1) : '0';
                                    return (
                                        <div key={p.id} className="card" style={{ cursor: 'pointer', transition: 'transform 0.2s, box-shadow 0.2s' }}
                                            onClick={() => openRecipeEditor(p)}
                                            onMouseOver={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 25px rgba(0,0,0,0.12)'; }}
                                            onMouseOut={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = ''; }}>
                                            <div className="card-body">
                                                <h4 style={{ marginBottom: '8px' }}>{p.name}</h4>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                                    <span className="text-sm text-secondary">Harga Jual</span>
                                                    <span style={{ fontWeight: '600' }}>{formatCurrency(p.sell_price)}</span>
                                                </div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                                    <span className="text-sm text-secondary">HPP</span>
                                                    <span style={{ color: 'var(--color-warning)' }}>{formatCurrency(hpp)}</span>
                                                </div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '8px', borderTop: '1px solid var(--color-border)' }}>
                                                    <span className="text-sm text-secondary">Margin</span>
                                                    <span className="badge" style={{
                                                        background: parseFloat(margin) >= 50 ? 'var(--color-success-bg)' : parseFloat(margin) >= 30 ? '#fef3c7' : '#fee2e2',
                                                        color: parseFloat(margin) >= 50 ? 'var(--color-success)' : parseFloat(margin) >= 30 ? '#92400e' : '#dc2626'
                                                    }}>{margin}%</span>
                                                </div>
                                                {recipe && <div className="text-xs text-muted" style={{ marginTop: '8px' }}>✅ Resep tersedia ({JSON.parse(recipe.ingredients || '[]').length} bahan)</div>}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            </main>

            {/* ===== SUPPLIER MODAL ===== */}
            {showSupplierModal && (
                <div className="modal-overlay" onClick={() => setShowSupplierModal(false)}>
                    <div className="modal" style={{ width: '100%', maxWidth: '450px' }} onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3 className="modal-title">{editingSupplier ? 'Edit Supplier' : 'Tambah Supplier'}</h3>
                            <button className="btn btn-ghost btn-icon" onClick={() => setShowSupplierModal(false)}>✕</button>
                        </div>
                        <form onSubmit={handleSaveSupplier}>
                            <div className="modal-body">
                                {[
                                    { label: 'Nama Supplier *', key: 'name', required: true },
                                    { label: 'Contact Person', key: 'contact' },
                                    { label: 'No. Telepon', key: 'phone' },
                                    { label: 'Alamat', key: 'address' },
                                    { label: 'Catatan', key: 'notes' }
                                ].map(f => (
                                    <div key={f.key} style={{ marginBottom: '12px' }}>
                                        <label className="text-sm text-secondary" style={{ display: 'block', marginBottom: '4px' }}>{f.label}</label>
                                        <input type="text" className="input" value={supForm[f.key]}
                                            onChange={e => setSupForm(prev => ({ ...prev, [f.key]: e.target.value }))} required={f.required} />
                                    </div>
                                ))}
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-ghost" onClick={() => setShowSupplierModal(false)}>Batal</button>
                                <button type="submit" className="btn btn-primary">Simpan</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ===== INGREDIENT MODAL ===== */}
            {showIngredientModal && (
                <div className="modal-overlay" onClick={() => setShowIngredientModal(false)}>
                    <div className="modal" style={{ width: '100%', maxWidth: '450px' }} onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3 className="modal-title">{editingIngredient ? 'Edit Bahan' : 'Tambah Bahan Baku'}</h3>
                            <button className="btn btn-ghost btn-icon" onClick={() => setShowIngredientModal(false)}>✕</button>
                        </div>
                        <form onSubmit={handleSaveIngredient}>
                            <div className="modal-body">
                                <div style={{ marginBottom: '12px' }}>
                                    <label className="text-sm text-secondary" style={{ display: 'block', marginBottom: '4px' }}>Nama Bahan *</label>
                                    <input type="text" className="input" value={ingForm.name}
                                        onChange={e => setIngForm(prev => ({ ...prev, name: e.target.value }))} required />
                                </div>
                                <div style={{ marginBottom: '12px' }}>
                                    <label className="text-sm text-secondary" style={{ display: 'block', marginBottom: '4px' }}>Supplier</label>
                                    <select className="input" value={ingForm.supplier_id} onChange={e => setIngForm(prev => ({ ...prev, supplier_id: e.target.value }))}>
                                        <option value="">-- Pilih Supplier --</option>
                                        {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                    </select>
                                </div>
                                <div style={{ marginBottom: '12px' }}>
                                    <label className="text-sm text-secondary" style={{ display: 'block', marginBottom: '4px' }}>Satuan</label>
                                    <select className="input" value={ingForm.unit} onChange={e => setIngForm(prev => ({ ...prev, unit: e.target.value }))}>
                                        {['gram','kg','ml','liter','pcs','butir','sachet','bungkus'].map(u => <option key={u} value={u}>{u}</option>)}
                                    </select>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                    <div>
                                        <label className="text-sm text-secondary" style={{ display: 'block', marginBottom: '4px' }}>Ukuran Kemasan</label>
                                        <input type="text" className="input" placeholder="cth: 1000" value={formatNumberInput(ingForm.pack_size)}
                                            onChange={e => setIngForm(prev => ({ ...prev, pack_size: parseNumberInput(e.target.value) }))} />
                                    </div>
                                    <div>
                                        <label className="text-sm text-secondary" style={{ display: 'block', marginBottom: '4px' }}>Harga Kemasan (Rp)</label>
                                        <input type="text" className="input" placeholder="cth: 50000" value={formatNumberInput(ingForm.pack_price)}
                                            onChange={e => setIngForm(prev => ({ ...prev, pack_price: parseNumberInput(e.target.value) }))} />
                                    </div>
                                </div>
                                {ingForm.pack_size && ingForm.pack_price && (
                                    <div style={{ marginTop: '12px', padding: '12px', background: 'var(--color-success-bg)', borderRadius: '8px' }}>
                                        <span className="text-sm" style={{ color: 'var(--color-success)', fontWeight: '600' }}>
                                            Harga per {ingForm.unit}: {formatCurrency(Math.round((parseFloat(ingForm.pack_price) || 0) / (parseFloat(ingForm.pack_size) || 1)))}
                                        </span>
                                    </div>
                                )}
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-ghost" onClick={() => setShowIngredientModal(false)}>Batal</button>
                                <button type="submit" className="btn btn-primary">Simpan</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ===== RECIPE / HPP CALCULATOR MODAL ===== */}
            {showRecipeModal && selectedProduct && (
                <div className="modal-overlay" onClick={() => setShowRecipeModal(false)}>
                    <div className="modal" style={{ width: '100%', maxWidth: '700px', maxHeight: '90vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <div>
                                <h3 className="modal-title">🧮 Kalkulator HPP: {selectedProduct.name}</h3>
                                <p className="text-sm text-secondary">Harga Jual: {formatCurrency(selectedProduct.sell_price)}</p>
                            </div>
                            <button className="btn btn-ghost btn-icon" onClick={() => setShowRecipeModal(false)}>✕</button>
                        </div>
                        <div className="modal-body">
                            {/* Recipe Lines */}
                            <div style={{ marginBottom: '16px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                                    <label className="text-sm text-secondary" style={{ fontWeight: '600' }}>Komposisi Bahan</label>
                                    <button type="button" className="btn btn-sm btn-secondary" onClick={addRecipeLine}>+ Tambah Bahan</button>
                                </div>

                                {recipeLines.length === 0 && (
                                    <div style={{ textAlign: 'center', padding: '30px', background: 'var(--color-bg-secondary)', borderRadius: '8px' }}>
                                        <p className="text-muted text-sm">Belum ada bahan. Klik "+ Tambah Bahan" untuk mulai.</p>
                                    </div>
                                )}

                                {recipeLines.map((line, idx) => (
                                    <div key={idx} style={{
                                        display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto',
                                        gap: '8px', marginBottom: '8px', alignItems: 'center'
                                    }}>
                                        <select className="input" value={line.ingredient_id}
                                            onChange={e => updateRecipeLine(idx, 'ingredient_id', e.target.value)}>
                                            <option value="">-- Pilih Bahan --</option>
                                            {ingredients.map(i => <option key={i.id} value={i.id}>{i.name} ({formatCurrency(Math.round(i.pack_size > 0 ? i.pack_price / i.pack_size : 0))}/{i.unit})</option>)}
                                        </select>
                                        <input type="text" className="input" placeholder="Qty"
                                            value={line.qty_used} onChange={e => updateRecipeLine(idx, 'qty_used', e.target.value)} />
                                        <div style={{ textAlign: 'right', fontSize: '13px', fontWeight: '600', color: 'var(--color-warning)' }}>
                                            {formatCurrency(Math.round(line.line_cost || 0))}
                                        </div>
                                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeRecipeLine(idx)}>✕</button>
                                    </div>
                                ))}
                            </div>

                            {/* HPP Summary */}
                            <div style={{
                                padding: '20px', borderRadius: '12px',
                                background: 'linear-gradient(135deg, #1a1a2e, #16213e)',
                                color: 'white'
                            }}>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', textAlign: 'center' }}>
                                    <div>
                                        <div style={{ fontSize: '11px', opacity: 0.7, marginBottom: '4px' }}>TOTAL HPP</div>
                                        <div style={{ fontSize: '22px', fontWeight: '800', color: '#fbbf24' }}>{formatCurrency(Math.round(recipeTotalCost))}</div>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '11px', opacity: 0.7, marginBottom: '4px' }}>PROFIT</div>
                                        <div style={{ fontSize: '22px', fontWeight: '800', color: '#34d399' }}>{formatCurrency(selectedProduct.sell_price - Math.round(recipeTotalCost))}</div>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '11px', opacity: 0.7, marginBottom: '4px' }}>MARGIN</div>
                                        <div style={{ fontSize: '22px', fontWeight: '800', color: selectedProduct.sell_price > 0 && ((selectedProduct.sell_price - recipeTotalCost) / selectedProduct.sell_price * 100) >= 30 ? '#34d399' : '#ef4444' }}>
                                            {selectedProduct.sell_price > 0 ? ((selectedProduct.sell_price - recipeTotalCost) / selectedProduct.sell_price * 100).toFixed(1) : '0'}%
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button type="button" className="btn btn-ghost" onClick={() => setShowRecipeModal(false)}>Batal</button>
                            <button type="button" className="btn btn-primary" onClick={handleSaveRecipe}>💾 Simpan Resep HPP</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export const getServerSideProps = async () => { return { props: {} }; };
