# INCA STATS — FASE 2: ACTUALIZADORES DE CATALOGOS

**Verificación de esquema a partir de los dos archivos compartidos por el usuario (21/10/2026):**
- `BASE_EQUIPOS_MASTER.json`: `schema="incastats.master.teams.v1"`, `teams` con `team_id`, `count=782`.
- `BASE_JUGADORES_MASTER.json`: `schema="incastats.master.players.v1"`, `players` con `id`, `count=8260`.

## Instalación — IMPORTANTE
Estos scripts están en la rama de pruebas `incastats/organizador-master-seguro-v1`, no en `main`.
**CORRECCIÓN 21/10/2026**: Los tres BAT ahora son autónomos: cada uno incorpora el motor Python dentro del propio `.bat`, por lo que **ya NO necesitas descargar `INCA_ACTUALIZAR_CATALOGOS_MASTER.py`**. Descarga solo el BAT que vayas a usar y colócalo en la raíz de tu **clon local** `IncaStats-Data`, junto a `.git`. No cambies de rama en GitHub Desktop si tienes archivos locales pendientes; puedes descargar los archivos individualmente desde GitHub > Raw.
Requiere Python 3 y `py` disponible en Windows. Sustituye el BAT anterior por la versión actual de esta rama; así desaparecerá el error `Falta INCA_ACTUALIZAR_CATALOGOS_MASTER.py`. No hemos podido ejecutar una prueba de extremo a extremo en Windows.

## Orden de uso
1. `03_AUDITAR_ACTUALIZADORES_MASTER.bat`: muestra conteos del catálogo actual, sin modificaciones.
2. `01_ACTUALIZAR_EQUIPOS_MASTER.bat`: arrastra un archivo `.json`, un `.zip` o una carpeta **con un único catálogo de equipos**. Ejecuta primero vista previa. Pregunta si deseas aplicar y luego exige escribir `APLICAR` antes de escribir.
3. `02_ACTUALIZAR_JUGADORES_ARBITROS.bat`: mismo mecanismo para el **catálogo de jugadores**. Los árbitros todavía permanecen en el TITAN nativo, sin modificación.

Se aceptan nombres `BASE_EQUIPOS_MASTER.json`, `teams.json`, `equipos.json`, `BASE_EQUIPOS_REUTILIZABLE.json`; equivalentes `BASE_JUGADORES_MASTER.json`, `players.json`, `jugadores.json`, `BASE_JUGADORES_REUTILIZABLE.json`. Cada JSON debe tener arreglo `teams` o `players` y un ID por registro. Archivos JSON sueltos pueden tener lista directa. Se bloquean duplicados dentro de un lote y cambios de nombre conflictivos por defecto.

## Lo que SI hace
- Fusiona metadatos por ID SofaScore, añade IDs nuevos y actualiza campos no vacíos.
- Conserva IDs históricos sin borrar jugadores ni equipos.
- Rechaza MASTER cuyo `schema` o `count` no coincida con los registros.
- No realiza peticiones a ninguna API.
- No genera copias de seguridad, no crea ZIP de exportación.
- Escribe cada archivo modificado mediante un temporal pequeño `.incatmp` en su propia carpeta y renombrado atómico. **Esto implica una escritura temporal del catálogo afectado, no una duplicación de toda la base**.
- Solo modifica uno de los dos JSON de catálogo, tras confirmación doble.

## Lo que NO hace TODAVIA
- No fusiona `EQUIPOS/STATS`, `PLAYER_MATCH_STATS_2025_PLUS.csv`, fotos WebP, logos, estadísticas de árbitros ni paquetes TITAN: sus esquemas y referencias requieren adaptadores separados.
- No mueve extracciones automáticamente: usa el `00_ORGANIZAR_INCASTATS_MASTER.bat` para trasladar una extracción NUEVA a `ENTRADAS`. Depositar un ZIP en ENTRADAS no constituye una fusión.
- No cambia `main` ni hace commit/push.
- No se ha realizado ejecución de punta a punta del BAT en el Windows del usuario; revisar primero vista previa y los mensajes de validación.

## Seguridad GitHub
No ejecutes los actualizadores viejos para esta operación: sus rutinas de copia pueden llenar el almacenamiento. No publiques `RESPALDOS`, `EXPORTACIONES`, `.git` o fotos gigantes en un commit indiscriminado. Los 31 IDs adicionales **ya están incluidos en el MASTER local entregado**; ejecutar el mismo catálogo es idempotente y no debe volver a sumarlos.
