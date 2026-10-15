import test from 'node:test';
import assert from 'node:assert/strict';
import {refreshStaffOperatorSession} from '../staff-session.mjs';

test('operator gets a fresh session with the updated Excel credentials before applying roster',async()=>{
  const events=[],credential={email:'operator@example.test',password:'test-only-password'};
  const client={auth:{signInWithPassword:async input=>{assert.deepEqual(input,credential);events.push('fresh-cookie');return {data:{user:{id:'operator-uuid'}},error:null};},signOut:async()=>events.push('logout')}};
  await refreshStaffOperatorSession(client,credential,'operator-uuid');
  events.push('apply');assert.deepEqual(events,['fresh-cookie','apply']);
});
test('a different identity or failed reauthentication cannot continue the import',async()=>{
  for(const response of [{data:{user:{id:'different-user'}},error:null},{data:{user:null},error:{message:'private-provider-detail'}}]){
    let signedOut=false;
    const client={auth:{signInWithPassword:async()=>response,signOut:async()=>{signedOut=true}}};
    await assert.rejects(refreshStaffOperatorSession(client,{email:'operator@example.test',password:'test-only-password'},'operator-uuid'),e=>!e.message.includes('private-provider-detail')&&e.message.includes('Đăng nhập /admin'));
    assert.equal(signedOut,true);
  }
});
