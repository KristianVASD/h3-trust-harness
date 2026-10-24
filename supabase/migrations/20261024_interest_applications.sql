-- Public partner / craftsman interest applications (service role only).

create table if not exists public.interest_applications (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('company', 'sector')),
  status text not null default 'pending'
    check (status in ('pending', 'contacted', 'closed')),
  company_name text,
  organization text,
  contact_name text not null,
  email text not null,
  trade text,
  street text,
  house_number text,
  postcode text,
  city text,
  address text,
  notes text,
  source_holder_kind text,
  share_managed_company_data boolean not null default false,
  welcome_hhh_locally boolean not null default false,
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists interest_applications_submitted_idx
  on public.interest_applications (submitted_at desc);

create index if not exists interest_applications_type_status_idx
  on public.interest_applications (type, status, submitted_at desc);

alter table public.interest_applications enable row level security;
