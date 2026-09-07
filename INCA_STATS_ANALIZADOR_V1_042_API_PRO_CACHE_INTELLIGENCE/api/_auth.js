const DEFAULT_SUPABASE_URL='https://jijxmshpzcoalohlhhnb.supabase.co';
const DEFAULT_SUPABASE_PUBLISHABLE_KEY='sb_publishable_pBnQxsVcunuxJrXLDNQnbQ_KWIbEyHy';

function supabaseConfig(){
  return {
    url: process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || DEFAULT_SUPABASE_URL,
    key: process.env.SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || DEFAULT_SUPABASE_PUBLISHABLE_KEY
  };
}

async function requireUser(req,res){
  const auth=String(req.headers.authorization||'');
  const match=auth.match(/^Bearer\s+(.+)$/i);
  if(!match){
    res.setHeader('Cache-Control','private, no-store');
    res.status(401).json({ok:false,code:'AUTH_REQUIRED',message:'Sesión requerida'});
    return null;
  }
  const {url,key}=supabaseConfig();
  try{
    const check=await fetch(`${url}/auth/v1/user`,{
      headers:{apikey:key,Authorization:`Bearer ${match[1]}`}
    });
    if(!check.ok)throw new Error('AUTH_INVALID');
    const user=await check.json();
    if(!user?.id)throw new Error('AUTH_INVALID');
    return user;
  }catch(_){
    res.setHeader('Cache-Control','private, no-store');
    res.status(401).json({ok:false,code:'AUTH_INVALID',message:'Sesión no válida'});
    return null;
  }
}

module.exports={requireUser};
