import 'server-only';
import {createHash} from 'node:crypto';
import {createClient as createSupabaseClient} from '@supabase/supabase-js';
import {createClient} from '@/lib/supabase/server';
import {ledgerReport} from '../../server/viral/finance-ledger.mjs';
import {readFinanceBook} from '../../server/viral/google-finance.mjs';
import {createRuntime} from '../../server/viral/runtime.mjs';
import {withViralWriteRetry} from '../../server/viral/approval-retry.mjs';
import {sharedStateRead,stateReadFailure,retryStateRead} from '../../server/viral/state-read.mjs';
import {attendanceQueue} from '../../server/viral/attendance-queue.mjs';
import {commitWithUploads} from '../../server/viral/commit-uploads.mjs';
import {stateCache,commitChanges} from '../../server/viral/state-cache.mjs';
import {avatarResolver} from '../../server/viral/avatar-cache.mjs';
export function viralService(){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key)throw Error('Chưa cấu hình Supabase cho Viral Network.');
 return createSupabaseClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
}
// Verified sign-ins are remembered for 30s per access token (stored as a hash), saving a Supabase Auth
// round trip and a members query on every request. Business permissions still check the employee's
// `active` flag in fresh data on every call; a revoked web session stops working within 30s.
const MEMBER_TTL_MS=30000,memberCache=new Map<string,{at:number,member:{employeeId:string,email:string,authUserId:string}}>();
export async function webMember(){
 const auth=await createClient();
 const token=(await auth.auth.getSession()).data.session?.access_token,cacheKey=token?createHash('sha256').update(token).digest('hex'):'';
 const hit=cacheKey?memberCache.get(cacheKey):undefined;if(hit&&Date.now()-hit.at<MEMBER_TTL_MS)return hit.member;
 const {data:{user},error}=await auth.auth.getUser();
 if(error||!user)return null;
 const svc=viralService();const {data,error:err}=await svc.from('viral_members').select('employee_id').eq('auth_user_id',user.id).eq('active',true).maybeSingle();
 if(err)throw err;if(!data)return null;
 const member={employeeId:data.employee_id,email:user.email||'',authUserId:user.id};
 if(cacheKey){if(memberCache.size>1000)memberCache.clear();memberCache.set(cacheKey,{at:Date.now(),member});}
 return member;
}
// Full download only when the version changed since this server instance last read it.
const viralStateCache=stateCache({
 delta:async(since:number)=>{const svc=viralService(),{data,error}=await svc.rpc('viral_state_delta',{since_version:since}).abortSignal(AbortSignal.timeout(12000));if(error){if(error.code==='PGRST202')return null;throw error;}return data;},
 probe:async()=>{const svc=viralService(),{data,error}=await svc.from('viral_state').select('version').eq('id','main').abortSignal(AbortSignal.timeout(8000)).single();if(error)throw error;return Number(data.version);},
 fetchFull:async()=>{const svc=viralService(),response=await svc.from('viral_state').select('data,version').eq('id','main').abortSignal(AbortSignal.timeout(15000)).single();if(response.error)throw response.error;return {data:response.data.data,version:Number(response.data.version)};}
});
async function readRawViralState(retry=false){
 const started=Date.now();
 try{return await retryStateRead(()=>viralStateCache.read(),{retry});}catch(error){const failure=stateReadFailure(error);console.error('viral_state_read',{code:failure.code,stage:'main',elapsed_ms:Date.now()-started,retry_enabled:retry});throw failure;}
}
// Mark notifications already delivered by the outbox worker. Copy-on-write: the sheet is replaced,
// never edited in place, so a shared cached snapshot is never modified.
async function reconcileNotifications(svc:any,data:any){
 const rows=data.books.main.Notifications||[],h=rows[0]||[],status=h.indexOf('status'),key=h.indexOf('id');
 const ids=rows.slice(1).filter((r:any)=>['pending','failed'].includes(r[status])).map((r:any)=>'notification:'+r[key]);
 const done=new Set<string>();
 for(let i=0;i<ids.length;i+=100){const {data:sent,error:e}=await svc.from('viral_outbox').select('id').in('id',ids.slice(i,i+100)).eq('status','sent').abortSignal(AbortSignal.timeout(8000));if(e)throw stateReadFailure(e);for(const m of sent||[])done.add(m.id);}
 if(!done.size)return false;
 const at=new Date().toISOString(),sentAt=h.indexOf('sent_at');
 data.books.main.Notifications=rows.map((r:any,i:number)=>{if(!i||!done.has('notification:'+r[key]))return r;const copy=r.slice();copy[status]='sent';copy[sentAt]=at;return copy;});
 return true;
}
// In-flight sharing for read-only methods; the cached snapshot itself is immutable so no clone is needed.
let inflightRead:Promise<any>|null=null;
function sharedRawRead(){if(!inflightRead){const p=readRawViralState(true);inflightRead=p;p.finally(()=>{if(inflightRead===p)inflightRead=null;}).catch(()=>{});}return inflightRead;}
const readSharedViralState=sharedStateRead(()=>readRawViralState(true));
/**
 * light: return a private shallow view of the cached snapshot instead of a deep copy. Only for callers
 * that hand the data to createRuntime (which copies sheets lazily) and do not edit nested values.
 */
