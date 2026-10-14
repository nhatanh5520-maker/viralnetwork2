import 'server-only';
import {createClient as createSupabaseClient} from '@supabase/supabase-js';
import {createClient} from '@/lib/supabase/server';
import {readFinanceBook} from '../../server/viral/google-finance.mjs';
import {createRuntime} from '../../server/viral/runtime.mjs';
export function viralService(){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key)throw Error('Chưa cấu hình Supabase cho Viral Network.');
 return createSupabaseClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
}
export async function webMember(){
 const auth=await createClient();const {data:{user},error}=await auth.auth.getUser();
 if(error||!user)return null;
 const svc=viralService();const {data,error:err}=await svc.from('viral_members').select('employee_id').eq('auth_user_id',user.id).eq('active',true).maybeSingle();
 if(err)throw err;if(!data)return null;return {employeeId:data.employee_id,email:user.email||'',authUserId:user.id};
}
export async function loadViral(){
 const svc=viralService();const {data,error}=await svc.from('viral_state').select('data,version').eq('id','main').single();if(error)throw Error('Chưa khởi tạo dữ liệu Viral Network. Chạy scripts/viral-init.mjs trước.');
 const rows=data.data.books.main.Notifications||[],h=rows[0]||[],status=h.indexOf('status'),key=h.indexOf('id');
 const ids=rows.slice(1).filter((r:any)=>['pending','failed'].includes(r[status])).map((r:any)=>'notification:'+r[key]);
 for(let i=0;i<ids.length;i+=100){const {data:sent,error:e}=await svc.from('viral_outbox').select('id').in('id',ids.slice(i,i+100)).eq('status','sent');if(e)throw e;const done=new Set((sent||[]).map((m:any)=>m.id));for(const r of rows.slice(1))if(done.has('notification:'+r[key])){r[status]='sent';r[h.indexOf('sent_at')]=new Date().toISOString();}}
 return {svc,data:data.data,version:data.version};
}
export function sameOrigin(req:Request){const origin=req.headers.get('origin');if(origin&&origin!==new URL(req.url).origin)throw Error('Nguồn yêu cầu không hợp lệ.');}
export const makeEvents=(data:any)=>{
 const events=(data.outbox||[]).filter((x:any)=>x.status==='pending').map((x:any)=>({id:x.id,chat_id:x.chatId,text:x.text,photo_file_id:null}));
 const cells=data.books.main.Notifications||[],h=cells[0]||[];
 for(const row of cells.slice(1)){const n=Object.fromEntries(h.map((key:string,i:number)=>[key,row[i]]));if(['pending','failed'].includes(n.status)&&n.telegram_id)events.push({id:'notification:'+n.id,chat_id:String(n.telegram_id),text:String(n.message),photo_file_id:n.photo_file_id||null});}
 return events;
};
export async function invokeViral(method:string,args:any[],initData:string,user:any){
 if(process.env.VIRAL_MAINTENANCE==='true')throw Error('Web đang tạm dừng để chuyển dữ liệu. Mini App cũ vẫn dùng bình thường.');
 const {svc,data,version}=await loadViral();
 let rt=createRuntime(data,user,{BOT_TOKEN:process.env.TELEGRAM_BOT_TOKEN,WEB_APP_URL:process.env.VIRAL_WEB_URL});
 rt.context.__authInput=initData;
 const vm=await import('node:vm');const actor=vm.runInContext('auth_(__authInput)',rt.context,{timeout:5000});
 if(method==='financeReport'){
  if(actor.role!=='director')throw Error('Chỉ Ban giám đốc được xem Thu chi');
  const {config,book}=await readFinanceBook(data);
  const temp=structuredClone(data),id='external_finance_read_only_book';
  temp.books[id]={[config.sheetName]:book.cells};temp.properties.FINANCE_SHEET_ID=id;temp.properties.FINANCE_SHEET_NAME=config.sheetName;
  const financeRuntime=createRuntime(temp,user,{BOT_TOKEN:process.env.TELEGRAM_BOT_TOKEN,GRID_META:{[id]:{[config.sheetName]:book}},GRID_TIMEZONE:{[id]:book.timeZone}});
  // Google sheet data is request-local. Never persist the copied ledger in Supabase.
  return financeRuntime.run(method,[initData,...args]);
 }
 // Resolve permission BEFORE downloading files.
 let fileIds:string[]=[];
 if(['getV20ExpenseBill','getV20ExpenseBillImage'].includes(method)){
  const info=rt.run('getV20ExpenseBills',[initData,args[0]]);fileIds=method==='getV20ExpenseBillImage'?[String(args[1])]:info.files.slice(0,1);
  if(fileIds.some(id=>!info.files.includes(id)))throw Error('Ảnh không thuộc phiếu này');
 }else if(method==='getV20PaymentProof'){
  const rows=data.books.main.Expenses,h=rows[0];const expense=rows.slice(1).map((r:any)=>Object.fromEntries(h.map((k:string,i:number)=>[k,r[i]]))).find((r:any)=>String(r.id)===String(args[0]));
  const accountant=data.books.main.Settings.find((r:any)=>r[0]==='accountant_telegram_id')?.[1];
  if(!expense||expense.status!=='paid'||!expense.payment_file_id)throw Error('Phiếu chưa có ảnh chuyển khoản');
  if(String(expense.telegram_id)!==actor.id&&actor.id!==String(accountant)&&actor.role!=='director')throw Error('Bạn không được xem ảnh này');
  fileIds=[String(expense.payment_file_id)];
 }
 for(const id of fileIds){const f=data.files[id];if(!f||f.deleted)throw Error('Không thấy tệp đính kèm');const {data:blob,error}=await svc.storage.from('viral-files').download(f.path);if(error||!blob)throw Error('Không đọc được tệp đính kèm');f.bytes=Buffer.from(await blob.arrayBuffer()).toString('base64');}
 if(fileIds.length)rt=createRuntime(data,user,{BOT_TOKEN:process.env.TELEGRAM_BOT_TOKEN,WEB_APP_URL:process.env.VIRAL_WEB_URL});
 let result;
 if(method==='avatarBatch')result=await avatars(rt,args[0]);
 else result=rt.run(method,[initData,...args]);
 for(const upload of rt.uploads){const {error}=await svc.storage.from('viral-files').upload(upload.id,upload.bytes,{contentType:upload.type,upsert:false});if(error)throw Error('Không lưu được tệp đính kèm');}
 for(const file of Object.values(rt.data.files||{}) as any[])delete file.bytes;
 for(const file of Object.values(data.files||{}) as any[])delete file.bytes;
 if(JSON.stringify(rt.data)!==JSON.stringify(data)){
  const {data:saved,error}=await svc.rpc('viral_commit',{expected_version:version,new_data:rt.data,events:makeEvents(rt.data)});
  if(error||!saved){if(rt.uploads.length)await svc.storage.from('viral-files').remove(rt.uploads.map((f:any)=>f.id));if(error)throw error;throw Error('Dữ liệu vừa được người khác cập nhật. Làm mới rồi thử lại.');}
 }
 return result;
}
async function avatars(rt:any,ids:any){
 if(!Array.isArray(ids)||ids.length>8)throw Error('Danh sách ảnh đại diện không hợp lệ.');
 const token=process.env.TELEGRAM_BOT_TOKEN;if(!token)return {};
 const employees=rt.data.books.main.Employees||[];const allowed=new Set(employees.slice(1).map((r:any)=>String(r[0])));const out:Record<string,string>={};
 for(const id of [...new Set(ids.map(String))]){if(!allowed.has(id)||!/^\d+$/.test(id))continue;try{
  const photo=await fetch(`https://api.telegram.org/bot${token}/getUserProfilePhotos`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({user_id:id,limit:1})}).then(r=>r.json());
  const fid=photo.result?.photos?.[0]?.[0]?.file_id;if(!fid)continue;
  const file=await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${encodeURIComponent(fid)}`).then(r=>r.json());if(!file.result?.file_path)continue;
  const image=await fetch(`https://api.telegram.org/file/bot${token}/${file.result.file_path}`);if(image.ok)out[id]=`data:image/jpeg;base64,${Buffer.from(await image.arrayBuffer()).toString('base64')}`;
 }catch{ /* A missing avatar must not block application use. */ }}return out;
}
