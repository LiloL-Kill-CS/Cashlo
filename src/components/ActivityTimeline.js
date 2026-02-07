/**
 * PALANTIR-STYLE: Live Activity Timeline
 * Real-time event stream of all business activities with live updates.
 * Inspired by Palantir's event-driven architecture.
 */
import { useState, useEffect } from 'react';
import { formatCurrency } from '@/lib/db';

// Activity type icons and colors
const ACTIVITY_TYPES = {
    sale: { icon: '💰', color: '#22c55e', label: 'Penjualan' },
    void: { icon: '❌', color: '#ef4444', label: 'Void' },
    stock_low: { icon: '⚠️', color: '#f59e0b', label: 'Stok Rendah' },
    stock_refill: { icon: '📦', color: '#3b82f6', label: 'Restok' },
    expense: { icon: '💸', color: '#f97316', label: 'Pengeluaran' },
    customer: { icon: '👤', color: '#8b5cf6', label: 'Pelanggan Baru' },
    promo: { icon: '🎁', color: '#ec4899', label: 'Promo Aktif' },
    anomaly: { icon: '🚨', color: '#ef4444', label: 'Anomali' },
    weather: { icon: '🌤️', color: '#0ea5e9', label: 'Cuaca' },
    target_hit: { icon: '🎯', color: '#10b981', label: 'Target Tercapai' }
};

