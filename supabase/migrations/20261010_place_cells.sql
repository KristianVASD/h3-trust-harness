-- Place cells grown by address search. Service role writes; no client policies.

create table if not exists public.place_cells (
  id uuid primary key,
  country_slug text not null,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

create index if not exists place_cells_country_slug_idx
  on public.place_cells (country_slug);

create table if not exists public.place_geo_cache (
  cache_key text primary key,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.place_cells enable row level security;
alter table public.place_geo_cache enable row level security;
