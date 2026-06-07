import { getSessionUser } from '@/lib/session';

export default async function handler(req, res) {
    const payload = getSessionUser(req);
    if (!payload) {
        return res.status(200).json({ user: null });
    }
    return res.status(200).json({
        user: {
            id: payload.id,
            name: payload.name,
            username: payload.username,
            role: payload.role,
            owner_id: payload.owner_id,
        },
    });
}
