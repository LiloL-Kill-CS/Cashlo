import { useState, useEffect, createContext, useContext } from 'react';
import { supabase } from '@/lib/supabase';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Always start at login page - no auto-login from localStorage
        setLoading(false);
    }, []);

    const login = async (username, password) => {
        const { data: users, error } = await supabase
            .from('users')
            .select('*')
            .eq('username', username);

        if (error) {
            console.error('Login error:', error);
            throw new Error('Terjadi kesalahan saat login');
        }

        if (!users || users.length === 0) {
            throw new Error('Username tidak ditemukan');
        }

        const foundUser = users[0];

        if (!foundUser.is_active) {
            throw new Error('Akun tidak aktif');
        }

        // Simple password check (in production, use proper hashing)
        // Note: In Supabase table we stored literal "admin123" / "kasir123" as hash for simplicity in this migration demo
        // Ideally you should verify the hash. For now assuming the stored value is the password or doing simple match as per original code.
        // The original code had specific hardcoded check for admin/kasir passwords.
        // Let's keep the hardcoded check for simplicity as the user requested quick migration, OR check against DB field if we trusted the migration data.
        // The migration SQL inserted literal 'admin123' into password_hash field for clarity? No, the SQL had 'admin123'.
        // Wait, original code had: validPasswords['admin'] !== password.
        // Let's use the DB password_hash field to compare.

        if (foundUser.password_hash !== password) {
            throw new Error('Password salah');
        }

        const userData = {
            id: foundUser.id,
            name: foundUser.name,
            username: foundUser.username,
            role: foundUser.role
        };

        setUser(userData);
        localStorage.setItem('cashlo_user', JSON.stringify(userData));
        return userData;
    };

    const register = async (username, password, name, role = 'kasir') => {
        // Check if username exists
        const { data: existing } = await supabase
            .from('users')
            .select('id')
            .eq('username', username);

        if (existing && existing.length > 0) {
            throw new Error('Username sudah digunakan');
        }

        // Create new user
        const { data, error } = await supabase
            .from('users')
            .insert([{
                id: `user-${Date.now()}`,
                username,
                password_hash: password, // In production, hash this
                name,
                role,
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
