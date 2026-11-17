import {NextResponse} from 'next/server';
import crypto from 'node:crypto';
import {viralService,loadViral,bookingSheetRows,syncBookingsToSheet,invalidateViralState} from '@/lib/viral';
import {createRuntime} from '../../../../../server/viral/runtime.mjs';
import {telegramFailure} from '../../../../../server/viral/telegram-errors.mjs';
import {drainNotifications} from '../../../../../server/viral/notification-worker.mjs';
import {prepareScheduler} from '../../../../../server/viral/scheduler-commit.mjs';
import {commitChanges} from '../../../../../server/viral/patch-commit.mjs';
import {pendingNotificationEvents,trimCandidates,trimNotifications} from '../../../../../server/viral/notification-store.mjs';
import {scopeConfig} from '../../../../../server/viral/state-scopes.mjs';
export const runtime='nodejs';export const maxDuration=60;
let lastTrimAt=0;
export async function GET(req:Request){
 if(process.env.VIRAL_MAINTENANCE==='true')return NextResponse.json({error:'Tạm dừng để chuyển dữ liệu.'},{status:503});
 const secret=process.env.CRON_SECRET,provided=Buffer.from(req.headers.get('authorization')||''),expected=Buffer.from(`Bearer ${secret||''}`);
 if(!secret||provided.length!==expected.length||!crypto.timingSafeEqual(provided,expected))return NextResponse.json({error:'Không được phép'},{status:401});
 const token=process.env.TELEGRAM_BOT_TOKEN;if(!token)return NextResponse.json({error:'Chưa cấu hình bot Telegram'},{status:503});
 const began=Date.now(),workerDeadline=began+50000;let phase='load_state';
 try{
  // Group shift/lunch greetings are disabled by default; work reminders remain.
  const {state,rt,full}=await prepareScheduler({
   loadPreview:()=>loadViral({share:true,scope:'scheduler'}),loadFresh:()=>loadViral(),
   run:(data:any,preview:boolean)=>{
    phase=preview?'scheduler_preview':'scheduler_fresh';
    const result=createRuntime(data,null,{BOT_TOKEN:token,WEB_APP_URL:process.env.VIRAL_WEB_URL,GROUP_GREETINGS_ENABLED:process.env.VIRAL_GROUP_GREETINGS_ENABLED,...(preview?{READ_TABLES:scopeConfig('scheduler').tables}:{})});
    result.run('v16Scheduler',[],true);return result;
   },
  });
  // Save only what the scheduler changed (viral_commit_patch), not the whole document.
  phase='commit_scheduler';let changed=false,committed=true;
  if(full){
   const changes=rt.changes(state.data);
   if(changes.patches.length||changes.outboxDone.length){
    changed=true;
    const saved:any=await commitChanges({rpc:(name:string,params:any)=>state.svc.rpc(name,params).abortSignal(AbortSignal.timeout(10000)),version:state.version,changes,events:pendingNotificationEvents(rt.data),fullData:()=>rt.data});
    if(saved.error)throw saved.error;committed=saved.data===true;
   }
  }
  if(changed&&committed)invalidateViralState();
  // Retry path for the booking Sheet copy: a no-op when this instance already wrote the same data.
  try{phase='booking_sheet';await syncBookingsToSheet(bookingSheetRows(rt));}catch(e){console.error('booking_sheet_sync',(e as Error).message);}
  // Safety net: saves only hand over the notifications they create, so make sure recent pending rows are
  // queued even when nothing was committed. Rows already in viral_outbox are left untouched (no resend).
  if(!(changed&&committed)){
   phase='queue_pending';const recent=pendingNotificationEvents(rt.data,{since:Date.now()-2*86400000});
   if(recent.length){const {error}=await viralService().from('viral_outbox').upsert(recent.map((e:any)=>({id:e.id,chat_id:e.chat_id,body:e.text,photo_file_id:e.photo_file_id})),{onConflict:'id',ignoreDuplicates:true}).abortSignal(AbortSignal.timeout(8000));if(error)throw error;}
  }
  // Keep the state small: clear the text of notifications delivered more than 3 days ago (rows and
  // event keys stay for de-duplication). The trim rewrites the Notifications sheet, which makes saves
  // running at that moment retry, so it runs at night (00:00-04:59), or in the day only for a large backlog.
  let trimmed=0;
  const candidates=trimCandidates(rt.data.books.main.Notifications),vnHour=Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Ho_Chi_Minh',hour:'2-digit',hourCycle:'h23'}).format(new Date()));
  if((candidates>=1000||vnHour<5&&candidates>0)&&Date.now()-lastTrimAt>20*60000){
   lastTrimAt=Date.now();phase='trim_notifications';
   const fresh=await loadViral(),cut=trimNotifications(fresh.data.books.main.Notifications);
   if(cut){
    const key='books/main/Notifications',next={...fresh.data,books:{...fresh.data.books,main:{...fresh.data.books.main,Notifications:cut.sheet}}};
    const saved:any=await commitChanges({rpc:(name:string,params:any)=>fresh.svc.rpc(name,params).abortSignal(AbortSignal.timeout(10000)),version:fresh.version,
     changes:{reads:[key,key+'#rows'],writes:[key],patches:[{path:['books','main','Notifications'],value:cut.sheet}],outboxDone:[]},events:[],fullData:()=>next});
    if(saved.error)throw saved.error;if(saved.data){trimmed=cut.trimmed;invalidateViralState();}
   }
  }
  // A scheduler CAS conflict must not block delivery of already committed events.
  const svc=viralService(),errors=new Set<string>();
  const counts=await drainNotifications({deadline:workerDeadline,
   claim:async()=>{phase='claim_notifications';const {data,error}=await svc.rpc('viral_claim_notifications').abortSignal(AbortSignal.timeout(7000));if(error)throw error;return data||[];},
   send:async(m:any)=>{
   phase='send_telegram';let method='sendMessage',payload:any={chat_id:m.chat_id,text:m.body};
   if(m.photo_file_id){
    if(!rt.data.files[m.photo_file_id]){const metadata=await loadViral({share:true,scope:'deliveryFiles'});rt.data.files=metadata.data.files;}
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
  return NextResponse.json({ok:true,...counts,schedulerBusy:!committed,trimmedNotifications:trimmed,errors:[...errors]});
 }catch(e){const raw=String((e as any)?.code||''),code=/^(?:[0-9A-Z]{5}|PGRST[0-9]{3}|STATE_READ)$/.test(raw)?raw:'CRON_ERROR';console.error('viral_cron_failed',{phase,code,elapsedMs:Date.now()-began});return NextResponse.json({error:e instanceof Error?e.message:'Không xử lý được bộ gửi ['+code+'].',phase,code},{status:500});}
}
