import test from 'node:test';import assert from 'node:assert/strict';
import {initializeData,createRuntime} from '../runtime.mjs';import {withViralWriteRetry,ViralVersionConflict} from '../approval-retry.mjs';
function fixture(){const d=initializeData(),h=d.books.main.Employees[0];for(const id of ['1001','1002'])d.books.main.Employees.push(h.map(k=>({telegram_id:id,name:'Test '+id,department:'Content',role:'employee',active:'true'}[k]||'')));for(const row of d.books.main.Settings){if(row[0]==='office_lat')row[1]='16.0544';if(row[0]==='office_lng')row[1]='108.2022';}return d;}
test('check-ins from two staff preserve both records after an explicit version conflict',async()=>{
 let current=fixture(),calls=0;const args=['supabase','in',16.0544,108.2022,10];
 const result=await withViralWriteRetry('attendance',async()=>{calls++;const rt=createRuntime(current,{employeeId:'1002'}),result=rt.run('attendance',args);if(calls===1){const other=createRuntime(current,{employeeId:'1001'});other.run('attendance',args);current=other.data;throw new ViralVersionConflict();}current=rt.data;return result;});
 assert.equal(result.ok,true);assert.equal(calls,2);assert.equal(current.books.main.Attendance.length,3);assert.deepEqual(new Set(current.books.main.Attendance.slice(1).map(r=>String(r[1]))),new Set(['1001','1002']));
 const repeated=createRuntime(current,{employeeId:'1002'});assert.equal(repeated.run('attendance',args).already,true);assert.equal(repeated.data.books.main.Attendance.length,3);
});
test('attendance never retries uncertain network failure and stops after bounded version rejections',async()=>{
 for(const method of ['attendance','fieldAttendance']){let calls=0;await assert.rejects(withViralWriteRetry(method,async()=>{calls++;throw Error('network timeout');}),/network timeout/);assert.equal(calls,1);calls=0;await assert.rejects(withViralWriteRetry(method,async()=>{calls++;throw new ViralVersionConflict();}),ViralVersionConflict);assert.equal(calls,3);}
});

test('a burst of twenty check-ins is serialized in one process without blocking reads',async()=>{
 const {attendanceQueue}=await import('../attendance-queue.mjs');const queue=attendanceQueue();let active=0,peak=0,saved=0;
 const writes=Array.from({length:20},()=>queue('attendance',async()=>{active++;peak=Math.max(peak,active);await new Promise(r=>setTimeout(r,1));saved++;active--;return saved;}));
 assert.equal(await queue('snapshotHome',async()=>42),42);await Promise.all(writes);assert.equal(saved,20);assert.equal(peak,1);
 await assert.rejects(queue('attendance',async()=>{throw Error('invalid GPS');}),/invalid GPS/);assert.equal(await queue('attendance',async()=>true),true);
});
test('an expired queued check-in is rejected before any write is attempted',async()=>{
 const {attendanceQueue}=await import('../attendance-queue.mjs');let time=0,writes=0,release;const queue=attendanceQueue({now:()=>time,maxWait:10});
 const first=queue('attendance',async()=>{await new Promise(r=>release=r);writes++;});await Promise.resolve();
 const second=queue('attendance',async()=>{writes++;});time=11;release();await first;await assert.rejects(second,/chưa ghi nhận/);assert.equal(writes,1);
});
