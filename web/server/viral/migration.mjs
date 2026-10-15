import {retainProjectImages} from './project-images.mjs';
import crypto from 'node:crypto';
import {initializeData,createRuntime} from './runtime.mjs';
const rows=matrix=>{const [h=[],...items]=matrix||[];return items.map(r=>Object.fromEntries(h.map((k,i)=>[k,r[i]??''])))};
const str=x=>x===null||x===undefined?'':String(x);
const id=x=>typeof x==='number'&&Number.isSafeInteger(x)?String(x):str(x).trim();
export function prepareMigration(bundle,current){
 if(bundle?.format!=='viral-workbook-v1'||!bundle.sheets||!/^[a-f0-9]{64}$/i.test(bundle.sourceSHA256||''))throw Error('Tệp dữ liệu chuyển đổi không đúng định dạng.');
 const candidate=initializeData(),issues=[],repairs=[],counts={};
 for(const name of ['Employees','ProductionItems','Tasks','ProductionTaskLinks','ProductionTeam','Attendance','Expenses','ExpenseAttachments','Projects','Settings'])if(!Array.isArray(bundle.sheets[name]))throw Error('Thiếu bảng gốc '+name+'.');
 for(const [name,matrix] of Object.entries(bundle.sheets)){
  if(!Array.isArray(matrix)||!matrix.length||!Array.isArray(matrix[0]))throw Error('Bảng '+name+' không hợp lệ.');
  const headers=matrix[0];if(headers.some(h=>typeof h!=='string'||!h)||new Set(headers).size!==headers.length)throw Error('Tiêu đề bảng '+name+' bị trùng hoặc trống.');
  if(matrix.slice(1).some(r=>!Array.isArray(r)||r.length>headers.length))throw Error('Dòng bảng '+name+' không khớp tiêu đề.');
  counts[name]=matrix.length-1;
  // Keep original extra columns and unknown tables. Never silently drop them.
  if(!Object.hasOwn(candidate.books.main,name)){candidate.books.main[name]=structuredClone(matrix);continue;}
  const expected=candidate.books.main[name][0],combined=[...expected,...headers.filter(k=>!expected.includes(k))];
  const cells=[combined,...matrix.slice(1).map(r=>combined.map(k=>{
   const value=headers.includes(k)?r[headers.indexOf(k)]??'':'';
   return k.endsWith('_id')||k==='bank_account'?id(value):value;
  }))];candidate.books.main[name]=cells;
 }
 if(current.staffRosterAuthoritative){
  candidate.archivedEmployees=structuredClone(current.archivedEmployees||[]);candidate.archivedEmployees.push({at:new Date().toISOString(),reason:'Roster trong dữ liệu cũ; không ghi đè danh sách chính',table:candidate.books.main.Employees});
  candidate.books.main.Employees=structuredClone(current.books.main.Employees);candidate.staffRosterAuthoritative=true;counts['Employees imported history']=counts.Employees;counts.Employees=candidate.books.main.Employees.length-1;
 }
 const people=rows(candidate.books.main.Employees),peopleIds=new Set(people.map(p=>id(p.telegram_id))),prodIds=new Set(rows(candidate.books.main.ProductionItems).map(p=>id(p.id))),taskIds=new Set(rows(candidate.books.main.Tasks).map(p=>id(p.id))),expenseIds=new Set(rows(candidate.books.main.Expenses).map(p=>id(p.id)));
 for(const [table,key] of [['Employees','telegram_id'],['ProductionItems','id'],['Tasks','id'],['Attendance','id'],['Expenses','id'],['Projects','code'],['Settings','key']]){const seen=new Set();for(const row of rows(candidate.books.main[table])){const k=id(row[key]);if(!k||seen.has(k))throw Error(table+': thiếu hoặc trùng khóa '+key);seen.add(k);}}
 for(const [table,key,allowed] of [['Tasks','assignee_id',peopleIds],['Attendance','telegram_id',peopleIds],['Expenses','telegram_id',peopleIds],['Expenses','production_id',prodIds],['ProductionTeam','production_id',prodIds],['ProductionTaskLinks','production_id',prodIds],['ProductionTaskLinks','task_id',taskIds],['ExpenseAttachments','expense_id',expenseIds]])for(const row of rows(candidate.books.main[table]))if(id(row[key])&&!allowed.has(id(row[key])))issues.push({table,key,value:id(row[key]),record:id(row.id||row.production_id||row.expense_id),message:'Liên kết chưa tìm thấy; giữ nguyên để đối chiếu.'});
 for(const row of rows(candidate.books.main.Expenses))if(!['pending','approved','paid','rejected'].includes(str(row.status))||!Number.isFinite(Number(row.amount_vnd)))issues.push({table:'Expenses',record:id(row.id),message:'Phiếu thiếu trạng thái hoặc số tiền hợp lệ; giữ nguyên.'});
 // Recompute ONLY known invalid work-minute cells when actual timestamps support it.
 const attendance=candidate.books.main.Attendance,h=attendance[0],wc=h.indexOf('work_minutes');
 for(const row of attendance.slice(1))if(/^#/.test(str(row[wc]))){
  const entry=Object.fromEntries(h.map((k,i)=>[k,row[i]])),a=new Date(entry.check_in),b=new Date(entry.check_out),day=str(entry.date),ls=new Date(day+'T12:00:00+07:00'),le=new Date(day+'T13:30:00+07:00');
  if(entry.check_in&&entry.check_out&&Number.isFinite(a.getTime())&&Number.isFinite(b.getTime())&&b>=a&&Number.isFinite(ls.getTime())){const old=row[wc],value=Math.max(0,Math.round((b-a-Math.max(0,Math.min(b,le)-Math.max(a,ls)))/60000));row[wc]=value;repairs.push({table:'Attendance',record:entry.id,column:'work_minutes',before:old,after:value,method:'Tính từ giờ vào/ra, trừ nghỉ trưa 12:00–13:30'});}else issues.push({table:'Attendance',record:entry.id,message:'Phút làm việc lỗi và giờ vào/ra chưa đủ để tính lại. Giữ nguyên.'});
 }
 const posts=new Set(rows(candidate.books.main.Announcements).map(p=>id(p.id)));for(const row of rows(candidate.books.main.PostComments))if(!posts.has(id(row.post_id)))issues.push({table:'PostComments',record:row.id,message:'Thiếu bài viết gốc; giữ bình luận trong dữ liệu.'});
 const manifest=new Map();
 for(const row of rows(candidate.books.main.Expenses))for(const k of ['bill_file_id','payment_file_id'])if(id(row[k]))manifest.set(id(row[k]),{id:id(row[k]),status:'pending'});
 for(const row of rows(candidate.books.main.ExpenseAttachments))if(id(row.file_id))manifest.set(id(row.file_id),{id:id(row.file_id),status:'pending'});
 for(const row of rows(candidate.books.main.Notifications))if(id(row.photo_file_id))manifest.set(id(row.photo_file_id),{id:id(row.photo_file_id),status:'pending'});
 for(const file of manifest.values())if(!/^[\w-]{15,150}$/.test(file.id))throw Error('ID tệp Drive không hợp lệ.');
 const notif=candidate.books.main.Notifications,nh=notif[0],status=nh.indexOf('status');for(const row of notif.slice(1))if(['pending','failed','sending'].includes(str(row[status])))row[status]='migration_hold';
 candidate.outbox=[];
 // Reuse the deployed private personnel book only when no new private export exists.
 const oldPrivate=current.properties?.HR_PRIVATE_SHEET_ID;
 if(oldPrivate&&current.books[oldPrivate]){candidate.properties.HR_PRIVATE_SHEET_ID=oldPrivate;candidate.books[oldPrivate]=structuredClone(current.books[oldPrivate]);}
 if(bundle.privateSheets){
  const privateId=candidate.properties.HR_PRIVATE_SHEET_ID;
  for(const name of ['BankProfiles','PersonnelAudit']){
   const matrix=bundle.privateSheets[name];if(!Array.isArray(matrix)||!Array.isArray(matrix[0]))throw Error('Thiếu bảng hồ sơ riêng '+name);
   const expected=candidate.books[privateId][name]?.[0],headers=matrix[0];if(!expected||new Set(headers).size!==headers.length||expected.some(k=>!headers.includes(k)))throw Error('Tiêu đề hồ sơ riêng không khớp '+name);
   const combined=[...expected,...headers.filter(k=>!expected.includes(k))];candidate.books[privateId][name]=[combined,...matrix.slice(1).map(r=>combined.map(k=>r[headers.indexOf(k)]??''))];counts['private/'+name]=matrix.length-1;
  }
 }else issues.push({table:'BankProfiles',message:'Bản xuất chính không có hồ sơ riêng; giữ hồ sơ hiện có của web. Cần bổ sung bản xuất hồ sơ cũ nếu có.'});
 if(current.webFinance)candidate.webFinance=structuredClone(current.webFinance);
 // Deliberately keep live web admin office settings, not stale exported GPS.
 const gpsKeys=['hr_telegram_id','accountant_telegram_id','office_name','office_lat','office_lng','radius_m','start_time','end_time','lunch_start','lunch_end'];
 const live=current.books.main.Settings||[],settings=candidate.books.main.Settings;for(const [key,value] of live.slice(1))if(gpsKeys.includes(key)&&(str(value)||current.staffRosterAuthoritative&&['hr_telegram_id','accountant_telegram_id'].includes(key))){const found=settings.find(r=>r[0]===key);if(found)found[1]=value;else settings.push([key,value]);}
 retainProjectImages(candidate,current);
 const previews=[];for(const person of people.filter(p=>str(p.active).toLowerCase()==='true'))try{const rt=createRuntime(candidate,{employeeId:id(person.telegram_id)});rt.run('snapshotCore',['supabase']);previews.push({id:id(person.telegram_id),ok:true});}catch(e){previews.push({id:id(person.telegram_id),ok:false,error:e.message});}
 if(previews.some(x=>!x.ok))issues.push({table:'Runtime',message:'Có tài khoản không tải được app. Cần xử lý trước khi kích hoạt.',blocking:true});
 const result={kind:'viral-migration',source:{name:bundle.fileName,sha256:bundle.sourceSHA256},counts,issues,repairs,previews,candidate,files:[...manifest.values()],folderId:bundle.driveFolderId||'',originalWorkbook:bundle,status:'prepared',preparedAt:new Date().toISOString()};
 candidate.migrationMeta={source:result.source,counts,issues,repairs,preparedAt:result.preparedAt};return result;
}
export function migrationPublic(stage){const d=stage.data;return {id:stage.id,version:stage.version,status:d.status,source:d.source,counts:d.counts,issues:d.issues,repairs:d.repairs,previews:d.previews,files:d.files,folderId:d.folderId,employees:rows(d.candidate.books.main.Employees).map(p=>({id:id(p.telegram_id),name:p.name,role:p.role,active:str(p.active).toLowerCase()==='true'})),ready:d.files.every(f=>f.status==='copied')&&!d.issues.some(x=>x.blocking)};}
export function rewriteBillURLs(data,fileId,baseURL=''){
 const url=baseURL+'/api/viral/file?id='+encodeURIComponent(fileId),expenses=data.books.main.Expenses,h=expenses[0];
 for(const r of expenses.slice(1))for(const [k,u] of [['bill_file_id','bill_url'],['payment_file_id','payment_url']])if(id(r[h.indexOf(k)])===fileId)r[h.indexOf(u)]=url;
 const extra=data.books.main.ExpenseAttachments,eh=extra[0];for(const r of extra.slice(1))if(id(r[eh.indexOf('file_id')])===fileId)r[eh.indexOf('file_url')]=url;
}
export async function copyDriveBill(fileId,folderId,client,fetcher=fetch){
 if(!/^[\w-]{15,150}$/.test(fileId)||!/^[\w-]{15,150}$/.test(folderId))throw Error('ID Drive không hợp lệ.');
 const deadline=AbortSignal.timeout(40000);
 const headers=await client.getRequestHeaders(),auth=Object.fromEntries(headers.entries());
 const get=async(id,fields)=>{const r=await fetcher('https://www.googleapis.com/drive/v3/files/'+id+'?'+new URLSearchParams({fields,supportsAllDrives:'true'}),{headers:auth,signal:deadline});if(!r.ok)throw Error('Không đọc được tệp/thư mục Drive. Kiểm tra quyền Viewer và Drive API.');return r.json();};
 const meta=await get(fileId,'id,name,mimeType,size,md5Checksum,parents,trashed,capabilities(canDownload)');
 if(meta.trashed||meta.capabilities?.canDownload===false||!/^image\/(jpeg|png|webp|gif|heic|heif)$/.test(meta.mimeType))throw Error('Tệp không phải ảnh bill được hỗ trợ hoặc không cho phép tải.');
 if(!Number.isFinite(Number(meta.size))||Number(meta.size)<=0||Number(meta.size)>10*1024*1024)throw Error('Ảnh bill vượt giới hạn 10 MB hoặc thiếu kích thước.');
 let parents=meta.parents||[],inside=parents.includes(folderId),depth=0;
 while(!inside&&parents.length&&depth++<10){const parent=await get(parents[0],'parents');parents=parent.parents||[];inside=parents.includes(folderId);}
 if(!inside)throw Error('Ảnh không thuộc thư mục bill đã chọn.');
 const r=await fetcher('https://www.googleapis.com/drive/v3/files/'+fileId+'?alt=media&supportsAllDrives=true',{headers:auth,signal:deadline});if(!r.ok)throw Error('Không tải được ảnh Drive.');
 // Bound actual stream size, not only Google metadata.
 const reader=r.body.getReader(),parts=[];let length=0;while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>10*1024*1024){await reader.cancel();throw Error('Ảnh tải về vượt 10 MB.');}parts.push(Buffer.from(value));}
 const bytes=Buffer.concat(parts);if(bytes.length!==Number(meta.size))throw Error('Kích thước tải về không khớp ảnh gốc.');
 if(meta.md5Checksum&&crypto.createHash('md5').update(bytes).digest('hex')!==meta.md5Checksum)throw Error('Kiểm tra ảnh tải về không khớp bản gốc.');
 return {bytes,name:meta.name,type:meta.mimeType,sha256:crypto.createHash('sha256').update(bytes).digest('hex')};
}
