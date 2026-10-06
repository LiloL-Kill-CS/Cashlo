import { useEffect, useRef, useState } from 'react';
import Sidebar from '@/components/layout/Sidebar';
import { useAuth } from '@/hooks/useAuth';
import { useTransactions } from '@/hooks/useTransactions';
import { useProducts } from '@/hooks/useProducts';
import { useExpenses } from '@/hooks/useExpenses';
import { usePurchasing } from '@/hooks/usePurchasing';
import { formatCurrency, formatDate, formatNumberInput, generateTransactionId, parseNumberInput } from '@/lib/db';
import { supabase } from '@/lib/supabase';

const isCanceledTransaction = status => ['voided', 'canceled', 'cancelled'].includes(status);
const manualItemKey = item => `${item.is_supply ? 'supply' : 'menu'}:${item.product_id}`;
const formatSupplyAmount = value => new Intl.NumberFormat('id-ID', { maximumFractionDigits: 6 }).format(value);

export default function ReportsPage() {
    const { user, loading: authLoading } = useAuth();
    const { transactions, loading: txnLoading, getTransactionsByDateRange, createManualTransaction, voidTransaction, deleteTransaction } = useTransactions((user?.owner_id || user?.id), user?.role, user?.id);
    const { products } = useProducts((user?.owner_id || user?.id), user?.role);
    const { getExpensesByDateRange, addExpense, deleteExpense } = useExpenses((user?.owner_id || user?.id));
    const { supplies } = usePurchasing((user?.owner_id || user?.id), user?.role);

    // Block kasir from accessing reports
    useEffect(() => {
        if (!authLoading && user?.role === 'kasir') {
            window.location.href = '/pos';
        }
    }, [user, authLoading]);

    const [startDate, setStartDate] = useState(() => {
        const d = new Date();
        d.setDate(1);
        return d.toISOString().split('T')[0];
    });
    const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);
    const [paymentFilter, setPaymentFilter] = useState('all');
    const [filteredTxns, setFilteredTxns] = useState([]);
    const [canceledTxns, setCanceledTxns] = useState([]);
    const [transactionAction, setTransactionAction] = useState(null);
    const [transactionFeedback, setTransactionFeedback] = useState(null);
    const transactionActionLock = useRef(false);
    const [expenses, setExpenses] = useState([]);
    const [stats, setStats] = useState({ revenue: 0, grossProfit: 0, cost: 0, count: 0, expenses: 0, netProfit: 0 });
    const [showManualModal, setShowManualModal] = useState(false);
    const [showExpenseModal, setShowExpenseModal] = useState(false);
    const [newExpense, setNewExpense] = useState({ date: new Date().toISOString().split('T')[0], category: 'Gaji Karyawan', amount: '', notes: '' });
    const [manualData, setManualData] = useState({ datetime: '', notes: '', paymentMethod: 'qr', cartItems: [] });
    const [manualBusy, setManualBusy] = useState(false);
    const [manualError, setManualError] = useState('');
    const [manualLinks, setManualLinks] = useState([]);
    const [manualLinksLoading, setManualLinksLoading] = useState(false);
    const [manualLinksError, setManualLinksError] = useState(false);
    const [manualCatalog, setManualCatalog] = useState([]);
    const [manualCatalogLoading, setManualCatalogLoading] = useState(false);
    const [manualCatalogError, setManualCatalogError] = useState(false);
    const manualSubmitLock = useRef(false);
    const manualCheckout = useRef(null);
    const manualSignature = JSON.stringify(manualData);
    const manualOwnerId = user?.owner_id || user?.id;
    const manualSupplies = manualCatalogError ? supplies : manualCatalog;

    useEffect(() => {
        // A changed form is a new receipt. An unchanged retry keeps the same ID.
        if (manualCheckout.current?.signature !== manualSignature) manualCheckout.current = null;
    }, [manualSignature]);

    useEffect(() => {
        if (!showManualModal || !manualOwnerId) return;
        let active = true;
        setManualLinksLoading(true);
        setManualLinksError(false);
        setManualLinks([]);
        supabase.from('supply_menu_links').select('supply_id,product_id,quantity_per_serving')
            .eq('owner_id', manualOwnerId)
            .then(({ data, error }) => {
                if (!active) return;
                setManualLinks(error ? [] : (data || []));
                setManualLinksError(Boolean(error));
                setManualLinksLoading(false);
            }, () => {
                if (!active) return;
                setManualLinks([]);
                setManualLinksError(true);
                setManualLinksLoading(false);
            });
        return () => { active = false; };
    }, [showManualModal, manualOwnerId]);

    useEffect(() => {
        if (!showManualModal || !manualOwnerId) return;
        let active = true;
        setManualCatalogLoading(true);
        setManualCatalogError(false);
        setManualCatalog([]);
        supabase.from('supplies').select('id,name,unit,pack_size,stock,default_price')
            .eq('owner_id', manualOwnerId).order('name')
            .then(({ data, error }) => {
                if (!active) return;
                setManualCatalog(error ? [] : (data || []));
                setManualCatalogError(Boolean(error));
                setManualCatalogLoading(false);
            }, () => {
                if (!active) return;
                setManualCatalog([]);
                setManualCatalogError(true);
                setManualCatalogLoading(false);
            });
        return () => { active = false; };
    }, [showManualModal, manualOwnerId]);

    useEffect(() => {
        if (!showManualModal) return;
        const handleManualEscape = event => {
            if (event.key !== 'Escape') return;
            event.preventDefault();
            event.stopPropagation();
            if (!manualSubmitLock.current) setShowManualModal(false);
        };
        window.addEventListener('keydown', handleManualEscape, true);
        return () => window.removeEventListener('keydown', handleManualEscape, true);
    }, [showManualModal]);

    // Calculate totals from cart items
    const manualCartTotals = manualData.cartItems.reduce((acc, item) => ({
        totalSell: acc.totalSell + (item.sell_price * (Number(item.qty) || 0)),
        totalCost: acc.totalCost + (item.cost_price * (Number(item.qty) || 0)),
        totalProfit: acc.totalProfit + ((item.sell_price - item.cost_price) * (Number(item.qty) || 0))
    }), { totalSell: 0, totalCost: 0, totalProfit: 0 });

    const manualUsage = manualData.cartItems.reduce((usage, item) => {
        const qty = Number(item.qty) || 0;
        if (item.is_supply) {
            const supply = manualSupplies.find(candidate => candidate.id === item.product_id);
            const packSize = Number(item.pack_size || supply?.pack_size || 1);
            usage[item.product_id] = (usage[item.product_id] || 0) + qty * packSize;
        } else {
            manualLinks.filter(link => link.product_id === item.product_id).forEach(link => {
                usage[link.supply_id] = (usage[link.supply_id] || 0) + qty * Number(link.quantity_per_serving);
            });
        }
        return usage;
    }, {});

    const addProductToManualCart = (productId) => {
        const product = products.find(p => p.id === productId);
        if (!product) return;

        setManualData(prev => {
            const existing = prev.cartItems.find(i => !i.is_supply && i.product_id === productId);
            if (existing) {
                return {
                    ...prev,
                    cartItems: prev.cartItems.map(i =>
                        !i.is_supply && i.product_id === productId ? { ...i, qty: Number(i.qty || 0) + 1 } : i
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

    const updateManualCartQty = (itemKey, newQty) => {
        setManualData(prev => ({
            ...prev,
            cartItems: prev.cartItems.map(item => manualItemKey(item) === itemKey ? { ...item, qty: newQty } : item)
        }));
    };

    const removeFromManualCart = (itemKey) => {
        setManualData(prev => ({
            ...prev,
            cartItems: prev.cartItems.filter(item => manualItemKey(item) !== itemKey)
        }));
    };

    const addSupplyToManualCart = (supplyId) => {
        const supply = manualSupplies.find(s => s.id === supplyId);
        if (!supply) return;

        setManualData(prev => {
            const existing = prev.cartItems.find(i => i.is_supply && i.product_id === supplyId);
            if (existing) {
                return {
                    ...prev,
                    cartItems: prev.cartItems.map(i =>
                        i.is_supply && i.product_id === supplyId ? { ...i, qty: Number(i.qty || 0) + 1 } : i
                    )
                };
            }
            return {
                ...prev,
                cartItems: [...prev.cartItems, {
                    product_id: supply.id,
                    name: supply.name,
                    qty: 1,
                    sell_price: supply.default_price || 0,
                    cost_price: supply.default_price || 0,
                    is_supply: true,
                    unit: supply.unit,
                    pack_size: Number(supply.pack_size) || 1
                }]
            };
        });
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
    }, [transactions, startDate, endDate, paymentFilter, txnLoading]);

    const filterTransactions = async () => {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);

        let filtered = getTransactionsByDateRange(start, end)
            .filter(txn => !isCanceledTransaction(txn.status));
        
        if (paymentFilter !== 'all') {
            filtered = filtered.filter(txn => txn.payment_method === paymentFilter);
        }

        // Keep canceled receipts visible for audit without counting them as sales.
        const canceled = transactions.filter(txn => isCanceledTransaction(txn.status)
            && new Date(txn.datetime) >= start && new Date(txn.datetime) <= end
            && (paymentFilter === 'all' || txn.payment_method === paymentFilter));

        const expenseData = await getExpensesByDateRange(start, end);

        setFilteredTxns(filtered);
        setCanceledTxns(canceled);
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
        if (manualSubmitLock.current) return;
        if (!manualData.datetime) {
            setManualError('Mohon pilih tanggal dan waktu.');
            return;
        }
        if (manualData.cartItems.length === 0) {
            setManualError('Mohon tambahkan minimal satu menu atau bahan.');
            return;
        }
        if (manualData.cartItems.some(item => !Number.isSafeInteger(Number(item.qty)) || Number(item.qty) < 1)) {
            setManualError('Jumlah porsi atau kemasan harus bilangan bulat minimal 1.');
            return;
        }

        manualSubmitLock.current = true;
        setManualBusy(true);
        setManualError('');
        try {
            // Build items array from cart
            const items = manualData.cartItems.map(item => ({
                product_id: item.product_id,
                name: item.name,
                qty: Number(item.qty),
                sell_price: item.sell_price,
                cost_price: item.cost_price,
                total_sell: item.sell_price * Number(item.qty),
                total_cost: item.cost_price * Number(item.qty),
                profit: (item.sell_price - item.cost_price) * Number(item.qty),
                is_supply: Boolean(item.is_supply),
                ...(item.is_supply ? { unit: item.unit, pack_size: Number(item.pack_size) } : {})
            }));

            const totalQty = manualData.cartItems.reduce((sum, item) => sum + Number(item.qty), 0);
            const signature = JSON.stringify(manualData);
            if (!manualCheckout.current || manualCheckout.current.signature !== signature) {
                manualCheckout.current = {
                    signature,
                    id: `${generateTransactionId()}-${crypto.randomUUID()}`
                };
            }

            await createManualTransaction({
                datetime: new Date(manualData.datetime).toISOString(),
                total_sell: manualCartTotals.totalSell,
                total_cost: manualCartTotals.totalCost,
                count: totalQty,
                notes: manualData.notes,
                payment_method: manualData.paymentMethod,
                items
            }, manualCheckout.current.id);

            manualCheckout.current = null;
            setShowManualModal(false);
            setManualData({ datetime: '', notes: '', paymentMethod: 'qr', cartItems: [] });
            setTransactionFeedback({ type: 'success', message: 'Data lama tersimpan. Stok bahan saat ini sudah diperbarui sesuai takaran menu dan jumlah kemasan. Pastikan filter tanggal mencakup tanggal transaksi.' });
            alert('Data lama tersimpan dan stok bahan saat ini sudah diperbarui. Pastikan filter laporan mencakup tanggal transaksi.');
        } catch (error) {
            setManualError(error?.message || 'Gagal menyimpan transaksi lama. Coba lagi tanpa mengubah data agar transaksi tidak tercatat dua kali.');
        } finally {
            manualSubmitLock.current = false;
            setManualBusy(false);
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

    const handleTransactionAction = async (txn, action) => {
        if (transactionActionLock.current) return;
        transactionActionLock.current = true;
        setTransactionAction(`${action}:${txn.id}`);
        setTransactionFeedback(null);
        try {
            const completed = action === 'cancel'
                ? await voidTransaction(txn.id)
                : await deleteTransaction(txn.id);
            if (completed === false) return;
            setTransactionFeedback({
                type: 'success',
                message: action === 'cancel'
                    ? 'Transaksi dibatalkan. Stok bahan terhubung (jika ada) sudah dikembalikan.'
                    : isCanceledTransaction(txn.status)
                        ? 'Riwayat transaksi dihapus. Pengembalian stok tetap tercatat.'
                        : 'Transaksi dihapus. Stok bahan terhubung (jika ada) sudah dikembalikan.',
            });
        } catch (error) {
            setTransactionFeedback({
                type: 'error',
                message: `Gagal ${action === 'cancel' ? 'membatalkan' : 'menghapus'} transaksi: ${error?.message || 'Coba lagi.'}`,
            });
        } finally {
            transactionActionLock.current = false;
            setTransactionAction(null);
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

    const listedTxns = [...filteredTxns, ...canceledTxns]
        .sort((a, b) => new Date(b.datetime) - new Date(a.datetime));

    if (authLoading || txnLoading) {
        return (
            <div className="app-container">
                <Sidebar activePage="reports" userRole={user?.role} />
                <main className="main-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div className="animate-pulse text-muted">Memuat...</div>
                </main>
            </div>
        );
    }

    return (
        <div className="app-container">
            <Sidebar activePage="reports" userRole={user?.role} />

            <main className="main-content" style={{ minWidth: 0, maxWidth: '100%' }}>
                <header className="page-header" style={{ position: 'relative', minWidth: 0, maxWidth: '100%', flexWrap: 'wrap', gap: '8px' }}>
                    <div>
                        <h1 className="page-title">Laporan</h1>
                        <p className="text-secondary text-sm">Riwayat transaksi dan analisis</p>
                    </div>

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', minWidth: 0, maxWidth: '100%' }}>
                        <button className="btn btn-primary" style={{ minWidth: 0, whiteSpace: 'normal' }} onClick={exportCSV} disabled={filteredTxns.length === 0}>
                            📥 Export CSV
                        </button>
                        {user?.role === 'admin' && (
                            <>
                                <button className="btn btn-secondary" style={{ minWidth: 0, whiteSpace: 'normal' }} onClick={() => setShowManualModal(true)}>
                                    ➕ Input Data Lama
                                </button>
                                <button className="btn btn-secondary" style={{ minWidth: 0, whiteSpace: 'normal' }} onClick={() => setShowExpenseModal(true)}>
                                    💸 Kelola Pengeluaran
                                </button>
                            </>
                        )}
                    </div>
                </header>

                <div style={{ padding: 'var(--spacing-lg)', minWidth: 0, maxWidth: '100%' }}>
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
                                <div style={{ flex: '1 1 140px', minWidth: '140px' }}>
                                    <label className="text-sm text-secondary" style={{ display: 'block', marginBottom: '4px' }}>
                                        Jenis Pembayaran
                                    </label>
                                    <select
                                        className="input"
                                        value={paymentFilter}
                                        onChange={e => setPaymentFilter(e.target.value)}
                                        style={{ cursor: 'pointer' }}
                                    >
                                        <option value="all">Semua</option>
                                        <option value="cash">Tunai</option>
                                        <option value="qr">QRIS</option>
                                    </select>
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
                                <p className="text-xl font-bold text-success">
                                    {user?.role === 'admin' ? formatCurrency(stats.grossProfit) : '***'}
                                </p>
                            </div>
                        </div>
                        <div className="card stat-card">
                            <div className="card-body">
                                <h3 className="text-secondary text-sm">Pengeluaran (Gaji/Sewa)</h3>
                                <p className="text-xl font-bold text-warning">
                                    {user?.role === 'admin' ? formatCurrency(stats.expenses) : '***'}
                                </p>
                            </div>
                        </div>
                        <div className="card stat-card">
                            <div className="card-body">
                                <h3 className="text-secondary text-sm">Net Profit (Bersih)</h3>
                                <p className="text-xl font-bold text-primary">
                                    {user?.role === 'admin' ? formatCurrency(stats.netProfit) : '***'}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Transactions Table */}
                    <div className="card">
                        <div className="card-header">
                            <h3 style={{ fontSize: 'var(--font-size-lg)' }}>
                                Daftar Transaksi ({filteredTxns.length} aktif, {canceledTxns.length} dibatalkan)
                            </h3>
                        </div>
                        {transactionFeedback && (
                            <div
                                role={transactionFeedback.type === 'error' ? 'alert' : 'status'}
                                style={{ margin: 'var(--spacing-md)', padding: 'var(--spacing-md)', borderRadius: 'var(--radius-md)', color: transactionFeedback.type === 'error' ? 'var(--color-error)' : 'var(--color-success)', background: transactionFeedback.type === 'error' ? 'var(--color-error-bg)' : 'var(--color-success-bg)', overflowWrap: 'anywhere' }}
                            >
                                {transactionFeedback.message}
                            </div>
                        )}
                        <div className="card-body table-container" style={{ padding: 0, maxHeight: '500px', overflow: 'auto' }}>
                            <table className="table">
                                <thead style={{ position: 'sticky', top: 0, background: 'var(--color-bg-secondary)' }}>
                                    <tr>
                                        <th className="hide-mobile">ID Transaksi</th>
                                        <th>Waktu</th>
                                        <th>Items</th>
                                        <th style={{ textAlign: 'right' }}>Omzet</th>
                                        {user?.role === 'admin' && (
                                            <>
                                                <th className="hide-mobile" style={{ textAlign: 'right' }}>HPP</th>
                                                <th style={{ textAlign: 'right' }}>Profit</th>
                                            </>
                                        )}
                                        <th className="hide-mobile">Metode</th>
                                        <th>Status</th>
                                        <th style={{ textAlign: 'center' }}>Aksi</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {listedTxns.map(txn => {
                                        const items = JSON.parse(txn.items || '[]');
                                        return (
                                            <tr key={txn.id} data-testid={`transaction-row-${txn.id}`}>
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
                                                {user?.role === 'admin' && (
                                                    <>
                                                        <td className="hide-mobile" style={{ textAlign: 'right', color: 'var(--color-warning)' }}>
                                                            {formatCurrency(txn.total_cost)}
                                                        </td>
                                                        <td style={{ textAlign: 'right', color: 'var(--color-success)', fontWeight: '500' }}>
                                                            +{formatCurrency(txn.total_profit)}
                                                        </td>
                                                    </>
                                                )}
                                                <td className="hide-mobile">
                                                    <span className={`badge ${txn.payment_method === 'cash' ? 'badge-primary' : 'badge-info'}`} style={{ 
                                                        backgroundColor: txn.payment_method === 'cash' ? 'rgba(76, 175, 80, 0.1)' : 'rgba(33, 150, 243, 0.1)',
                                                        color: txn.payment_method === 'cash' ? '#4caf50' : '#2196f3',
                                                        border: `1px solid ${txn.payment_method === 'cash' ? '#4caf50' : '#2196f3'}`,
                                                        padding: '4px 8px',
                                                        borderRadius: '4px'
                                                    }}>
                                                        {txn.payment_method === 'cash' ? 'Tunai' : 'QRIS'}
                                                    </span>
                                                </td>
                                                <td>
                                                    <span className={`badge ${isCanceledTransaction(txn.status) ? 'badge-neutral' : 'badge-success'}`}>
                                                        {isCanceledTransaction(txn.status) ? 'Dibatalkan' : txn.status === 'completed' ? 'Selesai' : txn.status}
                                                    </span>
                                                </td>
                                                <td style={{ textAlign: 'center' }}>
                                                    {user?.role === 'admin' && (
                                                        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '4px', minWidth: '130px' }}>
                                                            {txn.status === 'completed' && (
                                                                <button
                                                                    type="button"
                                                                    className="btn btn-ghost btn-sm"
                                                                    style={{ minHeight: '44px', color: 'var(--color-warning)' }}
                                                                    onClick={() => handleTransactionAction(txn, 'cancel')}
                                                                    disabled={Boolean(transactionAction)}
                                                                    aria-label={`Batalkan transaksi ${txn.id}`}
                                                                >
                                                                    {transactionAction === `cancel:${txn.id}` ? 'Membatalkan…' : 'Batalkan'}
                                                                </button>
                                                            )}
                                                            <button
                                                                type="button"
                                                                className="btn btn-ghost btn-sm"
                                                                style={{ minHeight: '44px', color: 'var(--color-error)' }}
                                                                onClick={() => handleTransactionAction(txn, 'delete')}
                                                                disabled={Boolean(transactionAction)}
                                                                aria-label={`Hapus transaksi ${txn.id}`}
                                                            >
                                                                {transactionAction === `delete:${txn.id}` ? 'Menghapus…' : 'Hapus'}
                                                            </button>
                                                        </div>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                    {listedTxns.length === 0 && (
                                        <tr>
                                            <td colSpan={user?.role === 'admin' ? 9 : 7} style={{ textAlign: 'center', padding: 'var(--spacing-xl)', color: 'var(--color-text-muted)' }}>
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
                <div className="modal-overlay" onClick={() => { if (!manualSubmitLock.current) setShowManualModal(false); }}>
                    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="manual-transaction-title" aria-busy={manualBusy} style={{ maxWidth: '700px', width: 'min(95%, 700px)', minWidth: 0 }} onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3 id="manual-transaction-title">Input Data Transaksi Lama</h3>
                            <button type="button" className="btn btn-ghost btn-icon" aria-label="Tutup input data lama" disabled={manualBusy} onClick={() => setShowManualModal(false)}>✕</button>
                        </div>
                        <form onSubmit={handleManualSubmit}>
                            <fieldset disabled={manualBusy} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
                            <div className="modal-body" style={{ maxHeight: 'min(65vh, calc(100dvh - 150px))', overflowY: 'auto', minWidth: 0 }}>
                                <div className="alert alert-info mb-md" style={{ fontSize: '13px', background: 'var(--color-info-bg)', color: 'var(--color-info)', padding: '10px', borderRadius: '6px' }}>
                                    Cukup pilih menu untuk mengurangi stok bahan terhubung sesuai takaran tersimpan. Pilih bahan langsung hanya untuk pemakaian lain, agar bahan yang sama tidak terpotong dua kali. Jumlah bahan langsung dihitung per kemasan. Jangan input ulang transaksi yang sudah dicatat melalui POS.
                                    <div style={{ marginTop: '8px' }}>Batal di formulir ini hanya menutup input yang belum disimpan; stok tidak berubah. Jika transaksi tersimpan dibatalkan atau dihapus dari laporan, bahan yang terpotong dikembalikan satu kali.</div>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '16px' }}>
                                    <div>
                                        <label htmlFor="manual-datetime" className="text-sm text-secondary" style={{ display: 'block', marginBottom: '4px' }}>Tanggal & Waktu *</label>
                                        <input
                                            id="manual-datetime"
                                            type="datetime-local"
                                            className="input"
                                            required
                                            value={manualData.datetime}
                                            onChange={e => setManualData({ ...manualData, datetime: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label htmlFor="manual-notes" className="text-sm text-secondary" style={{ display: 'block', marginBottom: '4px' }}>Catatan</label>
                                        <input
                                            id="manual-notes"
                                            type="text"
                                            className="input"
                                            placeholder="Contoh: Rekap Januari"
                                            value={manualData.notes}
                                            onChange={e => setManualData({ ...manualData, notes: e.target.value })}
                                        />
                                    </div>
                                </div>
                                
                                <div style={{ marginBottom: '16px', background: 'var(--color-bg-secondary)', padding: '12px', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
                                    <label className="text-sm text-secondary" style={{ display: 'block', marginBottom: '8px' }}>Jenis Pembayaran *</label>
                                    <div style={{ display: 'flex', gap: '16px' }}>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', flex: 1 }}>
                                            <input
                                                type="radio"
                                                name="paymentMethod"
                                                value="cash"
                                                checked={manualData.paymentMethod === 'cash'}
                                                onChange={e => setManualData({ ...manualData, paymentMethod: e.target.value })}
                                                style={{ transform: 'scale(1.2)' }}
                                            />
                                            <span style={{ fontWeight: '500' }}>Tunai (Cash)</span>
                                        </label>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', flex: 1 }}>
                                            <input
                                                type="radio"
                                                name="paymentMethod"
                                                value="qr"
                                                checked={manualData.paymentMethod === 'qr'}
                                                onChange={e => setManualData({ ...manualData, paymentMethod: e.target.value })}
                                                style={{ transform: 'scale(1.2)' }}
                                            />
                                            <span style={{ fontWeight: '500' }}>QRIS</span>
                                        </label>
                                    </div>
                                </div>

                                {/* Product Grid */}
                                <div style={{ marginBottom: '16px' }}>
                                    <div className="text-sm text-secondary" style={{ marginBottom: '8px' }}>Pilih menu (klik untuk tambah porsi)</div>
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
                                                aria-label={`Tambah menu ${p.name}`}
                                                aria-pressed={manualData.cartItems.some(i => !i.is_supply && i.product_id === p.id)}
                                                style={{
                                                    padding: '10px 8px', minHeight: '44px', overflowWrap: 'anywhere',
                                                    background: manualData.cartItems.some(i => !i.is_supply && i.product_id === p.id)
                                                        ? 'var(--color-accent)'
                                                        : 'var(--color-bg-tertiary)',
                                                    color: manualData.cartItems.some(i => !i.is_supply && i.product_id === p.id)
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

                                {/* Supplies (Non-Menu Items) Grid */}
                                {manualCatalogLoading && <div className="text-sm text-secondary" style={{ marginBottom: '12px' }}>Memuat stok bahan terbaru...</div>}
                                {manualCatalogError && <div role="status" style={{ marginBottom: '12px', color: 'var(--color-warning)', overflowWrap: 'anywhere' }}>Daftar bahan terbaru tidak tersedia; pilihan lama ditampilkan. Ukuran kemasan atau stok mungkin sudah berubah. Pemeriksaan akhir dilakukan saat menyimpan.</div>}
                                {manualSupplies.length > 0 && !manualCatalogLoading && (
                                    <div style={{ marginBottom: '16px' }}>
                                        <div className="text-sm text-secondary" style={{ marginBottom: '8px' }}>Tambah bahan langsung (klik untuk tambah kemasan)</div>
                                        <div style={{
                                            display: 'grid',
                                            gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
                                            gap: '8px',
                                            maxHeight: '150px',
                                            overflowY: 'auto',
                                            padding: '8px',
                                            background: 'var(--color-bg-secondary)',
                                            borderRadius: '8px'
                                        }}>
                                            {manualSupplies.map(s => (
                                                <button
                                                    type="button"
                                                    key={s.id}
                                                    onClick={() => addSupplyToManualCart(s.id)}
                                                    aria-label={`Tambah bahan ${s.name}`}
                                                    aria-pressed={manualData.cartItems.some(i => i.is_supply && i.product_id === s.id)}
                                                    style={{
                                                        padding: '10px 8px', minHeight: '44px', overflowWrap: 'anywhere',
                                                        background: manualData.cartItems.some(i => i.is_supply && i.product_id === s.id)
                                                            ? 'var(--color-warning)'
                                                            : 'var(--color-bg-tertiary)',
                                                        color: manualData.cartItems.some(i => i.is_supply && i.product_id === s.id)
                                                            ? '#000'
                                                            : 'inherit',
                                                        border: 'none',
                                                        borderRadius: '6px',
                                                        cursor: 'pointer',
                                                        fontSize: '12px',
                                                        textAlign: 'center'
                                                    }}
                                                >
                                                    <div style={{ fontWeight: '500', marginBottom: '2px' }}>📦 {s.name}</div>
                                                    <div style={{ fontSize: '10px', opacity: 0.8 }}>1 kemasan = {formatSupplyAmount(Number(s.pack_size) || 1)} {s.unit} · {formatCurrency(s.default_price || 0)}</div>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Cart Items */}
                                {manualData.cartItems.length > 0 && (
                                    <div style={{ marginBottom: '16px' }}>
                                        <div className="text-sm text-secondary" style={{ marginBottom: '8px' }}>Dipilih ({manualData.cartItems.length})</div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                            {manualData.cartItems.map(item => (
                                                <div key={manualItemKey(item)} style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'space-between',
                                                    flexWrap: 'wrap', gap: '10px', minWidth: 0,
                                                    padding: '10px 12px',
                                                    background: 'var(--color-bg-tertiary)',
                                                    borderRadius: '8px'
                                                }}>
                                                    <div style={{ flex: '1 1 150px', minWidth: 0, overflowWrap: 'anywhere' }}>
                                                        <div style={{ fontWeight: '500' }}>{item.is_supply ? '📦 ' : ''}{item.name}</div>
                                                        <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                                                            {item.is_supply && `1 kemasan = ${formatSupplyAmount(Number(item.pack_size) || 1)} ${item.unit} · `}{formatCurrency(item.sell_price)} × {item.qty || 0} = {formatCurrency(item.sell_price * (Number(item.qty) || 0))}
                                                        </div>
                                                        {!item.is_supply && !manualLinksLoading && !manualLinksError && (manualLinks.some(link => link.product_id === item.product_id)
                                                            ? <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                                                                {manualLinks.filter(link => link.product_id === item.product_id).map(link => {
                                                                    const supply = manualSupplies.find(candidate => candidate.id === link.supply_id);
                                                                    return `${supply?.name || 'Bahan'}: ${formatSupplyAmount(Number(link.quantity_per_serving))} ${supply?.unit || 'unit'} / porsi`;
                                                                }).join(' · ')}
                                                            </div>
                                                            : <div style={{ fontSize: '12px', color: 'var(--color-warning)' }}>Belum ada bahan terhubung; menu ini tidak mengurangi stok bahan.</div>)}
                                                    </div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
                                                        <button type="button" className="btn btn-ghost btn-sm" style={{ minWidth: '44px', minHeight: '44px' }} aria-label={`Kurangi ${item.is_supply ? 'kemasan' : 'porsi'} ${item.name}`} onClick={() => Number(item.qty) <= 1 ? removeFromManualCart(manualItemKey(item)) : updateManualCartQty(manualItemKey(item), Number(item.qty) - 1)}>−</button>
                                                        <input type="number" className="input input-sm" inputMode="numeric" min="1" step="1" required style={{ width: '72px', minHeight: '44px', textAlign: 'center', padding: '4px' }} aria-label={`Jumlah ${item.is_supply ? 'kemasan' : 'porsi'} ${item.name}`} value={item.qty} onChange={event => updateManualCartQty(manualItemKey(item), event.target.value)} />
                                                        <button type="button" className="btn btn-ghost btn-sm" style={{ minWidth: '44px', minHeight: '44px' }} aria-label={`Tambah ${item.is_supply ? 'kemasan' : 'porsi'} ${item.name}`} onClick={() => updateManualCartQty(manualItemKey(item), Number(item.qty || 0) + 1)}>+</button>
                                                        <button type="button" className="btn btn-ghost btn-sm" style={{ color: 'var(--color-error)', minWidth: '44px', minHeight: '44px' }} aria-label={`Hapus ${item.is_supply ? 'bahan' : 'menu'} ${item.name}`} onClick={() => removeFromManualCart(manualItemKey(item))}>✕</button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {manualData.cartItems.length > 0 && (
                                    <section role="region" aria-label="Perkiraan pemakaian bahan" style={{ marginBottom: '16px', padding: '12px', border: '1px solid var(--color-border)', borderRadius: '8px', background: 'var(--color-bg-secondary)', overflowWrap: 'anywhere' }}>
                                        <div style={{ fontWeight: 600, marginBottom: '4px' }}>Perkiraan pemakaian bahan</div>
                                        <p className="text-sm text-secondary" style={{ margin: '0 0 8px' }}>Takaran menu adalah jumlah nominal tersimpan. Jumlah bahan langsung dihitung dalam kemasan. Stok terakhir dimuat saat membuka formulir; stok aktual diperiksa lagi saat menyimpan.</p>
                                        {(manualLinksLoading || manualCatalogLoading) ? <div className="text-sm text-secondary">Memuat takaran dan stok bahan...</div> : null}
                                        {manualLinksError ? <div className="text-sm text-secondary">Pratinjau takaran menu belum tersedia. Pemeriksaan stok tetap dilakukan saat menyimpan.</div> : null}
                                        {manualCatalogError ? <div className="text-sm text-secondary">Pratinjau stok tidak tersedia karena daftar bahan terbaru gagal dimuat. Stok aktual diperiksa saat menyimpan.</div> : null}
                                        {!manualLinksLoading && !manualCatalogLoading && !manualLinksError && !manualCatalogError && Object.keys(manualUsage).length === 0 && (
                                            <div className="text-sm text-secondary">Belum ada bahan terhubung untuk menu yang dipilih.</div>
                                        )}
                                        {!manualLinksLoading && !manualCatalogLoading && !manualLinksError && !manualCatalogError && Object.entries(manualUsage).map(([supplyId, amount]) => {
                                            const supply = manualSupplies.find(candidate => candidate.id === supplyId);
                                            const roundedAmount = Math.round(amount * 1000000) / 1000000;
                                            const available = Number(supply?.stock);
                                            const shortStock = supply && Number.isFinite(available) && roundedAmount > available + 0.000001;
                                            return <div key={supplyId} style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: '4px 12px', padding: '5px 0' }}>
                                                <span>{supply?.name || 'Bahan'}: <strong>{formatSupplyAmount(roundedAmount)} {supply?.unit || ''}</strong></span>
                                                {supply && <span className="text-sm text-secondary">Stok terakhir: {formatSupplyAmount(available)} {supply.unit}</span>}
                                                {shortStock && <span role="alert" style={{ flexBasis: '100%', color: 'var(--color-error)' }}>Stok {supply.name} tidak cukup untuk jumlah ini. Kurangi jumlah atau tambah stok sebelum menyimpan.</span>}
                                            </div>;
                                        })}
                                    </section>
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
                                {manualError && <div role="alert" style={{ marginTop: '12px', padding: '10px', borderRadius: '6px', background: 'var(--color-error-bg)', color: 'var(--color-error)', overflowWrap: 'anywhere' }}>{manualError}</div>}
                            </div>
                            <div className="modal-footer" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                <button type="button" className="btn btn-ghost" style={{ minHeight: '44px' }} onClick={() => setShowManualModal(false)}>Batal</button>
                                <button type="submit" className="btn btn-primary" style={{ minHeight: '44px' }}>{manualBusy ? 'Menyimpan...' : 'Simpan Data Lama'}</button>
                            </div>
                            </fieldset>
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


export const getServerSideProps = async () => { return { props: {} }; };
