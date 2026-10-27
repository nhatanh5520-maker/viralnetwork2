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
 for(const [id,role,job] of [['1001','leader','Content'],['1002','employee','Editor'],['1004','employee','VJ']])a.push(a[0].map(k=>({telegram_id:id,name:'Test '+id,role,department:job,job_title:job,active:'true'}[k]||'')));
 for(const [k,v] of [['office_lat','16.0544'],['office_lng','108.2022'],['radius_m','100']]){const r=data.books.main.Settings.find(r=>r[0]===k);if(r)r[1]=v;else data.books.main.Settings.push([k,v]);}
 return data;
}
function harness({dependencyMiss=false,sideEffect=false}={}){
 let state=fixture(),version=1,interfere=null;const queries=[],commits=[];
 class Query{
  constructor(table){this.table=table;this.columns='';}
  select(columns){this.columns=columns;return this;}eq(){return this;}in(){return this;}abortSignal(){return this;}
  single(){
   queries.push(this.columns);
   if(this.table!=='viral_state')throw Error('Unexpected table');
   if(this.columns==='version')return Promise.resolve({data:{version},error:null});
   if(this.columns==='data,version')return Promise.resolve({data:{version,data:structuredClone(state)},error:null});
   const row={version};for(const field of this.columns.split(',')){
    if(field==='version')continue;
    const [alias,path]=field.split(':');let value={data:state};for(const key of path.split('->'))value=value?.[key];row[alias]=value??null;
   }
   return Promise.resolve({data:structuredClone(row),error:null});
  }
  then(resolve,reject){return Promise.resolve({data:[],error:null}).then(resolve,reject);}
 }
 const svc={from:table=>new Query(table),rpc:async(name,args)=>{
  assert.equal(name,'viral_commit');commits.push(args);
  if(interfere){const operation=interfere;interfere=null;state=operation(state);version++;}
  if(args.expected_version!==version)return {data:false,error:null};
  state=structuredClone(args.new_data);version++;return {data:true,error:null};
 }};
 const exports={},sandbox={exports,process:{env:{NEXT_PUBLIC_SUPABASE_URL:'https://test.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'test'}},Buffer,AbortSignal,setTimeout,console:{warn(){},error(){}},require:id=>{
  if(id==='server-only')return {};
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
 return {api:exports,queries,commits,getState:()=>structuredClone(state),getVersion:()=>version,externalWrite:operation=>{state=operation(state);version++;},duringCommit:operation=>interfere=operation};
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
