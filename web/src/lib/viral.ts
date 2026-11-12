import 'server-only';
import {createClient as createSupabaseClient} from '@supabase/supabase-js';
import {createClient} from '@/lib/supabase/server';
import {ledgerReport} from '../../server/viral/finance-ledger.mjs';
import {readFinanceBook} from '../../server/viral/google-finance.mjs';
import {createRuntime} from '../../server/viral/runtime.mjs';
import {withViralWriteRetry} from '../../server/viral/approval-retry.mjs';
import {stateReadFailure,retryStateRead} from '../../server/viral/state-read.mjs';
import {versionedStateCache} from '../../server/viral/state-cache.mjs';
import {commitState} from '../../server/viral/state-commit.mjs';
import {attendanceChange,applyAttendance} from '../../server/viral/attendance-fast.mjs';
import {ViralCommitUncertain} from '../../server/viral/commit-uploads.mjs';
import {attendanceQueue} from '../../server/viral/attendance-queue.mjs';
import {commitWithUploads} from '../../server/viral/commit-uploads.mjs';
import {avatarResolver} from '../../server/viral/avatar-cache.mjs';
export function viralService(){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key)throw Error('Chưa cấu hình Supabase cho Viral Network.');
 return createSupabaseClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
}
export async function webMember(){
 const auth=await createClient();const {data:{user},error}=await auth.auth.getUser();
 if(error||!user)return null;
 const svc=viralService();const {data,error:err}=await svc.from('viral_members').select('employee_id').eq('auth_user_id',user.id).eq('active',true).maybeSingle();
 if(err)throw err;if(!data)return null;return {employeeId:data.employee_id,email:user.email||'',authUserId:user.id};
}
// Full read of the shared JSON (several MB). Only needed when the version changed.
async function readFullViralState(){
 const svc=viralService();let result;
 const started=Date.now();
 try{result=await retryStateRead(async()=>{const response=await svc.from('viral_state').select('data,version').eq('id','main').abortSignal(AbortSignal.timeout(12000)).single();if(response.error)throw response.error;return response;},{retry:true});}catch(error){const failure=stateReadFailure(error);console.error('viral_state_read',{code:failure.code,stage:'main',elapsed_ms:Date.now()-started});throw failure;}
 return {data:result.data.data,version:Number(result.data.version)};
}
// Tiny read: version only (the JSON column is stored out of line and not fetched).
async function readViralVersion(){
 const svc=viralService(),started=Date.now();
 try{const response:any=await retryStateRead(async()=>{const r=await svc.from('viral_state').select('version').eq('id','main').abortSignal(AbortSignal.timeout(6000)).single();if(r.error)throw r.error;return r;},{retry:true});return Number(response.data.version);}
 catch(error){const failure=stateReadFailure(error);console.error('viral_state_read',{code:failure.code,stage:'version',elapsed_ms:Date.now()-started});throw failure;}
}
// Show Telegram notifications already delivered by the outbox worker as sent.
async function reconcileNotifications(data:any){
 const svc=viralService();
 const rows=data.books.main.Notifications||[],h=rows[0]||[],status=h.indexOf('status'),key=h.indexOf('id');
 const ids=rows.slice(1).filter((r:any)=>['pending','failed'].includes(r[status])).map((r:any)=>'notification:'+r[key]);
 for(let i=0;i<ids.length;i+=100){const {data:sent,error:e}=await svc.from('viral_outbox').select('id').in('id',ids.slice(i,i+100)).eq('status','sent').abortSignal(AbortSignal.timeout(8000));if(e)throw stateReadFailure(e);const done=new Set((sent||[]).map((m:any)=>m.id));for(const r of rows.slice(1))if(done.has('notification:'+r[key])){r[status]='sent';r[h.indexOf('sent_at')]=new Date().toISOString();}}
 return data;
}
const viralState=versionedStateCache({readVersion:readViralVersion,readFull:readFullViralState,reconcile:reconcileNotifications});
// Every caller gets a private copy that is current as of this request: the
// cached JSON is reused only while the database version is unchanged.
export async function loadViral(_options:{share?:boolean}={}){
 return {svc:viralService(),...await viralState()};
}
const persisted=(data:any)=>JSON.parse(JSON.stringify(data));
export function sameOrigin(req:Request){const origin=req.headers.get('origin');if(origin&&origin!==new URL(req.url).origin)throw Error('Nguồn yêu cầu không hợp lệ.');}
export const makeEvents=(data:any)=>{
 const events=(data.outbox||[]).filter((x:any)=>x.status==='pending').map((x:any)=>({id:x.id,chat_id:x.chatId,text:x.text,photo_file_id:null}));
 const cells=data.books.main.Notifications||[],h=cells[0]||[];
 for(const row of cells.slice(1)){const n=Object.fromEntries(h.map((key:string,i:number)=>[key,row[i]]));if(['pending','failed'].includes(n.status)&&n.telegram_id)events.push({id:'notification:'+n.id,chat_id:String(n.telegram_id),text:String(n.message),photo_file_id:n.photo_file_id||null});}
 return events;
};
const queuedAttendance=attendanceQueue();
export async function invokeViral(method:string,args:any[],initData:string,user:any){
 return queuedAttendance(method,()=>withViralWriteRetry(method,()=>invokeViralAttempt(method,args,initData,user)));
}
async function invokeViralAttempt(method:string,args:any[],initData:string,user:any,allowFastAttendance=true):Promise<any>{
 if(process.env.VIRAL_MAINTENANCE==='true')throw Error('Web đang tạm dừng để chuyển dữ liệu. Mini App cũ vẫn dùng bình thường.');
 const {svc,data,base,version}=await loadViral();
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
 if(JSON.stringify(rt.data)!==JSON.stringify(data)){
  // Check-in/out: write one row under a database lock (no version conflicts).
  if(method==='attendance'&&allowFastAttendance&&!rt.uploads.length){
   const change=attendanceChange(data,rt.data,{kind:args[0],employeeId:actor.id});
   if(change){
    let applied;
    try{applied=await applyAttendance((name:string,params:any)=>svc.rpc(name,params).abortSignal(AbortSignal.timeout(10000)),change);}
    catch{throw new ViralCommitUncertain();}
    if(applied.applied){
     if(applied.version===version+1){const main={...base.books.main,Attendance:rt.data.books.main.Attendance};viralState.remember(applied.version,persisted({...base,books:{...base.books,main}}));}
     return result;
    }
    // Already checked in, data moved, or SQL not installed: original path on fresh data.
    viralState.invalidate();
    return invokeViralAttempt(method,args,initData,user,false);
   }
  }
  const events=makeEvents(rt.data);rt.data.outbox=[];
  let saved:any=null;
  await commitWithUploads({uploads:rt.uploads,
   upload:(file:any)=>svc.storage.from('viral-files').upload(file.id,file.bytes,{contentType:file.type,upsert:false}),
   remove:async(ids:string[])=>{const {error}=await svc.storage.from('viral-files').remove(ids);if(error)throw error;},
   commit:async()=>{saved=await commitState({rpc:(name:string,params:any)=>svc.rpc(name,params).abortSignal(AbortSignal.timeout(20000)),base,next:rt.data,version,events});return saved;}
  });
  // CAS succeeded with expected_version, so the database now holds exactly rt.data at version+1.
  if(saved?.data===true&&!saved.unchanged)viralState.remember(version+1,persisted(rt.data));
 }
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
