import {NextResponse} from 'next/server';
import crypto from 'node:crypto';
import {viralService,loadViral,commitViral} from '@/lib/viral';
import {ViralVersionConflict} from '../../../../../server/viral/approval-retry.mjs';
import {createRuntime} from '../../../../../server/viral/runtime.mjs';
import {telegramFailure} from '../../../../../server/viral/telegram-errors.mjs';
import {drainNotifications} from '../../../../../server/viral/notification-worker.mjs';
export const runtime='nodejs';export const maxDuration=60;
export async function GET(req:Request){
 if(process.env.VIRAL_MAINTENANCE==='true')return NextResponse.json({error:'Tạm dừng để chuyển dữ liệu.'},{status:503});
 const secret=process.env.CRON_SECRET,provided=Buffer.from(req.headers.get('authorization')||''),expected=Buffer.from(`Bearer ${secret||''}`);
 if(!secret||provided.length!==expected.length||!crypto.timingSafeEqual(provided,expected))return NextResponse.json({error:'Không được phép'},{status:401});
 const token=process.env.TELEGRAM_BOT_TOKEN;if(!token)return NextResponse.json({error:'Chưa cấu hình bot Telegram'},{status:503});
 const began=Date.now(),workerDeadline=began+50000;let phase='load_state';
 try{
  // Group shift/lunch greetings are disabled by default; work reminders remain.
  const state=await loadViral(),rt=createRuntime(state.data,null,{BOT_TOKEN:token,WEB_APP_URL:process.env.VIRAL_WEB_URL,GROUP_GREETINGS_ENABLED:process.env.VIRAL_GROUP_GREETINGS_ENABLED});
  phase='scheduler';rt.run('v16Scheduler',[],true);
  // Save only the sheets the scheduler changed; also persist notifications the outbox already sent.
  phase='commit_scheduler';let committed=true;
  try{await commitViral(state.svc,state.data,state.version,rt,{forceWrites:state.reconciled?['books/main/Notifications']:[]});}
  catch(e){if(e instanceof ViralVersionConflict)committed=false;else throw e;}
  // A scheduler CAS conflict must not block delivery of already committed events.
  const svc=viralService(),errors=new Set<string>();
  const counts=await drainNotifications({deadline:workerDeadline,
   claim:async()=>{phase='claim_notifications';const {data,error}=await svc.rpc('viral_claim_notifications').abortSignal(AbortSignal.timeout(7000));if(error)throw error;return data||[];},
   send:async(m:any)=>{
   phase='send_telegram';let method='sendMessage',payload:any={chat_id:m.chat_id,text:m.body};
   if(m.photo_file_id){
    const f=rt.data.files[m.photo_file_id];if(!f)throw Error('Không thấy ảnh thông báo');
    const {data:blob,error:e}=await svc.storage.from('viral-files').download(f.path);if(e||!blob)throw Error('Không đọc được ảnh thông báo');
    const form=new FormData();form.append('chat_id',m.chat_id);form.append('caption',String(m.body).slice(0,1024));form.append('photo',blob,f.name);method='sendPhoto';payload=form;
   }
   const response=await fetch(`https://api.telegram.org/bot${token}/${method}`,{method:'POST',...(payload instanceof FormData?{body:payload}:{headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}),signal:AbortSignal.timeout(10000)});const result=await response.json();if(!response.ok||!result.ok){const error:any=Error(telegramFailure(result,response.status));error.retryAfter=Math.max(60,Math.min(86400,Number(result.parameters?.retry_after)||60));throw error;}
   },
   markSent:async(m:any)=>{phase='acknowledge_notification';const {error}=await svc.from('viral_outbox').update({status:'sent',lease_until:null,last_error:null}).eq('id',m.id).eq('status','sending').abortSignal(AbortSignal.timeout(7000));if(error)throw error;},
   markFailed:async(m:any,e:any)=>{const message=e instanceof Error&&/^(Token bot|Nhóm đã|Telegram |Bot |Không tìm thấy|Không thấy ảnh|Không đọc được ảnh)/.test(e.message)?e.message:'Chưa gửi được thông báo; kiểm tra kết nối rồi thử lại.';errors.add(message);
    // Existing SQL reclaims expired sending leases. Backoff prevents one bad
    // recipient consuming every batch and honors Telegram retry_after.
    const retryAfter=Math.max(60,Math.min(86400,Number(e?.retryAfter)||60));
    const {error}=await svc.from('viral_outbox').update({status:'sending',lease_until:new Date(Date.now()+retryAfter*1000).toISOString(),last_error:message}).eq('id',m.id).eq('status','sending').abortSignal(AbortSignal.timeout(7000));if(error)throw error;},
   defer:async(m:any)=>{const {error}=await svc.from('viral_outbox').update({status:'pending',lease_until:null,attempts:Math.max(0,Number(m.attempts||1)-1)}).eq('id',m.id).eq('status','sending').abortSignal(AbortSignal.timeout(7000));if(error)throw error;}
  });
  return NextResponse.json({ok:true,...counts,schedulerBusy:!committed,errors:[...errors]});
 }catch(e){const raw=String((e as any)?.code||''),code=/^(?:[0-9A-Z]{5}|PGRST[0-9]{3}|STATE_READ)$/.test(raw)?raw:'CRON_ERROR';console.error('viral_cron_failed',{phase,code,elapsedMs:Date.now()-began});return NextResponse.json({error:e instanceof Error?e.message:'Không xử lý được bộ gửi ['+code+'].',phase,code},{status:500});}
}
