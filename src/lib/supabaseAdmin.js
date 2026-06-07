import { createClient } from '@supabase/supabase-js';

// SERVER-ONLY Supabase client using the service-role key.
// NEVER import this from client components/pages — it bypasses RLS.
// The service-role key must be set WITHOUT the NEXT_PUBLIC_ prefix so it
// never ships to the browser bundle.

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!serviceRoleKey) {
    // Surfaced clearly at request time instead of a confusing null-key crash.
    console.error('[supabaseAdmin] SUPABASE_SERVICE_ROLE_KEY is not set. Auth APIs will fail until it is configured.');
}

export const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey || 'missing-service-role-key', {
    auth: { persistSession: false, autoRefreshToken: false },
});
