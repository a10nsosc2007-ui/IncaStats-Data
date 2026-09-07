INCASTATS · TITAN REFEREES 31 V1
================================

OBJETIVO
- Descubrir los árbitros que hayan dirigido al menos 1 encuentro dentro de los últimos 50 partidos terminados de cualquiera de las 31 ligas IncaStats.
- Para cada árbitro descubierto, consultar sus últimos 50 partidos terminados.
- Extraer amarillas, rojas, puntos INCA configurables, faltas de local/visitante y tarjetas por 1T/2T/ET.

REGLA ESTRICTA DE TARJETAS
1. TITULAR: cuenta.
2. SUPLENTE QUE LUEGO ENTRA: cuenta, incluso si recibió la tarjeta antes de ingresar, tal como se pidió para IncaStats.
3. SUPLENTE QUE NUNCA ENTRA: NO cuenta.
4. DT / ENTRENADOR / STAFF / entidad sin Player_ID: NO cuenta.
5. JUGADOR YA SUSTITUIDO: una tarjeta posterior al minuto de salida NO cuenta.
6. Si SofaScore no demuestra participación mediante lineup, sustitución o estadísticas individuales, la tarjeta queda en cards_excluded.csv; nunca se inventa.

DOBLE AMARILLA
- yellowRed = 1 evento de amarilla + 1 roja efectiva.
- Se preservan direct_red y second_yellow_red por separado.

BOOKING POINTS
Por defecto se usan puntos INCA configurables:
- Amarilla: 10
- Roja efectiva: 25
No se presentan como fórmula universal de bookmaker. Puedes cambiar ambos valores antes de iniciar.

CÓMO EJECUTAR
1. Abre SofaScore en el navegador e inicia navegación normal.
2. F12 > Console.
3. Pega completo PEGAR_EN_F12_TITAN_REFEREES_31_V1.js y Enter.
4. Deja ritmo "Normal · 260 ms" o "Seguro · 420 ms" si quieres minimizar bloqueos.
5. Pulsa INICIAR.
6. Puedes PAUSAR y cerrar el navegador: el extractor guarda checkpoint/resultados en IndexedDB.
7. Al volver, pega otra vez el script y pulsa INICIAR para continuar desde el checkpoint.
8. Al terminar pulsa EXPORTAR ACTUAL.

SALIDA
TITAN_REFEREES_CURRENT/
  manifest.json
  referees_master.json
  by_referee/<REFEREE_ID>.json
  csv/referee_summary.csv
  csv/referee_matches.csv
  csv/cards_eligible.csv
  csv/cards_excluded.csv

INTEGRACIÓN CON GITHUB / V22.2
1. Descomprime el ZIP generado.
2. Copia TITAN_REFEREES_CURRENT a la RAÍZ de IncaStats-Data.
3. Commit + push.
4. La V22.2 busca automáticamente:
   https://raw.githubusercontent.com/a10nsosc2007-ui/IncaStats-Data/main/TITAN_REFEREES_CURRENT/
5. Si todavía no existe el dataset, la app muestra guiones/estado pendiente: NO datos falsos.

NOTA DE VOLUMEN
Es una extracción grande. Cada árbitro puede requerir hasta 50 partidos y, para validar correctamente tarjetas de banquillo/sustituciones, se consultan eventos, estadísticas, incidencias y lineups. No uses Turbo si SofaScore comienza a responder 429/403.
