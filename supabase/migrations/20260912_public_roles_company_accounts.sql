-- Public join roles + self-serve company accounts.
-- Keeps curad_volunteer so existing rows stay valid.

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in (
    'admin',
    'curad_volunteer',
    'curad_member',
    'sector_user',
    'sector_expert',
    'helper',
    'company'
  ));

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requested text;
  assigned text;
begin
  requested := coalesce(new.raw_user_meta_data->>'role', 'sector_user');
  assigned := case
    when requested in (
      'curad_volunteer',
      'curad_member',
      'sector_user',
      'sector_expert',
      'helper',
      'company'
    ) then requested
    else 'sector_user'
  end;

  insert into public.profiles (id, email, role, status, display_name)
  values (
    new.id,
    coalesce(new.email, ''),
    assigned,
    'pending',
    nullif(new.raw_user_meta_data->>'display_name', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create table if not exists public.company_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  company_id uuid,
  legal_name text not null,
  trade text,
  city text,
  kvk_number text,
  kvk_gate text not null default 'review'
    check (kvk_gate in ('pass', 'review', 'fail')),
  status text not null default 'pending'
    check (status in ('pending', 'kvk_passed', 'approved', 'rejected')),
  accept_free_local_connect boolean not null default false,
  accept_local_connection_improve boolean not null default false,
  opt_in_active_work boolean not null default false,
  consented_at timestamptz,
  phone text,
  notes text,
  is_community_drager boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists company_accounts_status_idx
  on public.company_accounts (status, created_at desc);
create index if not exists company_accounts_user_idx
  on public.company_accounts (user_id);

alter table public.company_accounts enable row level security;
