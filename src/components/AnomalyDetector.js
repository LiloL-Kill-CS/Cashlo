/**
 * PALANTIR-STYLE: Anomaly Detection Engine
 * Automatically detects unusual patterns in business data.
 * Inspired by Palantir's AI-driven anomaly detection.
 */
import { useState, useEffect } from 'react';
import { formatCurrency } from '@/lib/db';

// Anomaly severity levels
const SEVERITY = {
    critical: { color: '#ef4444', bg: '#ef444420', label: 'KRITIS' },
    warning: { color: '#f59e0b', bg: '#f59e0b20', label: 'PERINGATAN' },
    info: { color: '#3b82f6', bg: '#3b82f620', label: 'INFO' }
};

export default function AnomalyDetector({
    transactions = [],
    stocks = [],
    expenses = []
}) {
    const [anomalies, setAnomalies] = useState([]);
    const [isScanning, setIsScanning] = useState(false);

    useEffect(() => {
        detectAnomalies();
    }, [transactions, stocks, expenses]);

    const detectAnomalies = () => {
        setIsScanning(true);
        const detected = [];

        // ═══════════════════════════════════════
        // RULE 1: Unusual Transaction Amount
        // ═══════════════════════════════════════
        if (transactions.length > 5) {
            const amounts = transactions.map(t => t.subtotal);
            const avg = amounts.reduce((a, b) => a + b, 0) / amounts.length;
            const stdDev = Math.sqrt(
                amounts.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / amounts.length
            );

            transactions.slice(0, 10).forEach(txn => {
                if (txn.subtotal > avg + (stdDev * 2.5)) {
                    detected.push({
                        id: `highvalue-${txn.id}`,
                        type: 'high_value_transaction',
                        severity: 'warning',
                        title: 'Transaksi Nilai Tinggi Tidak Biasa',
                        description: `${formatCurrency(txn.subtotal)} adalah ${((txn.subtotal / avg - 1) * 100).toFixed(0)}% lebih tinggi dari rata-rata`,
                        recommendation: 'Periksa apakah ini pembelian bulk atau potensi error input.',
                        timestamp: new Date(txn.datetime)
                    });
                }
            });
        }

        // ═══════════════════════════════════════
        // RULE 2: Sudden Void Spike
        // ═══════════════════════════════════════
        const recentVoids = transactions.filter(t =>
            t.status === 'void' &&
            new Date(t.datetime) > new Date(Date.now() - 24 * 60 * 60 * 1000)
        );
        if (recentVoids.length >= 3) {
            detected.push({
                id: 'void-spike',
                type: 'void_spike',
                severity: 'critical',
                title: '🚨 Lonjakan Void Mencurigakan',
                description: `${recentVoids.length} transaksi di-void dalam 24 jam terakhir`,
                recommendation: 'Investigasi kemungkinan fraud atau masalah operasional.',
                timestamp: new Date()
            });
        }

        // ═══════════════════════════════════════
        // RULE 3: Critical Stock Level
        // ═══════════════════════════════════════
        const criticalStock = stocks.filter(s => s.quantity <= 0);
        const lowStock = stocks.filter(s => s.quantity > 0 && s.quantity <= s.min_stock_level);

        if (criticalStock.length > 0) {
            detected.push({
                id: 'stockout',
                type: 'stockout',
                severity: 'critical',
                title: '📛 STOCKOUT DETECTED',
                description: `${criticalStock.length} item sudah habis: ${criticalStock.map(s => s.name).join(', ')}`,
                recommendation: 'Segera restock untuk menghindari kehilangan penjualan.',
                timestamp: new Date()
            });
        }

        if (lowStock.length >= 5) {
            detected.push({
                id: 'low-stock-multiple',
                type: 'low_stock_mass',
                severity: 'warning',
                title: '⚠️ Multiple Low Stock Alert',
                description: `${lowStock.length} item mendekati batas minimum stok`,
                recommendation: 'Pertimbangkan bulk order ke supplier.',
                timestamp: new Date()
            });
        }

        // ═══════════════════════════════════════
        // RULE 4: Expense Pattern Anomaly
        // ═══════════════════════════════════════
        if (expenses.length > 3) {
            const expenseAmounts = expenses.map(e => parseFloat(e.amount));
            const avgExpense = expenseAmounts.reduce((a, b) => a + b, 0) / expenseAmounts.length;

            expenses.slice(0, 5).forEach(exp => {
                if (parseFloat(exp.amount) > avgExpense * 3) {
                    detected.push({
                        id: `expense-anomaly-${exp.id}`,
                        type: 'expense_spike',
                        severity: 'info',
                        title: 'Pengeluaran Besar Tidak Biasa',
                        description: `${formatCurrency(exp.amount)} untuk "${exp.description || 'Tidak ada deskripsi'}"`,
                        recommendation: 'Verifikasi apakah ini pengeluaran yang direncanakan.',
                        timestamp: new Date(exp.date)
                    });
                }
            });
        }

        // ═══════════════════════════════════════
        // RULE 5: Sales Velocity Drop
        // ═══════════════════════════════════════
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        const dayBefore = new Date(yesterday);
        dayBefore.setDate(dayBefore.getDate() - 1);

        const todaySales = transactions.filter(t => new Date(t.datetime) >= today).length;
        const yesterdaySales = transactions.filter(t => {
            const d = new Date(t.datetime);
            return d >= yesterday && d < today;
        }).length;

        if (yesterdaySales > 10 && todaySales < yesterdaySales * 0.3) {
            detected.push({
                id: 'sales-drop',
                type: 'sales_velocity_drop',
                severity: 'warning',
                title: '📉 Penurunan Penjualan Drastis',
                description: `Penjualan hari ini (${todaySales}) turun ${((1 - todaySales / yesterdaySales) * 100).toFixed(0)}% dari kemarin (${yesterdaySales})`,
                recommendation: 'Cek apakah ada masalah operasional atau kompetitor promo.',
                timestamp: new Date()
            });
        }

        // Sort by severity
        const severityOrder = { critical: 0, warning: 1, info: 2 };
        detected.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

        setAnomalies(detected);
        setIsScanning(false);
    };

    if (anomalies.length === 0) {
        return (
            <div className="card" style={{
                background: 'linear-gradient(135deg, #10b98120, #10b98110)',
                border: '1px solid #10b98140'
            }}>
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--spacing-md)',
                    padding: 'var(--spacing-lg)'
                }}>
                    <div style={{ fontSize: '40px' }}>✅</div>
                    <div>
                        <div className="font-bold text-lg" style={{ color: '#10b981' }}>
                            Semua Normal
                        </div>
                        <div className="text-sm text-secondary">
                            Tidak ada anomali terdeteksi. Sistem berjalan optimal.
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="card">
            <header className="card-header mb-md">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <h3 className="text-lg font-bold flex items-center gap-sm">
                            🔍 Anomaly Detection Engine
                            <span className="badge badge-error">{anomalies.length}</span>
                        </h3>
                        <p className="text-xs text-secondary">
                            AI-powered pattern analysis (Palantir-style)
                        </p>
                    </div>
                    <button
                        className="btn btn-ghost btn-sm"
                        onClick={detectAnomalies}
                        disabled={isScanning}
                    >
                        {isScanning ? '⏳ Scanning...' : '🔄 Rescan'}
                    </button>
                </div>
            </header>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' }}>
                {anomalies.map((anomaly) => {
                    const sev = SEVERITY[anomaly.severity];
                    return (
                        <div
                            key={anomaly.id}
                            style={{
                                background: sev.bg,
                                border: `1px solid ${sev.color}40`,
                                borderLeft: `4px solid ${sev.color}`,
                                borderRadius: '8px',
                                padding: 'var(--spacing-md)'
                            }}
                        >
                            <div style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'flex-start',
                                gap: 'var(--spacing-sm)'
                            }}>
                                <div style={{ flex: 1 }}>
                                    <div style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 'var(--spacing-sm)',
                                        marginBottom: 'var(--spacing-xs)'
                                    }}>
                                        <span
                                            className="badge"
                                            style={{
                                                background: sev.color,
                                                color: 'white',
                                                fontSize: '10px'
                                            }}
                                        >
                                            {sev.label}
                                        </span>
                                        <span className="font-bold text-sm">{anomaly.title}</span>
                                    </div>
                                    <div className="text-sm" style={{ marginBottom: 'var(--spacing-xs)' }}>
                                        {anomaly.description}
                                    </div>
                                    <div className="text-xs text-secondary" style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 'var(--spacing-xs)'
                                    }}>
                                        <span>💡</span>
                                        <span>{anomaly.recommendation}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
