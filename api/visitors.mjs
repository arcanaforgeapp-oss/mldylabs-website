import { createHash, timingSafeEqual } from 'node:crypto';
import config from './visitor-config.json' with { type:'json' };
const digest=s=>createHash('sha256').update(s).digest();
export function validate(body){
  if(!body||typeof body!=='object'||Array.isArray(body)||JSON.stringify(body).length>2048)return false;
  if(body.consent!==true||!/^[a-f0-9]{32}$/.test(body.visitor||'')||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(body.id||''))return false;
  if(!['pageview','heartbeat','event','withdraw'].includes(body.kind)||!config.pages.includes(body.page))return false;
  return body.kind!=='event'||config.events.includes(body.name);
}
export default async function handler(req,res){
  res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Content-Type-Options','nosniff');
  const hash=process.env.VISITOR_STATS_HASH,internal=process.env.VISITOR_INTERNAL_KEY;
  if(!/^[a-f0-9]{64}$/.test(hash||'')||!internal)return res.status(503).json({error:'Visitor service is not configured.'});
  if(req.method==='GET'){
    const token=String(req.headers.authorization||'').replace(/^Bearer /,'');
    if(token.length>200||!timingSafeEqual(digest(token),Buffer.from(hash,'hex')))return res.status(401).json({error:'Authentication required.'});
  }else{
    const origin=req.headers.origin;
    if(!config.origins.includes(origin))return res.status(403).json({error:'Origin denied.'});
    res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');
    if(req.method==='OPTIONS'){res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type');return res.status(204).end();}
    if(req.method!=='POST')return res.status(405).json({error:'Method not allowed.'});
    if(Number(req.headers['content-length']||0)>2048)return res.status(413).json({error:'Request too large.'});
    let body=req.body;if(typeof body==='string'){try{body=JSON.parse(body);}catch{return res.status(400).json({error:'Invalid request.'});}}
    if(!validate(body))return res.status(400).json({error:'Invalid request.'});
    // Drop every unneeded field before forwarding to the isolated analytics service.
    req.body={consent:true,visitor:body.visitor,id:body.id,kind:body.kind,page:body.page,...(body.kind==='event'?{name:body.name}:{})};
  }
  try{
    const response=await fetch(`https://arcana-forge-backend.onrender.com/visitor-monitor/${config.site}`,{method:req.method,headers:{Authorization:`Bearer ${internal}`,'Content-Type':'application/json'},...(req.method==='POST'?{body:JSON.stringify(req.body)}:{}),signal:AbortSignal.timeout(15000),redirect:'error'});
    if(response.status===204)return res.status(204).end();
    if(response.status===429)return res.status(429).json({error:'Please slow down.'});
    if(!response.ok)return res.status(503).json({error:'Visitor service temporarily unavailable.'});
    const data=await response.json();return res.status(200).json(data);
  }catch{return res.status(503).json({error:'Visitor service temporarily unavailable.'});}
}
