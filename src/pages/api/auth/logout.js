import { buildClearCookie } from '@/lib/session';

export default async function handler(req, res) {
    res.setHeader('Set-Cookie', buildClearCookie());
    return res.status(200).json({ ok: true });
}
