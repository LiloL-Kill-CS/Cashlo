import { useState, useEffect, useCallback } from 'react';
import Head from 'next/head';
import Sidebar from '@/components/layout/Sidebar';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { formatCurrency } from '@/lib/db';
import IntelMap from '@/components/provitina/IntelMap';

const HAZE_COLORS = {
    good: '#22C55E', moderate: '#84CC16', usg: '#EAB308',
    unhealthy: '#F97316', very_unhealthy: '#EF4444', hazardous: '#B91C1C', unknown: '#888'
};

export default function ProvitinaPage() {
    const { user, loading: authLoading } = useAuth();
    const owner = user?.owner_id || user?.id;

    const [intel, setIntel] = useState(null);
    const [loading, setLoading] = useState(true);
    const [competitors, setCompetitors] = useState([]);
    const [mapData, setMapData] = useState({ fires: { hotspots: [], count: 0, available: false }, places: { places: [], count: 0 } });
    const [showCompForm, setShowCompForm] = useState(false);
    const [compForm, setCompForm] = useState({ name: '', location: '', price_level: 'setara', last_promo: '', notes: '' });

    useEffect(() => { if (!authLoading && !user) window.location.href = '/'; }, [user, authLoading]);

    const loadCompetitors = useCallback(async () => {
        if (!owner) return [];
        const { data } = await supabase.from('competitors').select('*').order('created_at', { ascending: false });
        setCompetitors(data || []);
        return data || [];
    }, [owner]);

    const loadIntel = useCallback(async (comps) => {
        if (!owner) return;
        // Shop's own 30-day average → scales the Rupiah projection
        let avg = 2000000;
        try {
            const since = new Date(); since.setDate(since.getDate() - 30);
            const { data: txns } = await supabase.from('transactions')
                .select('subtotal, datetime').gte('datetime', since.toISOString()).neq('status', 'voided');
            if (txns && txns.length) {
                const days = new Set(txns.map(t => (t.datetime || '').slice(0, 10))).size || 1;
                avg = Math.round(txns.reduce((s, t) => s + (t.subtotal || 0), 0) / days);
            }
        } catch (e) { /* keep default */ }

        try {
            const res = await fetch(`/api/regional-data?type=full&avgDailyRevenue=${avg}`);
            const json = await res.json();
            const data = json.data || {};
            // Fold competitor counter-moves into the battle plan client-side
            const cmps = comps || competitors;
            const counter = cmps.filter(c => c.last_promo).map(c => ({
                priority: 'MED', icon: '🥊', action: `Counter ${c.name}`,
                why: `${c.name} promo: "${c.last_promo}". Tandingi dengan nilai (poin/bundling), hindari perang harga langsung.`
            }));
            data.intel.battle_plan = [...(data.intel.battle_plan || []), ...counter];
            setIntel(data.intel);
        } catch (e) { console.error('intel load failed', e); }
        setLoading(false);
    }, [owner, competitors]);

    useEffect(() => {
        if (!owner) return;
        (async () => { const comps = await loadCompetitors(); await loadIntel(comps); })();
        // Map layer (satellite fires + nearby competitors) loads separately — slower
        fetch('/api/regional-data?type=map').then(r => r.json()).then(j => {
            if (j.data) setMapData(j.data);
        }).catch(() => { });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [owner]);

    const addCompetitor = async (e) => {
        e.preventDefault();
        if (!compForm.name) return;
        await supabase.from('competitors').insert([{ ...compForm }]);
        setCompForm({ name: '', location: '', price_level: 'setara', last_promo: '', notes: '' });
        setShowCompForm(false);
        const comps = await loadCompetitors();
        await loadIntel(comps);
    };

    const deleteCompetitor = async (id) => {
        if (!confirm('Hapus kompetitor ini dari watchlist?')) return;
        await supabase.from('competitors').delete().eq('id', id);
        const comps = await loadCompetitors();
        await loadIntel(comps);
    };

    if (loading || !intel) {
        return (
            <div className="app-container">
                <Sidebar activePage="provitina" userRole={user?.role} />
                <main className="main-content prov-bg" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', flexDirection: 'column', gap: 16 }}>
                    <div className="prov-spinner" />
                    <div style={{ color: 'var(--color-accent)', letterSpacing: '0.1em', fontSize: 13 }}>MENGUMPULKAN INTEL KOTA…</div>
                    <ProvStyles />
                </main>
            </div>
        );
    }

    const env = intel.environment;
    const hazeColor = HAZE_COLORS[env.haze?.level] || '#888';
    const demandColor = intel.demand.index >= 75 ? '#22C55E' : intel.demand.index >= 40 ? 'var(--color-accent)' : '#EF4444';

    return (
        <div className="app-container">
            <Head><title>Cashlo Intel | Command Palangka Raya</title></Head>
            <Sidebar activePage="provitina" userRole={user?.role} />
            <main className="main-content prov-bg">
                {/* Top bar */}
                <div className="prov-topbar">
                    <div>
                        <div className="prov-kicker">⬢ CASHLO INTEL — COMMAND CENTER</div>
                        <h1 className="prov-title">Palangka Raya Live Intelligence</h1>
                    </div>
                    <div className="prov-demand-badge" style={{ borderColor: demandColor, color: demandColor }}>
                        <span className="dot" style={{ background: demandColor }} />
                        DEMAND {intel.demand.label}
                    </div>
                </div>

                <div className="prov-wrap">
                    {mapData.fires?.count > 0 && (
                        <div className="prov-fire-banner">
                            🛰️🔥 <b>{mapData.fires.count} titik api</b> terdeteksi satelit di sekitar Palangka Raya — kabut asap berpotensi datang 1–2 hari. Aktifkan strategi delivery & stok minuman hangat sekarang, sebelum kompetitor.
                        </div>
                    )}
                    {/* HERO: demand gauge + projection */}
                    <div className="prov-hero">
                        <div className="prov-card prov-gauge-card">
                            <div className="prov-section-label">Indeks Permintaan Kota</div>
                            <div className="prov-gauge">
                                <div className="prov-gauge-num" style={{ color: demandColor }}>{intel.demand.index}</div>
                                <div className="prov-gauge-max">/100</div>
                            </div>
                            <div className="prov-gauge-bar"><div style={{ width: `${intel.demand.index}%`, background: demandColor }} /></div>
                            <div className="prov-factors">
                                {intel.factors.map((f, i) => (
                                    <div key={i} className="prov-factor">
                                        <span>{f.name}</span>
                                        <span style={{ color: f.impact.startsWith('+') ? '#22C55E' : f.impact.startsWith('-') ? '#EF4444' : 'var(--color-text-muted)' }}>{f.impact}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="prov-card prov-proj-card">
                            <div className="prov-section-label">Proyeksi Hari Ini</div>
                            <div className="prov-proj-rev">{formatCurrency(intel.projection.revenue)}</div>
                            <div className="prov-proj-sub">Estimasi Profit <b style={{ color: '#22C55E' }}>{formatCurrency(intel.projection.profit)}</b> · Margin {intel.projection.margin_percent}%</div>
                            <div className="prov-conf">Confidence {intel.projection.confidence}% · disesuaikan dengan rata-rata penjualanmu</div>
                        </div>
                    </div>

                    {/* LIVE CITY SIGNALS */}
                    <div className="prov-section-label" style={{ marginTop: 28 }}>📡 Sinyal Kota Real-Time</div>
                    <div className="prov-signals-grid">
                        <div className="prov-card prov-stat">
                            <div className="prov-stat-icon">🌡️</div>
                            <div className="prov-stat-val">{env.temperature != null ? Math.round(env.temperature) + '°C' : '—'}</div>
                            <div className="prov-stat-label">{env.weather_desc || 'Cuaca'} · {env.season}</div>
                        </div>
                        <div className="prov-card prov-stat" style={{ borderColor: hazeColor + '55' }}>
                            <div className="prov-stat-icon">🌫️</div>
                            <div className="prov-stat-val" style={{ color: hazeColor }}>AQI {env.us_aqi ?? '—'}</div>
                            <div className="prov-stat-label" style={{ color: hazeColor }}>{env.haze?.label}</div>
                        </div>
                        <div className="prov-card prov-stat">
                            <div className="prov-stat-icon">💸</div>
                            <div className="prov-stat-val">{intel.cycle.label.split('(')[0].trim()}</div>
                            <div className="prov-stat-label">Siklus ekonomi · {intel.day.name}</div>
                        </div>
                        <div className="prov-card prov-stat">
                            <div className="prov-stat-icon">🛰️</div>
                            <div className="prov-stat-val">PM2.5 {env.pm2_5 != null ? Math.round(env.pm2_5) : '—'}</div>
                            <div className="prov-stat-label">Partikel asap (µg/m³)</div>
                        </div>
                    </div>

                    {/* INTEL MAP — satellite fires + competitor locations */}
                    <div className="prov-section-label" style={{ marginTop: 28 }}>🗺️ Peta Intel — Titik Api Satelit & Pesaing Sekitar</div>
                    <div className="prov-card" style={{ padding: 14 }}>
                        <IntelMap fires={mapData.fires?.hotspots || []} places={mapData.places?.places || []} competitors={competitors} />
                        <div className="prov-map-legend">
                            <span><i style={{ background: '#C98A4B' }} /> Toko Anda</span>
                            <span><i style={{ background: '#F97316' }} /> Titik api satelit{mapData.fires?.available ? ` (${mapData.fires.count})` : ' — set NASA_FIRMS_MAP_KEY'}</span>
                            <span><i style={{ background: '#EAB308' }} /> Pesaing F&B sekitar ({mapData.places?.count || 0})</span>
                        </div>
                    </div>

                    {/* TWO COLUMNS: signals board + battle plan */}
                    <div className="prov-two-col">
                        <div className="prov-card">
                            <div className="prov-section-label">⚠️ Papan Ancaman & Peluang</div>
                            <div className="prov-signal-list">
                                {intel.signals.length === 0 && <div className="prov-empty">Kondisi netral — tidak ada sinyal kuat.</div>}
                                {intel.signals.map((s, i) => (
                                    <div key={i} className={`prov-signal prov-signal-${s.type}`}>
                                        <div className="prov-signal-head">
                                            <span className="prov-signal-tag">{s.type === 'opportunity' ? '▲ PELUANG' : '▼ ANCAMAN'}</span>
                                            <span className="prov-signal-title">{s.title}</span>
                                            <span className={`prov-sev prov-sev-${s.sev}`}>{s.sev}</span>
                                        </div>
                                        <div className="prov-signal-detail">{s.detail}</div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="prov-card">
                            <div className="prov-section-label">⚔️ Battle Plan — Kalahkan Kompetitor</div>
                            <div className="prov-battle-list">
                                {intel.battle_plan.map((b, i) => (
                                    <div key={i} className="prov-battle">
                                        <div className="prov-battle-icon">{b.icon}</div>
                                        <div>
                                            <div className="prov-battle-head">
                                                <span className={`prov-pri prov-pri-${b.priority}`}>{b.priority}</span>
                                                <b>{b.action}</b>
                                            </div>
                                            <div className="prov-battle-why">{b.why}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* COMPETITOR WATCH */}
                    <div className="prov-card" style={{ marginTop: 28 }}>
                        <div className="prov-card-head">
                            <div className="prov-section-label" style={{ margin: 0 }}>🎯 Competitor Watch</div>
                            <button className="btn btn-primary btn-sm" onClick={() => setShowCompForm(v => !v)}>{showCompForm ? 'Tutup' : '+ Tambah Kompetitor'}</button>
                        </div>
                        {showCompForm && (
                            <form onSubmit={addCompetitor} className="prov-comp-form">
                                <input className="input" placeholder="Nama kompetitor *" value={compForm.name} onChange={e => setCompForm(f => ({ ...f, name: e.target.value }))} required />
                                <input className="input" placeholder="Lokasi" value={compForm.location} onChange={e => setCompForm(f => ({ ...f, location: e.target.value }))} />
                                <select className="input" value={compForm.price_level} onChange={e => setCompForm(f => ({ ...f, price_level: e.target.value }))}>
                                    <option value="murah">Harga lebih murah</option>
                                    <option value="setara">Harga setara</option>
                                    <option value="mahal">Harga lebih mahal</option>
                                </select>
                                <input className="input" placeholder='Promo terakhir (mis. "beli 1 gratis 1")' value={compForm.last_promo} onChange={e => setCompForm(f => ({ ...f, last_promo: e.target.value }))} />
                                <button className="btn btn-primary" type="submit">Simpan</button>
                            </form>
                        )}
                        <div className="prov-comp-list">
                            {competitors.length === 0 && <div className="prov-empty">Belum ada kompetitor dipantau. Tambahkan untuk dapat rekomendasi serangan balik.</div>}
                            {competitors.map(c => (
                                <div key={c.id} className="prov-comp">
                                    <div>
                                        <div className="prov-comp-name">{c.name} <span className={`prov-price prov-price-${c.price_level}`}>{c.price_level}</span></div>
                                        <div className="prov-comp-meta">{c.location || '—'}{c.last_promo ? ` · promo: ${c.last_promo}` : ''}</div>
                                    </div>
                                    <button className="btn btn-ghost btn-sm text-error" onClick={() => deleteCompetitor(c.id)}>🗑️</button>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* EVENTS + DATA SOURCES */}
                    <div className="prov-two-col" style={{ marginTop: 28 }}>
                        <div className="prov-card">
                            <div className="prov-section-label">📅 Event Mendatang</div>
                            <div className="prov-events">
                                {intel.upcoming_events.map((e, i) => (
                                    <div key={i} className="prov-event">
                                        <span>{e.name}</span>
                                        <span className="prov-event-date">{new Date(e.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="prov-card">
                            <div className="prov-section-label">🔌 Sumber Data</div>
                            <div className="prov-sources">
                                {intel.data_sources.map((d, i) => (
                                    <div key={i} className="prov-source">
                                        <span className={`prov-src-dot prov-src-${d.status}`} />
                                        <span className="prov-src-name">{d.name}</span>
                                        <span className="prov-src-status">{d.status}</span>
                                    </div>
                                ))}
                            </div>
                            <div className="prov-src-note">Live = ditarik real-time · model = mesin prediksi · available = bisa diaktifkan</div>
                        </div>
                    </div>

                    <div className="prov-footer">Cashlo Intel Engine · diperbarui {new Date(intel.generated_at).toLocaleTimeString('id-ID')} · {intel.city}</div>
                </div>
                <ProvStyles />
            </main>
        </div>
    );
}

function ProvStyles() {
    return (
        <style jsx global>{`
            .prov-bg { background: var(--provitina-gradient); min-height: 100vh; color: var(--provitina-text); }
            .prov-spinner { width: 40px; height: 40px; border: 3px solid rgba(201,138,75,0.2); border-top-color: var(--color-accent); border-radius: 50%; animation: spin 1s linear infinite; }
            .prov-topbar { display: flex; justify-content: space-between; align-items: center; padding: 22px 32px; border-bottom: 1px solid var(--provitina-border); position: sticky; top: 0; background: rgba(10,10,10,0.85); backdrop-filter: blur(10px); z-index: 30; }
            .prov-kicker { font-size: 11px; letter-spacing: 0.15em; color: var(--color-accent); font-weight: 700; }
            .prov-title { font-size: 24px; font-weight: 800; letter-spacing: -0.02em; margin-top: 4px; }
            .prov-demand-badge { display: flex; align-items: center; gap: 8px; border: 1px solid; padding: 8px 16px; border-radius: 999px; font-weight: 700; font-size: 13px; letter-spacing: 0.05em; }
            .prov-demand-badge .dot { width: 8px; height: 8px; border-radius: 50%; animation: pulse 2s infinite; }
            .prov-wrap { padding: 28px 32px 60px; max-width: 1300px; margin: 0 auto; }
            .prov-card { background: var(--provitina-card-bg); border: 1px solid var(--provitina-border); border-radius: 16px; padding: 22px; }
            .prov-section-label { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--provitina-text-secondary); margin-bottom: 14px; }
            .prov-hero { display: grid; grid-template-columns: 1.3fr 1fr; gap: 20px; }
            .prov-gauge { display: flex; align-items: baseline; gap: 6px; }
            .prov-gauge-num { font-size: 64px; font-weight: 800; line-height: 1; letter-spacing: -0.03em; }
            .prov-gauge-max { font-size: 20px; color: var(--color-text-muted); }
            .prov-gauge-bar { height: 8px; background: #2A241E; border-radius: 999px; overflow: hidden; margin: 14px 0 18px; }
            .prov-gauge-bar > div { height: 100%; border-radius: 999px; transition: width .6s ease; }
            .prov-factors { display: flex; flex-direction: column; gap: 8px; }
            .prov-factor { display: flex; justify-content: space-between; font-size: 13px; color: var(--provitina-text-secondary); }
            .prov-proj-card { display: flex; flex-direction: column; justify-content: center; }
            .prov-proj-rev { font-size: 40px; font-weight: 800; letter-spacing: -0.02em; }
            .prov-proj-sub { color: var(--provitina-text-secondary); margin-top: 8px; font-size: 14px; }
            .prov-conf { color: var(--color-text-muted); font-size: 12px; margin-top: 12px; }
            .prov-signals-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }
            .prov-stat { text-align: center; padding: 18px; }
            .prov-stat-icon { font-size: 24px; }
            .prov-stat-val { font-size: 22px; font-weight: 800; margin: 8px 0 4px; }
            .prov-stat-label { font-size: 12px; color: var(--provitina-text-secondary); }
            .prov-two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 20px; }
            .prov-signal-list, .prov-battle-list { display: flex; flex-direction: column; gap: 12px; }
            .prov-signal { border-radius: 12px; padding: 14px; border-left: 3px solid; background: #1a1611; }
            .prov-signal-opportunity { border-color: #22C55E; }
            .prov-signal-threat { border-color: #EF4444; }
            .prov-signal-head { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; flex-wrap: wrap; }
            .prov-signal-tag { font-size: 10px; font-weight: 800; letter-spacing: 0.05em; }
            .prov-signal-opportunity .prov-signal-tag { color: #22C55E; }
            .prov-signal-threat .prov-signal-tag { color: #EF4444; }
            .prov-signal-title { font-weight: 700; font-size: 14px; }
            .prov-sev { margin-left: auto; font-size: 10px; text-transform: uppercase; padding: 2px 8px; border-radius: 999px; background: #2A241E; color: var(--provitina-text-secondary); }
            .prov-sev-high { background: rgba(239,68,68,0.18); color: #F87171; }
            .prov-signal-detail { font-size: 13px; line-height: 1.55; color: var(--provitina-text-secondary); }
            .prov-battle { display: flex; gap: 12px; padding: 12px; border-radius: 12px; background: #1a1611; }
            .prov-battle-icon { font-size: 20px; }
            .prov-battle-head { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
            .prov-pri { font-size: 10px; font-weight: 800; padding: 2px 7px; border-radius: 999px; }
            .prov-pri-HIGH { background: var(--color-accent); color: #1a1410; }
            .prov-pri-MED { background: #2A241E; color: var(--color-accent); }
            .prov-battle-why { font-size: 13px; line-height: 1.55; color: var(--provitina-text-secondary); }
            .prov-card-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
            .prov-comp-form { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; margin-bottom: 16px; }
            .prov-comp-list { display: flex; flex-direction: column; gap: 10px; }
            .prov-comp { display: flex; justify-content: space-between; align-items: center; padding: 12px 14px; background: #1a1611; border-radius: 10px; }
            .prov-comp-name { font-weight: 700; display: flex; align-items: center; gap: 8px; }
            .prov-comp-meta { font-size: 12px; color: var(--provitina-text-secondary); margin-top: 2px; }
            .prov-price { font-size: 10px; padding: 2px 8px; border-radius: 999px; text-transform: uppercase; }
            .prov-price-murah { background: rgba(239,68,68,0.18); color: #F87171; }
            .prov-price-setara { background: #2A241E; color: var(--provitina-text-secondary); }
            .prov-price-mahal { background: rgba(34,197,94,0.18); color: #4ADE80; }
            .prov-events, .prov-sources { display: flex; flex-direction: column; gap: 10px; }
            .prov-event { display: flex; justify-content: space-between; font-size: 14px; padding-bottom: 8px; border-bottom: 1px solid var(--provitina-border); }
            .prov-event-date { color: var(--color-accent); font-weight: 600; }
            .prov-source { display: flex; align-items: center; gap: 10px; font-size: 13px; }
            .prov-src-dot { width: 8px; height: 8px; border-radius: 50%; }
            .prov-src-live { background: #22C55E; box-shadow: 0 0 8px #22C55E; }
            .prov-src-estimated { background: #EAB308; }
            .prov-src-model { background: var(--color-accent); }
            .prov-src-available { background: #555; }
            .prov-src-name { flex: 1; }
            .prov-src-status { font-size: 11px; text-transform: uppercase; color: var(--provitina-text-secondary); }
            .prov-src-note { font-size: 11px; color: var(--color-text-muted); margin-top: 12px; }
            .prov-empty { color: var(--color-text-muted); font-size: 13px; padding: 8px 0; }
            .prov-fire-banner { background: linear-gradient(135deg, rgba(239,68,68,0.18), rgba(249,115,22,0.12)); border: 1px solid rgba(249,115,22,0.4); border-radius: 12px; padding: 14px 18px; margin-bottom: 22px; font-size: 14px; line-height: 1.5; }
            .prov-map-legend { display: flex; flex-wrap: wrap; gap: 18px; margin-top: 12px; padding: 0 6px; font-size: 12px; color: var(--provitina-text-secondary); }
            .prov-map-legend span { display: flex; align-items: center; gap: 6px; }
            .prov-map-legend i { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
            .prov-footer { text-align: center; color: var(--color-text-muted); font-size: 12px; margin-top: 36px; }
            @media (max-width: 900px) {
                .prov-hero, .prov-two-col { grid-template-columns: 1fr; }
                .prov-signals-grid { grid-template-columns: repeat(2, 1fr); }
            }
        `}</style>
    );
}

export const getServerSideProps = async () => { return { props: {} }; };
