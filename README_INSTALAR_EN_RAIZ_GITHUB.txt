INCASTATS PLAYER DELTA · REPO ROOT SAFE V5
==========================================

IMPORTANTE
----------
Estos archivos NO deben quedarse dentro de una carpeta de kit anidada.
Copia el CONTENIDO de este paquete directamente a la raiz de tu clon local GitHub:

C:\...\IncaStats-Data\

Debe quedar asi:

IncaStats-Data\
  .git\                         (si tu clon usa Git)
  TITAN_PLAYERS_MASTER_2025_PLUS\
  TITAN_PLAYERS_CURRENT\
  INBOX_PLAYER_DELTA\
    LEEME_PON_AQUI_EL_ZIP_DELTA.txt
  TOOLS_PLAYER_DELTA\
    01_PEGAR_EN_F12_PLAYER_DELTA_15D_PLAYERLIST_SAFE_V5_MAX6.js
    TITAN_DELTA_PLAYERS_7395.json
  00_REGENERAR_JSON_JUGADORES.bat
  00_REGENERAR_JSON_JUGADORES.py
  02_APLICAR_PLAYER_DELTA.bat
  03_VALIDAR_PLAYER_DATA.bat
  apply_player_delta.py
  validate_player_data.py

FLUJO NORMAL
------------
1. SofaScore -> F12 -> pega TOOLS_PLAYER_DELTA\01_PEGAR...js
2. Carga TOOLS_PLAYER_DELTA\TITAN_DELTA_PLAYERS_7395.json
3. Ejecuta/reanuda y descarga el ZIP DELTA.
4. Copia SOLO ese ZIP DELTA a INBOX_PLAYER_DELTA\
5. Ejecuta 02_APLICAR_PLAYER_DELTA.bat desde la raiz del repo.
6. Ejecuta 03_VALIDAR_PLAYER_DATA.bat.
7. Revisa git status. El BAT NO hace commit ni push automaticamente.

CORRECCION V5 DEL ERROR ERRNO 13
--------------------------------
El V3/V4 podia pasar una cadena vacia como argumento. Python convertia esa cadena
en la carpeta actual y trataba de abrir ESA CARPETA con zipfile.ZipFile(), produciendo:
  PermissionError: [Errno 13] Permission denied

V5:
- nunca pasa un argumento vacio;
- solo acepta un archivo real con extension .zip;
- el inbox siempre es IncaStats-Data\INBOX_PLAYER_DELTA;
- el repo siempre es la carpeta donde vive apply_player_delta.py;
- verifica que exista el MASTER antes de modificar nada;
- hace backup antes del UPSERT;
- al final muestra git status si Git esta disponible.
