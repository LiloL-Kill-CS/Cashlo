/**
 * PALANTIR-STYLE: Predictive Alerts Widget
 * Displays AI-generated predictive alerts with forecasts and recommendations.
 */
import { useState, useEffect } from 'react';

// Severity styling
const SEVERITY_CONFIG = {
    critical: { color: '#ef4444', bg: '#ef444420', icon: '🚨' },
    warning: { color: '#f59e0b', bg: '#f59e0b20', icon: '⚠️' },
    success: { color: '#10b981', bg: '#10b98120', icon: '✅' },
    info: { color: '#3b82f6', bg: '#3b82f620', icon: 'ℹ️' }
};

export default function PredictiveAlerts({ userId }) {
    const [alerts, setAlerts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [lastUpdate, setLastUpdate] = useState(null);
    const [dismissed, setDismissed] = useState([]);

    useEffect(() => {
        if (userId) {
            fetchAlerts();
        }
    }, [userId]);

    const fetchAlerts = async () => {
        setLoading(true);
        setError(null);

        try {
            const response = await fetch(`/api/predictive-alerts?userId=${userId}`);
            const data = await response.json();

            if (data.success) {
                setAlerts(data.alerts);
                setLastUpdate(new Date(data.timestamp));
            } else {
                setError(data.error || 'Failed to fetch alerts');
            }
        } catch (err) {
            setError('Network error');
            console.error('Predictive alerts error:', err);
        } finally {
            setLoading(false);
        }
    };

    const dismissAlert = (alertId) => {
        setDismissed([...dismissed, alertId]);
    };

    const visibleAlerts = alerts.filter(a => !dismissed.includes(a.id));

    if (loading) {
        return (
            <div className="card" style={{ padding: 'var(--spacing-lg)' }}>
                <div className="animate-pulse">
                    <div style={{ height: '20px', background: 'var(--color-bg-secondary)', borderRadius: '4px', marginBottom: 'var(--spacing-md)' }}></div>
                    <div style={{ height: '60px', background: 'var(--color-bg-secondary)', borderRadius: '8px' }}></div>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="card" style={{
                padding: 'var(--spacing-lg)',
                background: 'var(--color-error-bg)',
                border: '1px solid var(--color-error)'
            }}>
                <div className="text-error font-bold">⚠️ {error}</div>
                <button className="btn btn-sm btn-primary mt-md" onClick={fetchAlerts}>
                    Retry
                </button>
            </div>
        );
    }

    if (visibleAlerts.length === 0) {
        return (
            <div className="card" style={{
                padding: 'var(--spacing-lg)',
                background: 'linear-gradient(135deg, #10b98120, #10b98105)',
                border: '1px solid #10b98140',
                textAlign: 'center'
            }}>
                <div style={{ fontSize: '48px', marginBottom: 'var(--spacing-sm)' }}>🎯</div>
                <div className="font-bold text-lg mb-xs" style={{ color: '#10b981' }}>
                    Semua Terkendali
                </div>
                <div className="text-sm text-secondary">
                    Tidak ada prediksi atau peringatan saat ini.
                </div>
            </div>
        );
    }

    return (
        <div className="card">
            <header className="card-header mb-md">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--spacing-sm)' }}>
                    <div>
                        <h3 className="text-lg font-bold flex items-center gap-sm">
                            🔮 Predictive Intelligence
                            <span className="badge badge-primary" style={{ fontSize: '10px' }}>
                                {visibleAlerts.length} ALERTS
                            </span>
                        </h3>
                        <p className="text-xs text-secondary">
                            AI-powered forecasting • Palantir-style
                        </p>
                    </div>
                    <div className="text-xs text-muted">
                        Updated: {lastUpdate?.toLocaleTimeString('id-ID')}
                    </div>
                </div>
            </header>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' }}>
                {visibleAlerts.map((alert) => {
                    const config = SEVERITY_CONFIG[alert.severity] || SEVERITY_CONFIG.info;
                    return (
                        <div
                            key={alert.id}
                            style={{
                                background: config.bg,
                                border: `1px solid ${config.color}40`,
                                borderLeft: `4px solid ${config.color}`,
                                borderRadius: '8px',
                                padding: 'var(--spacing-md)',
                                position: 'relative'
                            }}
                        >
                            {/* Dismiss button */}
                            <button
                                onClick={() => dismissAlert(alert.id)}
                                style={{
                                    position: 'absolute',
                                    top: '8px',
                                    right: '8px',
                                    background: 'transparent',
                                    border: 'none',
                                    cursor: 'pointer',
                                    color: 'var(--color-text-muted)',
                                    fontSize: '16px',
                                    padding: '4px'
                                }}
                                title="Dismiss"
                            >
                                ×
                            </button>

                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--spacing-md)' }}>
                                {/* Icon */}
                                <div style={{ fontSize: '24px' }}>
                                    {config.icon}
                                </div>

                                {/* Content */}
                                <div style={{ flex: 1, paddingRight: 'var(--spacing-lg)' }}>
                                    <div className="font-bold text-sm mb-xs" style={{ color: config.color }}>
                                        {alert.title}
                                    </div>
                                    <div className="text-sm mb-sm">
                                        {alert.description}
                                    </div>

                                    {/* Action recommendation */}
                                    {alert.action && (
                                        <div
                                            className="text-xs"
                                            style={{
                                                background: 'var(--color-bg-primary)',
                                                padding: 'var(--spacing-sm)',
                                                borderRadius: '6px',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: 'var(--spacing-xs)'
                                            }}
                                        >
                                            <span>💡</span>
                                            <span>{alert.action}</span>
                                        </div>
                                    )}

                                    {/* Confidence & ETA */}
                                    <div className="text-xs text-muted mt-sm" style={{ display: 'flex', gap: 'var(--spacing-md)', flexWrap: 'wrap' }}>
                                        {alert.confidence && (
                                            <span>
                                                📊 Confidence: {(alert.confidence * 100).toFixed(0)}%
                                            </span>
                                        )}
                                        {alert.eta && (
                                            <span>
                                                ⏱️ ETA: {new Date(alert.eta).toLocaleDateString('id-ID', {
                                                    day: 'numeric',
                                                    month: 'short'
                                                })}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Refresh button */}
            <div style={{ marginTop: 'var(--spacing-md)', textAlign: 'center' }}>
                <button
                    className="btn btn-ghost btn-sm"
                    onClick={fetchAlerts}
                >
                    🔄 Refresh Predictions
                </button>
            </div>
        </div>
    );
}
