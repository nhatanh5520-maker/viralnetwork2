import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
const src=fs.readFileSync('public/viral/client.js','utf8'),fn=src.slice(src.indexOf('function bestPosition('),src.indexOf('function locate(kind)'));
// Fake geolocation: scripted readings delivered on a fake clock.
function harness(readings,{deny=false}={}){
 const timers=[];let now=0,cleared=false;
 const geo={watchPosition(ok,err){for(const r of readings)timers.push({at:r.at,run:()=>deny?err({code:1}):ok({coords:r})});return 7;},getCurrentPosition(ok){},clearWatch(id){cleared=id===7;}};
 const ctx=vm.createContext({navigator:{geolocation:geo},Date,Number,Math,setTimeout:(f,ms)=>{timers.push({at:now+ms,run:f});return timers.length;},clearTimeout:id=>{if(timers[id-1])timers[id-1].run=()=>{};}});
 vm.runInContext(fn,ctx);
 const run=options=>new Promise(resolve=>{ctx.bestPosition(p=>resolve({ok:p.coords}),e=>resolve({error:e}),options);timers.sort((a,b)=>a.at-b.at);for(const t of [...timers].sort((a,b)=>a.at-b.at)){now=t.at;t.run();}});
 return {run,cleared:()=>cleared};
}
test('waits past a coarse first fix and returns the accurate one',async()=>{
 const h=harness([{at:500,latitude:1,longitude:1,accuracy:180},{at:4000,latitude:2,longitude:2,accuracy:22},{at:9000,latitude:3,longitude:3,accuracy:5}]);
 const r=await h.run({maxWait:20000});assert.equal(r.ok.accuracy,22);assert.equal(r.ok.latitude,2);assert.equal(h.cleared(),true);
});
test('returns the best reading when the goal is never reached',async()=>{
 const r=await harness([{at:500,latitude:1,longitude:1,accuracy:300},{at:3000,latitude:2,longitude:2,accuracy:80},{at:6000,latitude:3,longitude:3,accuracy:120}]).run({maxWait:10000});
 assert.equal(r.ok.accuracy,80);
});
test('reports permission denial immediately',async()=>{
 const r=await harness([{at:100,latitude:1,longitude:1,accuracy:10}],{deny:true}).run({maxWait:10000});assert.equal(r.error.code,1);
});
test('reports a timeout when no reading arrives',async()=>{
 const r=await harness([]).run({maxWait:5000});assert.equal(r.error.code,3);
});
