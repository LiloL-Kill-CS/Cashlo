import { useState, useEffect } from 'react';
import Sidebar from '@/components/layout/Sidebar';
import { useAuth } from '@/hooks/useAuth';
import { useCustomers } from '@/hooks/useCustomers';
import { useTransactions } from '@/hooks/useTransactions';
import { useCustomerInsights } from '@/hooks/useCustomerInsights';

export default function CustomersPage() {
    const { user, loading: authLoading } = useAuth();
    const { customers, loading: customersLoading, addCustomer, updateCustomer, deleteCustomer, searchCustomers } = useCustomers(user?.id, user?.role);
    const { transactions } = useTransactions(user?.id, user?.role);
    const insights = useCustomerInsights(customers, transactions);

    // Use enhanced data from insights if available, else fallback to raw
    const displayCustomers = insights?.customerData || customers;

    const [searchQuery, setSearchQuery] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [editingCustomer, setEditingCustomer] = useState(null);
    const [formData, setFormData] = useState({ name: '', phone: '', email: '', address: '' });

    // ... (keep modal logic same) ...

    const handleSearch = (e) => {
        const query = e.target.value;
        setSearchQuery(query);
        searchCustomers(query);
    };

    // ... (keep submit/delete logic same) ...
    // Note: Re-implementing handlers here to ensure they close over latest state if needed, 
    // but principally we just need to render the new UI.

    // Re-declaring for clarity in replacement
    const openAddModal = () => { setEditingCustomer(null); setFormData({ name: '', phone: '', email: '', address: '' }); setShowModal(true); };
    const openEditModal = (c) => { setEditingCustomer(c); setFormData({ name: c.name, phone: c.phone || '', email: c.email || '', address: c.address || '' }); setShowModal(true); };
    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            if (editingCustomer) await updateCustomer(editingCustomer.id, formData);
            else await addCustomer(formData);
            setShowModal(false);
        } catch (error) { alert(error.message); }
    };
    const handleDelete = async (id) => { if (confirm('Hapus?')) await deleteCustomer(id); };


    if (authLoading || customersLoading) return <div className="p-xl text-center">Memuat...</div>;

    return (
        <div className="app-container">
            <Sidebar activePage="customers" />
            <main className="main-content">
                <header className="page-header">
                    <div>
                        <h1 className="page-title">Pelanggan</h1>
                        <p className="text-secondary text-sm">Analisis Retensi & Loyalty</p>
                    </div>
                </header>

                <div style={{ padding: '0 var(--spacing-xl) var(--spacing-xl)' }}>

                    {/* 📊 Retention Console */}
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
                                <input
                                    type="text"
                                    className="input"
                                    placeholder="Cari nama..."
                                    value={searchQuery}
                                    onChange={handleSearch}
                                />
                            </div>
                            <button className="btn btn-primary" onClick={openAddModal}>
                                + Pelanggan Baru
                            </button>
                        </div>
                        <div className="card-body" style={{ padding: 0, overflowX: 'auto' }}>
                            <table className="table">
                                <thead>
                                    <tr>
                                        <th>Nama</th>
                                        <th>Status Kesehatan</th>
                                        <th>Interval Kunjungan</th>
                                        <th>Terakhir Datang</th>
                                        <th>Total Belanja</th>
                                        <th style={{ textAlign: 'right' }}>Aksi</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {displayCustomers.length === 0 ? (
                                        <tr><td colSpan="6" className="text-center p-xl">Belum ada data</td></tr>
                                    ) : (
                                        displayCustomers.map(c => (
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
                                                <td className="text-sm">
                                                    {c.stats?.avg_interval ? `Setiap ${c.stats.avg_interval} hari` : '-'}
                                                </td>
                                                <td className="text-sm">
                                                    {c.stats?.days_since_last ? `${c.stats.days_since_last} hari lalu` : '-'}
                                                </td>
                                                <td className="font-bold">Rp {c.stats?.total_spent?.toLocaleString('id-ID') || 0}</td>
                                                <td style={{ textAlign: 'right' }}>
                                                    {c.health?.status === 'At Risk' && (
                                                        <button className="btn btn-xs btn-outline-warning mr-xs" onClick={() => alert(`Simulasi: Mengirim Voucher Diskon ke WA ${c.phone}`)}>
                                                            📩 Kirim Voucher
                                                        </button>
                                                    )}
                                                    <button className="btn btn-ghost btn-sm" onClick={() => openEditModal(c)}>✏️</button>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </main>

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
                                    <label className="text-sm text-secondary mb-xs block">Nama Lengkap</label>
                                    <input
                                        type="text"
                                        className="input"
                                        required
                                        value={formData.name}
                                        onChange={e => setFormData({ ...formData, name: e.target.value })}
                                    />
                                </div>
                                <div className="form-group mb-md">
                                    <label className="text-sm text-secondary mb-xs block">Nomor HP (WA) - Opsional</label>
                                    <input
                                        type="tel"
                                        className="input"
                                        value={formData.phone}
                                        onChange={e => setFormData({ ...formData, phone: e.target.value })}
                                    />
                                </div>
                                <div className="form-group mb-md">
                                    <label className="text-sm text-secondary mb-xs block">Email (Opsional)</label>
                                    <input
                                        type="email"
                                        className="input"
                                        value={formData.email}
                                        onChange={e => setFormData({ ...formData, email: e.target.value })}
                                    />
                                </div>
                                <div className="form-group mb-md">
                                    <label className="text-sm text-secondary mb-xs block">Alamat Lengkap</label>
                                    <textarea
                                        className="input"
                                        rows="2"
                                        value={formData.address}
                                        onChange={e => setFormData({ ...formData, address: e.target.value })}
                                    ></textarea>
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
        </div>
    );
}
