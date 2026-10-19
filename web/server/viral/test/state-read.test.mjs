import test from 'node:test';import assert from 'node:assert/strict';
import {sharedStateRead,stateReadFailure,ViralStateReadError} from '../state-read.mjs';
import {commitSchedulerState} from '../scheduler-commit.mjs';
test('twenty simultaneous reads use one upstream read and receive independent copies',async()=>{
 let calls=0,release;const gate=new Promise(r=>release=r);const read=sharedStateRead(async()=>{calls++;await gate;return {data:{attendance:[]},version:calls};});
 const requests=Array.from({length:20},()=>read());release();const results=await Promise.all(requests);assert.equal(calls,1);results[0].data.attendance.push('one');assert.equal(results[1].data.attendance.length,0);
 assert.equal((await read()).version,2,'settled snapshots must not be retained across writes');
});
test('a failed shared read is released and a later request can recover',async()=>{
 let calls=0;const read=sharedStateRead(async()=>{calls++;if(calls===1)throw Error('offline');return {version:2};});
 const failed=await Promise.allSettled([read(),read()]);assert.ok(failed.every(x=>x.status==='rejected'));assert.equal(calls,1);assert.equal((await read()).version,2);
});
test('database errors give safe codes without claiming data must be initialized',()=>{
 for(const error of [{code:'57014',message:'secret URL password'},{code:'42501'},{code:'PGRST116'},{name:'TimeoutError'},{code:'<private-secret>'}]){const result=stateReadFailure(error);assert.ok(result instanceof ViralStateReadError);assert.doesNotMatch(result.message,/secret|viral-init|Chưa khởi tạo/);}
 assert.match(stateReadFailure({code:'57014'}).message,/quá thời gian/);
});
test('an unchanged scheduler does not write or bump the common version',async()=>{
 let calls=0;const data={properties:{},books:{main:{}},outbox:[]};const result=await commitSchedulerState(data,structuredClone(data),async()=>{calls++;return {data:true};});assert.equal(calls,0);assert.equal(result.changed,false);
});
test('new reminders commit atomically and version rejection does not overwrite newer state',async()=>{
 let calls=0;for(const saved of [true,false]){const result=await commitSchedulerState({outbox:[]},{outbox:[{id:'event'}]},async()=>{calls++;return {data:saved};});assert.equal(result.committed,saved);assert.equal(result.changed,true);}assert.equal(calls,2);
 await assert.rejects(commitSchedulerState({a:1},{a:2},async()=>({error:Error('db error')})),/db error/);
});

test('a successful write can invalidate an older in-flight read for subsequent callers',async()=>{
 let calls=0,release;const read=sharedStateRead(async()=>{calls++;if(calls===1){await new Promise(r=>release=r);return {version:1};}return {version:2};});
 const old=read();await Promise.resolve();read.invalidate();assert.equal((await read()).version,2);release();assert.equal((await old).version,1);assert.equal(calls,2);
});
