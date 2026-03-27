/**
 * PALANTIR-STYLE COMMAND CENTER PAGE
 * A unified intelligence dashboard with all Palantir-inspired features.
 */
import { useEffect } from 'react';
import Sidebar from '@/components/layout/Sidebar';
import CommandCenter from '@/components/CommandCenter';
import { useAuth } from '@/hooks/useAuth';
import { useTransactions } from '@/hooks/useTransactions';
import { useInventory } from '@/hooks/useInventory';
import { useExpenses } from '@/hooks/useExpenses';
import { useProducts } from '@/hooks/useProducts';

export default function CommandCenterPage() {
    const { user, loading: authLoading } = useAuth();
    const { transactions, loading: txnLoading } = useTransactions((user?.owner_id || user?.id), user?.role, user?.id);
    const { stocks, loading: stockLoading } = useInventory(user?.id, user?.role);
    const { expenses, loading: expLoading } = useExpenses((user?.owner_id || user?.id));
    const { products, loading: prodLoading } = useProducts((user?.owner_id || user?.id), user?.role);

    useEffect(() => {
        if (!authLoading && !user) {
            window.location.href = '/';
        }
    }, [user, authLoading]);

    // Calculate quick stats
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthTxns = (transactions || []).filter(t => new Date(t.datetime) >= startOfMonth);
    const monthExpenses = (expenses || []).filter(e => new Date(e.date) >= startOfMonth);

    const stats = {
        revenue: monthTxns.reduce((sum, t) => sum + t.subtotal, 0),
        profit: monthTxns.reduce((sum, t) => sum + t.total_profit, 0),
        expenses: monthExpenses.reduce((sum, e) => sum + parseFloat(e.amount), 0),
        count: monthTxns.reduce((sum, t) => sum + (t.manual_txn_count || 1), 0)
    };

    const isLoading = authLoading || txnLoading || stockLoading || expLoading || prodLoading;

    return (
        <div className="app-container">
            <Sidebar activePage="command" userRole={user?.role} />

            <main className="main-content">
                {/* Page Header */}
                <header style={{
                    padding: 'var(--spacing-lg)',
                    borderBottom: '1px solid var(--color-border)',
                    background: 'linear-gradient(90deg, #1a1a2e, #16213e)',
                    color: 'white'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--spacing-md)' }}>
                        <div>
                            <h1 style={{
                                fontSize: '24px',
                                fontWeight: '700',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 'var(--spacing-sm)'
                            }}>
                                🎯 Command Center
                                <span style={{
                                    fontSize: '10px',
                                    background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                                    padding: '2px 10px',
                                    borderRadius: '12px'
                                }}>
                                    PALANTIR-STYLE
                                </span>
                            </h1>
                            <p style={{ color: '#888', fontSize: '14px' }}>
                                Enterprise-grade AI Business Intelligence Platform
                            </p>
                        </div>

                        <div style={{ display: 'flex', gap: 'var(--spacing-lg)' }}>
                            <a href="/provitina" className="btn btn-primary btn-sm">
                                💬 Tanya AI
                            </a>
                        </div>
                    </div>
                </header>

                {/* Main Content */}
                <div style={{ padding: 'var(--spacing-lg)' }}>
                    {isLoading ? (
                        <div style={{
                            display: 'flex',
                            justifyContent: 'center',
                            alignItems: 'center',
                            height: '50vh',
                            flexDirection: 'column',
                            gap: 'var(--spacing-md)'
                        }}>
                            <div className="animate-pulse" style={{
                                width: '60px',
                                height: '60px',
                                borderRadius: '50%',
                                background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)'
                            }}></div>
                            <div className="text-secondary">Loading Intelligence Systems...</div>
                        </div>
                    ) : (
                        <CommandCenter
                            transactions={transactions}
                            stocks={stocks}
                            expenses={expenses}
                            products={products}
                            stats={stats}
                            userId={user?.id}
                        />
                    )}

                    {/* Feature Cards */}
                    <div style={{
                        marginTop: 'var(--spacing-xl)',
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
                        gap: 'var(--spacing-lg)'
                    }}>
                        {/* Feature 1: Action Agents */}
                        <div className="card" style={{
                            background: 'linear-gradient(135deg, #3b82f620, #3b82f605)',
                            border: '1px solid #3b82f640'
                        }}>
                            <div style={{ padding: 'var(--spacing-lg)' }}>
                                <div style={{ fontSize: '32px', marginBottom: 'var(--spacing-sm)' }}>🤖</div>
                                <h3 className="font-bold mb-sm">Action Agents</h3>
                                <p className="text-sm text-secondary">
                                    AI yang tidak hanya bicara, tapi MELAKUKAN. Suruh AI untuk menambah supply, update stok, atau input data langsung dari chat.
                                </p>
                                <a href="/provitina" className="btn btn-sm btn-primary mt-md">
                                    Coba Sekarang →
                                </a>
                            </div>
                        </div>

                        {/* Feature 2: What-If Simulator */}
                        <div className="card" style={{
                            background: 'linear-gradient(135deg, #8b5cf620, #8b5cf605)',
                            border: '1px solid #8b5cf640'
                        }}>
                            <div style={{ padding: 'var(--spacing-lg)' }}>
                                <div style={{ fontSize: '32px', marginBottom: 'var(--spacing-sm)' }}>🔮</div>
                                <h3 className="font-bold mb-sm">What-If Simulator</h3>
                                <p className="text-sm text-secondary">
                                    Simulasi skenario bisnis: "Bagaimana jika harga naik 10%?" atau "Jika traffic turun 20%?". Lihat proyeksi sebelum mengambil keputusan.
                                </p>
                            </div>
                        </div>

                        {/* Feature 3: Anomaly Detection */}
                        <div className="card" style={{
                            background: 'linear-gradient(135deg, #ef444420, #ef444405)',
                            border: '1px solid #ef444440'
                        }}>
                            <div style={{ padding: 'var(--spacing-lg)' }}>
                                <div style={{ fontSize: '32px', marginBottom: 'var(--spacing-sm)' }}>🔍</div>
                                <h3 className="font-bold mb-sm">Anomaly Detection</h3>
                                <p className="text-sm text-secondary">
                                    AI mendeteksi pola tidak biasa: void mencurigakan, pengeluaran besar tiba-tiba, atau penurunan penjualan drastis.
                                </p>
                            </div>
                        </div>

                        {/* Feature 4: Entity Network */}
                        <div className="card" style={{
                            background: 'linear-gradient(135deg, #10b98120, #10b98105)',
                            border: '1px solid #10b98140'
                        }}>
                            <div style={{ padding: 'var(--spacing-lg)' }}>
                                <div style={{ fontSize: '32px', marginBottom: 'var(--spacing-sm)' }}>🕸️</div>
                                <h3 className="font-bold mb-sm">Entity Network Graph</h3>
                                <p className="text-sm text-secondary">
                                    Visualisasi hubungan antara Produk, Supplier, Kategori, dan Pelanggan. Ontology graph ala Palantir Foundry.
                                </p>
                            </div>
                        </div>

                        {/* Feature 5: Live Timeline */}
                        <div className="card" style={{
                            background: 'linear-gradient(135deg, #f59e0b20, #f59e0b05)',
                            border: '1px solid #f59e0b40'
                        }}>
                            <div style={{ padding: 'var(--spacing-lg)' }}>
                                <div style={{ fontSize: '32px', marginBottom: 'var(--spacing-sm)' }}>📡</div>
                                <h3 className="font-bold mb-sm">Live Activity Stream</h3>
                                <p className="text-sm text-secondary">
                                    Real-time feed semua aktivitas bisnis: penjualan, pengeluaran, stok alert, dan anomali dalam satu timeline.
                                </p>
                            </div>
                        </div>

                        {/* Feature 6: Regional Intelligence */}
                        <div className="card" style={{
                            background: 'linear-gradient(135deg, #0ea5e920, #0ea5e905)',
                            border: '1px solid #0ea5e940'
                        }}>
                            <div style={{ padding: 'var(--spacing-lg)' }}>
                                <div style={{ fontSize: '32px', marginBottom: 'var(--spacing-sm)' }}>🌏</div>
                                <h3 className="font-bold mb-sm">Regional Intelligence</h3>
                                <p className="text-sm text-secondary">
                                    Konteks lokal Palangka Raya: cuaca, event, tren viral, dan rekomendasi menu berdasarkan kondisi regional.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}


export const getServerSideProps = async () => { return { props: {} }; };
