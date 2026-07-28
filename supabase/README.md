# Supabase (step 1)

## Setup

1. Create a Supabase project (EU region if GDPR matters).
2. In the SQL editor, run [`migrations/20260728_step1_auth_entities.sql`](migrations/20260728_step1_auth_entities.sql).
3. Copy project URL + **service role** key into server env (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`).
4. Copy URL + **anon** key into Vite env (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`).
5. Set `STORE_DRIVER=postgres` and `AUTH_REQUIRED=true`.
6. Set `ADMIN_EMAIL` to your email, then sign up / sign in once — that profile is promoted to `admin` + `approved`.

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
