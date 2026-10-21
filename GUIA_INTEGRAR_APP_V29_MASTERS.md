# INCASTATS - INTEGRACION DE 31 EQUIPOS Y COMPATIBILIDAD APP

## Archivos principales
1. [04_CONSOLIDAR_31_EQUIPOS_Y_MASTER.bat](./04_CONSOLIDAR_31_EQUIPOS_Y_MASTER.bat): mueve CSV compatibles para equipos nuevos, fusiona actualizaciones de equipos ya existentes, actualiza manifiesto TITAN + cobertura global (si no, el analizador rechaza el conteo 782) e incorpora **metadatos** de jugadores nuevos al manifest e índice nativo SIN inventar estadísticas.
2. [05_COMPATIBILIZAR_APP_V29_CON_MASTER.bat](./05_COMPATIBILIZAR_APP_V29_CON_MASTER.bat): se guarda en la raíz `IncaStats-Data` y pide seleccionar la carpeta local **de la app V2.9 en Descargas**. Modifica sólo índices locales de la app: FAST team index por competición/temporada, snapshot de equipos, snapshot global, manifest local de Player Picks. Añade un pequeño fallback a `titan-data.js` para preferir los datos locales si GitHub RAW tiene todavía 751.

## Procedimiento
**Antes**: asegúrate de tener tu copia de seguridad externa (ya indicada por el usuario). Cierra VS Code/Go Live/GitHub Desktop durante las escrituras y pausa sincronización de OneDrive si interfiere.

1. Descarga de nuevo **04** usando GitHub > Raw > Guardar como, sustituyendo la versión vieja.
2. Ejecútalo **OPCIÓN 1** para ver el estado. En la prueba del usuario detectó `31 CSV localizados`, `31 LISTO_PARA_MOVER`.
3. Ejecútalo **OPCIÓN 2**, escribe `FUSIONAR`. Debe reportar el número de CSV realmente trasladados, y sincronizar `manifest/teams.json`, `manifest/manifest_global.json`, los `INDEX/players.json` y `manifest.json` nativos. Si termina con ERROR o muestra una cifra distinta, detente: no fuerces. No vuelvas a ejecutarlo junto al antiguo `TITAN_SYNC_V3_UNIFIED`.
4. Comprueba los cambios en GitHub Desktop. Publica los cambios **verificados** en las rutas de TITAN; **no** subas `RESPALDOS` ni `EXPORTACIONES`. No pulses indiscriminadamente `Commit All`; evita archivos >100 MB.
5. Descarga **05** y guárdalo también en la raíz del repo. Ejecuta el 05, selecciona la carpeta de tu app **V2.9** que contenga `index.html`, `titan-data.js` y los `fast-assets`. Escribe `ADAPTAR` sólo si la previsualización muestra 782 equipos y 8260 jugadores.
6. Abre V2.9 con Go Live y `Ctrl+Shift+R`. Si un partido no carga, verificar que sus CSV están publicados en la rama `main`, a la que apunta el lector remoto actual.

## Datos que no se han inventado
Los 31 clubes y sus CSV ya fueron detectados en el PC por el BAT anterior; aquí se validan sus filas antes de moverlas. `BASE_JUGADORES_MASTER.json` tiene 8260 IDs, pero la auditoría anterior encontró 7395 JSON históricos en TITAN. **Los 865 registros restantes pueden mostrarse en el selector con su información y foto, pero no se presentarán estadísticas inexistentes**. Sus partidos y props extraídos requieren un adaptador de los CSV reales de la expansión; un catálogo es distinto de datos jugador-partido.

## Límites
La app V2.9 no está publicada como tal en este GitHub; este instalador es un **parche local diseñado alrededor de la estructura verificada de V1.042/V2.8**, y en el paso 05 valida rutas y anclas de texto antes de escribir. **No ha sido probado contra los archivos exactos del V2.9 de tu carpeta Descargas**. Si falta algún componente, abortará.

El app index refuerza equipos en ligas/temporadas ya reconocidas; no crea automáticamente nuevas competiciones/temporadas inexistentes en el manifiesto. Fotos/WebP no se copian: se conservan en el repositorio de datos. Los árbitros permanecen en `TITAN_REFEREES_CURRENT`. No se borran los TITAN ni los backups por seguridad.

## Seguridad
No hagas merge de esta rama a `main` antes de probar BAT 04 y 05 en Windows. `INCA_BASE_MAESTRA` local todavía tiene cambios sin subir. `py -3` debe funcionar; se utilizan solamente librerías estándar de Python.

## Próxima entrega
- Adaptador de `JUGADORES/PLAYER_MATCH_STATS_MASTER.csv` que detecte columnas y haga upsert de historial/ CURRENT solo tras validar esquema original.
- Adaptador incremental de árbitros.
- Extractor universal que produzca archivos ya compatibles con estos dos MASTER.
