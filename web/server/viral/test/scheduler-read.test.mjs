import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {createRuntime,initializeData} from '../runtime.mjs';
import {prepareScheduler,commitSchedulerState} from '../scheduler-commit.mjs';
import {projectState,scopeConfig} from '../state-scopes.mjs';
const run=(data,preview)=>{
 const rt=createRuntime(data,null,{GROUP_GREETINGS_ENABLED:'false',...(preview?{READ_TABLES:scopeConfig('scheduler').tables}:{})});rt.run('v16Scheduler',[],true);return rt;
};
test('an idle cron uses a projected read and never downloads or commits the full state',async()=>{
 const data=initializeData();let fresh=0,commits=0;
 const prepared=await prepareScheduler({loadPreview:async()=>({version:1,data:projectState(data,'scheduler')}),loadFresh:async()=>{fresh++;return {version:1,data};},run});
 assert.equal(prepared.full,false);assert.equal(fresh,0);
 const result=await commitSchedulerState(prepared.state.data,prepared.rt.data,async()=>{commits++;return {data:true};});
 assert.equal(commits,0);assert.equal(result.changed,false);
});
test('a due reminder reloads and reruns from the latest full state, preserving unrelated writes',async()=>{
 const data=initializeData(),tasks=data.books.main.Tasks;
 tasks.push(tasks[0].map(k=>({id:'due-task',assignee_id:'1001',title:'Task đến hạn',status:'doing',due_at:new Date(Date.now()+60*60000).toISOString()}[k]||'')));
 let fresh=0;const latest=structuredClone(data);latest.books.main.Expenses.push(['expense-created-concurrently']);
 const prepared=await prepareScheduler({loadPreview:async()=>({version:1,data:projectState(data,'scheduler')}),loadFresh:async()=>{fresh++;return {version:2,data:latest};},run});
 assert.equal(fresh,1);assert.equal(prepared.full,true);assert.equal(prepared.state.version,2);
 assert.deepEqual(prepared.rt.data.books.main.Expenses,latest.books.main.Expenses);
 assert.equal(prepared.rt.data.outbox.length,1);assert.equal(prepared.rt.data.properties['TASK1H:due-task'],'1');
 let writes=0;const result=await commitSchedulerState(prepared.state.data,prepared.rt.data,async()=>{writes++;return {data:false};});
 assert.equal(writes,1);assert.equal(result.committed,false);
 assert.equal(data.properties['TASK1H:due-task'],undefined,'preview must not mutate saved data');
});
test('a dependency swallowed by scheduler business code still forces a safe full read',async()=>{
 const data=initializeData();let fresh=0;
 const prepared=await prepareScheduler({loadPreview:async()=>({version:1,data:projectState(data,'scheduler')}),loadFresh:async()=>{fresh++;return {version:1,data};},run:(input,preview)=>{
  const rt=createRuntime(input,null,{GROUP_GREETINGS_ENABLED:'false',...(preview?{READ_TABLES:scopeConfig('scheduler').tables}:{})});
  vm.runInContext("taskDeadlineAlerts_=function(){try{rows_('Expenses')}catch(e){}}",rt.context);
  rt.run('v16Scheduler',[],true);return rt;
 }});
 assert.equal(fresh,1);assert.equal(prepared.full,true);
});
