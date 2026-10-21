# INCASTATS — Actualizadores MASTER V1

Rama de pruebas. No fusionar con main hasta ejecutar las pruebas locales. Formatos: `BASE_EQUIPOS_MASTER.json` (782 equipos) y `BASE_JUGADORES_MASTER.json` (8260 jugadores).

## Instalación
Descarga `00_INSTALAR_ACTUALIZADORES_MASTER.bat` desde esta rama: botón **Raw**, guardar en la **raíz de tu clon local** `IncaStats-Data`. Ejecuta el BAT y escribe `INSTALAR`. Usa Python 3 (`py -3`) e Internet solo para descargar cinco archivos de código pequeños. No mueve datos.

## Test previo (CMD en IncaStats-Data)
```cmd
py -3 -B -m unittest discover -s INCA_ACTUALIZADORES -p "test_*.py" -v
```
Las pruebas usan carpetas temporales. Si falla alguna, no apliques actualizaciones reales. **No se pudieron ejecutar en el entorno remoto de ChatGPT**.

## Flujo
- `01_ACTUALIZAR_EQUIPOS_STATS.bat`: lote nuevo de equipos y partidos; pide ruta de carpeta/ZIP/JSON/CSV y muestra vista previa.
- `02_ACTUALIZAR_JUGADORES_ARBITROS.bat`: lote nuevo de jugadores y/o árbitros; muestra vista previa.
- `03_ACTUALIZAR_TODO_MASTER.bat`: lote mixto.
- Para escribir, después de la vista previa confirma S y escribe `APLICAR`. Sin confirmación no modifica datos.

Nunca selecciones la carpeta completa del repositorio ni el MASTER como lote. Selecciona solo un lote incremental.

## Contratos
- Equipos: JSON con `teams` (`team_id`); CSV por `Event_ID+Team_ID+Tiempo`. Reutiliza shards TITAN existentes o el shard MASTER para equipos nuevos; preserva columnas.
- Jugadores: JSON con `players` (`id`); CSV por `Event_ID+Player_ID` o `Event_ID+ID_Jugador`. El DELTA solo guarda claves ausentes en maestros TITAN.
- Árbitros: CSV `referee_id,name` o `Event_ID,Arbitro_ID`. Guarda únicamente deltas en el MASTER.

## Seguridad y límites
No genera ZIP, respaldos ni copias de la base completa. Usa archivos temporales pequeños y reemplazo atómico individual; **no garantiza una transacción global ni recuperación sin respaldos**. Conserva las carpetas TITAN, los logos y las fotos. Si se repite el mismo lote, no debe haber nuevos registros.

Los deltas centrales de jugadores y árbitros **todavía no actualizan los índices derivados de la app** (`BY_PLAYER`, `RECENT`, `by_referee`). Tampoco mueve o convierte logos PNG/WebP. Esas integraciones corresponden a la fase siguiente.

Los 31 equipos están presentes en el catálogo local (782 vs 751 TITAN) pero todavía no se publican automáticamente en GitHub. Antes del commit, revisa siempre los cambios en GitHub Desktop.
