import { useState } from 'react';

export default function IntegrationHub() {
    const [integrations, setIntegrations] = useState([
        { id: 1, name: 'Majoo POS', status: 'connected', type: 'POS', latency: '24ms', transactions: '1.2k/day' },
        { id: 2, name: 'Kasir Pintar', status: 'connected', type: 'POS', latency: '45ms', transactions: '850/day' },
        { id: 3, name: 'Moka POS', status: 'available', type: 'POS', latency: '-', transactions: '-' },
        { id: 4, name: 'GoFood Partner', status: 'syncing', type: 'Delivery', latency: '120ms', transactions: 'Live Stream' },
        { id: 5, name: 'GrabFood Merchant', status: 'available', type: 'Delivery', latency: '-', transactions: '-' },
        { id: 6, name: 'Jurnal.id', status: 'available', type: 'Accounting', latency: '-', transactions: '-' },
    ]);

    const getStatusColor = (status) => {
        switch (status) {
            case 'connected': return '#22C55E';
            case 'syncing': return '#EAB308';
            default: return '#94A3B8';
        }
    };

    return (
        <div className="p-card" style={{ marginTop: '32px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <div>
                    <h3 className="section-title">Integration Ecosystem (Universal Adapter)</h3>
                    <p style={{ color: 'var(--provitina-text-secondary)', fontSize: '14px', marginTop: '4px' }}>
                        Centralizing data streams from external POS and delivery platforms into the Palantir Core.
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button style={{
                        padding: '8px 16px',
                        background: '#0F172A',
                        color: 'white',
                        border: 'none',
                        borderRadius: '8px',
                        fontSize: '13px',
                        fontWeight: '600',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                    }}>
                        <span>+</span> Add Data Source
                    </button>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
                {integrations.map((app) => (
                    <div key={app.id} style={{
                        border: '1px solid #E2E8F0',
                        borderRadius: '12px',
                        padding: '16px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        background: '#F8FAFC',
                        transition: 'all 0.2s'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <div style={{
                                width: '40px',
                                height: '40px',
                                borderRadius: '8px',
                                background: 'white',
                                border: '1px solid #E2E8F0',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '18px',
                                fontWeight: 'bold',
                                color: '#475569'
                            }}>
                                {app.name.charAt(0)}
                            </div>
                            <div>
                                <div style={{ fontWeight: '600', fontSize: '14px', color: '#0F172A' }}>{app.name}</div>
                                <div style={{ fontSize: '11px', color: '#64748B' }}>{app.type} Protocol</div>
                            </div>
                        </div>

                        <div style={{ textAlign: 'right' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px', marginBottom: '2px' }}>
                                <div style={{
                                    width: '6px', height: '6px', borderRadius: '50%',
                                    background: getStatusColor(app.status),
                                    boxShadow: app.status === 'connected' ? '0 0 8px #22C55E' : 'none'
                                }}></div>
                                <div style={{
                                    fontSize: '12px', fontWeight: '600',
                                    color: getStatusColor(app.status),
                                    textTransform: 'capitalize'
                                }}>{app.status}</div>
                            </div>
                            {app.status !== 'available' && (
                                <div style={{ fontSize: '10px', color: '#94A3B8', fontFamily: 'monospace' }}>
                                    Ping: {app.latency}
                                </div>
                            )}
                        </div>
                    </div>
                ))}
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
            `}</style>
        </div>
    );
}
