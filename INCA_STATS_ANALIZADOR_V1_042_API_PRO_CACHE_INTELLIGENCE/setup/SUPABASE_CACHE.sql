-- INCASTATS V4.27.20 · cache central para Team Intel + Rachas
create table if not exists public.football_competitions_cache (
  sofascore_competition_id bigint primary key,
  api_league_id bigint not null,
  league_name text not null,
  display_name text,
  country text,
  season integer,
  league_logo text,
  is_current boolean not null default true,
  updated_at timestamptz not null default now()
);
create table if not exists public.football_current_teams (
  id bigserial primary key,
  api_team_id bigint not null,
  sofascore_team_id bigint,
  team_name text not null,
  team_code text,
  team_logo text,
  country text,
  api_league_id bigint not null,
  sofascore_competition_id bigint not null,
  league_name text not null,
  season integer not null,
  is_current boolean not null default true,
  updated_at timestamptz not null default now(),
  unique(api_team_id,api_league_id,season)
);
create index if not exists football_current_teams_sofa_idx on public.football_current_teams(sofascore_team_id);
create index if not exists football_current_teams_comp_idx on public.football_current_teams(sofascore_competition_id,is_current);
create table if not exists public.football_fixtures_cache (
  fixture_id bigint primary key,
  api_league_id bigint not null,
  sofascore_competition_id bigint,
  league_name text not null,
  season integer,
  kickoff_utc timestamptz not null,
  status_short text,
  home_api_team_id bigint not null,
  home_sofascore_team_id bigint,
  home_team_name text not null,
  home_logo text,
  away_api_team_id bigint not null,
  away_sofascore_team_id bigint,
  away_team_name text not null,
  away_logo text,
  updated_at timestamptz not null default now()
);
create index if not exists football_fixtures_kickoff_idx on public.football_fixtures_cache(kickoff_utc);
create index if not exists football_fixtures_comp_idx on public.football_fixtures_cache(sofascore_competition_id,kickoff_utc);
create table if not exists public.football_sync_state (
  job_name text primary key,
  last_success_at timestamptz,
  status text,
  meta jsonb not null default '{}'::jsonb
);
alter table public.football_competitions_cache enable row level security;
alter table public.football_current_teams enable row level security;
alter table public.football_fixtures_cache enable row level security;
alter table public.football_sync_state enable row level security;
drop policy if exists "football cache authenticated read competitions" on public.football_competitions_cache;
create policy "football cache authenticated read competitions" on public.football_competitions_cache for select to authenticated using (true);
drop policy if exists "football cache authenticated read teams" on public.football_current_teams;
create policy "football cache authenticated read teams" on public.football_current_teams for select to authenticated using (true);
drop policy if exists "football cache authenticated read fixtures" on public.football_fixtures_cache;
create policy "football cache authenticated read fixtures" on public.football_fixtures_cache for select to authenticated using (true);
drop policy if exists "football cache authenticated read sync" on public.football_sync_state;
create policy "football cache authenticated read sync" on public.football_sync_state for select to authenticated using (true);
-- No INSERT/UPDATE/DELETE policy for normal users. Writes are service-role only.


-- V4.27.21 · cache opcional de cuotas: solo escritura backend/admin.
-- Rachas funciona aunque esta tabla esté vacía; en ese caso usa Modelo INCA y lo etiqueta como estimado.
create table if not exists public.football_odds_cache (
  id bigserial primary key,
  fixture_id bigint not null,
  kickoff_utc timestamptz not null,
  market_key text not null,
  bookmaker text,
  direction text,
  outcome_name text,
  point numeric,
  price numeric,
  fetched_at timestamptz not null default now(),
  unique(fixture_id,market_key,bookmaker,direction,outcome_name,point)
);
create index if not exists football_odds_fixture_idx on public.football_odds_cache(fixture_id,market_key);
create index if not exists football_odds_kickoff_idx on public.football_odds_cache(kickoff_utc);
alter table public.football_odds_cache enable row level security;
drop policy if exists "football cache authenticated read odds" on public.football_odds_cache;
create policy "football cache authenticated read odds" on public.football_odds_cache for select to authenticated using (true);

-- V4.27.22 · League Center + árbitros + descubrimiento de mercados The Odds API
alter table public.football_fixtures_cache add column if not exists round text;
alter table public.football_fixtures_cache add column if not exists referee text;
alter table public.football_fixtures_cache add column if not exists venue_name text;
alter table public.football_fixtures_cache add column if not exists venue_city text;

create table if not exists public.football_odds_event_map (
  fixture_id bigint primary key,
  odds_event_id text not null,
  sport_key text not null,
  home_team text,
  away_team text,
  commence_time timestamptz,
  mapped_at timestamptz not null default now()
);
create index if not exists football_odds_event_sport_idx on public.football_odds_event_map(sport_key,commence_time);

create table if not exists public.football_market_availability_cache (
  id bigserial primary key,
  fixture_id bigint not null,
  odds_event_id text not null,
  sport_key text not null,
  bookmaker text not null default '',
  market_key text not null,
  discovered_at timestamptz not null default now(),
  unique(fixture_id,bookmaker,market_key)
);
create index if not exists football_market_availability_fixture_idx on public.football_market_availability_cache(fixture_id,market_key);

alter table public.football_odds_event_map enable row level security;
alter table public.football_market_availability_cache enable row level security;
drop policy if exists "football cache authenticated read odds map" on public.football_odds_event_map;
create policy "football cache authenticated read odds map" on public.football_odds_event_map for select to authenticated using (true);
drop policy if exists "football cache authenticated read market availability" on public.football_market_availability_cache;
create policy "football cache authenticated read market availability" on public.football_market_availability_cache for select to authenticated using (true);
-- Escritura exclusivamente service-role/admin backend.

create table if not exists public.football_player_props_cache (
  id bigserial primary key,
  fixture_id bigint not null,
  kickoff_utc timestamptz not null,
  market_key text not null,
  bookmaker text not null default '',
  player_name text not null,
  direction text,
  outcome_name text,
  point numeric,
  price numeric,
  fetched_at timestamptz not null default now(),
  unique(fixture_id,market_key,bookmaker,player_name,direction,outcome_name,point)
);
create index if not exists football_player_props_fixture_idx on public.football_player_props_cache(fixture_id,market_key);
alter table public.football_player_props_cache enable row level security;
drop policy if exists "football cache authenticated read player props" on public.football_player_props_cache;
create policy "football cache authenticated read player props" on public.football_player_props_cache for select to authenticated using (true);

-- V4.27.22 · histórico ligero de designaciones arbitrales (sin inventar stats de tarjetas/faltas)
create table if not exists public.football_referee_assignments_cache (
  fixture_id bigint primary key,
  api_league_id bigint,
  sofascore_competition_id bigint,
  league_name text,
  season int,
  kickoff_utc timestamptz,
  referee text not null,
  home_team_name text,
  away_team_name text,
  status_short text,
  updated_at timestamptz default now()
);
create index if not exists football_ref_assign_comp_idx on public.football_referee_assignments_cache (sofascore_competition_id, season, kickoff_utc);
create index if not exists football_ref_assign_ref_idx on public.football_referee_assignments_cache (referee, kickoff_utc);
alter table public.football_referee_assignments_cache enable row level security;
drop policy if exists "authenticated read referee assignments" on public.football_referee_assignments_cache;
create policy "authenticated read referee assignments" on public.football_referee_assignments_cache for select to authenticated using (true);
