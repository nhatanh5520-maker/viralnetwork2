import test from 'node:test';import assert from 'node:assert/strict';
import {applyStaffRoster,staffApplyError} from '../staff-apply.mjs';
const people=[{telegram_id:'12345',email:'staff@example.test',active:true}];
const base={books:{main:{Employees:[['telegram_id','active'],['12345',true]],Settings:[['key','value']]}}};
test('a rejected version reloads current business data before retrying roster commit',async()=>{
 const calls=[];const svc={rpc:async(name,args)=>{calls.push(args);return calls.length===1?{error:{code:'P0001',message:'Main changed'}}:{data:'backup-id',error:null}}};
 const fresh=structuredClone(base);fresh.newProduction='preserved';
 const result=await applyStaffRoster({initial:{svc,data:base,version:1},stage:{id:'stage',version:23},people,mappings:[],reload:async()=>({svc,data:fresh,version:2})});
 assert.equal(result,'backup-id');assert.equal(calls.length,2);assert.equal(calls[1].main_version,2);assert.equal(calls[1].new_data.newProduction,'preserved');assert.equal(base.staffRosterAuthoritative,undefined);
});
test('permanent or ambiguous errors are reported with safe codes and are never retried',async()=>{
 for(const code of ['42501','PGRST202','23505','UNKNOWN']){
  let calls=0;const svc={rpc:async()=>{calls++;return {error:{code,message:'private-provider-message',details:'private-row'}}}};
  await assert.rejects(applyStaffRoster({initial:{svc,data:base,version:1},stage:{id:'stage',version:23},people,mappings:[],reload:async()=>{throw Error('must not reload')}}),e=>e.message.includes(code)&&!e.message.includes('private'));
  assert.equal(calls,1);
 }
 assert.match(staffApplyError({code:'42702'}).message,/không rõ ràng/);
});
test('continuous version conflicts stop after three attempts',async()=>{
 let calls=0;const state={data:base,version:1,svc:{rpc:async()=>{calls++;return {error:{code:'P0001',message:'Main changed'}}}}};
 await assert.rejects(applyStaffRoster({initial:state,stage:{id:'stage',version:23},people,mappings:[],reload:async()=>state}),/P0001/);assert.equal(calls,3);
});
