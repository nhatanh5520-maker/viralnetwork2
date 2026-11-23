import {test} from 'node:test';import assert from 'node:assert/strict';
import {initializeData,createRuntime} from '../runtime.mjs';

const LC='4001',LM='4002',VJ='4003',ED1='4004',ED2='4005',CAM1='4006',CAM2='4007',EMP='4008',DIR='4009',LO='4010';
function fixture(){
 const d=initializeData(),h=d.books.main.Employees[0];
 for(const [id,name,dept,job,role] of [[LC,'Lan Leader','Content','Leader Content','leader'],[LM,'Minh Leader','Media','Leader Media','leader'],[VJ,'Vy VJ','Content','VJ','employee'],
  [ED1,'Em Editor','Media','Editor','employee'],[ED2,'Hà Editor','Media','Editor','employee'],[CAM1,'Cường Cam','Media','Cam-op quay phim','employee'],[CAM2,'Dũng Cam','Media','Cam-op quay phim','employee'],
  [EMP,'Nhân viên','Media','Editor','employee'],[DIR,'Giám đốc','BGĐ','Giám đốc','director'],[LO,'Oanh Leader','Kinh doanh','Leader Sales','leader']])
  d.books.main.Employees.push(h.map(k=>({telegram_id:id,name,department:dept,job_title:job,role,active:'true'}[k]||'')));
 return d;
}
function app(){
 let data=fixture();
 const as=who=>(method,...args)=>{const rt=createRuntime(data,{employeeId:who},{BOT_TOKEN:'t'});const out=rt.run(method,['supabase',...args]);data=rt.data;return out;};
 as(LC)('createV20Project','VN','Viral');
 const created=as(LC)('createProductionItem',{project:'VN - Viral',title:'Video Content',brief:'Thử',vj_id:VJ,vj_ids:[VJ],editor_id:ED1,editor_ids:[ED1],cam_id:CAM1,approver_id:LC,request_id:'crew-request-000001'});
 return {as,id:String(created.item.id),get data(){return data;}};
}
const item=(a,id)=>{const rows=a.data.books.main.ProductionItems,h=rows[0];return Object.fromEntries(h.map((k,i)=>[k,rows.find(r=>String(r[0])===id)[i]]));};

test('Leader Media changes Cam-op and Editors of a Content task; nothing else changes',()=>{
 const a=app(),before=item(a,a.id);
 assert.equal(before.department,'Content');
 assert.throws(()=>a.as(LM)('assignProduction',a.id,{vj_id:VJ,approver_id:LC,cam_id:CAM2}),/Leader Content|người tạo/,'the full assignment form stays with the Content side');
 const r=a.as(LM)('assignProductionCrew',a.id,{cam_id:CAM2,editor_ids:[ED2,ED1]});
 assert.equal(r.ok,true);assert.equal(String(r.item.cam_id),CAM2);assert.deepEqual([...r.item.editor_ids].map(String),[ED2,ED1]);
 const after=item(a,a.id);
 assert.equal(String(after.cam_id),CAM2);assert.equal(String(after.editor_id),ED2);
 for(const k of ['vj_id','approver_id','title','brief','stage','shoot_at','department','project'])assert.equal(String(after[k]),String(before[k]),k+' unchanged');
 const notes=a.data.books.main.Notifications.slice(1).map(r=>String(r[2]));
 assert.ok(notes.includes(CAM2),'new Cam-op is notified');assert.ok(notes.includes(ED2),'new Editor is notified');
 a.as(LM)('assignProductionCrew',a.id,{cam_id:'',editor_ids:[]});
 assert.equal(String(item(a,a.id).cam_id),'');assert.equal(String(item(a,a.id).editor_id),'');
});

test('only Leader Media or the existing assigners may use the crew change; checks run on the server',()=>{
 const a=app();
 for(const who of [EMP,VJ,LO])assert.throws(()=>a.as(who)('assignProductionCrew',a.id,{cam_id:CAM2}),/Leader Media/,who);
 assert.throws(()=>a.as(DIR)('assignProductionCrew',a.id,{cam_id:CAM2}),/Ban giám đốc/);
 assert.equal(a.as(LC)('assignProductionCrew',a.id,{cam_id:CAM2,editor_ids:[ED1]}).ok,true,'Leader Content keeps their rights');
 assert.throws(()=>a.as(LM)('assignProductionCrew',a.id,{cam_id:VJ}),/không phù hợp vị trí cam/,'roles are still validated');
 assert.throws(()=>a.as(LM)('assignProductionCrew',a.id,{cam_id:'9999'}),/tài khoản/);
 assert.throws(()=>a.as(LM)('assignProductionCrew','missing',{cam_id:CAM2}));
});

test('Leader Media deletes any task; staff of another team cannot',()=>{
 const a=app();
 assert.throws(()=>a.as(EMP)('deleteProductionIdea',a.id,'',true),/Leader|người tạo/);
 assert.throws(()=>a.as(LM)('deleteProductionIdea',a.id,''),/xác nhận/,'Leaders confirm before deleting');
 a.as(LM)('deleteProductionIdea',a.id,'Trùng lịch',true);
 assert.equal(String(item(a,a.id).stage),'deleted');
 assert.throws(()=>a.as(LM)('assignProductionCrew',a.id,{cam_id:CAM2}),/đã xóa|đã bị xóa/i);
});
