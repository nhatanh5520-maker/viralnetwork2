import {createHash} from 'node:crypto';

export const ATTENDANCE_SHEET_ID='1VNqrBFuLrte3zju7d0MzPoft0yzJwN8pHveJVh2t84w';
export const RAW_SHEET='Dữ liệu gốc';
export const REPORT_HEADERS=['Ngày','Mã NV','Họ tên','Bộ phận','Giờ vào','Giờ ra','Muộn (phút)','Làm việc (phút)','Địa điểm','Trạng thái duyệt','Ghi chú','ID chấm công','Telegram ID'];
export const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const object=(headers,row)=>Object.fromEntries(headers.map((key,i)=>[key,row[i]??'']));
const point=value=>value?(typeof value==='string'?JSON.parse(value):value):null;
export function vnDay(now=new Date()){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);}
export function checkGrid(grid){
 if(!Array.isArray(grid)||!Array.isArray(grid[0])||!['id','telegram_id','date','check_in','check_out'].every(k=>grid[0].includes(k)))throw Error('Thiếu cấu trúc chấm công.');
 const ids=new Set(),idCol=grid[0].indexOf('id');
 for(const row of grid.slice(1)){const id=String(row[idCol]??'');if(!id||ids.has(id)||!Array.isArray(row))throw Error('ID chấm công trống hoặc trùng.');ids.add(id);}
 return grid;
}
export function archiveCandidates(grid,before=vnDay()){
 checkGrid(grid);return grid.slice(1).filter(row=>{
  const r=object(grid[0],row),a=new Date(r.check_in),b=new Date(r.check_out);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(r.date)||r.date>=before||!r.check_in||!r.check_out||!Number.isFinite(+a)||!Number.isFinite(+b)||b<a)return false;
  if(!Number.isFinite(Number(r.work_minutes))||Number(r.work_minutes)<0)return false;
  try{return ['in_context','out_context'].every(k=>!r[k]||point(r[k])?.status==='approved');}catch{return false;}
 });
}
export function rawRows(grid){
 checkGrid(grid);
 return [['ID chấm công','Bản ghi JSON','SHA-256'],['__headers__',JSON.stringify(grid[0]),hash(grid[0])],...grid.slice(1).map(row=>[String(row[grid[0].indexOf('id')]),JSON.stringify(row),hash(row)])];
}
export function parseRaw(rows){
 if(rows?.[1]?.[0]!=='__headers__')throw Error('Tab dữ liệu gốc không đúng định dạng.');
 const grid=rows.slice(1).filter(row=>row[0]).map(row=>{
  const parsed=JSON.parse(row[1]);if(hash(parsed)!==row[2])throw Error('Dữ liệu gốc đã thay đổi, cần đối chiếu trước khi tiếp tục.');
  return parsed;
 });
 checkGrid(grid);for(let i=2;i<rows.length;i++)if(rows[i]?.[0]&&String(grid[i-1][grid[0].indexOf('id')])!==String(rows[i][0]))throw Error('ID dữ liệu gốc không khớp.');
 return grid;
}
export function reportRows(grid,employees){
 checkGrid(grid);const people=new Map((employees||[]).slice(1).map(row=>{const p=object(employees[0],row);return [String(p.telegram_id),p];}));
 const time=value=>{if(!value)return '';const d=new Date(value);return Number.isFinite(+d)?new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Ho_Chi_Minh',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(d):'Giờ không hợp lệ';};
 return [REPORT_HEADERS,...grid.slice(1).map(row=>object(grid[0],row)).sort((a,b)=>String(b.date).localeCompare(String(a.date))||String(b.check_in).localeCompare(String(a.check_in))).map(r=>{
  const p=people.get(String(r.telegram_id)),notes=[];let pins=[],invalid=false;
  for(const k of ['in_context','out_context'])try{pins.push(point(r[k]));}catch{pins.push(null);invalid=true;notes.push('Thông tin duyệt cần kiểm tra');}
  if(!p)notes.push('Chưa tìm thấy nhân viên tương ứng trong danh sách hiện tại');
  const statuses=pins.filter(Boolean).map(p=>p.status);
  const status=invalid?'Cần kiểm tra':statuses.some(s=>s!=='approved')?'Chờ xác nhận / bổ sung':!r.check_out?'Chưa xuống ca':'Đã xác nhận';
  const places=[...new Set(pins.filter(Boolean).map(p=>[p.project,p.place].filter(Boolean).join(' · ')).filter(Boolean))];
  for(const p of pins.filter(Boolean))if(p.reason)notes.push(p.reason);
  const day=String(r.date).replace(/^(\d{4})-(\d{2})-(\d{2})$/,'$3/$2/$1');
  return [day,p?.employee_code||p?.employee_id||'',p?.name||'Chưa đối chiếu tên',p?.department||'',time(r.check_in),time(r.check_out),r.late_minutes??'',r.check_out?(r.work_minutes??''):'',places.join(' / '),status,notes.join(' · '),String(r.id),String(r.telegram_id)];
 })];
}
export function mergeGrid(live,archived){
 checkGrid(live);if(!archived)return structuredClone(live);checkGrid(archived);
 if(hash(live[0])!==hash(archived[0]))throw Error('Cấu trúc công đã thay đổi. Cần chuyển đổi dữ liệu lưu trữ trước.');
 const id=live[0].indexOf('id'),map=new Map(archived.slice(1).map(r=>[String(r[id]),r]));
 for(const row of live.slice(1))map.set(String(row[id]),row);
 return [live[0],...map.values()];
}
export function archiveManifest(grid,ids){
 const idCol=grid[0].indexOf('id'),wanted=new Set(ids),rows=grid.slice(1).filter(r=>wanted.has(String(r[idCol]))).sort((a,b)=>String(a[idCol]).localeCompare(String(b[idCol])));
 if(rows.length!==wanted.size)throw Error('Thiếu bản ghi lưu trữ.');
 return {ids:[...wanted].sort(),digest:hash([grid[0],...rows])};
}
export function archiveSummary(grid){
 const out={};for(const row of grid.slice(1)){const r=object(grid[0],row),month=String(r.date).slice(0,7),id=String(r.telegram_id);out[month]??={};out[month][id]??={days:0,minutes:0};out[month][id].days++;out[month][id].minutes+=Number(r.work_minutes)||0;}return out;
}
export function selectArchive(grid,meta){
 const m=archiveManifest(grid,meta.ids);if(m.digest!==meta.digest)throw Error('Bản lưu trữ không khớp Supabase. Không tải dữ liệu thiếu hoặc đã bị sửa.');
 const ids=new Set(meta.ids),id=grid[0].indexOf('id');return [grid[0],...grid.slice(1).filter(r=>ids.has(String(r[id])))];
}
export function preparePrune(data,raw,before=vnDay()){
 const live=data.books.main.Attendance;checkGrid(live);checkGrid(raw);
 const previous=data.attendanceArchive;
 if(previous)selectArchive(raw,previous);
 const eligible=archiveCandidates(live,before),ids=eligible.map(r=>String(r[live[0].indexOf('id')]));
 const rawMap=new Map(raw.slice(1).map(r=>[String(r[raw[0].indexOf('id')]),r]));
 if(hash(live[0])!==hash(raw[0])||eligible.some(r=>hash(rawMap.get(String(r[live[0].indexOf('id')])))!==hash(r)))throw Error('Dữ liệu công thay đổi sau khi sao chép. Chạy đồng bộ lại trước khi dọn.');
 const manifest=archiveManifest(raw,[...(previous?.ids||[]),...ids]);
 const next=structuredClone(data),gone=new Set(ids);
 next.books.main.Attendance=[live[0],...live.slice(1).filter(r=>!gone.has(String(r[live[0].indexOf('id')])))];
 // Derived HR view is rebuilt from live + archive; never leave stale bulk copies in the hot state.
 if(next.books.main['Chấm công HR'])next.books.main['Chấm công HR']=next.books.main['Chấm công HR'].slice(0,1);
 const archived=selectArchive(raw,manifest);
 next.attendanceArchive={schema:1,sheetId:ATTENDANCE_SHEET_ID,rawSheet:RAW_SHEET,...manifest,summary:archiveSummary(archived),before,archivedAt:new Date().toISOString()};
 return {next,moved:ids.length,retained:next.books.main.Attendance.length-1,archived:manifest.ids.length};
}
let archiveCache;
async function sheetsClient(write=false,env=process.env){
 const {JWT}=await import('google-auth-library');
 if(!env.GOOGLE_SERVICE_ACCOUNT_EMAIL||!env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY)throw Error('Chưa cấu hình tài khoản Google Sheets trên Vercel.');
 const auth=new JWT({email:env.GOOGLE_SERVICE_ACCOUNT_EMAIL,key:env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.replace(/\\n/g,'\n'),scopes:['https://www.googleapis.com/auth/spreadsheets'+(write?'':'.readonly')]});
 const token=await auth.getAccessToken();return async(path,body)=>{
  const res=await fetch('https://sheets.googleapis.com/v4/spreadsheets/'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token.token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),cache:'no-store',signal:AbortSignal.timeout(20000)});
  if(!res.ok)throw Error('Không truy cập được Sheet chấm công ('+res.status+'). Kiểm tra Sheets API và quyền service account.');return res.json();
 };
}
export async function readRawAttendance(sheetId=ATTENDANCE_SHEET_ID){
 const request=await sheetsClient();const range=encodeURIComponent("'"+RAW_SHEET+"'!A1:C50002");
 const result=await request(sheetId+'/values/'+range+'?valueRenderOption=UNFORMATTED_VALUE');
 if((result.values||[]).length>=50002)throw Error('Kho công vượt giới hạn đọc; cần mở rộng trước khi tiếp tục.');return parseRaw(result.values||[]);
}
export async function loadAttendanceArchive(data){
 const meta=data.attendanceArchive;if(!meta?.ids?.length)return null;
 if(meta.sheetId!==ATTENDANCE_SHEET_ID||meta.rawSheet!==RAW_SHEET)throw Error('Cấu hình kho công không hợp lệ.');
 const key=meta.digest+':'+meta.sheetId;
 if(archiveCache?.key===key&&archiveCache.expires>Date.now())return structuredClone(archiveCache.grid);
 const grid=selectArchive(await readRawAttendance(meta.sheetId),meta);archiveCache={key,grid,expires:Date.now()+60000};return structuredClone(grid);
}
export function overlayAttendance(data,archive){
 if(!archive)return {input:data,strip:x=>x};
 const input=structuredClone(data),live=data.books.main.Attendance,archivedIds=new Set(data.attendanceArchive.ids);
 input.books.main.Attendance=mergeGrid(live,archive);
 return {input,strip(output){
  const final=output.books.main.Attendance,id=final[0].indexOf('id');
  const rows=final.slice(1).filter(r=>archivedIds.has(String(r[id])));
  if(archiveManifest([final[0],...rows],data.attendanceArchive.ids).digest!==data.attendanceArchive.digest)throw Error('Công đã lưu trữ chỉ được xem. Cần khôi phục trước khi sửa.');
  output.books.main.Attendance=[final[0],...final.slice(1).filter(r=>!archivedIds.has(String(r[id])))];
  if(output.books.main['Chấm công HR'])output.books.main['Chấm công HR']=output.books.main['Chấm công HR'].slice(0,1);
  return output;
 }};
}
export async function syncAttendanceSheet(data){
 const archive=await loadAttendanceArchive(data),grid=mergeGrid(data.books.main.Attendance,archive),report=reportRows(grid,data.books.main.Employees),raw=rawRows(grid);
 const request=await sheetsClient(true),meta=await request(ATTENDANCE_SHEET_ID+'?fields=sheets(properties)');
 const getSheet=name=>meta.sheets.find(s=>s.properties.title===name)?.properties;
 const reportSheet=getSheet('Chấm công'),rawSheet=getSheet(RAW_SHEET);
 if(!reportSheet||!rawSheet)throw Error('Thiếu tab Chấm công hoặc Dữ liệu gốc. Dừng để tránh ghi nhầm.');
 if(grid.length>50000||raw.some(r=>String(r[1]).length>49000))throw Error('Dữ liệu vượt giới hạn Sheet; chưa xóa dữ liệu.');
 for(const [sheet,values] of [[reportSheet,report],[rawSheet,raw]]){
  if(sheet.gridProperties.rowCount<values.length||sheet.gridProperties.columnCount<values[0].length)await request(ATTENDANCE_SHEET_ID+':batchUpdate',{requests:[{updateSheetProperties:{properties:{sheetId:sheet.sheetId,gridProperties:{rowCount:Math.max(sheet.gridProperties.rowCount,values.length),columnCount:Math.max(sheet.gridProperties.columnCount,values[0].length)}},fields:'gridProperties.rowCount,gridProperties.columnCount'}}]});
  for(let i=0;i<values.length;i+=100){const chunk=values.slice(i,i+100);await request(ATTENDANCE_SHEET_ID+':batchUpdate',{requests:[{updateCells:{start:{sheetId:sheet.sheetId,rowIndex:i,columnIndex:0},rows:chunk.map(r=>({values:r.map(v=>({userEnteredValue:typeof v==='number'?{numberValue:v}:{stringValue:String(v??'')}}))})),fields:'userEnteredValue'}}]});}
 }
 // Read back every original value before allowing any deletion.
 const verified=await readRawAttendance();
 if(hash(verified)!==hash(grid))throw Error('Đối chiếu bản gốc thất bại. Không dọn Supabase.');
 return {grid,rows:grid.length-1};
}
