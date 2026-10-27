import {NextResponse} from 'next/server';
import {webMember,loadViral,sameOrigin,makeEvents,invalidateViralState} from '@/lib/viral';
import {adminActor} from '../../../../../server/viral/admin.mjs';
import {archiveCandidates,vnDay,syncAttendanceSheet,preparePrune,ATTENDANCE_SHEET_ID} from '../../../../../server/viral/attendance-archive.mjs';
export const runtime='nodejs';
export const maxDuration=60;
const reply=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{'Cache-Control':'no-store'}});
async function authorized(){
 const user=await webMember();if(!user)throw Error('Cần đăng nhập quản trị.');
 const state=await loadViral();const actor=adminActor(state.data,user,process.env.VIRAL_ADMIN_EMAILS||'');
 return {...state,actor};
}
export async function GET(){
 try{const {data,version}=await authorized();return reply({ok:true,version,before:vnDay(),eligible:archiveCandidates(data.books.main.Attendance).length,live:data.books.main.Attendance.length-1,archived:data.attendanceArchive?.ids?.length||0,sheetId:ATTENDANCE_SHEET_ID,serviceAccountEmail:process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL||''});}
 catch(e){return reply({error:e instanceof Error?e.message:'Không đọc được trạng thái lưu trữ.'},403);}
}
export async function POST(req:Request){
 try{
  sameOrigin(req);const raw=await req.text();if(raw.length>2000)return reply({error:'Yêu cầu quá lớn.'},413);
  const body=JSON.parse(raw);if(!['sync','archive'].includes(body.action))throw Error('Thao tác không hợp lệ.');
  const {svc,data,version,actor}=await authorized();
  if(process.env.VIRAL_MAINTENANCE==='true')throw Error('Đang bảo trì; tạm dừng chuyển dữ liệu.');
  if(body.version!==version)return reply({error:'Dữ liệu đã đổi. Bấm Kiểm tra lại trước khi tiếp tục.'},409);
  const copied=await syncAttendanceSheet(data);
  if(body.action==='sync')return reply({ok:true,copied:copied.rows,moved:0});
  const result=preparePrune(data,copied.grid);
  if(!result.moved)return reply({ok:true,copied:copied.rows,moved:0,retained:result.retained,archived:result.archived});
  result.next.adminAudit??=[];
  result.next.adminAudit.push({id:crypto.randomUUID(),at:new Date().toISOString(),actor:actor.id,name:actor.name,action:'attendance-archive',target:ATTENDANCE_SHEET_ID,reason:'Lưu công cũ đã hoàn tất vào Google Sheets sau đối chiếu toàn bộ',moved:result.moved,changes:{Attendance:{removed:result.moved}}});
  const {data:saved,error}=await svc.rpc('viral_commit',{expected_version:version,new_data:result.next,events:makeEvents(result.next)});
  if(error)throw Error('Không dọn được Supabase. Dữ liệu đã sao chép lên Sheet; cần thử lại.');
  if(!saved)return reply({error:'Có người vừa cập nhật dữ liệu. Chưa xóa công; bấm Kiểm tra rồi chạy lại.'},409);
  invalidateViralState();return reply({ok:true,copied:copied.rows,moved:result.moved,retained:result.retained,archived:result.archived});
 }catch(e){return reply({error:e instanceof Error?e.message:'Chuyển dữ liệu chưa thành công.'},400);}
}
