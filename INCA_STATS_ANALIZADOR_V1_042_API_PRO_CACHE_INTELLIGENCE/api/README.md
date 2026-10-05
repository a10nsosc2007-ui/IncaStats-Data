# INCA STATS V1.043 · API ORCHESTRATOR + FIXTURE BRIDGE

## Regla principal
Los usuarios NO llaman API-Football ni The Odds API. Match Center, League Center, Player Value Scanner y Referee Center leen cache central en Supabase.

## API-Football
`/api/cron-sync` y `/api/admin-football-sync` son los únicos flujos que pueden consumir API-Football.

V1.043 puede usar un pool autorizado formado por:
`API_FOOTBALL_KEY` + `API_FOOTBALL_KEY_1` ... `API_FOOTBALL_KEY_9`.

El secreto real vive solo en Vercel. Supabase guarda alias, uso, cooldown y estado; nunca el valor de la key.

## Bridge
`api/_fixture-bridge.js` cruza el fixture de API-Football con `TITAN_FIXTURES_CORE_31_V4.json` y guarda:
`sofascore_event_id <-> fixture_id` en `football_fixture_bridge`.

Esto permite que Match Center abra un partido por Event_ID de TITAN y recupere lineups/odds cacheadas por Fixture_ID de API-Football.

## Ahorro
- Fixtures: por fecha y filtro local de las 31 ligas.
- Equipos: refresco gradual; por defecto máximo 6 ligas por cron.
- Odds API-Football: solo liga+día cuando hay fixtures y solo ligas con price coverage.
- Lineups: únicamente cerca del kickoff.
- Rachas / histórico / faces / Player Hub: TITAN, 0 API.
- Clicks/filtros de usuario: 0 API externa.

## The Odds API
`/api/admin-odds-sync` es opcional y queda separado por `source='THE-ODDS-API'`. No se mezcla con `source='API-FOOTBALL'`.

## Instalación
1. Ejecutar `setup/SUPABASE_V1043_ORCHESTRATOR_BRIDGE.sql`.
2. Configurar `setup/ENV_VERCEL_V1043.txt`.
3. Deploy.
4. Esperar cron o ejecutar como admin `POST /api/admin-football-sync?mode=fixtures`.
5. Consultar `/api/football-cache?action=status` con sesión autenticada.
