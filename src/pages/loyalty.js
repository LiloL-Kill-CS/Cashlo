import { useState, useEffect } from 'react';
import Sidebar from '@/components/layout/Sidebar';
import { useAuth } from '@/hooks/useAuth';
import { useLoyalty } from '@/hooks/useLoyalty';
import { useProducts } from '@/hooks/useProducts';

export default function LoyaltyPage() {
    const { user, loading: authLoading } = useAuth();
    const ownerId = user?.owner_id || user?.id;
    const { tiers, rewards, loading: loyaltyLoading, addTier, updateTier, deleteTier, addReward, updateReward, deleteReward } = useLoyalty(ownerId);
    const { products } = useProducts(ownerId, user?.role);

    const [tierModal, setTierModal] = useState(false);
    const [rewardModal, setRewardModal] = useState(false);
    const [editingItem, setEditingItem] = useState(null);
    const [formData, setFormData] = useState({});

    useEffect(() => {
        if (!authLoading && !user) window.location.href = '/';
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
            if (editingItem) await updateTier(editingItem.id, formData);
            else await addTier(formData);
            setTierModal(false);
        } catch (error) { alert('Error: ' + error.message); }
    };

    const handleTierDelete = async (id) => {
        if (confirm('Hapus tier ini?')) {
            try { await deleteTier(id); } catch (e) { alert(e.message); }
        }
    };

    // --- Reward Handlers ---
    const openRewardModal = (reward = null) => {
        setEditingItem(reward);
        setFormData(reward ? { ...reward } : {
            name: '', points_cost: 0, reward_type: 'discount_amount',
            reward_value: 0, required_purchases: 0, product_id: ''
        });
        setRewardModal(true);
    };

    const handleRewardSubmit = async (e) => {
        e.preventDefault();
        try {
            const data = { ...formData };
            if (data.reward_type !== 'per_product') {
                data.required_purchases = 0;
                data.product_id = '';
            }
            if (editingItem) await updateReward(editingItem.id, data);
            else await addReward(data);
            setRewardModal(false);
        } catch (error) { alert('Error: ' + error.message); }
    };

    const handleRewardDelete = async (id) => {
        if (confirm('Hapus hadiah ini?')) {
            try { await deleteReward(id); } catch (e) { alert(e.message); }
        }
    };

    if (authLoading || loyaltyLoading) return <div className="p-xl text-center">Memuat...</div>;

    return (
        <div className="app-container">
            <Sidebar activePage="loyalty" userRole={user?.role} />
            <main className="main-content">
                <header className="page-header">
                    <div>
                        <h1 className="page-title">Loyalty & Rewards</h1>
                        <p className="text-secondary text-sm">Atur level member, hadiah, & reward per produk. (1 Produk Dibeli = 1 Poin)</p>
                    </div>
                </header>

                <div className="loyalty-grid" style={{ padding: 'var(--spacing-xl)' }}>

                    {/* --- TIERS SECTION --- */}
                    <div className="card">
                        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <h3>Level Member (Tiers)</h3>
                            <button className="btn btn-secondary btn-sm" onClick={() => openTierModal()}>+ Tambah Tier</button>
                        </div>
                        <div className="card-body" style={{ padding: 0, overflowX: 'auto' }}>
                            <table className="table" style={{ minWidth: '400px' }}>
                                <thead>
                                    <tr>
                                        <th>Nama</th>
                                        <th>Min. Belanja</th>
                                        <th>Diskon</th>
                                        <th style={{ textAlign: 'right' }}>Aksi</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {tiers.length === 0 ? (
                                        <tr><td colSpan="4" className="text-center p-lg text-secondary">Belum ada tier</td></tr>
                                    ) : tiers.map(t => (
                                        <tr key={t.id}>
                                            <td style={{ fontWeight: 'bold' }}>{t.name}</td>
                                            <td>Rp {parseInt(t.min_spend).toLocaleString('id-ID')}</td>
                                            <td>{t.discount_percent}%</td>
                                            <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                                                <button className="btn btn-ghost btn-sm" onClick={() => openTierModal(t)}>✏️</button>
                                                <button className="btn btn-ghost btn-sm text-error" onClick={() => handleTierDelete(t.id)}>🗑️</button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* --- REWARDS / KATALOG HADIAH --- */}
                    <div className="card">
                        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <h3>Katalog Hadiah</h3>
                            <button className="btn btn-secondary btn-sm" onClick={() => openRewardModal()}>+ Tambah Hadiah</button>
                        </div>
                        <div className="card-body" style={{ padding: 0, overflowX: 'auto' }}>
                            <table className="table" style={{ minWidth: '550px' }}>
                                <thead>
                                    <tr>
                                        <th>Nama Hadiah</th>
                                        <th>Tipe Reward</th>
                                        <th>Harga Poin</th>
                                        <th>Syarat</th>
                                        <th>Nilai</th>
                                        <th style={{ textAlign: 'right' }}>Aksi</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {rewards.length === 0 ? (
                                        <tr><td colSpan="6" className="text-center p-lg text-secondary">Belum ada hadiah</td></tr>
                                    ) : rewards.map(r => {
                                        const product = products.find(p => p.id === r.product_id);
                                        return (
                                            <tr key={r.id}>
                                                <td style={{ fontWeight: '500' }}>{r.name}</td>
                                                <td>
                                                    <span className={`badge ${r.reward_type === 'per_product' ? 'badge-warning' : r.reward_type === 'free_product' ? 'badge-success' : 'badge-neutral'}`}>
                                                        {r.reward_type === 'per_product' ? '🛒 Per Produk' : r.reward_type === 'free_product' ? '🎁 Produk Gratis' : '💰 Potongan Harga'}
                                                    </span>
                                                </td>
                                                <td style={{ color: 'var(--color-primary)', fontWeight: 'bold' }}>⭐ {r.points_cost}</td>
                                                <td>
                                                    {r.reward_type === 'per_product' && r.required_purchases > 0 ? (
                                                        <span className="text-sm">
                                                            Beli {r.required_purchases}x {product?.name || 'produk'}
                                                        </span>
                                                    ) : '-'}
                                                </td>
                                                <td>
                                                    {r.reward_type === 'discount_amount' ? `Rp ${parseInt(r.reward_value).toLocaleString()}` : r.reward_value}
                                                </td>
                                                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                                                    <button className="btn btn-ghost btn-sm" onClick={() => openRewardModal(r)}>✏️</button>
                                                    <button className="btn btn-ghost btn-sm text-error" onClick={() => handleRewardDelete(r.id)}>🗑️</button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* --- HOW IT WORKS --- */}
                    <div className="card" style={{ borderLeft: '4px solid var(--color-primary)' }}>
                        <div className="card-body">
                            <h4 style={{ marginBottom: '8px' }}>📌 Cara Kerja Poin & Per Produk</h4>
                            <div className="text-sm text-secondary" style={{ lineHeight: '1.8' }}>
                                <div>✅ Setiap <strong>1 produk dibeli</strong> = 1 poin ditambahkan ke pelanggan</div>
                                <div>✅ <strong>Potongan Harga:</strong> Pelanggan tukar poin → dapat diskon Rp</div>
                                <div>✅ <strong>Produk Gratis:</strong> Pelanggan tukar poin → dapat produk gratis</div>
                                <div>✅ <strong>Per Produk:</strong> Set syarat beli X produk tertentu → baru bisa redeem hadiah</div>
                                <div>✅ Redeem poin dilakukan di halaman <strong>Pelanggan → Tombol 🎁 Redeem</strong></div>
                            </div>
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
                                <button type="button" className="btn btn-ghost" onClick={() => setTierModal(false)}>Batal</button>
                                <button type="submit" className="btn btn-primary">Simpan</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* --- REWARD MODAL (Updated with Per Product) --- */}
            {rewardModal && (
                <div className="modal-overlay" onClick={() => setRewardModal(false)}>
                    <div className="modal" style={{ width: '100%', maxWidth: '450px' }} onClick={e => e.stopPropagation()}>
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
                                    <label>Harga Poin (berapa poin untuk redeem)</label>
                                    <input type="number" className="input" required value={formData.points_cost} onChange={e => setFormData({ ...formData, points_cost: e.target.value })} />
                                </div>
                                <div className="form-group mb-md">
                                    <label>Tipe Reward</label>
                                    <select className="input" value={formData.reward_type} onChange={e => setFormData({ ...formData, reward_type: e.target.value })}>
                                        <option value="discount_amount">💰 Potongan Harga (Rp)</option>
                                        <option value="free_product">🎁 Produk Gratis (Teks)</option>
                                        <option value="per_product">🛒 Per Produk (Beli X dapat hadiah)</option>
                                    </select>
                                </div>

                                {formData.reward_type === 'per_product' && (
                                    <>
                                        <div className="form-group mb-md">
                                            <label>Pilih Produk</label>
                                            <select className="input" value={formData.product_id || ''} onChange={e => setFormData({ ...formData, product_id: e.target.value })}>
                                                <option value="">-- Pilih Produk --</option>
                                                {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                            </select>
                                        </div>
                                        <div className="form-group mb-md">
                                            <label>Jumlah Pembelian Produk yang Dibutuhkan</label>
                                            <input type="number" className="input" min="1"
                                                placeholder="cth: 6 (beli 6x produk ini)"
                                                value={formData.required_purchases || ''}
                                                onChange={e => setFormData({ ...formData, required_purchases: parseInt(e.target.value) || 0 })} />
                                            <div className="text-xs text-secondary" style={{ marginTop: '4px' }}>
                                                Contoh: isi 6 berarti pelanggan harus beli 6x produk ini untuk bisa redeem hadiah
                                            </div>
                                        </div>
                                    </>
                                )}

                                <div className="form-group mb-md">
                                    <label>{formData.reward_type === 'discount_amount' ? 'Nilai Potongan (Rp)' : 'Nilai / Nama Produk Hadiah'}</label>
                                    <input type="text" className="input" required value={formData.reward_value} onChange={e => setFormData({ ...formData, reward_value: e.target.value })} />
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-ghost" onClick={() => setRewardModal(false)}>Batal</button>
                                <button type="submit" className="btn btn-primary">Simpan</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}

export const getServerSideProps = async () => { return { props: {} }; };
