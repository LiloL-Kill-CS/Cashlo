import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { buildSessionCookie } from '@/lib/session';
import { mintSupabaseToken } from '@/lib/supabaseToken';

function sha256hex(s) {
    return crypto.createHash('sha256').update(s).digest('hex');
}

// In-memory rate limiter: max 5 login attempts per IP per 15 minutes.
// For multi-instance deployments replace with Redis or Upstash.
const _attempts = new Map();
function checkRateLimit(ip) {
    const now = Date.now();
    const WINDOW = 15 * 60 * 1000;
    const MAX = 5;
    let entry = _attempts.get(ip);
    if (!entry || now > entry.resetAt) entry = { count: 0, resetAt: now + WINDOW };
    entry.count++;
    _attempts.set(ip, entry);
    if (entry.count > MAX) return { limited: true, retryAfter: Math.ceil((entry.resetAt - now) / 1000) };
    return { limited: false };
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';
    const { limited, retryAfter } = checkRateLimit(ip);
    if (limited) {
        res.setHeader('Retry-After', String(retryAfter));
        return res.status(429).json({ error: `Terlalu banyak percobaan login. Coba lagi dalam ${Math.ceil(retryAfter / 60)} menit.` });
    }

    const { username, password } = req.body || {};
    if (!username || !password) {
        return res.status(400).json({ error: 'Username dan password wajib diisi' });
    }

    let users, error;
    try {
        const result = await supabaseAdmin
            .from('users')
            .select('*')
            .eq('username', username)
            .limit(1);
        users = result.data;
        error = result.error;
    } catch (networkErr) {
        console.error('Login network error:', networkErr);
        return res.status(503).json({ error: 'Server database tidak bisa dihubungi. Coba lagi sebentar.' });
    }

    if (error) {
        console.error('Login query error:', error);
        return res.status(500).json({ error: 'Terjadi kesalahan saat login' });
    }

    const foundUser = users && users[0];
    // Generic message + a hash compare even when user missing, to reduce
    // username enumeration / timing differences.
    if (!foundUser) {
        await bcrypt.compare(password, '$2a$10$abcdefghijklmnopqrstuv0123456789012345678901234567890');
        return res.status(401).json({ error: 'Username atau password salah' });
    }

    if (!foundUser.is_active) {
        return res.status(403).json({ error: 'Akun tidak aktif. Hubungi admin.' });
    }

    const stored = foundUser.password_hash || '';
    let ok = false;
    let needsUpgrade = false;

    if (stored.startsWith('$2')) {
        ok = await bcrypt.compare(password, stored);
    } else if (/^[a-f0-9]{64}$/i.test(stored)) {
        // Legacy unsalted SHA-256 hash → verify then upgrade to bcrypt.
        ok = sha256hex(password) === stored.toLowerCase();
        needsUpgrade = ok;
    } else {
        // Legacy plaintext → verify once then upgrade to bcrypt.
        ok = stored === password;
        needsUpgrade = ok;
    }

    if (!ok) {
        return res.status(401).json({ error: 'Username atau password salah' });
    }

    if (needsUpgrade) {
        try {
            const newHash = await bcrypt.hash(password, 10);
            await supabaseAdmin.from('users').update({ password_hash: newHash }).eq('id', foundUser.id);
        } catch (e) {
            console.warn('Password hash upgrade failed (non-fatal):', e.message);
        }
    }

    const safeUser = {
        id: foundUser.id,
        name: foundUser.name,
        username: foundUser.username,
        role: foundUser.role,
        owner_id: foundUser.owner_id || foundUser.id,
    };

    res.setHeader('Set-Cookie', buildSessionCookie(safeUser));
    // supabaseToken is null until SUPABASE_JWT_SECRET is configured (Phase 2).
    return res.status(200).json({ user: safeUser, supabaseToken: mintSupabaseToken(safeUser) });
}
