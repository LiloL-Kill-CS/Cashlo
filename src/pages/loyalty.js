import { useState, useEffect } from 'react';
import Sidebar from '@/components/layout/Sidebar';
import { useAuth } from '@/hooks/useAuth';
import { useLoyalty } from '@/hooks/useLoyalty';

export default function LoyaltyPage() {
    const { user, loading: authLoading } = useAuth();
    const { tiers, rewards, loading: loyaltyLoading, addTier, updateTier, deleteTier, addReward, updateReward, deleteReward } = useLoyalty();

    // Modal States
    const [tierModal, setTierModal] = useState(false);
    const [rewardModal, setRewardModal] = useState(false);
    const [editingItem, setEditingItem] = useState(null);
    const [formData, setFormData] = useState({});

    useEffect(() => {
        if (!authLoading && !user) {
            window.location.href = '/';
        }
    }, [user, authLoading]);

    // --- Tier Handlers ---
    const openTierModal = (tier = null) => {
        setEditingItem(tier);
        setFormData(tier ? { ...tier } : { name: '', min_spend: 0, discount_percent: 0 });
        setTierModal(true);
    };

    const handleTierSubmit = async (e) => {
        e.preventDefault();
        try {
            if (editingItem) {
                await updateTier(editingItem.id, formData);
            } else {
                await addTier(formData);
            }
            setTierModal(false);
        } catch (error) {
            alert('Error: ' + error.message);
        }
    };

    const handleTierDelete = async (id) => {
        if (confirm('Hapus tier ini?')) {
            try { await deleteTier(id); } catch (e) { alert(e.message); }
        }
    };

    // --- Reward Handlers ---
    const openRewardModal = (reward = null) => {
        setEditingItem(reward);
        setFormData(reward ? { ...reward } : { name: '', points_cost: 0, reward_type: 'discount_amount', reward_value: 0 });
        setRewardModal(true);
    };

    const handleRewardSubmit = async (e) => {
        e.preventDefault();
        try {
            if (editingItem) {
                await updateReward(editingItem.id, formData);
            } else {
                await addReward(formData);
            }
            setRewardModal(false);
        } catch (error) {
            alert('Error: ' + error.message);
        }
    };

    const handleRewardDelete = async (id) => {
        if (confirm('Hapus hadiah ini?')) {
            try { await deleteReward(id); } catch (e) { alert(e.message); }
        }
    };

    if (authLoading || loyaltyLoading) return <div className="p-xl text-center">Memuat...</div>;

    return (
        <div className="app-container">
            <Sidebar activePage="loyalty" />
            <main className="main-content">
                <header className="page-header">
                    <div>
                        <h1 className="page-title">Loyalty & Rewards</h1>
                        <p className="text-secondary text-sm">Atur level member dan katalog hadiah</p>
                    </div>
                </header>

                <div style={{ padding: 'var(--spacing-xl)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--spacing-xl)' }}>

                    {/* --- TIERS SECTION --- */}
                    <div className="card">
                        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <h3>Level Member (Tiers)</h3>
                            <button className="btn btn-secondary btn-sm" onClick={() => openTierModal()}>+ Tambah Tier</button>
                        </div>
                        <div className="card-body" style={{ padding: 0 }}>
                            <table className="table">
                                <thead>
                                    <tr>
                                        <th>Nama</th>
                                        <th>Min. Belanja</th>
                                        <th>Diskon</th>
                                        <th style={{ textAlign: 'right' }}>Aksi</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {tiers.map(t => (
                                        <tr key={t.id}>
                                            <td style={{ fontWeight: 'bold' }}>{t.name}</td>
                                            <td>Rp {parseInt(t.min_spend).toLocaleString('id-ID')}</td>
                                            <td>{t.discount_percent}%</td>
                                            <td style={{ textAlign: 'right' }}>
                                                <button className="btn btn-ghost btn-sm" onClick={() => openTierModal(t)}>✏️</button>
                                                <button className="btn btn-ghost btn-sm text-error" onClick={() => handleTierDelete(t.id)}>🗑️</button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* --- REWARDS SECTION --- */}
                    <div className="card">
                        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <h3>Katalog Hadiah</h3>
                            <button className="btn btn-secondary btn-sm" onClick={() => openRewardModal()}>+ Tambah Hadiah</button>
                        </div>
                        <div className="card-body" style={{ padding: 0 }}>
                            <table className="table">
                                <thead>
                                    <tr>
                                        <th>Nama Hadiah</th>
                                        <th>Harga Poin</th>
                                        <th>Nilai</th>
                                        <th style={{ textAlign: 'right' }}>Aksi</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {rewards.map(r => (
                                        <tr key={r.id}>
                                            <td style={{ fontWeight: '500' }}>{r.name}</td>
                                            <td style={{ color: 'var(--color-primary)', fontWeight: 'bold' }}>{r.points_cost} pts</td>
                                            <td>
                                                {r.reward_type === 'discount_amount' ? `Rp ${parseInt(r.reward_value).toLocaleString()}` : r.reward_value}
                                            </td>
                                            <td style={{ textAlign: 'right' }}>
                                                <button className="btn btn-ghost btn-sm" onClick={() => openRewardModal(r)}>✏️</button>
                                                <button className="btn btn-ghost btn-sm text-error" onClick={() => handleRewardDelete(r.id)}>🗑️</button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                </div>
            </main>

            {/* --- TIER MODAL --- */}
            {tierModal && (
                <div className="modal-overlay" onClick={() => setTierModal(false)}>
                    <div className="modal" style={{ width: '100%', maxWidth: '400px' }} onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>{editingItem ? 'Edit Tier' : 'Tambah Tier'}</h3>
                            <button className="btn btn-ghost btn-icon" onClick={() => setTierModal(false)}>✕</button>
                        </div>
                        <form onSubmit={handleTierSubmit}>
                            <div className="modal-body">
                                <div className="form-group mb-md">
                                    <label>Nama Level (Contoh: Gold)</label>
                                    <input type="text" className="input" required value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} />
                                </div>
                                <div className="form-group mb-md">
                                    <label>Min. Total Belanja (Rp)</label>
                                    <input type="number" className="input" required value={formData.min_spend} onChange={e => setFormData({ ...formData, min_spend: e.target.value })} />
                                </div>
                                <div className="form-group mb-md">
                                    <label>Diskon Otomatis (%)</label>
                                    <input type="number" className="input" required value={formData.discount_percent} onChange={e => setFormData({ ...formData, discount_percent: e.target.value })} />
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="submit" className="btn btn-primary">Simpan</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* --- REWARD MODAL --- */}
            {rewardModal && (
                <div className="modal-overlay" onClick={() => setRewardModal(false)}>
                    <div className="modal" style={{ width: '100%', maxWidth: '400px' }} onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>{editingItem ? 'Edit Hadiah' : 'Tambah Hadiah'}</h3>
                            <button className="btn btn-ghost btn-icon" onClick={() => setRewardModal(false)}>✕</button>
                        </div>
                        <form onSubmit={handleRewardSubmit}>
                            <div className="modal-body">
                                <div className="form-group mb-md">
                                    <label>Nama Hadiah</label>
                                    <input type="text" className="input" required value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} />
                                </div>
                                <div className="form-group mb-md">
                                    <label>Harga Poin</label>
                                    <input type="number" className="input" required value={formData.points_cost} onChange={e => setFormData({ ...formData, points_cost: e.target.value })} />
                                </div>
                                <div className="form-group mb-md">
                                    <label>Tipe Reward</label>
                                    <select className="input" value={formData.reward_type} onChange={e => setFormData({ ...formData, reward_type: e.target.value })}>
                                        <option value="discount_amount">Potongan Harga (Rp)</option>
                                        <option value="free_product">Produk Gratis (Teks)</option>
                                    </select>
                                </div>
                                <div className="form-group mb-md">
                                    <label>Nilai (Rp atau Nama Produk)</label>
                                    <input type="text" className="input" required value={formData.reward_value} onChange={e => setFormData({ ...formData, reward_value: e.target.value })} />
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="submit" className="btn btn-primary">Simpan</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