export async function loadViral(options:{share?:boolean,light?:boolean}={}){
 const svc=viralService();let raw:{data:any,version:number};
 if(options.light){
  const snap=await (options.share?sharedRawRead():readRawViralState());
  raw={version:snap.version,data:{...snap.data,books:{...snap.data.books,main:{...snap.data.books.main}},files:structuredClone(snap.data.files||{})}};
 }
 // sharedStateRead already returns a private clone; the direct path clones the cached snapshot here.
 else raw=options.share?await readSharedViralState():await readRawViralState().then(r=>({data:structuredClone(r.data),version:r.version}));
 const reconciled=await reconcileNotifications(svc,raw.data);
 return {svc,data:raw.data,version:raw.version,reconciled};
}
/**
 * Save the difference between `base` and the runtime's state. Only changed sheets are sent and
 * only concurrent writes to sheets this request read or wrote cause a version conflict.
 * Returns {changed,committed,version}.
 */
export async function commitViral(svc:any,base:any,version:number,rt:any,options:{forceWrites?:string[],rowMerge?:Record<string,string[]>}={}){
 const changes=rt.changes(base,{forceWrites:options.forceWrites||[],rowMerge:options.rowMerge||{}});
 if(!changes.patches.length&&!changes.outboxDone.length)return {changed:false,committed:true,version};
 let saved:any;
 await commitWithUploads({uploads:rt.uploads||[],
  upload:(file:any)=>svc.storage.from('viral-files').upload(file.id,file.bytes,{contentType:file.type,upsert:false}),
  remove:async(ids:string[])=>{const {error}=await svc.storage.from('viral-files').remove(ids);if(error)throw error;},
  commit:async()=>{saved=await commitChanges({rpc:(name:string,params:any)=>svc.rpc(name,params).abortSignal(AbortSignal.timeout(20000)),version,changes,events:makeEvents(rt.data),fullData:()=>rt.data,onFallback:()=>console.warn('viral_commit_patch missing: run supabase/viral-fast-commit.sql')});return saved;}
 });
 if(saved?.legacy)viralStateCache.invalidate();else viralStateCache.committed(version,saved.version,changes.patches,changes.outboxDone);
 readSharedViralState.invalidate();
 return {changed:true,committed:true,version:saved.version};
}
export function sameOrigin(req:Request){const origin=req.headers.get('origin');if(origin&&origin!==new URL(req.url).origin)throw Error('Nguồn yêu cầu không hợp lệ.');}
export const makeEvents=(data:any)=>{
 const events=(data.outbox||[]).filter((x:any)=>x.status==='pending').map((x:any)=>({id:x.id,chat_id:x.chatId,text:x.text,photo_file_id:null}));
 const cells=data.books.main.Notifications||[],h=cells[0]||[];
 for(const row of cells.slice(1)){const n=Object.fromEntries(h.map((key:string,i:number)=>[key,row[i]]));if(['pending','failed'].includes(n.status)&&n.telegram_id)events.push({id:'notification:'+n.id,chat_id:String(n.telegram_id),text:String(n.message),photo_file_id:n.photo_file_id||null});}
 return events;
};
const queuedAttendance=attendanceQueue();
// Sheets these methods may save row-by-row. They only read/modify the caller's own row (found by
// telegram_id + date), so concurrent check-ins by different people merge instead of conflicting;
// the unique columns stop the same person getting two rows for one day.
const attendanceRows={'books/main/Attendance':['telegram_id','date'],'books/main/Notifications':['event_key']};
const ROW_MERGE:Record<string,Record<string,string[]>>={attendance:attendanceRows,fieldAttendance:attendanceRows,overtime:{'books/main/Overtime':['telegram_id','date']}};
export async function invokeViral(method:string,args:any[],initData:string,user:any){
 return queuedAttendance(method,()=>withViralWriteRetry(method,()=>invokeViralAttempt(method,args,initData,user)));
}
async function invokeViralAttempt(method:string,args:any[],initData:string,user:any){
 if(process.env.VIRAL_MAINTENANCE==='true')throw Error('Web đang tạm dừng để chuyển dữ liệu. Mini App cũ vẫn dùng bình thường.');
 const share=['snapshotHome','snapshotCore','snapshotManager','avatarBatch','accountingExpenses','productionPage','productionScreen','attendanceStatus','reviewQueue','staffProductionWorkload'].includes(method);
 const {svc,data,version}=await loadViral({share,light:true});
 let rt=createRuntime(data,user,{BOT_TOKEN:process.env.TELEGRAM_BOT_TOKEN,WEB_APP_URL:process.env.VIRAL_WEB_URL});
 rt.context.__authInput=initData;
 const vm=await import('node:vm');
 if(['personnelDirectory','personnelDetail','savePersonnel','personnelHistory','restorePersonnel'].includes(method)){
  vm.runInContext(`const previousHRPermission=hrRequireManager_;hrRequireManager_=function(u){if(String(u.id)===String(setting_('hr_telegram_id')||''))return;return previousHRPermission(u);};const previousHRValidation=hrValidation_;hrValidation_=function(data,before,all,u){if(!isDirector_(u)&&String(u.id)===String(setting_('hr_telegram_id')||'')&&before&&role_(before.role)!=='employee')throw Error('HR chỉ sửa hồ sơ nhân viên; hồ sơ quản lý cần Ban giám đốc.');return previousHRValidation(data,before,all,u);};`,rt.context,{timeout:5000});
 }
 const actor=vm.runInContext('auth_(__authInput)',rt.context,{timeout:5000});
 if(method==='financeReport'){
  if(actor.role!=='director')throw Error('Chỉ Ban giám đốc được xem Thu chi');
  const {config,book,detailBook,format}=await readFinanceBook(data);
  if(format==='ledger-v2')return ledgerReport(book,detailBook,args[0]||{},config);
  if(args[0]?.filterMode==='range')throw Error('Lọc khoảng ngày chỉ hỗ trợ mẫu Thu chi hai tab mới.');
  const temp=structuredClone(data),id='external_finance_read_only_book';
  temp.books[id]={[config.sheetName]:book.cells};temp.properties.FINANCE_SHEET_ID=id;temp.properties.FINANCE_SHEET_NAME=config.sheetName;
  const financeRuntime=createRuntime(temp,user,{BOT_TOKEN:process.env.TELEGRAM_BOT_TOKEN,GRID_META:{[id]:{[config.sheetName]:book}},GRID_TIMEZONE:{[id]:book.timeZone}});
  // Google sheet data is request-local. Never persist the copied ledger in Supabase.
  return financeRuntime.run(method,[initData,...args]);
 }
 // Resolve permission BEFORE downloading files.
 let fileIds:string[]=[];
 if(['getV20ExpenseBill','getV20ExpenseBillImage'].includes(method)){
  const info=rt.run('getV20ExpenseBills',[initData,args[0]]);fileIds=method==='getV20ExpenseBillImage'?[String(args[1])]:info.files.slice(0,1);
  if(fileIds.some(id=>!info.files.includes(id)))throw Error('Ảnh không thuộc phiếu này');
 }else if(method==='getV20PaymentProof'){
  const rows=data.books.main.Expenses,h=rows[0];const expense=rows.slice(1).map((r:any)=>Object.fromEntries(h.map((k:string,i:number)=>[k,r[i]]))).find((r:any)=>String(r.id)===String(args[0]));
  const accountant=data.books.main.Settings.find((r:any)=>r[0]==='accountant_telegram_id')?.[1];
  if(!expense||expense.status!=='paid'||!expense.payment_file_id)throw Error('Phiếu chưa có ảnh chuyển khoản');
  if(String(expense.telegram_id)!==actor.id&&actor.id!==String(accountant)&&actor.role!=='director')throw Error('Bạn không được xem ảnh này');
  fileIds=[String(expense.payment_file_id)];
 }
 for(const id of fileIds){const f=data.files[id];if(!f||f.deleted)throw Error('Không thấy tệp đính kèm');const {data:blob,error}=await svc.storage.from('viral-files').download(f.path);if(error||!blob)throw Error('Không đọc được tệp đính kèm');f.bytes=Buffer.from(await blob.arrayBuffer()).toString('base64');}
 if(fileIds.length)rt=createRuntime(data,user,{BOT_TOKEN:process.env.TELEGRAM_BOT_TOKEN,WEB_APP_URL:process.env.VIRAL_WEB_URL});
 let result;
 if(method==='avatarBatch')result=await avatars(rt,args[0]);
 else result=rt.run(method,[initData,...args]);
 for(const file of Object.values(rt.data.files||{}) as any[])delete file.bytes;
 for(const file of Object.values(data.files||{}) as any[])delete file.bytes;
 await commitViral(svc,data,version,rt,{rowMerge:ROW_MERGE[method]});
 return result;
}
const resolveAvatarPhotos=avatarResolver();
async function avatars(rt:any,ids:any){
 if(!Array.isArray(ids)||ids.length>8)throw Error('Danh sách ảnh đại diện không hợp lệ.');
 const token=process.env.TELEGRAM_BOT_TOKEN,employees=rt.data.books.main.Employees||[],headers=employees[0]||[],idCol=headers.indexOf('telegram_id'),activeCol=headers.indexOf('active');
 const allowed=new Set(employees.slice(1).filter((r:any)=>String(r[activeCol]).toLowerCase()==='true').map((r:any)=>String(r[idCol]))),out:Record<string,string>={},requested:string[]=[];
 for(const id of [...new Set(ids.map(String))] as string[]){
  if(!allowed.has(id)||!/^\d+$/.test(id))continue;
  const a=rt.data.books.main.UserAvatars||[],h=a[0]||[],custom=a.slice(1).find((r:any)=>String(r[h.indexOf('telegram_id')])===id);
  if(custom){out[id]=custom[h.indexOf('mode')]==='custom'&&custom[h.indexOf('file_id')]?'/api/viral/avatar?id='+encodeURIComponent(String(custom[h.indexOf('file_id')])):'';continue;}
  if(token)requested.push(id);
 }
 if(!token||!requested.length)return out;
 const photos=await resolveAvatarPhotos(requested,async(id:string,deadline:number)=>{
  const request=async(url:string,init:RequestInit={})=>{const left=deadline-Date.now();if(left<=0)throw Error('Avatar deadline');return fetch(url,{...init,signal:AbortSignal.timeout(Math.min(2500,left))});};
  const photo=await request(`https://api.telegram.org/bot${token}/getUserProfilePhotos`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({user_id:id,limit:1})}).then(r=>r.json());
  if(!photo.ok)return undefined;const fid=photo.result?.photos?.[0]?.[0]?.file_id;if(!fid)return '';
  const file=await request(`https://api.telegram.org/bot${token}/getFile?file_id=${encodeURIComponent(fid)}`).then(r=>r.json());if(!file.ok||!file.result?.file_path)return undefined;
  const response=await request(`https://api.telegram.org/file/bot${token}/${file.result.file_path}`);if(!response.ok)return undefined;
  const bytes=Buffer.from(await response.arrayBuffer());if(bytes.length>256*1024)return undefined;
  return `data:image/jpeg;base64,${bytes.toString('base64')}`;
 },{scope:token});
 return {...out,...photos};
}
