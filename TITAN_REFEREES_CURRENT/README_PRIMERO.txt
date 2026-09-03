INCASTATS · TITAN_REFEREES_CURRENT V9.3
======================================

MASTER NUEVO PARA REEMPLAZAR COMPLETAMENTE EL TITAN REFEREES ANTERIOR.

DATOS
- Árbitros en master: 982
- Partidos únicos desde 2024: 36526
- Caras originales: 570
- Booking Points: amarilla 10 / roja efectiva 20
- Histórico anterior a 2024: EXCLUIDO A PROPÓSITO

ARCHIVOS CLAVE APP
- referees_master.json
- by_referee/{ID}.json
- matches_master.csv
- faces/rutas_imagenes_referees.json
- faces/original/
- faces/web_1024/  (se llena con Real-ESRGAN TURBO)

GITHUB
1. Borra SOLO la carpeta vieja TITAN_REFEREES_CURRENT del repositorio.
2. No borres otros TITAN.
3. Después de ejecutar Real-ESRGAN, sube ESTA carpeta TITAN_REFEREES_CURRENT completa.
4. La app debe priorizar faces/web_1024/{ID}.webp y caer a original/avatar gris si no existe.

QA COMPLETO EN audit/BUILD_QA_REPORT.json
