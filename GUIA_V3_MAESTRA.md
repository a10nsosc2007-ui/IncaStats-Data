# INCASTATS MASTER V3 - Guia rapida

## Estado de GitHub (main)
- TITAN: **782 equipos**. Los **31 nuevos CSV estan ya integrados**.
- Master jugadores: **8260**. Indice de historial JSON verificado para **7395**.
- Arbitros TITAN: **982**.
- Logos WebP de la expansion: **31** segun CONTROL/INCA_DATA_ROUTES.json.
- Historico de players adicional: INCA_BASE_MAESTRA/JUGADORES/PLAYER_MATCH_STATS_MASTER.csv.
- Los manifestos de equipos y recuentos globales necesitan reconciliacion.
- **No vuelvas a fusionar los 31 CSV**: ya estan en el TITAN de main.

## Instalacion
Descarga [06_INCASTATS_MASTER_V3_TODO_EN_UNO.bat](./06_INCASTATS_MASTER_V3_TODO_EN_UNO.bat) con **Raw > Guardar como** y colocalo en la raiz local de IncaStats-Data (junto a .git). Se necesita Python 3 (py -3), sin paquetes externos.

## Opciones
1. **Auditoria**: solo lectura y comprueba que los archivos nativos existan.
2. **META**: pide REPARAR_META; sincroniza team_details, competitions, seasons, teams y manifest_global con identificadores, CSV y nombres corroborados. Recalcula la cantidad de partidos reales, sin inventar estadisticas.
3. **Vista previa jugadores**: coteja formato e IDs del delta CSV contra el historico 2025+.
4. **Integrar jugadores**: con confirmacion, une por ID_Jugador + Event_ID, conserva filas historicas y reconstruye BY_PLAYER, manifest, INDEX y RECENT. **CURRENT no se actualiza**.
5. **Cache**: elimina exclusivamente __pycache__ previa confirmacion.
6. **Ordenar BATs antiguos**: traslada herramientas antiguas a HERRAMIENTAS/LEGACY_BATS. **No elimina scripts**.
7. **Respaldos antiguos**: requiere y valida con SHA-256 una copia externa de los archivos maestros antes de permitir limpiar _BACKUPS_PLAYER_DELTA.

## Archivos que no debes tocar
No elimines TITAN_PLAYERS_CURRENT, TITAN_PLAYERS_MASTER_2025_PLUS, TITAN_REFEREES_CURRENT, TITAN_LOGOS, TITAN_LOGOS_COMP, TITAN_ALONSINHO_V1_GITHUB_READY o INCA_BASE_MAESTRA. Conserva apply_player_delta.py, TITAN_SYNC_V3_UNIFIED.py y sus BAT hasta reemplazar los flujos de extraccion antiguos.

Los catalogos INCA_BASE_MAESTRA/CATALOGOS son exportaciones reutilizables: conserva hasta comprobar referencias y equivalencia. INBOX_PLAYER_DELTA contiene ZIP fuente; mantenlos hasta verificar todos los registros.

## Riesgos y limites
Haz primero una copia externa, como tenias previsto. Los cambios de datos usan un archivo temporal **por archivo afectado**, sin copias masivas de la base, pero requieren espacio libre para el temporal del historico de jugadores (aprox. 76 MB). No uses otros importadores simultaneamente. Revisa GitHub Desktop antes del commit.

**La APP V2.9 de Descargas no esta en este repositorio**: este BAT organiza el repositorio de datos, no modifica tu app. El BAT 05 anterior solo puede actuar si la app tiene la estructura esperada. No afirmar compatibilidad completa sin abrir y validar los archivos exactos de esa version.

La implementacion esta guardada en la rama de pruebas. **No ha sido ejecutada aun sobre Windows del usuario**. Primero utiliza auditoria y vista previa.
