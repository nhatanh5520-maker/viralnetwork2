import test from 'node:test';import assert from 'node:assert/strict';
import {initializeData,createRuntime,diffState,sheetRowOps,stateKey} from '../runtime.mjs';
import {applyPatchesImmutable,stateCache,commitChanges} from '../state-cache.mjs';
const ROWS={'books/main/Attendance':['telegram_id','date'],'books/main/Notifications':['event_key']};
function fixture(){const d=initializeData(),h=d.books.main.Employees[0];for(const id of ['1001','1002','1003'])d.books.main.Employees.push(h.map(k=>({telegram_id:id,name:'Test '+id,department:'Content',role:'employee',active:'true'}[k]||'')));for(const row of d.books.main.Settings){if(row[0]==='office_lat')row[1]='16.0544';if(row[0]==='office_lng')row[1]='108.2022';}return d;}
const checkIn=(state,id,kind='in')=>{const rt=createRuntime(state,{employeeId:id});const result=rt.run('attendance',['supabase',kind,16.0544,108.2022,10]);return {rt,result,changes:rt.changes(state,{rowMerge:ROWS})};};

test('the runtime never modifies its input and only copies the sheets it uses',()=>{
 const base=fixture(),before=JSON.stringify(base);const {rt}=checkIn(base,'1001');
 assert.equal(JSON.stringify(base),before);assert.equal(rt.data.books.main.Attendance.length,2);assert.equal(base.books.main.Attendance.length,1);
 assert.deepEqual(structuredClone(rt.data).books.main.Attendance,rt.data.books.main.Attendance);
});

test('a check-in reads only the sheets it needs and is saved as one appended row',()=>{
 const base=fixture(),{changes}=checkIn(base,'1001');
 assert.deepEqual(changes.writes,['books/main/Attendance#rows']);
 assert.ok(changes.reads.includes('books/main/Attendance')&&!changes.reads.includes('books/main/Attendance#rows'));
 assert.ok(!changes.reads.some(k=>k.startsWith('books/main/Production')));
 assert.equal(changes.patches.length,1);assert.equal(changes.patches[0].rows.append.length,1);assert.equal(changes.patches[0].rows.update.length,0);
});

test('check-out is a single row update against the row read at check-in',()=>{
 const start=fixture(),first=checkIn(start,'1001'),saved=applyPatchesImmutable(start,first.changes.patches);
 const out=checkIn(saved,'1001','out');assert.equal(out.result.ok,true);
 const [patch]=out.changes.patches;assert.equal(patch.rows.append.length,0);assert.equal(patch.rows.update.length,1);
 assert.deepEqual(patch.rows.update[0].base,saved.books.main.Attendance[1]);assert.ok(patch.rows.update[0].row[4]);
});

test('two people checking in from the same snapshot both keep their rows when merged',()=>{
 const base=fixture(),a=checkIn(base,'1001'),b=checkIn(base,'1002');
 const merged=applyPatchesImmutable(applyPatchesImmutable(base,a.changes.patches),b.changes.patches);
 assert.deepEqual(new Set(merged.books.main.Attendance.slice(1).map(r=>r[1])),new Set(['1001','1002']));
 assert.equal(base.books.main.Attendance.length,1,'snapshots are copy-on-write');
});

test('without row merge the same change is a whole-sheet write that conflicts with row writers',()=>{
 const base=fixture(),rt=createRuntime(base,{employeeId:'1001'});rt.run('attendance',['supabase','in',16.0544,108.2022,10]);const c=rt.changes(base);
 assert.deepEqual(c.writes,['books/main/Attendance']);assert.ok(c.reads.includes('books/main/Attendance#rows'));
});

test('row operations fall back to a whole-sheet write for deletions, header edits and missing ids',()=>{
 const sheet=[['id','telegram_id','date'],['a','1','d'],['b','2','d']];
 assert.equal(sheetRowOps(sheet,sheet.slice(0,2)),null);
 assert.equal(sheetRowOps(sheet,[['id','x','date'],...sheet.slice(1)]),null);
 assert.equal(sheetRowOps(sheet,[...sheet,['','3','d']]),null);
 assert.equal(sheetRowOps(sheet,[...sheet],['missing']),null);
 assert.deepEqual(sheetRowOps(sheet,[...sheet,['c','3','d']],['telegram_id','date']),{update:[],append:[['c','3','d']],unique:[1,2]});
});

