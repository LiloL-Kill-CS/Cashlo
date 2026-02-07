import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function ProvitinaHeader() {
    return (
        <header style={{
            background: 'var(--provitina-card-bg)',
            borderBottom: '1px solid var(--provitina-border)',
            padding: '16px 32px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            position: 'sticky',
            top: 0,
            zIndex: 40
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '8px',
                    overflow: 'hidden',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: '#0F172A'
                }}>
                    {/* Placeholder for real logo if image fails to load, but we try image first */}
                    <img src="/provitina-logo.png" alt="Provitina" style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                        onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'block'; }} />
                    <span style={{ display: 'none', color: '#FFF', fontWeight: 'bold', fontSize: '20px' }}>P</span>
                </div>
                <div>
                    <h1 style={{
                        fontSize: '20px',
                        fontWeight: '800',
                        color: 'var(--provitina-primary)',
                        letterSpacing: '-0.02em',
                        lineHeight: 1.2
                    }}>PROVITINA</h1>
                    <div style={{ fontSize: '12px', color: 'var(--provitina-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                        Regional Intelligence System
                    </div>
                </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div style={{
                    background: 'rgba(15, 23, 42, 0.05)',
                    padding: '8px 16px',
                    borderRadius: '50px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '13px',
                    color: 'var(--provitina-text-secondary)'
                }}>
                    <span style={{ width: '8px', height: '8px', background: '#22C55E', borderRadius: '50%' }}></span>
                    System Online
                </div>
            </div>
        </header>
    );
}
