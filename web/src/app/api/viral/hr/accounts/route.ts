import {NextResponse} from 'next/server';import crypto from 'node:crypto';
import {loadViral,webMember,sameOrigin,invalidateViralState} from '@/lib/viral';import {hrAccountActor,employeeAccountData,manualAccountInput} from '../../../../../../server/viral/hr-accounts.mjs';
import {unfinishedAccount} from '../../../../../../server/viral/account-cleanup.mjs';
export const runtime='nodejs';export const maxDuration=60;
const reply=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'no-store'}});
async function sendQueuedWelcome(svc:any,eventId:string,telegramId:string,welcome:string,token:string){
 const {data:claim,error}=await svc.from('viral_outbox').update({status:'sending',lease_until:new Date(Date.now()+60000).toISOString(),attempts:1}).eq('id',eventId).eq('status','pending').select('id');
 if(error||!claim?.length)return false;
 try{const result=await fetch(`https://api.telegram.org/bot${token}/sendMessage`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:telegramId,text:welcome,link_preview_options:{is_disabled:true}}),signal:AbortSignal.timeout(10000)}).then(r=>r.json());if(!result.ok)throw Error('Telegram chưa nhận tin.');const {error:e}=await svc.from('viral_outbox').update({status:'sent',lease_until:null,last_error:null}).eq('id',eventId);return !e;}catch{await svc.from('viral_outbox').update({status:'pending',lease_until:null}).eq('id',eventId).eq('status','sending');return false;}
}
export async function POST(req:Request){let createdId:string|null=null,svc:any=null,committed=false,commitAttempted=false,commitRejected=false;try{
 sameOrigin(req);if(process.env.VIRAL_MAINTENANCE==='true')throw Error('Web tạm dừng để chuyển dữ liệu.');const raw=await req.text();if(Buffer.byteLength(raw)>30000)throw Error('Yêu cầu quá lớn.');const body=JSON.parse(raw),initData=String(body.initData||''),user=initData?null:await webMember();
 if(!user&&!initData)return reply({error:'Cần đăng nhập.'},401);
 const state=await loadViral();svc=state.svc;const actor=hrAccountActor(state.data,user,initData,process.env.TELEGRAM_BOT_TOKEN);
 if(body.action==='access')return reply({ok:true});
 if(body.action==='employee-status'){
  const id=String(body.values?.telegram_id||''),active=body.values?.active===true,cells=state.data.books.main.Employees,h=cells[0],row=cells.slice(1).find((r:any)=>String(r[0])===id);
  if(!row)throw Error('Không thấy nhân viên.');if(actor.role!=='director'&&String(row[h.indexOf('role')])!=='employee')throw Error('HR chỉ ngưng/khôi phục nhân viên; quản lý cần Giám đốc.');if(id===actor.id)throw Error('Không thể tự ngưng tài khoản của mình.');if(row[h.indexOf('role')]==='director'&&!active&&!cells.slice(1).some((r:any)=>String(r[0])!==id&&r[h.indexOf('role')]==='director'&&String(r[h.indexOf('active')]).toLowerCase()==='true'))throw Error('Phải giữ Giám đốc đang hoạt động.');
  const next=structuredClone(state.data),r=next.books.main.Employees.find((r:any)=>String(r[0])===id);r[h.indexOf('active')]=active;next.adminAudit??=[];next.adminAudit.push({id:crypto.randomUUID(),at:new Date().toISOString(),actor:actor.id,name:actor.name,action:active?'staff-restore':'staff-deactivate',target:id,reason:'HR quản lý nhân sự',changes:{Employees:{before:[row],after:[r]}}});const {data:saved,error}=await svc.rpc('viral_commit',{expected_version:state.version,new_data:next,events:[]});if(error||!saved)throw Error('Dữ liệu thay đổi. Làm mới và thử lại.');const {error:membershipError}=await svc.from('viral_members').update({active}).eq('employee_id',id);if(membershipError)throw Error('Trạng thái hồ sơ đã lưu; cần kiểm tra trạng thái đăng nhập Supabase.');return reply({ok:true,message:active?'Đã khôi phục nhân viên.':'Đã ngưng nhân viên, khóa quyền vào app; giữ nguyên lịch sử.'});
 }
 if(body.action==='profile-access'){
  const id=String(body.values?.telegram_id||''),cells=state.data.books.main.Employees,h=cells[0],employee=cells.slice(1).find((r:any)=>String(r[0])===id);
  if(!employee)throw Error('Không thấy nhân viên.');if(actor.role!=='director'&&String(employee[h.indexOf('role')])!=='employee')throw Error('HR chỉ cấp đăng nhập cho nhân viên.');
  const {data:member,error:me}=await svc.from('viral_members').select('auth_user_id,active').eq('employee_id',id).maybeSingle();if(me)throw Error('Không kiểm tra được tài khoản.');if(!member)return reply({ok:true,email:'',hasAccount:false});
  const {data:found,error:fe}=await svc.auth.admin.getUserById(member.auth_user_id);if(fe)throw Error('Không đọc được email đăng nhập.');return reply({ok:true,email:found.user?.email||'',hasAccount:true});
 }
 if(body.action==='profile-account'){
  const target=manualAccountInput(state.data,actor,body.values||{}),{data:member,error:me}=await svc.from('viral_members').select('auth_user_id,active').eq('employee_id',target.telegramId).maybeSingle();if(me)throw Error('Không kiểm tra được đăng nhập hiện có.');
  let authId:string,previousEmail='',auditId:string,loginSaved=false;
  if(member){if(!member.active)throw Error('Quyền đăng nhập đang bị khóa. Cần quản trị kiểm tra.');const {data:found,error:fe}=await svc.auth.admin.getUserById(member.auth_user_id);if(fe||!found.user)throw Error('Không đọc được tài khoản hiện có.');authId=member.auth_user_id;previousEmail=found.user.email||'';}
  else authId='';
  const {data:audit,error:ad}=await svc.from('viral_account_audit').insert({actor_telegram_id:actor.id,target_telegram_id:target.telegramId,auth_user_id:authId||null,email_before:previousEmail,email_after:target.email,operation:member?'update-login':'create-login'}).select('id').single();if(ad)throw Error('Chạy lại supabase/viral-hr-accounts.sql của bản ZIP mới trước khi cấp đăng nhập.');auditId=audit.id;
  try{
   if(member){const {error:ue}=await svc.auth.admin.updateUserById(authId,{email:target.email,password:target.password,email_confirm:true});if(ue)throw Error('Không cập nhật được đăng nhập. Email có thể đã thuộc tài khoản khác hoặc mật khẩu không đạt chính sách.');loginSaved=true;}
   else {
    const prepared=employeeAccountData(state.data,actor,{email:target.email,telegram_id:target.telegramId,name:target.employee.name,department:target.employee.department,job_title:target.employee.job_title||'Nhân viên',employee_code:target.employee.employee_code});
    const {data:auth,error:ae}=await svc.auth.admin.createUser({email:target.email,password:target.password,email_confirm:true});if(ae||!auth.user)throw Error('Không tạo được đăng nhập. Email có thể đã được sử dụng hoặc mật khẩu không đạt chính sách.');authId=String(auth.user.id);createdId=authId;
    const base=process.env.VIRAL_WEB_URL||new URL(req.url).origin,welcome='👋 '+target.employee.name+' đã được HR cấp đăng nhập Viral Network.\nEmail: '+target.email+'\nMở web: '+base+'\nMật khẩu được HR bàn giao riêng. Thông báo công việc vẫn gửi vào Telegram này.';
    commitAttempted=true;const {data:saved,error:ce}=await svc.rpc('viral_hr_create_account',{expected_version:state.version,new_data:prepared.data,auth_user:authId,employee:target.telegramId,welcome});if(!ce&&saved===false)commitRejected=true;if(ce||!saved)throw Error('Dữ liệu vừa thay đổi hoặc chưa cài hàm HR. Kiểm tra SQL và thử lại.');committed=true;loginSaved=true;
   }
   const {error:logError}=await svc.from('viral_account_audit').update({status:'done',auth_user_id:authId}).eq('id',auditId);
   let eventId=member?'':'account-welcome:'+authId;
   if(member){const {data:event,error:qe}=await svc.rpc('viral_hr_resend_link',{account_id:authId,telegram_id:target.telegramId,welcome:'🔐 HR đã cập nhật email/mật khẩu đăng nhập Viral Network.\nEmail: '+target.email+'\nMật khẩu được HR bàn giao riêng; không gửi trong tin Telegram.'});if(!qe)eventId=event;}
   const token=process.env.TELEGRAM_BOT_TOKEN;let sent=false;if(token&&eventId){const {data:event}=await svc.from('viral_outbox').select('body').eq('id',eventId).single();if(event)sent=await sendQueuedWelcome(svc,eventId,target.telegramId,event.body,token);}
   return reply({ok:true,hasAccount:true,email:target.email,message:'Đã lưu email và mật khẩu. Nhân viên có thể đăng nhập ngay bằng email này.'+(sent?' Đã gửi thông báo Telegram.':' Thông báo Telegram cần kiểm tra hàng đợi/bot.')+(logError?' Nhật ký đang cần kiểm tra.':'')});
  }catch(e){await svc.from('viral_account_audit').update({status:loginSaved?'login-saved-followup-error':'failed',auth_user_id:authId||null}).eq('id',auditId);if(loginSaved)return reply({ok:true,email:target.email,message:'Đăng nhập đã được lưu; thông báo hoặc nhật ký cần quản trị kiểm tra.'});throw e;}
 }
 const base=process.env.VIRAL_WEB_URL;if(!base||!/^https:\/\//.test(base))throw Error('Cần cấu hình VIRAL_WEB_URL là domain HTTPS của web.');
 const token=process.env.TELEGRAM_BOT_TOKEN;if(!token)throw Error('Chưa cấu hình bot Telegram.');
 if(body.action==='resend'){
  const telegramId=String(body.values?.telegram_id||''),email=String(body.values?.email||'').trim().toLowerCase();
  const cells=state.data.books.main.Employees,h=cells[0],row=cells.slice(1).find((r:any)=>String(r[0])===telegramId);
  if(!row||String(row[h.indexOf('active')]).toLowerCase()!=='true')throw Error('Không thấy nhân viên đang hoạt động.');
  if(actor.role!=='director'&&String(row[h.indexOf('role')])!=='employee')throw Error('HR chỉ gửi lại link cho tài khoản nhân viên.');
  const {data:member,error:me}=await svc.from('viral_members').select('auth_user_id').eq('employee_id',telegramId).eq('active',true).single();if(me||!member)throw Error('Nhân viên chưa có tài khoản web.');
  const {data:found,error:fe}=await svc.auth.admin.getUserById(member.auth_user_id);if(fe||!found.user||found.user.email?.toLowerCase()!==email)throw Error('Email không khớp tài khoản của Telegram ID này.');
  const {data:link,error:le}=await svc.auth.admin.generateLink({type:'recovery',email});if(le||!link.properties?.hashed_token)throw Error('Không tạo được link đặt mật khẩu mới.');
  const url=base.replace(/\/$/,'')+'/auth/set-password#token_hash='+encodeURIComponent(link.properties.hashed_token),welcome='🔐 HR gửi lại link đặt mật khẩu Viral Network.\nEmail: '+email+'\n'+url+'\nLink chỉ dùng một lần. Không chia sẻ cho người khác.';
  const {data:eventId,error:qe}=await svc.rpc('viral_hr_resend_link',{account_id:member.auth_user_id,telegram_id:telegramId,welcome});if(qe)throw Error('Chưa lưu được tin. Chạy viral-hr-accounts.sql.');
  const sent=await sendQueuedWelcome(svc,eventId,telegramId,welcome,token);
  return reply({ok:true,message:sent?'Đã gửi lại link đặt mật khẩu qua Telegram.':'Link mới đang chờ gửi Telegram; kiểm tra bộ gửi mỗi phút.'});
 }
 const prepared=employeeAccountData(state.data,actor,body.values||{});
 const {data:member,error:me}=await svc.from('viral_members').select('auth_user_id').eq('employee_id',prepared.telegramId).maybeSingle();if(me)throw Error('Không kiểm tra được tài khoản hiện có.');if(member)throw Error('Telegram ID đã có tài khoản web. Không tạo trùng.');
 // Employee must Start the bot first; getChat verifies bot can resolve the chat.
 const chat=await fetch(`https://api.telegram.org/bot${token}/getChat`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:prepared.telegramId}),signal:AbortSignal.timeout(10000)}).then(r=>r.json());if(!chat.ok)throw Error('Bot chưa nhận biết Telegram ID. Nhân viên cần mở bot và bấm Start trước.');
 const {data:auth,error:ae}=await svc.auth.admin.createUser({email:prepared.email,password:crypto.randomBytes(32).toString('base64url'),email_confirm:true});if(ae||!auth.user)throw Error('Không tạo được tài khoản: email có thể đã được sử dụng.');createdId=auth.user.id;
 const {data:link,error:le}=await svc.auth.admin.generateLink({type:'recovery',email:prepared.email});if(le||!link.properties?.hashed_token)throw Error('Không tạo được đường dẫn đặt mật khẩu.');
 const url=base.replace(/\/$/,'')+'/auth/set-password#token_hash='+encodeURIComponent(link.properties.hashed_token);
 const welcome='👋 Chào '+prepared.name+'!\nHR đã cấp tài khoản Viral Network.\nEmail đăng nhập: '+prepared.email+'\nĐặt mật khẩu của bạn: '+url+'\nSau đó mở web: '+base+'\nLink chỉ dùng một lần; không chia sẻ cho người khác. Nếu hết hạn, liên hệ HR.\nThông báo công việc vẫn nhận tại Telegram này.';
 commitAttempted=true;const {data:saved,error:ce}=await svc.rpc('viral_hr_create_account',{expected_version:state.version,new_data:prepared.data,auth_user:createdId,employee:prepared.telegramId,welcome});if(!ce&&saved===false)commitRejected=true;if(ce||!saved)throw Error('Chưa lưu được tài khoản. Chạy viral-hr-accounts.sql; nếu dữ liệu thay đổi hãy thử lại.');committed=true;
 // Try immediately; durable outbox retains retries for the minute scheduler.
 const sent=await sendQueuedWelcome(svc,'account-welcome:'+createdId,prepared.telegramId,welcome,token);
 return reply({ok:true,employee:prepared.telegramId,telegramSent:sent,message:sent?'Đã tạo tài khoản và gửi hướng dẫn đặt mật khẩu qua Telegram.':'Đã tạo tài khoản. Tin Telegram đang chờ gửi; kiểm tra bot và bộ gửi mỗi phút.'});
 }catch(e){if(createdId&&svc&&!committed){
 const outcome=await unfinishedAccount({
  lookup:()=>svc.from('viral_members').select('auth_user_id').eq('auth_user_id',createdId).maybeSingle(),
  remove:()=>svc.auth.admin.deleteUser(createdId),mayHaveCommitted:commitAttempted&&!commitRejected
 });
 if(outcome==='linked')return reply({ok:true,message:'Tài khoản đã được lưu. Kiểm tra tin Telegram; nếu chưa nhận, HR dùng Gửi lại link đặt mật khẩu.'});
 if(outcome==='uncertain')return reply({error:'Chưa xác nhận được trạng thái tài khoản; giữ đăng nhập để đối chiếu. Quản trị cần kiểm tra Supabase trước khi tạo lại.'},409);
 if(outcome==='cleanup_failed')return reply({error:'Cấp tài khoản chưa hoàn tất; cần quản trị kiểm tra email mới trong Supabase Auth trước khi thử lại.'},409);
 }return reply({error:e instanceof Error?e.message:'Không tạo được tài khoản.'},400);}finally{invalidateViralState();}}
