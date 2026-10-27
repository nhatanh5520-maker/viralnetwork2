import test from 'node:test';
import assert from 'node:assert/strict';
import {versionedStateRead} from '../state-read.mjs';
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
test('sequential unchanged reads check version but transfer business data only once',async()=>{
 let version=1,checks=0,downloads=0;
 const read=versionedStateRead({readVersion:async()=>{checks++;return version;},readSnapshot:async()=>{downloads++;return {version,data:{items:[]}};}});
 for(let i=0;i<30;i++){const snapshot=await read('attendance');snapshot.data.items.push(i);}
 assert.equal(checks,30);assert.equal(downloads,1);assert.deepEqual((await read('attendance')).data.items,[]);
 version=2;assert.equal((await read('attendance')).version,2);assert.equal(downloads,2);
});
test('twenty concurrent reads share version check and download, returning isolated objects',async()=>{
 let checks=0,downloads=0;const gate=deferred();
 const read=versionedStateRead({readVersion:async()=>{checks++;await gate.promise;return 10;},readSnapshot:async()=>{downloads++;return {version:10,data:{items:[]}};}});
 const pending=Array.from({length:20},()=>read('production'));gate.resolve();const results=await Promise.all(pending);
 assert.equal(checks,1);assert.equal(downloads,1);results[0].data.items.push('private');assert.deepEqual(results[1].data.items,[]);
});
test('another server writing a new version invalidates cached state on next request',async()=>{
 let live={version:1,data:{employees:[{active:true}],tasks:[]}};
 const read=versionedStateRead({readVersion:async()=>live.version,readSnapshot:async()=>structuredClone(live)});
 await read();live={version:2,data:{employees:[{active:false}],tasks:['assigned-by-another-server']}};
 assert.deepEqual((await read()).data,live.data);
});
test('failed version checks and permission failures never serve old cached content',async()=>{
 let version=1,offline=false,denied=false,downloads=0;
 const read=versionedStateRead({readVersion:async()=>{if(offline)throw Error('offline');return version;},readSnapshot:async()=>{downloads++;if(denied)throw Error('permission');return {version,data:{secret:'private'}};}});
 await read();offline=true;await assert.rejects(read(),/offline/);offline=false;version=2;denied=true;await assert.rejects(read(),/permission/);
 denied=false;assert.equal((await read()).version,2);assert.equal(downloads,3);
});
test('scope caches cannot substitute attendance for production at the same version',async()=>{
 const calls=[];const read=versionedStateRead({readVersion:async()=>3,readSnapshot:async scope=>{calls.push(scope);return {version:3,data:{scope}};}});
 assert.equal((await read('attendance')).data.scope,'attendance');assert.equal((await read('production')).data.scope,'production');
 await read('attendance');assert.deepEqual(calls,['attendance','production']);
});
test('a write invalidates older in-flight reads without letting them repopulate cache',async()=>{
 let version=1,downloads=0;const gate=deferred(),began=deferred();
 const read=versionedStateRead({readVersion:async()=>version,readSnapshot:async()=>{downloads++;const snapshot={version,data:{value:version}};if(downloads===1){began.resolve();await gate.promise;}return snapshot;}});
 const old=read();await began.promise;version=2;read.invalidate();assert.equal((await read()).version,2);gate.resolve();assert.equal((await old).version,1);
 assert.equal((await read()).version,2);assert.equal(downloads,2);
});
test('a snapshot newer than its version probe is accepted and cached with actual version',async()=>{
 let version=1,downloads=0;const read=versionedStateRead({readVersion:async()=>version,readSnapshot:async()=>{downloads++;version=2;return {version,data:{}};}});
 assert.equal((await read()).version,2);await read();assert.equal(downloads,1);
});
test('missing/invalid versions and snapshots behind the probe fail closed',async()=>{
 for(const version of [undefined,-1,NaN,9007199254740992,'bad']){
  const read=versionedStateRead({readVersion:async()=>version,readSnapshot:async()=>({version:1,data:{}})});await assert.rejects(read());
 }
 const read=versionedStateRead({readVersion:async()=>2,readSnapshot:async()=>({version:1,data:{}})});await assert.rejects(read());
});
test('LRU memory bound evicts entries and oversized snapshots are never retained',async()=>{
 let downloads=0;const read=versionedStateRead({maxBytes:110,readVersion:async()=>1,readSnapshot:async scope=>{downloads++;return {version:1,data:{scope,padding:'x'.repeat(20)}};}});
 await read('a');await read('b');await read('a');assert.equal(downloads,3);
 const large=versionedStateRead({maxBytes:1,readVersion:async()=>1,readSnapshot:async()=>{downloads++;return {version:1,data:{}};}});
 await large();await large();assert.equal(downloads,5);
});
