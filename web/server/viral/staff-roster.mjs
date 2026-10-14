import ExcelJS from 'exceljs';import crypto from 'node:crypto';
export async function readStaffRoster(bytes){
 const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(bytes);const sheet=workbook.worksheets[0];if(!sheet)throw Error('Excel chưa có bảng nhân sự.');
 const headers=sheet.getRow(1).values.slice(1).map(v=>String(v||'').trim());for(const k of ['email','pass','telegram_id','name','department','role','active','employee_id','employee_code','job_title'])if(!headers.includes(k))throw Error('Thiếu cột '+k);if(new Set(headers).size!==headers.length)throw Error('Tiêu đề cột bị trùng.');
 const people=[],credentials=[];sheet.eachRow((row,i)=>{if(i===1)return;const p={};for(const [c,k] of headers.entries()){let value=row.getCell(c+1).value;if(value&&typeof value==='object'&&!(value instanceof Date))value=value.result??value.text??(value.richText?.map(r=>r.text).join(''))??'';if(value instanceof Date)value=value.toISOString().slice(0,10);p[k]=value??'';}if(!Object.values(p).some(v=>v!==''))return;
 p.telegram_id=String(p.telegram_id).trim();p.email=String(p.email).trim().toLowerCase();p.role=String(p.role).trim().toLowerCase();p.active=String(p.active).toLowerCase()==='true';p.employee_id=String(p.employee_id);p.employee_code=String(p.employee_code);const password=String(p.pass);delete p.pass;
 if(!/^[1-9]\d{4,19}$/.test(p.telegram_id)||!/^\S+@\S+\.\S+$/.test(p.email)||!['employee','leader','director'].includes(p.role)||!p.name||!p.department||!p.employee_id||!p.employee_code)throw Error('Dòng '+i+' có thông tin nhân sự không hợp lệ.');if(password.length<6||password.length>128)throw Error('Mật khẩu dòng '+i+' phải từ 6–128 ký tự.');
 credentials.push({telegramId:p.telegram_id,email:p.email,password});people.push(p);
 });
 if(!people.length||people.length>500)throw Error('Số lượng nhân viên không hợp lệ.');for(const k of ['telegram_id','email','employee_id','employee_code'])if(new Set(people.map(p=>String(p[k]).toLowerCase())).size!==people.length)throw Error('Trùng '+k+' trong Excel.');if(!people.some(p=>p.role==='director'&&p.active))throw Error('Cần có Giám đốc đang hoạt động.');
 return {people,credentials,sha256:crypto.createHash('sha256').update(bytes).digest('hex')};
}
export function applyAuthoritativeRoster(current,people){
 const next=structuredClone(current),old=next.books.main.Employees,headers=[...old[0].filter(k=>!['pass','password','email'].includes(k))];for(const key of ['web_email','employee_id','employee_code','job_title','joined_on','left_on','revision','previous_telegram_ids','display_name'])if(!headers.includes(key))headers.push(key);
 next.archivedEmployees??=[];next.archivedEmployees.push({at:new Date().toISOString(),reason:'Bảng nhân sự trước khi đồng bộ roster chính',table:old});
 next.books.main.Employees=[headers,...people.map(p=>headers.map(k=>k==='web_email'?p.email:p[k]??''))];next.staffRosterAuthoritative=true;
 const active=new Set(people.filter(p=>p.active).map(p=>p.telegram_id));for(const row of next.books.main.Settings)if(['hr_telegram_id','accountant_telegram_id'].includes(row[0])&&!active.has(String(row[1])))row[1]='';
 return next;
}
