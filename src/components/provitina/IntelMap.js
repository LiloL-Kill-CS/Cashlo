import { useEffect, useRef } from 'react';

// Leaflet loaded from CDN (no npm install). Dark Carto tiles match the warm theme.
// Free tiles + free OSM data. Markers: your shop, satellite fires, nearby cafes.
const PLK = { lat: -2.21, lon: 113.92 };

function ensureLeaflet() {
    return new Promise((resolve) => {
        if (typeof window === 'undefined') return resolve(null);
        if (window.L) return resolve(window.L);
        if (!document.getElementById('leaflet-css')) {
            const link = document.createElement('link');
            link.id = 'leaflet-css';
            link.rel = 'stylesheet';
            link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
            document.head.appendChild(link);
        }
        let s = document.getElementById('leaflet-js');
        if (s) { s.addEventListener('load', () => resolve(window.L)); if (window.L) resolve(window.L); return; }
        s = document.createElement('script');
        s.id = 'leaflet-js';
        s.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
        s.onload = () => resolve(window.L);
        document.body.appendChild(s);
    });
}

export default function IntelMap({ fires = [], places = [], competitors = [], shop = PLK }) {
    const elRef = useRef(null);
    const mapRef = useRef(null);

    useEffect(() => {
        let cancelled = false;
        ensureLeaflet().then((L) => {
            if (cancelled || !L || !elRef.current) return;
            if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }

            const map = L.map(elRef.current, { zoomControl: true, attributionControl: false }).setView([shop.lat, shop.lon], 12);
            mapRef.current = map;
            L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom: 19, subdomains: 'abcd' }).addTo(map);

            const layers = [];

            // Your shop
            const shopM = L.circleMarker([shop.lat, shop.lon], { radius: 10, color: '#C98A4B', weight: 2, fillColor: '#C98A4B', fillOpacity: 1 })
                .addTo(map).bindPopup('<b>📍 Toko Anda</b>');
            layers.push(shopM);

            // Satellite fires (red/orange)
            fires.forEach(f => {
                if (isNaN(f.lat)) return;
                const m = L.circleMarker([f.lat, f.lon], { radius: 5, color: '#EF4444', weight: 1, fillColor: '#F97316', fillOpacity: 0.85 })
                    .addTo(map).bindPopup(`🔥 Titik api<br>${f.date || ''} · conf ${f.confidence || '-'}`);
                layers.push(m);
            });

            // Nearby competitors (OSM cafes/restaurants) — caramel
            places.forEach(p => {
                if (isNaN(p.lat)) return;
                const m = L.circleMarker([p.lat, p.lon], { radius: 5, color: '#EAB308', weight: 1, fillColor: '#EAB308', fillOpacity: 0.7 })
                    .addTo(map).bindPopup(`☕ <b>${p.name}</b><br><span style="opacity:.7">${p.type || 'F&B'}</span>`);
                layers.push(m);
            });

            // Fit bounds to all points (fall back to city view)
            try {
                if (layers.length > 1) {
                    const grp = L.featureGroup(layers);
                    map.fitBounds(grp.getBounds().pad(0.2), { maxZoom: 13 });
                }
            } catch (e) { /* keep default view */ }

            setTimeout(() => map.invalidateSize(), 200);
        });

        return () => { cancelled = true; if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; } };
    }, [fires, places, shop.lat, shop.lon]);

    return <div ref={elRef} style={{ height: '440px', width: '100%', borderRadius: '14px', overflow: 'hidden', border: '1px solid var(--provitina-border)', background: '#0a0a0a' }} />;
}
