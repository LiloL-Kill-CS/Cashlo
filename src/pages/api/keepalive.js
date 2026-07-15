// Keep-alive ping: touches the database so the Supabase free-tier project
// never auto-pauses from inactivity (a pause takes the whole POS down —
// this happened for 2 weeks in July 2026). Hit daily by Vercel Cron
// (see vercel.json); harmless to call manually.
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export default async function handler(req, res) {
    try {
        const { error } = await supabaseAdmin
            .from('users')
            .select('id', { count: 'exact', head: true })
            .limit(1);
        if (error) throw error;
        return res.status(200).json({ ok: true, ts: new Date().toISOString() });
    } catch (e) {
        console.error('keepalive failed:', e.message);
        return res.status(503).json({ ok: false, error: e.message });
    }
}
