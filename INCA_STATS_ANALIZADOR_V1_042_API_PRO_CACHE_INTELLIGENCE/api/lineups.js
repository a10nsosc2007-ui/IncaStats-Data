'use strict';
const {requireUser}=require('./_auth');
const SUPA=process.env.SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL||'https://jijxmshpzcoalohlhhnb.supabase.co';
const SERVICE=process.env.SUPABASE_SERVICE_ROLE_KEY||'';
async function rest(path){if(!SERVICE)throw new Error('SUPABASE_SERVICE_ROLE_KEY_MISSING');const r=await fetch(`${SUPA}/rest/v1/${path}`,{headers:{apikey:SERVICE,Authorization:`Bearer ${SERVICE}`,accept:'application/json'}});if(!r.ok)throw new Error(`SUPABASE_${r.status}`);return r.json();}
module.exports=async function handler(req,res){
  const user=await requireUser(req,res);if(!user)return;
  res.setHeader('Cache-Control','private, max-age=60, stale-while-revalidate=300');res.setHeader('Vary','Authorization');
  const id=Number(req.query.fixtureId||req.query.fixture)||0;
  if(!id)return res.status(200).json({ok:true,configured:true,lineups:[],source:'CENTRAL_CACHE'});
  try{const rows=await rest(`football_lineups_cache?select=*&fixture_id=eq.${id}&order=updated_at.desc&limit=1`);const payload=rows?.[0]?.payload||[];return res.status(200).json({ok:true,configured:true,lineups:Array.isArray(payload)?payload:[],updated_at:rows?.[0]?.updated_at||null,source:'CENTRAL_CACHE'});}catch{return res.status(200).json({ok:false,configured:true,lineups:[],source:'CENTRAL_CACHE'});}
};
