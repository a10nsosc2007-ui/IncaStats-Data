# INCA STATS V1.042 · API PRO CACHE INTELLIGENCE

## Regla principal
Los usuarios NO llaman API-FOOTBALL. Match Center, League Center, Player Value Scanner y Referee Center leen únicamente la cache central en Supabase.

## Escritura / actualización
`/api/cron-sync` es el único flujo automático principal que usa `API_FOOTBALL_KEY`.
Vercel Cron lo ejecuta 2 veces al día (00:15 y 12:15 hora Perú).

## Ahorro
- Fixtures: se consulta por fecha y luego se filtran las 31 ligas.
- Odds: se consulta solo liga+día cuando realmente hay fixtures y solo en las 26 ligas con price coverage.
- Árbitro: se toma del fixture; luego el frontend lo cruza con TITAN REFEREES 2024+.
- Lineups: solo para fixtures cercanos al kickoff y dentro del presupuesto.
- Rachas / históricos / faces / player history: TITAN, sin API.
- Usuario abre/cambia filtros: 0 requests API-Football.

## Variables
Ver `setup/ENV_VERCEL_V1042.txt`.

## SQL
1. `setup/SUPABASE_CACHE.sql`
2. `setup/SUPABASE_V1042_API_PRO.sql`

## Cuotas
Solo se renderizan cuotas realmente cacheadas. Bet365 y Betano tienen prioridad visual si el feed del proveedor los devuelve. La app no inventa bookmaker, mercado ni precio.

## Seguridad
Las API keys jamás deben estar en frontend, GitHub o `config.js`.
