import {NextResponse} from 'next/server';
import {createClient} from '@/lib/supabase/server';
import {webMember} from '@/lib/viral';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(req:Request){
 const headers={'Cache-Control':'private, no-store','Vary':'Cookie'};
 try{
  if(!await webMember())return NextResponse.json({error:'Cần đăng nhập.'},{status:401,headers});
  const auth=await createClient(),{data:signal,error}=await auth.from('viral_change_signal').select('version,versions').eq('id','main').maybeSingle();
  if(error){if(['42P01','PGRST205'].includes(error.code))return NextResponse.json({ready:false},{headers});throw error;}
  if(!signal)return NextResponse.json({error:'Tài khoản không nhận được tín hiệu.'},{status:401,headers});
  if(new URL(req.url).searchParams.get('connect')!=='1')return NextResponse.json({ready:true,signal},{headers});
  const {data:{session}}=await auth.auth.getSession();if(!session)return NextResponse.json({error:'Cần đăng nhập.'},{status:401,headers});
  return NextResponse.json({ready:true,signal,url:process.env.NEXT_PUBLIC_SUPABASE_URL,anonKey:process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,accessToken:session.access_token,expiresAt:session.expires_at},{headers});
 }catch{return NextResponse.json({error:'Chưa kiểm tra được thay đổi dữ liệu.'},{status:503,headers});}
}
