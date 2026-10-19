import test from 'node:test';import assert from 'node:assert/strict';import {avatarResolver} from '../avatar-cache.mjs';
test('concurrent photo lookups coalesce, remain bounded and expire without caching permissions',async()=>{
 let calls=0,time=0,active=0,peak=0;const resolve=avatarResolver({now:()=>time,ttl:100,maxEntries:2}),load=async id=>{calls++;active++;peak=Math.max(peak,active);await new Promise(r=>setTimeout(r,1));active--;return 'photo-'+id;};
 const values=await Promise.all([resolve(['1','2'],load),resolve(['1'],load)]);assert.equal(calls,2);assert.equal(values[1]['1'],'photo-1');assert.ok(peak<=2);await resolve(['1'],load);assert.equal(calls,2);time=101;await resolve(['1'],load);assert.equal(calls,3);
 await resolve(['3','4'],load);await resolve(['2'],load);assert.equal(calls,6);
});
test('failed lookups recover, scope changes discard old photos, and expired budgets do not start new loads',async()=>{
 let calls=0;const resolve=avatarResolver({now:()=>10});const failed=await resolve(['1'],async()=>{calls++;throw Error('offline');});assert.equal(failed['1'],undefined);
 assert.equal((await resolve(['1'],async()=>{calls++;return 'ok';}))['1'],'ok');assert.equal(calls,2);
 assert.equal((await resolve(['1'],async()=>{calls++;return 'new-bot-photo';},{scope:'new-bot'}))['1'],'new-bot-photo');assert.equal(calls,3);
 await resolve(['2'],async()=>{calls++;return 'late';},{scope:'new-bot',deadline:9});assert.equal(calls,3);
});
