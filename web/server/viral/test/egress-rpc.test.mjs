import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import ts from 'typescript';
import {initializeData,createRuntime} from '../runtime.mjs';
import {scopeConfig,ReadScopeMiss} from '../state-scopes.mjs';
import {ViralVersionConflict} from '../approval-retry.mjs';
const sourceURL=new URL('../../../src/lib/viral.ts',import.meta.url);
const compiled=ts.transpileModule(fs.readFileSync(sourceURL,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
const actualRequire=createRequire(sourceURL);
function fixture(){
 const data=initializeData(),a=data.books.main.Employees;
 for(const [id,role,job] of [['1003','director','BGĐ'],['1001','leader','Content'],['1002','employee','Editor'],['1004','employee','VJ']])a.push(a[0].map(k=>({telegram_id:id,name:'Test '+id,role,department:job,job_title:job,active:'true'}[k]||'')));
 for(const [k,v] of [['office_lat','16.0544'],['office_lng','108.2022'],['radius_m','100']]){const r=data.books.main.Settings.find(r=>r[0]===k);if(r)r[1]=v;else data.books.main.Settings.push([k,v]);}
 return data;
}
function harness({dependencyMiss=false,sideEffect=false,readFault=null,bookingBook=null,outboxFault=null,uncertainCommit=false}={}){
 let state=fixture(),version=1,interfere=null;const queries=[],commits=[],bookingReads=[],outboxReads=[];
 class Query{
  constructor(table){this.table=table;this.columns='';}
  select(columns){this.columns=columns;return this;}eq(){return this;}in(){return this;}abortSignal(){return this;}
  single(){
   queries.push(this.columns);
   if(this.table!=='viral_state')throw Error('Unexpected table');
   const fault=readFault?.(this.columns,queries);if(fault)return Promise.resolve({data:null,error:typeof fault==='string'?{code:fault}:fault});
   if(this.columns==='version')return Promise.resolve({data:{version},error:null});
   if(this.columns==='data,version')return Promise.resolve({data:{version,data:structuredClone(state)},error:null});
   const row={version};for(const field of this.columns.split(',')){
    if(field==='version')continue;
    const [alias,path]=field.split(':');let value={data:state};for(const key of path.split('->'))value=value?.[key];row[alias]=value??null;
   }
   return Promise.resolve({data:structuredClone(row),error:null});
  }
  then(resolve,reject){if(this.table==='viral_outbox')outboxReads.push(this.columns);return Promise.resolve({data:[],error:this.table==='viral_outbox'?outboxFault:null}).then(resolve,reject);}
 }
 const svc={from:table=>new Query(table),rpc:async(name,args)=>{
  assert.equal(name,'viral_commit');commits.push(args);
  if(interfere){const operation=interfere;interfere=null;state=operation(state);version++;}
  if(args.expected_version!==version)return {data:false,error:null};
  state=structuredClone(args.new_data);version++;return uncertainCommit?{data:null,error:{message:'response lost'}}:{data:true,error:null};
 }};
 const exports={},sandbox={exports,process:{env:{NEXT_PUBLIC_SUPABASE_URL:'https://test.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'test'}},Buffer,AbortSignal,setTimeout,console:{warn(){},error(){}},require:id=>{
  if(id==='server-only')return {};
  if(id.endsWith('/google-booking.mjs'))return {readBookingBook:async options=>{bookingReads.push(options);if(!bookingBook)throw Error('Unexpected Google read');return structuredClone(bookingBook);}};
  if(id==='@supabase/supabase-js')return {createClient:()=>svc};
  if(id==='@/lib/supabase/server')return {createClient:async()=>({auth:{getUser:async()=>({data:{user:null}})}})};
  if(id.endsWith('/runtime.mjs'))return {createRuntime:(data,user,env)=>{
   const rt=createRuntime(data,user,env),run=rt.run;
   rt.run=(method,args,internal)=>{
    if(dependencyMiss&&env?.READ_TABLES)throw new ReadScopeMiss('future-table');
    const result=run(method,args,internal);
    if(sideEffect)rt.data.futureInitialization='done';
    return result;
   };return rt;
  }};
  return actualRequire(id);
 }};
 vm.runInNewContext(compiled,sandbox,{filename:sourceURL.pathname,timeout:10000});
 return {api:exports,queries,commits,bookingReads,outboxReads,getState:()=>structuredClone(state),getVersion:()=>version,externalWrite:operation=>{state=operation(state);version++;},duringCommit:operation=>interfere=operation};
}
test('actual RPC reuses unchanged scoped data, reauthenticates each user and sees remote writes',async()=>{
 const h=harness(),run=id=>h.api.invokeViral('attendanceStatus',[],'supabase',{employeeId:id});
 await run('1002');await run('1004');await run('1002');
 assert.equal(h.queries.filter(x=>x==='version').length,3);
 assert.equal(h.queries.filter(x=>x.includes('s0:')).length,1);assert.equal(h.commits.length,0);
 h.externalWrite(data=>{const a=data.books.main.Employees,col=a[0].indexOf('active');a.find(r=>r[0]==='1002')[col]='false';return data;});
 await assert.rejects(run('1002'),/kích hoạt/);assert.equal(h.queries.filter(x=>x.includes('s0:')).length,2);
});
test('actual check-in ignores read cache, reloads on CAS conflict and preserves other staff/task changes',async()=>{
 const h=harness();await h.api.invokeViral('attendanceStatus',[],'supabase',{employeeId:'1004'});
 h.duringCommit(data=>{const other=createRuntime(data,{employeeId:'1002'});other.run('attendance',['supabase','in',16.0544,108.2022,10]);other.data.books.main.Tasks.push(['remote-task']);return other.data;});
 const result=await h.api.invokeViral('attendance',['in',16.0544,108.2022,10],'supabase',{employeeId:'1004'});
 assert.equal(result.ok,true);assert.equal(h.queries.filter(x=>x==='data,version').length,2);assert.equal(h.commits.length,2);
 assert.deepEqual(new Set(h.getState().books.main.Attendance.slice(1).map(r=>r[1])),new Set(['1002','1004']));
 assert.equal(h.getState().books.main.Tasks.at(-1)[0],'remote-task');
 // A read after the commit rechecks the version and reflects the saved check-in.
 const current=await h.api.invokeViral('attendanceStatus',[],'supabase',{employeeId:'1004'});assert.equal(current.attendance.telegram_id,'1004');
});
test('actual task creation reports a version conflict without overwriting another task',async()=>{
 const h=harness();await h.api.invokeViral('productionScreen',[{}],'supabase',{employeeId:'1001'});
 h.duringCommit(data=>{data.books.main.Tasks.push(['remote-task']);return data;});
 await assert.rejects(h.api.invokeViral('createProductionItem',[{project:'VN - Viral',title:'Idea mới',brief:'Brief',vj_id:'1004',editor_id:'1002',approver_id:'1001',request_id:'cache-write-123456'}],'supabase',{employeeId:'1001'}),ViralVersionConflict);
 assert.equal(h.commits.length,1);assert.equal(h.getState().books.main.Tasks.at(-1)[0],'remote-task');assert.equal(h.getState().books.main.ProductionItems.length,1);
});
test('a future read dependency retries with a fresh full snapshot, not a partial commit',async()=>{
 const h=harness({dependencyMiss:true});const result=await h.api.invokeViral('productionScreen',[{}],'supabase',{employeeId:'1001'});
 assert.equal(result.ok,true);assert.equal(h.queries.filter(x=>x==='data,version').length,1);assert.equal(h.commits.length,0);
});
test('a read with an initialization side effect reruns from full state and cannot delete omitted tables',async()=>{
 const h=harness({sideEffect:true}),before=h.getState();const result=await h.api.invokeViral('attendanceStatus',[],'supabase',{employeeId:'1004'});
 assert.equal(result.attendance,null);assert.equal(h.commits.length,1);assert.equal(h.getState().futureInitialization,'done');
 assert.deepEqual(h.getState().books,before.books);assert.ok(h.queries.includes('data,version'));
});

test('scoped attendance cancellation falls back to fresh full read, caches only projection and does not commit',async()=>{
 const h=harness({readFault:columns=>columns.includes('s0:')?'57014':null});
 const result=await h.api.invokeViral('snapshotAttendance',[],'supabase',{employeeId:'1004'});
 assert.equal(result.user.id,'1004');assert.equal(h.queries.filter(x=>x==='data,version').length,1);
 await h.api.invokeViral('snapshotAttendance',[],'supabase',{employeeId:'1002'});
 assert.equal(h.queries.filter(x=>x==='data,version').length,1);assert.equal(h.commits.length,0);
});
test('projection permission failure does not fall back to a different read path',async()=>{
 const h=harness({readFault:columns=>columns.includes('s0:')?'42501':null});
 await assert.rejects(h.api.invokeViral('snapshotAttendance',[],'supabase',{employeeId:'1004'}),e=>e.code==='42501');
 assert.ok(!h.queries.includes('data,version'));assert.equal(h.commits.length,0);
});
test('check-in retries cancelled SELECT once before executing exactly one commit',async()=>{
 let faults=0;const h=harness({readFault:columns=>columns==='data,version'&&faults++===0?'57014':null});
 const result=await h.api.invokeViral('attendance',['in',16.0544,108.2022,10],'supabase',{employeeId:'1004'});
 assert.equal(result.ok,true);assert.equal(h.queries.filter(x=>x==='data,version').length,2);assert.equal(h.commits.length,1);
});
test('persistent read cancellations stop without attempting a check-in commit',async()=>{
 const h=harness({readFault:columns=>columns==='data,version'?'57014':null});
 await assert.rejects(h.api.invokeViral('attendance',['in',16.0544,108.2022,10],'supabase',{employeeId:'1004'}),e=>e.code==='57014');
 assert.equal(h.queries.length,2);assert.equal(h.commits.length,0);
});

test('office field check-in/out is idempotent and status reads match committed attendance',async()=>{
 const h=harness();h.externalWrite(data=>{const a=data.books.main.Settings,r=a.find(r=>r[0]==='field_attendance_enabled');if(r)r[1]='true';else a.push(['field_attendance_enabled','true']);return data;});
 const point={mode:'office',lat:16.0544,lng:108.2022,accuracy:10},user={employeeId:'1004'};
 const first=await h.api.invokeViral('fieldAttendance',['in',point],'supabase',user);
 assert.equal(first.ok,true);assert.equal(first.attendance.in_context.status,'approved');
 const repeated=await h.api.invokeViral('fieldAttendance',['in',point],'supabase',user);assert.equal(repeated.already,true);
 assert.equal(h.getState().books.main.Attendance.length,2);
 const out=await h.api.invokeViral('fieldAttendance',['out',point],'supabase',user);assert.equal(out.ok,true);assert.ok(out.attendance.check_out);
 const again=await h.api.invokeViral('fieldAttendance',['out',point],'supabase',user);assert.equal(again.already,true);
 const status=await h.api.invokeViral('snapshotAttendance',[],'supabase',user);assert.equal(status.attendance.check_in,first.attendance.check_in);assert.equal(status.attendance.check_out,out.attendance.check_out);
 assert.equal(h.commits.length,2,'repeated clicks must not create additional commits');
});

test('booking authorizes active Director before any Google read; employee and Leader cannot call API directly',async()=>{
 const bookingBook={cells:[['Ngày','Mã Đơn Hàng','Tên Nhãn Hàng','Talent Booking','Doanh Thu Hợp Đồng (VNĐ)','Chi Phí Talent/Quay (VNĐ)'],['2026-10-29','BK1','Khách','Dự án',500000,100000]],readAt:'2026-10-28T01:00:00Z'},h=harness({bookingBook});
 for(const employeeId of ['1001','1002','1004','not-active'])await assert.rejects(h.api.invokeViral('bookingReport',[{mode:'all'}],'supabase',{employeeId}));
 assert.equal(h.bookingReads.length,0);
 const report=await h.api.invokeViral('bookingReport',[{mode:'all',refresh:true}],'supabase',{employeeId:'1003'});assert.equal(report.total.revenue,500000);assert.equal(h.bookingReads.length,1);assert.equal(h.bookingReads[0].refresh,true);assert.equal(h.commits.length,0);assert.ok(!h.queries.includes('data,version'));
 h.externalWrite(data=>{const a=data.books.main.Employees;a.find(r=>String(r[0])==='1003')[a[0].indexOf('active')]='false';return data;});
 await assert.rejects(h.api.invokeViral('bookingReport',[{mode:'all'}],'supabase',{employeeId:'1003'}));assert.equal(h.bookingReads.length,1);
});

function pendingNotification(data){const a=data.books.main.Notifications;a.push(a[0].map(k=>({id:'pending-test',telegram_id:'1001',status:'pending',message:'Pending notification'}[k]||'')));return data;}
function fieldReady(data){const a=data.books.main.Settings,r=a.find(r=>r[0]==='field_attendance_enabled');if(r)r[1]='true';else a.push(['field_attendance_enabled','true']);return data;}
test('checkout retries a transient full-state fetch once and persists exactly one checkout',async()=>{
 let fail=false,failures=0;const h=harness({readFault:columns=>fail&&columns==='data,version'&&failures++===0?{code:'',message:'TypeError: fetch failed',details:'private endpoint'}:null});
 h.externalWrite(fieldReady);const point={mode:'office',lat:16.0544,lng:108.2022,accuracy:10},user={employeeId:'1004'};
 const first=await h.api.invokeViral('fieldAttendance',['in',point],'supabase',user);fail=true;
 const result=await h.api.invokeViral('fieldAttendance',['out',point],'supabase',user);assert.ok(result.attendance.check_out);assert.equal(result.attendance.check_in,first.attendance.check_in);assert.equal(h.commits.length,2);
 const repeated=await h.api.invokeViral('fieldAttendance',['out',point],'supabase',user);assert.equal(repeated.already,true);assert.equal(h.commits.length,2);
});
test('attendance does not depend on outbox reconciliation, retains pending events and uses complete fresh state',async()=>{
 const h=harness({outboxFault:{code:'',message:'TypeError: fetch failed'}});h.externalWrite(data=>pendingNotification(fieldReady(data)));
 const point={mode:'office',lat:16.0544,lng:108.2022,accuracy:10},user={employeeId:'1004'};
 await h.api.invokeViral('fieldAttendance',['in',point],'supabase',user);const result=await h.api.invokeViral('fieldAttendance',['out',point],'supabase',user);
 assert.ok(result.attendance.check_out);assert.equal(h.outboxReads.length,0);assert.equal(h.getState().books.main.Notifications.length,2);
 assert.ok(h.commits.at(-1).events.some(x=>x.id==='notification:pending-test'));assert.equal(h.queries.filter(x=>x==='data,version').length,2);
 await assert.rejects(h.api.loadViral(),e=>e.code==='STATE_NETWORK'&&e.stage==='notifications');assert.equal(h.outboxReads.length,1,'other callers keep reconciliation');
});
test('lost commit response is never replayed automatically and status read can confirm the saved checkout',async()=>{
 const h=harness({uncertainCommit:true});h.externalWrite(fieldReady);const point={mode:'office',lat:16.0544,lng:108.2022,accuracy:10},user={employeeId:'1004'};
 await assert.rejects(h.api.invokeViral('fieldAttendance',['in',point],'supabase',user),/Chưa xác nhận/);
 assert.ok((await h.api.invokeViral('attendanceStatus',[],'supabase',user)).attendance.check_in);assert.equal(h.commits.length,1);
 await assert.rejects(h.api.invokeViral('fieldAttendance',['out',point],'supabase',user),/Chưa xác nhận/);
 const status=await h.api.invokeViral('attendanceStatus',[],'supabase',user);assert.ok(status.attendance.check_out);assert.equal(h.commits.length,2);
 const repeated=await h.api.invokeViral('fieldAttendance',['out',point],'supabase',user);assert.equal(repeated.already,true);assert.equal(h.commits.length,2);
});

test('attendance status retries a scoped network read and its cancellation fallback does not depend on outbox',async()=>{
 let faults=0;const h=harness({readFault:columns=>columns.includes('s0:')&&faults++===0?{message:'TypeError: fetch failed'}:null});
 await h.api.invokeViral('attendanceStatus',[],'supabase',{employeeId:'1004'});assert.equal(h.queries.filter(x=>x.includes('s0:')).length,2);assert.ok(!h.queries.includes('data,version'));
 const fallback=harness({readFault:columns=>columns.includes('s0:')?'57014':null,outboxFault:{code:'42501'}});fallback.externalWrite(pendingNotification);
 const result=await fallback.api.invokeViral('attendanceStatus',[],'supabase',{employeeId:'1004'});assert.equal(result.attendance,null);assert.equal(fallback.outboxReads.length,0);assert.equal(fallback.commits.length,0);
});
