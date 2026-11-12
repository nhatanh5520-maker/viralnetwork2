import {test} from 'node:test';import assert from 'node:assert/strict';
import {initializeData,createRuntime} from '../runtime.mjs';
import {versionedStateCache} from '../state-cache.mjs';
import {statePatch,drainOutbox,commitState,resetPatchSupport} from '../state-commit.mjs';
import {attendanceChange,applyAttendance,resetAttendanceFastPath} from '../attendance-fast.mjs';

function fixture(n=4){
 const d=initializeData(),h=d.books.main.Employees[0];
 for(let i=0;i<n;i++)d.books.main.Employees.push(h.map(k=>({telegram_id:String(2001+i),name:'NV '+i,department:'Content',job_title:'VJ',role:'employee',active:'true'}[k]||'')));
 for(const r of d.books.main.Settings){if(r[0]==='office_lat')r[1]='16.0544';if(r[0]==='office_lng')r[1]='108.2022';}
 return JSON.parse(JSON.stringify(d));
}
// JS mirror of supabase/viral-performance.sql viral_attendance_apply.
function sqlAttendanceApply(db,{p_kind,p_employee,p_date,p_new_row,p_expected_row}){
 if(!['in','out'].includes(p_kind)||!Array.isArray(p_new_row)||p_new_row[1]!==p_employee||String(p_new_row[2]??'').slice(0,10)!==p_date)return {error:{code:'P0001'}};
 const att=db.data.books.main.Attendance;let idx=null;
 for(let i=1;i<att.length;i++)if(Array.isArray(att[i])&&String(att[i][1])===p_employee&&String(att[i][2]??'').slice(0,10)===p_date){idx=i;break;}
 if(p_kind==='in'){if(idx!==null)return {data:{status:'already'}};att.push(JSON.parse(JSON.stringify(p_new_row)));}
 else{if(idx===null)return {data:{status:'missing'}};if(JSON.stringify(att[idx])!==JSON.stringify(p_expected_row))return {data:{status:'conflict'}};if(att[idx][4])return {data:{status:'already'}};att[idx]=JSON.parse(JSON.stringify(p_new_row));}
 db.version++;return {data:{status:'ok',version:db.version}};
}
// JS mirror of viral_commit_patch.
function sqlCommitPatch(db,{expected_version,patch}){
 if(db.version!==expected_version)return {data:false};
 const next=JSON.parse(JSON.stringify(db.data));
 for(const {path,value} of patch){let o=next;for(const k of path.slice(0,-1)){if(!o||typeof o!=='object'||!(k in o))return {error:{code:'P0001'}};o=o[k];}o[path.at(-1)]=JSON.parse(JSON.stringify(value));}
 db.data=next;db.version++;return {data:true};
}

test('cache reuses the snapshot while version is unchanged and re-reads after a write',async()=>{
 let version=5,full=0,versions=0;const db={data:{books:{main:{A:[[1]]}}}};
 const load=versionedStateCache({readVersion:async()=>{versions++;return version;},readFull:async()=>{full++;return {data:structuredClone(db.data),version};}});
 const results=await Promise.all(Array.from({length:30},()=>load()));
 assert.equal(full,1,'30 concurrent requests share one full read');assert.equal(versions,30);
 results[0].data.books.main.A.push([2]);assert.equal(results[1].data.books.main.A.length,1,'each caller gets its own copy');
 await load();assert.equal(full,1);
 version=6;db.data.books.main.A.push([9]);const after=await load();assert.equal(full,2);assert.equal(after.version,6);assert.equal(after.data.books.main.A.length,2);
});
test('cache never serves an older in-flight read as the current version',async()=>{
 let version=1,calls=0,release;const gate=new Promise(r=>release=r);
 const load=versionedStateCache({readVersion:async()=>version,readFull:async()=>{calls++;if(calls===1){await gate;return {data:{v:1},version:1};}return {data:{v:2},version:2};}});
 const first=load();await new Promise(r=>setTimeout(r,5));version=2;const second=load();release();
 assert.equal((await first).version,1);assert.equal((await second).version,2);assert.deepEqual((await second).data,{v:2});
});
test('remember() only moves the cache forward',async()=>{
 let version=3;const load=versionedStateCache({readVersion:async()=>version,readFull:async()=>({data:{x:'db'},version})});
 await load();load.remember(4,{x:'mine'});version=4;assert.deepEqual((await load()).data,{x:'mine'});
 load.remember(2,{x:'old'});assert.deepEqual((await load()).data,{x:'mine'});
});
test('notification reconciliation is cached briefly and never leaks into base',async()=>{
 let t=0,rec=0;const load=versionedStateCache({now:()=>t,readVersion:async()=>1,readFull:async()=>({data:{n:'pending'},version:1}),reconcile:async d=>{rec++;d.n='sent';return d;}});
 const a=await load();assert.equal(a.data.n,'sent');assert.equal(a.base.n,'pending');await load();assert.equal(rec,1);t=25000;await load();assert.equal(rec,2);
});

