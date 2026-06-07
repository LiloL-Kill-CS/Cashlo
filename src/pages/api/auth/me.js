import { getSessionUser } from '@/lib/session';
import { mintSupabaseToken } from '@/lib/supabaseToken';

export default async function handler(req, res) {
    const payload = getSessionUser(req);
    if (!payload) {
        return res.status(200).json({ user: null, supabaseToken: null });
    }
    const user = {
        id: payload.id,
        name: payload.name,
        username: payload.username,
        role: payload.role,
        owner_id: payload.owner_id,
    };
    // supabaseToken is null until SUPABASE_JWT_SECRET is configured (Phase 2).
    return res.status(200).json({ user, supabaseToken: mintSupabaseToken(user) });
}
