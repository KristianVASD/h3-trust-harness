-- H3 Trust step 1: auth profiles, JSONB entity store, anonymous search sessions.
-- Run against your Supabase project (EU recommended for GDPR).
--
-- Bootstrap admin (after first signup with ADMIN_EMAIL):
--   update public.profiles
--   set role = 'admin', status = 'approved'
--   where email = 'you@example.com';

-- ---------------------------------------------------------------------------
-- profiles (1:1 with auth.users)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  role text not null check (role in ('admin', 'curad_volunteer')),
  status text not null check (status in ('pending', 'approved', 'rejected')),
  display_name text,
  preferred_location text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profiles_status_idx on public.profiles (status);
create index if not exists profiles_role_idx on public.profiles (role);

-- Auto-create pending CURAD volunteer profile on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, role, status)
  values (
    new.id,
    coalesce(new.email, ''),
    'curad_volunteer',
    'pending'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- entities (FileStore-compatible JSON blobs)
-- ---------------------------------------------------------------------------
create table if not exists public.entities (
  collection text not null,
  id uuid not null,
  mission_id uuid,
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  v integer not null default 1,
  primary key (collection, id)
);

create index if not exists entities_collection_mission_idx
  on public.entities (collection, mission_id);
create index if not exists entities_collection_idx
  on public.entities (collection);

-- ---------------------------------------------------------------------------
-- search_sessions (anonymous visitor quota: 5 per browser session)
-- ---------------------------------------------------------------------------
create table if not exists public.search_sessions (
  session_id text primary key,
  search_count integer not null default 0 check (search_count >= 0),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- RLS: users read/update own profile; server uses service role for the rest
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.entities enable row level security;
alter table public.search_sessions enable row level security;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select to authenticated
  using (auth.uid() = id);

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (auth.uid() = id)
  with check (
    auth.uid() = id
    and role = (select p.role from public.profiles p where p.id = auth.uid())
    and status = (select p.status from public.profiles p where p.id = auth.uid())
  );

-- No client policies on entities / search_sessions — API service role only.
