import { useState, useEffect } from 'react';
import Sidebar from '@/components/layout/Sidebar';
import { useAuth } from '@/hooks/useAuth';
import { useCustomers } from '@/hooks/useCustomers';
import { formatDate } from '@/lib/db';

export default function CustomersPage() {
    const { user, loading: authLoading } = useAuth();
    const { customers, loading: customersLoading, addCustomer, updateCustomer, deleteCustomer, searchCustomers } = useCustomers(user?.id, user?.role);
    const [searchQuery, setSearchQuery] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [editingCustomer, setEditingCustomer] = useState(null);
    const [formData, setFormData] = useState({ name: '', phone: '', email: '' });

    useEffect(() => {
        if (!authLoading && !user) {
            window.location.href = '/';
        }
    }, [user, authLoading]);

    const handleSearch = (e) => {
        const query = e.target.value;
        setSearchQuery(query);
        searchCustomers(query);
    };

    const openAddModal = () => {
        setEditingCustomer(null);
        setFormData({ name: '', phone: '', email: '' });
        setShowModal(true);
    };

    const openEditModal = (c) => {
        setEditingCustomer(c);
        setFormData({ name: c.name, phone: c.phone, email: c.email || '' });
        setShowModal(true);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            if (editingCustomer) {
                await updateCustomer(editingCustomer.id, formData);
            } else {
                await addCustomer(formData);
            }
            setShowModal(false);
        } catch (error) {
            alert(error.message);
        }
    };

    const handleDelete = async (id) => {
        if (confirm('Yakin ingin menghapus pelanggan ini?')) {
            try {
                await deleteCustomer(id);
            } catch (error) {
                alert('Gagal menghapus: ' + error.message);
            }
        }
    };

    if (authLoading || customersLoading) {
        return <div className="p-xl text-center">Memuat...</div>;
    }

    return (
        <div className="app-container">
            <Sidebar activePage="customers" />
            <main className="main-content">
                <header className="page-header">
                    <div>
                        <h1 className="page-title">Pelanggan</h1>
                        <p className="text-secondary text-sm">Kelola data member dan poin</p>
                    </div>
                </header>

                <div style={{ padding: 'var(--spacing-xl)' }}>
                    <div className="card">
                        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div className="search-bar" style={{ width: '300px' }}>
                                <input
                                    type="text"
                                    className="input"
                                    placeholder="Cari nama atau no HP..."
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
                                        <th>No. HP</th>
                                        <th>Tier</th>
                                        <th>Poin</th>
                                        <th>Total Belanja</th>
                                        <th>Bergabung</th>
                                        <th style={{ textAlign: 'right' }}>Aksi</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {customers.length === 0 ? (
                                        <tr>
                                            <td colSpan="7" className="text-center text-secondary" style={{ padding: '2rem' }}>
                                                Belum ada data pelanggan
                                            </td>
                                        </tr>
                                    ) : (
                                        customers.map(c => (
                                            <tr key={c.id}>
                                                <td style={{ fontWeight: '500' }}>{c.name}</td>
                                                <td>{c.phone}</td>
                                                <td>
                                                    <span className="badge badge-primary">
                                                        {c.membership_tiers?.name || 'Bronze'}
                                                    </span>
                                                </td>
                                                <td style={{ fontWeight: 'bold', color: 'var(--color-primary)' }}>
                                                    {c.points} pts
                                                </td>
                                                <td>Rp {c.total_spend?.toLocaleString('id-ID')}</td>
                                                <td className="text-sm text-secondary">
                                                    {formatDate(c.created_at)}
                                                </td>
                                                <td style={{ textAlign: 'right' }}>
                                                    <button className="btn btn-ghost btn-sm" onClick={() => openEditModal(c)}>
                                                        ✏️
                                                    </button>
                                                    <button className="btn btn-ghost btn-sm text-error" onClick={() => handleDelete(c.id)}>
                                                        🗑️
                                                    </button>
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
                                    <label className="text-sm text-secondary mb-xs block">Nomor HP (WA)</label>
                                    <input
                                        type="tel"
                                        className="input"
                                        required
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
