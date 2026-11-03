'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..');
const files=['EXTRACTOR_UNICO_SOFA.js','ENTRADAS_MASTERS/MASTER_TEAMS_ACTUALIZADO.json','ENTRADAS_MASTERS/MASTER_PLAYERS_ACTUALIZADO.json','ENTRADAS_MASTERS/03_ARBITROS.json','tools/unified/sync.cjs'];
console.log('=============================================================');
console.log('INCASTATS - UNIFICADOR V4 - COMPROBACION LOCAL (SIN RED)');
console.log('=============================================================');
let ok=true;for(const n of files){const yes=fs.existsSync(path.join(root,n));console.log((yes?'[OK]  ':'[FALTA] ')+n);if(!yes)ok=false;}
if(!ok){console.error('La carpeta está incompleta. No se modificó ningún dato.');process.exitCode=1;}
else{
 console.log('\n1. Abre SofaScore en Chrome/Edge. F12 > Consola.');
 console.log('2. Ejecuta el contenido de EXTRACTOR_UNICO_SOFA.js.');
 console.log('3. Importa los 3 masters y extrae la ventana deseada.');
 console.log('4. Exporta "JSON UNIFICADO + RAW" COMPLETO.');
 console.log('5. Arrastra el INCA_UNIFICADO_STATS_V4_*.json sobre ACTUALIZAR_TODO_INCA_V4.bat.');
 console.log('6. Se actualizará data/unified sin modificar antiguos masters.');
 console.log('\nNo hace llamadas a servicios externos ni requiere GitHub.');
}
