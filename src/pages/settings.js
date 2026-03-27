import { useEffect, useState } from 'react';
import Sidebar from '@/components/layout/Sidebar';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';

export default function SettingsPage() {
    const { user, loading: authLoading, logout } = useAuth();
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingUser, setEditingUser] = useState(null);

    const [formData, setFormData] = useState({
        name: '',
        username: '',
        password: '',
        role: 'kasir'
    });

    useEffect(() => {
        if (!authLoading && !user) {
            window.location.href = '/';
        }
    }, [user, authLoading]);

    useEffect(() => {
        loadUsers();
    }, []);

    async function loadUsers() {
        try {
            const { data: allUsers, error } = await supabase.from('users').select('*');
            if (error) throw error;
            setUsers(allUsers);
        } catch (error) {
            console.error('Error loading users:', error);
        } finally {
            setLoading(false);
        }
    }

    const openAddModal = () => {
        setEditingUser(null);
        setFormData({ name: '', username: '', password: '', role: 'kasir' });
        setShowModal(true);
    };

    const openEditModal = (u) => {
        setEditingUser(u);
        setFormData({ name: u.name, username: u.username, password: '', role: u.role });
        setShowModal(true);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (editingUser) {
            const updates = {
                name: formData.name,
                role: formData.role
            };
            const { error } = await supabase.from('users').update(updates).eq('id', editingUser.id);
            if (error) console.error('Error updating user:', error);
        } else {
            const newId = `user-${Date.now()}`;
            const userData = {
                id: newId,
                name: formData.name,
                username: formData.username,
                password_hash: formData.password, // In production, hash this
                role: formData.role,
                owner_id: user.id, // Assign the kasir to the current admin
                is_active: true,
                created_at: new Date().toISOString()
            };
            const { error } = await supabase.from('users').insert([userData]);
            if (error) console.error('Error adding user:', error);
        }

        await loadUsers();
        setShowModal(false);
    };

    const toggleUserActive = async (u) => {
        const { error } = await supabase.from('users').update({ is_active: !u.is_active }).eq('id', u.id);
        if (error) console.error('Error toggling user:', error);
        await loadUsers();
    };

    const handleLogout = () => {
        logout();
        window.location.href = '/';
    };

    if (authLoading || loading) {
        return (
            <div className="app-container">
                <Sidebar activePage="settings" userRole={user?.role} />
                <main className="main-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div className="animate-pulse text-muted">Memuat...</div>
                </main>
            </div>
        );
    }

    return (
        <div className="app-container">
            <Sidebar activePage="settings" userRole={user?.role} />

            <main className="main-content">
                <header className="page-header">
                    <div>
                        <h1 className="page-title">Pengaturan</h1>
                        <p className="text-secondary text-sm">Kelola akun dan preferensi</p>
                    </div>
                </header>

                <div style={{ padding: 'var(--spacing-xl)' }}>
                    {/* Current User Info */}
                    <div className="card" style={{ marginBottom: 'var(--spacing-lg)' }}>
                        <div className="card-header">
                            <h3 style={{ fontSize: 'var(--font-size-lg)' }}>Akun Saya</h3>
                        </div>
                        <div className="card-body">
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                    <h4>{user?.name}</h4>
                                    <p className="text-secondary text-sm">
                                        @{user?.username} • <span className="badge badge-neutral">{user?.role}</span>
                                    </p>
                                </div>
                                <button className="btn btn-secondary" onClick={handleLogout}>
                                    Logout
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* User Management (Admin Only) */}
                    {user?.role === 'admin' && (
                        <>
                        {/* Highlighted Tambah Kasir Banner */}
                        <div className="card" style={{
                            marginBottom: 'var(--spacing-lg)',
                            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                            border: 'none',
                            color: 'white'
                        }}>
                            <div className="card-body" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '24px 28px' }}>
                                <div>
                                    <h3 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '6px', color: 'white' }}>
                                        👥 Hubungkan Akun Kasir
                                    </h3>
                                    <p style={{ fontSize: '13px', opacity: 0.9, margin: 0, color: 'rgba(255,255,255,0.9)' }}>
                                        Buat akun Kasir yang terhubung otomatis ke bisnis Anda. Kasir bisa transaksi, Anda lihat semua laporannya!
                                    </p>
                                </div>
                                <button className="btn" onClick={openAddModal} style={{
                                    background: 'white',
                                    color: '#764ba2',
                                    fontWeight: '700',
                                    padding: '12px 24px',
                                    fontSize: '14px',
                                    borderRadius: '10px',
                                    whiteSpace: 'nowrap',
                                    boxShadow: '0 4px 15px rgba(0,0,0,0.15)',
                                    transition: 'transform 0.2s, box-shadow 0.2s'
                                }}
                                onMouseOver={e => { e.currentTarget.style.transform = 'scale(1.05)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,0,0,0.25)'; }}
                                onMouseOut={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = '0 4px 15px rgba(0,0,0,0.15)'; }}
                                >
                                    + Tambah Kasir
                                </button>
                            </div>
                        </div>

                        <div className="card">
                            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <h3 style={{ fontSize: 'var(--font-size-lg)' }}>Manajemen Pengguna</h3>
                                <button className="btn btn-primary btn-sm" onClick={openAddModal}>
                                    + Tambah User
                                </button>
                            </div>
                            <div className="card-body" style={{ padding: 0 }}>
                                <table className="table">
                                    <thead>
                                        <tr>
                                            <th>Nama</th>
                                            <th>Username</th>
                                            <th>Role</th>
                                            <th>Status</th>
                                            <th style={{ textAlign: 'right' }}>Aksi</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {users.map(u => (
                                            <tr key={u.id}>
                                                <td style={{ fontWeight: '500' }}>{u.name}</td>
                                                <td className="text-secondary">@{u.username}</td>
                                                <td>
                                                    <span className={`badge ${u.role === 'admin' ? 'badge-warning' : 'badge-neutral'}`}>
                                                        {u.role}
                                                    </span>
                                                </td>
                                                <td>
                                                    <span className={`badge ${u.is_active ? 'badge-success' : 'badge-error'}`}>
                                                        {u.is_active ? 'Aktif' : 'Nonaktif'}
                                                    </span>
                                                </td>
                                                <td style={{ textAlign: 'right' }}>
                                                    <button className="btn btn-ghost btn-sm" onClick={() => openEditModal(u)}>
                                                        ✏️
                                                    </button>
                                                    <button
                                                        className="btn btn-ghost btn-sm"
                                                        onClick={() => toggleUserActive(u)}
                                                        disabled={u.id === user?.id}
                                                    >
                                                        {u.is_active ? '🔒' : '🔓'}
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                        </>
                    )}

                    {/* App Info */}
                    <div className="card" style={{ marginTop: 'var(--spacing-lg)' }}>
                        <div className="card-body" style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: '32px', fontWeight: '800', marginBottom: '8px' }}>Cashlo</div>
                            <p className="text-secondary text-sm">Coffee Shop Point of Sale</p>
                            <p className="text-muted text-xs" style={{ marginTop: '8px' }}>
                                Version 1.0.0 • © 2024
                            </p>
                        </div>
                    </div>
                </div>
            </main>

            {/* Add/Edit User Modal */}
            {showModal && (
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="modal" style={{ width: '400px' }} onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3 className="modal-title">
                                {editingUser ? 'Edit User' : 'Tambah User'}
                            </h3>
                            <button className="btn btn-ghost btn-icon" onClick={() => setShowModal(false)}>✕</button>
                        </div>

                        <form onSubmit={handleSubmit}>
                            <div className="modal-body">
                                <div style={{ marginBottom: 'var(--spacing-md)' }}>
                                    <label className="text-sm text-secondary" style={{ display: 'block', marginBottom: '4px' }}>
                                        Nama
                                    </label>
                                    <input
                                        type="text"
                                        className="input"
                                        value={formData.name}
                                        onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                                        required
                                    />
                                </div>

                                {!editingUser && (
                                    <>
                                        <div style={{ marginBottom: 'var(--spacing-md)' }}>
                                            <label className="text-sm text-secondary" style={{ display: 'block', marginBottom: '4px' }}>
                                                Username
                                            </label>
                                            <input
                                                type="text"
                                                className="input"
                                                value={formData.username}
                                                onChange={e => setFormData(prev => ({ ...prev, username: e.target.value }))}
                                                required
                                            />
                                        </div>

                                        <div style={{ marginBottom: 'var(--spacing-md)' }}>
                                            <label className="text-sm text-secondary" style={{ display: 'block', marginBottom: '4px' }}>
                                                Password
                                            </label>
                                            <input
                                                type="password"
                                                className="input"
                                                value={formData.password}
                                                onChange={e => setFormData(prev => ({ ...prev, password: e.target.value }))}
                                                required
                                            />
                                        </div>
                                    </>
                                )}

                                <div style={{ marginBottom: 'var(--spacing-md)' }}>
                                    <label className="text-sm text-secondary" style={{ display: 'block', marginBottom: '4px' }}>
                                        Role
                                    </label>
                                    <select
                                        className="input"
                                        value={formData.role}
                                        onChange={e => setFormData(prev => ({ ...prev, role: e.target.value }))}
                                    >
                                        <option value="kasir">Kasir</option>
                                        <option value="admin">Admin</option>
                                    </select>
                                </div>
                            </div>

                            <div className="modal-footer">
                                <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>
                                    Batal
                                </button>
                                <button type="submit" className="btn btn-primary">
                                    {editingUser ? 'Simpan' : 'Tambah'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}


export const getServerSideProps = async () => { return { props: {} }; };
