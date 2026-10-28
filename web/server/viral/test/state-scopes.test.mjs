import test from 'node:test';
import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
import {initializeData,createRuntime} from '../runtime.mjs';
import {READ_SCOPES,scopeForMethod,scopeConfig,scopeSelect,scopedState,projectState,ReadScopeMiss} from '../state-scopes.mjs';
function fixture(){
 let data=initializeData();const table=data.books.main.Employees;
 for(const [id,name,role,department] of [['1001','Leader Content','leader','Content'],['1002','Editor','employee','Media'],['1003','Giám đốc','director','BGĐ'],['1004','VJ','employee','Content'],['1005','Nhân sự','employee','HR'],['1006','Kế toán','employee','Kế toán']])table.push(table[0].map(k=>({telegram_id:id,name,role,department,active:'true',job_title:id==='1004'?'VJ':id==='1002'?'Editor':department}[k]||'')));
 for(const [k,v] of [['hr_telegram_id','1005'],['accountant_telegram_id','1006'],['field_attendance_enabled','true']]){const row=data.books.main.Settings.find(r=>r[0]===k);if(row)row[1]=v;else data.books.main.Settings.push([k,v]);}
 let rt=createRuntime(data,{employeeId:'1001'});
 rt.run('createV20Project',['supabase','VN','Viral']);
 rt.run('createProductionItem',['supabase',{project:'VN - Viral',title:'Video kiểm thử',brief:'Brief',vj_id:'1004',editor_id:'1002',cam_id:'',approver_id:'1001',vj_ids:['1004'],editor_ids:['1002'],content_approver_ids:['1001'],media_approver_ids:['1001'],request_id:'scope-video-123456'}]);data=rt.data;
 const add=(name,values)=>{const a=data.books.main[name];a.push(a[0].map(k=>values[k]??''));};
 const day=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Ho_Chi_Minh'}),at=day+'T01:00:00Z';
 add('Attendance',{id:'attendance-1',telegram_id:'1004',date:day,check_in:at,late_minutes:0,work_minutes:0,in_context:JSON.stringify({status:'pending',mode:'shoot',department:'Content',revision:1,history:[]})});
 add('AttendanceApprovers',{department:'Content',approver_ids:'1001'});
 add('Schedule',{id:'schedule-1',telegram_id:'1004',date:day,start_time:'08:00',end_time:'17:00'});
 add('Leave',{id:'leave-1',telegram_id:'1004',start_date:day,end_date:day,reason:'Việc riêng',status:'pending'});
 add('Expenses',{id:'expense-1',telegram_id:'1004',project:'VN - Viral',description:'Chi phí quay',amount_vnd:50000,status:'pending',created_at:at,production_id:'scope-video-123456'});
 add('EquipmentLoans',{id:'loan-1',telegram_id:'1004',device:'Camera',status:'pending',project:'VN - Viral',borrow_at:at});
 add('Announcements',{id:'post-1',title:'Tin thử',body:'Nội dung',audience:'all',created_at:at,created_by:'1004'});
 add('PostComments',{id:'comment-1',post_id:'post-1',telegram_id:'1002',body:'Phản hồi',created_at:at});
 add('PostLikes',{id:'like-1',post_id:'post-1',telegram_id:'1004'});
 data.books.main.UserAvatars=[['telegram_id','file_id','mode','updated_at'],['1004','avatar-test','custom',at]];
 data.files['avatar-test']={path:'avatar-test',folder:'person-avatars',name:'a.png',type:'image/png'};
 data.adminAudit=[{private:'not-needed-by-these-reads'}];
 return data;
}
const calls=[['fieldAttendanceOptions',[]],['fieldAttendanceOptions',['VN - Viral']],['snapshotAttendance',[]],['attendanceStatus',[]],['managerAttendanceDay',[new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Ho_Chi_Minh'})]],['fieldReviewData',[]],['fieldAttendanceReport',[new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Ho_Chi_Minh'}).slice(0,7)]],['fieldConfig',[]],['productionPage',[{}]],['productionPage',[{q:'Video',dateType:'all'}]],['productionScreen',[{}]],['staffProductionWorkload',[]],['snapshotHome',[]],['snapshotCore',[]],['snapshotManager',[]],['reviewQueue',['team']],['reviewQueue',['personal']],['accountingExpenses',[]],['personnelDirectory',[]]];
for(const [method,args] of calls)test(`${method} scoped results and permissions match full state for all roles (${JSON.stringify(args)})`,()=>{
 const data=fixture(),scope=scopeForMethod(method);assert.ok(scope);let successes=0;
 for(const employeeId of ['1001','1002','1003','1004','1005','1006','9999']){
  const full=createRuntime(data,{employeeId}),partial=projectState(data,scope),before=JSON.stringify(partial),scoped=createRuntime(partial,{employeeId},{READ_TABLES:scopeConfig(scope).tables});
  let a,b,ae,be;try{a=JSON.stringify(full.run(method,['supabase',...args]));}catch(e){ae=e.message;}
  try{b=JSON.stringify(scoped.run(method,['supabase',...args]));}catch(e){if(e instanceof ReadScopeMiss)throw Error(`${method} missing dependency: ${e.table}`);be=e.message;}
  if(!ae)successes++;assert.equal(be,ae,employeeId+' permission mismatch');assert.equal(b,a,employeeId+' data mismatch');
  assert.equal(JSON.stringify(scoped.data),before,employeeId+' read unexpectedly changed state');
 }
 assert.ok(successes>0,method+' must exercise at least one authorized successful response');
});
test('daily attendance and production profiles do not fetch each other or bulk logs',()=>{
 const attendance=scopeSelect('attendance'),production=scopeSelect('production');
 assert.doesNotMatch(attendance,/ProductionItems|Expenses|Notifications|adminAudit/);
 assert.doesNotMatch(production,/Attendance|Expenses|Notifications|adminAudit/);
 for(const scope of ['attendance','production'])assert.doesNotMatch(scopeSelect(scope),/(^|,)data(,|$)|data->files/);
});
test('writes, approvals, upload and scheduling never get a scoped cached snapshot',()=>{
 for(const method of ['attendance','fieldAttendance','saveSchedule','assignProduction','saveProductionAsset','setEditorProgress','submitTask','decideProductionApproval','reviewFieldAttendance','savePersonnel','syncWebProjectDirectory','unknown','constructor','__proto__'])assert.equal(scopeForMethod(method),null,method);
 assert.throws(()=>scopeSelect('arbitrary-table'));
});
test('a new table dependency fails explicitly rather than returning silent partial data',()=>{
 const scope='production',rt=createRuntime(projectState(fixture(),scope),{employeeId:'1003'},{READ_TABLES:scopeConfig(scope).tables});
 assert.throws(()=>rt.run('rows_',['Attendance'],true),ReadScopeMiss);
 assert.throws(()=>rt.run('setupTeam20',[],true),ReadScopeMiss);
});
test('Supabase sends JSON paths, not the full data column, and normalization retains exact arrays',async()=>{
 const data=fixture();let select;
 const svc=createClient('https://example.supabase.co','test-service-role',{auth:{persistSession:false},global:{fetch:async url=>{
  select=new URL(url).searchParams.get('select');const scope='attendance',row={version:12,properties:data.properties,archive:null};scopeConfig(scope).tables.forEach((name,i)=>row['s'+i]=data.books.main[name]??null);
  return new Response(JSON.stringify(row),{status:200,headers:{'Content-Type':'application/json'}});
 }}});
 const {data:row,error}=await svc.from('viral_state').select(scopeSelect('attendance')).eq('id','main').single();assert.equal(error,null);
 assert.equal(select,scopeSelect('attendance'));assert.match(select,/s2:data->books->main->Attendance/);
 assert.deepEqual(scopedState(row,'attendance').data.books.main.Attendance,data.books.main.Attendance);
});
test('large unrelated history is excluded before transmission in scoped reads',()=>{
 const data=fixture();data.books.main.Notifications.push(...Array.from({length:1000},(_,i)=>[String(i),'x'.repeat(1000)]));data.adminAudit=Array(1000).fill({history:'x'.repeat(1000)});
 const full=Buffer.byteLength(JSON.stringify(data)),attendance=Buffer.byteLength(JSON.stringify(projectState(data,'attendance'))),production=Buffer.byteLength(JSON.stringify(projectState(data,'production')));
 assert.ok(attendance<full/20);assert.ok(production<full/20);
});
