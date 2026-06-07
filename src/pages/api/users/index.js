import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getSessionUser } from '@/lib/session';

// Owner-scoped user directory. Replaces direct client reads/writes to the
// `users` table so RLS can deny anon access to it.
export default async function handler(req, res) {
    const session = getSessionUser(req);
    if (!session) {
        return res.status(401).json({ error: 'Tidak terautentikasi' });
    }
    const business = session.owner_id || session.id;

    if (req.method === 'GET') {
        // Any authenticated member of the business can list staff (no secrets).
        const { data, error } = await supabaseAdmin
            .from('users')
            .select('id, name, username, role, is_active, created_at')
            .eq('owner_id', business)
            .order('created_at', { ascending: true });

        if (error) {
            console.error('Users list error:', error);
            return res.status(500).json({ error: 'Gagal memuat pengguna' });
        }
        return res.status(200).json({ users: data || [] });
    }

    if (req.method === 'PATCH') {
        if (session.role !== 'admin') {
            return res.status(403).json({ error: 'Hanya admin yang bisa mengubah pengguna' });
        }
        const { id, name, role, is_active } = req.body || {};
        if (!id) {
            return res.status(400).json({ error: 'id pengguna wajib' });
        }
        if (role && !['admin', 'kasir'].includes(role)) {
            return res.status(400).json({ error: 'Role tidak valid' });
        }

        // Verify target belongs to the same business before updating.
        const { data: target, error: tErr } = await supabaseAdmin
            .from('users')
            .select('id, owner_id')
            .eq('id', id)
            .limit(1);
        if (tErr || !target || target.length === 0) {
            return res.status(404).json({ error: 'Pengguna tidak ditemukan' });
        }
        if ((target[0].owner_id || target[0].id) !== business) {
            return res.status(403).json({ error: 'Tidak boleh mengubah pengguna bisnis lain' });
        }
        // Prevent self-deactivation lockout.
        if (id === session.id && is_active === false) {
            return res.status(400).json({ error: 'Tidak bisa menonaktifkan akun sendiri' });
        }

        const updates = {};
        if (typeof name === 'string') updates.name = name;
        if (typeof role === 'string') updates.role = role;
        if (typeof is_active === 'boolean') updates.is_active = is_active;
        if (Object.keys(updates).length === 0) {
            return res.status(400).json({ error: 'Tidak ada perubahan' });
        }

        const { error } = await supabaseAdmin.from('users').update(updates).eq('id', id);
        if (error) {
            console.error('User update error:', error);
            return res.status(500).json({ error: 'Gagal mengubah pengguna' });
        }
        return res.status(200).json({ ok: true });
    }

    res.setHeader('Allow', 'GET, PATCH');
    return res.status(405).json({ error: 'Method not allowed' });
}
