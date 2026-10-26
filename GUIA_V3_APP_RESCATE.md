# INCA STATS APP V3 — RESCATE PARCIAL, NO RELEASE COMERCIAL

**Qué existe realmente:** la APP V2.9 del usuario corre en Descargas con Live Server. La carpeta no esta en el repositorio de GitHub, que ahora es exclusivo de `IncaStats-Data`. No se ha podido leer ni probar el codigo exacto del V2.9 local; por eso **NO es correcto llamar a este parche "V3 final al 100 %"**.

## Archivos preparados en esta rama

- [07_INSTALAR_RESCATE_APP_V3.bat](./07_INSTALAR_RESCATE_APP_V3.bat): INSTALADOR UNICO de rescate; requiere Python 3, conexion a GitHub para bajar 3 módulos JS y 1 CSS, y la ruta de la APP V2.9. Se ejecuta desde la raiz local IncaStats-Data.
- [08_SINCRONIZAR_ARBITROS_PREPARTIDO.bat](./08_SINCRONIZAR_ARBITROS_PREPARTIDO.bat): consulta opcional y limitada (maximo 12) de SofaScore de eventos identificados como SofaScore cuya hora esta en las proximas 24h; respeta 403/429, no elude bloqueos, no inventa asignaciones; almacena solo fuentes positivas verificadas en un nuevo sidecar local.
- [09_DIAGNOSTICAR_CUOTAS_SIN_CREDITOS.bat](./09_DIAGNOSTICAR_CUOTAS_SIN_CREDITOS.bat): lee archivos JSON locales de agenda/odds/props y muestra cuantos precios existen; **no lee claves ni consulta proveedores**.
- `APP_V3_PATCH/inca-v3-rescue.js`: ruta de recuperacion para `scannerView` sin saltar la pantalla de autenticacion, consola de errores y diagnostico real de caché (opcional F12).
- `APP_V3_PATCH/inca-v3-player-streaks.js`: ventana PLAYER RACHAS con historicos reales, muestra/linea editables, local-visita, competicion y racha consecutiva. **No ofrece cuotas estimadas presentadas como reales.**
- `APP_V3_PATCH/inca-v3-referees.js`: ventana de designaciones publicadas desde el sidecar generado en el BAT 08.
- `APP_V3_PATCH/inca-v3-rescue.css`: CSS aislado, responsive.

## Instalacion
1. Realiza copia externa de tu APP y de IncaStats-Data (usuario ya tiene este flujo).
2. Descarga **07** por `Raw > Guardar como` y ponlo en el directorio `IncaStats-Data`. **No lo pongas dentro de la APP**.
3. Ejecuta **07**, selecciona la carpeta local de la APP V2.9 (contiene `index.html`, `titan-data.js`, `fast-assets`) y escribe **INSTALAR_V3** solo después de revisar el destino.
4. El instalador comprueba los 782 equipos del MASTER TITAN, crea los índices locales FAST con los 31 CSV y sincroniza el catálogo de jugadores. Conserva una copia de **solo el index.html** (~100 KB), no un backup de 62 GB. No copia archivos TITAN/CSV al directorio de la APP.
5. Abre Live Server y actualiza `Ctrl+Shift+R`. Si el Analizador sigue oculto, prueba **Alt+A** despues de iniciar sesion, o abre la consola con F12 y ejecuta `await INCA_V3_RESCUE.report()`.
6. Opcional: ejecuta **09** para identificar por que Rachas muestra `0 con cuota publicada`. Ejecuta **08** solo antes de partidos y si tienes una agenda con IDs SofaScore.

## Cuotas y límites
- **Cero cuotas no es un bug visual.** Si `odds_current.json` / `odds_next.json` estan vacios, las 9 claves pueden estar correctas pero no hay ninguna apuesta publicada para mostrar. No se debe inventar cuota.
- **The Odds API** puede no ofrecer Betano Peru, Bet365 o mercados de jugadores para determinada liga/evento. Las cotizaciones reales deben llegar del proveedor mediante backend/cache con identificador de partido, mercado, linea y fecha, sin exponer claves al navegador.
- El parche **NO implementa aun el sincronizador de cuotas reales del proveedor** ni modifica internamente el algoritmo completo de `streaks-pro.js` del V2.9 local, porque no se pudieron inspeccionar esos archivos.
- Los arbitros solo se muestran si el origen publico devuelve `referee` con nombre; 403/429 provoca parada respetuosa y deja ausencia de confirmacion. La API publica/no documentada puede cambiar; no se ha comprobado su funcionamiento en vivo.
- `Player Streaks` calcula estadisticas reales pero **no es un recomendador de picks de cuota verificada**. El modulado de odds de jugadores aun no esta integrado con este panel.
- APP V2.9 conserva las funciones/autenticacion/Supabase existentes. No elimina claves ni IndexedDB.
- No se ha ejecutado end-to-end en Windows, ni se ha podido abrir el ZIP entero del build local por fallo del entorno. No hay aval para vender esta instalacion como version final.

## Siguiente etapa imprescindible para V3 final
Se requiere el **ZIP de la carpeta exacta V2.9 que aparece en la captura (index.html, JS, CSS, data/api-cache/, etc.)**, no solamente el repositorio de datos. Con ese proyecto es posible depurar la secuencia real del Analizador, corregir los filtros de Rachas y validar la correspondencia fixture/odds exacta, actualizar Player Props, verificar arbitros y hacer pruebas QA de la aplicación concreta.

**Borrador separado**: estos cambios viven en `incastats/app-v3-rescate-integracion`; `main` no fue modificado por este parche.
