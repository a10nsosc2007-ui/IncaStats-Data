# INCASTATS — BAT UNICO DE CONSOLIDACION V1

**DESCARGA:** [04_CONSOLIDAR_31_EQUIPOS_Y_MASTER.bat](./04_CONSOLIDAR_31_EQUIPOS_Y_MASTER.bat)

**ESTADO:** Implementado en rama separada. Codigo revisado en GitHub; **pendiente de prueba real en Windows**, ya que el entorno local de prueba no ha funcionado. No modificar `main` hasta probarlo. No requiere `INCA_ACTUALIZAR_CATALOGOS_MASTER.py`.

## 0. Antes de ejecutarlo
- Haz la copia de seguridad independiente que ya planeaste.
- Cierra GitHub Desktop si está realizando operaciones, cierra scripts TITAN antiguos y deja terminar OneDrive. Si OneDrive solo muestra iconos de nube, usa **Siempre mantener en este dispositivo** para los archivos necesarios antes de operar.
- Descarga **únicamente el BAT 04 corregido** desde esta rama de GitHub: GitHub > Raw > Guardar como. Colócalo directamente en la carpeta local `IncaStats-Data`, junto a `.git`.
- Python 3 con `py -3` debe funcionar. No necesita instalar librerías.
- NO ejecutes los importadores anteriores a la vez.

## 1. El BAT tiene 3 opciones
- **1: Revisar el MASTER**: consulta el estado actual, busca CSV de equipos en `INCA_BASE_MAESTRA/EQUIPOS/STATS` (y subcarpetas conocidas), clasifica por ID SofaScore y crea `CONTROL/INFORME_CONSOLIDACION_V1.json` y `CONTROL/INCA_DATA_ROUTES.json`. **No toca datos TITAN**.
- **2: Fusionar equipos**: pide confirmar escribiendo exactamente **FUSIONAR**. Valida las estadísticas CSV de cada equipo. Para equipos nuevos con CSV compatible, **mueve** el archivo a la ruta nativa `TITAN_ALONSINHO_V1_GITHUB_READY/data/teams_csv/` y añade ese equipo al `manifest/teams.json`. Para un equipo ya existente cuyo delta CSV sea compatible, une por **Event_ID + Team_ID + Tiempo**, conserva las filas históricas y combina datos no vacíos. Tras comprobar que cada valor entrante persiste, elimina el CSV de entrada ya consumido, no antes. Crea índices ligeros de rutas para conectar la app después.
- **3: Limpiar SOLO cache `__pycache__`**: no elimina los antiguos respaldos, ningún CSV ni ZIP.

## Importante: integraciones NO automáticas
1. **El catálogo de 782 clubes es real**, pero 31 nombres adicionales NO garantizan 31 CSV de estadísticas. El BAT informa cuántos archivos son válidos y bloquea los incompatibles. No inventa partidos.
2. No convierte formatos de CSV ajenos al contrato TITAN (`Event_ID`, `Team_ID`, `Tiempo` con fases `ALL`, `1ST`, `2ND`). No fusiona archivos JSON de estadísticas de equipo desconocidos.
3. Los 8.260 jugadores quedan registrados en `BASE_JUGADORES_MASTER.json`; sus históricos actuales y árbitros permanecen donde ya funcionan. **Este BAT no fusiona todavía sus CSV históricos, ni las estadísticas arbitrales**: construir esos adaptadores es la siguiente etapa y requiere comprobar el archivo delta real.
4. **No modifica la aplicación**. `CONTROL/INCA_DATA_ROUTES.json` es un mapa de rutas para la siguiente integración de la app, no un cambio de código de la app.
5. WebP existentes se referencian en el índice ligero si el archivo existe. No ejecuta Real-ESRGAN ni genera fotos/escudos inventados.
6. No hay copias de seguridad internas, conforme a tu solicitud. Para CSV existentes, el BAT usa un temporal pequeño por CSV y lo sustituye atómicamente. No duplica carpetas de datos.
7. Las carpetas TITAN originales, `RESPALDOS`, `EXPORTACIONES` y `_BACKUPS_PLAYER_DELTA` **NO se borran automáticamente**; no podemos declarar que sean prescindibles sin auditar sus contenidos.

## Próxima fase
- Adaptador incremental de jugadores (CURRENT + 2025 PLUS + BY_PLAYER sin historias perdidas).
- Adaptador de árbitros (referees_master, by_referee, matches, faces).
- Conectar la **app concreta de Descargas** con `INCA_DATA_ROUTES.json` o, si sigue publicándose en Vercel, con una URL de datos publicada. No mezclar código de app con repo de datos a ciegas.
- Extractor universal futuro: equipos, competiciones, jugadores, árbitros, logos/fotos y stats con el mismo contrato y solo nuevas IDs/eventos.

**Si la opción 2 muestra `SIN_CSV_DE_ESTADISTICAS` para los 31, no significa que faltan clubes en el catálogo. Significa que el BAT no encontró archivos de equipo con el formato necesario en las rutas previstas. Conserva los archivos originales y no intentes forzarla.**
