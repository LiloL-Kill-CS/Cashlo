import { useState, useEffect } from 'react';
import Sidebar from '@/components/layout/Sidebar';
import { useAuth } from '@/hooks/useAuth';
import { useCustomers } from '@/hooks/useCustomers';
import { useTransactions } from '@/hooks/useTransactions';
import { useCustomerInsights } from '@/hooks/useCustomerInsights';
import { useLoyalty } from '@/hooks/useLoyalty';
import { formatCurrency } from '@/lib/db';

export default function CustomersPage() {
    const { user, loading: authLoading } = useAuth();
    const ownerId = user?.owner_id || user?.id;
    const { customers, loading: customersLoading, addCustomer, updateCustomer, deleteCustomer, searchCustomers, deductPoints, updatePoints } = useCustomers(ownerId, user?.role);
    const { transactions } = useTransactions(ownerId, user?.role, user?.id);
    const { rewards } = useLoyalty(ownerId);
    const insights = useCustomerInsights(customers, transactions);

    const displayCustomers = insights?.customerData || customers;

    const [searchQuery, setSearchQuery] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [showRedeemModal, setShowRedeemModal] = useState(false);
    const [showPointsModal, setShowPointsModal] = useState(false);
    const [editingCustomer, setEditingCustomer] = useState(null);
    const [redeemingCustomer, setRedeemingCustomer] = useState(null);
    const [pointsCustomer, setPointsCustomer] = useState(null);
    const [newPoints, setNewPoints] = useState(0);
    const [formData, setFormData] = useState({ name: '', phone: '', email: '', address: '' });

    const handleSearch = (e) => {
        const query = e.target.value;
        setSearchQuery(query);
        searchCustomers(query);
    };

    const openAddModal = () => { setEditingCustomer(null); setFormData({ name: '', phone: '', email: '', address: '' }); setShowModal(true); };
    const openEditModal = (c) => { setEditingCustomer(c); setFormData({ name: c.name, phone: c.phone || '', email: c.email || '', address: c.address || '' }); setShowModal(true); };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            // Convert empty optional fields to null to avoid unique constraint errors
            const cleanData = {
                name: formData.name,
                phone: formData.phone ? formData.phone.trim() || null : null,
                email: formData.email ? formData.email.trim() : null,
                address: formData.address ? formData.address.trim() : null
            };
            if (editingCustomer) await updateCustomer(editingCustomer.id, cleanData);
            else await addCustomer(cleanData);
            setShowModal(false);
        } catch (error) { alert(error.message); }
    };

    const handleDelete = async (id) => { if (confirm('Hapus pelanggan ini?')) await deleteCustomer(id); };

    // --- Redeem Points ---
    const openRedeemModal = (customer) => {
        setRedeemingCustomer(customer);
        setShowRedeemModal(true);
    };

    const handleRedeem = async (rewardId, pointsCost) => {
        if (!redeemingCustomer) return;
        try {
            await deductPoints(redeemingCustomer.id, pointsCost);
            alert(`✅ Berhasil redeem! ${pointsCost} poin dikurangi.`);
            setShowRedeemModal(false);
        } catch (err) { alert('Gagal: ' + err.message); }
    };

    // --- Edit Points (Admin Only) ---
    const openPointsModal = (customer) => {
        setPointsCustomer(customer);
        setNewPoints(customer.points || 0);
        setShowPointsModal(true);
    };

    const handleSavePoints = async (e) => {
        e.preventDefault();
        try {
            await updatePoints(pointsCustomer.id, parseInt(newPoints) || 0);
            setShowPointsModal(false);
            setPointsCustomer(null);
        } catch (err) { alert('Gagal update poin: ' + err.message); }
    };

    // --- Calculate product purchase count per customer ---
    const getProductCount = (customerId) => {
        if (!transactions?.length) return 0;
        return transactions
            .filter(t => t.customer_id === customerId)
            .reduce((sum, t) => {
                let items = t.items || [];
                if (typeof items === 'string') {
                    try { items = JSON.parse(items); } catch { items = []; }
                }
                if (!Array.isArray(items)) items = [];
                return sum + items.reduce((s, i) => s + (i.qty || i.quantity || 1), 0);
            }, 0);
    };

    if (authLoading || customersLoading) return <div className="p-xl text-center">Memuat...</div>;

    return (
        <div className="app-container">
            <Sidebar activePage="customers" userRole={user?.role} />
            <main className="main-content">
                <header className="page-header">
                    <div>
                        <h1 className="page-title">Pelanggan</h1>
                        <p className="text-secondary text-sm">Analisis Retensi, Loyalty & Poin (1 Produk = 1 Poin)</p>
                    </div>
                </header>

                <div style={{ padding: '0 var(--spacing-xl) var(--spacing-xl)' }}>

                    {/* Retention Console */}
                    {insights && (
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-md mb-lg">
                            <div className="card p-md flex items-center gap-md">
                                <div className="p-sm rounded-full bg-success-light text-success text-2xl">😊</div>
                                <div>
                                    <div className="text-2xl font-bold">{insights.segments.active}</div>
                                    <div className="text-xs text-secondary">Pelanggan Aktif</div>
                                </div>
                            </div>
                            <div className="card p-md flex items-center gap-md">
                                <div className="p-sm rounded-full bg-warning-light text-warning text-2xl">⚠️</div>
                                <div>
                                    <div className="text-2xl font-bold">{insights.segments.at_risk}</div>
                                    <div className="text-xs text-secondary">Butuh Perhatian (At Risk)</div>
                                </div>
                            </div>
                            <div className="card p-md flex items-center gap-md">
                                <div className="p-sm rounded-full bg-error-light text-error text-2xl">💔</div>
                                <div>
                                    <div className="text-2xl font-bold">{insights.segments.lost}</div>
                                    <div className="text-xs text-secondary">Lost (Churned)</div>
                                </div>
                            </div>
                            <div className="card p-md flex items-center gap-md" style={{ background: 'var(--color-primary)', color: 'white' }}>
                                <div className="text-2xl">💎</div>
                                <div>
                                    <div className="text-2xl font-bold">{displayCustomers[0]?.name || '-'}</div>
                                    <div className="text-xs" style={{ opacity: 0.8 }}>Top Spender</div>
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="card">
                        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div className="search-bar" style={{ width: '300px' }}>
                                <input type="text" className="input" placeholder="Cari nama..." value={searchQuery} onChange={handleSearch} />
                            </div>
                            <button className="btn btn-primary" onClick={openAddModal}>+ Pelanggan Baru</button>
                        </div>
                        <div className="card-body" style={{ padding: 0, overflowX: 'auto' }}>
                            <table className="table" style={{ minWidth: '850px' }}>
                                <thead>
                                    <tr>
                                        <th>Nama</th>
                                        <th>Status</th>
                                        <th style={{ textAlign: 'center' }}>Produk Dibeli</th>
                                        <th style={{ textAlign: 'center' }}>Poin</th>
                                        <th>Interval</th>
                                        <th>Terakhir</th>
                                        <th style={{ textAlign: 'right' }}>Total Belanja</th>
                                        <th style={{ textAlign: 'right' }}>Aksi</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {displayCustomers.length === 0 ? (
                                        <tr><td colSpan="8" className="text-center p-xl">Belum ada data</td></tr>
                                    ) : (
                                        displayCustomers.map(c => {
                                            const prodCount = getProductCount(c.id);
                                            return (
                                                <tr key={c.id}>
                                                    <td>
                                                        <div className="font-bold">{c.name}</div>
                                                        <div className="text-xs text-secondary">{c.phone || '-'}</div>
                                                    </td>
                                                    <td>
                                                        {c.health ? (
                                                            <span className={`badge badge-${c.health.risk_color === 'red' ? 'error' : c.health.risk_color === 'orange' ? 'warning' : 'success'}`}>
                                                                {c.health.status}
                                                            </span>
                                                        ) : <span className="badge badge-secondary">New</span>}
                                                    </td>
                                                    <td style={{ textAlign: 'center' }}>
                                                        <span style={{
                                                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                                            background: 'var(--color-primary-bg)', color: 'var(--color-primary)',
                                                            fontWeight: '700', borderRadius: '20px', padding: '4px 12px', fontSize: '13px'
                                                        }}>
                                                            🛒 {prodCount}
                                                        </span>
                                                    </td>
                                                    <td style={{ textAlign: 'center' }}>
                                                        <span style={{
                                                            display: 'inline-flex', alignItems: 'center', gap: '4px',
                                                            fontWeight: '700', color: (c.points || 0) > 0 ? '#f59e0b' : 'var(--color-text-secondary)',
                                                            fontSize: '14px'
                                                        }}>
                                                            ⭐ {c.points || 0}
                                                        </span>
                                                    </td>
                                                    <td className="text-sm">
                                                        {c.stats?.avg_interval ? `Setiap ${c.stats.avg_interval} hari` : '-'}
                                                    </td>
                                                    <td className="text-sm">
                                                        {c.stats?.days_since_last ? `${c.stats.days_since_last} hari lalu` : '-'}
                                                    </td>
                                                    <td className="font-bold" style={{ textAlign: 'right' }}>
                                                        {formatCurrency(c.stats?.total_spent || 0)}
                                                    </td>
                                                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                                                        <button className="btn btn-xs btn-outline" style={{ borderColor: '#f59e0b', color: '#f59e0b', marginRight: '4px' }}
                                                            onClick={() => openRedeemModal(c)}>
                                                            🎁 {(c.points || 0) > 0 ? 'Redeem' : 'Poin'}
                                                        </button>
                                                        {c.health?.status === 'At Risk' && (
                                                            <button className="btn btn-xs btn-outline-warning mr-xs" onClick={() => alert(`Simulasi: Mengirim Voucher Diskon ke WA ${c.phone}`)}>
                                                                📩
                                                            </button>
                                                        )}
                                                        {user?.role === 'admin' && (
                                                            <button className="btn btn-xs btn-outline" style={{ borderColor: 'var(--color-primary)', color: 'var(--color-primary)', marginRight: '4px' }} onClick={() => openPointsModal(c)}>
                                                                Edit Poin
                                                            </button>
                                                        )}
                                                        <button className="btn btn-ghost btn-sm" onClick={() => openEditModal(c)}>✏️</button>
                                                        <button className="btn btn-ghost btn-sm" style={{ color: 'var(--color-error)' }} onClick={() => handleDelete(c.id)}>🗑️</button>
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </main>

            {/* --- ADD/EDIT CUSTOMER MODAL --- */}
            {showModal && (
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="modal" style={{ width: '100%', maxWidth: '400px' }} onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3 className="modal-title">{editingCustomer ? 'Edit Pelanggan' : 'Pelanggan Baru'}</h3>
                            <button className="btn btn-ghost btn-icon" onClick={() => setShowModal(false)}>✕</button>
                        </div>
                        <form onSubmit={handleSubmit}>
                            <div className="modal-body">
                                <div className="form-group mb-md">
                                    <label className="text-sm text-secondary mb-xs block">Nama *</label>
                                    <input type="text" className="input" required value={formData.name}
                                        onChange={e => setFormData({ ...formData, name: e.target.value })} />
                                </div>
                                <div className="form-group mb-md">
                                    <label className="text-sm text-secondary mb-xs block">Nomor HP (Opsional)</label>
                                    <input type="tel" className="input" value={formData.phone}
                                        onChange={e => setFormData({ ...formData, phone: e.target.value })} />
                                </div>
                                <div className="form-group mb-md">
                                    <label className="text-sm text-secondary mb-xs block">Email (Opsional)</label>
                                    <input type="email" className="input" value={formData.email}
                                        onChange={e => setFormData({ ...formData, email: e.target.value })} />
                                </div>
                                <div className="form-group mb-md">
                                    <label className="text-sm text-secondary mb-xs block">Alamat (Opsional)</label>
                                    <textarea className="input" rows="2" value={formData.address}
                                        onChange={e => setFormData({ ...formData, address: e.target.value })}></textarea>
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>Batal</button>
                                <button type="submit" className="btn btn-primary">Simpan</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* --- REDEEM POINTS MODAL --- */}
            {showRedeemModal && redeemingCustomer && (
                <div className="modal-overlay" onClick={() => setShowRedeemModal(false)}>
                    <div className="modal" style={{ width: '100%', maxWidth: '450px' }} onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <div>
                                <h3 className="modal-title">🎁 Redeem Poin</h3>
                                <p className="text-sm text-secondary">{redeemingCustomer.name} — ⭐ {redeemingCustomer.points || 0} poin tersedia</p>
                            </div>
                            <button className="btn btn-ghost btn-icon" onClick={() => setShowRedeemModal(false)}>✕</button>
                        </div>
                        <div className="modal-body">
                            {rewards.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '30px' }}>
                                    <div style={{ fontSize: '40px', marginBottom: '8px' }}>🎁</div>
                                    <p className="text-secondary">Belum ada katalog hadiah. Buat di menu Loyalty & Rewards.</p>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {rewards.map(r => {
                                        const canRedeem = (redeemingCustomer.points || 0) >= r.points_cost;
                                        return (
                                            <div key={r.id} style={{
                                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                                padding: '12px 16px', borderRadius: '10px',
                                                background: canRedeem ? 'var(--color-success-bg)' : 'var(--color-bg-secondary)',
                                                opacity: canRedeem ? 1 : 0.5
                                            }}>
                                                <div>
                                                    <div style={{ fontWeight: '600', fontSize: '14px' }}>{r.name}</div>
                                                    <div className="text-xs text-secondary">
                                                        ⭐ {r.points_cost} poin
                                                        {r.reward_type === 'per_product' && r.required_purchases > 0 && (
                                                            <span> • Butuh beli {r.required_purchases} produk</span>
                                                        )}
                                                    </div>
                                                </div>
                                                <button className="btn btn-sm btn-primary" disabled={!canRedeem}
                                                    onClick={() => {
                                                        if (confirm(`Redeem "${r.name}" untuk ${r.points_cost} poin?`)) {
                                                            handleRedeem(r.id, r.points_cost);
                                                        }
                                                    }}>
                                                    {canRedeem ? 'Redeem' : 'Kurang'}
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* --- EDIT POINTS MODAL (ADMIN) --- */}
            {showPointsModal && pointsCustomer && (
                <div className="modal-overlay" onClick={() => setShowPointsModal(false)}>
                    <div className="modal" style={{ width: '100%', maxWidth: '350px' }} onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3 className="modal-title">Edit Poin Member</h3>
                            <button className="btn btn-ghost btn-icon" onClick={() => setShowPointsModal(false)}>✕</button>
                        </div>
                        <form onSubmit={handleSavePoints}>
                            <div className="modal-body">
                                <div className="text-sm text-secondary mb-md">
                                    Edit poin untuk pelanggan <strong>{pointsCustomer.name}</strong>. Fitur ini hanya tersedia untuk admin.
                                </div>
                                <div className="form-group">
                                    <label className="text-sm text-secondary mb-xs block">Jumlah Poin Saat Ini</label>
                                    <input 
                                        type="number" 
                                        className="input" 
                                        min="0"
                                        required 
                                        value={newPoints}
                                        onChange={e => setNewPoints(e.target.value)} 
                                        style={{ fontSize: '20px', fontWeight: 'bold' }}
                                    />
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-ghost" onClick={() => setShowPointsModal(false)}>Batal</button>
                                <button type="submit" className="btn btn-primary">Simpan Poin</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}

export const getServerSideProps = async () => { return { props: {} }; };
