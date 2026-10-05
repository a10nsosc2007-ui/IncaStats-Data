INCA STATS ANALIZADOR V1.043 · API ORCHESTRATOR + FIXTURE BRIDGE

BASE
- Parte directamente de V1.042. No se rediseñó la app ni se tocaron TITAN histórico, Player Hub, Analyzer o Auth salvo integración API necesaria.

CORRECCIONES CRÍTICAS
1. Pool autorizado de API-Football: API_FOOTBALL_KEY + API_FOOTBALL_KEY_1 ... _9.
2. Balanceo por uso mensual/día y failover controlado. Supabase NO almacena secretos.
3. Presupuesto global diario/run + presupuesto mensual por alias.
4. Bridge TITAN/Sofascore event_id -> API-Football fixture_id.
5. El cron ya completa sofascore_event_id y IDs de equipos cuando puede mapearlos.
6. Match Center resuelve el bridge antes de pedir lineups/odds cacheadas.
7. Match Center ahora envía el Bearer token a /api/match-center y /api/odds. En V1.042 esas llamadas directas podían responder 401.
8. Alineaciones: /api/match-center?action=lineups devuelve configured=true correctamente.
9. Fallback de fixtures API devuelve el mismo contrato visual que TITAN.
10. Cuotas separadas por source: API-FOOTBALL y THE-ODDS-API ya no se mezclan/duplican.
11. The Odds API guarda row_key/source y respeta presupuesto por ejecución.
12. Cache status expone salud del pool sin exponer ninguna key.
13. Service Worker/cache-busters actualizados a V1.043.

SUPABASE
Tu backup recibido contiene profiles y user_devices, pero NO contiene las tablas football_* requeridas por V1.042/V1.043.
Por eso V1.043 incluye un único instalador consolidado:
  setup/SUPABASE_V1043_ORCHESTRATOR_BRIDGE.sql

ORDEN DE INSTALACIÓN
1. Supabase -> SQL Editor -> New query.
2. Pega TODO setup/SUPABASE_V1043_ORCHESTRATOR_BRIDGE.sql y Run.
3. Verifica que aparezcan tablas football_*.
4. Vercel -> Environment Variables: conserva tus 10 keys y añade/cambia las variables de setup/ENV_VERCEL_V1043.txt.
5. Redeploy V1.043.
6. Ejecuta una sincronización inicial como admin con POST /api/admin-football-sync?mode=all o espera al cron.
7. Revisa GET /api/football-cache?action=status con una sesión válida.

CRON
vercel.json conserva: 15 5,17 * * *
Equivale aproximadamente a 00:15 y 12:15 hora Perú.
Si tu plan de Vercel no admite esa frecuencia, usa una sola ejecución diaria o un programador compatible. La app no depende de clicks del usuario para refrescar APIs.

REGLA DE DATOS
- Usuario -> cache central.
- Cron/Admin -> proveedor externo.
- Ausencia de dato = null/vacío; nunca inventar 0 o una cuota.
