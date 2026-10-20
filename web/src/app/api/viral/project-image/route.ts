import {webMember,loadViral} from '@/lib/viral';
import {ViralStateReadError} from '../../../../../server/viral/state-read.mjs';
import {projectImageFile} from '../../../../../server/viral/project-images.mjs';
export const runtime='nodejs';
export async function GET(req:Request){try{
 const member=await webMember();if(!member)return new Response('Cần đăng nhập',{status:401});
 const id=new URL(req.url).searchParams.get('id');if(!id)return new Response('Thiếu ảnh',{status:400});
 const {svc,data}=await loadViral({share:true}),file=projectImageFile(data,member,id);if(!file)return new Response('Không thấy ảnh',{status:404});
 const {data:blob,error}=await svc.storage.from('viral-files').download(file.path);if(error||!blob)throw Error();
 return new Response(blob,{headers:{'Content-Type':file.type,'Content-Disposition':'inline','Cache-Control':'private, max-age=3600','X-Content-Type-Options':'nosniff'}});
 }catch(error){return new Response('Không đọc được ảnh',{status:error instanceof ViralStateReadError?503:400});}}
