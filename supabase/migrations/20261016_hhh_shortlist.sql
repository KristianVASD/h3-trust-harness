-- HandyHouseHelp shortlist: local organisation websites, and one job per HHH request.
-- Service role writes. No client policies.

create table if not exists public.local_sources (
  id uuid primary key,
  kind text not null check (kind in ('ov', 'sport', 'festivity')),
  name text not null,
  town text,
  postcode text,
  lat double precision,
  lon double precision,
  website text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index if not exists local_sources_website_idx
  on public.local_sources (website);

create index if not exists local_sources_kind_idx
  on public.local_sources (kind);

create table if not exists public.partner_jobs (
  id uuid primary key,
  request_id text not null,
  status text not null,
  payload jsonb not null,
  public_result jsonb,
  updated_at timestamptz not null default now()
);

create unique index if not exists partner_jobs_request_id_idx
  on public.partner_jobs (request_id);

alter table public.local_sources enable row level security;
alter table public.partner_jobs enable row level security;
