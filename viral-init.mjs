import fs from 'node:fs';
import {createRequire} from 'node:module';
import {initializeData} from '../web/server/viral/runtime.mjs';
const require=createRequire(new URL('../web/package.json',import.meta.url));
const {createClient}=require('@supabase/supabase-js');
const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
if(!url||!key)throw Error('Cần NEXT_PUBLIC_SUPABASE_URL và SUPABASE_SERVICE_ROLE_KEY.');
const sb=createClient(url,key,{auth:{persistSession:false}});
const config=JSON.parse(fs.readFileSync(process.argv[2]||'viral-members.json','utf8'));
const {data:existing,error:readError}=await sb.from('viral_state').select('id').eq('id','main').maybeSingle();if(readError)throw readError;
if(existing)throw Error('Đã có dữ liệu. Không khởi tạo đè; dùng script cấp tài khoản hoặc cập nhật có kiểm soát.');
const state=initializeData(),headers=state.books.main.Employees[0];
for(const m of config.members){
 if(!/^\d+$/.test(String(m.employee_id))||!m.email||!m.password||m.password.length<12||!['director','leader','employee'].includes(m.role))throw Error('Thiếu cấu hình nhân viên.');
 state.books.main.Employees.push(headers.map(k=>({telegram_id:String(m.employee_id),name:m.name,department:m.department||'',role:m.role,active:'true',job_title:m.job_title||'',employee_id:crypto.randomUUID(),display_name:m.name,revision:1}[k]??'')));
}
for(const [key,value] of Object.entries(config.settings||{})){const row=state.books.main.Settings.find(r=>r[0]===key);if(row)row[1]=String(value);else state.books.main.Settings.push([key,String(value)]);}
const {error}=await sb.from('viral_state').insert({id:'main',data:state});if(error)throw error;
for(const m of config.members){
 const {data,error}=await sb.auth.admin.createUser({email:m.email,password:m.password,email_confirm:true,user_metadata:{full_name:m.name}});if(error)throw error;
 const {error:e}=await sb.from('viral_members').insert({auth_user_id:data.user.id,employee_id:String(m.employee_id)});if(e)throw e;
 console.log('Đã cấp tài khoản:',m.email);
}
console.log('Đã khởi tạo Viral Network. Xóa tệp cấu hình chứa mật khẩu sau khi lưu an toàn.');
