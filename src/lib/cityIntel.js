/**
 * CASHLO CITY INTEL — "Palantir for Palangka Raya"
 * Fuses REAL free public signals into a profit/competitor weapon.
 *
 * Real data sources (all free, no extra key):
 *  - Open-Meteo Air Quality  → PM2.5 / US-AQI → HAZE RISK (kabut asap is THE
 *    Palangka Raya foot-traffic killer in dry season; haze is satellite-modeled).
 *  - Open-Meteo / BMKG weather (via regionalIntelligence.fetchWeatherData).
 *  - Economic cycle (payday "tanggal muda" vs "tanggal tua").
 *  - Day-of-week + local event calendar.
 *  - The shop's own sales average (passed in) to scale Rupiah projections.
 *
 * Upgrade path (optional free key): NASA FIRMS active-fire hotspots for a true
 * satellite fire map → even earlier haze prediction.
 */

import { PALANGKA_RAYA_CONTEXT } from '@/lib/regionalIntelligence';

const PLK = { lat: -2.21, lon: 113.92 };

// ─── Live air quality (haze) ───
export async function fetchAirQuality() {
    try {
        const r = await fetch(
            `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${PLK.lat}&longitude=${PLK.lon}&current=pm2_5,us_aqi,carbon_monoxide&timezone=Asia%2FBangkok`,
            { next: { revalidate: 1800 } }
        );
        if (!r.ok) throw new Error('aqi http ' + r.status);
        const d = await r.json();
        const cur = d.current || {};
        return { pm2_5: cur.pm2_5 ?? null, us_aqi: cur.us_aqi ?? null, source: 'Open-Meteo Air Quality (live)', estimated: false };
    } catch (e) {
        const m = new Date().getMonth() + 1;
        const dry = [6, 7, 8, 9, 10].includes(m); // peak haze season
        return { pm2_5: dry ? 85 : 25, us_aqi: dry ? 145 : 45, source: 'Seasonal estimate (live unavailable)', estimated: true };
    }
}

