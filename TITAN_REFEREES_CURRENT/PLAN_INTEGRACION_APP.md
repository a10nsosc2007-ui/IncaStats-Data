# PLAN DE INTEGRACIÓN · REFEREE CENTER

## Módulo propio
Crear una vista `Referee Center` independiente del League Center. No mezclarla con Player Picks, Historic ni Scanner.

### Inicio
- Buscar árbitro por nombre.
- Filtrar por liga y país.
- KPIs: árbitros disponibles, partidos, cobertura temporal.
- Rankings: amarillas, rojas, Puntos INCA, faltas, primera tarjeta, tarjetas 1T/2T.

### Ficha de árbitro
- 10 / 20 / 30 / 40 / 50 partidos.
- Competición.
- Partido.
- Amarillas / rojas / Puntos INCA.
- Faltas local / visita / total.
- Minuto primera tarjeta.
- Tarjetas 1T / 2T / ET.
- Detalle de tarjetas disponible desde `card_details_raw` y `cards_master.csv`.

## Contextos
- `League Center > Árbitros`: filtrar `referees_master.json` por `discovered_in_competition_ids`.
- `Match Center`: fixture referee name -> resolver contra `search_key`/nombre; abrir la ficha sin consumir API externa.
- Designación futura vendrá de la capa API/fixture, pero el histórico siempre se lee de TITAN_REFEREES_CURRENT.

## Regla de datos
No mezclar métricas no presentes. Los lotes sí soportan tarjetas, Puntos INCA, primera tarjeta y faltas; no soportan de forma fiable penales/VAR.
