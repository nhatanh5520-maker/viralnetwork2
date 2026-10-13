import {webMember,loadViral} from '@/lib/viral';import {createRuntime} from '../../../../../server/viral/runtime.mjs';import vm from 'node:vm';
export const runtime='nodejs';
export async function GET(req:Request){try{
 const member=await webMember();if(!member)return new Response('Cần đăng nhập',{status:401});
 const id=new URL(req.url).searchParams.get('id');if(!id)return new Response('Thiếu tệp',{status:400});
 const {svc,data}=await loadViral(),rt=createRuntime(data,member);const actor=vm.runInContext("auth_('supabase')",rt.context);
 const rows=data.books.main.Expenses,h=rows[0],extra=data.books.main.ExpenseAttachments||[];
 const expense=rows.slice(1).map((r:any)=>Object.fromEntries(h.map((k:string,i:number)=>[k,r[i]]))).find((r:any)=>String(r.bill_file_id)===id||String(r.payment_file_id)===id||extra.slice(1).some((a:any)=>String(a[0])===String(r.id)&&String(a[2])===id));
 if(!expense)return new Response('Không thấy tệp',{status:404});
 const accountant=data.books.main.Settings.find((r:any)=>r[0]==='accountant_telegram_id')?.[1];if(String(expense.telegram_id)!==actor.id&&actor.id!==String(accountant)&&actor.role!=='director')return new Response('Không được phép',{status:403});
 const f=data.files[id];if(!f||f.deleted)return new Response('Không thấy tệp',{status:404});const {data:blob,error}=await svc.storage.from('viral-files').download(f.path);if(error||!blob)throw Error('Không đọc được tệp');
 return new Response(blob,{headers:{'Content-Type':f.type,'Content-Disposition':'attachment','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
 }catch{return new Response('Không đọc được tệp',{status:400});}}
