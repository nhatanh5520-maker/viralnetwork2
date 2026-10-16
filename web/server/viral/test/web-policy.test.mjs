import test from 'node:test';import assert from 'node:assert/strict';
import {initializeData,createRuntime} from '../runtime.mjs';
import {retainProjectImages,projectImageFile} from '../project-images.mjs';
function fixture(){const d=initializeData(),h=d.books.main.Employees[0];for(const [id,role,job] of [['1001','leader','Content'],['1002','employee','Editor'],['1003','director','BGĐ'],['1004','employee','VJ'],['1005','leader','Content'],['1006','employee','Editor']])d.books.main.Employees.push(h.map(k=>({telegram_id:id,name:'Người '+id,department:job,job_title:job,role,active:'true'}[k]||'')));return d;}
const idea={project:'DA002 - Đà Nẵng Daily',title:'Video cá nhân',brief:'Quay thử',vj_id:'1004',editor_id:'1002',approver_id:'1001',vj_ids:['1004'],editor_ids:['1002'],request_id:'web-policy-test-123456'};
const image={name:'logo.png',type:'image/png',base64:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII='};
test('only the selected active Leader can approve Idea; VJ and Director cannot be selected',()=>{
 const rt=createRuntime(fixture(),{employeeId:'1001'});
 for(const approver_id of ['1004','1003'])assert.throws(()=>rt.run('createProductionItem',['supabase',{...idea,approver_id}]),/Leader/);
 rt.run('createProductionItem',['supabase',{...idea}]);
 assert.throws(()=>createRuntime(rt.data,{employeeId:'1005'}).run('decideProductionApproval',['supabase',idea.request_id,'idea_approval','Duyệt','']),/Leader được phân công/);
 assert.equal(rt.run('decideProductionApproval',['supabase',idea.request_id,'idea_approval','Duyệt','']).item.idea_approval,'Duyệt');
});
test('personal tasks include selected people but do not spread to other staff or same-department Leaders',()=>{
 const rt=createRuntime(fixture(),{employeeId:'1001'});rt.run('createProductionItem',['supabase',{...idea}]);
 for(const id of ['1001','1002','1004'])assert.ok(createRuntime(rt.data,{employeeId:id}).run('snapshotHome',['supabase']).tasks.some(t=>t.title.includes(idea.title)));
 for(const id of ['1003','1005','1006']){const other=createRuntime(rt.data,{employeeId:id});assert.equal(other.run('snapshotHome',['supabase']).tasks.length,0);assert.equal(other.run('reviewQueue',['supabase','team']).length,0);}
 const table=rt.data.books.main.ProductionItems,header=table[0];table[1][header.indexOf('editor_id')]='1006';
 const team=rt.data.books.main.ProductionTeam,th=team[0];for(const row of team.slice(1))if(String(row[th.indexOf('telegram_id')])==='1002')row[th.indexOf('active')]=false;
 assert.equal(createRuntime(rt.data,{employeeId:'1002'}).run('snapshotHome',['supabase']).tasks.length,0);
});
test('Leader and Director can create and update project images; employees and fake image bytes are rejected',()=>{
 let data=fixture();for(const [who,code] of [['1001','DA002'],['1003','DA003']]){const rt=createRuntime(data,{employeeId:who});const result=rt.run('createV20Project',['supabase',code,'Dự án '+code,image]);assert.match(result.projectAvatars[code],/^\/api\/viral\/project-image/);assert.equal(rt.uploads.length,1);data=rt.data;}
 const director=createRuntime(data,{employeeId:'1003'});director.run('saveProjectAvatar',['supabase','DA002',image]);assert.equal(director.uploads.length,1);
 const staff=createRuntime(data,{employeeId:'1004'});assert.throws(()=>staff.run('createV20Project',['supabase','OTHER','Tên',image]),/Leader/);assert.throws(()=>staff.run('saveProjectAvatar',['supabase','DA002',image]),/Leader/);
 assert.throws(()=>director.run('saveProjectAvatar',['supabase','DA002',{...image,base64:Buffer.from('<html>fake image</html>').toString('base64')}]),/không hợp lệ/);
 const id=Object.keys(data.files)[0];assert.ok(projectImageFile(data,{employeeId:'1004'},id));assert.equal(projectImageFile(data,{employeeId:'not-an-employee'},id),null);data.files.bill={folder:'bills'};assert.equal(projectImageFile(data,{employeeId:'1004'},'bill'),null);delete data.files.bill;
 const migrated=initializeData();retainProjectImages(migrated,data);assert.equal(migrated.books.main.Projects.length,3);assert.equal(Object.keys(migrated.files).length,2);
});

test('Leader deletion requires confirmation, keeps a snapshot and appears in admin history',async()=>{
 const {adminSnapshot}=await import('../admin.mjs');const rt=createRuntime(fixture(),{employeeId:'1001'});rt.run('createProductionItem',['supabase',{...idea}]);
 assert.throws(()=>rt.run('deleteProductionIdea',['supabase',idea.request_id,'Hủy nội dung']),/xác nhận/);
 assert.ok(rt.run('snapshotHome',['supabase']).tasks.length>0);
 rt.run('decideProductionApproval',['supabase',idea.request_id,'idea_approval','Duyệt','']);
 rt.run('deleteProductionIdea',['supabase',idea.request_id,'Hủy nội dung',true]);assert.equal(rt.run('snapshotHome',['supabase']).tasks.length,0);
 const report=adminSnapshot(rt.data,{id:'1003'},1),event=report.audit.find(x=>x.target===idea.request_id&&x.action==='Xóa task');assert.ok(event);assert.equal(event.actor,'1001');assert.equal(event.reason,'Hủy nội dung');assert.equal(event.snapshot.item.title,idea.title);assert.equal(event.snapshot.item.idea_approval,'Duyệt');assert.ok(event.snapshot.tasks.length);
 rt.run('deleteProductionIdea',['supabase',idea.request_id,'Hủy lại',true]);assert.equal(adminSnapshot(rt.data,{id:'1003'},2).audit.filter(x=>x.action==='Xóa task').length,1);
 rt.run('restoreProductionIdea',['supabase',idea.request_id]);assert.ok(adminSnapshot(rt.data,{id:'1003'},3).audit.some(x=>x.action==='Khôi phục task'));
});