// ─── NASA FIRMS satellite active-fire hotspots (real satellite data) ───
// Needs a free MAP_KEY from https://firms.modaps.eosdis.nasa.gov/api/map_key/
export async function fetchFireHotspots() {
    const key = process.env.NASA_FIRMS_MAP_KEY;
    if (!key) return { available: false, count: 0, hotspots: [], note: 'NASA_FIRMS_MAP_KEY belum diset — peta titik api nonaktif' };
    // bounding box around Palangka Raya / Central Kalimantan: west,south,east,north
    const area = '112.3,-3.6,115.6,-0.8';
    const url = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${key}/VIIRS_SNPP_NRT/${area}/2`;
    try {
        const r = await fetch(url, { next: { revalidate: 3600 } });
        if (!r.ok) throw new Error('FIRMS http ' + r.status);
        const text = await r.text();
        const lines = text.trim().split('\n');
        if (lines.length < 2) return { available: true, count: 0, hotspots: [], note: 'Tidak ada titik api 2 hari terakhir' };
        const h = lines[0].split(',');
        const iLa = h.indexOf('latitude'), iLo = h.indexOf('longitude'), iCf = h.indexOf('confidence'), iDt = h.indexOf('acq_date'), iFp = h.indexOf('frp');
        const hotspots = lines.slice(1).map(l => {
            const c = l.split(',');
            return { lat: parseFloat(c[iLa]), lon: parseFloat(c[iLo]), confidence: c[iCf], date: c[iDt], frp: parseFloat(c[iFp]) };
        }).filter(p => !isNaN(p.lat));
        return { available: true, count: hotspots.length, hotspots: hotspots.slice(0, 600), note: 'Live NASA FIRMS VIIRS (S-NPP)' };
    } catch (e) {
        return { available: false, count: 0, hotspots: [], note: 'FIRMS error: ' + e.message };
    }
}

// ─── Nearby competitors from OpenStreetMap (free, no key) ───
export async function fetchNearbyPlaces(lat = PLK.lat, lon = PLK.lon, radiusMeters = 4000) {
    const q = `[out:json][timeout:25];(node["amenity"~"cafe|restaurant|fast_food"](around:${radiusMeters},${lat},${lon}););out body 80;`;
    const endpoints = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
    let d = null, lastErr = null;
    for (const ep of endpoints) {
        try {
            const r = await fetch(ep, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'CashloPOS/1.0 (intel)' },
                body: 'data=' + encodeURIComponent(q),
                next: { revalidate: 86400 }
            });
            if (!r.ok) { lastErr = 'Overpass http ' + r.status; continue; }
            d = await r.json();
            break;
        } catch (e) { lastErr = e.message; }
    }
    try {
        if (!d) throw new Error(lastErr || 'Overpass unavailable');
        const places = (d.elements || []).filter(e => e.tags?.name).map(e => ({
            name: e.tags.name, lat: e.lat, lon: e.lon, type: e.tags.amenity
        })).slice(0, 80);
        return { available: true, count: places.length, places, source: 'OpenStreetMap (live)' };
    } catch (e) {
        return { available: false, count: 0, places: [], note: e.message };
    }
}

function hazeRisk(aqi) {
    if (aqi == null) return { level: 'unknown', label: 'Tidak diketahui', multiplier: 1.0, aqi };
    if (aqi <= 50) return { level: 'good', label: 'Udara Baik', multiplier: 1.0, aqi };
    if (aqi <= 100) return { level: 'moderate', label: 'Sedang', multiplier: 0.98, aqi };
    if (aqi <= 150) return { level: 'usg', label: 'Tidak Sehat (Kelompok Sensitif)', multiplier: 0.9, aqi };
    if (aqi <= 200) return { level: 'unhealthy', label: 'Tidak Sehat — Kabut Asap', multiplier: 0.78, aqi };
    if (aqi <= 300) return { level: 'very_unhealthy', label: 'Sangat Tidak Sehat — Asap Tebal', multiplier: 0.6, aqi };
    return { level: 'hazardous', label: 'BERBAHAYA — Asap Ekstrem', multiplier: 0.45, aqi };
}

function weatherFactor(weather) {
    const w = (weather?.weather_desc || '').toLowerCase();
    const t = weather?.temperature ?? 30;
    if (w.includes('badai')) return { multiplier: 0.4, label: 'Badai', mode: 'shutdown' };
    if (w.includes('deras')) return { multiplier: 0.65, label: 'Hujan Deras', mode: 'delivery' };
    if (w.includes('hujan')) return { multiplier: 1.05, label: 'Hujan Ringan', mode: 'comfort' };
    if (t >= 33) return { multiplier: 1.2, label: `Panas ${Math.round(t)}°C`, mode: 'cold_drinks' };
    return { multiplier: 1.0, label: weather?.weather_desc || 'Cerah', mode: 'normal' };
}

function cyclePhase(dom) {
    const c = PALANGKA_RAYA_CONTEXT.economy.cycles;
    if (dom >= 25 || dom <= 5) return { ...c.golden_week, phase: 'golden_week' };
    if (dom >= 21 && dom <= 24) return { ...c.tanggal_tua, phase: 'tanggal_tua' };
    return { ...c.mid_month, phase: 'mid_month' };
}

// ─── MAIN FUSION ───
export function computeCityIntel({ weather, air, avgDailyRevenue = 2000000, competitors = [], fires = null, nearbyCount = null, date = new Date() }) {
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const dayNamesId = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    const dow = date.getDay();
    const dom = date.getDate();
    const month = date.getMonth() + 1;

    const dayMult = PALANGKA_RAYA_CONTEXT.consumer_patterns.day_of_week[dayNames[dow]] || 1.0;
    const cycle = cyclePhase(dom);
    const wf = weatherFactor(weather);
    const haze = hazeRisk(air?.us_aqi);
    const isDry = [5, 6, 7, 8, 9, 10].includes(month);

    const dateStr = date.toISOString().split('T')[0];
    const todayEvent = PALANGKA_RAYA_CONTEXT.events.find(e => e.date === dateStr);
    const eventMult = todayEvent?.impact ?? 1.0;
    const upcoming = PALANGKA_RAYA_CONTEXT.events
        .filter(e => new Date(e.date) >= new Date(date.toDateString()))
        .slice(0, 4);

    const combined = dayMult * cycle.multiplier * wf.multiplier * haze.multiplier * eventMult;
    const demandIndex = Math.max(5, Math.min(99, Math.round((combined / 2.0) * 100)));
    const demandLabel = demandIndex >= 75 ? 'SURGE' : demandIndex >= 55 ? 'Tinggi' : demandIndex >= 40 ? 'Normal' : demandIndex >= 25 ? 'Lesu' : 'Kritis';

    const projRevenue = Math.round(avgDailyRevenue * combined);
    let margin = 0.35 + (cycle.margin_shift || 0) + (wf.mode === 'cold_drinks' ? 0.1 : 0);
    const projProfit = Math.round(projRevenue * margin);

    // ─── SIGNALS (threat / opportunity board) ───
    const signals = [];
    if (cycle.phase === 'golden_week') signals.push({ type: 'opportunity', sev: 'high', title: 'Golden Week / Gajian', detail: 'Daya beli kota naik 40%. Dorong item premium & upsell — pelanggan tidak sensitif harga sekarang.' });
    if (cycle.phase === 'tanggal_tua') signals.push({ type: 'threat', sev: 'med', title: 'Tanggal Tua', detail: 'Dompet kota menipis. Pasang Paket Hemat & bundling sebelum kompetitor merebut pelanggan hemat.' });
    if (haze.level === 'unhealthy' || haze.level === 'very_unhealthy' || haze.level === 'hazardous') {
        signals.push({ type: 'threat', sev: haze.level === 'hazardous' ? 'high' : 'med', title: `Kabut Asap — AQI ${haze.aqi}`, detail: 'Orang malas keluar rumah. Alihkan ke DELIVERY/GrabFood + promo "anti-asap" minuman hangat. Ini saat menyerang kompetitor yang hanya andalkan dine-in.' });
    }
    if (wf.mode === 'cold_drinks') signals.push({ type: 'opportunity', sev: 'med', title: `Cuaca Panas ${Math.round(weather?.temperature || 33)}°C`, detail: 'Permintaan minuman dingin melonjak. Stok es & push menu dingin di depan.' });
    if (wf.mode === 'delivery' || wf.mode === 'comfort') signals.push({ type: 'opportunity', sev: 'med', title: wf.label, detail: 'Cuaca dukung delivery & comfort food. Aktifkan promo gratis ongkir radius dekat.' });
    if (dow === 6 || dow === 0) signals.push({ type: 'opportunity', sev: 'high', title: 'Akhir Pekan', detail: 'Trafik puncak (+35–45%). Kompetitor juga ramai — menangkan dengan flash sale jam 18:00 & live music.' });
    if (dow === 5) signals.push({ type: 'opportunity', sev: 'low', title: 'Jumat', detail: 'Lonjakan sore setelah Jumatan. Siapkan stok jam 13:00–15:00.' });
    if (todayEvent) signals.push({ type: todayEvent.impact >= 1 ? 'opportunity' : 'threat', sev: 'high', title: `Event: ${todayEvent.name}`, detail: todayEvent.impact >= 1 ? `Impact +${Math.round((todayEvent.impact - 1) * 100)}%. Tema promo sesuai event.` : 'Banyak yang libur/mudik — pertimbangkan jam buka lebih pendek.' });
    if (isDry) signals.push({ type: 'opportunity', sev: 'low', title: 'Musim Kering', detail: 'Minuman dingin & es jadi primadona sampai Oktober.' });

    // SATELLITE FIRE EARLY-WARNING (NASA FIRMS) — haze comes 1-2 days after fires
    if (fires && fires.available && fires.count > 0) {
        const sev = fires.count >= 50 ? 'high' : fires.count >= 15 ? 'med' : 'low';
        signals.push({ type: 'threat', sev, title: `🛰️ ${fires.count} Titik Api Terdeteksi Satelit`, detail: `NASA FIRMS mendeteksi ${fires.count} hotspot kebakaran di sekitar Palangka Raya. Kabut asap biasanya menyusul 1-2 hari. Siapkan stok minuman hangat & rencanakan dorongan delivery SEBELUM asap datang — menangkan pasar saat kompetitor belum siap.` });
    }
    if (nearbyCount != null && nearbyCount > 0) {
        const dens = nearbyCount >= 25 ? 'sangat padat' : nearbyCount >= 10 ? 'padat' : 'sedang';
        signals.push({ type: nearbyCount >= 25 ? 'threat' : 'opportunity', sev: 'low', title: `Persaingan ${dens} (${nearbyCount} F&B sekitar)`, detail: nearbyCount >= 25 ? 'Banyak pesaing di radius 4km. Diferensiasi via loyalti, kualitas, & jam buka yang menutup celah kompetitor.' : 'Persaingan belum jenuh — peluang merebut pangsa pasar dengan ekspansi jam & menu.' });
    }

    // ─── COMPETITOR BATTLE PLAN ───
    const battlePlan = [];
    if (demandIndex >= 70) {
        battlePlan.push({ priority: 'HIGH', icon: '⚔️', action: 'Serang saat ramai', why: `Indeks permintaan ${demandIndex} (${demandLabel}). Pasang flash sale terbatas 1 jam untuk menarik pelanggan dari kompetitor di jam sibuk.` });
        battlePlan.push({ priority: 'HIGH', icon: '💎', action: 'Maksimalkan margin', why: 'Permintaan tinggi = dorong item premium & add-on. Jangan diskon yang tidak perlu.' });
    } else if (demandIndex >= 40) {
        battlePlan.push({ priority: 'MED', icon: '🎯', action: 'Rebut pangsa pasar', why: 'Hari normal. Promo "beli 2 gratis 1" untuk menarik pelanggan kompetitor & bangun loyalitas.' });
    } else {
        battlePlan.push({ priority: 'HIGH', icon: '🛡️', action: 'Mode bertahan + delivery', why: `Permintaan ${demandLabel}. Fokus delivery & paket hemat; potong biaya operasional jam sepi.` });
    }
    if (haze.multiplier < 0.85) battlePlan.push({ priority: 'HIGH', icon: '🏍️', action: 'All-in delivery', why: 'Kabut asap menahan orang di rumah. Gratis ongkir + bundling minuman hangat. Kompetitor dine-in akan sepi — ambil pasar mereka.' });
    if (cycle.phase === 'golden_week') battlePlan.push({ priority: 'MED', icon: '📣', action: 'Iklan saat gajian', why: 'Pasang konten promo di IG/WA sekarang — budget pelanggan paling longgar tanggal 25–5.' });

    // competitor-aware counter-moves (manual competitor watch)
    competitors.forEach(c => {
        if (c.last_promo) battlePlan.push({ priority: 'MED', icon: '🥊', action: `Counter ${c.name}`, why: `${c.name} sedang promo: "${c.last_promo}". Tandingi dengan nilai lebih (poin loyalti / bundling) tanpa perang harga langsung.` });
    });

    return {
        city: 'Palangka Raya',
        generated_at: new Date().toISOString(),
        demand: { index: demandIndex, label: demandLabel },
        projection: { revenue: projRevenue, profit: projProfit, margin_percent: Math.round(margin * 100), confidence: air?.estimated ? 62 : 78 },
        environment: {
            temperature: weather?.temperature ?? null,
            weather_desc: weather?.weather_desc ?? null,
            weather_mode: wf.mode,
            pm2_5: air?.pm2_5 ?? null,
            us_aqi: haze.aqi ?? null,
            haze,
            season: isDry ? 'Kemarau' : 'Hujan',
        },
        cycle: { phase: cycle.phase, label: cycle.label, multiplier: cycle.multiplier },
        day: { name: dayNamesId[dow], multiplier: dayMult },
        factors: [
            { name: `Hari ${dayNamesId[dow]}`, impact: pct(dayMult) },
            { name: cycle.label, impact: pct(cycle.multiplier) },
            { name: `Cuaca: ${wf.label}`, impact: pct(wf.multiplier) },
            { name: `Udara: ${haze.label}`, impact: pct(haze.multiplier) },
            ...(todayEvent ? [{ name: `Event: ${todayEvent.name}`, impact: pct(eventMult) }] : []),
        ],
        signals,
        battle_plan: battlePlan,
        upcoming_events: upcoming,
        fires: fires ? { available: fires.available, count: fires.count, note: fires.note } : null,
        data_sources: [
            { name: 'Air Quality / Haze', status: air?.estimated ? 'estimated' : 'live', detail: air?.source },
            { name: 'Weather', status: weather?.estimated ? 'estimated' : 'live', detail: weather?.source || 'BMKG/Open-Meteo' },
            { name: 'Satellite Fire (NASA FIRMS)', status: fires?.available ? 'live' : 'available', detail: fires?.note || 'Aktifkan dengan MAP_KEY gratis' },
            { name: 'Competitor Map (OpenStreetMap)', status: nearbyCount != null ? 'live' : 'available', detail: nearbyCount != null ? `${nearbyCount} F&B terdeteksi radius 4km` : 'Peta pesaing dari data OSM' },
            { name: 'Economic Cycle', status: 'model', detail: 'Payday / tanggal tua' },
            { name: 'Event Calendar', status: 'model', detail: 'Kalender lokal Palangka Raya' },
        ],
    };
}

function pct(m) {
    const v = Math.round((m - 1) * 100);
    return `${v >= 0 ? '+' : ''}${v}%`;
}
