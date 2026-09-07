const {requireUser}=require('./_auth');
// Las alineaciones ahora se consultan mediante:
// /api/match-center?action=lineups&fixtureId=...
module.exports=async function handler(req,res){
  const user=await requireUser(req,res);
  if(!user)return;
  res.setHeader('Cache-Control','private, max-age=30');
  res.setHeader('Vary','Authorization');
  res.status(200).json({ok:true,configured:false,lineups:[]});
};