test('patch contains only changed tabs; deletions force a full commit',()=>{
 const base={books:{main:{A:[[1]],B:[[2]]},priv:{C:[]}},properties:{x:'1'},files:{},outbox:[]};
 const next=structuredClone(base);next.books.main.B.push([3]);next.properties.y='2';next.books.extra={D:[]};
 assert.deepEqual(statePatch(base,next).map(o=>o.path.join('.')).sort(),['books.extra','books.main.B','properties']);
 assert.deepEqual(statePatch(base,structuredClone(base)),[]);
 const del=structuredClone(base);delete del.books.main.A;assert.equal(statePatch(base,del),null);
});
test('outbox is drained into events and cleared from the blob',()=>{
 const d={outbox:[{id:'a',chatId:'1',text:'x',status:'pending'},{id:'b',chatId:'2',text:'y',status:'pending'}]};
 assert.deepEqual(drainOutbox(d).map(e=>e.id),['a','b']);assert.deepEqual(d.outbox,[]);
});
test('commitState uses the patch function and falls back to full commit safely',async()=>{
 resetPatchSupport();const calls=[];const base={books:{main:{A:[1]}}},next={books:{main:{A:[1,2]}}};
 let r=await commitState({rpc:async(n,p)=>{calls.push(n);return {data:true};},base,next,version:1});assert.equal(r.data,true);assert.deepEqual(calls,['viral_commit_patch']);
 calls.length=0;r=await commitState({rpc:async n=>{calls.push(n);return n==='viral_commit_patch'?{error:{code:'P0001'}}:{data:true};},base,next,version:1});assert.deepEqual(calls,['viral_commit_patch','viral_commit']);
 calls.length=0;r=await commitState({rpc:async n=>{calls.push(n);return n==='viral_commit_patch'?{error:{code:'PGRST202'}}:{data:true};},base,next,version:1});
 await commitState({rpc:async n=>{calls.push(n);return {data:true};},base,next,version:1});assert.deepEqual(calls,['viral_commit_patch','viral_commit','viral_commit'],'missing SQL function is remembered');
 resetPatchSupport();calls.length=0;r=await commitState({rpc:async n=>{calls.push(n);return {error:{code:'',message:'fetch failed'}};},base,next,version:1});assert.ok(r.error);assert.deepEqual(calls,['viral_commit_patch'],'uncertain network errors are not retried as a full write');
 resetPatchSupport();
});
test('patch commit reproduces exactly the full new state',()=>{
 const d=fixture();const rt=createRuntime(d,{employeeId:'2001'});rt.run('publishAnnouncement',['supabase','Tin','Nội dung','all','']);
 const next=JSON.parse(JSON.stringify(rt.data));const db={data:structuredClone(d),version:7};
 assert.equal(sqlCommitPatch(db,{expected_version:7,patch:statePatch(d,next)}).data,true);assert.deepEqual(db.data,next);assert.equal(db.version,8);
 assert.equal(sqlCommitPatch(db,{expected_version:7,patch:[]}).data,false);
});

