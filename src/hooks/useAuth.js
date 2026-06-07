import { useState, useEffect, createContext, useContext } from 'react';
import { setSupabaseToken } from '@/lib/supabase';

// Auth now runs server-side: credentials are verified in /api/auth/* using the
// Supabase service-role key + bcrypt, and the session lives in an httpOnly
// cookie. localStorage is kept ONLY as a non-authoritative UX cache so the UI
// can render instantly without an auth flash; the server never trusts it.

const CACHE_KEY = 'cashlo_user';
const TOKEN_KEY = 'cashlo_token';
const AuthContext = createContext(null);

async function postJson(url, body) {
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(body || {}),
    });
    let data = {};
    try { data = await res.json(); } catch { /* no body */ }
    if (!res.ok) {
        throw new Error(data.error || 'Terjadi kesalahan');
    }
    return data;
}

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // 1) Instant render from cache (UX only). Also restore the data token
        // synchronously so early hook queries carry identity (avoids empty-data
        // flash once RLS is on). /api/auth/me refreshes both below.
        try {
            const cached = localStorage.getItem(CACHE_KEY);
            if (cached) setUser(JSON.parse(cached));
            const cachedToken = localStorage.getItem(TOKEN_KEY);
            if (cachedToken) setSupabaseToken(cachedToken);
        } catch { /* ignore */ }

        // 2) Validate against the server cookie (source of truth).
        (async () => {
            try {
                const res = await fetch('/api/auth/me', { credentials: 'same-origin' });
                const data = await res.json();
                if (data.user) {
                    setUser(data.user);
                    setSupabaseToken(data.supabaseToken);
                    localStorage.setItem(CACHE_KEY, JSON.stringify(data.user));
                    if (data.supabaseToken) localStorage.setItem(TOKEN_KEY, data.supabaseToken);
                } else {
                    setUser(null);
                    setSupabaseToken(null);
                    localStorage.removeItem(CACHE_KEY);
                    localStorage.removeItem(TOKEN_KEY);
                }
            } catch {
                // Network error: keep cached user (offline-friendly), do not force logout.
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    const login = async (username, password) => {
        const data = await postJson('/api/auth/login', { username, password });
        setUser(data.user);
        setSupabaseToken(data.supabaseToken);
        localStorage.setItem(CACHE_KEY, JSON.stringify(data.user));
        if (data.supabaseToken) localStorage.setItem(TOKEN_KEY, data.supabaseToken);
        return data.user;
    };

    const register = async (username, password, name, role = 'kasir', owner_id = null) => {
        const data = await postJson('/api/auth/register', { username, password, name, role, owner_id });
        return data.user;
    };

    const logout = async () => {
        try { await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' }); } catch { /* ignore */ }
        setUser(null);
        setSupabaseToken(null);
        localStorage.removeItem(CACHE_KEY);
        localStorage.removeItem(TOKEN_KEY);
    };

    return (
        <AuthContext.Provider value={{ user, login, logout, register, loading }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within AuthProvider');
    }
    return context;
}
