import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {JSDOM} from 'jsdom';
async function setup(){const dom=new JSDOM(fs.readFileSync('public/viral/index.html','utf8'),{url:'https://app.test/viral/index.html',runScripts:'dangerously'}),w=dom.window;w.confirm=()=>true;w.fetch=async()=>({ok:false,status:401,json:async()=>({})});const script=w.document.createElement('script');script.textContent=fs.readFileSync('public/viral/client.js','utf8');w.document.body.append(script);for(let i=0;i<10;i++)await Promise.resolve();return {dom,w};}
test('an RPC completed after logout cannot return old personnel data to a new session',async()=>{
 const {dom,w}=await setup();try{let release;w.fetch=()=>new Promise(r=>release=r);const request=w.call('snapshotCore').catch(e=>e.message);w.resetWebSession();release({ok:true,status:200,json:async()=>({result:{user:{id:'old'},privateData:'old-personnel'}})});assert.match(await request,/Phiên đăng nhập đã thay đổi/);assert.equal(w.eval('state'),null);}finally{dom.window.close();}
});
test('a failed logout preserves the signed-in screen and reports the failure',async()=>{
 const {dom,w}=await setup();try{w.eval("state={user:{id:'active'}};");w.fetch=async()=>({ok:false,status:503});await w.logoutRememberedDevice();assert.equal(w.eval('state.user.id'),'active');assert.match(w.document.getElementById('statusText').textContent,/Chưa đăng xuất được/);}finally{dom.window.close();}
});
test('a gateway HTML response explains uncertainty instead of a JSON parse error',async()=>{
 const {dom,w}=await setup();try{await assert.rejects(w.readWebResponse({status:504,json:async()=>{throw SyntaxError('Unexpected token <');}}),e=>/kiểm tra kết quả/.test(e.message)&&!/Unexpected token/.test(e.message));}finally{dom.window.close();}
});

test('Director profile exposes working web logout instead of the removed Mini App revocation RPC',async()=>{
 const {dom,w}=await setup();try{w.eval("state={user:{id:'director',role:'director',name:'Director'}};");w.profileViewLegacy();assert.ok(w.document.getElementById('logoutDevice'));assert.equal(w.document.getElementById('revokeRemembered'),null);}finally{dom.window.close();}
});

test('an oversized photo batch is rejected before sending a request to the gateway',async()=>{
 const {dom,w}=await setup();try{let calls=0;w.fetch=async()=>{calls++;throw Error('must not send');};await assert.rejects(w.call('submitV20Expense',{bill_images:['x'.repeat(4000001)]}),/giới hạn một lần gửi/);assert.equal(calls,0);await assert.rejects(w.readWebResponse({status:413}),/chia nhỏ/);}finally{dom.window.close();}
});

test('initial Production failure leaves a retry action that can recover without re-login',async()=>{
 const {dom,w}=await setup();try{
 Object.defineProperty(w.document,'hidden',{value:false});w.eval("state={user:{id:'active',role:'employee'}};tab='production';productionReady=false;render=()=>{if(productionReady)$('screen').textContent='Sản xuất đã tải';else productionView()};");
 w.fetch=async()=>({ok:false,status:503,json:async()=>({error:'Đọc dữ liệu quá thời gian. [57014]'})});
 assert.equal(await w.loadProductionPage(),false);assert.ok(w.document.getElementById('productionRetry'));assert.match(w.document.getElementById('screen').textContent,/57014/);assert.doesNotMatch(w.document.getElementById('screen').textContent,/Đang tải sản xuất/);
 w.fetch=async()=>({ok:true,status:200,json:async()=>({result:{productionPage:{ok:true,items:[],stats:{},hasMore:false},projects:[],peopleNames:{},productionPeople:[]}})});
 w.document.getElementById('productionRetry').click();await new Promise(r=>setTimeout(r,15));assert.equal(w.document.getElementById('screen').textContent,'Sản xuất đã tải');assert.equal(w.eval('state.user.id'),'active');
 }finally{dom.window.close();}
});
