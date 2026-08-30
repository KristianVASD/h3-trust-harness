# Supabase (step 1)

## Setup

1. Create a Supabase project (EU region if GDPR matters).
2. In the SQL editor, run the migrations in order:
   - [`migrations/20260728_step1_auth_entities.sql`](migrations/20260728_step1_auth_entities.sql)
   - [`migrations/20260728_search_demands.sql`](migrations/20260728_search_demands.sql)
   - [`migrations/20260830_worker_progress.sql`](migrations/20260830_worker_progress.sql) (`worker_runs` + `worker_events` for the Admin Engine)
3. Copy project URL + **service role** key into server env (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`).
4. Copy URL + **anon** key into Vite env (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`).
5. Set `STORE_DRIVER=postgres` and `AUTH_REQUIRED=true`.
6. Set `ADMIN_EMAIL` to your email, then sign up / sign in once — that profile is promoted to `admin` + `approved`.

**Email confirmation:** For the test phase, in Supabase → **Authentication** → **Providers** → **Email**, disable **Confirm email**. Otherwise signup succeeds but login returns 400 until the user confirms.

**Vercel server env (required for `/api`):** `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (not only the `VITE_*` keys). Check `/api/health` — it should show `hasSupabaseUrl` / `hasServiceRole`: true.

## Seed demo data into Postgres

```powershell
$env:STORE_DRIVER="postgres"
$env:SUPABASE_URL="https://xxxx.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY="..."
pnpm seed
```

## Bootstrap admin (manual SQL fallback)

```sql
update public.profiles
set role = 'admin', status = 'approved'
where email = 'you@example.com';
```

## Worker progress (Admin Engine)

After `20260830_worker_progress.sql`, the API writes `worker_runs` / `worker_events` with the service role. The harness never talks to these tables from the browser. Local FileStore (`STORE_DRIVER=file` without Supabase keys) cannot enqueue runs — `/api/admin/worker/*` returns 503.
