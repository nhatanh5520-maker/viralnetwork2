// Writes app bookings into the CRM order tab ("3. Quản Lý Đơn Hàng Booking"), the same tab the
// Directors' revenue report reads. Rules that keep manual data safe:
//  * A booking's row is the row whose "Mã Đơn Hàng" equals the booking's order code.
//  * A new booking takes the first completely empty row under the header (rows holding anything,
//    including pre-generated order codes, are never taken), otherwise a new row at the bottom.
//  * Only the columns listed below are written. Chi phí, Trạng thái thanh toán, Mã KH, Ghi chú…
//    stay as people typed them. Missing columns are added to the right of the header.
//  * Only cells whose value differs are sent, so re-running is cheap and idempotent.
import {JWT} from 'google-auth-library';
import {googleAuthError} from './google-auth-reason.mjs';
import {bookingHeader} from './booking-report.mjs';
import {BOOKING_SHEET_ID,BOOKING_SHEET_NAME} from './google-booking.mjs';

const normalize=value=>String(value??'').normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/đ/g,'d').replace(/Đ/g,'D').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const text=value=>String(value??'').trim();
// Columns the report already recognizes (by its aliases); added with this name when missing.
const REPORT_COLUMNS=[['id','code',null],['date','date',null],['customer','brand',null],['project','project',null],['quantity','quantity','Số lượng video'],['revenue','amount',null],['status','status','Trạng thái booking'],['sales','account','Sales phụ trách'],['url','final_url','Link video final']];
// Extra columns owned by the app.
export const EXTRA_COLUMNS=[['title','Tiêu đề video'],['cc','Content Creator'],['vj','VJ'],['talent','Talent thực hiện'],['editor','Editor'],['shoot_at','Ngày quay'],['deliver_at','Ngày trả video'],['acceptance_at','Ngày nghiệm thu'],['script_url','Link kịch bản'],['tiktok_url','Link TikTok'],['facebook_url','Link Facebook'],['views','View'],['likes','Thích'],['comments','Bình luận'],['shares','Chia sẻ'],['accepted_at','Nghiệm thu lúc'],['accepted_by','Người nghiệm thu'],['updated_at','Cập nhật từ app']];

/**
 * Pure planning step. cells: the tab as a 2D array (row 0 = sheet row 1).
 * Returns {headerRow, headers:[{col,name}], writes:[{row,col,value}], rowsNeeded, columnsNeeded}
 * with 0-based row/col indexes.
 */
export function planBookingSheet(cells,bookings){
 const {row:headerRow,columns}=bookingHeader(cells),header=cells[headerRow]||[];
 let width=header.length;const headers=[],column={};
 const add=name=>{const col=width++;headers.push({col,name});return col;};
 for(const [alias,key,name] of REPORT_COLUMNS)column[key]=columns[alias]>=0?columns[alias]:add(name);
 const existing=new Map(header.map((h,i)=>[normalize(h),i]).filter(([h])=>h));
 for(const [key,name] of EXTRA_COLUMNS)column[key]=existing.has(normalize(name))?existing.get(normalize(name)):add(name);
 const idCol=column.code,byCode=new Map(),free=[];
 for(let r=headerRow+1;r<cells.length;r++){
  const row=cells[r]||[],code=text(row[idCol]);
  if(code){if(!byCode.has(code))byCode.set(code,r);continue;}
  if(!row.some(v=>text(v)))free.push(r);
 }
 let next=Math.max(cells.length,headerRow+1);const writes=[];
 for(const b of bookings){
  const code=text(b.code);if(!code)continue;
  let r=byCode.get(code);
  if(r===undefined){r=free.length?free.shift():next++;byCode.set(code,r);}
  const current=cells[r]||[];
  for(const [key,col] of Object.entries(column)){
   const value=b[key]===undefined||b[key]===null?'':b[key];
   if(text(current[col])!==text(value))writes.push({row:r,col,value});
  }
 }
 const rowsNeeded=Math.max(cells.length,...writes.map(w=>w.row+1),headerRow+1),columnsNeeded=width;
 return {headerRow,headers,writes,rowsNeeded,columnsNeeded};
}

