
const {requireUser}=require('./_auth');
const SUPA=process.env.SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL||'https://jijxmshpzcoalohlhhnb.supabase.co';
const SERVICE=process.env.SUPABASE_SERVICE_ROLE_KEY||'';
async function rest(path){if(!SERVICE)throw new Error('SUPABASE_SERVICE_ROLE_KEY_MISSING');const r=await fetch(`${SUPA}/rest/v1/${path}`,{headers:{apikey:SERVICE,Authorization:`Bearer ${SERVICE}`,accept:'application/json'}});if(!r.ok)throw new Error(`SUPABASE_${r.status}_${await r.text()}`);return r.json();}
function groupOdds(rows){
 const books=new Map();
 for(const r of rows||[]){
   const bn=r.bookmaker||'Bookmaker';if(!books.has(bn))books.set(bn,new Map());const bm=books.get(bn),mn=r.market_name||r.market_key||'Mercado';
   if(!bm.has(mn))bm.set(mn,[]);bm.get(mn).push({value:r.selection_raw||r.outcome_name||r.direction||'',odd:String(r.price??''),point:r.point});
 }
 return [...books].map(([name,markets])=>({name,markets:[...markets].map(([name,values])=>({name,values}))}));
}
module.exports=async function handler(req,res){
 const user=await requireUser(req,res);if(!user)return;
 res.setHeader('Cache-Control','private, max-age=300, stale-while-revalidate=900');
 const action=String(req.query.action||'fixtures');
 try{
   if(action==='odds'){
     const id=Number(req.query.fixtureId)||0;if(!id)return res.status(200).json({ok:true,bookmakers:[],source:'CENTRAL_CACHE'});
     const rows=await rest(`football_odds_cache?select=*&fixture_id=eq.${id}&order=fetched_at.desc`);
     return res.status(200).json({ok:true,bookmakers:groupOdds(rows),source:'CENTRAL_CACHE'});
   }
   if(action==='lineups'){
     const id=Number(req.query.fixtureId)||0;if(!id)return res.status(200).json({ok:true,lineups:[],source:'CENTRAL_CACHE'});
     const rows=await rest(`football_lineups_cache?select=*&fixture_id=eq.${id}&order=updated_at.desc`);
     const payload=rows?.[0]?.payload||[];
     return res.status(200).json({ok:true,lineups:Array.isArray(payload)?payload:[],source:'CENTRAL_CACHE'});
   }
   if(action==='standings')return res.status(200).json({ok:true,standings:[],source:'TITAN_ONLY',note:'API standings disabled to protect monthly quota'});
   if(action==='trends')return res.status(200).json({ok:true,home:null,away:null,source:'TITAN_ONLY',note:'Recent form is calculated from TITAN; no user API call'});
   if(action==='fixtures'){
     const hours=Math.max(24,Math.min(336,Number(req.query.windowHours)||336)),from=new Date(Date.now()-6*3600000).toISOString(),to=new Date(Date.now()+hours*3600000).toISOString();
     const rows=await rest(`football_fixtures_cache?select=*&kickoff_utc=gte.${encodeURIComponent(from)}&kickoff_utc=lte.${encodeURIComponent(to)}&order=kickoff_utc.asc`);
     return res.status(200).json({ok:true,fixtures:rows||[],source:'CENTRAL_CACHE'});
   }
   return res.status(400).json({ok:false,message:'Acción no soportada'});
 }catch(e){return res.status(200).json({ok:false,bookmakers:[],lineups:[],fixtures:[],standings:[],source:'CENTRAL_CACHE',message:e.message});}
};
