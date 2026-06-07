import crypto from 'crypto';

// Mints a Supabase-compatible JWT (HS256, signed with the project's JWT secret)
// carrying the user's identity. PostgREST verifies this token and exposes its
// claims to RLS policies via auth.jwt(), e.g. (auth.jwt() ->> 'owner_id').
//
// This lets the browser query the DB with a per-user identity instead of the
// shared anon key, so RLS can enforce per-owner isolation. Server-only: needs
// SUPABASE_JWT_SECRET (never NEXT_PUBLIC_).

const THIRTY_DAYS = 60 * 60 * 24 * 30;

function b64url(input) {
    return Buffer.from(input).toString('base64url');
}

export function mintSupabaseToken(user) {
    const secret = process.env.SUPABASE_JWT_SECRET;
    if (!secret) {
        // Not configured yet (Phase 2 not finished) — return null so callers can
        // simply omit the token; the app keeps using the anon key for now.
        return null;
    }

    const now = Math.floor(Date.now() / 1000);
    const header = { alg: 'HS256', typ: 'JWT' };
    const payload = {
        aud: 'authenticated',
        role: 'authenticated',     // maps to the Postgres 'authenticated' role
        sub: user.id,              // auth.uid()
        owner_id: user.owner_id,   // used by RLS: owner-scoped isolation
        user_role: user.role,      // app role (admin/kasir), not a PG role
        iat: now,
        exp: now + THIRTY_DAYS,
    };

    const data = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
    const sig = crypto.createHmac('sha256', secret).update(data).digest('base64url');
    return `${data}.${sig}`;
}
