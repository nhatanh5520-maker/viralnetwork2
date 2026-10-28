import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import {createRequire} from 'node:module';import {JSDOM} from 'jsdom';
const require=createRequire(import.meta.url);const {ChangeTracker}=require('../../../public/viral/change-tracker.js');
test('signals merge per scope, ignore duplicates and retain a change received during an in-flight refresh',()=>{
 const tracker=new ChangeTracker();assert.deepEqual(tracker.accept({versions:{production:2,expenses:3}}),['production','expenses']);assert.deepEqual([...tracker.relevant('production').keys()],['production']);assert.equal(tracker.relevant('finance').size,0);
 const batch=tracker.relevant('production');tracker.accept({versions:{production:4,expenses:3}});tracker.complete(batch);assert.equal(tracker.relevant('production').get('production'),4);assert.deepEqual(tracker.accept({versions:{production:3}}),[]);tracker.complete(tracker.relevant('production'));assert.equal(tracker.relevant('production').size,0);assert.equal(tracker.relevant('expenses').get('expenses'),3);
 tracker.accept({versions:{production:6,expenses:8,people:9}});assert.equal(tracker.relevant('production').get('production'),6);assert.equal(tracker.relevant('profile').get('people'),9);
});
function setup(){const dom=new JSDOM('<body><div id="screen"></div></body>',{url:'https://app.test',runScripts:'outside-only'}),w=dom.window;Object.defineProperty(w.document,'hidden',{value:false,configurable:true});const timers=[],requests=[],listeners={};let subscription;
 w.setTimeout=(fn,ms)=>{timers.push({fn,ms});return timers.length;};w.clearTimeout=()=>{};w.setInterval=()=>0;
 w.eval("var state={user:{id:'1'},productionPage:{items:[]}},tab='production',busy=false,refreshing=false,approvalPending=false,approvalFocus=null,formDirty=false,coreReady=true,corePromise=null,managerPromise=null,lastManagerRefresh=0,productionReady=true;var pendingReadCalls=new Map(),productionPageCache=new Map();var $=id=>document.getElementById(id);var interacting=false,refreshCount=0,coreCount=0;function render(){}function screenInteractionActive(){return interacting;}function msg(){}async function loadProductionPage(){refreshCount++;return true;}async function refreshSnapshot(){coreCount++;return true;}async function loadStaffWorkload(){}function fieldReviewView(){}function fieldReportView(){}function performanceView(){}");
 w.supabase={createClient:()=>({realtime:{setAuth:async()=>{},disconnect(){}},channel:()=>({on:(event,filter,callback)=>{assert.equal(filter.table,'viral_change_signal');listeners.signal=callback;return {subscribe:callback=>{subscription=callback;return {};}};}}),removeAllChannels:async()=>{}})};
 w.fetch=async url=>{requests.push(url);return {ok:true,status:200,json:async()=>({ready:true,signal:{version:1,versions:{}},url:'https://test.supabase.co',anonKey:'public-key',accessToken:'user-token',expiresAt:Math.floor(Date.now()/1000)+3600})};};
 w.eval(fs.readFileSync('public/viral/change-tracker.js','utf8'));w.eval(fs.readFileSync('public/viral/live-data.js','utf8'));
 const tick=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};const flush=async()=>{const pending=timers.splice(0);for(const t of pending)if(t.ms<10000)await t.fn();await tick();};return {w,dom,timers,requests,listeners,tick,flush,get subscription(){return subscription;}};
}
test('unchanged data does not reload production; burst changes coalesce; editing defers until safe; another scope does not reload current tab',async()=>{
 const x=setup(),{w}=x;try{await x.tick();assert.equal(typeof x.subscription,'function');await x.flush();assert.equal(w.eval('refreshCount'),0);
 x.listeners.signal({new:{versions:{expenses:2}}});await x.flush();assert.equal(w.eval('refreshCount'),0);
 x.listeners.signal({new:{versions:{production:3,expenses:2}}});x.listeners.signal({new:{versions:{production:4,expenses:2}}});await x.flush();assert.equal(w.eval('refreshCount'),1);
 w.eval('interacting=true;formDirty=true;');x.listeners.signal({new:{versions:{production:5}}});await x.flush();assert.equal(w.eval('refreshCount'),1);assert.ok(w.document.getElementById('liveDataUpdate'));
 w.eval('interacting=false;formDirty=false;');w.document.dispatchEvent(new w.Event('focusout'));await x.flush();assert.equal(w.eval('refreshCount'),2);assert.equal(w.document.getElementById('liveDataUpdate'),null);
 w.eval("tab='expenses';render();");await x.flush();assert.equal(w.eval('coreCount'),1);
 Object.defineProperty(w.document,'hidden',{value:true,configurable:true});w.document.dispatchEvent(new w.Event('visibilitychange'));await x.tick();const before=x.requests.length;x.listeners.signal({new:{versions:{production:6}}});await x.flush();assert.equal(x.requests.length,before);assert.equal(w.eval('refreshCount'),2);
 Object.defineProperty(w.document,'hidden',{value:false,configurable:true});w.document.dispatchEvent(new w.Event('visibilitychange'));await x.tick();assert.ok(x.requests.length>before);
 }finally{x.dom.window.close();}
});
test('SQL only publishes the metadata table; authenticated access is guarded and browser cannot write it',()=>{
 const sql=fs.readFileSync('../supabase/viral-realtime.sql','utf8');assert.match(sql,/add table public\.viral_change_signal/);assert.doesNotMatch(sql,/add table public\.viral_state/);assert.match(sql,/m\.auth_user_id=\(select auth\.uid\(\)\) and m\.active/);assert.match(sql,/revoke all on public\.viral_change_signal from public,anon,authenticated/);assert.match(sql,/grant select on public\.viral_change_signal to authenticated/);assert.doesNotMatch(sql,/grant (?:all|insert|update).*to authenticated/);assert.match(sql,/where id='main'/);
 const route=fs.readFileSync('src/app/api/viral/changes/route.ts','utf8');assert.doesNotMatch(route,/SERVICE_ROLE_KEY/);assert.match(route,/private, no-store/);assert.doesNotMatch(route,/loadViral\(/);
});
test('local save refreshes without a realtime event; does not refresh while saving; metadata signal does not blank the loaded screen',async()=>{
 const x=setup(),{w}=x;try{await x.tick();await x.flush();
 w.eval('busy=true;');x.listeners.signal({new:{versions:{people:2}}});
 assert.equal(w.eval('productionReady'),true,'an incoming signal must not invalidate the displayed screen while saving');
 w.dispatchEvent(new w.CustomEvent('viral:saved',{detail:{scopes:['production','work']}}));
 await x.flush();assert.equal(w.eval('refreshCount'),0);
 w.eval('busy=false;');await x.flush();assert.equal(w.eval('refreshCount'),1);assert.equal(w.document.getElementById('liveDataUpdate'),null);
 // A later local save must work even with no new server signal revision.
 w.dispatchEvent(new w.CustomEvent('viral:saved',{detail:{scopes:['production']}}));await x.flush();assert.equal(w.eval('refreshCount'),2);
 assert.deepEqual(Array.from(w.ViralMutationScopes('saveProductionAsset')),['production','work']);assert.equal(w.ViralMutationScopes('productionPage').length,0);
 }finally{x.dom.window.close();}
});
test('local invalidation received during a read remains pending',()=>{const t=new ChangeTracker();t.invalidate(['production']);const first=t.relevant('production');t.invalidate(['production']);t.complete(first);assert.equal(t.relevant('production').size,1);});

test('first home signal after login refreshes silently without an update button',async()=>{
 const x=setup(),{w}=x;try{await x.tick();w.eval("tab='home';");
 x.listeners.signal({new:{versions:{production:1,attendance:1,people:1}}});
 assert.equal(w.document.getElementById('liveDataUpdate'),null);
 await x.flush();assert.equal(w.eval('coreCount'),1);assert.equal(w.document.getElementById('liveDataUpdate'),null);
 w.eval('interacting=true;formDirty=true;');x.listeners.signal({new:{versions:{production:2}}});await x.flush();
 const banner=w.document.getElementById('liveDataUpdate');assert.match(banner.textContent,/lưu hoặc hủy/);assert.equal(banner.querySelector('button'),null);
 w.eval('interacting=false;formDirty=false;');await x.flush();assert.equal(w.eval('coreCount'),2);assert.equal(w.document.getElementById('liveDataUpdate'),null);
 }finally{x.dom.window.close();}
});
test('failed background refresh retries automatically without requiring a click',async()=>{
 const x=setup(),{w}=x;try{await x.tick();w.eval("tab='home';refreshSnapshot=async function(){coreCount++;return coreCount>1;};");
 x.listeners.signal({new:{versions:{people:1}}});await x.flush();
 assert.match(w.document.getElementById('liveDataUpdate').textContent,/tự thử lại/);
 assert.equal(w.document.querySelector('#liveDataUpdate button'),null);
 const retry=x.timers.find(t=>t.ms===10000);assert.ok(retry);await retry.fn();await x.tick();
 assert.equal(w.eval('coreCount'),2);assert.equal(w.document.getElementById('liveDataUpdate'),null);
 }finally{x.dom.window.close();}
});

test('realtime resumes after a 401 and a new login, ignoring old session callbacks',async()=>{
 const x=setup(),{w}=x;try{await x.tick();const oldSignal=x.listeners.signal;
 const original=w.fetch;w.fetch=async()=>({status:401,ok:false});w.dispatchEvent(new w.Event('online'));await x.tick();assert.equal(w.document.body.dataset.liveData,'signed_out');
 w.dispatchEvent(new w.Event('viral:session-reset'));w.eval("state={user:{id:'2'},productionPage:{items:[]}};");w.fetch=original;w.eval('render();');await x.tick();
 assert.notEqual(x.listeners.signal,oldSignal);oldSignal({new:{versions:{production:999}}});await x.flush();assert.equal(w.eval('refreshCount'),0);
 x.listeners.signal({new:{versions:{production:1}}});await x.flush();assert.equal(w.eval('refreshCount'),1);
 }finally{x.dom.window.close();}
});
test('a signal being refreshed on one tab is not acknowledged for a different tab',async()=>{
 const x=setup(),{w}=x;try{await x.tick();w.eval("tab='home';var finishRead;refreshSnapshot=()=>new Promise(resolve=>{finishRead=resolve;});");
 x.listeners.signal({new:{versions:{production:1}}});const timer=x.timers.find(t=>t.ms===800);assert.ok(timer);const running=timer.fn();await x.tick();w.eval("tab='production';finishRead(true);");await running;await x.tick();await x.flush();assert.equal(w.eval('refreshCount'),1);
 }finally{x.dom.window.close();}
});

test('a deferred attendance refresh remains pending without reporting a failure',async()=>{
 const x=setup(),{w}=x;try{await x.tick();w.eval("tab='attendance';refreshSnapshot=async function(){coreCount++;return null;};");
 x.listeners.signal({new:{versions:{attendance:1}}});await x.flush();
 assert.equal(w.document.getElementById('liveDataUpdate'),null);assert.ok(!x.timers.some(t=>t.ms===10000));
 w.eval('refreshSnapshot=async function(){coreCount++;return true;};');await x.flush();
 assert.equal(w.eval('coreCount'),2);assert.equal(w.document.getElementById('liveDataUpdate'),null);
 }finally{w.close();}
});
test('a failed home refresh does not label a deferred attendance refresh as a failure',async()=>{
 const x=setup(),{w}=x;try{await x.tick();w.eval("tab='home';refreshSnapshot=async function(){return false;};");
 x.listeners.signal({new:{versions:{attendance:1}}});await x.flush();assert.match(w.document.getElementById('liveDataUpdate').textContent,/tự thử lại/);
 w.eval("tab='attendance';refreshSnapshot=async function(){return null;};render();");await x.flush();assert.equal(w.document.getElementById('liveDataUpdate'),null);
 }finally{w.close();}
});

test('utilities menu receives no business refresh or pending-data banner',async()=>{
 const x=setup(),{w}=x;try{await x.tick();w.eval("tab='utilities';render();");x.listeners.signal({new:{versions:{settings:3,people:3,attendance:3}}});await x.flush();assert.equal(w.eval('coreCount'),0);assert.equal(w.document.getElementById('liveDataUpdate'),null);}finally{w.close();}
});
