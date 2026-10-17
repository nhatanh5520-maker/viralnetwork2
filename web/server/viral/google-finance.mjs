import {JWT} from 'google-auth-library';
import {financeConfig} from './admin.mjs';
export function gridBook(response,name,dateColumn=1){
 const sheet=response.sheets?.find(s=>s.properties?.title===name);if(!sheet)throw Error('Không thấy tab kế toán đã cấu hình.');
 const cells=[],links=[],formulas=[];
 for(const grid of sheet.data||[])for(const [ri,row] of (grid.rowData||[]).entries()){
  const r=(grid.startRow||0)+ri;cells[r]??=[];links[r]??=[];formulas[r]??=[];
  for(const [ci,cell] of (row.values||[]).entries()){
   const c=(grid.startColumn||0)+ci,v=cell.effectiveValue||{};
   // Legacy dates are in B; the new ledger uses A. Never convert month numbers.
   let value=v.numberValue??v.stringValue??v.boolValue??(v.errorValue?'#SHEET_ERROR:'+v.errorValue.type:'');
   if(c===dateColumn&&typeof value==='number'&&value>0)value=new Date(Date.UTC(1899,11,30)+Math.floor(value)*86400000).toISOString().slice(0,10);
   cells[r][c]=value;formulas[r][c]=cell.userEnteredValue?.formulaValue||'';
   links[r][c]=[...new Set([cell.hyperlink,cell.userEnteredFormat?.textFormat?.link?.uri,...(cell.textFormatRuns||[]).map(x=>x.format?.link?.uri)].filter(Boolean))];
  }
 }
 // Preserve blank top rows: the legacy accountant sheet has headers at rows 7–8.
 for(let i=0;i<cells.length;i++){cells[i]??=[];links[i]??=[];formulas[i]??=[];}
 return {cells,links,formulas,timeZone:response.properties?.timeZone||'Asia/Ho_Chi_Minh'};
}
export async function readFinanceBook(data,env=process.env,fetcher=fetch){
 const config=financeConfig(data.webFinance||{sheetId:env.FINANCE_SHEET_ID,sheetName:env.FINANCE_SHEET_NAME||'DATA TỔNG'});
 const email=env.GOOGLE_SERVICE_ACCOUNT_EMAIL,key=env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g,'\n');
 if(!email||!key)throw Error('Chưa cấu hình tài khoản đọc Google Sheets trên Vercel.');
 const jwt=new JWT({email,key,scopes:['https://www.googleapis.com/auth/spreadsheets.readonly']});let token;
 try{token=await jwt.getAccessToken();}catch{throw Error('Không xác thực được tài khoản Google Sheets. Kiểm tra email và private key trên Vercel.');}
 const params=new URLSearchParams({ranges:"'"+config.sheetName.replaceAll("'","''")+"'!A1:K50009",fields:'properties(timeZone),sheets(properties(title),data(startRow,startColumn,rowData(values(effectiveValue,userEnteredValue,hyperlink,textFormatRuns,effectiveFormat(numberFormat),userEnteredFormat(textFormat)))))'});
 const get=async(p)=>{let response;try{response=await fetcher('https://sheets.googleapis.com/v4/spreadsheets/'+config.sheetId+'?'+p,{headers:{Authorization:'Bearer '+token.token},cache:'no-store',signal:AbortSignal.timeout(20000)});}catch{throw Error('Kết nối Google Sheets quá thời gian. Hãy thử lại.');}
 if(!response.ok)throw Error(response.status===403?'Google từ chối quyền đọc. Bật Sheets API và chia sẻ sheet cho email service account (Viewer).':response.status===404?'Không tìm thấy sheet hoặc tài khoản chưa có quyền xem.':response.status===400?'Không tìm thấy tab kế toán. Kiểm tra đúng tên tab, kể cả dấu cách.':'Google Sheets chưa phản hồi thành công. Hãy thử lại.');return response.json();};
 const raw=await get(params);
 // Detect the header before parsing so already-saved DATA TỔNG settings work without resaving.
 const plain=gridBook(raw,config.sheetName,null),ledger=String(plain.cells[0]?.[0]||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/Đ/g,'D').replace(/\s+/g,' ').trim().toUpperCase()==='NGAY THUC HIEN GIAO DICH';
 const book=ledger?gridBook(raw,config.sheetName,0):gridBook(raw,config.sheetName);
 if(book.cells.length>=50009)throw Error('Sheet vượt phạm vi 50.000 giao dịch. Cần mở rộng cấu hình đọc trước khi báo cáo.');
 if(!ledger)return {config,book};
 params.set('ranges',"'"+config.detailSheetName.replaceAll("'","''")+"'!A1:E50009");
 const detailBook=gridBook(await get(params),config.detailSheetName,0);
 if(detailBook.cells.length>=50009)throw Error('Tab chi tiết vượt phạm vi đọc. Cần mở rộng trước khi báo cáo.');
 return {config,book,detailBook,format:'ledger-v2'};
}
