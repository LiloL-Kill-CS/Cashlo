import bcrypt from 'bcryptjs';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getSessionUser } from '@/lib/session';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { username, password, name, role = 'kasir', owner_id = null } = req.body || {};

    if (!username || !password || !name) {
        return res.status(400).json({ error: 'Nama, username, dan password wajib diisi' });
    }
    if (String(password).length < 6) {
        return res.status(400).json({ error: 'Password minimal 6 karakter' });
    }
    if (!['admin', 'kasir'].includes(role)) {
        return res.status(400).json({ error: 'Role tidak valid' });
    }

    const session = getSessionUser(req);

    // If owner_id is supplied, this is an admin adding a sub-user (e.g. a kasir)
    // to their own business. Require an authenticated admin whose business
    // matches owner_id. Self-signup (no owner_id) stays open to create a new
    // business owner.
    let finalOwnerId;
    let newId = `user-${Date.now()}`;

    if (owner_id) {
        if (!session) {
            return res.status(401).json({ error: 'Harus login sebagai admin untuk menambah pengguna' });
        }
        if (session.role !== 'admin') {
            return res.status(403).json({ error: 'Hanya admin yang bisa menambah pengguna' });
        }
        const sessionBusiness = session.owner_id || session.id;
        if (owner_id !== sessionBusiness) {
            return res.status(403).json({ error: 'Tidak boleh menambah pengguna ke bisnis lain' });
        }
        finalOwnerId = sessionBusiness;
    } else {
        finalOwnerId = newId; // brand-new business owner
    }

    // Check username uniqueness.
    const { data: existing, error: exErr } = await supabaseAdmin
        .from('users')
        .select('id')
        .eq('username', username)
        .limit(1);

    if (exErr) {
        console.error('Register lookup error:', exErr);
        return res.status(500).json({ error: 'Gagal memeriksa username' });
    }
    if (existing && existing.length > 0) {
        return res.status(409).json({ error: 'Username sudah digunakan' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const { data, error } = await supabaseAdmin
        .from('users')
        .insert([{
            id: newId,
            username,
            password_hash: passwordHash,
            name,
            role,
            owner_id: finalOwnerId,
            is_active: true,
            created_at: new Date().toISOString(),
        }])
        .select('id, name, username, role, owner_id, is_active');

    if (error) {
        console.error('Register insert error:', error);
        return res.status(500).json({ error: 'Gagal membuat akun: ' + error.message });
    }

    return res.status(201).json({ user: data[0] });
}
