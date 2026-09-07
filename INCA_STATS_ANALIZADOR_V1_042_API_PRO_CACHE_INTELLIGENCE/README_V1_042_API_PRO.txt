INCA STATS ANALIZADOR V1.042 · API PRO CACHE INTELLIGENCE

QUÉ CAMBIÓ
1. La app nunca llama API-FOOTBALL desde acciones de usuario.
2. Vercel Cron actualiza cache central a las 00:15 y 12:15 hora Perú.
3. Fixtures: 1 llamada global por fecha y luego filtro de las 31 ligas.
4. Odds: solo se consultan ligas/días que realmente tienen fixture y solo 26 ligas con capa de precio.
5. Árbitro: viene en el fixture y se cruza con TITAN REFEREES 2024+.
6. Player Props: se muestran únicamente si existe una cuota real cacheada. Sin cuota real, NO se inventa pick.
7. Player Value Scanner: Liga + bookmaker + mercado + cuota mínima + hit rate mínimo + muestra 5/10/15.
8. Caras V1.041 preservadas: TITAN_PLAYERS_FACES_CURRENT sigue siendo prioridad global por Player_ID.
9. Match Center, League Center y usuarios consumen cache/Supabase; cero llamadas API por click.
10. Presupuesto duro diario: 15 requests por defecto (seguro para una key de ~500/mes); configurable por entorno.

INSTALACIÓN PRODUCCIÓN
A. Ejecuta setup/SUPABASE_CACHE.sql si aún no lo hiciste.
B. Ejecuta setup/SUPABASE_V1042_API_PRO.sql.
C. En Vercel agrega variables de setup/ENV_VERCEL_V1042.txt.
D. Deploy de esta carpeta.
E. Cron queda definido en vercel.json.

PRUEBA
- /api/cron-sync debe responder 401 si CRON_SECRET está activo y lo abres manualmente sin secreto.
- Tras el primer cron, DATA PRO debe mostrar fecha de última sync.
- Player Picks > MERCADO REAL PRO: si no hay cuotas reales, muestra estado vacío y NO crea mercados ficticios.
- Match Center > Odds: solo lee cache.
