import { useState, useEffect, createContext, useContext } from 'react';
import { supabase } from '@/lib/supabase';

// Helper function to hash passwords
async function hashPassword(password) {
    const msgBuffer = new TextEncoder().encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Restore session from localStorage (needed for page reloads after login)
        const savedUser = localStorage.getItem('cashlo_user');
        if (savedUser) {
            const parsed = JSON.parse(savedUser);
            // Ensure owner_id always exists (backward compat for old sessions)
            if (!parsed.owner_id) {
                parsed.owner_id = parsed.id;
                localStorage.setItem('cashlo_user', JSON.stringify(parsed));
            }
            setUser(parsed);
        }
        setLoading(false);
    }, []);

    const login = async (username, password) => {
        let users, error;
        try {
            const result = await supabase
                .from('users')
                .select('*')
                .eq('username', username);
            users = result.data;
            error = result.error;
        } catch (networkErr) {
            console.error('Network error during login:', networkErr);
            throw new Error('Server database tidak bisa dihubungi. Cek koneksi internet atau Supabase project mungkin sedang paused. Buka dashboard.supabase.com untuk mengaktifkan kembali.');
        }

        if (error) {
            console.error('Login error:', error);
            if (error.message?.includes('fetch failed') || error.message?.includes('ENOTFOUND')) {
                throw new Error('Server database tidak bisa dihubungi. Supabase project mungkin sedang paused. Buka dashboard.supabase.com untuk mengaktifkan kembali.');
            }
            throw new Error('Terjadi kesalahan saat login: ' + error.message);
        }

        if (!users || users.length === 0) {
            throw new Error('Username tidak ditemukan');
        }

        const foundUser = users[0];

        if (!foundUser.is_active) {
            throw new Error('Akun tidak aktif');
        }

        // Simple password check using SHA-256 hash or plaintext fallback for old accounts
        const hashedPassword = await hashPassword(password);
        if (foundUser.password_hash !== hashedPassword && foundUser.password_hash !== password) {
            throw new Error('Password salah');
        }

        // Backward compatibility: If no owner_id, use own id
        const owner_id = foundUser.owner_id || foundUser.id;

        const userData = {
            id: foundUser.id,
            name: foundUser.name,
            username: foundUser.username,
            role: foundUser.role,
            owner_id: owner_id
        };

        setUser(userData);
        localStorage.setItem('cashlo_user', JSON.stringify(userData));
        return userData;
    };

    const register = async (username, password, name, role = 'kasir', owner_id = null) => {
        // Check if username exists
        const { data: existing } = await supabase
            .from('users')
            .select('id')
            .eq('username', username);

        if (existing && existing.length > 0) {
            throw new Error('Username sudah digunakan');
        }

        const newId = `user-${Date.now()}`;
        // If no owner_id provided, default to self
        const finalOwnerId = owner_id || newId;

        const hashedPassword = await hashPassword(password);

        // Create new user
        const { data, error } = await supabase
            .from('users')
            .insert([{
                id: newId,
                username,
                password_hash: hashedPassword,
                name,
                role,
                owner_id: finalOwnerId,
                is_active: true,
                created_at: new Date().toISOString()
            }])
            .select();

        if (error) {
            console.error('Register error:', error);
            throw new Error('Gagal membuat akun: ' + error.message);
        }

        return data[0];
    };

    const logout = () => {
        setUser(null);
        localStorage.removeItem('cashlo_user');
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