test('real check-in/out produce a single-row change that the SQL mirror applies identically',()=>{
 const d=fixture();const rtIn=createRuntime(d,{employeeId:'2001'});rtIn.run('attendance',['supabase','in',16.0544,108.2022,10]);
 const cin=attendanceChange(d,rtIn.data,{kind:'in',employeeId:'2001'});assert.ok(cin);assert.equal(cin.expectedRow,null);
 const db={data:structuredClone(d),version:1};assert.equal(sqlAttendanceApply(db,{p_kind:'in',p_employee:cin.employeeId,p_date:cin.workDate,p_new_row:cin.newRow}).data.status,'ok');
 assert.deepEqual(db.data.books.main.Attendance,JSON.parse(JSON.stringify(rtIn.data.books.main.Attendance)));
 const after=structuredClone(db.data);const rtOut=createRuntime(after,{employeeId:'2001'});rtOut.run('attendance',['supabase','out',16.0544,108.2022,10]);
 const cout=attendanceChange(after,rtOut.data,{kind:'out',employeeId:'2001'});assert.ok(cout);assert.ok(cout.expectedRow);
 assert.equal(sqlAttendanceApply(db,{p_kind:'out',p_employee:cout.employeeId,p_date:cout.workDate,p_new_row:cout.newRow,p_expected_row:cout.expectedRow}).data.status,'ok');
 assert.deepEqual(db.data.books.main.Attendance,JSON.parse(JSON.stringify(rtOut.data.books.main.Attendance)));
 assert.equal(sqlAttendanceApply(db,{p_kind:'out',p_employee:cout.employeeId,p_date:cout.workDate,p_new_row:cout.newRow,p_expected_row:cout.expectedRow}).data.status,'conflict','a repeated out is sent back to the original path');
});
test('40 people checking in from the same stale snapshot all succeed without conflicts or duplicates',()=>{
 const n=40,d=fixture(n),db={data:structuredClone(d),version:1};
 for(let i=0;i<n;i++){const id=String(2001+i),rt=createRuntime(d,{employeeId:id});rt.run('attendance',['supabase','in',16.0544,108.2022,10]);
  const c=attendanceChange(d,rt.data,{kind:'in',employeeId:id});assert.ok(c);assert.equal(sqlAttendanceApply(db,{p_kind:'in',p_employee:id,p_date:c.workDate,p_new_row:c.newRow}).data.status,'ok');}
 assert.equal(db.data.books.main.Attendance.length,n+1);assert.equal(db.version,n+1);
 const id='2001',rt=createRuntime(d,{employeeId:id});rt.run('attendance',['supabase','in',16.0544,108.2022,10]);const c=attendanceChange(d,rt.data,{kind:'in',employeeId:id});
 assert.equal(sqlAttendanceApply(db,{p_kind:'in',p_employee:id,p_date:c.workDate,p_new_row:c.newRow}).data.status,'already','a double tap never adds a second row');
});
test('changes other than one attendance row never use the fast path',()=>{
 const d=fixture();const rt=createRuntime(d,{employeeId:'2001'});rt.run('publishAnnouncement',['supabase','Tin','Nội dung','all','']);
 assert.equal(attendanceChange(d,rt.data,{kind:'in',employeeId:'2001'}),null);
 const rt2=createRuntime(d,{employeeId:'2001'});rt2.run('attendance',['supabase','in',16.0544,108.2022,10]);assert.equal(attendanceChange(d,rt2.data,{kind:'in',employeeId:'2002'}),null,'row must belong to the signed-in employee');
});
test('fast path reports uncertain outcomes and remembers a missing SQL function',async()=>{
 resetAttendanceFastPath();const change={kind:'in',employeeId:'1',workDate:'2026-11-12',newRow:['x','1','2026-11-12'],expectedRow:null};
 assert.deepEqual(await applyAttendance(async()=>({data:{status:'ok',version:9}}),change),{applied:true,version:9});
 assert.equal((await applyAttendance(async()=>({data:{status:'already'}}),change)).applied,false);
 await assert.rejects(applyAttendance(async()=>({error:{code:'',message:'timeout'}}),change),e=>e.uncertain);
 await assert.rejects(applyAttendance(async()=>{throw Error('net');},change),e=>e.uncertain);
 let calls=0;await applyAttendance(async()=>{calls++;return {error:{code:'PGRST202'}};},change);await applyAttendance(async()=>{calls++;return {data:{status:'ok'}};},change);assert.equal(calls,1);
 resetAttendanceFastPath();
});
test('fast rows_ returns exactly what the business.gs rows_ returns for every tab',async()=>{
 const fs=await import('node:fs'),vm=await import('node:vm');
 const src=fs.readFileSync(new URL('../business.gs',import.meta.url),'utf8'),original=/function rows_\(n\)\{[\s\S]*?return visible;\}/.exec(src)[0].replace('function rows_','function __originalRows');
 const d=fixture(6);const rt=createRuntime(d,{employeeId:'2001'});rt.run('attendance',['supabase','in',16.0544,108.2022,10]);
 rt.data.books.main.Attendance.push(['x','2002',new Date('2026-11-01T03:00:00Z'),new Date('2026-11-01T01:00:00Z'),'',1,2,'','',0,0]);rt.data.books.main.Attendance.push(['','','','','']);
 vm.runInContext(original,rt.context);
 for(const name of Object.keys(rt.data.books.main)){vm.runInContext(`__a=rows_(${JSON.stringify(name)});__b=__originalRows(${JSON.stringify(name)});`,rt.context);
  assert.deepEqual(rt.context.__a,rt.context.__b,name);assert.equal(JSON.stringify(rt.context.__a),JSON.stringify(rt.context.__b),name+' key order');}
});
test('fast path still applies when stored data has no outbox key yet',()=>{
 const d=fixture();delete d.outbox;const rt=createRuntime(d,{employeeId:'2001'});rt.run('attendance',['supabase','in',16.0544,108.2022,10]);assert.ok(attendanceChange(d,rt.data,{kind:'in',employeeId:'2001'}));
});
