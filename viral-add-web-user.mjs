import {createRequire} from 'node:module';const require=createRequire(new URL('../web/package.json',import.meta.url));const {createClient}=require('@supabase/supabase-js');
const email=process.env.VIRAL_USER_EMAIL,password=process.env.VIRAL_USER_PASSWORD,id=process.env.VIRAL_EMPLOYEE_ID;
if(!email||!password||!id)throw Error('Cần VIRAL_USER_EMAIL, VIRAL_USER_PASSWORD, VIRAL_EMPLOYEE_ID.');
const sb=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const {data:state,error}=await sb.from('viral_state').select('data').eq('id','main').single();if(error)throw error;
const h=state.data.books.main.Employees[0],row=state.data.books.main.Employees.slice(1).find(r=>String(r[h.indexOf('telegram_id')])===id&&String(r[h.indexOf('active')]).toLowerCase()==='true');if(!row)throw Error('Chưa có nhân viên đang hoạt động với ID này.');
const {data:created,error:e}=await sb.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{full_name:row[h.indexOf('name')]}});if(e)throw e;
const {error:link}=await sb.from('viral_members').insert({auth_user_id:created.user.id,employee_id:id});if(link)throw link;console.log('Đã liên kết tài khoản web:',email);