export const columnName=index=>{let n=index+1,s='';while(n>0){const m=(n-1)%26;s=String.fromCharCode(65+m)+s;n=Math.floor((n-1)/26);}return s;};

/** Reads the tab, applies the plan and writes only changed cells. Returns {written, headersAdded}. */
export async function syncBookingSheet(bookings,{env=process.env,fetcher=fetch,tokenProvider}={}){
 const sheetId=env.BOOKING_SHEET_ID||BOOKING_SHEET_ID,sheetName=env.BOOKING_SHEET_NAME||BOOKING_SHEET_NAME;
 if(!/^[\w-]{20,150}$/.test(sheetId)||!sheetName||sheetName.length>100)throw Error('Cấu hình Google Sheet booking không hợp lệ.');
 const email=env.GOOGLE_SERVICE_ACCOUNT_EMAIL,key=env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g,'\n');
 if(!tokenProvider&&(!email||!key))throw Error('Chưa cấu hình tài khoản Google (GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY).');
 let token;
 try{token=tokenProvider?await tokenProvider():(await new JWT({email,key,scopes:['https://www.googleapis.com/auth/spreadsheets']}).getAccessToken()).token;}catch(error){throw googleAuthError(error,'booking_sheet_sync');}
 const base='https://sheets.googleapis.com/v4/spreadsheets/'+sheetId;
 const request=async(url,body)=>{
  let response;try{response=await fetcher(url,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,cache:'no-store',signal:AbortSignal.timeout(15000)});}
  catch{throw Error('Ghi Sheet booking quá thời gian.');}
  if(!response.ok)throw Error(response.status===403?'Chưa có quyền ghi Sheet CRM. Chia sẻ Sheet cho email GOOGLE_SERVICE_ACCOUNT_EMAIL với quyền Người chỉnh sửa.':response.status===404?'Không tìm thấy Sheet CRM.':'Không ghi được Sheet booking (HTTP '+response.status+').');
  return response.json();
 };
 const meta=await request(base+'?fields='+encodeURIComponent('sheets(properties(sheetId,title,gridProperties(rowCount,columnCount)))'));
 const sheet=meta.sheets?.find(s=>s.properties?.title===sheetName)?.properties;
 if(!sheet)throw Error('Không tìm thấy tab '+sheetName+' trong Sheet CRM.');
 const quoted="'"+sheetName.replaceAll("'","''")+"'",grid=sheet.gridProperties||{};
 const read=await request(base+'/values/'+encodeURIComponent(quoted+'!A1:'+columnName(Math.max(1,grid.columnCount||26)-1)+Math.max(1,grid.rowCount||1000))+'?valueRenderOption=UNFORMATTED_VALUE');
 const plan=planBookingSheet(read.values||[],bookings);
 if(!plan.headers.length&&!plan.writes.length)return {written:0,headersAdded:0};
 const grow=[];
 if(plan.columnsNeeded>(grid.columnCount||0))grow.push({appendDimension:{sheetId:sheet.sheetId,dimension:'COLUMNS',length:plan.columnsNeeded-(grid.columnCount||0)}});
 if(plan.rowsNeeded>(grid.rowCount||0))grow.push({appendDimension:{sheetId:sheet.sheetId,dimension:'ROWS',length:plan.rowsNeeded-(grid.rowCount||0)}});
 if(grow.length)await request(base+':batchUpdate',{requests:grow});
 const data=[...plan.headers.map(h=>({row:plan.headerRow,col:h.col,value:h.name})),...plan.writes].map(w=>({range:quoted+'!'+columnName(w.col)+(w.row+1),values:[[w.value]]}));
 for(let i=0;i<data.length;i+=500)await request(base+'/values:batchUpdate',{valueInputOption:'RAW',data:data.slice(i,i+500)});
 return {written:plan.writes.length,headersAdded:plan.headers.length};
}
