import {NextResponse} from 'next/server';import crypto from 'node:crypto';import {loadViral,webMember,sameOrigin,invalidateViralState} from '@/lib/viral';import {hrAccountActor} from '../../../../../server/viral/hr-accounts.mjs';import {readStaffRoster,previewStaffProfiles,applyStaffProfiles} from '../../../../../server/viral/staff-roster.mjs';
import {createClient} from '@/lib/supabase/server';
import {refreshStaffOperatorSession} from '../../../../../server/viral/staff-session.mjs';
import {applyStaffRoster} from '../../../../../server/viral/staff-apply.mjs';
export const runtime='nodejs';export const maxDuration=60;
const reply=(x:unknown,status=200)=>NextResponse.json(x,{status,headers:{'Cache-Control':'no-store'}});
async function director(){const user=await webMember();if(!user)throw Error('Cần đăng nhập web.');const state=await loadViral(),actor=hrAccountActor(state.data,user,'',process.env.TELEGRAM_BOT_TOKEN);if(actor.role!=='director')throw Error('Chỉ Giám đốc được nhập bảng nhân sự.');return {user,actor,...state};}
export async function POST(req:Request){try{
 sameOrigin(req);const {user,actor,svc,data:current,version}=await director(),form=await req.formData(),action=String(form.get('action')),file=form.get('file');
 if(!(file instanceof File)||file.size>5*1024*1024)throw Error('Chọn Excel nhân sự dưới 5 MB.');const profilesOnly=form.get('mode')==='profiles',roster=await readStaffRoster(Buffer.from(await file.arrayBuffer()),{profilesOnly});
 if(profilesOnly){
  const preview=previewStaffProfiles(current,roster.people,actor.id);
  if(action==='preview')return reply({ok:true,people:roster.people,preview,sha256:roster.sha256,email:user.email,version});
  if(action!=='profiles'||String(form.get('confirm'))!=='CAP NHAT HO SO')throw Error('Nhập CAP NHAT HO SO để cập nhật hồ sơ.');
  if(Number(form.get('mainVersion'))!==version)throw Error('Dữ liệu đã thay đổi. Chọn lại file để xem đối chiếu mới nhất.');
  const result=applyStaffProfiles(current,roster.people,actor.id);
  if(result.preview.changes.length){const {data:saved,error}=await svc.from('viral_state').update({data:result.data,version:version+1}).eq('id','main').eq('version',version).select('id');if(error)throw Error('Chưa xác nhận được cập nhật hồ sơ. Tải lại trang để kiểm tra trước khi thử lại.');if(!saved?.length)throw Error('Dữ liệu vừa thay đổi. Chọn lại file để xem đối chiếu.');}
  return reply({ok:true,preview:result.preview});
 }

 if(action==='preview')return reply({ok:true,people:roster.people,sha256:roster.sha256,email:user.email});
 if(action==='prepare'){
  const own=roster.people.find((p:any)=>p.telegram_id===String(form.get('adminTelegramId'))&&p.role==='director'&&p.active);if(!own)throw Error('Chọn đúng nhân viên Giám đốc ứng với tài khoản bạn đang đăng nhập.');
  const id=crypto.randomUUID(),data={status:'prepared',source:roster.sha256,people:roster.people,operator:user.authUserId,adminTelegramId:own.telegram_id,accounts:{}};
  const {error}=await svc.from('viral_staff_imports').insert({id,data});if(error)throw Error('Chạy viral-staff-sync.sql và viral-migration.sql trước.');return reply({ok:true,id,version:0});
 }
 const {data:st,error}=await svc.from('viral_staff_imports').select('*').eq('id',String(form.get('stageId'))).single();if(error||!st||st.data.status!=='prepared'||st.data.source!==roster.sha256||st.data.operator!==user.authUserId)throw Error('Bản nhân sự không khớp lượt đang nhập.');
 if(action==='account'){
  const index=Number(form.get('index')),credential=roster.credentials[index];if(!credential)throw Error('Nhân viên không hợp lệ.');let authId=st.data.accounts[credential.telegramId];
  if(!authId){if(credential.telegramId===st.data.adminTelegramId)authId=user.authUserId;else{for(let page=1;page<=100;page++){const {data,error:le}=await svc.auth.admin.listUsers({page,perPage:100});if(le)throw Error('Không kiểm tra được email hiện có.');const match=data.users.find((u:any)=>u.email?.toLowerCase()===credential.email);if(match){authId=match.id;break;}if(data.users.length<100)break;}}}
  if(authId){
   const {data:before,error:be}=await svc.auth.admin.getUserById(authId);if(be)throw Error('Không đọc được tài khoản trước khi cấp đăng nhập.');
   if(before.user?.email!==credential.email){const {error:ad}=await svc.from('viral_account_audit').insert({actor_telegram_id:actor.id,target_telegram_id:credential.telegramId,auth_user_id:authId,email_before:before.user?.email||'',email_after:credential.email,operation:'staff-email'});if(ad)throw Error('Chạy viral-hr-accounts.sql trước khi đổi email theo Excel.');}
   const {error:ue}=await svc.auth.admin.updateUserById(authId,{email:credential.email,password:credential.password,email_confirm:true});if(ue)throw Error('Không cấp được đăng nhập cho '+credential.email+'. Kiểm tra email và chính sách mật khẩu Supabase.');}
  else{const {data,error:ae}=await svc.auth.admin.createUser({email:credential.email,password:credential.password,email_confirm:true});if(ae||!data.user)throw Error('Không tạo được đăng nhập cho '+credential.email);authId=data.user.id;}
  st.data.accounts[credential.telegramId]=authId;const {data:saved,error:se}=await svc.from('viral_staff_imports').update({data:st.data,version:st.version+1}).eq('id',st.id).eq('version',st.version).select('id');
  // Refresh even when staging fails: Auth has already changed at this point.
  if(authId===user.authUserId)await refreshStaffOperatorSession(await createClient(),credential,user.authUserId);
  if(se||!saved?.length)throw Error('Trạng thái thay đổi. Dùng cùng file để kiểm tra lại.');return reply({ok:true,id:st.id,version:st.version+1});
 }
 if(action==='apply'){
  if(String(form.get('confirm'))!=='DONG BO NHAN SU')throw Error('Cần xác nhận đồng bộ nhân sự.');
  const mappings=roster.people.map((p:any)=>({authUserId:st.data.accounts[p.telegram_id],employeeId:p.telegram_id,active:p.active}));if(mappings.some((m:any)=>!m.authUserId)||new Set(mappings.map((m:any)=>m.authUserId)).size!==mappings.length)throw Error('Chưa cấp đủ tài khoản hoặc có liên kết bị trùng.');
  const backupId=await applyStaffRoster({initial:{svc,data:current,version},stage:st,people:roster.people,mappings,reload:async()=>{
    const fresh=await director();if(fresh.user.authUserId!==st.data.operator)throw Error('Phiên người nhập đã thay đổi.');return fresh;
  }});return reply({ok:true,backupId});
 }
 throw Error('Thao tác không hợp lệ.');
 }catch(e){return reply({error:e instanceof Error?e.message:'Chưa đồng bộ được nhân sự.'},400);}finally{invalidateViralState();}}
