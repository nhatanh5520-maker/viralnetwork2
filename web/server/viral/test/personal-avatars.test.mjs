import test from 'node:test';import assert from 'node:assert/strict';import {initializeData,createRuntime} from '../runtime.mjs';import {personalAvatarFile,retainPersonalAvatars} from '../personal-avatars.mjs';
const image={name:'avatar.png',type:'image/png',base64:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII='};
function fixture(){const data=initializeData(),h=data.books.main.Employees[0];for(const id of ['1001','1002'])data.books.main.Employees.push(h.map(k=>({telegram_id:id,name:'NV '+id,active:'true',role:'employee'}[k]||'')));return data;}
test('employee can save only their own avatar, snapshots use private image route, removed/old avatars cannot be read',()=>{
 const rt=createRuntime(fixture(),{employeeId:'1001'}),api=(m,...args)=>rt.run(m,['supabase',...args]);
 assert.throws(()=>api('saveMyAvatar',{action:'save',telegram_id:'1002',image}),/chính mình/);assert.throws(()=>api('saveMyAvatar',{action:'save',image:{...image,base64:'ZmFrZQ=='}}),/không hợp lệ/);
 const first=api('saveMyAvatar',{action:'save',image}),id=first.personalAvatars['1001'].split('=')[1];assert.ok(personalAvatarFile(rt.data,{employeeId:'1002'},id));assert.equal(personalAvatarFile(rt.data,{employeeId:'unknown'},id),null);assert.match(api('snapshotCore').personalAvatars['1001'],/\/api\/viral\/avatar/);assert.equal(first.personalAvatars['1002'],undefined);
 const candidate=fixture();retainPersonalAvatars(candidate,rt.data);assert.ok(personalAvatarFile(candidate,{employeeId:'1002'},id));
 const second=api('saveMyAvatar',{action:'save',image});assert.notEqual(second.personalAvatars['1001'],first.personalAvatars['1001']);assert.equal(personalAvatarFile(rt.data,{employeeId:'1002'},id),null);
 const removed=api('saveMyAvatar',{action:'remove'});assert.equal(removed.personalAvatars['1001'],'');const currentId=second.personalAvatars['1001'].split('=')[1];assert.equal(personalAvatarFile(rt.data,{employeeId:'1002'},currentId),null);assert.equal(rt.data.books.main.UserAvatars.length,2);
});
