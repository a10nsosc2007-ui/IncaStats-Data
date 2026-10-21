# INCASTATS - ORGANIZADOR MASTER SEGURO V1

Este cambio es una **primera fase no destructiva** de reorganización del repositorio. No fusiona todavía estadísticas ni modifica los directorios nativos TITAN.

## Instalación local
1. Descarga [00_ORGANIZAR_INCASTATS_MASTER.bat](./00_ORGANIZAR_INCASTATS_MASTER.bat) desde esta rama (GitHub > Raw > guardar archivo).
2. Guárdalo directamente en la raíz de tu clon local `IncaStats-Data`, al lado de `TITAN_SYNC_V3_UNIFIED.py`. Si usas GitHub Desktop, también puedes cambiar de rama a esta rama para recibir el BAT; **confirma que no haya cambios locales pendientes antes de cambiar de rama**.
3. Requiere Python 3 con el comando `py -3`. Ejecuta el BAT con doble clic.

## Opciones
- **1 - Auditar:** solo lectura; cuenta equipos por ID cuando reconoce el esquema, inspecciona registros y muestra tamaños de las carpetas antiguas `RESPALDOS` y `EXPORTACIONES`. No genera archivos.
- **2 - Ordenar:** pide escribir exactamente `ORDENAR`; **no mueve datos nativos**. Crea exclusivamente `INCA_BASE_MAESTRA/CONTROL`, `INCA_BASE_MAESTRA/ENTRADAS/{EQUIPOS,JUGADORES,ARBITROS,MIXTAS}`, un JSON de auditoría y un manifiesto de rutas. Añade exclusiones específicas a `.gitignore`; no elimina archivos.
- **3 - Mover entrada:** pide tipo, origen y confirmación `MOVER`. Utiliza renombrado dentro del mismo volumen **sin copia de seguridad y sin sobrescribir**. Rechaza fuentes protegidas, rutas ya dentro del MASTER y volúmenes diferentes. **Solo deposita archivos en ENTRADAS; NO fusiona datos estadísticos**.

## Límites importantes
- Si `INCA_BASE_MAESTRA` no existe localmente, el organizador no la crea vacía.
- El organizador no transforma fotos, escudos, registros de jugadores ni árbitros.
- Las 31 incorporaciones se determinan comparando IDs del catálogo MASTER con los IDs TITAN publicados: no se inventa el número.
- Nada en el script elimina `_BACKUPS_PLAYER_DELTA`, `INCA_BASE_MAESTRA/RESPALDOS` o `EXPORTACIONES`. Solo informa cuánto ocupan.
- `.gitignore` no elimina del seguimiento los archivos ya añadidos a Git.
- Es preferible que OneDrive termine de sincronizar archivos y GitHub Desktop no tenga operaciones pendientes antes de mover entradas.
- La siguiente fase será desarrollar adaptadores por esquema (equipos + estadísticas; jugadores + árbitros), idempotentes, con validación previa y sin duplicaciones masivas.

## Seguridad
No ejecutes el importador antiguo `TITAN_SYNC_V3_UNIFIED.py` o `apply_player_delta.py` para hacer la reorganización: esos scripts tienen otras funciones y crean respaldos. No hagas commit de `INCA_BASE_MAESTRA` hasta revisar su tamaño y contenido.
