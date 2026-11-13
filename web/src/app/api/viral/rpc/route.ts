import {randomUUID} from 'node:crypto';
import {NextResponse} from 'next/server';
import {invokeViral,sameOrigin,webMember} from '@/lib/viral';
import {ViralVersionConflict} from '../../../../../server/viral/approval-retry.mjs';
import {ViralStateReadError} from '../../../../../server/viral/state-read.mjs';
import {ViralCommitUncertain} from '../../../../../server/viral/commit-uploads.mjs';
export const runtime='nodejs';export const maxDuration=60;
export async function POST(req:Request){
 const reference=randomUUID().slice(0,8);let method='unknown';
 try{sameOrigin(req);const raw=await req.text();if(Buffer.byteLength(raw)>12*1024*1024)return NextResponse.json({error:'Tệp quá lớn, chọn ảnh nhỏ hơn.'},{status:413});const body=JSON.parse(raw);
 if(typeof body.method!=='string'||!Array.isArray(body.args)||body.args.length>12)throw Error('Yêu cầu không hợp lệ.');
 method=/^[A-Za-z0-9_]{1,80}$/.test(body.method)?body.method:'invalid';
 const initData=String(body.initData||'');const user=initData?null:await webMember();
 if(!user&&!initData)return NextResponse.json({error:'Cần đăng nhập.'},{status:401});
 const result=await invokeViral(body.method,body.args,initData||'supabase',user);return NextResponse.json({result});
 }catch(e){const readError=e instanceof ViralStateReadError;
 if(readError)console.error('viral_rpc_read_failure',{reference,method,code:e.code,stage:(e as any).stage||'unknown',http_status:(e as any).httpStatus||null});
 const error=(e instanceof Error?e.message:'Không xử lý được yêu cầu')+(readError?' Mã kiểm tra: '+reference:'');return NextResponse.json({error,...(readError?{reference,code:e.code,stage:(e as any).stage||'unknown'}:{})},{status:e instanceof ViralStateReadError||e instanceof ViralCommitUncertain?503:e instanceof ViralVersionConflict||error.includes('người khác')?409:400});}
}