export default function ActivityTimeline({
    transactions = [],
    stocks = [],
    expenses = [],
    maxItems = 15
}) {
    const [activities, setActivities] = useState([]);
    const [filter, setFilter] = useState('all');
    const [isLive, setIsLive] = useState(true);

    useEffect(() => {
        // Compile all activities from different sources
        const compiledActivities = [];

        // Add recent transactions as activities
        transactions.slice(0, 20).forEach(txn => {
            const items = JSON.parse(txn.items || '[]');
            compiledActivities.push({
                id: `txn-${txn.id}`,
                type: txn.status === 'void' ? 'void' : 'sale',
                timestamp: new Date(txn.datetime),
                title: txn.status === 'void'
                    ? `Transaksi dibatalkan`
                    : `Penjualan ${items.length} item`,
                description: `${formatCurrency(txn.subtotal)} (+${formatCurrency(txn.total_profit)} profit)`,
                metadata: {
                    items: items.map(i => i.name).join(', '),
                    paymentMethod: txn.payment_method
                }
            });
        });

        // Add low stock alerts
        const lowStockItems = stocks.filter(s => s.quantity <= s.min_stock_level);
        lowStockItems.forEach(item => {
            compiledActivities.push({
                id: `stock-${item.id}`,
                type: 'stock_low',
                timestamp: new Date(), // Assume current
                title: `Stok ${item.name} rendah`,
                description: `Tersisa ${item.quantity} ${item.unit || 'pcs'} (min: ${item.min_stock_level})`,
                priority: 'high'
            });
        });

        // Add recent expenses
        expenses.slice(0, 5).forEach(exp => {
            compiledActivities.push({
                id: `exp-${exp.id}`,
                type: 'expense',
                timestamp: new Date(exp.date),
                title: exp.description || 'Pengeluaran',
                description: formatCurrency(exp.amount),
                metadata: { category: exp.category }
            });
        });

        // Detect anomalies (simple rule-based for now)
        const recentSales = transactions.filter(t => {
            const txnDate = new Date(t.datetime);
            const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
            return txnDate > hourAgo;
        });

        // Anomaly: Unusually high single transaction
        const avgTransaction = transactions.length > 0
            ? transactions.reduce((sum, t) => sum + t.subtotal, 0) / transactions.length
            : 0;

        transactions.slice(0, 5).forEach(txn => {
            if (txn.subtotal > avgTransaction * 3 && avgTransaction > 0) {
                compiledActivities.push({
                    id: `anomaly-high-${txn.id}`,
                    type: 'anomaly',
                    timestamp: new Date(txn.datetime),
                    title: '⚡ Transaksi Tidak Biasa',
                    description: `${formatCurrency(txn.subtotal)} (3x lebih tinggi dari rata-rata)`,
                    priority: 'high'
                });
            }
        });

        // Sort by timestamp (newest first)
        compiledActivities.sort((a, b) => b.timestamp - a.timestamp);

        // Apply filter
        const filtered = filter === 'all'
            ? compiledActivities
            : compiledActivities.filter(a => a.type === filter);

        setActivities(filtered.slice(0, maxItems));
    }, [transactions, stocks, expenses, filter, maxItems]);

    const formatTimeAgo = (date) => {
        const now = new Date();
        const diff = now - date;
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(diff / 3600000);
        const days = Math.floor(diff / 86400000);

        if (minutes < 1) return 'Baru saja';
        if (minutes < 60) return `${minutes} menit lalu`;
        if (hours < 24) return `${hours} jam lalu`;
        return `${days} hari lalu`;
    };

    return (
        <div className="card" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <header className="card-header" style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 'var(--spacing-sm)'
            }}>
                <div>
                    <h3 className="text-lg font-bold flex items-center gap-sm">
                        📡 Live Activity Stream
                        {isLive && (
                            <span style={{
                                display: 'inline-block',
                                width: '8px',
                                height: '8px',
                                borderRadius: '50%',
                                background: '#22c55e',
                                animation: 'pulse 2s infinite'
                            }}></span>
                        )}
                    </h3>
                    <p className="text-xs text-secondary">Real-time business event monitoring</p>
                </div>
                <div style={{ display: 'flex', gap: 'var(--spacing-xs)' }}>
                    <select
                        className="input"
                        style={{ padding: '4px 8px', fontSize: '12px', minWidth: '100px' }}
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                    >
                        <option value="all">Semua</option>
                        <option value="sale">Penjualan</option>
                        <option value="expense">Pengeluaran</option>
                        <option value="stock_low">Stok Alert</option>
                        <option value="anomaly">Anomali</option>
                    </select>
                </div>
            </header>

            <div style={{
                flex: 1,
                overflowY: 'auto',
                padding: 'var(--spacing-md)',
                background: 'var(--color-bg-secondary)'
            }}>
                {activities.length === 0 ? (
                    <div style={{
                        textAlign: 'center',
                        padding: 'var(--spacing-xl)',
                        color: 'var(--color-text-muted)'
                    }}>
                        Belum ada aktivitas
                    </div>
                ) : (
                    <div style={{ position: 'relative' }}>
                        {/* Timeline line */}
                        <div style={{
                            position: 'absolute',
                            left: '12px',
                            top: 0,
                            bottom: 0,
                            width: '2px',
                            background: 'var(--color-border)'
                        }}></div>

                        {activities.map((activity, idx) => {
                            const config = ACTIVITY_TYPES[activity.type] || ACTIVITY_TYPES.sale;
                            return (
                                <div
                                    key={activity.id}
                                    style={{
                                        display: 'flex',
                                        gap: 'var(--spacing-md)',
                                        marginBottom: 'var(--spacing-md)',
                                        position: 'relative',
                                        paddingLeft: 'var(--spacing-lg)',
                                        animation: idx === 0 && isLive ? 'fadeIn 0.5s ease' : 'none'
                                    }}
                                >
                                    {/* Icon bubble */}
                                    <div style={{
                                        position: 'absolute',
                                        left: 0,
                                        width: '26px',
                                        height: '26px',
                                        borderRadius: '50%',
                                        background: config.color + '20',
                                        border: `2px solid ${config.color}`,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: '12px',
                                        zIndex: 1
                                    }}>
                                        {config.icon}
                                    </div>

                                    {/* Content */}
                                    <div style={{
                                        flex: 1,
                                        background: 'var(--color-bg-primary)',
                                        padding: 'var(--spacing-sm) var(--spacing-md)',
                                        borderRadius: '8px',
                                        border: activity.priority === 'high'
                                            ? `1px solid ${config.color}`
                                            : '1px solid var(--color-border)'
                                    }}>
                                        <div style={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'flex-start',
                                            gap: '8px'
                                        }}>
                                            <div>
                                                <div className="font-bold text-sm">{activity.title}</div>
                                                <div className="text-xs text-secondary">{activity.description}</div>
                                            </div>
                                            <div className="text-xs text-muted" style={{ whiteSpace: 'nowrap' }}>
                                                {formatTimeAgo(activity.timestamp)}
                                            </div>
                                        </div>
                                        {activity.metadata?.items && (
                                            <div className="text-xs text-muted" style={{ marginTop: '4px' }}>
                                                {activity.metadata.items}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            <style jsx global>{`
                @keyframes pulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.3; }
                }
                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(-10px); }
                    to { opacity: 1; transform: translateY(0); }
                }
            `}</style>
        </div>
    );
}
