
-- INCA STATS ANALIZADOR V1.042 · API PRO CACHE INTELLIGENCE
-- Ejecutar UNA vez en Supabase SQL Editor.
-- Usuarios autenticados solo LEEN cache. Escritura = service role / cron.

alter table public.football_odds_cache add column if not exists row_key text;
alter table public.football_odds_cache add column if not exists market_name text;
alter table public.football_odds_cache add column if not exists selection_raw text;
alter table public.football_odds_cache add column if not exists source text;
create unique index if not exists football_odds_row_key_uidx on public.football_odds_cache(row_key);

alter table public.football_player_props_cache add column if not exists row_key text;
alter table public.football_player_props_cache add column if not exists market_name text;
alter table public.football_player_props_cache add column if not exists selection_raw text;
alter table public.football_player_props_cache add column if not exists source text;
create unique index if not exists football_props_row_key_uidx on public.football_player_props_cache(row_key);

create table if not exists public.football_lineups_cache (
  fixture_id bigint primary key,
  payload jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.football_lineups_cache enable row level security;
drop policy if exists "authenticated read lineups cache" on public.football_lineups_cache;
create policy "authenticated read lineups cache" on public.football_lineups_cache for select to authenticated using (true);

create table if not exists public.football_api_usage_daily (
  day date primary key,
  used integer not null default 0,
  last_run_at timestamptz,
  meta jsonb not null default '{}'::jsonb
);
alter table public.football_api_usage_daily enable row level security;
drop policy if exists "authenticated read api usage" on public.football_api_usage_daily;
create policy "authenticated read api usage" on public.football_api_usage_daily for select to authenticated using (true);

-- Asegura campos usados por V1.042 en fixtures.
alter table public.football_fixtures_cache add column if not exists round text;
alter table public.football_fixtures_cache add column if not exists referee text;
alter table public.football_fixtures_cache add column if not exists venue_name text;
alter table public.football_fixtures_cache add column if not exists venue_city text;

-- Nadie autenticado normal puede escribir.
-- No crear políticas INSERT/UPDATE/DELETE para authenticated.
