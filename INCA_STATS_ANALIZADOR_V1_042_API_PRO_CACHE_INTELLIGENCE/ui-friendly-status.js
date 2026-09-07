(() => {
'use strict';

const TECHNICAL = [
  [/Contexto TITAN inv[aá]lido\.?/gi,'No hay datos disponibles para esta selección.'],
  [/Team_ID inv[aá]lido\.?/gi,'Datos del equipo no disponibles.'],
  [/HTTP\s*\d{3}/gi,''],
  [/\bJSON\b/gi,'datos'],
  [/\bf[aá]llidos?\s*:?\s*\d*/gi,''],
  [/\bfallidos?\s+\d+/gi,''],
  [/ERROR DE CONEXI[ÓO]N/gi,'Información temporalmente no disponible'],
  [/Error de conexi[oó]n o formato/gi,'Información temporalmente no disponible'],
  [/Error de red o formato/gi,'Información temporalmente no disponible']
];

function cleanText(text){
  let out=String(text||'');
  for(const [rx,repl] of TECHNICAL)out=out.replace(rx,repl);
  out=out.replace(/\s+·\s+·/g,' · ').replace(/\s{2,}/g,' ').trim();
  return out;
}

function cleanNode(root){
  if(!root||root.nodeType!==1)return;
  const selector=[
    '.portal-empty','.portal-loader','.ti-empty','.ti-statusbar','.gr-status',
    '.gr-calc-status','.rk-empty-state','.pro-search-item','#statusCarga',
    '[id$="Status"]','[id$="status"]','[class*="status"]'
  ].join(',');

  const nodes=root.matches?.(selector)?[root]:[...root.querySelectorAll?.(selector)||[]];
  for(const el of nodes){
    for(const node of [...el.childNodes]){
      if(node.nodeType===Node.TEXT_NODE){
        const cleaned=cleanText(node.nodeValue);
        if(cleaned!==node.nodeValue.trim())node.nodeValue=cleaned?' '+cleaned+' ':'';
      }
    }
  }
}

const observer=new MutationObserver(muts=>{
  for(const m of muts){
    for(const n of m.addedNodes)if(n.nodeType===1)cleanNode(n);
    if(m.target?.nodeType===1)cleanNode(m.target);
  }
});
observer.observe(document.documentElement,{subtree:true,childList:true,characterData:true});
document.addEventListener('DOMContentLoaded',()=>cleanNode(document.body));
})();