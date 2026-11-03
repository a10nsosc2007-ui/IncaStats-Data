# Estructura conservada tras la limpieza

Revisión: app INCASTATS_V2_6_GOLD_LOCAL_PRIVATE y actualizadores activos, 2026-11-03.

## Datos y recursos que se conservan
- TITAN_ALONSINHO_V1_GITHUB_READY: equipos, temporadas y estadísticas.
- TITAN_PLAYERS_MASTER_2025_PLUS y TITAN_PLAYERS_CURRENT: históricos y temporada actual de jugadores.
- TITAN_REFEREES_CURRENT: árbitros.
- TITAN_LOGOS, TITAN_LOGOS_COMP, TITAN_PLAYERS_FACES_CURRENT, IncaStats_Caras e img: imágenes, índices y rutas alternativas.
- data: datos unificados y recursos del actualizador V4.
- ENTRADAS_MASTERS, tools y EXTRACTOR_UNICO_SOFA.js: flujo V4 del repositorio.
- CSV históricos de la raíz: el escáner de la app todavía los referencia. No se deben borrar solo por su antigüedad.
- team_profiles.json, team_honours.json, logos.json y demás archivos conservados: contexto y compatibilidad.
- Actualizadores V4, validador de jugadores y sincronizador de caras se mantienen. El BAT ZIP de la app es una distribución distinta: no trasladar un BAT aislado entre carpetas.

## Retirado de main
- 00_REGENERAR_JSON_JUGADORES.bat
- 00_REGENERAR_JSON_JUGADORES.py
- 02_APLICAR_PLAYER_DELTA.bat
- 04_CONSOLIDAR_31_EQUIPOS_Y_MASTER.bat
- 05_COMPATIBILIZAR_APP_V29_CON_MASTER.bat
- 06_INCASTATS_MASTER_V3_TODO_EN_UNO.bat
- 1_LIMPIAR_PLAYER_PROPS_ANTIGUO_V64R.bat
- ACTUALIZAR_TITAN_V3_UNIFIED.bat
- EXCEL JUGADORES POR EQUIPO HISTORICO
- HERRAMIENTAS
- INBOX_PLAYER_DELTA
- INCA_BASE_MAESTRA
- LEEME_PLAYER_PROPS_V2.txt
- TITAN_ALONSINHO_DATA
- TITAN_SYNC_V3_UNIFIED.py
- TOOLS_PLAYER_DELTA
- _BACKUPS_PLAYER_DELTA
- _PLAYER_DELTA_AUDIT
- apply_player_delta.py
- README_INSTALAR_EN_RAIZ_GITHUB.txt

Se retiraron herramientas de deltas y consolidación anteriores y sus exportaciones/respaldos. No se borró el historial Git: todo lo retirado está en la rama respaldo/antes-limpieza-2026-11-03. Esta operación no reduce automáticamente el historial descargado de Git ni sincroniza clones locales. No se han modificado los CSV o manifiestos activos.
