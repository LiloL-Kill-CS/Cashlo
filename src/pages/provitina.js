import { useState, useEffect } from 'react';
import Sidebar from '@/components/layout/Sidebar';
import Head from 'next/head';
import ProvitinaHeader from '@/components/provitina/ProvitinaHeader';
import RevenueProbabilityChart from '@/components/provitina/RevenueProbabilityChart';
import IntegrationHub from '@/components/provitina/IntegrationHub';
import { useRegionalData } from '@/hooks/useRegionalData';
import { useAuth } from '@/hooks/useAuth';
import { formatCurrency } from '@/lib/db';

export default function ProvitinaPage() {
    const { user } = useAuth();
    const { data, loading, error } = useRegionalData();

    if (loading) {
        return (
            <div className="app-container">
                <Sidebar activePage="provitina" userRole={user?.role} />
                <main className="main-content" style={{ background: 'var(--provitina-bg)' }}>
                    <div style={{
                        height: '100vh',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexDirection: 'column',
                        gap: '16px'
                    }}>
                        <div className="spinner" style={{
                            width: '40px',
                            height: '40px',
                            border: '3px solid rgba(15, 23, 42, 0.1)',
                            borderTopColor: 'var(--provitina-accent)',
                            borderRadius: '50%',
                            animation: 'spin 1s linear infinite'
                        }}></div>
                        <div style={{ fontFamily: 'Inter', color: 'var(--provitina-text-secondary)' }}>Authenticating Palantir Core...</div>
                    </div>
                </main>
                <style jsx global>{`
                    @keyframes spin { to { transform: rotate(360deg); } }
                `}</style>
            </div>
        );
    }

    if (!data) return null;

    const { prediction, weather, upcoming_events, trends } = data;
    const todayWeather = weather[0] || {};
    // Calculate a mock volatility index based on the spread
    const volatility = ((prediction.predicted_revenue.high - prediction.predicted_revenue.low) / prediction.predicted_revenue.mid) * 100;

    return (
        <div className="app-container">
            <Head>
                <title>Provitina | Regional Intelligence</title>
            </Head>

            <Sidebar activePage="provitina" userRole={user?.role} />

            <main className="main-content" style={{ background: 'var(--provitina-bg)', minHeight: '100vh' }}>
                <ProvitinaHeader />

                <div style={{ padding: '32px', maxWidth: '1400px', margin: '0 auto' }}>

                    {/* FINANCIAL DASHBOARD HEADER */}
                    <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'end' }}>
                        <div>
                            <h2 style={{ fontSize: '18px', color: '#64748B', fontWeight: '500' }}>Market Alpha / Prediction Model</h2>
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px' }}>
                                <span style={{ fontSize: '42px', fontWeight: '800', color: '#0F172A', letterSpacing: '-1px' }}>
                                    {formatCurrency(prediction.predicted_revenue.mid)}
                                </span>
                                <span style={{
                                    fontSize: '14px',
                                    color: prediction.confidence > 80 ? '#22C55E' : '#EAB308',
                                    background: prediction.confidence > 80 ? 'rgba(34, 197, 94, 0.1)' : 'rgba(234, 179, 8, 0.1)',
                                    padding: '4px 8px',
                                    borderRadius: '6px',
                                    fontWeight: '600'
                                }}>
                                    {prediction.confidence}% Probability Ratio
                                </span>
                            </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: '12px', color: '#64748B', textTransform: 'uppercase' }}>Volatility Index (σ)</div>
                            <div style={{ fontSize: '18px', fontWeight: '700', color: '#0F172A' }}>{volatility.toFixed(2)}%</div>
                        </div>
                    </div>

                    {/* MAIN GRID */}
                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '32px' }}>

                        {/* LEFT COLUMN */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>

                            {/* PROBABILITY CHART CARD */}
                            <div className="p-card" style={{ height: '400px', display: 'flex', flexDirection: 'column' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
                                    <h3 className="section-title">Revenue Probability Distribution (Gaussian)</h3>
                                    <div style={{ fontSize: '12px', color: '#64748B' }}>Model: PR-2026-ALPHA</div>
                                </div>
                                <div style={{ flex: 1, minHeight: 0 }}>
                                    <RevenueProbabilityChart prediction={prediction} />
                                </div>
                            </div>

                            {/* ANALYST COMMENTARY (MARKET DRIVERS) */}
                            <div className="p-card">
                                <h3 className="section-title">Senior Analyst Commentary</h3>
                                <div style={{ marginTop: '16px', background: '#F8FAFC', padding: '20px', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
                                    <div style={{ display: 'flex', gap: '16px' }}>
                                        <div style={{
                                            minWidth: '4px', background: '#0EA5E9', borderRadius: '4px'
                                        }}></div>
                                        <div>
                                            <p style={{ fontSize: '15px', lineHeight: '1.6', color: '#334155', marginBottom: '12px' }}>
                                                <strong>Executive Summary:</strong> The prediction model indicates a <strong>{prediction.factors[0]?.impact.includes('+') ? 'Bullish' : 'Bearish'}</strong> trend for today's trading cycle.
                                                Primary drivers include <strong style={{ color: '#0F172A' }}>{prediction.factors.map(f => f.name).join(' and ')}</strong>.
                                            </p>
                                            <p style={{ fontSize: '14px', lineHeight: '1.6', color: '#64748B' }}>
                                                Market volatility is estimated at {volatility.toFixed(2)}%, suggesting a {volatility < 15 ? 'stable' : 'highly dynamic'} environment.
                                                We recommend capitalizing on the <strong>{prediction.recommendations[0] || 'emerging trends'}</strong> to maximize upside potential ("Alpha").
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* RIGHT COLUMN */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>

                            {/* KEY METRICS */}
                            <div className="p-card">
                                <h3 className="section-title">Financial Indicators</h3>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginTop: '16px' }}>
                                    <div className="metric-box">
                                        <div className="label">Upside (Bull)</div>
                                        <div className="value success">{formatCurrency(prediction.predicted_revenue.high)}</div>
                                    </div>
                                    <div className="metric-box">
                                        <div className="label">Downside (Bear)</div>
                                        <div className="value danger">{formatCurrency(prediction.predicted_revenue.low)}</div>
                                    </div>
                                    <div className="metric-box">
                                        <div className="label">VaR (Risk)</div>
                                        <div className="value neutral">Low</div>
                                    </div>
                                    <div className="metric-box">
                                        <div className="label">CAGR (Proj)</div>
                                        <div className="value neutral">+12.4%</div>
                                    </div>
                                </div>
                            </div>

                            {/* VIRAL ASSETS (R&D) */}
                            <div className="p-card">
                                <h3 className="section-title">High-Yield Assets (Menu R&D)</h3>
                                <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                    {data.menu_recommendations?.slice(0, 3).map((item, idx) => (
                                        <div key={idx} style={{
                                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                            padding: '12px', borderBottom: '1px solid #F1F5F9'
                                        }}>
                                            <div>
                                                <div style={{ fontWeight: '600', fontSize: '14px' }}>{item.name}</div>
                                                <div style={{ fontSize: '11px', color: '#64748B' }}>{item.origin}</div>
                                            </div>
                                            <div style={{ textAlign: 'right' }}>
                                                <div style={{ fontSize: '12px', color: '#22C55E', fontWeight: '700' }}>Buy</div>
                                                <div style={{ fontSize: '11px', color: '#94A3B8' }}>Est. {formatCurrency(item.price_range[0])}</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                        </div>
                    </div>

                    {/* INTEGRATION ECOSYSTEM (NEW) */}
                    <IntegrationHub />

                </div>

                <style jsx>{`
                    .p-card {
                        background: var(--provitina-card-bg);
                        border: 1px solid var(--provitina-border);
                        border-radius: 12px;
                        padding: 24px;
                        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
                    }
                    .section-title {
                        font-size: 14px;
                        font-weight: 700;
                        color: #94A3B8;
                        text-transform: uppercase;
                        letter-spacing: 0.05em;
                    }
                    .metric-box {
                        padding: 12px;
                        background: #F8FAFC;
                        border-radius: 8px;
                        border: 1px solid #E2E8F0;
                    }
                    .metric-box .label {
                        font-size: 11px;
                        color: #64748B;
                        text-transform: uppercase;
                        margin-bottom: 4px;
                    }
                    .metric-box .value {
                        font-size: 16px;
                        font-weight: 700;
                    }
                    .metric-box .value.success { color: #22C55E; }
                    .metric-box .value.danger { color: #EF4444; }
                    .metric-box .value.neutral { color: #334155; }
                `}</style>
            </main>
        </div>
    );
}


export const getServerSideProps = async () => { return { props: {} }; };
