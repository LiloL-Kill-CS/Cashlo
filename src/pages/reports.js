import { useEffect, useState } from 'react';
import Sidebar from '@/components/layout/Sidebar';
import { useAuth } from '@/hooks/useAuth';
import { useTransactions } from '@/hooks/useTransactions';
import { useProducts } from '@/hooks/useProducts';
import { useExpenses } from '@/hooks/useExpenses';
import { formatCurrency, formatDate, formatNumberInput, parseNumberInput } from '@/lib/db';

export default function ReportsPage() {
    const { user, loading: authLoading } = useAuth();
    const { transactions, loading: txnLoading, getTransactionsByDateRange, createManualTransaction } = useTransactions(user?.id, user?.role);
    const { products } = useProducts(user?.id, user?.role);
    const { getExpensesByDateRange, addExpense, deleteExpense } = useExpenses(user?.id);

    const [startDate, setStartDate] = useState(() => {
        const d = new Date();
        d.setDate(1);
        return d.toISOString().split('T')[0];
    });
    const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);
    const [filteredTxns, setFilteredTxns] = useState([]);
    const [expenses, setExpenses] = useState([]);
    const [stats, setStats] = useState({ revenue: 0, grossProfit: 0, cost: 0, count: 0, expenses: 0, netProfit: 0 });
    const [showManualModal, setShowManualModal] = useState(false);
    const [showExpenseModal, setShowExpenseModal] = useState(false);
    const [newExpense, setNewExpense] = useState({ date: new Date().toISOString().split('T')[0], category: 'Gaji Karyawan', amount: '', notes: '' });
    const [manualData, setManualData] = useState({ datetime: '', notes: '', cartItems: [] });

    // Calculate totals from cart items
    const manualCartTotals = manualData.cartItems.reduce((acc, item) => ({
        totalSell: acc.totalSell + (item.sell_price * item.qty),
        totalCost: acc.totalCost + (item.cost_price * item.qty),
        totalProfit: acc.totalProfit + ((item.sell_price - item.cost_price) * item.qty)
    }), { totalSell: 0, totalCost: 0, totalProfit: 0 });

    const addProductToManualCart = (productId) => {
        const product = products.find(p => p.id === productId);
        if (!product) return;

        setManualData(prev => {
            const existing = prev.cartItems.find(i => i.product_id === productId);
            if (existing) {
                return {
                    ...prev,
                    cartItems: prev.cartItems.map(i =>
                        i.product_id === productId ? { ...i, qty: i.qty + 1 } : i
                    )
                };
            }
            return {
                ...prev,
                cartItems: [...prev.cartItems, {
                    product_id: product.id,
                    name: product.name,
                    qty: 1,
                    sell_price: product.sell_price,
                    cost_price: product.cost_price
                }]
            };
        });
    };

    const updateManualCartQty = (productId, newQty) => {
        if (newQty < 1) {
            setManualData(prev => ({
                ...prev,
                cartItems: prev.cartItems.filter(i => i.product_id !== productId)
            }));
        } else {
            setManualData(prev => ({
                ...prev,
                cartItems: prev.cartItems.map(i =>
                    i.product_id === productId ? { ...i, qty: newQty } : i
                )
            }));
        }
    };

    const removeFromManualCart = (productId) => {
        setManualData(prev => ({
            ...prev,
            cartItems: prev.cartItems.filter(i => i.product_id !== productId)
        }));
    };

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

    const filterTransactions = async () => {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);

        const filtered = getTransactionsByDateRange(start, end);
        const expenseData = await getExpensesByDateRange(start, end);

        setFilteredTxns(filtered);
        setExpenses(expenseData);

        const revenue = filtered.reduce((sum, t) => sum + t.subtotal, 0);
        const cost = filtered.reduce((sum, t) => sum + t.total_cost, 0);
        const grossProfit = filtered.reduce((sum, t) => sum + t.total_profit, 0);
        const totalExpenses = expenseData.reduce((sum, e) => sum + parseFloat(e.amount), 0);
        const count = filtered.reduce((sum, t) => sum + (t.manual_txn_count || 1), 0);

        setStats({
            revenue,
            grossProfit,
            cost,
            count,
            expenses: totalExpenses,
            netProfit: grossProfit - totalExpenses
        });
    };

    const handleManualSubmit = async (e) => {
        e.preventDefault();
        if (!manualData.datetime) {
            alert('Mohon pilih tanggal dan waktu');
            return;
        }
        if (manualData.cartItems.length === 0) {
            alert('Mohon tambahkan minimal 1 produk');
            return;
        }

        try {
            // Build items array from cart
            const items = manualData.cartItems.map(item => ({
                product_id: item.product_id,
                name: item.name,
                qty: item.qty,
                sell_price: item.sell_price,
                cost_price: item.cost_price,
                total_sell: item.sell_price * item.qty,
                total_cost: item.cost_price * item.qty,
                profit: (item.sell_price - item.cost_price) * item.qty
            }));

            const totalQty = manualData.cartItems.reduce((sum, i) => sum + i.qty, 0);

            await createManualTransaction({
                datetime: new Date(manualData.datetime).toISOString(),
                total_sell: manualCartTotals.totalSell,
                total_cost: manualCartTotals.totalCost,
                count: totalQty,
                notes: manualData.notes,
                items
            });

            setShowManualModal(false);
            setManualData({ datetime: '', notes: '', cartItems: [] });
            alert('Data lama berhasil ditambahkan! Pastikan filter tanggal mencakup tanggal data baru.');
        } catch (error) {
            alert('Error: ' + error.message);
        }
    };

    const handleExpenseSubmit = async (e) => {
        e.preventDefault();
        try {
            // Parse amount by removing thousand separators (dots) before sending to DB
            const parsedAmount = parseFloat(parseNumberInput(newExpense.amount));
            if (isNaN(parsedAmount) || parsedAmount <= 0) {
                alert('Masukkan jumlah pengeluaran yang valid');
                return;
            }

            await addExpense({
                ...newExpense,
                amount: parsedAmount
            });
            alert('Pengeluaran berhasil disimpan');
            setNewExpense({ date: new Date().toISOString().split('T')[0], category: 'Gaji Karyawan', amount: '', notes: '' });
            filterTransactions(); // Refresh
        } catch (error) {
            alert('Gagal: ' + error.message);
        }
    };

    const handleDeleteExpense = async (id) => {
        if (confirm('Hapus pengeluaran ini?')) {
            await deleteExpense(id);
            filterTransactions(); // Refresh
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
                    <button className="btn btn-warning ml-sm" onClick={() => setShowExpenseModal(true)} style={{ marginLeft: '8px' }}>
                        💸 Kelola Pengeluaran
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
                        <div className="card stat-card">
                            <div className="card-body">
                                <h3 className="text-secondary text-sm">Total Omzet</h3>
                                <p className="text-xl font-bold">{formatCurrency(stats.revenue)}</p>
                            </div>
                        </div>
                        <div className="card stat-card">
                            <div className="card-body">
                                <h3 className="text-secondary text-sm">Gross Profit</h3>
                                <p className="text-xl font-bold text-success">{formatCurrency(stats.grossProfit)}</p>
                            </div>
                        </div>
                        <div className="card stat-card">
                            <div className="card-body">
                                <h3 className="text-secondary text-sm">Pengeluaran (Gaji/Sewa)</h3>
                                <p className="text-xl font-bold text-warning">{formatCurrency(stats.expenses)}</p>
                            </div>
                        </div>
                        <div className="card stat-card">
                            <div className="card-body">
                                <h3 className="text-secondary text-sm">Net Profit (Bersih)</h3>
                                <p className="text-xl font-bold text-primary">{formatCurrency(stats.netProfit)}</p>
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
                    <div className="modal" style={{ maxWidth: '700px', width: '95%' }} onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>Input Data Transaksi Lama</h3>
                            <button className="btn btn-ghost btn-icon" onClick={() => setShowManualModal(false)}>✕</button>
                        </div>
                        <form onSubmit={handleManualSubmit}>
                            <div className="modal-body" style={{ maxHeight: 'calc(100vh - 200px)', overflowY: 'auto' }}>
                                <div className="alert alert-info mb-md" style={{ fontSize: '13px', background: 'var(--color-info-bg)', color: 'var(--color-info)', padding: '10px', borderRadius: '6px' }}>
                                    ℹ️ Pilih beberapa produk sekaligus untuk 1 transaksi. Stok tidak akan berkurang.
                                </div>

                                {/* Date & Notes Row */}
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                                    <div>
                                        <label className="text-sm text-secondary" style={{ display: 'block', marginBottom: '4px' }}>Tanggal & Waktu *</label>
                                        <input
                                            type="datetime-local"
                                            className="input"
                                            required
                                            value={manualData.datetime}
                                            onChange={e => setManualData({ ...manualData, datetime: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="text-sm text-secondary" style={{ display: 'block', marginBottom: '4px' }}>Catatan</label>
                                        <input
                                            type="text"
                                            className="input"
                                            placeholder="Contoh: Rekap Januari"
                                            value={manualData.notes}
                                            onChange={e => setManualData({ ...manualData, notes: e.target.value })}
                                        />
                                    </div>
                                </div>

                                {/* Product Grid */}
                                <div style={{ marginBottom: '16px' }}>
                                    <label className="text-sm text-secondary" style={{ display: 'block', marginBottom: '8px' }}>Pilih Produk (Klik untuk tambah)</label>
                                    <div style={{
                                        display: 'grid',
                                        gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
                                        gap: '8px',
                                        maxHeight: '200px',
                                        overflowY: 'auto',
                                        padding: '8px',
                                        background: 'var(--color-bg-secondary)',
                                        borderRadius: '8px'
                                    }}>
                                        {products.map(p => (
                                            <button
                                                type="button"
                                                key={p.id}
                                                onClick={() => addProductToManualCart(p.id)}
                                                style={{
                                                    padding: '10px 8px',
                                                    background: manualData.cartItems.some(i => i.product_id === p.id)
                                                        ? 'var(--color-primary)'
                                                        : 'var(--color-bg-tertiary)',
                                                    color: manualData.cartItems.some(i => i.product_id === p.id)
                                                        ? '#000'
                                                        : 'inherit',
                                                    border: 'none',
                                                    borderRadius: '6px',
                                                    cursor: 'pointer',
                                                    fontSize: '12px',
                                                    textAlign: 'center'
                                                }}
                                            >
                                                <div style={{ fontWeight: '500', marginBottom: '2px' }}>{p.name}</div>
                                                <div style={{ fontSize: '10px', opacity: 0.8 }}>{formatCurrency(p.sell_price)}</div>
                                            </button>
                                        ))}
                                        {products.length === 0 && (
                                            <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '20px', color: 'var(--color-text-muted)' }}>
                                                Belum ada produk. Tambahkan produk dulu di halaman Produk.
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Cart Items */}
                                {manualData.cartItems.length > 0 && (
                                    <div style={{ marginBottom: '16px' }}>
                                        <label className="text-sm text-secondary" style={{ display: 'block', marginBottom: '8px' }}>
                                            Produk Dipilih ({manualData.cartItems.length})
                                        </label>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                            {manualData.cartItems.map(item => (
                                                <div key={item.product_id} style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'space-between',
                                                    padding: '10px 12px',
                                                    background: 'var(--color-bg-tertiary)',
                                                    borderRadius: '8px'
                                                }}>
                                                    <div style={{ flex: 1 }}>
                                                        <div style={{ fontWeight: '500' }}>{item.name}</div>
                                                        <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                                                            {formatCurrency(item.sell_price)} × {item.qty} = {formatCurrency(item.sell_price * item.qty)}
                                                        </div>
                                                    </div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => updateManualCartQty(item.product_id, item.qty - 1)}>−</button>
                                                        <span style={{ minWidth: '24px', textAlign: 'center', fontWeight: '600' }}>{item.qty}</span>
                                                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => updateManualCartQty(item.product_id, item.qty + 1)}>+</button>
                                                        <button type="button" className="btn btn-ghost btn-sm" style={{ color: 'var(--color-error)' }} onClick={() => removeFromManualCart(item.product_id)}>✕</button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Totals Summary */}
                                <div style={{ background: 'var(--color-bg-tertiary)', padding: '12px', borderRadius: '8px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                                        <span className="text-secondary">Total Omzet:</span>
                                        <span style={{ fontWeight: '600' }}>{formatCurrency(manualCartTotals.totalSell)}</span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                                        <span className="text-secondary">Total HPP:</span>
                                        <span style={{ color: 'var(--color-warning)' }}>{formatCurrency(manualCartTotals.totalCost)}</span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '6px', borderTop: '1px solid var(--color-border)' }}>
                                        <span style={{ fontWeight: '600' }}>Profit:</span>
                                        <span style={{ color: 'var(--color-success)', fontWeight: '700' }}>+{formatCurrency(manualCartTotals.totalProfit)}</span>
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

            {/* Expenses Modal */}
            {showExpenseModal && (
                <div className="modal-overlay" onClick={() => setShowExpenseModal(false)}>
                    <div className="modal" style={{ maxWidth: '600px' }} onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>Kelola Pengeluaran Operasional</h3>
                            <button className="btn btn-ghost btn-icon" onClick={() => setShowExpenseModal(false)}>✕</button>
                        </div>
                        <div className="modal-body" style={{ maxHeight: 'calc(100vh - 200px)', overflowY: 'auto' }}>
                            <div className="alert alert-warning mb-md" style={{ fontSize: '13px', background: 'var(--color-warning-bg)', color: 'var(--color-warning)', padding: '10px', borderRadius: '6px' }}>
                                ℹ️ Masukkan Gaji Karyawan, Sewa Tempat, Listrik, dll agar Net Profit akurat.
                            </div>

                            <form onSubmit={handleExpenseSubmit} className="mb-lg p-md bg-tertiary rounded" style={{ background: 'var(--color-bg-tertiary)' }}>
                                <h4 className="mb-sm text-sm font-bold">Tambah Pengeluaran Baru</h4>
                                <div className="grid grid-cols-2 gap-md" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                                    <input
                                        type="date"
                                        className="input input-sm"
                                        required
                                        value={newExpense.date}
                                        onChange={e => setNewExpense({ ...newExpense, date: e.target.value })}
                                    />
                                    <select
                                        className="input input-sm"
                                        value={newExpense.category}
                                        onChange={e => setNewExpense({ ...newExpense, category: e.target.value })}
                                    >
                                        <option value="Gaji Karyawan">Gaji Karyawan</option>
                                        <option value="Sewa Tempat">Sewa Tempat</option>
                                        <option value="Listrik & Air">Listrik & Air</option>
                                        <option value="Internet">Internet</option>
                                        <option value="Lainnya">Lainnya</option>
                                    </select>
                                    <input
                                        type="text"
                                        className="input input-sm"
                                        placeholder="Jumlah (Rp)"
                                        required
                                        value={formatNumberInput(newExpense.amount)}
                                        onChange={e => setNewExpense({ ...newExpense, amount: parseNumberInput(e.target.value) })}
                                    />
                                    <input
                                        type="text"
                                        className="input input-sm"
                                        placeholder="Catatan..."
                                        value={newExpense.notes}
                                        onChange={e => setNewExpense({ ...newExpense, notes: e.target.value })}
                                    />
                                </div>
                                <button type="submit" className="btn btn-primary btn-sm mt-sm w-full">💾 Simpan Pengeluaran</button>
                            </form>

                            <h4 className="mb-sm text-sm border-b pb-xs">Riwayat Pengeluaran (Periode Ini)</h4>
                            <table className="table table-sm">
                                <thead>
                                    <tr>
                                        <th>Tanggal</th>
                                        <th>Kategori</th>
                                        <th>Catatan</th>
                                        <th className="text-right">Jumlah</th>
                                        <th></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {expenses.map(exp => (
                                        <tr key={exp.id}>
                                            <td>{formatDate(exp.date)}</td>
                                            <td><span className="badge badge-neutral">{exp.category}</span></td>
                                            <td className="text-sm text-secondary">{exp.notes}</td>
                                            <td className="text-right font-bold text-warning">{formatCurrency(exp.amount)}</td>
                                            <td className="text-right">
                                                <button className="btn btn-ghost btn-xs text-error" onClick={() => handleDeleteExpense(exp.id)}>Hapus</button>
                                            </td>
                                        </tr>
                                    ))}
                                    {expenses.length === 0 && (
                                        <tr>
                                            <td colSpan="5" className="text-center text-muted p-md">Belum ada data pengeluaran</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
