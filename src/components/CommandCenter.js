/**
 * PALANTIR-STYLE: Command Center Dashboard
 * A unified intelligence dashboard combining all Palantir-style features.
 * Inspired by Palantir Gotham's Command Center interface.
 */
import { useState } from 'react';
import ActivityTimeline from './ActivityTimeline';
import AnomalyDetector from './AnomalyDetector';
import EntityNetwork from './EntityNetwork';
import BusinessSimulator from './BusinessSimulator';
import PredictiveAlerts from './PredictiveAlerts';

export default function CommandCenter({
    transactions = [],
    stocks = [],
    expenses = [],
    products = [],
    stats = {},
    userId = null
}) {
    const [activePanel, setActivePanel] = useState('overview');

    const panels = [
        { id: 'overview', label: '🎯 Overview', icon: '🎯' },
        { id: 'predictions', label: '🔮 Predictions', icon: '🔮' },
        { id: 'timeline', label: '📡 Timeline', icon: '📡' },
        { id: 'anomaly', label: '🔍 Anomali', icon: '🔍' },
        { id: 'network', label: '🕸️ Network', icon: '🕸️' },
        { id: 'simulator', label: '📊 Simulator', icon: '📊' }
    ];

    return (
        <div className="card" style={{
            background: 'linear-gradient(180deg, var(--color-bg-primary), var(--color-bg-secondary))',
            border: '1px solid var(--color-border)',
            overflow: 'hidden'
        }}>
            {/* Command Center Header */}
            <div style={{
                background: 'linear-gradient(90deg, #1a1a2e, #16213e)',
                padding: 'var(--spacing-md) var(--spacing-lg)',
                borderBottom: '1px solid #ffffff10',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 'var(--spacing-md)'
            }}>
                <div>
                    <h2 style={{
                        color: '#fff',
                        fontSize: '18px',
                        fontWeight: '700',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--spacing-sm)'
                    }}>
                        <span style={{
                            background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent'
                        }}>
                            COMMAND CENTER
                        </span>
                        <span style={{
                            fontSize: '10px',
                            background: '#10b981',
                            color: 'white',
                            padding: '2px 8px',
                            borderRadius: '12px',
                            fontWeight: '600'
                        }}>
                            PALANTIR-STYLE
                        </span>
                    </h2>
                    <p style={{ color: '#888', fontSize: '12px' }}>
                        AI-Powered Business Intelligence Platform
                    </p>
                </div>

                {/* System Status */}
                <div style={{
                    display: 'flex',
                    gap: 'var(--spacing-lg)',
                    fontSize: '12px'
                }}>
                    <div style={{ textAlign: 'center' }}>
                        <div style={{ color: '#10b981', fontWeight: '700', fontSize: '16px' }}>
                            {transactions.length}
                        </div>
                        <div style={{ color: '#666' }}>Transaksi</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                        <div style={{ color: '#3b82f6', fontWeight: '700', fontSize: '16px' }}>
                            {products.length}
                        </div>
                        <div style={{ color: '#666' }}>Produk</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                        <div style={{
                            color: stocks.filter(s => s.quantity <= s.min_stock_level).length > 0
                                ? '#f59e0b' : '#10b981',
                            fontWeight: '700',
                            fontSize: '16px'
                        }}>
                            {stocks.filter(s => s.quantity <= s.min_stock_level).length}
                        </div>
                        <div style={{ color: '#666' }}>Alert</div>
                    </div>
                </div>
            </div>

            {/* Panel Navigation */}
            <div style={{
                display: 'flex',
                gap: '2px',
                padding: 'var(--spacing-sm)',
                background: 'var(--color-bg-secondary)',
                overflowX: 'auto'
            }}>
                {panels.map(panel => (
                    <button
                        key={panel.id}
                        onClick={() => setActivePanel(panel.id)}
                        style={{
                            flex: '1 1 auto',
                            minWidth: '100px',
                            padding: 'var(--spacing-sm) var(--spacing-md)',
                            background: activePanel === panel.id
                                ? 'var(--color-primary)'
                                : 'transparent',
                            color: activePanel === panel.id ? 'white' : 'var(--color-text-secondary)',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '12px',
                            fontWeight: '600',
                            transition: 'all 0.2s',
                            whiteSpace: 'nowrap'
                        }}
                    >
                        {panel.icon} {panel.label.split(' ')[1]}
                    </button>
                ))}
            </div>

            {/* Active Panel Content */}
            <div style={{ padding: 'var(--spacing-lg)' }}>
                {activePanel === 'overview' && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 'var(--spacing-lg)' }}>
                        {/* Quick Stats */}
                        <div>
                            <h4 className="font-bold mb-md">📊 Quick Intelligence</h4>
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: '1fr 1fr',
                                gap: 'var(--spacing-md)'
                            }}>
                                <div style={{
                                    background: 'var(--color-bg-secondary)',
                                    padding: 'var(--spacing-md)',
                                    borderRadius: '8px',
                                    textAlign: 'center'
                                }}>
                                    <div className="text-xs text-secondary">Anomali Aktif</div>
                                    <div className="font-bold text-lg">
                                        {stocks.filter(s => s.quantity <= s.min_stock_level).length +
                                            transactions.filter(t => t.status === 'void').slice(0, 24).length}
                                    </div>
                                </div>
                                <div style={{
                                    background: 'var(--color-bg-secondary)',
                                    padding: 'var(--spacing-md)',
                                    borderRadius: '8px',
                                    textAlign: 'center'
                                }}>
                                    <div className="text-xs text-secondary">Entity Nodes</div>
                                    <div className="font-bold text-lg">
                                        {products.length + new Set(products.map(p => p.category)).size}
                                    </div>
                                </div>
                                <div style={{
                                    background: 'var(--color-bg-secondary)',
                                    padding: 'var(--spacing-md)',
                                    borderRadius: '8px',
                                    textAlign: 'center'
                                }}>
                                    <div className="text-xs text-secondary">24h Events</div>
                                    <div className="font-bold text-lg">
                                        {transactions.filter(t => {
                                            const d = new Date(t.datetime);
                                            return d > new Date(Date.now() - 24 * 60 * 60 * 1000);
                                        }).length}
                                    </div>
                                </div>
                                <div style={{
                                    background: 'var(--color-bg-secondary)',
                                    padding: 'var(--spacing-md)',
                                    borderRadius: '8px',
                                    textAlign: 'center'
                                }}>
                                    <div className="text-xs text-secondary">AI Actions</div>
                                    <div className="font-bold text-lg" style={{ color: 'var(--color-primary)' }}>
                                        READY
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Mini Anomaly Panel */}
                        <div>
                            <AnomalyDetector
                                transactions={transactions.slice(0, 20)}
                                stocks={stocks}
                                expenses={expenses.slice(0, 10)}
                            />
                        </div>
                    </div>
                )}

                {activePanel === 'predictions' && (
                    <PredictiveAlerts userId={userId} />
                )}

                {activePanel === 'timeline' && (
                    <div style={{ height: '400px' }}>
                        <ActivityTimeline
                            transactions={transactions}
                            stocks={stocks}
                            expenses={expenses}
                            maxItems={20}
                        />
                    </div>
                )}

                {activePanel === 'anomaly' && (
                    <AnomalyDetector
                        transactions={transactions}
                        stocks={stocks}
                        expenses={expenses}
                    />
                )}

                {activePanel === 'network' && (
                    <EntityNetwork
                        products={products}
                        transactions={transactions}
                    />
                )}

                {activePanel === 'simulator' && (
                    <BusinessSimulator
                        currentRevenue={stats.revenue || 0}
                        currentProfit={stats.profit || 0}
                        currentExpenses={stats.expenses || 0}
                    />
                )}
            </div>

            {/* Footer Status Bar */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: 'var(--spacing-sm) var(--spacing-lg)',
                background: '#1a1a2e',
                fontSize: '10px',
                color: '#666',
                flexWrap: 'wrap',
                gap: 'var(--spacing-sm)'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)' }}>
                    <span style={{
                        width: '6px',
                        height: '6px',
                        borderRadius: '50%',
                        background: '#10b981',
                        animation: 'pulse 2s infinite'
                    }}></span>
                    System Online
                </div>
                <div>
                    Powered by Cashlo AI Engine v2.0
                </div>
                <div>
                    Last Update: {new Date().toLocaleTimeString('id-ID')}
                </div>
            </div>

            <style jsx global>{`
                @keyframes pulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.3; }
                }
            `}</style>
        </div>
    );
}
