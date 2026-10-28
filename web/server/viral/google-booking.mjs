import {JWT} from 'google-auth-library';
export const BOOKING_SHEET_ID='1oCiRiVGnWaGPr9Q15iyIbwY-8sPxMrYZcgs8yTDYEhk';
export const BOOKING_SHEET_NAME='3. Quản Lý Đơn Hàng Booking';
export function createBookingReader({env=process.env,fetcher=fetch,tokenProvider,now=Date.now,ttlMs=30000}={}){
 let cached=null,pending=null;
 return async function read({refresh=false}={}){
  if(pending)return structuredClone(await pending);
  if(!refresh&&cached&&now()-cached.at<ttlMs)return structuredClone(cached.book);
  const operation=(async()=>{
   const sheetId=env.BOOKING_SHEET_ID||BOOKING_SHEET_ID,sheetName=env.BOOKING_SHEET_NAME||BOOKING_SHEET_NAME;
   if(!/^[\w-]{20,150}$/.test(sheetId)||!sheetName||sheetName.length>100)throw Error('Cấu hình Google Sheet booking không hợp lệ.');
   const email=env.GOOGLE_SERVICE_ACCOUNT_EMAIL,key=env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g,'\n');
   if(!tokenProvider&&(!email||!key))throw Error('Chưa cấu hình tài khoản Google đọc Sheet trên Vercel. Dùng GOOGLE_SERVICE_ACCOUNT_EMAIL và GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY như phần chấm công/Thu chi.');
   let token;
   try{token=tokenProvider?await tokenProvider(): (await new JWT({email,key,scopes:['https://www.googleapis.com/auth/spreadsheets.readonly']}).getAccessToken()).token;}catch{throw Error('Không xác thực được Google Sheets. Kiểm tra cấu hình tài khoản Google trên Vercel.');}
   const base='https://sheets.googleapis.com/v4/spreadsheets/'+sheetId;
   const get=async params=>{
    let response;try{response=await fetcher(base+'?'+params,{headers:{Authorization:'Bearer '+token},cache:'no-store',signal:AbortSignal.timeout(15000)});}catch{throw Error('Đọc Sheet booking quá thời gian. Vui lòng thử lại.');}
    if(!response.ok)throw Error(response.status===403?'Chưa có quyền đọc Sheet CRM. Chia sẻ Sheet cho email GOOGLE_SERVICE_ACCOUNT_EMAIL trên Vercel với quyền Người xem.':response.status===404?'Không tìm thấy Sheet CRM hoặc tài khoản Google chưa được chia sẻ.':'Không đọc được Sheet booking. Vui lòng thử lại.');
    return response.json();
   };
   const meta=await get(new URLSearchParams({fields:'sheets(properties(sheetId,title,gridProperties(rowCount,columnCount)))'}));
   const sheet=meta.sheets?.find(s=>s.properties?.title===sheetName)?.properties;
   if(!sheet)throw Error('Không tìm thấy tab '+sheetName+' trong Sheet CRM.');
   const rows=sheet.gridProperties?.rowCount||1000;
   if(rows>50000)throw Error('Tab booking vượt phạm vi 50.000 dòng. Cần mở rộng phạm vi đọc trước khi báo cáo.');
   const columns=Math.min(sheet.gridProperties?.columnCount||26,52),column=n=>n<=26?String.fromCharCode(64+n):'A'+String.fromCharCode(64+n-26);
   const range="'"+sheetName.replaceAll("'","''")+"'!A1:"+column(columns)+rows;
   const raw=await get(new URLSearchParams({ranges:range,fields:'sheets(data(startRow,startColumn,rowData(values(effectiveValue))))'}));
   const cells=[];
   for(const s of raw.sheets||[])for(const grid of s.data||[])for(const [ri,row] of (grid.rowData||[]).entries()){
    const r=(grid.startRow||0)+ri;cells[r]??=[];
    for(const [ci,cell] of (row.values||[]).entries()){
     const value=cell.effectiveValue||{};cells[r][(grid.startColumn||0)+ci]=value.numberValue??value.stringValue??value.boolValue??(value.errorValue?'#SHEET_ERROR:'+value.errorValue.type:'');
    }
   }
   const book={cells,sheetName,sheetUrl:'https://docs.google.com/spreadsheets/d/'+sheetId+'/edit#gid='+sheet.sheetId,readAt:new Date(now()).toISOString()};
   cached={at:now(),book:structuredClone(book)};return book;
  })();
  pending=operation;
  try{return structuredClone(await operation);}finally{if(pending===operation)pending=null;}
 };
}
// The RPC must authorize the current active Director before calling this reader.
export const readBookingBook=createBookingReader();
