-- INCA STATS ANALIZADOR V1.043
-- API ORCHESTRATOR + FIXTURE BRIDGE + CACHE CENTRAL
-- Ejecutar UNA vez en Supabase SQL Editor ANTES de desplegar V1.043.
-- Es idempotente: puede volver a ejecutarse si una parte quedó a medias.
-- IMPORTANTE: las API keys NO se guardan en Supabase. Solo alias/contadores/estado.

begin;

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
  sofascore_event_id bigint,
  api_league_id bigint not null,
  sofascore_competition_id bigint,
  league_name text not null,
  season integer,
  kickoff_utc timestamptz not null,
  status_short text,
  round text,
  referee text,
  venue_name text,
  venue_city text,
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
alter table public.football_fixtures_cache add column if not exists sofascore_event_id bigint;
alter table public.football_fixtures_cache add column if not exists round text;
alter table public.football_fixtures_cache add column if not exists referee text;
alter table public.football_fixtures_cache add column if not exists venue_name text;
alter table public.football_fixtures_cache add column if not exists venue_city text;
create index if not exists football_fixtures_kickoff_idx on public.football_fixtures_cache(kickoff_utc);
create index if not exists football_fixtures_comp_idx on public.football_fixtures_cache(sofascore_competition_id,kickoff_utc);
create index if not exists football_fixtures_sofa_event_idx on public.football_fixtures_cache(sofascore_event_id);

create table if not exists public.football_sync_state (
  job_name text primary key,
  last_success_at timestamptz,
  status text,
  meta jsonb not null default '{}'::jsonb
);

create table if not exists public.football_odds_cache (
  id bigserial primary key,
  row_key text,
  fixture_id bigint not null,
  kickoff_utc timestamptz not null,
  market_key text not null,
  market_name text,
  bookmaker text,
  direction text,
  outcome_name text,
  selection_raw text,
  point numeric,
  price numeric,
  source text,
  fetched_at timestamptz not null default now()
);
alter table public.football_odds_cache add column if not exists row_key text;
alter table public.football_odds_cache add column if not exists market_name text;
alter table public.football_odds_cache add column if not exists selection_raw text;
alter table public.football_odds_cache add column if not exists source text;
update public.football_odds_cache set source='LEGACY' where source is null or btrim(source)='';
alter table public.football_odds_cache alter column source set default 'LEGACY';
create index if not exists football_odds_fixture_idx on public.football_odds_cache(fixture_id,market_key);
create index if not exists football_odds_kickoff_idx on public.football_odds_cache(kickoff_utc);
create index if not exists football_odds_source_idx on public.football_odds_cache(source,fixture_id,fetched_at desc);

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
  source text not null default 'LEGACY',
  bookmaker text not null default '',
  market_key text not null,
  discovered_at timestamptz not null default now()
);
alter table public.football_market_availability_cache add column if not exists source text;
update public.football_market_availability_cache set source='LEGACY' where source is null or btrim(source)='';
alter table public.football_market_availability_cache alter column source set default 'LEGACY';
alter table public.football_market_availability_cache alter column source set not null;
create index if not exists football_market_availability_fixture_idx on public.football_market_availability_cache(fixture_id,market_key);
create index if not exists football_market_availability_source_idx on public.football_market_availability_cache(source,fixture_id,market_key);

create table if not exists public.football_player_props_cache (
  id bigserial primary key,
  row_key text,
  fixture_id bigint not null,
  kickoff_utc timestamptz not null,
  market_key text not null,
  market_name text,
  bookmaker text not null default '',
  player_name text not null,
  direction text,
  outcome_name text,
  selection_raw text,
  point numeric,
  price numeric,
  source text,
  fetched_at timestamptz not null default now()
);
alter table public.football_player_props_cache add column if not exists row_key text;
alter table public.football_player_props_cache add column if not exists market_name text;
alter table public.football_player_props_cache add column if not exists selection_raw text;
alter table public.football_player_props_cache add column if not exists source text;
update public.football_player_props_cache set source='LEGACY' where source is null or btrim(source)='';
alter table public.football_player_props_cache alter column source set default 'LEGACY';
create index if not exists football_player_props_fixture_idx on public.football_player_props_cache(fixture_id,market_key);
create index if not exists football_player_props_source_idx on public.football_player_props_cache(source,fixture_id,fetched_at desc);

create table if not exists public.football_referee_assignments_cache (
  fixture_id bigint primary key,
  api_league_id bigint,
  sofascore_competition_id bigint,
  league_name text,
  season integer,
  kickoff_utc timestamptz,
  referee text not null,
  home_team_name text,
  away_team_name text,
  status_short text,
  updated_at timestamptz default now()
);
create index if not exists football_ref_assign_comp_idx on public.football_referee_assignments_cache(sofascore_competition_id,season,kickoff_utc);
create index if not exists football_ref_assign_ref_idx on public.football_referee_assignments_cache(referee,kickoff_utc);

