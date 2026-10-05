# INCA STATS ANALIZADOR V1.043

Versión actual basada directamente en V1.042, con la capa API corregida sin rehacer el producto.

## V1.043 · API ORCHESTRATOR + FIXTURE BRIDGE

- Pool autorizado de hasta 10 keys API-Football en Vercel.
- Presupuesto mensual por key + diario + por ejecución.
- Supabase guarda contadores/alias, nunca secretos.
- Bridge TITAN/Sofascore Event_ID ↔ API-Football Fixture_ID.
- Match Center autenticado correctamente contra sus endpoints backend.
- Alineaciones cacheadas corregidas.
- Odds separadas por proveedor para evitar duplicados o mezclas.
- Usuarios finales continúan en modo `CACHE_ONLY`: ningún click consume API externa.

### Antes del deploy
Ejecuta `setup/SUPABASE_V1043_ORCHESTRATOR_BRIDGE.sql` y luego configura Vercel con `setup/ENV_VERCEL_V1043.txt`.

Lee `README_V1_043_API_ORCHESTRATOR_BRIDGE.txt` para el orden exacto.
