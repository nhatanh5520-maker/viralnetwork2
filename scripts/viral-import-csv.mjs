import fs from 'node:fs';import path from 'node:path';import {createRequire} from 'node:module';import {initializeData} from '../web/server/viral/runtime.mjs';
const require=createRequire(new URL('../web/package.json',import.meta.url));const {createClient}=require('@supabase/supabase-js');
const root=process.argv[2];if(!root)throw Error('Dùng: node scripts/viral-import-csv.mjs thư-mục-csv');
const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;if(!url||!key)throw Error('Thiếu cấu hình Supabase.');
const sb=createClient(url,key,{auth:{persistSession:false}}),state=initializeData();
function csv(text){const rows=[];let row=[],cell='',quote=false;for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quote&&text[i+1]==='"'){cell+='"';i++;}else quote=!quote;}else if(c===','&&!quote){row.push(cell);cell='';}else if((c==='\n'||c==='\r')&&!quote){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(Boolean))rows.push(row);row=[];cell='';}else cell+=c;}if(quote)throw Error('CSV thiếu dấu nháy kết thúc');if(cell||row.length){row.push(cell);rows.push(row);}return rows;}
const privateId=state.properties.HR_PRIVATE_SHEET_ID;
let count=0;
for(const [dir,book] of [[fs.existsSync(path.join(root,'main'))?path.join(root,'main'):root,'main'],[path.join(root,'private'),privateId]]){
 if(!fs.existsSync(dir))continue;
 for(const filename of fs.readdirSync(dir).filter(n=>n.endsWith('.csv'))){const name=filename.slice(0,-4),target=state.books[book]?.[name];if(!target){console.log('Bỏ qua bảng hiển thị/phụ:',name);continue;}
  const rows=csv(fs.readFileSync(path.join(dir,filename),'utf8').replace(/^\uFEFF/,''));if(!rows.length)continue;const headers=rows[0];
  if(headers.some(k=>!target[0].includes(k))||headers.filter(Boolean).length!==new Set(headers).size)throw Error('Header không khớp source V20.30.22: '+name);
  if(!headers.includes(target[0][0]))throw Error('Thiếu cột khóa: '+name);
  state.books[book][name]=[target[0],...rows.slice(1).map(r=>target[0].map(k=>headers.includes(k)?r[headers.indexOf(k)]??'':''))];count++;
 }
}
if(!count)throw Error('Không thấy CSV hợp lệ. Chưa ghi dữ liệu.');
// Imported pending jobs are retained as data, but not automatically replayed.
const jobs=state.books.main.Notifications,h=jobs[0];for(const r of jobs.slice(1))if(['pending','failed'].includes(r[h.indexOf('status')]))r[h.indexOf('status')]='migration_hold';
const {data:existing,error}=await sb.from('viral_state').select('id').eq('id','main').maybeSingle();if(error)throw error;if(existing)throw Error('Project đã có dữ liệu. Nhập vào project Supabase mới để không ghi đè.');
const {error:e}=await sb.from('viral_state').insert({id:'main',data:state});if(e)throw e;console.log('Đã nhập',count,'bảng. Việc thông báo cũ được giữ ở migration_hold, không gửi lại. Cấp liên kết tài khoản web bằng viral-add-web-user.mjs.');
