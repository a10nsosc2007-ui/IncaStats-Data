# TITAN_REFEREES_CURRENT · MASTER V1

Paquete consolidado para **INCA STATS ANALIZADOR**.

## Resultado real de los 5 lotes

- **568 árbitros únicos**.
- **22,295 partidos únicos** por `referee_id + event_id`.
- **31 ligas** del catálogo actual de INCA STATS, todas mapeadas.
- Fechas observadas: **2014-05-22 → 2026-08-30**.
- **97,634 incidencias de tarjeta** estructuradas desde `Detalle_Tarjetas`.
- País disponible para los **568 árbitros**.

## Limpieza aplicada

Los ZIP no se concatenaron a ciegas. `LOTE_FINAL` repite exactamente los 120 CSV de árbitro del lote 480 y añade 88 nuevos. Además, 27 árbitros tenían filas `Event_ID` repetidas exactamente dentro de su propio CSV. Se eliminaron **1,329 duplicados exactos**, sin descartar ningún Event_ID distinto y sin reconciliar valores contradictorios (no se encontraron duplicados contradictorios).

## Puntos de tarjetas

La extracción recibida usa consistentemente:

- Amarilla = **10** puntos.
- Roja efectiva = **20** puntos.
- Doble amarilla = conserva **1 amarilla + 1 roja efectiva**.

La fórmula `amarillas × 10 + rojas × 20` coincide con **todos** los partidos únicos. Este paquete conserva esa política real; no se cambió a 25.

## Estructura para GitHub

Sube esta carpeta **tal cual** a la raíz de `IncaStats-Data`:

```text
IncaStats-Data/
└── TITAN_REFEREES_CURRENT/
    ├── manifest.json
    ├── referees_master.json
    ├── referees_master.csv
    ├── matches_master.csv
    ├── cards_master.csv
    ├── by_referee/
    ├── by_referee_csv/
    ├── indexes/
    ├── audit/
    ├── schema.json
    └── VERSION.txt
```

El `titan-referees-client.js` que ya existe en la app busca precisamente:

- `TITAN_REFEREES_CURRENT/referees_master.json`
- `TITAN_REFEREES_CURRENT/by_referee/{id}.json`

Por eso este paquete se preparó directamente con ese contrato.

## Cómo se integrará en la app

1. **Referee Center (módulo propio):** buscador global, filtros por liga/país, ranking de amarillas, rojas, Puntos INCA, faltas, minuto de primera tarjeta y distribución 1T/2T.
2. **League Center → Árbitros:** lista de árbitros realmente observados en esa liga, usando `discovered_in_competition_ids`.
3. **Match Center:** cuando el fixture traiga árbitro, resolver su ficha y abrir su análisis contextual.
4. **Referee Analyzer:** ventanas 10/20/30/40/50, histórico partido a partido y filtros posteriores por competición/local/visitante si se decide.
5. **Sin inventar:** penales, VAR u otras métricas no presentes en estos lotes no se mostrarán como datos disponibles.

## Archivos maestros

- `referees_master.json`: índice ligero que consume la app.
- `by_referee/<id>.json`: histórico normalizado por árbitro.
- `referees_master.csv`: resumen auditable.
- `matches_master.csv`: los 22,295 partidos consolidados.
- `cards_master.csv`: incidencias de tarjetas parseadas (amarilla / segunda amarilla-roja / roja).
- `indexes/competitions.json`: mapeo exacto de los 31 nombres de torneo del extractor a los IDs de INCA STATS.
- `audit/quality_report.json`: auditoría de duplicados, integridad y faltantes.

## Importante

No se inventaron Competition_ID de origen: el extractor trae nombres de torneo. `competition_id` es una **capa de integración** basada en el mapeo exacto de esos 31 nombres a los IDs curados que la app ya usa. Los 31 nombres encontrados tienen mapeo y no quedó ningún torneo sin resolver.
