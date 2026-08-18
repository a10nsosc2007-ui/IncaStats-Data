TITAN PLAYERS CURRENT

Base unificada de estadísticas de jugadores de la temporada actual.

FUENTES
- extracción general de 31 ligas
- reextracción MLS + Liga 1 Perú

REGLA DE MERGE
Event_ID + Player_ID
La segunda extracción reemplaza duplicados, por eso la Liga 1 Perú completa
sustituye la versión parcial detenida por 403.

SOLO LIGAS
Esta base no debe contener estadísticas de jugadores de copas/internacionales.
El extractor unificado V3 mantiene esa misma regla.

ARCHIVO PRINCIPAL
MASTER/PLAYER_MATCH_STATS_CURRENT_EXTENDED.csv

DERIVADOS
MASTER/PLAYER_MATCH_STATS_CURRENT_MASTER.csv
BY_LEAGUE/*.csv