create table if not exists public.football_lineups_cache (
  fixture_id bigint primary key,
  payload jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.football_api_usage_daily (
  day date primary key,
  used integer not null default 0,
  last_run_at timestamptz,
  meta jsonb not null default '{}'::jsonb
);

create table if not exists public.football_fixture_bridge (
  fixture_id bigint primary key,
  sofascore_event_id bigint not null,
  sofascore_competition_id bigint,
  api_kickoff_utc timestamptz,
  sofascore_kickoff_utc timestamptz,
  home_api_team_id bigint,
  away_api_team_id bigint,
  home_sofascore_team_id bigint,
  away_sofascore_team_id bigint,
  home_team_name text,
  away_team_name text,
  confidence numeric(6,4) not null default 0,
  match_method text,
  updated_at timestamptz not null default now()
);
create unique index if not exists football_fixture_bridge_sofa_uidx on public.football_fixture_bridge(sofascore_event_id);
create index if not exists football_fixture_bridge_comp_idx on public.football_fixture_bridge(sofascore_competition_id,api_kickoff_utc);

create table if not exists public.football_api_key_state (
  provider text not null default 'api-football',
  key_alias text not null,
  enabled boolean not null default true,
  monthly_limit integer not null default 450 check (monthly_limit > 0),
  month_key text not null default to_char((now() at time zone 'utc'),'YYYY-MM'),
  month_used integer not null default 0 check (month_used >= 0),
  day_key date not null default ((now() at time zone 'utc')::date),
  day_used integer not null default 0 check (day_used >= 0),
  last_used_at timestamptz,
  last_status text,
  last_http_status integer,
  last_remaining integer,
  cooldown_until timestamptz,
  meta jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key(provider,key_alias)
);
create index if not exists football_api_key_state_pick_idx on public.football_api_key_state(provider,enabled,month_used,day_used,last_used_at);

-- Elimina UNIQUE legacy que mezclaba proveedores y reemplaza por row_key/source-aware.
do $$
declare r record;
begin
  for r in select conname from pg_constraint where conrelid='public.football_odds_cache'::regclass and contype='u' loop
    execute format('alter table public.football_odds_cache drop constraint %I',r.conname);
  end loop;
  for r in select conname from pg_constraint where conrelid='public.football_player_props_cache'::regclass and contype='u' loop
    execute format('alter table public.football_player_props_cache drop constraint %I',r.conname);
  end loop;
  for r in select conname from pg_constraint where conrelid='public.football_market_availability_cache'::regclass and contype='u' loop
    execute format('alter table public.football_market_availability_cache drop constraint %I',r.conname);
  end loop;
end $$;
create unique index if not exists football_odds_row_key_uidx on public.football_odds_cache(row_key);
create unique index if not exists football_props_row_key_uidx on public.football_player_props_cache(row_key);
create unique index if not exists football_market_availability_source_uidx on public.football_market_availability_cache(fixture_id,source,bookmaker,market_key);

create or replace function public.reserve_football_api_key(
  p_aliases text[],
  p_monthly_limit integer default 450,
  p_provider text default 'api-football'
) returns text
language plpgsql
security definer
set search_path=public
as $$
declare
  v_alias text;
  v_month text := to_char((now() at time zone 'utc'),'YYYY-MM');
  v_day date := (now() at time zone 'utc')::date;
begin
  if coalesce(array_length(p_aliases,1),0)=0 then return null; end if;

  insert into public.football_api_key_state(provider,key_alias,monthly_limit,month_key,day_key,updated_at)
  select p_provider,a,greatest(1,p_monthly_limit),v_month,v_day,now()
  from unnest(p_aliases) as a
  on conflict(provider,key_alias) do update
    set monthly_limit=excluded.monthly_limit,updated_at=now();

  update public.football_api_key_state
  set month_key=v_month,month_used=0,day_key=v_day,day_used=0,cooldown_until=null,updated_at=now()
  where provider=p_provider and key_alias=any(p_aliases) and month_key<>v_month;

  update public.football_api_key_state
  set day_key=v_day,day_used=0,updated_at=now()
  where provider=p_provider and key_alias=any(p_aliases) and day_key<>v_day;

  select key_alias into v_alias
  from public.football_api_key_state
  where provider=p_provider
    and key_alias=any(p_aliases)
    and enabled=true
    and month_used < least(monthly_limit,greatest(1,p_monthly_limit))
    and (cooldown_until is null or cooldown_until<=now())
  order by month_used asc,day_used asc,last_used_at asc nulls first,key_alias asc
  for update skip locked
  limit 1;

  if v_alias is null then return null; end if;

  update public.football_api_key_state
  set month_used=month_used+1,day_used=day_used+1,last_used_at=now(),last_status='reserved',updated_at=now()
  where provider=p_provider and key_alias=v_alias;

  return v_alias;
end;
$$;

create or replace function public.mark_football_api_key_result(
  p_key_alias text,
  p_status text,
  p_http_status integer default null,
  p_remaining integer default null,
  p_cooldown_seconds integer default 0,
  p_meta jsonb default '{}'::jsonb,
  p_provider text default 'api-football'
) returns void
language plpgsql
security definer
set search_path=public
as $$
begin
  update public.football_api_key_state
  set last_status=p_status,
      last_http_status=p_http_status,
      last_remaining=p_remaining,
      cooldown_until=case when coalesce(p_cooldown_seconds,0)>0 then now()+make_interval(secs=>p_cooldown_seconds) else null end,
      meta=coalesce(meta,'{}'::jsonb)||coalesce(p_meta,'{}'::jsonb),
      updated_at=now()
  where provider=p_provider and key_alias=p_key_alias;
end;
$$;

-- RLS: usuarios autenticados solo leen cache funcional. Escritura = service_role/backend.
do $$
declare t text;
begin
  foreach t in array array[
    'football_competitions_cache','football_current_teams','football_fixtures_cache','football_sync_state',
    'football_odds_cache','football_odds_event_map','football_market_availability_cache','football_player_props_cache',
    'football_referee_assignments_cache','football_lineups_cache','football_api_usage_daily','football_fixture_bridge','football_api_key_state'
  ] loop
    execute format('alter table public.%I enable row level security',t);
  end loop;
end $$;

-- Políticas SELECT de cache.
drop policy if exists "inca read competitions" on public.football_competitions_cache;
create policy "inca read competitions" on public.football_competitions_cache for select to authenticated using (true);
drop policy if exists "inca read teams" on public.football_current_teams;
create policy "inca read teams" on public.football_current_teams for select to authenticated using (true);
drop policy if exists "inca read fixtures" on public.football_fixtures_cache;
create policy "inca read fixtures" on public.football_fixtures_cache for select to authenticated using (true);
drop policy if exists "inca read sync" on public.football_sync_state;
create policy "inca read sync" on public.football_sync_state for select to authenticated using (true);
drop policy if exists "inca read odds" on public.football_odds_cache;
create policy "inca read odds" on public.football_odds_cache for select to authenticated using (true);
drop policy if exists "inca read odds map" on public.football_odds_event_map;
create policy "inca read odds map" on public.football_odds_event_map for select to authenticated using (true);
drop policy if exists "inca read markets" on public.football_market_availability_cache;
create policy "inca read markets" on public.football_market_availability_cache for select to authenticated using (true);
drop policy if exists "inca read props" on public.football_player_props_cache;
create policy "inca read props" on public.football_player_props_cache for select to authenticated using (true);
drop policy if exists "inca read referees" on public.football_referee_assignments_cache;
create policy "inca read referees" on public.football_referee_assignments_cache for select to authenticated using (true);
drop policy if exists "inca read lineups" on public.football_lineups_cache;
create policy "inca read lineups" on public.football_lineups_cache for select to authenticated using (true);
drop policy if exists "inca read usage" on public.football_api_usage_daily;
create policy "inca read usage" on public.football_api_usage_daily for select to authenticated using (true);
drop policy if exists "inca read fixture bridge" on public.football_fixture_bridge;
create policy "inca read fixture bridge" on public.football_fixture_bridge for select to authenticated using (true);
-- football_api_key_state queda SIN policy para authenticated: solo service_role.

-- Permisos defensivos.
do $$
declare t text;
begin
  foreach t in array array[
    'football_competitions_cache','football_current_teams','football_fixtures_cache','football_sync_state',
    'football_odds_cache','football_odds_event_map','football_market_availability_cache','football_player_props_cache',
    'football_referee_assignments_cache','football_lineups_cache','football_api_usage_daily','football_fixture_bridge'
  ] loop
    execute format('grant select on table public.%I to authenticated',t);
    execute format('revoke insert,update,delete,truncate on table public.%I from authenticated',t);
    execute format('revoke all on table public.%I from anon',t);
    execute format('grant all on table public.%I to service_role',t);
  end loop;
  execute 'revoke all on table public.football_api_key_state from anon,authenticated';
  execute 'grant all on table public.football_api_key_state to service_role';
end $$;

grant usage,select on all sequences in schema public to service_role;
revoke all on function public.reserve_football_api_key(text[],integer,text) from public,anon,authenticated;
grant execute on function public.reserve_football_api_key(text[],integer,text) to service_role;
revoke all on function public.mark_football_api_key_result(text,text,integer,integer,integer,jsonb,text) from public,anon,authenticated;
grant execute on function public.mark_football_api_key_result(text,text,integer,integer,integer,jsonb,text) to service_role;

commit;

-- Verificación rápida después de Run:
-- select tablename from pg_tables where schemaname='public' and tablename like 'football_%' order by tablename;
-- select * from public.football_api_key_state order by key_alias; -- se llena tras el primer sync
