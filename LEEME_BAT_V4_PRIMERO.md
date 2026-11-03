# INCASTATS | ACTUALIZADOR TODO-INCA V4 (Windows)

## ENTREGA COMPLETA — NO COPIAR SOLO EL BAT

La versión anterior de `ACTUALIZAR_TODO_INCA.bat` invocaba dos scripts que no venían adjuntos: `tools/unified/setup.cjs` y `tools/unified/sync.cjs`. **Esta entrega incluye ambos scripts, el BAT actualizado, el extractor SofaScore V4 y los tres masters de origen**, más pruebas locales. No hacen consultas web, ni usan créditos, ni requieren GitHub.

### Requisitos

- Windows 10/11 y **Node.js LTS (18 o superior)** con `node` en el PATH.
- Una extracción previamente realizada con `EXTRACTOR_UNICO_SOFA.js`, exportada con el botón **JSON UNIFICADO + RAW**. Debe indicar `schema=incastats.unified.raw.v1`, `schema_version=incastats.unified.stats.v4` y `complete=true`.
- **No** arrastres los archivos `INCA_SOLO_STATS_V4_*` ni `INCA_CHECKPOINT_V4_*`: no contienen toda la información necesaria para reconstituir y actualizar el histórico local de forma segura.

### Uso de principio a fin

1. Descomprime **toda** esta carpeta. Si quieres almacenar los datos dentro de la carpeta de IncaStats V3, copia el contenido de esta carpeta a la raíz de V3, al lado de su `index.html`. No sobrescribas archivos antiguos sin respaldarlos; en caso de coincidencia guarda el anterior y revisa el cambio.
2. Haz doble clic en **`ACTUALIZAR_TODO_INCA_V4.bat`** sin archivos. Se revisará que estén el extractor, 3 masters y sincronizador; se abrirá el JS en Bloc de notas. Copia ese JS en la consola F12 de SofaScore, desde su página de fútbol.
3. En el panel V4, importa los 3 JSON de `ENTRADAS_MASTERS`. Configura competiciones, fechas, velocidad y checkpoints. Ejecuta la extracción.
4. Pulsa **JSON UNIFICADO + RAW**. Tras terminar y descargar, arrastra ese JSON sobre `ACTUALIZAR_TODO_INCA_V4.bat`.
5. El BAT primero valida **sin modificar nada** (`--check`). Si el archivo es válido, acumula eventos por `Event_ID`, reconstruye los resúmenes y guarda 3 archivos dentro de `data/unified/`:
   - `INCA_UNIFICADO_STATS_MASTER_V4.json` — eventos RAW consolidados + estadísticas y catálogos.
   - `INCA_SOLO_STATS_MASTER_V4.json` — base de datos V4 normalizada y resumida.
   - `manifest.json` — conteos, versión y huellas para evitar reimportaciones repetidas.
6. Si ya existían archivos V4 consolidados en **esa carpeta**, se guardan versiones anteriores automáticamente en `.backups/unified/<fecha>/` **antes** de reemplazar.
7. Repetir con los siguientes JSON de fechas/ligas diferentes acumula sin duplicar el mismo `Event_ID`. Una importación idéntica detectada no reescribe el histórico.

### Compatibilidad con IncaStats V3 — límite importante

Este BAT **NO sobreescribe** bases TITAN antiguas, `data/player-current`, `data/api-cache`, CSV históricos ni código frontend. Genera una **fuente V4 consolidada y válida en `data/unified/`**, que puede alojarse dentro de la raíz de IncaStats V3. **La app V3 no se conectará automáticamente a esa fuente si sus módulos siguen leyendo otros archivos.** Para que las pantallas Players, Rachas y Match Center utilicen la nueva fuente, hay que conectar su lector o implementar un adaptador de esquema, y probarlo. Esto evita corromper los JSON/CSV que usa actualmente la aplicación.

No convierte las métricas de los 982 árbitros del master en designaciones de partidos: cada encuentro se vincula únicamente cuando el evento de SofaScore trae el árbitro. No interpreta registros históricos incompletos como partidos que no existieron.

### Controles de integridad

- Rechaza extracción incompleta, JSON inválido y los IDs de equipos/partidos inconsistentes.
- No mezcla dos partidos con el mismo Event_ID si tienen equipos o competiciones incompatibles.
- Conserva estadísticas de partidos existentes cuando una actualización nueva trae menos datos.
- No sobrescribe masters originales; preserva su identidad y estadísticas resumidas.
- Hace backup de cada archivo que vaya a reemplazar y usa ficheros temporales antes del cambio.
- No hay llamadas externas: no se necesita API-Football, The Odds API ni Gemini para usar este actualizador.

### Pruebas ejecutadas

`node tools\unified\test-sync.cjs`

**11/11 pruebas locales aprobadas** con eventos simulados (precheck, unificación, no duplicación, respaldos, importaciones repetidas, rechazo de datos corruptos, protección de masters). **No son pruebas en vivo de SofaScore**, ni una verificación de integración visual con IncaStats V3.

### Cuando aparezcan errores

- `Falta ENTRADAS_MASTERS`: extrae el ZIP completo. Están dentro de la carpeta.
- `se requiere JSON UNIFICADO + RAW V4`: generaste `SOLO STATS`, un checkpoint u otro formato.
- `La extracción está INCOMPLETA`: vuelve al extractor y reanuda el rango hasta completar; no modifiques manualmente `complete`.
- `CONFLICTO CRÍTICO`: se detectó un Event_ID incompatible; no se sobrescribe el registro anterior, y hay que revisar la fuente.
- `Node.js`: instala Node.js LTS desde https://nodejs.org/

**Precaución:** no metas `.env`, llaves privadas ni datos personales en estos JSON para publicar: la carpeta `data/` podría ser servida al público por tu frontend. Esta entrega no incluye secretos.
