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
        create table public.products (
            id text primary key,
            name text not null,
            owner_id text,
            category text, sell_price numeric default 0, cost_price numeric default 0,
            modifiers text,
            is_active boolean default true
        );
        create table public.transactions (
            id text primary key, datetime timestamptz default now(), user_id text,
            customer_id text, items text, subtotal numeric default 0,
            total_cost numeric default 0, total_profit numeric default 0,
            cash_received numeric default 0, change numeric default 0,
            status text default 'completed', created_at timestamptz default now(),
            payment_method text default 'cash', manual_txn_count integer default 1,
            owner_id text
        );
        create function public.set_owner_id_from_jwt() returns trigger
            language plpgsql set search_path = '' as $$
        begin
            if new.owner_id is null then new.owner_id := auth.jwt()->>'owner_id'; end if;
            return new;
        end; $$;
        create trigger set_owner before insert on public.transactions
            for each row execute function public.set_owner_id_from_jwt();
        grant select, insert, update, delete on public.supplies to authenticated, anon;
        grant select, insert, update, delete on public.products to authenticated, anon;
        grant select, insert, update, delete on public.transactions to authenticated, anon;
        alter table public.supplies enable row level security;
        alter table public.products enable row level security;
        alter table public.transactions enable row level security;
        create policy owner_rw on public.supplies for all to authenticated
            using (owner_id = (auth.jwt()->>'owner_id')) with check (owner_id = (auth.jwt()->>'owner_id'));
        create policy owner_rw on public.products for all to authenticated
            using (owner_id = (auth.jwt()->>'owner_id')) with check (owner_id = (auth.jwt()->>'owner_id'));
        create policy owner_rw on public.transactions for all to authenticated
            using (owner_id = (auth.jwt()->>'owner_id')) with check (owner_id = (auth.jwt()->>'owner_id'));
    `);
    await db.exec(await readFile(new URL('../docs/sql/inventory-supplies.sql', import.meta.url), 'utf8'));
    await db.exec(await readFile(new URL('../docs/sql/inventory-supply-menus.sql', import.meta.url), 'utf8'));
    await db.exec(await readFile(new URL('../docs/sql/inventory-pos-consumption.sql', import.meta.url), 'utf8'));
    await db.exec(await readFile(new URL('../docs/sql/inventory-pos-reversals.sql', import.meta.url), 'utf8'));
    return db;
}
