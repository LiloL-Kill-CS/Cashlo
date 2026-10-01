import { useEffect, useRef, useState } from 'react';
import styles from './Sidebar.module.css';

const icons = {
    pos: <><rect x="3" y="4" width="18" height="14" rx="2" /><path d="M7 14h4M3 9h18M7 21h10" /></>,
    inventory: <><path d="M3 8l9-5 9 5v12H3z" /><path d="M3 8l9 5 9-5M12 13v7" /></>,
    products: <><path d="M4 7h16v13H4zM2 4h20v3H2z" /><path d="M9 11h6" /></>,
    purchasing: <><path d="M4 4h16v16H4zM8 2v4M16 2v4M4 9h16" /><path d="M8 14h8M8 17h5" /></>,
    reports: <><path d="M4 20h16M7 17v-5M12 17V5M17 17V9" /></>,
    dashboard: <><rect x="3" y="3" width="8" height="8" rx="1" /><rect x="13" y="3" width="8" height="5" rx="1" /><rect x="3" y="13" width="8" height="8" rx="1" /><rect x="13" y="10" width="8" height="11" rx="1" /></>,
    customers: <><circle cx="9" cy="8" r="3" /><path d="M3 20v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6M17 14a5 5 0 0 1 4 5v1" /></>,
    hpp: <><rect x="5" y="2" width="14" height="20" rx="2" /><path d="M8 7h8M8 11h2M14 11h2M8 15h2M14 15h2M8 19h8" /></>,
    hr: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    ai: <><path d="M12 2l2.2 6.8L21 11l-6.8 2.2L12 20l-2.2-6.8L3 11l6.8-2.2z" /></>,
    provitina: <><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>,
    command: <><circle cx="12" cy="12" r="9" /><path d="M12 3v18M3 12h18" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9L7 7M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1" /></>,
    more: <><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></>,
    logout: <><path d="M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h5M14 7l5 5-5 5M9 12h10" /></>,
};

const primaryItems = [
    { id: 'pos', label: 'Kasir' },
    { id: 'inventory', label: 'Stok' },
    { id: 'products', label: 'Menu' },
    { id: 'purchasing', label: 'Pembelian' },
    { id: 'reports', label: 'Laporan' },
    { id: 'dashboard', label: 'Ringkasan' },
];

const otherItems = [
    { id: 'customers', label: 'Pelanggan' },
    { id: 'hpp', label: 'Hitung HPP' },
    { id: 'hr', label: 'Absensi' },
    { id: 'ai', label: 'Cashlo AI' },
    { id: 'provitina', label: 'Provitina' },
    { id: 'command', label: 'Command Center' },
    { id: 'settings', label: 'Pengaturan' },
];

function Icon({ name }) {
    return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{icons[name]}</svg>;
}

function NavigationLink({ item, activePage }) {
    const active = activePage === item.id;
    return (
        <a href={`/${item.id}`} className={`${styles.link} ${active ? styles.active : ''}`} aria-current={active ? 'page' : undefined} title={item.label}>
            <Icon name={item.id} />
            <span>{item.label}</span>
        </a>
    );
}

export default function Sidebar({ activePage }) {
    const moreRef = useRef(null);
    const primaryRef = useRef(null);
    const [scrollEdges, setScrollEdges] = useState({ left: false, right: false });
    const otherPageActive = otherItems.some((item) => item.id === activePage);

    useEffect(() => {
        const nav = primaryRef.current;
        if (!nav) return;

        function updateScrollEdges() {
            setScrollEdges({
                left: nav.scrollLeft > 1,
                right: nav.scrollLeft + nav.clientWidth < nav.scrollWidth - 1,
            });
        }

        function revealActiveLink() {
            const active = nav.querySelector('[aria-current="page"]');
            if (active) {
                const navBounds = nav.getBoundingClientRect();
                const activeBounds = active.getBoundingClientRect();
                if (activeBounds.left < navBounds.left + 8) {
                    nav.scrollLeft += activeBounds.left - navBounds.left - 8;
                } else if (activeBounds.right > navBounds.right - 8) {
                    nav.scrollLeft += activeBounds.right - navBounds.right + 8;
                }
            }
            updateScrollEdges();
        }

        const frame = window.requestAnimationFrame(revealActiveLink);
        window.addEventListener('resize', revealActiveLink);
        nav.addEventListener('scroll', updateScrollEdges, { passive: true });
        return () => {
            window.cancelAnimationFrame(frame);
            window.removeEventListener('resize', revealActiveLink);
            nav.removeEventListener('scroll', updateScrollEdges);
        };
    }, [activePage]);

    async function logout() {
        try { await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' }); } catch { /* clear local session even while offline */ }
        localStorage.removeItem('cashlo_user');
        localStorage.removeItem('cashlo_token');
        window.location.href = '/';
    }

    function handleMoreKeyDown(event) {
        if (event.key === 'Escape' && moreRef.current?.open) {
            moreRef.current.open = false;
            moreRef.current.querySelector('summary')?.focus();
        }
    }

    return (
        <aside className={`sidebar ${styles.shell}`}>
            <div className={styles.brand} aria-label="Cashlo">
                <span className={styles.brandMark}>C</span>
                <span><strong>Cashlo</strong><small>Operasional toko</small></span>
            </div>
            <nav className={styles.nav} aria-label="Navigasi utama">
                <div ref={primaryRef} className={styles.primaryLinks}>
                    {primaryItems.map((item) => <NavigationLink key={item.id} item={item} activePage={activePage} />)}
                </div>
                {scrollEdges.left && <span className={`${styles.scrollCue} ${styles.scrollCueLeft}`} aria-hidden="true">‹</span>}
                {scrollEdges.right && <span className={`${styles.scrollCue} ${styles.scrollCueRight}`} aria-hidden="true">›</span>}
                <details ref={moreRef} className={styles.more} onKeyDown={handleMoreKeyDown}>
                    <summary className={`${styles.link} ${otherPageActive ? styles.active : ''}`}>
                        <Icon name="more" />
                        <span>Lainnya</span>
                    </summary>
                    <div className={styles.morePanel}>
                        <span className={styles.sectionLabel}>Lainnya</span>
                        {otherItems.map((item) => <NavigationLink key={item.id} item={item} activePage={activePage} />)}
                        <button type="button" className={`${styles.link} ${styles.logout}`} onClick={logout}>
                            <Icon name="logout" />
                            <span>Keluar</span>
                        </button>
                    </div>
                </details>
            </nav>
        </aside>
    );
}
