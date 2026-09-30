const ALLOWED_TOPICS = new Set(['General Inquiry','QuickSign','Convert','Teleprompter','Arcana Forge','Other']);
const esc = (s='') => String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export default async function handler(req,res){
  if(req.method!=='POST') return res.status(405).json({error:'Method not allowed.'});
  try{
    const {name='',email='',topic='',subject='',message='',website=''}=req.body||{};
    if(website) return res.status(200).json({ok:true});
    if(!name.trim()||!email.trim()||!subject.trim()||!message.trim()||!ALLOWED_TOPICS.has(topic)) return res.status(400).json({error:'Please complete all required fields.'});
    if(name.length>100||email.length>254||subject.length>160||message.length>5000) return res.status(400).json({error:'One or more fields are too long.'});
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({error:'Please enter a valid email address.'});
    const r=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({
      from:'MLDY Labs Website <onboarding@resend.dev>',
      to:['arcanaforgeapp@gmail.com'],
      reply_to:email.trim(),
      subject:`[MLDY Labs] ${topic}: ${subject.trim()}`,
      html:`<h2>New MLDY Labs website message</h2><p><strong>Name:</strong> ${esc(name)}</p><p><strong>Email:</strong> ${esc(email)}</p><p><strong>Topic:</strong> ${esc(topic)}</p><p><strong>Subject:</strong> ${esc(subject)}</p><hr><p style="white-space:pre-wrap">${esc(message)}</p>`
    })});
    const data=await r.json();
    if(!r.ok){console.error('Resend error',data);return res.status(502).json({error:'We could not send your message right now. Please try again shortly.'});}
    return res.status(200).json({ok:true});
  }catch(e){console.error(e);return res.status(500).json({error:'We could not send your message right now. Please try again shortly.'});}
}