import { useRegionalData } from '@/hooks/useRegionalData';
import { formatCurrency } from '@/lib/db';

export default function RegionalInsightsWidget() {
    const { data, loading, error } = useRegionalData();

    if (loading) return <div className="card animate-pulse" style={{ height: '300px' }}></div>;
    if (error || !data) return null;

    const { prediction, weather, upcoming_events, trends } = data;
    const todayWeather = weather[0] || {};

    // Determine status color based on prediction
    const getStatusColor = (impact) => {
        if (impact > 1.2) return 'var(--color-success)';
        if (impact < 0.9) return 'var(--color-error)';
        return 'var(--color-primary)';
    };

    return (
        <div className="card">
            <header className="card-header flex justify-between items-center mb-md">
                <h3 className="text-lg font-bold flex items-center gap-sm">
                    🗺️ Regional Intelligence: Palangka Raya
                </h3>
                <span className="badge badge-primary">{new Date().toLocaleDateString('id-ID', { dateStyle: 'full' })}</span>
            </header>

            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                gap: 'var(--spacing-lg)'
            }}>

                {/* 📊 Prediction Card */}
                <div style={{ background: 'var(--color-bg-secondary)', padding: '16px', borderRadius: '12px' }}>
                    <div className="text-sm text-secondary mb-xs">Prediksi Sales Hari Ini</div>
                    <div className="text-2xl font-bold mb-xs" style={{ color: 'var(--color-primary)' }}>
                        {formatCurrency(prediction.predicted_revenue.mid)}
                    </div>
                    <div className="text-xs text-secondary mb-md">
                        Confidence: <span style={{ color: prediction.confidence > 80 ? 'var(--color-success)' : 'var(--color-warning)' }}>{prediction.confidence}%</span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-xs)' }}>
                        {prediction.factors.map((factor, idx) => (
                            <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px' }}>
                                <span>{factor.name}</span>
                                <span style={{ fontWeight: 'bold', color: factor.impact.includes('+') ? 'var(--color-success)' : 'var(--color-error)' }}>
                                    {factor.impact}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* 🌦️ Weather & Trends */}
                <div style={{ background: 'var(--color-bg-secondary)', padding: '16px', borderRadius: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)', marginBottom: 'var(--spacing-md)' }}>
                        <div style={{ fontSize: '32px' }}>
                            {todayWeather.weather_desc?.toLowerCase().includes('hujan') ? '🌧️' :
                                todayWeather.weather_desc?.toLowerCase().includes('cerah') ? '☀️' : '☁️'}
                        </div>
                        <div>
                            <div className="font-bold">{todayWeather.weather_desc || 'Berawan'}</div>
                            <div className="text-sm text-secondary">
                                {todayWeather.temperature}°C • {todayWeather.humidity}% Humidity
                            </div>
                        </div>
                    </div>

                    <div className="text-sm font-bold mb-xs mt-md">📈 Tren Pencarian Lokal</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--spacing-xs)' }}>
                        {trends?.food_beverage?.slice(0, 3).map((t, idx) => (
                            <span key={idx} className="badge badge-outline text-xs">
                                {t.trend === 'rising' ? '🔥' : '•'} {t.term}
                            </span>
                        ))}
                    </div>
                </div>

                {/* 📅 Upcoming Events */}
                <div style={{ background: 'var(--color-bg-secondary)', padding: '16px', borderRadius: '12px' }}>
                    <div className="text-sm font-bold mb-sm">📅 Event Mendatang</div>
                    {upcoming_events.length === 0 ? (
                        <div className="text-sm text-secondary">Tidak ada event besar minggu ini.</div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-sm)' }}>
                            {upcoming_events.map((event, idx) => (
                                <div key={idx} style={{ display: 'flex', gap: 'var(--spacing-sm)', alignItems: 'flex-start' }}>
                                    <div style={{
                                        background: 'var(--color-bg-primary)',
                                        padding: '4px 8px',
                                        borderRadius: '6px',
                                        fontSize: '12px',
                                        textAlign: 'center',
                                        minWidth: '50px'
                                    }}>
                                        <div className="font-bold">{new Date(event.date).getDate()}</div>
                                        <div className="text-xs">{new Date(event.date).toLocaleDateString('id-ID', { month: 'short' })}</div>
                                    </div>
                                    <div>
                                        <div className="text-sm font-bold">{event.name}</div>
                                        <div className="text-xs text-secondary">
                                            Impact: <span style={{ color: event.impact > 1 ? 'var(--color-success)' : 'var(--color-secondary)' }}>
                                                {event.impact > 1 ? '+' : ''}{Math.round((event.impact - 1) * 100)}% Sales
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* 💡 Menu R&D (Viral Trends) */}
                <div style={{ background: 'var(--color-bg-secondary)', padding: '16px', borderRadius: '12px' }}>
                    <div className="text-sm font-bold mb-sm">💡 Ide Menu Viral (RnD)</div>

                    {data.menu_recommendations ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' }}>
                            {data.menu_recommendations.map((item, idx) => (
                                <div key={idx} style={{
                                    borderLeft: '3px solid var(--color-primary)',
                                    paddingLeft: 'var(--spacing-sm)'
                                }}>
                                    <div className="flex justify-between items-center mb-xs">
                                        <span className="font-bold text-sm">{item.name}</span>
                                        <span className="badge badge-warning text-xs">Viral!</span>
                                    </div>

                                    <div className="text-xs text-secondary mb-xs">
                                        {item.reasons.join(' • ')}
                                    </div>

                                    <div className="text-sm font-bold" style={{ color: 'var(--color-success)' }}>
                                        Saran Harga: {formatCurrency(item.price_range[0])} - {formatCurrency(item.price_range[1])}
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-sm text-secondary">Belum ada data tren terbaru.</div>
                    )}
                </div>

            </div>

            {/* Recommendations */}
            {prediction.recommendations.length > 0 && (
                <div className="mt-md p-md" style={{ background: 'rgba(var(--color-primary-rgb), 0.1)', borderRadius: '8px' }}>
                    <div className="text-sm font-bold mb-xs" style={{ color: 'var(--color-primary)' }}>💡 Rekomendasi Hari Ini:</div>
                    <ul className="list-disc pl-md text-sm space-y-xs">
                        {prediction.recommendations.map((rec, idx) => (
                            <li key={idx}>{rec}</li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
}
