import { useEffect, useState } from 'react';
import Sidebar from '@/components/layout/Sidebar';
import { useAuth } from '@/hooks/useAuth';
import { useTransactions } from '@/hooks/useTransactions';
import { useProducts } from '@/hooks/useProducts';
import { formatCurrency, formatDate } from '@/lib/db';

export default function ReportsPage() {
    const { user, loading: authLoading } = useAuth();
    const { transactions, loading: txnLoading, getTransactionsByDateRange, createManualTransaction } = useTransactions(user?.id, user?.role);
    const { products } = useProducts(user?.id, user?.role);

    const [startDate, setStartDate] = useState(() => {
        const d = new Date();
        d.setDate(1);
        return d.toISOString().split('T')[0];
    });
    const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);
    const [filteredTxns, setFilteredTxns] = useState([]);
    const [stats, setStats] = useState({ revenue: 0, profit: 0, cost: 0, count: 0 });
    const [showManualModal, setShowManualModal] = useState(false);
    const [manualData, setManualData] = useState({ datetime: '', total_sell: '', total_cost: '', count: 1, notes: '', productId: '' });

    useEffect(() => {
        if (!authLoading && !user) {
            window.location.href = '/';
        }
    }, [user, authLoading]);

    useEffect(() => {
        if (!txnLoading) {
            filterTransactions();
        }
    }, [transactions, startDate, endDate, txnLoading]);

    const filterTransactions = () => {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);

        const filtered = getTransactionsByDateRange(start, end);
        setFilteredTxns(filtered);

        setStats({
            revenue: filtered.reduce((sum, t) => sum + t.subtotal, 0),
            profit: filtered.reduce((sum, t) => sum + t.total_profit, 0),
            cost: filtered.reduce((sum, t) => sum + t.total_cost, 0),
            count: filtered.reduce((sum, t) => sum + (t.manual_txn_count || 1), 0)
        });
    };

    const handleManualSubmit = async (e) => {
        e.preventDefault();
        if (!manualData.datetime || !manualData.total_sell || manualData.total_cost === '') {
            alert('Mohon lengkapi data');
            return;
        }

        try {
            let items = null;
            if (manualData.productId) {
                const prod = products.find(p => p.id === manualData.productId);
                if (prod) {
                    items = [{
                        product_id: prod.id,
                        name: prod.name,
                        qty: parseInt(manualData.count) || 1,
                        sell_price: parseFloat(manualData.total_sell),
                        cost_price: parseFloat(manualData.total_cost),
                        total_sell: parseFloat(manualData.total_sell),
                        total_cost: parseFloat(manualData.total_cost),
                        profit: parseFloat(manualData.total_sell) - parseFloat(manualData.total_cost)
                    }];
                }
            }

            await createManualTransaction({
                ...manualData,
                total_sell: parseFloat(manualData.total_sell),
                total_cost: parseFloat(manualData.total_cost),
                count: parseInt(manualData.count) || 1,
                items,
                datetime: new Date(manualData.datetime).toISOString()
            });
            setShowManualModal(false);
            setManualData({ datetime: '', total_sell: '', total_cost: '', count: 1, notes: '', productId: '' });
            alert('Data lama berhasil ditambahkan! Pastikan filter tanggal mencakup tanggal data baru.');
        } catch (error) {
            alert('Error: ' + error.message);
        }
    };

    const exportCSV = () => {
        // Build CSV content
        const headers = ['ID Transaksi', 'Tanggal', 'Waktu', 'Produk', 'Qty', 'Harga Jual', 'HPP', 'Profit', 'Total', 'Metode Bayar'];
        const rows = [];

        filteredTxns.forEach(txn => {
            const items = JSON.parse(txn.items || '[]');
            const date = new Date(txn.datetime);

            items.forEach((item, idx) => {
                rows.push([
                    idx === 0 ? txn.id : '',
                    idx === 0 ? date.toLocaleDateString('id-ID') : '',
                    idx === 0 ? date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '',
                    item.name,
                    item.qty,
                    item.sell_price,
                    item.cost_price,
                    item.profit,
                    idx === 0 ? txn.subtotal : '',
                    idx === 0 ? txn.payment_method : ''
                ]);
            });
        });

        // Summary row
        rows.push([]);
        rows.push(['TOTAL', '', '', '', '', stats.revenue, stats.cost, stats.profit, '', '']);

        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.join(','))
        ].join('\n');

        // Download
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `laporan-cashlo-${startDate}-${endDate}.csv`;
        link.click();
    };

    if (authLoading || txnLoading) {
        return (
            <div className="app-container">
                <Sidebar activePage="reports" />
                <main className="main-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div className="animate-pulse text-muted">Memuat...</div>
                </main>
            </div>
        );
    }

    return (
        <div className="app-container">
            <Sidebar activePage="reports" />

            <main className="main-content">
                <header className="page-header">
                    <div>
                        <h1 className="page-title">Laporan</h1>
                        <p className="text-secondary text-sm">Riwayat transaksi dan analisis</p>
                    </div>

                    <button className="btn btn-primary" onClick={exportCSV} disabled={filteredTxns.length === 0}>
                        📥 Export CSV
                    </button>
                    <button className="btn btn-secondary ml-sm" onClick={() => setShowManualModal(true)}>
                        ➕ Input Data Lama
                    </button>
                </header>

                <div style={{ padding: 'var(--spacing-lg)' }}>
                    {/* Date Filter */}
                    <div className="card" style={{ marginBottom: 'var(--spacing-lg)' }}>
                        <div className="card-body">
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--spacing-md)', alignItems: 'flex-end' }}>
                                <div style={{ flex: '1 1 140px', minWidth: '140px' }}>
                                    <label className="text-sm text-secondary" style={{ display: 'block', marginBottom: '4px' }}>
                                        Dari Tanggal
                                    </label>
                                    <input
                                        type="date"
                                        className="input"
                                        value={startDate}
                                        onChange={e => setStartDate(e.target.value)}
                                    />
                                </div>
                                <div style={{ flex: '1 1 140px', minWidth: '140px' }}>
                                    <label className="text-sm text-secondary" style={{ display: 'block', marginBottom: '4px' }}>
                                        Sampai Tanggal
                                    </label>
                                    <input
                                        type="date"
                                        className="input"
                                        value={endDate}
                                        onChange={e => setEndDate(e.target.value)}
                                    />
                                </div>
                                <div className="period-filter" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                    <button
                                        className="btn btn-secondary btn-sm"
                                        onClick={() => {
                                            const today = new Date().toISOString().split('T')[0];
                                            setStartDate(today);
                                            setEndDate(today);
                                        }}
                                    >
                                        Hari Ini
                                    </button>
                                    <button
                                        className="btn btn-secondary btn-sm"
                                        onClick={() => {
                                            const today = new Date();
                                            const weekAgo = new Date(today);
                                            weekAgo.setDate(weekAgo.getDate() - 7);
                                            setStartDate(weekAgo.toISOString().split('T')[0]);
                                            setEndDate(today.toISOString().split('T')[0]);
                                        }}
                                    >
                                        7 Hari
                                    </button>
                                    <button
                                        className="btn btn-secondary btn-sm"
                                        onClick={() => {
                                            const today = new Date();
                                            const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
                                            setStartDate(firstDay.toISOString().split('T')[0]);
                                            setEndDate(today.toISOString().split('T')[0]);
                                        }}
                                    >
                                        Bulan Ini
                                    </button>
                                    <select
                                        className="input input-sm"
                                        style={{ width: 'auto', minWidth: '100px', cursor: 'pointer' }}
                                        onChange={(e) => {
                                            const y = e.target.value;
                                            if (y) {
                                                setStartDate(`${y}-01-01`);
                                                setEndDate(`${y}-12-31`);
                                            }
                                        }}
                                        defaultValue=""
                                    >
                                        <option value="" disabled>Pilih Tahun</option>
                                        {[0, 1, 2, 3, 4].map(offset => {
                                            const y = new Date().getFullYear() - offset;
                                            return <option key={y} value={y}>{y}</option>
                                        })}
                                    </select>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Summary Stats */}
                    <div className="stats-grid-4" style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                        gap: 'var(--spacing-md)',
                        marginBottom: 'var(--spacing-lg)'
                    }}>
                        <div className="stat-card">
                            <div className="stat-label">Total Omzet</div>
                            <div className="stat-value" style={{ fontSize: 'var(--font-size-2xl)' }}>
                                {formatCurrency(stats.revenue)}
                            </div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-label">Total HPP</div>
                            <div className="stat-value" style={{ fontSize: 'var(--font-size-2xl)', color: 'var(--color-warning)' }}>
                                {formatCurrency(stats.cost)}
                            </div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-label">Total Profit</div>
                            <div className="stat-value" style={{ fontSize: 'var(--font-size-2xl)', color: 'var(--color-success)' }}>
                                {formatCurrency(stats.profit)}
                            </div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-label">Jumlah Transaksi</div>
                            <div className="stat-value" style={{ fontSize: 'var(--font-size-2xl)' }}>
                                {stats.count}
                            </div>
                        </div>
                    </div>

                    {/* Transactions Table */}
                    <div className="card">
                        <div className="card-header">
                            <h3 style={{ fontSize: 'var(--font-size-lg)' }}>
                                Daftar Transaksi ({filteredTxns.length})
                            </h3>
                        </div>
                        <div className="card-body table-container" style={{ padding: 0, maxHeight: '500px', overflow: 'auto' }}>
                            <table className="table">
                                <thead style={{ position: 'sticky', top: 0, background: 'var(--color-bg-secondary)' }}>
                                    <tr>
                                        <th className="hide-mobile">ID Transaksi</th>
                                        <th>Waktu</th>
                                        <th>Items</th>
                                        <th style={{ textAlign: 'right' }}>Omzet</th>
                                        <th className="hide-mobile" style={{ textAlign: 'right' }}>HPP</th>
                                        <th style={{ textAlign: 'right' }}>Profit</th>
                                        <th className="hide-mobile">Metode</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredTxns.map(txn => {
                                        const items = JSON.parse(txn.items || '[]');
                                        return (
                                            <tr key={txn.id}>
                                                <td className="hide-mobile" style={{ fontFamily: 'monospace', fontSize: '12px' }}>{txn.id}</td>
                                                <td className="text-secondary">{formatDate(txn.datetime)}</td>
                                                <td>
                                                    <div style={{ maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                        {items.map(i => `${i.name} (${i.qty})`).join(', ')}
                                                    </div>
                                                </td>
                                                <td style={{ textAlign: 'right', fontWeight: '500' }}>
                                                    {formatCurrency(txn.subtotal)}
                                                </td>
                                                <td className="hide-mobile" style={{ textAlign: 'right', color: 'var(--color-warning)' }}>
                                                    {formatCurrency(txn.total_cost)}
                                                </td>
                                                <td style={{ textAlign: 'right', color: 'var(--color-success)', fontWeight: '500' }}>
                                                    +{formatCurrency(txn.total_profit)}
                                                </td>
                                                <td className="hide-mobile">
                                                    <span className="badge badge-neutral">
                                                        {txn.payment_method === 'cash' ? 'Tunai' : 'QRIS'}
                                                    </span>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                    {filteredTxns.length === 0 && (
                                        <tr>
                                            <td colSpan="7" style={{ textAlign: 'center', padding: 'var(--spacing-xl)', color: 'var(--color-text-muted)' }}>
                                                Tidak ada transaksi dalam periode ini
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </main>
            {showManualModal && (
                <div className="modal-overlay" onClick={() => setShowManualModal(false)}>
                    <div className="modal" style={{ maxWidth: '500px' }} onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>Input Data Transaksi Lama</h3>
                            <button className="btn btn-ghost btn-icon" onClick={() => setShowManualModal(false)}>✕</button>
                        </div>
                        <form onSubmit={handleManualSubmit}>
                            <div className="modal-body" style={{ maxHeight: 'calc(100vh - 200px)', overflowY: 'auto' }}>
                                <div className="alert alert-info mb-md" style={{ fontSize: '13px', background: 'var(--color-info-bg)', color: 'var(--color-info)', padding: '10px', borderRadius: '6px' }}>
                                    ℹ️ Gunakan fitur ini untuk mencatat omzet lama (sebelum pakai aplikasi). Stok barang tidak akan berkurang.
                                </div>

                                <div className="grid grid-cols-2 gap-md" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                    <div className="form-group mb-md">
                                        <label className="text-sm text-secondary mb-xs block">Tanggal & Waktu</label>
                                        <input
                                            type="datetime-local"
                                            className="input"
                                            required
                                            value={manualData.datetime}
                                            onChange={e => setManualData({ ...manualData, datetime: e.target.value })}
                                        />
                                    </div>
                                    <div className="form-group mb-md">
                                        <label className="text-sm text-secondary mb-xs block">Jumlah Transaksi (Qty)</label>
                                        <input
                                            type="number"
                                            className="input"
                                            min="1"
                                            required
                                            value={manualData.count}
                                            onChange={e => setManualData({ ...manualData, count: e.target.value })}
                                        />
                                    </div>
                                </div>

                                <div className="form-group mb-md">
                                    <label className="text-sm text-secondary mb-xs block">Total Omzet (Rp)</label>
                                    <input
                                        type="number"
                                        className="input"
                                        required
                                        placeholder="0"
                                        value={manualData.total_sell}
                                        onChange={e => setManualData({ ...manualData, total_sell: e.target.value })}
                                    />
                                </div>

                                <div className="form-group mb-md">
                                    <label className="text-sm text-secondary mb-xs block">Total Modal / HPP (Rp)</label>
                                    <input
                                        type="number"
                                        className="input"
                                        required
                                        placeholder="0"
                                        value={manualData.total_cost}
                                        onChange={e => setManualData({ ...manualData, total_cost: e.target.value })}
                                    />
                                </div>

                                <div className="form-group mb-md">
                                    <label className="text-sm text-secondary mb-xs block">Produk (Opsional)</label>
                                    <select
                                        className="input"
                                        value={manualData.productId}
                                        onChange={e => {
                                            const pid = e.target.value;
                                            const prod = products.find(p => p.id === pid);
                                            setManualData({
                                                ...manualData,
                                                productId: pid,
                                                total_sell: prod ? prod.sell_price : manualData.total_sell,
                                                total_cost: prod ? prod.cost_price : manualData.total_cost
                                            });
                                        }}
                                    >
                                        <option value="">-- Pilih Produk (Jika Ada) --</option>
                                        {products.map(p => (
                                            <option key={p.id} value={p.id}>{p.name}</option>
                                        ))}
                                    </select>
                                </div>

                                <div className="form-group mb-md">
                                    <label className="text-sm text-secondary mb-xs block">Catatan (Opsional)</label>
                                    <textarea
                                        className="input"
                                        placeholder="Contoh: Rekap Januari 2024"
                                        value={manualData.notes}
                                        onChange={e => setManualData({ ...manualData, notes: e.target.value })}
                                    ></textarea>
                                </div>

                                <div className="bg-tertiary p-md rounded" style={{ background: 'var(--color-bg-tertiary)', padding: '12px', borderRadius: '8px' }}>
                                    <div className="flex justify-between mb-xs">
                                        <span className="text-sm">Profit (Auto):</span>
                                        <span className="font-bold text-success">
                                            {formatCurrency((parseFloat(manualData.total_sell) || 0) - (parseFloat(manualData.total_cost) || 0))}
                                        </span>
                                    </div>
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-ghost" onClick={() => setShowManualModal(false)}>Batal</button>
                                <button type="submit" className="btn btn-primary">Simpan Data Lama</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
