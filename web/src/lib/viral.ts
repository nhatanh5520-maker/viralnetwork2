import 'server-only';
import {createClient as createSupabaseClient} from '@supabase/supabase-js';
import {createClient} from '@/lib/supabase/server';
import {ledgerReport} from '../../server/viral/finance-ledger.mjs';
import {readFinanceBook} from '../../server/viral/google-finance.mjs';
import {createRuntime} from '../../server/viral/runtime.mjs';
import {withViralWriteRetry} from '../../server/viral/approval-retry.mjs';
import {versionedStateRead,stateReadFailure,retryStateRead} from '../../server/viral/state-read.mjs';
import {scopeForMethod,scopeConfig,scopeSelect,scopedState,projectState,ReadScopeMiss} from '../../server/viral/state-scopes.mjs';
import {attendanceQueue} from '../../server/viral/attendance-queue.mjs';
import {commitWithUploads} from '../../server/viral/commit-uploads.mjs';
import {avatarResolver} from '../../server/viral/avatar-cache.mjs';
import {loadAttendanceArchive,overlayAttendance} from '../../server/viral/attendance-archive.mjs';
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
async function readFreshViralState(retry=false){
 const svc=viralService();let result;
 const started=Date.now();
 try{result=await retryStateRead(async()=>{const response=await svc.from('viral_state').select('data,version').eq('id','main').abortSignal(AbortSignal.timeout(12000)).single();if(response.error)throw response.error;return response;},{retry});}catch(error){const failure=stateReadFailure(error);console.error('viral_state_read',{code:failure.code,stage:'main',elapsed_ms:Date.now()-started,retry_enabled:retry});throw failure;}
 const {data}=result;
 const rows=data.data.books.main.Notifications||[],h=rows[0]||[],status=h.indexOf('status'),key=h.indexOf('id');
 const ids=rows.slice(1).filter((r:any)=>['pending','failed'].includes(r[status])).map((r:any)=>'notification:'+r[key]);
 for(let i=0;i<ids.length;i+=100){const {data:sent,error:e}=await svc.from('viral_outbox').select('id').in('id',ids.slice(i,i+100)).eq('status','sent').abortSignal(AbortSignal.timeout(8000));if(e)throw stateReadFailure(e);const done=new Set((sent||[]).map((m:any)=>m.id));for(const r of rows.slice(1))if(done.has('notification:'+r[key])){r[status]='sent';r[h.indexOf('sent_at')]=new Date().toISOString();}}
 return {data:data.data,version:data.version};
}
async function stateQuery(columns:string,retry=true){
 try{return await retryStateRead(async()=>{
  const response=await viralService().from('viral_state').select(columns).eq('id','main').abortSignal(AbortSignal.timeout(12000)).single();
  if(response.error)throw response.error;return response.data;
 },{retry});}catch(error){throw stateReadFailure(error);}
}
const readSharedViralState=versionedStateRead({
 readVersion:async()=>{const row:any=await stateQuery('version');return row.version;},
 readSnapshot:async(scope:string)=>{
  if(scope==='full')return readFreshViralState(true);
  try{return scopedState(await stateQuery(scopeSelect(scope),false),scope);}
  catch(error){
   // JSON-path projection can time out on a large compressed state document.
   // Fall back only on database cancellation, never on permissions or missing rows.
   if((error as any)?.code!=='57014')throw error;
   console.warn('viral_scoped_read_timeout',{scope});
   const fresh=await readFreshViralState(true);
   return {data:projectState(fresh.data,scope),version:fresh.version};
  }
 },
});
export function invalidateViralState(){readSharedViralState.invalidate();}
export async function loadViral(options:{share?:boolean;scope?:string}={}){
 if(options.scope&&!options.share)throw Error('Read scopes cannot be used for writes.');
 return {svc:viralService(),...await (options.share?readSharedViralState(options.scope||'full'):readFreshViralState(true))};
}
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
async function invokeViralAttempt(method:string,args:any[],initData:string,user:any){
 const scope=scopeForMethod(method);
 try{return await invokeViralOnce(method,args,initData,user,scope);}
 catch(error){
  if(scope&&error instanceof ReadScopeMiss){
   console.warn('viral_read_profile_fallback',{method,table:error.table});
   // Future business changes may add a dependency or initialization side effect.
   // Retry from a fresh COMPLETE snapshot; never commit a partial projection.
   return invokeViralOnce(method,args,initData,user,null);
  }
  throw error;
 }
}
async function invokeViralOnce(method:string,args:any[],initData:string,user:any,scope:string|null){
 if(process.env.VIRAL_MAINTENANCE==='true')throw Error('Web đang tạm dừng để chuyển dữ liệu. Mini App cũ vẫn dùng bình thường.');
 const {svc,data,version}=await loadViral(scope?{share:true,scope}:{});
 // Daily attendance and production do not depend on Google Sheets availability.
 // Compact archived totals serve monthly summaries; only historical row reports fetch Sheets.
 const needsArchivedRows=['fieldAttendanceReport','managerAttendanceDay'].includes(method);
 const archiveView=overlayAttendance(data,needsArchivedRows?await loadAttendanceArchive(data):null);
 const runtimeEnv={BOT_TOKEN:process.env.TELEGRAM_BOT_TOKEN,WEB_APP_URL:process.env.VIRAL_WEB_URL,...(scope?{READ_TABLES:scopeConfig(scope).tables}:{})};
 let rt=createRuntime(archiveView.input,user,runtimeEnv);
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
 if(fileIds.length){archiveView.input.files=data.files;rt=createRuntime(archiveView.input,user,runtimeEnv);}
 let result;
 if(method==='avatarBatch')result=await avatars(rt,args[0]);
 else result=rt.run(method,[initData,...args]);
 archiveView.strip(rt.data);
 for(const file of Object.values(rt.data.files||{}) as any[])delete file.bytes;
 for(const file of Object.values(data.files||{}) as any[])delete file.bytes;
 if(scope){
  if(rt.uploads.length||JSON.stringify(rt.data)!==JSON.stringify(data))throw new ReadScopeMiss('side-effect');
  return result;
 }
 if(JSON.stringify(rt.data)!==JSON.stringify(data)){
  await commitWithUploads({uploads:rt.uploads,
   upload:(file:any)=>svc.storage.from('viral-files').upload(file.id,file.bytes,{contentType:file.type,upsert:false}),
   remove:async(ids:string[])=>{const {error}=await svc.storage.from('viral-files').remove(ids);if(error)throw error;},
   commit:()=>svc.rpc('viral_commit',{expected_version:version,new_data:rt.data,events:makeEvents(rt.data)})
  });
  readSharedViralState.invalidate();
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
