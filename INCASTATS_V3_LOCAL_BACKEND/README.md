# INCASTATS V3 — SERVICIO LOCAL DE CUOTAS REALES (PRIMER COMPONENTE)

Este directorio contiene **un servidor HTTP local**, no un BAT y **no es aún la aplicación V3 completa**. Se creó para sustituir las llamadas directas de las claves de The Odds API desde un navegador por un backend local privado, antes de desplegar en Vercel.

## Puesta en marcha en VS Code
Se necesita Node.js 20 o superior. Todo es nativo; **no hay npm install**.

1. Duplica `.env.example` como `.env.local` en esta carpeta.
2. Copia tus claves reales en `ODDS_API_KEYS`. Nunca las publiques, ni en la app ni en el chat.
3. En VS Code abre la terminal dentro de `INCASTATS_V3_LOCAL_BACKEND` y ejecuta `npm run dev`. Sin BAT.
4. Abre `http://127.0.0.1:8787/api/status`. Consulta `/api/fixtures`, `/api/odds` y `/api/props` para datos cacheados.

## Funcionamiento
- Consulta **solo una clave activa** por ejecución. Aunque puede guardar hasta nueve claves locales, no rota cuentas automáticamente para intentar eludir cuotas del proveedor.
- Intenta sincronizar cuando se inicia el servidor si el caché tiene más de 12 horas. Luego revisa cada hora si ya corresponde actualizar.
- **Ningún clic del usuario llama a The Odds API**: todas las lecturas públicas son contra el caché en localhost.
- Establece un máximo de solicitudes HTTP por ciclo, 12 por defecto. Esto no equivale necesariamente a 12 créditos: los mercados adicionales pueden tener un costo distinto. Inspecciona las cabeceras de consumo que informa la API en `/api/status`.
- Descarga `h2h` prepartido de los deportes configurados; intenta props de hasta cuatro eventos por competición en cada ciclo, hasta agotar el presupuesto HTTP; **solo muestra props si el proveedor realmente los devuelve**.
- Conserva el último caché válido de una competición cuando falla la actualización, sin fabricar cuotas. Los eventos que ya empezaron no aparecen en las respuestas de lectura.
- No consulta SofaScore. La asignación de árbitros necesita otra fuente licenciada o endpoint permitido y verificado.

## Limitaciones
- **Todavía NO está conectado a los módulos visuales de tu ZIP V2.6.** Son dos trabajos distintos; el backend local por sí solo no corrige el Analizador o Player Picks. La aplicación V3 completa debe conectar estas respuestas con los mapeos de partidos, mercados, líneas y jugadores; comprobar tiempo de actualización y pruebas.
- Live Server en `:5500` sigue sirviendo el frontend, mientras este servidor sirve exclusivamente cuotas en `127.0.0.1:8787`. En Windows se puede probar desde un navegador que corre en la **misma PC**. No se recomienda exponer el backend ni las claves a otros usuarios o dispositivos.
- Si el proveedor no incluye Betano/Bet365, un evento, `h2h` o una línea concreta, no hay cuota real que mostrar. No se inventan.
- Las claves son propiedad del usuario y deben cumplir las condiciones del proveedor; no se verificó el estado de las 9 claves ni el contenido de la respuesta en vivo.
- Una interfaz web pública no debe consultar `127.0.0.1` del usuario; para vender la app este servicio tendría que desplegarse como backend con caché y credenciales privadas.

**Estado:** código fuente creado. No se ha podido realizar QA de Node en este entorno ni consultar al proveedor en tiempo real. Este servicio es una base funcional para pruebas locales que requiere validación real en tu PC.
