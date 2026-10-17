import ExcelJS from 'exceljs';import crypto from 'node:crypto';
const profileFields=['telegram_id','name','department','job_title','role','active','employee_code','display_name'];
const retainedFields=['employee_id','joined_on','left_on','revision','previous_telegram_ids'];
export async function readStaffRoster(bytes,{profilesOnly=false}={}){
 const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(bytes);const sheet=workbook.worksheets[0];if(!sheet)throw Error('Excel chưa có bảng nhân sự.');
 const headers=sheet.getRow(1).values.slice(1).map(v=>String(v||'').trim());for(const k of ['email','telegram_id','name','department','role','active','employee_code','job_title'])if(!headers.includes(k))throw Error('Thiếu cột '+k);if(!profilesOnly&&!headers.includes('pass'))throw Error('Thiếu cột pass');if(new Set(headers).size!==headers.length)throw Error('Tiêu đề cột bị trùng.');
 const people=[],credentials=[];sheet.eachRow((row,i)=>{if(i===1)return;const raw={};for(const [c,k] of headers.entries()){let value=row.getCell(c+1).value;if(value&&typeof value==='object'&&!(value instanceof Date))value=value.result??value.text??(value.richText?.map(r=>r.text).join(''))??'';if(value instanceof Date)value=value.toISOString().slice(0,10);raw[k]=value??'';}if(!Object.values(raw).some(v=>v!==''))return;
 const p=Object.fromEntries([...profileFields,...retainedFields].filter(k=>Object.hasOwn(raw,k)).map(k=>[k,typeof raw[k]==='string'?raw[k].trim():raw[k]]));
 p.telegram_id=String(p.telegram_id).trim();p.email=String(raw.email).trim().toLowerCase();p.role=String(p.role).trim().toLowerCase();const active=String(p.active).trim().toLowerCase();if(!['true','false'].includes(active))throw Error('Dòng '+i+' có active không hợp lệ (TRUE/FALSE).');p.active=active==='true';p.employee_code=String(p.employee_code).trim();if(p.employee_id!==undefined)p.employee_id=String(p.employee_id).trim();
 if(!/^[1-9]\d{4,19}$/.test(p.telegram_id)||!/^\S+@\S+\.\S+$/.test(p.email)||!['employee','leader','director'].includes(p.role)||!p.name||!p.department||!p.employee_code)throw Error('Dòng '+i+' có thông tin nhân sự không hợp lệ.');
 if(!profilesOnly){const password=String(raw.pass??'');if(password.length<6||password.length>128)throw Error('Mật khẩu dòng '+i+' phải từ 6–128 ký tự.');credentials.push({telegramId:p.telegram_id,email:p.email,password});}people.push(p);
 });
 if(!people.length||people.length>500)throw Error('Số lượng nhân viên không hợp lệ.');for(const k of ['telegram_id','email','employee_id','employee_code']){const values=people.map(p=>String(p[k]||'').toLowerCase()).filter(Boolean);if(new Set(values).size!==values.length)throw Error('Trùng '+k+' trong Excel.');}if(!people.some(p=>p.role==='director'&&p.active))throw Error('Cần có Giám đốc đang hoạt động.');
 return {people,credentials,sha256:crypto.createHash('sha256').update(bytes).digest('hex')};
}
function rows(table){const [h=[],...r]=table||[];return r.map(v=>Object.fromEntries(h.map((k,i)=>[k,v[i]??''])));}
export function applyAuthoritativeRoster(current,people){
 const next=structuredClone(current),old=next.books.main.Employees,before=new Map(rows(old).map(p=>[String(p.telegram_id),p])),headers=[...old[0].filter(k=>!['pass','password','email'].includes(k))];for(const key of ['web_email','employee_id','employee_code','job_title','joined_on','left_on','revision','previous_telegram_ids','display_name'])if(!headers.includes(key))headers.push(key);
 next.archivedEmployees??=[];next.archivedEmployees.push({at:new Date().toISOString(),reason:'Bảng nhân sự trước khi đồng bộ roster chính',table:old});
 next.books.main.Employees=[headers,...people.map(p=>{const previous=before.get(String(p.telegram_id))||{},merged={...previous,...p,employee_id:previous.employee_id||p.employee_id||'staff:'+p.telegram_id,web_email:p.email};return headers.map(k=>merged[k]??'')})];next.staffRosterAuthoritative=true;
 const active=new Set(people.filter(p=>p.active).map(p=>p.telegram_id));for(const row of next.books.main.Settings)if(['hr_telegram_id','accountant_telegram_id'].includes(row[0])&&!active.has(String(row[1])))row[1]='';
 return next;
}
export function previewStaffProfiles(current,people,operatorId){
 const existing=rows(current.books.main.Employees),byId=new Map(existing.map(p=>[String(p.telegram_id),p])),missing=[],changes=[];
 for(const p of people){const old=byId.get(String(p.telegram_id));if(!old){missing.push({id:p.telegram_id,name:p.name});continue;}const fields=profileFields.filter(k=>k!=='telegram_id'&&Object.hasOwn(p,k)&&String(old[k]??'').trim()!==String(p[k]).trim()).map(k=>({field:k,before:String(old[k]??''),after:String(p[k])}));if(fields.length)changes.push({id:p.telegram_id,name:p.name,fields});}
 const self=people.find(p=>p.telegram_id===String(operatorId));if(self&&(!self.active||self.role!=='director'))throw Error('Không thể tự hạ quyền hoặc vô hiệu hóa Giám đốc đang nhập file.');
 const codes=new Map();for(const old of existing){const p=people.find(x=>x.telegram_id===String(old.telegram_id)),code=String(p?.employee_code??old.employee_code??'').trim().toLowerCase();if(code&&codes.has(code))throw Error('Mã nhân viên trùng với hồ sơ hiện có.');if(code)codes.set(code,true);}
 return {changes,missing,unchanged:people.length-missing.length-changes.length,preserved:existing.filter(p=>!people.some(x=>x.telegram_id===String(p.telegram_id))).length};
}
export function applyStaffProfiles(current,people,operatorId){
 const preview=previewStaffProfiles(current,people,operatorId);if(preview.missing.length)throw Error('Có nhân sự chưa tồn tại trên web. Tạo tài khoản trước hoặc dùng chế độ cấp đăng nhập.');
 if(!preview.changes.length)return {data:current,preview};
 const next=structuredClone(current),table=next.books.main.Employees,h=table[0];for(const key of profileFields)if(!h.includes(key))h.push(key);if(!h.includes('revision'))h.push('revision');
 next.archivedEmployees??=[];next.archivedEmployees.push({at:new Date().toISOString(),reason:'Cập nhật hồ sơ từ Excel, giữ tài khoản đăng nhập',table:structuredClone(current.books.main.Employees)});
 const byId=new Map(people.map(p=>[p.telegram_id,p])),changed=new Set(preview.changes.map(x=>x.id));
 for(const row of table.slice(1)){const id=String(row[h.indexOf('telegram_id')]),p=byId.get(id);if(!p||!changed.has(id))continue;for(const key of profileFields)if(key!=='telegram_id'&&Object.hasOwn(p,key))row[h.indexOf(key)]=p[key];const i=h.indexOf('revision');row[i]=(Number(row[i])||1)+1;}
 next.staffRosterAuthoritative=true;const active=new Set(rows(table).filter(p=>String(p.active).toLowerCase()==='true').map(p=>String(p.telegram_id)));for(const row of next.books.main.Settings)if(['hr_telegram_id','accountant_telegram_id'].includes(row[0])&&!active.has(String(row[1])))row[1]='';
 return {data:next,preview};
}
