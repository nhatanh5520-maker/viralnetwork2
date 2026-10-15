import {retainProjectImages} from '../../../../../server/viral/project-images.mjs';
import {NextResponse} from 'next/server';import crypto from 'node:crypto';import {JWT} from 'google-auth-library';
import {webMember,loadViral,sameOrigin} from '@/lib/viral';import {adminActor} from '../../../../../server/viral/admin.mjs';
import {prepareMigration,migrationPublic,copyDriveBill,rewriteBillURLs} from '../../../../../server/viral/migration.mjs';
export const runtime='nodejs';export const maxDuration=60;
const reply=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'no-store'}});
async function authorized(){const user=await webMember();if(!user)throw Error('Cần đăng nhập.');const state=await loadViral();const actor=adminActor(state.data,user,process.env.VIRAL_ADMIN_EMAILS||'');return {user,actor,...state};}
async function accounts(svc:any){const {data:members,error}=await svc.from('viral_members').select('*');if(error)throw error;const all:any[]=[];for(let page=1;page<=100;page++){const {data,error:e}=await svc.auth.admin.listUsers({page,perPage:100});if(e)throw e;all.push(...data.users);if(data.users.length<100)break;}return (members||[]).map((m:any)=>({...m,email:all.find(u=>u.id===m.auth_user_id)?.email||''}));}
export async function GET(){try{const {svc,version}=await authorized();const {data:stages,error}=await svc.from('viral_migration_stages').select('id,data,version').order('created_at',{ascending:false}).limit(1);if(error)throw Error('Chạy supabase/viral-migration.sql trước.');const {data:backups,error:be}=await svc.from('viral_migration_backups').select('id,created_at,source_stage').order('created_at',{ascending:false}).limit(10);if(be)throw be;return reply({stage:stages?.[0]?migrationPublic(stages[0]):null,accounts:await accounts(svc),backups,mainVersion:version,maintenance:process.env.VIRAL_MAINTENANCE==='true',googleEmail:process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL||''});}catch(e){return reply({error:e instanceof Error?e.message:'Không tải được chuyển dữ liệu.'},403);}}
export async function POST(req:Request){try{
 sameOrigin(req);const {user,actor,svc,data:current,version}=await authorized();const raw=await req.text();if(Buffer.byteLength(raw)>12*1024*1024)return reply({error:'Tệp dữ liệu vượt 12 MB.'},413);const body=JSON.parse(raw);
 if(body.action==='prepare'){
  const data=prepareMigration(body.bundle,current),id=crypto.randomUUID();const {error}=await svc.from('viral_migration_stages').insert({id,data});if(error)throw Error('Chưa tạo được dữ liệu nhập thử. Kiểm tra viral-migration.sql.');return reply({ok:true,id});
 }
 if(body.action==='rollback'){
  if(process.env.VIRAL_MAINTENANCE!=='true'||body.confirm!=='KHOI PHUC BAN SAO')throw Error('Cần bật bảo trì và xác nhận khôi phục.');
  if(body.mainVersion!==version)throw Error('Dữ liệu thay đổi. Làm mới trước khi khôi phục.');
  const {error}=await svc.rpc('viral_rollback_migration',{backup_id:body.backupId,main_version:version});if(error)throw Error('Không khôi phục được. Dữ liệu có thể vừa thay đổi.');return reply({ok:true});
 }
 const {data:stage,error}=await svc.from('viral_migration_stages').select('*').eq('id',String(body.stageId)).single();if(error||!stage)throw Error('Không thấy dữ liệu nhập thử.');
 if(stage.version!==body.stageVersion||stage.data.status!=='prepared')throw Error('Dữ liệu nhập thử thay đổi hoặc đã kích hoạt. Làm mới.');
 if(body.action==='copy'){
  const file=stage.data.files.find((f:any)=>f.status==='pending')||stage.data.files.find((f:any)=>f.status==='error');if(!file)return reply({ok:true,done:true});
  const email=process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,key=process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g,'\n');if(!email||!key)throw Error('Chưa cấu hình tài khoản Google trên Vercel.');
  const folder=process.env.MIGRATION_BILL_FOLDER_ID||stage.data.folderId;if(!folder)throw Error('Chưa cấu hình thư mục bill.');
  const client=new JWT({email,key,scopes:['https://www.googleapis.com/auth/drive.readonly']});
  try{
   const downloaded=await copyDriveBill(file.id,folder,client),path='migration/'+stage.id+'/'+file.id;
   const {error:up}=await svc.storage.from('viral-files').upload(path,downloaded.bytes,{contentType:downloaded.type,upsert:true});if(up)throw Error('Không tải được ảnh vào Supabase. Kiểm tra dung lượng và giới hạn tệp.');
   const {data:stored,error:de}=await svc.storage.from('viral-files').download(path);if(de||!stored)throw Error('Không kiểm tra được bản sao ảnh.');const actual=crypto.createHash('sha256').update(Buffer.from(await stored.arrayBuffer())).digest('hex');if(actual!==downloaded.sha256)throw Error('Bản sao Supabase không khớp ảnh Drive.');
   Object.assign(file,{status:'copied',verified:true,sha256:actual,size:downloaded.bytes.length,error:null});stage.data.candidate.files[file.id]={path,name:downloaded.name,type:downloaded.type,sha256:actual,sourceDriveId:file.id,folder:'bills'};
   rewriteBillURLs(stage.data.candidate,file.id,process.env.VIRAL_WEB_URL||'');
  }catch(e){Object.assign(file,{status:'error',error:e instanceof Error?e.message:'Chuyển ảnh thất bại.'});}
  const {data:saved,error:se}=await svc.rpc('viral_stage_commit',{stage_id:stage.id,expected_version:stage.version,new_data:stage.data});if(se||!saved)throw Error('Dữ liệu nhập thử thay đổi. Làm mới và thử lại.');return reply({ok:true,file,done:stage.data.files.every((f:any)=>f.status==='copied')});
 }
 if(body.action==='activate'){
  if(process.env.VIRAL_MAINTENANCE!=='true')throw Error('Bật VIRAL_MAINTENANCE=true và redeploy trước khi chuyển.');
  if(body.confirm!=='CHUYEN DU LIEU MOI'||!body.acknowledge)throw Error('Cần xác nhận bản Excel cuối và đã xem vấn đề dữ liệu.');
  if(body.mainVersion!==version)throw Error('Database vừa thay đổi. Làm mới trước khi kích hoạt.');
  const pub=migrationPublic(stage);if(!pub.ready)throw Error('Chưa chuyển đủ ảnh hoặc còn lỗi ngăn kích hoạt.');
  if(current.staffRosterAuthoritative){
   stage.data.candidate.archivedEmployees=structuredClone(current.archivedEmployees||[]);
   stage.data.candidate.archivedEmployees.push({at:new Date().toISOString(),reason:'Roster nhập thử cũ; giữ roster đang dùng khi kích hoạt',table:stage.data.candidate.books.main.Employees});
   stage.data.candidate.books.main.Employees=structuredClone(current.books.main.Employees);stage.data.candidate.staffRosterAuthoritative=true;
  }
  const maps=body.mappings;if(!Array.isArray(maps)||maps.length>1000)throw Error('Liên kết tài khoản không hợp lệ.');
  const existing=await accounts(svc);for(const m of maps)if(!existing.some((a:any)=>a.auth_user_id===m.authUserId))throw Error('Tài khoản không nằm trong danh sách hiện có.');
  const own=maps.find((m:any)=>m.authUserId===user.authUserId);if(!own)throw Error('Cần liên kết tài khoản admin đang đăng nhập.');
  adminActor(stage.data.candidate,{...user,employeeId:own.employeeId},process.env.VIRAL_ADMIN_EMAILS||'');
  // Retain the latest GPS/finance config, which may have changed after preparation.
  const settings=stage.data.candidate.books.main.Settings;for(const [k,v] of current.books.main.Settings)if(['hr_telegram_id','accountant_telegram_id','office_name','office_lat','office_lng','radius_m','start_time','end_time','lunch_start','lunch_end'].includes(k)&&(String(v)||current.staffRosterAuthoritative&&['hr_telegram_id','accountant_telegram_id'].includes(k))){const r=settings.find((r:any)=>r[0]===k);if(r)r[1]=v;else settings.push([k,v]);}
  if(current.webFinance)stage.data.candidate.webFinance=current.webFinance;
  retainProjectImages(stage.data.candidate,current);
  const {data:saved,error:ce}=await svc.rpc('viral_stage_commit',{stage_id:stage.id,expected_version:stage.version,new_data:stage.data});if(ce||!saved)throw Error('Dữ liệu nhập thử vừa thay đổi.');
  const {data:backupId,error:ae}=await svc.rpc('viral_activate_migration',{stage_id:stage.id,stage_version:stage.version+1,main_version:version,mappings:maps});if(ae)throw Error('Chưa kích hoạt: dữ liệu hoặc liên kết tài khoản thay đổi. Làm mới rồi kiểm tra lại.');return reply({ok:true,backupId});
 }
 throw Error('Thao tác chuyển đổi không hợp lệ.');
 }catch(e){return reply({error:e instanceof Error?e.message:'Không xử lý được chuyển dữ liệu.'},400);}}
