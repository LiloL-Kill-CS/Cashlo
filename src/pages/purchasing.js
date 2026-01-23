import { useState, useEffect } from 'react';
import Sidebar from '@/components/layout/Sidebar';
import { useAuth } from '@/hooks/useAuth';
import { usePurchasing } from '@/hooks/usePurchasing';
import { useInventory } from '@/hooks/useInventory';
import { useProducts } from '@/hooks/useProducts';
import { formatCurrency, formatDate, formatNumberInput, parseNumberInput } from '@/lib/db';

export default function PurchasingPage() {
    const { user, loading: authLoading } = useAuth();
    const {
        suppliers, purchases, supplies, loading: purLoading,
        addSupplier, updateSupplier, deleteSupplier,
        addSupply, updateSupply, deleteSupply,
        createPurchase
    } = usePurchasing(user?.id, user?.role);
    const { warehouses } = useInventory(user?.id, user?.role);
    const { products } = useProducts(user?.id, user?.role);

    const [activeTab, setActiveTab] = useState('purchases'); // purchases, suppliers, supplies
    const [showSupplierModal, setShowSupplierModal] = useState(false);
    const [showPurchaseModal, setShowPurchaseModal] = useState(false);
    const [showSupplyModal, setShowSupplyModal] = useState(false);

    // Forms
    const [supplierForm, setSupplierForm] = useState({});
    const [supplyForm, setSupplyForm] = useState({ name: '', unit: 'pcs', default_price: '' });
    const [purchaseInit, setPurchaseInit] = useState({
        supplier_id: '',
        warehouse_id: '',
        notes: ''
    });
    const [cart, setCart] = useState([]);
    const [customItem, setCustomItem] = useState({ name: '', quantity: 1, cost_price: '' });

    useEffect(() => {
        if (!authLoading && !user) window.location.href = '/';
    }, [user, authLoading]);

    // --- Supplier Logic ---
    const handleSaveSupplier = async (e) => {
        e.preventDefault();
        try {
            if (supplierForm.id) {
                await updateSupplier(supplierForm.id, supplierForm);
            } else {
                await addSupplier(supplierForm);
            }
            setShowSupplierModal(false);
            setSupplierForm({});
        } catch (error) {
            alert(error.message);
        }
    };

    // --- Supply (Non-Menu Items) Logic ---
    const handleSaveSupply = async (e) => {
        e.preventDefault();
        try {
            const data = {
                name: supplyForm.name,
                unit: supplyForm.unit || 'pcs',
                default_price: parseFloat(parseNumberInput(supplyForm.default_price)) || 0
            };
            if (supplyForm.id) {
                await updateSupply(supplyForm.id, data);
            } else {
                await addSupply(data);
            }
            setShowSupplyModal(false);
            setSupplyForm({ name: '', unit: 'pcs', default_price: '' });
        } catch (error) {
            alert(error.message);
        }
    };

    const addSupplyToCart = (supplyId) => {
        const supply = supplies.find(s => s.id === supplyId);
        if (!supply) return;

        const existing = cart.find(c => c.product_id === supplyId);
        if (existing) return;

        setCart([...cart, {
            product_id: supplyId,
            name: supply.name,
            quantity: 1,
            cost_price: supply.default_price || 0,
            is_supply: true
        }]);
    };
    // --- Purchase Logic ---
    const addToCart = (productId) => {
        const product = products.find(p => p.id === productId);
        if (!product) return;

        const existing = cart.find(c => c.product_id === productId);
        if (existing) return; // Prevent duplicates for simplicity, just edit qty

        setCart([...cart, {
            product_id: productId,
            name: product.name,
            quantity: 1,
            cost_price: product.cost_price || 0
        }]);
    };

    const updateCartItem = (idx, field, value) => {
        const newCart = [...cart];
        newCart[idx][field] = parseFloat(parseNumberInput(value)) || 0;
        setCart(newCart);
    };

    const removeCartItem = (idx) => {
        setCart(cart.filter((_, i) => i !== idx));
    };

    const addCustomItem = () => {
        if (!customItem.name.trim()) {
            alert('Masukkan nama item');
            return;
        }
        const price = parseFloat(parseNumberInput(customItem.cost_price)) || 0;
        const qty = parseInt(customItem.quantity) || 1;

        setCart([...cart, {
            product_id: `custom-${Date.now()}`,
            name: customItem.name.trim(),
            quantity: qty,
            cost_price: price,
            is_custom: true
        }]);
        setCustomItem({ name: '', quantity: 1, cost_price: '' });
    };

    const totalAmount = cart.reduce((sum, item) => sum + (item.quantity * item.cost_price), 0);

    const handleCreatePurchase = async () => {
        if (!purchaseInit.supplier_id || !purchaseInit.warehouse_id || cart.length === 0) {
            alert('Mohon lengkapi data supplier, gudang, dan item.');
            return;
        }

        try {
            await createPurchase({
                ...purchaseInit,
                total_amount: totalAmount
            }, cart, user.id);

            setShowPurchaseModal(false);
            setCart([]);
            setPurchaseInit({ supplier_id: '', warehouse_id: '', notes: '' });
            alert('Pembelian berhasil disimpan!');
        } catch (error) {
            alert('Gagal: ' + error.message);
        }
    };

    if (authLoading || purLoading) return <div className="p-xl text-center">Memuat Purchasing...</div>;

    return (
        <div className="app-container">
            <Sidebar activePage="purchasing" />
            <main className="main-content">
                <header className="page-header">
                    <div>
                        <h1 className="page-title">Purchasing (Pembelian)</h1>
                        <p className="text-secondary text-sm">Kelola supplier dan stok masuk</p>
                    </div>
                </header>

                <div style={{ padding: 'var(--spacing-xl)' }}>

                    {/* Tabs */}
                    <div className="flex justify-between items-center mb-lg">
                        <div className="flex gap-sm" style={{ flexWrap: 'wrap' }}>
                            <button className={`btn ${activeTab === 'purchases' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setActiveTab('purchases')}>🛒 Pembelian</button>
                            <button className={`btn ${activeTab === 'suppliers' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setActiveTab('suppliers')}>👥 Supplier</button>
                            <button className={`btn ${activeTab === 'supplies' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setActiveTab('supplies')}>📦 Bahan/Supply</button>
                        </div>
                        {activeTab === 'suppliers' && (
                            <button className="btn btn-primary" onClick={() => { setSupplierForm({}); setShowSupplierModal(true); }}>+ Supplier Baru</button>
                        )}
                        {activeTab === 'supplies' && (
                            <button className="btn btn-primary" onClick={() => { setSupplyForm({ name: '', unit: 'pcs', default_price: '' }); setShowSupplyModal(true); }}>+ Tambah Bahan</button>
                        )}
                        {activeTab === 'purchases' && (
                            <button className="btn btn-primary" onClick={() => {
                                if (suppliers.length === 0 || warehouses.length === 0) {
                                    alert('Pastikan ada data Supplier dan Gudang.');
                                } else {
                                    setShowPurchaseModal(true);
                                }
                            }}>+ Input Pembelian Baru</button>
                        )}
                    </div>

                    {/* --- PURCHASES TAB --- */}
                    {activeTab === 'purchases' && (
                        <div className="card">
                            <div className="card-body p-0">
                                <table className="table">
                                    <thead>
                                        <tr>
                                            <th>Tanggal</th>
                                            <th>Supplier</th>
                                            <th>Gudang</th>
                                            <th>Total</th>
                                            <th>Oleh</th>
                                            <th>Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {purchases.length === 0 ? (
                                            <tr><td colSpan="6" className="text-center p-lg">Belum ada pembelian.</td></tr>
                                        ) : (
                                            purchases.map(p => (
                                                <tr key={p.id}>
                                                    <td>{formatDate(p.purchase_date)}</td>
                                                    <td style={{ fontWeight: 'bold' }}>{p.suppliers?.name}</td>
                                                    <td>{p.warehouses?.name}</td>
                                                    <td>{formatCurrency(p.total_amount)}</td>
                                                    <td className="text-sm text-secondary">{p.users?.name}</td>
                                                    <td><span className="badge badge-success">{p.status}</span></td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* --- SUPPLIERS TAB --- */}
                    {activeTab === 'suppliers' && (
                        <div className="card">
                            <div className="card-body p-0">
                                <table className="table">
                                    <thead>
                                        <tr>
                                            <th>Nama Supplier</th>
                                            <th>Kontak</th>
                                            <th>Telepon</th>
                                            <th>Alamat</th>
                                            <th style={{ textAlign: 'right' }}>Aksi</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {suppliers.length === 0 ? (
                                            <tr><td colSpan="5" className="text-center p-lg">Belum ada supplier data.</td></tr>
                                        ) : (
                                            suppliers.map(s => (
                                                <tr key={s.id}>
                                                    <td style={{ fontWeight: 'bold' }}>{s.name}</td>
                                                    <td>{s.contact_person || '-'}</td>
                                                    <td>{s.phone || '-'}</td>
                                                    <td>{s.address || '-'}</td>
                                                    <td style={{ textAlign: 'right' }}>
                                                        <button
                                                            className="btn btn-sm btn-outline"
                                                            onClick={() => { setSupplierForm(s); setShowSupplierModal(true); }}
                                                        >
                                                            Edit
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* --- SUPPLIES (Non-Menu Items) TAB --- */}
                    {activeTab === 'supplies' && (
                        <div className="card">
                            <div className="card-body p-0">
                                <table className="table">
                                    <thead>
                                        <tr>
                                            <th>Nama Bahan/Supply</th>
                                            <th>Satuan</th>
                                            <th>Harga Default</th>
                                            <th style={{ textAlign: 'right' }}>Aksi</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {supplies.length === 0 ? (
                                            <tr><td colSpan="4" className="text-center p-lg">
                                                Belum ada data bahan/supply. Klik "+ Tambah Bahan" untuk menambahkan.
                                            </td></tr>
                                        ) : (
                                            supplies.map(s => (
                                                <tr key={s.id}>
                                                    <td style={{ fontWeight: 'bold' }}>{s.name}</td>
                                                    <td>{s.unit || 'pcs'}</td>
                                                    <td>{formatCurrency(s.default_price || 0)}</td>
                                                    <td style={{ textAlign: 'right' }}>
                                                        <button
                                                            className="btn btn-sm btn-outline"
                                                            onClick={() => { setSupplyForm(s); setShowSupplyModal(true); }}
                                                            style={{ marginRight: '4px' }}
                                                        >
                                                            Edit
                                                        </button>
                                                        <button
                                                            className="btn btn-sm btn-ghost"
                                                            style={{ color: 'var(--color-error)' }}
                                                            onClick={async () => {
                                                                if (confirm(`Hapus "${s.name}"?`)) {
                                                                    await deleteSupply(s.id);
                                                                }
                                                            }}
                                                        >
                                                            Hapus
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            </main>

            {/* SUPPLIER MODAL */}
            {showSupplierModal && (
                <div className="modal-overlay" onClick={() => setShowSupplierModal(false)}>
                    <div className="modal" style={{ width: '400px' }} onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>{supplierForm.id ? 'Edit Supplier' : 'Supplier Baru'}</h3>
                            <button className="btn btn-ghost btn-icon" onClick={() => setShowSupplierModal(false)}>✕</button>
                        </div>
                        <form onSubmit={handleSaveSupplier}>
                            <div className="modal-body">
                                <div className="form-group mb-md">
                                    <label>Nama Supplier</label>
                                    <input type="text" className="input" required value={supplierForm.name || ''} onChange={e => setSupplierForm({ ...supplierForm, name: e.target.value })} />
                                </div>
                                <div className="form-group mb-md">
                                    <label>Kontak Person</label>
                                    <input type="text" className="input" value={supplierForm.contact_person || ''} onChange={e => setSupplierForm({ ...supplierForm, contact_person: e.target.value })} />
                                </div>
                                <div className="form-group mb-md">
                                    <label>Telepon</label>
                                    <input type="text" className="input" value={supplierForm.phone || ''} onChange={e => setSupplierForm({ ...supplierForm, phone: e.target.value })} />
                                </div>
                                <div className="form-group">
                                    <label>Alamat</label>
                                    <textarea className="input" value={supplierForm.address || ''} onChange={e => setSupplierForm({ ...supplierForm, address: e.target.value })} />
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="submit" className="btn btn-primary">Simpan</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* SUPPLY MODAL */}
            {showSupplyModal && (
                <div className="modal-overlay" onClick={() => setShowSupplyModal(false)}>
                    <div className="modal" style={{ width: '400px' }} onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>{supplyForm.id ? 'Edit Bahan/Supply' : 'Tambah Bahan/Supply Baru'}</h3>
                            <button className="btn btn-ghost btn-icon" onClick={() => setShowSupplyModal(false)}>✕</button>
                        </div>
                        <form onSubmit={handleSaveSupply}>
                            <div className="modal-body">
                                <div className="form-group mb-md">
                                    <label>Nama Bahan/Supply *</label>
                                    <input
                                        type="text"
                                        className="input"
                                        required
                                        placeholder="Contoh: Cup 12oz, Sirup Vanilla, Gula Pasir"
                                        value={supplyForm.name || ''}
                                        onChange={e => setSupplyForm({ ...supplyForm, name: e.target.value })}
                                    />
                                </div>
                                <div className="form-group mb-md">
                                    <label>Satuan</label>
                                    <select
                                        className="input"
                                        value={supplyForm.unit || 'pcs'}
                                        onChange={e => setSupplyForm({ ...supplyForm, unit: e.target.value })}
                                    >
                                        <option value="pcs">pcs (buah)</option>
                                        <option value="pack">pack</option>
                                        <option value="kg">kg</option>
                                        <option value="gram">gram</option>
                                        <option value="liter">liter</option>
                                        <option value="ml">ml</option>
                                        <option value="botol">botol</option>
                                        <option value="dus">dus</option>
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label>Harga Default (Rp)</label>
                                    <input
                                        type="text"
                                        className="input"
                                        placeholder="0"
                                        value={formatNumberInput(supplyForm.default_price || '')}
                                        onChange={e => setSupplyForm({ ...supplyForm, default_price: parseNumberInput(e.target.value) })}
                                    />
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-ghost" onClick={() => setShowSupplyModal(false)}>Batal</button>
                                <button type="submit" className="btn btn-primary">Simpan</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* NEW PURCHASE MODAL (Large) */}
            {showPurchaseModal && (
                <div className="modal-overlay" onClick={() => setShowPurchaseModal(false)}>
                    <div className="modal" style={{ width: '90%', maxWidth: '800px', height: '80vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>Input Pembelian Baru</h3>
                            <button className="btn btn-ghost btn-icon" onClick={() => setShowPurchaseModal(false)}>✕</button>
                        </div>
                        <div className="modal-body" style={{ flex: 1, overflowY: 'auto' }}>
                            {/* Header Form */}
                            <div className="grid grid-cols-2 gap-md mb-lg" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                <div className="form-group">
                                    <label>Supplier</label>
                                    <select
                                        className="input"
                                        value={purchaseInit.supplier_id}
                                        onChange={e => setPurchaseInit({ ...purchaseInit, supplier_id: e.target.value })}
                                    >
                                        <option value="">-- Pilih Supplier --</option>
                                        {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label>Gudang Tujuan (Masuk Stok)</label>
                                    <select
                                        className="input"
                                        value={purchaseInit.warehouse_id}
                                        onChange={e => setPurchaseInit({ ...purchaseInit, warehouse_id: e.target.value })}
                                    >
                                        <option value="">-- Pilih Gudang --</option>
                                        {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                                    </select>
                                </div>
                            </div>

                            <hr style={{ borderColor: 'var(--color-border)', margin: '16px 0' }} />

                            {/* Item Selection */}
                            <div style={{ marginBottom: '16px' }}>
                                <label className="text-sm text-secondary" style={{ display: 'block', marginBottom: '8px' }}>Tambah Produk dari Menu:</label>
                                <select
                                    className="input"
                                    onChange={(e) => {
                                        addToCart(e.target.value);
                                        e.target.value = '';
                                    }}
                                >
                                    <option value="">-- Pilih Produk Menu --</option>
                                    {products.map(p => (
                                        <option key={p.id} value={p.id}>{p.name}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Supplies (Non-Menu Items) Selection */}
                            <div style={{ marginBottom: '16px' }}>
                                <label className="text-sm text-secondary" style={{ display: 'block', marginBottom: '8px' }}>
                                    📦 Tambah Bahan/Supply (Non-Menu):
                                </label>
                                {supplies.length > 0 ? (
                                    <select
                                        className="input"
                                        onChange={(e) => {
                                            addSupplyToCart(e.target.value);
                                            e.target.value = '';
                                        }}
                                    >
                                        <option value="">-- Pilih Bahan/Supply --</option>
                                        {supplies.map(s => (
                                            <option key={s.id} value={s.id}>{s.name} ({s.unit})</option>
                                        ))}
                                    </select>
                                ) : (
                                    <div style={{
                                        padding: '12px',
                                        background: 'var(--color-bg-secondary)',
                                        borderRadius: '8px',
                                        fontSize: '13px',
                                        color: 'var(--color-text-muted)'
                                    }}>
                                        Belum ada bahan/supply. Tambahkan dulu di tab "📦 Bahan/Supply".
                                    </div>
                                )}
                            </div>

                            {/* Items Table */}
                            <table className="table">
                                <thead>
                                    <tr>
                                        <th>Produk</th>
                                        <th style={{ width: '120px' }}>Qty (Masuk)</th>
                                        <th style={{ width: '150px' }}>Harga Beli (@)</th>
                                        <th>Subtotal</th>
                                        <th style={{ width: '50px' }}></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {cart.map((item, idx) => (
                                        <tr key={idx}>
                                            <td>{item.name}</td>
                                            <td>
                                                <input
                                                    type="text"
                                                    className="input p-xs"
                                                    value={formatNumberInput(item.quantity)}
                                                    onChange={e => updateCartItem(idx, 'quantity', e.target.value)}
                                                />
                                            </td>
                                            <td>
                                                <input
                                                    type="text"
                                                    className="input p-xs"
                                                    value={formatNumberInput(item.cost_price)}
                                                    onChange={e => updateCartItem(idx, 'cost_price', e.target.value)}
                                                />
                                            </td>
                                            <td>{formatCurrency(item.quantity * item.cost_price)}</td>
                                            <td>
                                                <button className="btn btn-sm btn-ghost text-error" onClick={() => removeCartItem(idx)}>✕</button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot>
                                    <tr>
                                        <td colSpan="3" style={{ textAlign: 'right', fontWeight: 'bold' }}>Total Pembelian:</td>
                                        <td style={{ fontWeight: 'bold', fontSize: '18px' }}>{formatCurrency(totalAmount)}</td>
                                        <td></td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-ghost" onClick={() => setShowPurchaseModal(false)}>Batal</button>
                            <button className="btn btn-success" onClick={handleCreatePurchase}>Simpan Pembelian & Update Stok</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
