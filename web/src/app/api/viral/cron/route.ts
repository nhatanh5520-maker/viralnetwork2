import {NextResponse} from 'next/server';
import crypto from 'node:crypto';
import {viralService,loadViral} from '@/lib/viral';
import {createRuntime} from '../../../../../server/viral/runtime.mjs';
import {telegramFailure} from '../../../../../server/viral/telegram-errors.mjs';
import {drainNotifications} from '../../../../../server/viral/notification-worker.mjs';
export const runtime='nodejs';export const maxDuration=60;
export async function GET(req:Request){
 if(process.env.VIRAL_MAINTENANCE==='true')return NextResponse.json({error:'Tạm dừng để chuyển dữ liệu.'},{status:503});
 const secret=process.env.CRON_SECRET,provided=req.headers.get('authorization')||'';
 if(!secret||provided.length!==(`Bearer ${secret}`).length||!crypto.timingSafeEqual(Buffer.from(provided),Buffer.from(`Bearer ${secret}`)))return NextResponse.json({error:'Không được phép'},{status:401});
 const token=process.env.TELEGRAM_BOT_TOKEN;if(!token)return NextResponse.json({error:'Chưa cấu hình bot Telegram'},{status:503});
 const workerDeadline=Date.now()+50000;
 try{
  // Group shift/lunch greetings are disabled by default; work reminders remain.
  const state=await loadViral(),rt=createRuntime(state.data,null,{BOT_TOKEN:token,WEB_APP_URL:process.env.VIRAL_WEB_URL,GROUP_GREETINGS_ENABLED:process.env.VIRAL_GROUP_GREETINGS_ENABLED});
  rt.run('v16Scheduler',[],true);
  const h=rt.data.books.main.Notifications[0],events=rt.data.books.main.Notifications.slice(1).map((r:any)=>Object.fromEntries(h.map((k:string,i:number)=>[k,r[i]]))).filter((r:any)=>['pending','failed'].includes(r.status)).map((r:any)=>({id:'notification:'+r.id,chat_id:String(r.telegram_id),text:String(r.message),photo_file_id:r.photo_file_id||null}));
  events.push(...rt.data.outbox.filter((r:any)=>r.status==='pending').map((r:any)=>({id:r.id,chat_id:r.chatId,text:r.text,photo_file_id:null})));
  const {data:committed,error:commitError}=await state.svc.rpc('viral_commit',{expected_version:state.version,new_data:rt.data,events});if(commitError)throw commitError;
  // A scheduler CAS conflict must not block delivery of already committed events.
  const svc=viralService(),errors=new Set<string>();
  const counts=await drainNotifications({deadline:workerDeadline,
   claim:async()=>{const {data,error}=await svc.rpc('viral_claim_notifications');if(error)throw error;return data||[];},
   send:async(m:any)=>{
   let method='sendMessage',payload:any={chat_id:m.chat_id,text:m.body};
   if(m.photo_file_id){
    const f=rt.data.files[m.photo_file_id];if(!f)throw Error('Không thấy ảnh thông báo');
    const {data:blob,error:e}=await svc.storage.from('viral-files').download(f.path);if(e||!blob)throw Error('Không đọc được ảnh thông báo');
    const form=new FormData();form.append('chat_id',m.chat_id);form.append('caption',String(m.body).slice(0,1024));form.append('photo',blob,f.name);method='sendPhoto';payload=form;
   }
   const response=await fetch(`https://api.telegram.org/bot${token}/${method}`,{method:'POST',...(payload instanceof FormData?{body:payload}:{headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}),signal:AbortSignal.timeout(10000)});const result=await response.json();if(!response.ok||!result.ok){const error:any=Error(telegramFailure(result,response.status));error.retryAfter=Math.max(60,Math.min(86400,Number(result.parameters?.retry_after)||60));throw error;}
   },
   markSent:async(m:any)=>{const {error}=await svc.from('viral_outbox').update({status:'sent',lease_until:null,last_error:null}).eq('id',m.id).eq('status','sending');if(error)throw error;},
   markFailed:async(m:any,e:any)=>{const message=e instanceof Error&&/^(Token bot|Nhóm đã|Telegram |Bot |Không tìm thấy|Không thấy ảnh|Không đọc được ảnh)/.test(e.message)?e.message:'Chưa gửi được thông báo; kiểm tra kết nối rồi thử lại.';errors.add(message);
    // Existing SQL reclaims expired sending leases. Backoff prevents one bad
    // recipient consuming every batch and honors Telegram retry_after.
    const retryAfter=Math.max(60,Math.min(86400,Number(e?.retryAfter)||60));
    const {error}=await svc.from('viral_outbox').update({status:'sending',lease_until:new Date(Date.now()+retryAfter*1000).toISOString(),last_error:message}).eq('id',m.id).eq('status','sending');if(error)throw error;},
   defer:async(m:any)=>{const {error}=await svc.from('viral_outbox').update({status:'pending',lease_until:null,attempts:Math.max(0,Number(m.attempts||1)-1)}).eq('id',m.id).eq('status','sending');if(error)throw error;}
  });
  return NextResponse.json({ok:true,...counts,schedulerBusy:!committed,errors:[...errors]});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Lỗi gửi thông báo'},{status:500});}
}
