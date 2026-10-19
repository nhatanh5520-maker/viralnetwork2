import test from 'node:test';import assert from 'node:assert/strict';
import {commitWithUploads,ViralCommitUncertain} from '../commit-uploads.mjs';import {ViralVersionConflict} from '../approval-retry.mjs';
function setup(result){const uploaded=[],removed=[];let commits=0;return {uploaded,removed,get commits(){return commits;},options:{uploads:[{id:'bill-a'},{id:'bill-b'}],upload:async file=>{uploaded.push(file.id);return {};},remove:async ids=>{removed.push(...ids);},commit:async()=>{commits++;return result;}}};}
test('acknowledged commit retains every uploaded bill and proof',async()=>{const x=setup({data:true});await commitWithUploads(x.options);assert.deepEqual(x.uploaded,['bill-a','bill-b']);assert.equal(x.removed.length,0);assert.equal(x.commits,1);});
test('explicit CAS false cleans unreferenced uploads and can safely signal a conflict',async()=>{const x=setup({data:false});await assert.rejects(commitWithUploads(x.options),ViralVersionConflict);assert.deepEqual(x.removed,['bill-a','bill-b']);assert.equal(x.commits,1);});
test('database error, missing response and lost acknowledgement never delete committed attachments or retry',async()=>{
 for(const result of [{error:{code:'57014'}},{data:null},undefined]){const x=setup(result);await assert.rejects(commitWithUploads(x.options),ViralCommitUncertain);assert.equal(x.removed.length,0);assert.equal(x.commits,1);}
 const x=setup();x.options.commit=async()=>{throw Error('connection lost after commit');};await assert.rejects(commitWithUploads(x.options),ViralCommitUncertain);assert.equal(x.removed.length,0);
});
test('partial upload failure rolls back only uploaded/attempted files before touching database',async()=>{const x=setup({data:true});x.options.upload=async file=>{x.uploaded.push(file.id);if(file.id==='bill-b')throw Error('network');return {};};await assert.rejects(commitWithUploads(x.options),/Chưa gửi yêu cầu lưu/);assert.equal(x.commits,0);assert.deepEqual(x.removed,['bill-a','bill-b']);});
