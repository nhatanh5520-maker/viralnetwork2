import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';
import {initializeData,createRuntime,diffState,sheetRowOps,stateKey} from '../runtime.mjs';
import {applyCommitPatch,commitChanges} from '../patch-commit.mjs';
const ROWS={'books/main/Attendance':['telegram_id','date'],'books/main/Notifications':['event_key']};
function fixture(){const d=initializeData(),h=d.books.main.Employees[0];for(const id of ['1001','1002','1003'])d.books.main.Employees.push(h.map(k=>({telegram_id:id,name:'Test '+id,department:'Content',role:'employee',active:'true'}[k]||'')));for(const [k,v] of [['office_lat','16.0544'],['office_lng','108.2022'],['radius_m','100']]){const r=d.books.main.Settings.find(r=>r[0]===k);if(r)r[1]=v;else d.books.main.Settings.push([k,v]);}return d;}
const checkIn=(state,id,kind='in')=>{const rt=createRuntime(state,{employeeId:id});const result=rt.run('attendance',['supabase',kind,16.0544,108.2022,10]);return {rt,result,changes:rt.changes(state,{rowMerge:ROWS})};};
const commit=(db,version,changes)=>{const saved=applyCommitPatch(db,{expected_version:version,read_keys:changes.reads,write_keys:changes.writes,patches:changes.patches,outbox_done:changes.outboxDone});if(saved){db.state=saved.state;db.version=saved.version;db.log.push({version:saved.version,keys:saved.keys});}return !!saved;};

test('a check-in reads only the sheets it needs and is saved as one appended row',()=>{
 const base=fixture(),{changes}=checkIn(base,'1001');
 assert.deepEqual(changes.writes,['books/main/Attendance#rows']);
 assert.ok(changes.reads.includes('books/main/Attendance')&&!changes.reads.includes('books/main/Attendance#rows'));
 assert.ok(!changes.reads.some(k=>k.startsWith('books/main/Production')));
 assert.equal(changes.patches.length,1);assert.equal(changes.patches[0].rows.append.length,1);
});

test('two people checking in from the same snapshot are both saved without a conflict',()=>{
 const base=fixture(),db={state:structuredClone(base),version:5,log:[]};
 const a=checkIn(base,'1001'),b=checkIn(base,'1002');
 assert.equal(commit(db,5,a.changes),true);assert.equal(commit(db,5,b.changes),true,'stale snapshot still merges');
 assert.deepEqual(new Set(db.state.books.main.Attendance.slice(1).map(r=>r[1])),new Set(['1001','1002']));
});

test('the same person checking in twice from two devices gets one row',()=>{
 const base=fixture(),db={state:structuredClone(base),version:1,log:[]};
 assert.equal(commit(db,1,checkIn(base,'1001').changes),true);
 assert.equal(commit(db,1,checkIn(base,'1001').changes),false,'duplicate is rejected, retry then sees the saved row');
 assert.equal(checkIn(db.state,'1001').result.already,true);assert.equal(db.state.books.main.Attendance.length,2);
});

test('check-out updates only its own row and conflicts if that row changed meanwhile',()=>{
 const base=fixture(),db={state:structuredClone(base),version:1,log:[]};
 commit(db,1,checkIn(base,'1001').changes);const afterIn=structuredClone(db.state);
 commit(db,2,checkIn(afterIn,'1002').changes);
 const out=checkIn(afterIn,'1001','out');assert.equal(out.changes.patches[0].rows.update.length,1);
 assert.equal(commit(db,2,out.changes),true,'another person checking in does not block my check-out');
 const row=db.state.books.main.Attendance.find(r=>r[1]==='1001');assert.ok(row[4]);
 const stale=checkIn(afterIn,'1001','out');assert.equal(commit(db,2,stale.changes),false,'a second check-out on the old row is rejected');
});

test('a whole-sheet writer that read Attendance conflicts with concurrent check-ins; unrelated sheets do not',()=>{
 const base=fixture(),db={state:structuredClone(base),version:1,log:[]};
 commit(db,1,checkIn(base,'1001').changes);
 const sheetWriter={reads:['books/main/Attendance','books/main/Attendance#rows'],writes:['books/main/Attendance'],patches:[{path:['books','main','Attendance'],value:base.books.main.Attendance}],outboxDone:[]};
 assert.equal(commit(db,1,sheetWriter),false);
 const tasks={reads:['books/main/Tasks','books/main/Tasks#rows'],writes:['books/main/Tasks'],patches:[{path:['books','main','Tasks'],value:[...base.books.main.Tasks,['t1']]}],outboxDone:[]};
 assert.equal(commit(db,1,tasks),true);
});

test('row operations fall back to a whole-sheet write for deletions, header edits and missing ids',()=>{
 const sheet=[['id','telegram_id','date'],['a','1','d'],['b','2','d']];
 assert.equal(sheetRowOps(sheet,sheet.slice(0,2)),null);
 assert.equal(sheetRowOps(sheet,[['id','x','date'],...sheet.slice(1)]),null);
 assert.equal(sheetRowOps(sheet,[...sheet,['','3','d']]),null);
 assert.equal(sheetRowOps(sheet,[...sheet],['missing']),null);
 assert.deepEqual(sheetRowOps(sheet,[...sheet,['c','3','d']],['telegram_id','date']),{update:[],append:[['c','3','d']],unique:[1,2]});
 assert.equal(stateKey(['books','a/b','S']),'books/a%2Fb/S');
});

test('outbox entries are delivered as events and leave the saved state',()=>{
 const base={books:{main:{}},outbox:[{id:'o1',chatId:'1',text:'hi',status:'pending'}]},c=diffState(base,structuredClone(base),[]);
 assert.deepEqual(c.outboxDone,['o1']);
 const db={state:base,version:1,log:[]};commit(db,1,c);assert.deepEqual(db.state.outbox,[]);
});

test('commitChanges reports conflicts and falls back to the legacy full commit',async()=>{
 const changes={reads:['k'],writes:['k'],patches:[],outboxDone:[]};
 assert.deepEqual(await commitChanges({rpc:async()=>({data:7}),version:6,changes,events:[],fullData:()=>({})}),{data:true,version:7});
 assert.deepEqual(await commitChanges({rpc:async()=>({data:'0'}),version:6,changes,events:[],fullData:()=>({})}),{data:false,version:0});
 const calls=[];const legacy=await commitChanges({rpc:async(name)=>{calls.push(name);return name==='viral_commit_patch'?{error:{code:'PGRST202',message:'Could not find the function'}}:{data:true};},version:6,changes,events:[],fullData:()=>({})});
 assert.deepEqual(calls,['viral_commit_patch','viral_commit']);assert.equal(legacy.data,true);assert.equal(legacy.version,7);
 assert.ok((await commitChanges({rpc:async()=>({error:{code:'57014',message:'timeout'}}),version:6,changes,events:[],fullData:()=>({})})).error);
});

test('the optimized rows_ returns exactly what business.gs rows_ returns',()=>{
 const d=fixture();d.books.main.Attendance.push(['x','1001','2026-01-01','t'],['','',''],['y','1002','2026-01-02']);
 for(const n of Object.keys(d.books.main)){
  const fast=vm.runInContext(`rows_(${JSON.stringify(n)})`,createRuntime(d,null).context),slow=vm.runInContext(`businessRows(${JSON.stringify(n)})`,createRuntime(d,null).context);
  assert.deepStrictEqual(fast,slow,n);
 }
});
