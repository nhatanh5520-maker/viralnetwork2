import vm from 'node:vm';
import crypto from 'node:crypto';
import {createRuntime} from './runtime.mjs';
export const GPS_KEYS=['office_name','office_lat','office_lng','radius_m','start_time','end_time','lunch_start','lunch_end'];
export function adminActor(data,user,emails=''){
 if(!user?.email||!emails.split(',').map(s=>s.trim().toLowerCase()).filter(Boolean).includes(user.email.toLowerCase()))throw Error('Bạn chưa được cấp quyền quản trị.');
 const rt=createRuntime(data,user);rt.context.__input='supabase';const actor=vm.runInContext('auth_(__input)',rt.context,{timeout:5000});
 if(actor.role!=='director')throw Error('Quản trị viên cần tài khoản Ban giám đốc.');return actor;
}
const asRows=cells=>{const [h=[],...rows]=cells||[];return rows.map(r=>Object.fromEntries(h.map((k,i)=>[k,r[i]??''])))};
export function adminSnapshot(data,actor,version){
 const rt=createRuntime(data,{employeeId:actor.id});
 const employees=asRows(data.books.main.Employees).map(p=>({telegram_id:String(p.telegram_id),name:String(p.name),department:String(p.department),job_title:String(p.job_title||''),role:String(p.role),active:String(p.active)}));
 const cells=data.books.main.ProductionItems||[];
 const items=rt.run('withProductionTeam_',[asRows(cells)],true);
 return {ok:true,version,actor,headers:cells[0]||[],items,employees,projects:asRows(data.books.main.Projects),settings:Object.fromEntries((data.books.main.Settings||[]).filter(r=>GPS_KEYS.includes(r[0]))),finance:{sheetId:data.webFinance?.sheetId||process.env.FINANCE_SHEET_ID||'',sheetName:data.webFinance?.sheetName||process.env.FINANCE_SHEET_NAME||'Trang tính1'},audit:(data.adminAudit||[]).slice(-100).reverse().map(({changes,...rest})=>({...rest,changedTables:Object.keys(changes||{})}))};
}
export function validateGPS(input){
 const out={};for(const k of GPS_KEYS)out[k]=String(input[k]??'').trim();
 const lat=Number(out.office_lat),lng=Number(out.office_lng),radius=Number(out.radius_m);
 if(!out.office_name||out.office_name.length>120||!out.office_lat||!out.office_lng||!Number.isFinite(lat)||Math.abs(lat)>90||!Number.isFinite(lng)||Math.abs(lng)>180)throw Error('Tên địa điểm và tọa độ không hợp lệ.');
 if(!Number.isFinite(radius)||radius<10||radius>1000)throw Error('Bán kính cần nằm trong khoảng 10–1.000 mét.');
 for(const k of ['start_time','end_time','lunch_start','lunch_end'])if(!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(out[k]))throw Error('Giờ cần có dạng HH:mm.');
 if(!(out.start_time<out.lunch_start&&out.lunch_start<out.lunch_end&&out.lunch_end<out.end_time))throw Error('Giờ ca và giờ nghỉ trưa chưa đúng thứ tự.');return out;
}
export function financeConfig(input){
 const text=String(input.sheetId||'').trim(),id=/^https:\/\/docs\.google\.com\/spreadsheets\/d\/([\w-]+)/.exec(text)?.[1]||text,name=String(input.sheetName||'').trim();
 if(!/^[\w-]{20,150}$/.test(id)||!name||name.length>100)throw Error('Nhập URL/ID Google Sheets và tên tab chính xác.');return {sheetId:id,sheetName:name};
}
export function adminChange(input,user,emails,body){
 const actor=adminActor(input,user,emails),reason=String(body.reason||'').trim();if(reason.length<3||reason.length>500)throw Error('Nhập lý do thay đổi (3–500 ký tự).');
 const rt=createRuntime(input,user);let result={ok:true};
 if(body.action==='gps'){
  const values=validateGPS(body.values||{}),settings=rt.data.books.main.Settings;
  for(const [k,v] of Object.entries(values)){const row=settings.find(r=>r[0]===k);if(row)row[1]=v;else settings.push([k,v]);}
 }else if(body.action==='finance-config'){rt.data.webFinance=financeConfig(body.values||{});}
 else if(['idea','assign','delete','restore'].includes(body.action)){
  // This elevation exists ONLY inside the separately authenticated admin request.
  // Employee / Telegram RPC runtimes retain the original director read-only rule.
  vm.runInContext('productionWritable_=function(){};',rt.context,{timeout:5000});
  const id=String(body.id||'');if(!id||id.length>150)throw Error('Mã Idea không hợp lệ.');
  if(body.action==='idea')result=rt.run('updateProductionIdea',['supabase',id,String(body.values?.title||''),String(body.values?.brief||''),crypto.randomUUID()]);
  if(body.action==='assign')result=rt.run('assignProduction',['supabase',id,body.values]);
  if(['delete','restore'].includes(body.action))vm.runInContext('ideaDeleteAllowed_=function(){return true;};',rt.context,{timeout:5000});
  if(body.action==='delete'){
   const item=asRows(rt.data.books.main.ProductionItems).find(x=>String(x.id)===id);
   if(!item||item.stage!=='brief'||item.idea_approval==='Duyệt')throw Error('Admin chỉ đưa Idea chưa duyệt vào thùng rác.');
   result=rt.run('deleteProductionIdea',['supabase',id,reason]);
  }
  if(body.action==='restore')result=rt.run('restoreProductionIdea',['supabase',id]);
  // Business methods surface partial side-effects as warnings. Admin aborts the
  // entire local transaction so partially synchronized tasks are never committed.
  if(result.warning)throw Error(result.warning+' Chưa lưu thay đổi admin; kiểm tra rồi thử lại.');
 }else throw Error('Thao tác quản trị không hợp lệ.');
 const changes={};for(const k of new Set([...Object.keys(input.books.main),...Object.keys(rt.data.books.main)]))if(JSON.stringify(input.books.main[k])!==JSON.stringify(rt.data.books.main[k])){
  const before=input.books.main[k]||[],after=rt.data.books.main[k]||[];
  if(JSON.stringify(before[0])!==JSON.stringify(after[0]))changes[k]={before,after};
  else {const prior=new Map(before.slice(1).map(r=>[String(r[0]),r])),next=new Map(after.slice(1).map(r=>[String(r[0]),r])),ids=[...new Set([...prior.keys(),...next.keys()])].filter(id=>JSON.stringify(prior.get(id))!==JSON.stringify(next.get(id)));changes[k]={headers:before[0]||[],before:ids.map(id=>prior.get(id)).filter(Boolean),after:ids.map(id=>next.get(id)).filter(Boolean)};}
 }
 if(JSON.stringify(input.webFinance)!==JSON.stringify(rt.data.webFinance))changes.FinanceConnection={before:input.webFinance||{},after:rt.data.webFinance};
 if(Object.keys(changes).length){rt.data.adminAudit??=[];rt.data.adminAudit.push({id:crypto.randomUUID(),at:new Date().toISOString(),actor:actor.id,name:actor.name,action:body.action,target:body.id||'',reason,changes});}
 return {data:rt.data,result};
}
export function adminBackup(data){return {exportedAt:new Date().toISOString(),tables:Object.fromEntries(['ProductionItems','ProductionTeam','ProductionApprovers','ProductionTaskLinks','ProductionIdeaHistory','Tasks','Projects','Settings'].filter(k=>data.books.main[k]).map(k=>[k,k==='Settings'?data.books.main[k].filter((r,i)=>i===0||GPS_KEYS.includes(r[0])):data.books.main[k]])),audit:data.adminAudit||[]};}
