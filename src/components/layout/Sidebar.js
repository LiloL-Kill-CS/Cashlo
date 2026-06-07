export default function Sidebar({ activePage, userRole }) {
    return (
        <aside className="sidebar">
            <div className="sidebar-logo">C</div>

            <nav className="sidebar-nav">
                <a
                    href="/pos"
                    className={`sidebar-link ${activePage === 'pos' ? 'active' : ''}`}
                    title="Kasir"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
                        <line x1="8" y1="21" x2="16" y2="21"></line>
                        <line x1="12" y1="17" x2="12" y2="21"></line>
                    </svg>
                </a>

                <a
                    href="/dashboard"
                    className={`sidebar-link ${activePage === 'dashboard' ? 'active' : ''}`}
                    title="Dashboard"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                        <polyline points="9 22 9 12 15 12 15 22"></polyline>
                    </svg>
                </a>

                <a
                    href="/ai"
                    className={`sidebar-link ${activePage === 'ai' ? 'active' : ''}`}
                    title="Cashlo AI"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 2L9 7l-5 1 3.5 3.5L7 17l5-2.5L17 17l-.5-5.5L20 8l-5-1z"></path>
                        <circle cx="12" cy="12" r="2"></circle>
                    </svg>
                </a>

                <a
                    href="/reports"
                    className={`sidebar-link ${activePage === 'reports' ? 'active' : ''}`}
                    title="Laporan"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="20" x2="18" y2="10"></line>
                        <line x1="12" y1="20" x2="12" y2="4"></line>
                        <line x1="6" y1="20" x2="6" y2="14"></line>
                    </svg>
                </a>

                <a
                    href="/hpp"
                    className={`sidebar-link ${activePage === 'hpp' ? 'active' : ''}`}
                    title="HPP Calculator"
                    style={{
                        color: activePage === 'hpp' ? '#f59e0b' : '',
                        background: activePage === 'hpp' ? 'linear-gradient(135deg, #f59e0b20, #ef444420)' : ''
                    }}
                >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="4" y="2" width="16" height="20" rx="2"></rect>
                        <line x1="8" y1="6" x2="16" y2="6"></line>
                        <line x1="8" y1="10" x2="10" y2="10"></line>
                        <line x1="14" y1="10" x2="16" y2="10"></line>
                        <line x1="8" y1="14" x2="10" y2="14"></line>
                        <line x1="14" y1="14" x2="16" y2="14"></line>
                        <line x1="8" y1="18" x2="10" y2="18"></line>
                        <line x1="14" y1="18" x2="16" y2="18"></line>
                    </svg>
                </a>

                <a
                    href="/customers"
                    className={`sidebar-link ${activePage === 'customers' ? 'active' : ''}`}
                    title="Pelanggan"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                        <circle cx="9" cy="7" r="4"></circle>
                        <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                        <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                    </svg>
                </a>

                <a
                    href="/loyalty"
                    className={`sidebar-link ${activePage === 'loyalty' ? 'active' : ''}`}
                    title="Loyalty"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"></path>
                        <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"></path>
                        <path d="M4 22h16"></path>
                        <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"></path>
                        <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"></path>
                        <path d="M18 2h-4c-1.1 0-2 .9-2 2v8.5c0 .28-.22.5-.5.5s-.5-.22-.5-.5V4c0-1.1-.9-2-2-2H6c-2.2 0-4 1.8-4 4v5c0 2.2 1.8 4 4 4h12c2.2 0 4-1.8 4-4V6c0-2.2-1.8-4-4-4z"></path>
                    </svg>
                </a>

                <a
                    href="/products"
                    className={`sidebar-link ${activePage === 'products' ? 'active' : ''}`}
                    title="Produk"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path>
                        <line x1="3" y1="6" x2="21" y2="6"></line>
                        <path d="M16 10a4 4 0 0 1-8 0"></path>
                    </svg>
                </a>

                <a
                    href="/inventory"
                    className={`sidebar-link ${activePage === 'inventory' ? 'active' : ''}`}
                    title="Gudang & Stok"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 9v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V9"></path>
                        <path d="M9 22V12h6v10M2 10.6L12 2l10 8.6"></path>
                    </svg>
                </a>

                <a
                    href="/purchasing"
                    className={`sidebar-link ${activePage === 'purchasing' ? 'active' : ''}`}
                    title="Purchasing (Supplier)"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path>
                        <path d="M16 10a4 4 0 0 1-8 0"></path>
                        <circle cx="12" cy="12" r="3"></circle>
                    </svg>
                </a>

                <a
                    href="/hr"
                    className={`sidebar-link ${activePage === 'hr' ? 'active' : ''}`}
                    title="HR & Absensi"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10"></circle>
                        <polyline points="12 6 12 12 16 14"></polyline>
                    </svg>
                </a>

                <a
                    href="/settings"
                    className={`sidebar-link ${activePage === 'settings' ? 'active' : ''}`}
                    title="Pengaturan"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="3"></circle>
                        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                    </svg>
                </a>
                <a
                    href="/provitina"
                    className={`sidebar-link ${activePage === 'provitina' ? 'active' : ''}`}
                    title="Provitina Intelligence"
                    style={{ color: activePage === 'provitina' ? '#0EA5E9' : '' }}
                >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                        <circle cx="12" cy="12" r="3"></circle>
                    </svg>
                </a>

                <a
                    href="/command"
                    className={`sidebar-link ${activePage === 'command' ? 'active' : ''}`}
                    title="Command Center (Palantir-style)"
                    style={{
                        color: activePage === 'command' ? '#8b5cf6' : '',
                        background: activePage === 'command' ? 'linear-gradient(135deg, #3b82f620, #8b5cf620)' : ''
                    }}
                >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10"></circle>
                        <path d="M12 2a4.5 4.5 0 0 0 0 9 4.5 4.5 0 0 1 0 9"></path>
                        <path d="M12 7v10"></path>
                    </svg>
                </a>

            </nav>

            <a
                href="/"
                className="sidebar-link"
                title="Logout"
                onClick={async (e) => {
                    e.preventDefault();
                    try { await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' }); } catch { /* ignore */ }
                    localStorage.removeItem('cashlo_user');
                    window.location.href = '/';
                }}
            >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                    <polyline points="16 17 21 12 16 7"></polyline>
                    <line x1="21" y1="12" x2="9" y2="12"></line>
                </svg>
            </a>
        </aside >
    );
}