test('outbox entries become events and are removed from the saved state',()=>{
 const base={books:{main:{}},outbox:[{id:'o1',chatId:'1',text:'hi',status:'pending'}]};
 const c=diffState(base,structuredClone(base),[]);
 assert.deepEqual(c.outboxDone,['o1']);assert.equal(c.outboxEvents[0].chat_id,'1');
 assert.deepEqual(applyPatchesImmutable(base,c.patches,c.outboxDone).outbox,[]);
});

test('state keys escape path separators',()=>{assert.equal(stateKey(['books','a/b','S']),'books/a%2Fb/S');});

test('the cache uses deltas, falls back to a full read, and follows its own commits',async()=>{
 let full=0,version=1,data={books:{main:{T:[['id']]}}};const deltas=[];
 const cache=stateCache({fetchFull:async()=>{full++;return {data:structuredClone(data),version};},delta:async since=>deltas.shift()??{version,patches:[]}});
 const first=await cache.read();assert.equal(full,1);assert.equal(first.version,1);
 assert.equal(await cache.read(),first);assert.equal(full,1);
 deltas.push({version:2,patches:[{path:['books','main','T'],rows:{update:[],append:[['x']]}}]});
 const second=await cache.read();assert.deepEqual(second.data.books.main.T,[['id'],['x']]);assert.deepEqual(first.data.books.main.T,[['id']]);assert.equal(full,1);
 cache.committed(2,3,[{path:['books','main','U'],value:[['id']]}],[]);assert.equal(cache.peek().version,3);
 deltas.push({version:4,full:true});version=4;assert.equal((await cache.read()).version,4);assert.equal(full,2);
 deltas.push({version:5,patches:[{path:['books','main','T'],rows:{update:[{id:'missing',row:['missing']}],append:[]}}]});version=5;
 assert.equal((await cache.read()).version,5);assert.equal(full,3,'an inconsistent delta triggers a full reload');
});

test('the cache falls back to version probing when the delta SQL is not installed',async()=>{
 let full=0,version=1;const cache=stateCache({fetchFull:async()=>{full++;return {data:{books:{}},version};},delta:async()=>null,probe:async()=>version});
 await cache.read();await cache.read();assert.equal(full,1);version=2;await cache.read();assert.equal(full,2);
});

test('commitChanges reports conflicts and falls back to the legacy full commit',async()=>{
 const changes={reads:['k'],writes:['k'],patches:[],outboxDone:[]};
 assert.deepEqual(await commitChanges({rpc:async()=>({data:7}),version:6,changes,events:[],fullData:()=>({})}),{data:true,version:7});
 assert.deepEqual(await commitChanges({rpc:async()=>({data:'0'}),version:6,changes,events:[],fullData:()=>({})}),{data:false,version:0});
 const calls=[];const legacy=await commitChanges({rpc:async(name)=>{calls.push(name);return name==='viral_commit_patch'?{error:{code:'PGRST202',message:'Could not find the function'}}:{data:true};},version:6,changes,events:[],fullData:()=>({})});
 assert.deepEqual(calls,['viral_commit_patch','viral_commit']);assert.equal(legacy.data,true);assert.equal(legacy.version,7);
 const failed=await commitChanges({rpc:async()=>({error:{code:'57014',message:'timeout'}}),version:6,changes,events:[],fullData:()=>({})});assert.ok(failed.error);
});

test('the optimized rows_ returns exactly what business.gs rows_ returns',async()=>{
 const vm=await import('node:vm');const d=fixture();d.books.main.Attendance.push(['x','1001','2026-01-01','t'],['','',''],['y','1002','2026-01-02']);
 for(const n of Object.keys(d.books.main)){
  const rt=createRuntime(d,null),fast=vm.runInContext(`rows_(${JSON.stringify(n)})`,rt.context),slow=vm.runInContext(`businessRows(${JSON.stringify(n)})`,createRuntime(d,null).context);
  assert.deepStrictEqual(fast,slow,n);
 }
});
