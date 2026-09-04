INCA STATS · TITAN PLAYERS MASTER 2025+
========================================
FUENTE: 56 ZIP (STATS.csv + INFO.csv)
PERIODO: 2025-01-01 a 2026-09-02
FILAS CRUDAS: 398,580
FILAS FINALES: 324,321
JUGADORES: 7,395
EVENTOS: 34,392
COMPETICIONES: 274

IMPORTANTE:
NO reemplaza TITAN_PLAYERS_CURRENT. Los 56 lotes fueron extraídos entre varios días, por lo que CURRENT mantiene prioridad para la campaña vigente. La app deduplica por ID_Jugador + Event_ID y CURRENT gana.

RUNTIME:
- manifest.json: catálogo completo.
- RECENT/recent20.json: últimos 20 por jugador para carga diferida.
- BY_PLAYER/XX/ID.json: histórico completo 2025+ lazy.
- MASTER/*.csv: consolidado para el BAT/deltas futuros.

AUDITORÍA:
- 56 ZIP íntegros.
- 74,257 filas sobrantes por solapes/duplicados eliminadas.
- 19 claves jugador-evento conflictivas resueltas priorizando Estado_Inicial conocido.
- 6 jugadores con STATS pero sin INFO fuente; no se inventaron metadatos.
- 2 filas del 31/12/2024 excluidas para respetar 01/01/2025.
