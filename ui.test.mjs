import {test} from 'node:test';import assert from 'node:assert/strict';import {JSDOM} from 'jsdom';import fs from 'node:fs';import {initializeData,createRuntime} from '../runtime.mjs';
for(const width of [430,1440])test(`current five navigation screens render at ${width}px without script errors`,async()=>{
 const data=initializeData(),h=data.books.main.Employees[0];data.books.main.Employees.push(h.map(k=>({telegram_id:'1001',name:'Leader thử nghiệm',department:'Content',job_title:'Leader Content',role:'leader',active:'true'}[k]||'')));
 const rt=createRuntime(data,{employeeId:'1001'}),errors=[];
 const dom=new JSDOM(fs.readFileSync('public/viral/index.html','utf8'),{url:'https://test.local/viral/index.html',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;
 Object.defineProperty(w,'innerWidth',{value:width});w.matchMedia=()=>({matches:width<768,addEventListener(){},removeEventListener(){}});w.confirm=()=>true;w.scrollTo=()=>{};
 w.fetch=async(url,opts={})=>{if(String(url).includes('/session'))return {ok:true,json:async()=>({ok:true})};const {method,args,initData}=JSON.parse(opts.body);try{const result=method==='avatarBatch'?{}:rt.run(method,[initData||'supabase',...args]);return {ok:true,json:async()=>({result:JSON.parse(JSON.stringify(result))})};}catch(e){errors.push(method+': '+e.message);return {ok:false,json:async()=>({error:e.message})};}};
 w.addEventListener('error',e=>errors.push(e.message));w.eval(fs.readFileSync('public/viral/client.js','utf8'));await new Promise(r=>setTimeout(r,100));
 try{assert.match(w.document.getElementById('nav').textContent,/Trang chủ/);for(const label of ['Sản xuất','Công việc','Tiện ích','Bảng tin']){const button=[...w.document.querySelectorAll('#nav button')].find(b=>b.textContent.includes(label));assert.ok(button);button.click();await new Promise(r=>setTimeout(r,50));assert.ok(w.document.getElementById('screen').textContent.trim());}assert.deepEqual(errors,[]);}finally{dom.window.close();}
});
