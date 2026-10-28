import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../../../public/viral/client.js',import.meta.url),'utf8');
function harness(){
 let resolve,reject;const pending=new Promise((a,b)=>{resolve=a;reject=b;});
 const messages=[],calls=[],nodes=new Map();
 const ctx={tab:'tasks',busy:false,refreshing:false,state:{user:{id:'1',role:'employee'},attendance:{check_in:null},reviewQueue:[{id:'pending-task'}]},webSessionGeneration:0,webWriteGeneration:0,lastRefresh:1,lastManagerRefresh:0,coreReady:false,document:{hidden:false},console:{warn(){}},Date,
  currentReviewScope:()=> 'personal',call(method){calls.push(method);return pending;},screenInteractionActive:()=>false,render(){calls.push('render');},msg(...args){messages.push(args);},$(id){if(!nodes.has(id))nodes.set(id,{});return nodes.get(id);}};
 vm.createContext(ctx);
 vm.runInContext(source.slice(source.indexOf('let reviewQueueRequest=0;'),source.indexOf('async function reviewQueuedTask')),ctx);
 vm.runInContext(source.slice(source.indexOf('async function refreshSnapshot('),source.indexOf('let productionRequest=0,')),ctx);
 return {ctx,messages,calls,resolve,reject};
}
test('late pending-work error cannot cover attendance confirmation or clear existing queue',async()=>{
 const h=harness(),request=h.ctx.loadReviewQueue();h.ctx.tab='attendance';h.reject(Error('[57014]'));
 await request;assert.equal(h.messages.length,0);assert.equal(h.ctx.state.reviewQueue[0].id,'pending-task');assert.ok(!h.calls.includes('render'));
});
test('pending-work error on Tasks keeps previous tasks and uses inline feedback',async()=>{
 const h=harness(),request=h.ctx.loadReviewQueue();h.reject(Error('[57014]'));await request;
 assert.equal(h.messages.length,0);assert.match(h.ctx.$('message').textContent,/Chưa tải được/);assert.equal(h.ctx.state.reviewQueue.length,1);
});
test('attendance refresh uses dedicated snapshot and does not mark broad core loaded',async()=>{
 const h=harness();h.ctx.tab='attendance';const request=h.ctx.refreshSnapshot(true);
 h.resolve({user:{id:'1',role:'employee'},attendance:{check_in:'saved'}});await request;
 assert.equal(h.calls[0],'snapshotAttendance');assert.equal(h.ctx.coreReady,false);assert.equal(h.ctx.state.attendance.check_in,'saved');
});
test('a slow snapshot cannot overwrite a check-in when a write started during the read',async()=>{
 const h=harness();h.ctx.tab='attendance';const request=h.ctx.refreshSnapshot(true);
 h.ctx.webWriteGeneration++;h.ctx.state.attendance={check_in:'saved'};
 h.resolve({user:{id:'1'},attendance:null});await request;
 assert.equal(h.ctx.state.attendance.check_in,'saved');assert.equal(h.messages.length,0);assert.equal(h.ctx.refreshing,false);
});
test('late manual refresh error after tab change does not show on attendance',async()=>{
 const h=harness();const request=h.ctx.refreshSnapshot(true);h.ctx.tab='attendance';h.reject(Error('[57014]'));await request;
 assert.equal(h.messages.length,0);
});
test('opening attendance does not request broad core even if it has never loaded',()=>{
 const start=source.indexOf('function go(next)'),go=source.slice(start,source.indexOf('\n',start));
 const calls=[],ctx={busy:false,approvalPending:false,approvalFocus:null,compactPeoplePickerDismiss:null,tab:'home',formDirty:false,window:{scrollTo(){}},render(){calls.push('render');},refreshSnapshot(manual){calls.push(manual);},loadCore(){throw Error('Unexpected broad load');}};
 vm.createContext(ctx);vm.runInContext(go+";go('attendance')",ctx);assert.deepEqual(calls,['render',true]);
});
