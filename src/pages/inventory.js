import { useState, useEffect } from 'react';
import Sidebar from '@/components/layout/Sidebar';
import { useAuth } from '@/hooks/useAuth';
import { useInventory } from '@/hooks/useInventory';
import { formatDate } from '@/lib/db';

export default function InventoryPage() {
    const { user, loading: authLoading } = useAuth();
    const {
        warehouses, stocks, logs, loading: invLoading,
        selectedWarehouseId, setSelectedWarehouseId,
        addWarehouse, updateWarehouse, updateStock, deleteStock, deleteWarehouse
    } = useInventory(user?.id, user?.role);

    const [activeTab, setActiveTab] = useState('stock'); // stock, logs, warehouses
    const [searchTerm, setSearchTerm] = useState('');

    // Modal States
    const [adjustmentModal, setAdjustmentModal] = useState(false);
    const [warehouseModal, setWarehouseModal] = useState(false);
    const [selectedItem, setSelectedItem] = useState(null);
    const [editingWarehouse, setEditingWarehouse] = useState(null);
    const [formData, setFormData] = useState({});

    useEffect(() => {
        if (!authLoading && !user) window.location.href = '/';
    }, [user, authLoading]);

    // --- Search Logic ---
    const filteredStocks = stocks.filter(s =>
        s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (s.category && s.category.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    // --- Stock Adjustment ---
    const openAdjustmentModal = (item) => {
        setSelectedItem(item);
        setFormData({
            quantity: item.quantity,
            type: 'adjustment', // adjustment, opname, purchase
            notes: ''
        });
        setAdjustmentModal(true);
    };

    const handleAdjustmentSubmit = async (e) => {
        e.preventDefault();
        try {
            await updateStock(
                selectedItem.id,
                selectedWarehouseId,
                parseFloat(formData.quantity),
                formData.type,
                formData.notes,
                user?.id
            );
            setAdjustmentModal(false);
        } catch (error) {
            alert('Error: ' + error.message);
        }
    };

    // --- Warehouse Management ---
    const handleAddWarehouse = async (e) => {
        e.preventDefault();
        try {
            await addWarehouse(formData);
            setWarehouseModal(false);
        } catch (error) {
            alert(error.message);
        }
    };

    // --- Edit Warehouse ---
    const openEditWarehouse = (warehouse) => {
        setEditingWarehouse(warehouse);
        setFormData({ name: warehouse.name, address: warehouse.address || '' });
        setWarehouseModal(true);
    };

    const handleWarehouseSubmit = async (e) => {
        e.preventDefault();
        try {
            if (editingWarehouse) {
                await updateWarehouse(editingWarehouse.id, formData);
            } else {
                await addWarehouse(formData);
            }
            setWarehouseModal(false);
            setEditingWarehouse(null);
        } catch (error) {
            alert(error.message);
        }
    };

    // --- Delete Stock ---
    const handleDeleteStock = async (item) => {
        if (confirm(`Hapus produk "${item.name}" dari stok gudang ini?`)) {
            try {
                await deleteStock(item.id, selectedWarehouseId);
            } catch (error) {
                alert('Error: ' + error.message);
            }
        }
    };

    const currentWarehouse = warehouses.find(w => w.id === selectedWarehouseId);

    if (authLoading || invLoading) return <div className="p-xl text-center">Memuat Inventory...</div>;

    return (
        <div className="app-container">
            <Sidebar activePage="inventory" />
            <main className="main-content">
                <header className="page-header">
                    <div>
                        <h1 className="page-title">Gudang & Stok</h1>
                        <p className="text-secondary text-sm">Kelola stok di berbagai gudang/cabang</p>
                    </div>
                </header>

                <div style={{ padding: 'var(--spacing-xl)' }}>

                    {/* Warehouse Selector & Tabs */}
                    <div className="flex justify-between items-center mb-lg">
                        <div className="flex gap-md items-center">
                            <span className="text-secondary">Lokasi:</span>
                            <select
                                className="input"
                                style={{ minWidth: '200px' }}
                                value={selectedWarehouseId || ''}
                                onChange={(e) => setSelectedWarehouseId(e.target.value)}
                            >
                                {warehouses.map(w => (
                                    <option key={w.id} value={w.id}>{w.name} {w.is_primary ? '(Utama)' : ''}</option>
                                ))}
                            </select>
                        </div>
                        <div className="flex gap-sm">
                            <button className={`btn ${activeTab === 'stock' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setActiveTab('stock')}>📦 Stok</button>
                            <button className={`btn ${activeTab === 'logs' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setActiveTab('logs')}>📝 Riwayat</button>
                            <button className={`btn ${activeTab === 'warehouses' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setActiveTab('warehouses')}>🏭 Gudang</button>
                        </div>
                    </div>

                    {/* --- STOCK TAB --- */}
                    {activeTab === 'stock' && (
                        <div className="card">
                            <div className="card-header flex justify-between">
                                <input
                                    type="text"
                                    className="input"
                                    placeholder="Cari produk..."
                                    value={searchTerm}
                                    onChange={e => setSearchTerm(e.target.value)}
                                    style={{ width: '300px' }}
                                />
                                <button className="btn btn-secondary" onClick={() => window.print()}>🖨️ Cetak Laporan</button>
                            </div>
                            <div className="card-body p-0">
                                <table className="table">
                                    <thead>
                                        <tr>
                                            <th>Produk</th>
                                            <th>Kategori</th>
                                            <th>Stok Saat Ini</th>
                                            <th style={{ textAlign: 'right' }}>Aksi</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredStocks.map(item => (
                                            <tr key={item.id}>
                                                <td style={{ fontWeight: '500' }}>{item.name}</td>
                                                <td>{item.category?.replace('cat-', '')}</td>
                                                <td>
                                                    <span className={`badge ${item.quantity <= item.min_stock_level ? 'badge-error' : 'badge-success'}`}>
                                                        {item.quantity}
                                                    </span>
                                                </td>
                                                <td style={{ textAlign: 'right' }}>
                                                    <button className="btn btn-sm btn-outline" onClick={() => openAdjustmentModal(item)}>
                                                        Sesuaikan
                                                    </button>
                                                    <button className="btn btn-sm btn-ghost text-error" onClick={() => handleDeleteStock(item)}>
                                                        🗑️
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* --- LOGS TAB --- */}
                    {activeTab === 'logs' && (
                        <div className="card">
                            <div className="card-header">
                                <h3>Riwayat Perubahan Stok (50 Terakhir)</h3>
                            </div>
                            <div className="card-body p-0">
                                <table className="table">
                                    <thead>
                                        <tr>
                                            <th>Waktu</th>
                                            <th>Produk</th>
                                            <th>Tipe</th>
                                            <th>Perubahan</th>
                                            <th>Akhir</th>
                                            <th>User</th>
                                            <th>Catatan</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {logs.map(log => (
                                            <tr key={log.id}>
                                                <td className="text-sm text-secondary">{formatDate(log.created_at)}</td>
                                                <td style={{ fontWeight: '500' }}>{log.products?.name}</td>
                                                <td>
                                                    <span className="badge">{log.type}</span>
                                                </td>
                                                <td style={{ color: log.change_amount > 0 ? 'var(--color-success)' : 'var(--color-error)' }}>
                                                    {log.change_amount > 0 ? '+' : ''}{log.change_amount}
                                                </td>
                                                <td>{log.final_stock}</td>
                                                <td className="text-sm">{log.users?.name || '-'}</td>
                                                <td className="text-sm text-secondary">{log.notes}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* --- WAREHOUSES TAB --- */}
                    {activeTab === 'warehouses' && (
                        <div className="card">
                            <div className="card-header flex justify-between">
                                <h3>Daftar Gudang / Cabang</h3>
                                <button className="btn btn-primary btn-sm" onClick={() => { setFormData({ name: '', address: '' }); setWarehouseModal(true); }}>+ Gudang Baru</button>
                            </div>
                            <div className="card-body p-0">
                                <table className="table">
                                    <thead>
                                        <tr>
                                            <th>Nama Gudang</th>
                                            <th>Alamat</th>
                                            <th>Status</th>
                                            <th style={{ textAlign: 'right' }}>Aksi</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {warehouses.map(w => (
                                            <tr key={w.id}>
                                                <td style={{ fontWeight: 'bold' }}>{w.name}</td>
                                                <td>{w.address || '-'}</td>
                                                <td>{w.is_primary ? <span className="badge badge-primary">Utama</span> : 'Cabang'}</td>
                                                <td style={{ textAlign: 'right' }}>
                                                    <button className="btn btn-sm btn-ghost" onClick={() => openEditWarehouse(w)}>✏️</button>
                                                    {!w.is_primary && (
                                                        <button className="btn btn-sm btn-ghost text-error" onClick={() => { if (confirm('Hapus gudang ini?')) deleteWarehouse(w.id) }}>🗑️</button>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                </div>
            </main>

            {/* ADJUSTMENT MODAL */}
            {adjustmentModal && selectedItem && (
                <div className="modal-overlay" onClick={() => setAdjustmentModal(false)}>
                    <div className="modal" style={{ width: '400px' }} onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>Sesuaikan Stok: {selectedItem.name}</h3>
                            <button className="btn btn-ghost btn-icon" onClick={() => setAdjustmentModal(false)}>✕</button>
                        </div>
                        <form onSubmit={handleAdjustmentSubmit}>
                            <div className="modal-body">
                                <div className="form-group mb-md">
                                    <label>Jumlah Stok Baru (Real)</label>
                                    <input
                                        type="number"
                                        className="input"
                                        required
                                        value={formData.quantity}
                                        onChange={e => setFormData({ ...formData, quantity: e.target.value })}
                                    />
                                    <p className="text-xs text-secondary mt-xs">Stok tercatat saat ini: {selectedItem.quantity}</p>
                                </div>
                                <div className="form-group mb-md">
                                    <label>Tipe Penyesuaian</label>
                                    <select
                                        className="input"
                                        value={formData.type}
                                        onChange={e => setFormData({ ...formData, type: e.target.value })}
                                    >
                                        <option value="adjustment">Koreksi Manual (Adjustment)</option>
                                        <option value="opname">Stock Opname (Hitung Ulang)</option>
                                        <option value="purchase">Pembelian Barang (Masuk)</option>
                                        <option value="transfer_in">Transfer Masuk</option>
                                        <option value="damaged">Barang Rusak (Keluar)</option>
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label>Catatan (Opsional)</label>
                                    <textarea
                                        className="input"
                                        rows="2"
                                        value={formData.notes}
                                        onChange={e => setFormData({ ...formData, notes: e.target.value })}
                                    ></textarea>
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="submit" className="btn btn-primary">Simpan Perubahan</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* WAREHOUSE MODAL */}
            {warehouseModal && (
                <div className="modal-overlay" onClick={() => { setWarehouseModal(false); setEditingWarehouse(null); }}>
                    <div className="modal" style={{ width: '400px' }} onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>{editingWarehouse ? 'Edit Gudang' : 'Tambah Gudang Baru'}</h3>
                            <button className="btn btn-ghost btn-icon" onClick={() => { setWarehouseModal(false); setEditingWarehouse(null); }}>✕</button>
                        </div>
                        <form onSubmit={handleWarehouseSubmit}>
                            <div className="modal-body">
                                <div className="form-group mb-md">
                                    <label>Nama Gudang</label>
                                    <input
                                        type="text"
                                        className="input"
                                        required
                                        value={formData.name || ''}
                                        onChange={e => setFormData({ ...formData, name: e.target.value })}
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Alamat (Opsional)</label>
                                    <textarea
                                        className="input"
                                        value={formData.address || ''}
                                        onChange={e => setFormData({ ...formData, address: e.target.value })}
                                    />
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
