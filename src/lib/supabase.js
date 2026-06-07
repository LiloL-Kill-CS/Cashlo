import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Per-user identity token (minted server-side, carries owner_id). When set, it
// is sent as the Authorization bearer so PostgREST/RLS see the user's identity
// instead of the anon role. When null, the client behaves as before (anon key).
let _userToken = null;

export function setSupabaseToken(token) {
    _userToken = token || null;
}

// Custom fetch injects the user token without recreating the client, so the
// singleton imported across all hooks always uses the latest identity.
const authFetch = (input, init = {}) => {
    if (_userToken) {
        const headers = new Headers(init.headers || {});
        headers.set('Authorization', `Bearer ${_userToken}`);
        init = { ...init, headers };
    }
    return fetch(input, init);
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: authFetch },
});
