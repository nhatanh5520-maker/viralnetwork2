import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import fs from 'node:fs';
import {initializeData,createRuntime} from '../runtime.mjs';
const ctx=vm.createContext({});vm.runInContext(fs.readFileSync('public/viral/task-layout.js','utf8'),ctx);const layout=ctx.ViralTaskLayout;
test('production progress follows milestones, draft Final stays below 100 and publishing is separate',()=>{
 assert.equal(layout.production({stage:'brief'}).percent,0);
 assert.equal(layout.production({stage:'script',idea_approval:'Duyệt'}).percent,20);
 assert.equal(layout.production({stage:'shoot',idea_approval:'Duyệt'}).percent,20);
 assert.equal(layout.production({stage:'shoot',idea_approval:'Duyệt',vj_script_started_at:'2026-10-15'}).percent,40);
 assert.equal(layout.production({stage:'edit',idea_approval:'Duyệt',editor_received_at:'2026-10-15'}).percent,60);
 assert.equal(layout.production({stage:'edit',idea_approval:'Duyệt',editor_progress:50}).percent,75);
 assert.equal(layout.production({stage:'edit',idea_approval:'Duyệt',editor_progress:90,final_url:'https://example.test/final'}).percent,90);
 assert.equal(layout.production({stage:'ready',idea_approval:'Duyệt'}).percent,100);
 assert.match(layout.production({stage:'published'}).label,/Đã đăng/);
});
test('personal work buckets reflect each role instead of completing the whole production early',()=>{
 assert.equal(layout.group({status:'open'}),'waiting');assert.equal(layout.group({status:'in_progress'}),'active');assert.equal(layout.group({status:'done',production_id:'p',production_item:{stage:'edit'}}),'done');
 assert.equal(layout.task({status:'done',production_id:'p',production_item:{stage:'edit',idea_approval:'Duyệt',editor_progress:0}}).percent,60);
 assert.equal(layout.group({status:'in_progress',is_edit_task:true,awaiting_assets:true}),'waiting');assert.equal(layout.group({status:'in_progress',is_edit_task:true,production_item:{editor_progress:30}}),'active');
 assert.equal(layout.group({status:'cancelled'}),'cancelled');
});
test('production totals include pending/rejected Ideas; shooting excludes undelivered or edited buckets correctly',()=>{
 const data=initializeData(),h=data.books.main.Employees[0];for(const [id,role,job] of [['1001','leader','Content'],['1002','employee','VJ'],['1003','employee','Editor']])data.books.main.Employees.push(h.map(k=>({telegram_id:id,name:id,department:job,job_title:job,role,active:'true'}[k]||'')));
 const rt=createRuntime(data,{employeeId:'1001'});for(let n=0;n<3;n++)rt.run('createProductionItem',['supabase',{project:'DA - Dự án',title:'Idea '+n,brief:'Nội dung',vj_id:'1002',editor_id:'1003',approver_id:'1001',request_id:'test-layout-idea-000'+n}]);
 rt.run('decideProductionApproval',['supabase','test-layout-idea-0001','idea_approval','Duyệt','']);rt.run('decideProductionApproval',['supabase','test-layout-idea-0002','idea_approval','Không duyệt','Sửa nội dung']);
 const page=rt.run('productionPage',['supabase',{metric:'all'}]);assert.equal(page.total,3);assert.equal(page.stats['DA - Dự án'].total,3);assert.equal(page.stats['DA - Dự án'].shooting,1);
 assert.equal(rt.run('productionPage',['supabase',{metric:'shooting'}]).total,1);assert.equal(rt.run('productionPage',['supabase',{q:'Idea 0'}]).stats['DA - Dự án'].total,1);
});
