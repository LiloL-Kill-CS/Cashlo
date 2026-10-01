import { readFile } from 'node:fs/promises';

// A real PostgreSQL engine in an isolated test database. No production URL,
// credentials, or customer records are used by these tests.
export async function createStockTestDatabase(dataDir, { existing = false } = {}) {
    let PGlite;
    try { ({ PGlite } = await import('@electric-sql/pglite')); }
    catch { ({ PGlite } = await import('../.test-runtime/node_modules/@electric-sql/pglite/dist/index.js')); }
    const db = new PGlite(dataDir);
    if (existing) return db;
    await db.exec(`
        create role authenticated;
        create role anon;
        create schema auth;
        create function auth.jwt() returns jsonb language sql stable as $$
            select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
        $$;
        grant usage on schema auth to authenticated, anon;
        grant execute on function auth.jwt() to authenticated, anon;
        create table public.users (
            id text primary key, name text not null, username text unique not null,
            password_hash text not null, role text default 'kasir',
            is_active boolean default true, created_at timestamptz default now(),
            owner_id text references public.users(id)
        );
        create table public.supplies (
            id text primary key default gen_random_uuid()::text,
            owner_id text references public.users(id) on delete cascade,
            name varchar not null, unit varchar default 'pcs', default_price numeric default 0,
            created_at timestamptz default now(), updated_at timestamptz default now()
        );
        grant select, insert, update, delete on public.supplies to authenticated, anon;
        alter table public.supplies enable row level security;
        create policy owner_rw on public.supplies for all to authenticated
            using (owner_id = (auth.jwt()->>'owner_id')) with check (owner_id = (auth.jwt()->>'owner_id'));
    `);
    await db.exec(await readFile(new URL('../docs/sql/inventory-supplies.sql', import.meta.url), 'utf8'));
    return db;
}
