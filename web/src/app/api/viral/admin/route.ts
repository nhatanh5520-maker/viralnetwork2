import {NextResponse} from 'next/server';
import {webMember,loadViral,sameOrigin,makeEvents,invalidateViralState} from '@/lib/viral';
import {adminActor,adminSnapshot,adminChange,adminBackup} from '../../../../../server/viral/admin.mjs';
export const runtime='nodejs';export const maxDuration=60;
const emails=()=>process.env.VIRAL_ADMIN_EMAILS||'';
const response=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{'Cache-Control':'no-store'}});
export async function GET(req:Request){
 try{const user=await webMember();if(!user)return response({error:'Cần đăng nhập.'},401);
 const {data,version}=await loadViral(),actor=adminActor(data,user,emails());
 if(new URL(req.url).searchParams.get('backup')==='1')return response(adminBackup(data));
 return response({...adminSnapshot(data,actor,version),financeReady:!!(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL&&process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY),serviceAccountEmail:process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL||''});
 }catch(e){return response({error:e instanceof Error?e.message:'Không đọc được dữ liệu quản trị.'},403);}
}
export async function POST(req:Request){
 try{sameOrigin(req);const user=await webMember();if(!user)return response({error:'Cần đăng nhập.'},401);
 if(process.env.VIRAL_MAINTENANCE==='true')throw Error('Đang chuyển dữ liệu; tạm dừng chỉnh sửa admin.');
 const raw=await req.text();if(Buffer.byteLength(raw)>200000)return response({error:'Yêu cầu quá lớn.'},413);const body=JSON.parse(raw);
 const {svc,data,version}=await loadViral();adminActor(data,user,emails());
 if(!Number.isInteger(body.version)||body.version!==version)return response({error:'Dữ liệu vừa được cập nhật. Làm mới bảng trước khi lưu.'},409);
 const changed=adminChange(data,user,emails(),body);
 const {data:saved,error}=await svc.rpc('viral_commit',{expected_version:version,new_data:changed.data,events:makeEvents(changed.data)});
 if(error)throw Error('Không lưu được thay đổi quản trị.');if(!saved)return response({error:'Dữ liệu vừa được cập nhật. Làm mới bảng trước khi lưu.'},409);
 return response({ok:true,result:changed.result});
 }catch(e){return response({error:e instanceof Error?e.message:'Không lưu được dữ liệu.'},400);}
 finally{invalidateViralState();}
}
