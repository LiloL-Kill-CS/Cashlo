import { useEffect, useState } from 'react';
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    BarElement,
    ArcElement,
    Title,
    Tooltip,
    Legend,
    Filler
} from 'chart.js';
import { Line, Bar, Doughnut } from 'react-chartjs-2';
import Sidebar from '@/components/layout/Sidebar';
import { useAuth } from '@/hooks/useAuth';
import { useTransactions } from '@/hooks/useTransactions';
import { useInventory } from '@/hooks/useInventory';
import { useExpenses } from '@/hooks/useExpenses';
import { formatCurrency } from '@/lib/db';

// Register Chart.js components
ChartJS.register(
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    BarElement,
    ArcElement,
    Title,
    Tooltip,
    Legend,
    Filler
);

export default function DashboardPage() {
    const { user, loading: authLoading } = useAuth();
    const { transactions, loading: txnLoading, getTransactionsByDateRange, getTopProducts, getTodayStats } = useTransactions(user?.id, user?.role);
    const { getExpensesByDateRange } = useExpenses(user?.id);
    const [period, setPeriod] = useState('today');
    const [stats, setStats] = useState({ revenue: 0, profit: 0, count: 0, expenses: 0, netProfit: 0 });
    const [topProducts, setTopProducts] = useState([]);
    const [chartData, setChartData] = useState({ labels: [], revenue: [], profit: [] });
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

    // Inventory for low stock alerts
    const { stocks } = useInventory(user?.id, user?.role);
    const lowStockItems = stocks.filter(s => s.quantity <= s.min_stock_level);

    useEffect(() => {
        if (!authLoading && !user) {
            window.location.href = '/';
        }
    }, [user, authLoading]);

    useEffect(() => {
        if (!txnLoading) {
            calculateStats();
        }
        if (!txnLoading) {
            calculateStats();
        }
    }, [transactions, period, selectedYear, txnLoading]);

    const calculateStats = async () => {
        const now = new Date();
        let startDate, endDate;

        switch (period) {
            case 'today':
                startDate = new Date(now.setHours(0, 0, 0, 0));
                endDate = new Date(startDate);
                endDate.setDate(endDate.getDate() + 1);
                break;
            case 'week':
                startDate = new Date(now);
                startDate.setDate(startDate.getDate() - 7);
                endDate = new Date();
                break;
            case 'month':
                startDate = new Date(now.getFullYear(), now.getMonth(), 1);
                endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
                break;
            case 'year':
                startDate = new Date(selectedYear, 0, 1);
                endDate = new Date(selectedYear, 11, 31);
                break;
            default:
                startDate = new Date(now.setHours(0, 0, 0, 0));
                endDate = new Date();
        }

        const periodTxns = getTransactionsByDateRange(startDate, endDate);
        const periodExpenses = await getExpensesByDateRange(startDate, endDate);

        const totalRevenue = periodTxns.reduce((sum, t) => sum + t.subtotal, 0);
        const totalGrossProfit = periodTxns.reduce((sum, t) => sum + t.total_profit, 0);
        const totalExpenses = periodExpenses.reduce((sum, e) => sum + parseFloat(e.amount), 0);
        const totalNetProfit = totalGrossProfit - totalExpenses;

        setStats({
            revenue: totalRevenue,
            profit: totalGrossProfit, // Kept as gross for chart consistency or update chart too
            expenses: totalExpenses,
            netProfit: totalNetProfit,
            count: periodTxns.reduce((sum, t) => sum + (t.manual_txn_count || 1), 0)
        });

        setTopProducts(getTopProducts(startDate, endDate, 5));

        // Generate chart data
        generateChartData(startDate, endDate, period);
    };

    const generateChartData = (startDate, endDate, period) => {
        const labels = [];
        const revenueData = [];
        const profitData = [];

        if (period === 'today') {
            // Hourly data for today
            for (let h = 6; h <= 22; h++) {
                labels.push(`${h}:00`);
                const hourStart = new Date(startDate);
                hourStart.setHours(h, 0, 0, 0);
                const hourEnd = new Date(startDate);
                hourEnd.setHours(h + 1, 0, 0, 0);

                const hourTxns = getTransactionsByDateRange(hourStart, hourEnd);
                revenueData.push(hourTxns.reduce((sum, t) => sum + t.subtotal, 0));
                profitData.push(hourTxns.reduce((sum, t) => sum + t.total_profit, 0));
            }
        } else if (period === 'week') {
            // Daily data for week
            const days = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
            for (let d = 6; d >= 0; d--) {
                const dayStart = new Date();
                dayStart.setDate(dayStart.getDate() - d);
                dayStart.setHours(0, 0, 0, 0);
                const dayEnd = new Date(dayStart);
                dayEnd.setDate(dayEnd.getDate() + 1);

                labels.push(days[dayStart.getDay()]);
                const dayTxns = getTransactionsByDateRange(dayStart, dayEnd);
                revenueData.push(dayTxns.reduce((sum, t) => sum + t.subtotal, 0));
                profitData.push(dayTxns.reduce((sum, t) => sum + t.total_profit, 0));
            }
        } else if (period === 'month') {
            // Weekly data for month
            const weeksInMonth = 4;
            for (let w = 0; w < weeksInMonth; w++) {
                labels.push(`Minggu ${w + 1}`);
                const weekStart = new Date(startDate);
                weekStart.setDate(weekStart.getDate() + (w * 7));
                const weekEnd = new Date(weekStart);
                weekEnd.setDate(weekEnd.getDate() + 7);

                const weekTxns = getTransactionsByDateRange(weekStart, weekEnd);
                revenueData.push(weekTxns.reduce((sum, t) => sum + t.subtotal, 0));
                profitData.push(weekTxns.reduce((sum, t) => sum + t.total_profit, 0));
            }
        } else {
            // Monthly data for year
            const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
            for (let m = 0; m < 12; m++) {
                labels.push(months[m]);
                const monthStart = new Date(startDate.getFullYear(), m, 1);
                const monthEnd = new Date(startDate.getFullYear(), m + 1, 0);

                const monthTxns = getTransactionsByDateRange(monthStart, monthEnd);
                revenueData.push(monthTxns.reduce((sum, t) => sum + t.subtotal, 0));
                profitData.push(monthTxns.reduce((sum, t) => sum + t.total_profit, 0));
            }
        }

        setChartData({ labels, revenue: revenueData, profit: profitData });
    };

    if (authLoading || txnLoading) {
        return (
            <div className="app-container">
                <Sidebar activePage="dashboard" />
                <main className="main-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div className="animate-pulse text-muted">Memuat...</div>
                </main>
            </div>
        );
    }

    const lineChartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                position: 'top',
                labels: { color: '#B3B3B3', font: { family: 'Inter' } }
            }
        },
        scales: {
            x: {
                grid: { color: '#2A2A2A' },
                ticks: { color: '#666666' }
            },
            y: {
                grid: { color: '#2A2A2A' },
                ticks: {
                    color: '#666666',
                    callback: (value) => formatCurrency(value)
                }
            }
        }
    };

    const lineChartData = {
        labels: chartData.labels,
        datasets: [
            {
                label: 'Omzet',
                data: chartData.revenue,
                borderColor: '#FFFFFF',
                backgroundColor: 'rgba(255, 255, 255, 0.1)',
                fill: true,
                tension: 0.4
            },
            {
                label: 'Keuntungan',
                data: chartData.profit,
                borderColor: '#22C55E',
                backgroundColor: 'rgba(34, 197, 94, 0.1)',
                fill: true,
                tension: 0.4
            }
        ]
    };

    const barChartData = {
        labels: topProducts.map(p => p.name),
        datasets: [
            {
                label: 'Terjual',
                data: topProducts.map(p => p.qty),
                backgroundColor: '#FFFFFF'
            }
        ]
    };

    const barChartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: 'y',
        plugins: {
            legend: { display: false }
        },
        scales: {
            x: {
                grid: { color: '#2A2A2A' },
                ticks: { color: '#666666' }
            },
            y: {
                grid: { display: false },
                ticks: { color: '#B3B3B3' }
            }
        }
    };

    return (
        <div className="app-container">
            <Sidebar activePage="dashboard" />

            <main className="main-content">
                <header className="page-header">
                    <div>
                        <h1 className="page-title">Dashboard</h1>
                        <p className="text-secondary text-sm">Ringkasan performa bisnis</p>
                    </div>

                    {/* Period Filter */}
                    <div className="period-filter" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        {period === 'year' && (
                            <select
                                className="input input-sm"
                                style={{ width: 'auto', marginRight: '8px' }}
                                value={selectedYear}
                                onChange={e => setSelectedYear(parseInt(e.target.value))}
                            >
                                {[0, 1, 2, 3, 4].map(OFFSET => {
                                    const y = new Date().getFullYear() - OFFSET;
                                    return <option key={y} value={y}>{y}</option>;
                                })}
                            </select>
                        )}
                        {[
                            { key: 'today', label: 'Hari Ini' },
                            { key: 'week', label: '7 Hari' },
                            { key: 'month', label: 'Bulan Ini' },
                            { key: 'year', label: 'Tahunan' }
                        ].map(p => (
                            <button
                                key={p.key}
                                className={`btn ${period === p.key ? 'btn-primary' : 'btn-secondary'} btn-sm`}
                                onClick={() => setPeriod(p.key)}
                            >
                                {p.label}
                            </button>
                        ))}
                    </div>
                </header>

                <div style={{ padding: 'var(--spacing-lg)' }}>
                    {/* Stats Grid */}
                    <div className="stats-grid" style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
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
                                <p className="text-xl font-bold text-success">{formatCurrency(stats.profit)}</p>
                            </div>
                        </div>
                        <div className="card stat-card">
                            <div className="card-body">
                                <h3 className="text-secondary text-sm">Pengeluaran</h3>
                                <p className="text-xl font-bold text-warning">{formatCurrency(stats.expenses)}</p>
                            </div>
                        </div>
                        <div className="card stat-card">
                            <div className="card-body">
                                <h3 className="text-secondary text-sm">Net Worth (Bersih)</h3>
                                <p className="text-xl font-bold" style={{ color: stats.netProfit >= 0 ? 'var(--color-primary)' : 'var(--color-error)' }}>
                                    {formatCurrency(stats.netProfit)}
                                </p>
                            </div>
                        </div>
                        <div className="card stat-card">
                            <div className="card-body">
                                <h3 className="text-secondary text-sm">Transaksi</h3>
                                <p className="text-xl font-bold">{stats.count}</p>
                            </div>
                        </div>
                    </div>{/* Charts Row */}
                    <div className="charts-grid" style={{
                        display: 'grid',
                        gridTemplateColumns: '2fr 1fr',
                        gap: 'var(--spacing-md)',
                        marginBottom: 'var(--spacing-lg)'
                    }}>
                        {/* Line Chart */}
                        <div className="card">
                            <div className="card-header">
                                <h3 style={{ fontSize: 'var(--font-size-lg)' }}>Trend Penjualan</h3>
                            </div>
                            <div className="card-body" style={{ height: '250px' }}>
                                <Line data={lineChartData} options={lineChartOptions} />
                            </div>
                        </div>

                        {/* Top Products */}
                        <div className="card">
                            <div className="card-header">
                                <h3 style={{ fontSize: 'var(--font-size-lg)' }}>Produk Terlaris</h3>
                            </div>
                            <div className="card-body" style={{ height: '250px' }}>
                                {topProducts.length > 0 ? (
                                    <Bar data={barChartData} options={barChartOptions} />
                                ) : (
                                    <div style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        height: '100%',
                                        color: 'var(--color-text-muted)'
                                    }}>
                                        Belum ada data
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Low Stock Alert */}
                    {lowStockItems.length > 0 && (
                        <div className="card" style={{ border: '1px solid var(--color-error)', marginBottom: 'var(--spacing-lg)' }}>
                            <div className="card-header" style={{ background: 'var(--color-error-bg)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <h3 style={{ fontSize: 'var(--font-size-lg)', color: 'var(--color-error)' }}>⚠️ Stok Rendah</h3>
                                <a href="/inventory" className="btn btn-sm btn-outline">Kelola Stok</a>
                            </div>
                            <div className="card-body" style={{ padding: 0 }}>
                                <table className="table">
                                    <thead>
                                        <tr>
                                            <th>Produk</th>
                                            <th>Stok</th>
                                            <th>Min</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {lowStockItems.slice(0, 5).map(item => (
                                            <tr key={item.id}>
                                                <td style={{ fontWeight: '500' }}>{item.name}</td>
                                                <td><span className="badge badge-error">{item.quantity}</span></td>
                                                <td className="text-secondary">{item.min_stock_level}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* Recent Transactions */}
                    <div className="card">
                        <div className="card-header">
                            <h3 style={{ fontSize: 'var(--font-size-lg)' }}>Transaksi Terbaru</h3>
                        </div>
                        <div className="card-body table-container" style={{ padding: 0 }}>
                            <table className="table">
                                <thead>
                                    <tr>
                                        <th className="hide-mobile">ID</th>
                                        <th>Waktu</th>
                                        <th className="hide-mobile">Items</th>
                                        <th style={{ textAlign: 'right' }}>Total</th>
                                        <th style={{ textAlign: 'right' }}>Profit</th>
                                        <th className="hide-mobile">Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {transactions.slice(0, 5).map(txn => {
                                        const items = JSON.parse(txn.items || '[]');
                                        return (
                                            <tr key={txn.id}>
                                                <td className="hide-mobile" style={{ fontFamily: 'monospace', fontSize: '12px' }}>{txn.id}</td>
                                                <td className="text-secondary">
                                                    {new Date(txn.datetime).toLocaleString('id-ID', {
                                                        hour: '2-digit',
                                                        minute: '2-digit',
                                                        day: '2-digit',
                                                        month: 'short'
                                                    })}
                                                </td>
                                                <td className="hide-mobile">{items.length} item</td>
                                                <td style={{ textAlign: 'right', fontWeight: '600' }}>
                                                    {formatCurrency(txn.subtotal)}
                                                </td>
                                                <td style={{ textAlign: 'right', color: 'var(--color-success)' }}>
                                                    +{formatCurrency(txn.total_profit)}
                                                </td>
                                                <td className="hide-mobile">
                                                    <span className={`badge ${txn.status === 'completed' ? 'badge-success' : 'badge-error'}`}>
                                                        {txn.status === 'completed' ? 'Selesai' : 'Void'}
                                                    </span>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                    {transactions.length === 0 && (
                                        <tr>
                                            <td colSpan="6" style={{ textAlign: 'center', padding: 'var(--spacing-xl)', color: 'var(--color-text-muted)' }}>
                                                Belum ada transaksi
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}
