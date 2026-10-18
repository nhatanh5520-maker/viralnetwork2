import test from 'node:test';import assert from 'node:assert/strict';
import {withIdeaApprovalRetry,ViralVersionConflict} from '../approval-retry.mjs';
import {initializeData,createRuntime} from '../runtime.mjs';
function fixture(){const data=initializeData(),h=data.books.main.Employees[0];for(const [id,role,job] of [['1001','leader','Content'],['1002','employee','Editor'],['1004','employee','VJ'],['1005','leader','Content']])data.books.main.Employees.push(h.map(k=>({telegram_id:id,name:'Người '+id,department:job,job_title:job,role,active:'true'}[k]||'')));const rt=createRuntime(data,{employeeId:'1001'});rt.run('createProductionItem',['supabase',{project:'DA002 - Đà Nẵng Daily',title:'Idea test',brief:'Quay thử',vj_id:'1004',editor_id:'1002',approver_id:'1001',request_id:'approval-retry-test-123456'}]);return rt.data;}
const args=['supabase','approval-retry-test-123456','idea_approval','Duyệt',''];
test('a scheduler version rejection reloads latest data and commits exactly one approval with its notifications',async()=>{
 let current=fixture(),calls=0,commits=0;
 const result=await withIdeaApprovalRetry('decideProductionApproval',async()=>{
  const rt=createRuntime(current,{employeeId:'1001'}),result=rt.run('decideProductionApproval',args);calls++;
  if(calls===1){current.schedulerMarker='keep concurrent scheduler change';throw new ViralVersionConflict();}
  current=rt.data;commits++;return result;
 });
 assert.equal(result.item.idea_approval,'Duyệt');assert.equal(current.schedulerMarker,'keep concurrent scheduler change');assert.equal(calls,2);assert.equal(commits,1);
 const once=createRuntime(fixture(),{employeeId:'1001'});once.run('decideProductionApproval',args);
 assert.equal(current.books.main.Notifications.length,once.data.books.main.Notifications.length);
});
test('a changed approver is revalidated instead of overwriting concurrent changes',async()=>{
 const current=fixture();let calls=0;
 await assert.rejects(withIdeaApprovalRetry('decideProductionApproval',async()=>{
  calls++;const rt=createRuntime(current,{employeeId:'1001'});rt.run('decideProductionApproval',args);
  const t=current.books.main.ProductionItems;t[1][t[0].indexOf('approver_id')]='1005';throw new ViralVersionConflict();
 }),/Leader được phân công/);assert.equal(calls,2);
});
test('an approval already committed by another request stops without duplicate notifications',async()=>{
 let current=fixture(),calls=0;
 await assert.rejects(withIdeaApprovalRetry('decideProductionApproval',async()=>{
  calls++;const rt=createRuntime(current,{employeeId:'1001'});rt.run('decideProductionApproval',args);
  current=rt.data;throw new ViralVersionConflict();
 }),/chưa ở bước chờ duyệt/);assert.equal(calls,2);
});
test('network, database and business errors are never automatically retried',async()=>{
 for(const error of [Error('network timeout'),Error('database error'),Error('Không có quyền')]){let calls=0;await assert.rejects(withIdeaApprovalRetry('decideProductionApproval',async()=>{calls++;throw error;}),e=>e===error);assert.equal(calls,1);}
});
test('retry is bounded and does not broaden to other mutations',async()=>{
 for(const [method,expected] of [['decideProductionApproval',3],['createProductionItem',1]]){let calls=0;await assert.rejects(withIdeaApprovalRetry(method,async()=>{calls++;throw new ViralVersionConflict();}),ViralVersionConflict);assert.equal(calls,expected);}
});
