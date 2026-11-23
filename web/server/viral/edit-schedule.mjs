// Lịch dựng: reads the "ORDER TASK DỰNG" Google Sheet (one tab per week) and turns it into
// day × channel × task data. Read only: the app never writes to this Sheet.
// Expected tab layout (rows/columns may move, names may change):
//   a row of dates "23/11" (each date heading a block of columns, usually merged over 2),
//   optionally a row of weekday names, then a header row "KÊNH/VJ | TÊN TASK | NGƯỜI THỰC HIỆN | …",
//   then one row per channel. A cell may hold several tasks on separate lines.
import {JWT} from 'google-auth-library';

export const EDIT_SCHEDULE_SHEET_ID='1E2ZuJp4GNT_TlNMTFSfcM3FTzm4B2WqQiUhA39ej__c';
const WEEKDAYS=['Chủ nhật','Thứ 2','Thứ 3','Thứ 4','Thứ 5','Thứ 6','Thứ 7'];
const DAY_MS=86400000;

export const cleanText=value=>String(value??'').replace(/[​-‍⁠﻿]/g,'').replace(/\r/g,'').replace(/ /g,' ').trim();
export const normalizeName=value=>cleanText(value).normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/đ/g,'d').replace(/Đ/g,'D').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const lines=value=>cleanText(value).split(/\n+/).map(line=>cleanText(line.replace(/^\s*(?:[-–•*+]|\d{1,2}[.)])\s+/,''))).filter(Boolean);
export const splitPeople=value=>cleanText(value).split(/\s*(?:,|;|&|\+|\/|\n|\s-\s|\svà\s)\s*/i).map(cleanText).filter(Boolean);
const iso=ms=>new Date(ms).toISOString().slice(0,10);
const utcDay=(y,m,d)=>{const ms=Date.UTC(y,m-1,d),t=new Date(ms);return t.getUTCFullYear()===y&&t.getUTCMonth()===m-1&&t.getUTCDate()===d?ms:null;};
/** Vietnam calendar day (UTC+7) as YYYY-MM-DD. */
export const vnToday=(now=Date.now())=>iso(now+7*3600000);

/**
 * Grid cell lookup with merged ranges filled in: a merged block reports the top-left value in
 * every cell, plus the merge index so callers can tell two cells share one merge.
 */
function gridReader(grid,merges=[]){
 const owner=new Map();
 merges.forEach((m,i)=>{for(let r=m.startRowIndex??0;r<(m.endRowIndex??0);r++)for(let c=m.startColumnIndex??0;c<(m.endColumnIndex??0);c++)owner.set(r+':'+c,i);});
 return (r,c)=>{
  const k=owner.get(r+':'+c);
  if(k===undefined)return {...(grid[r]?.[c]||{}),merge:null};
  const m=merges[k];return {...(grid[m.startRowIndex??0]?.[m.startColumnIndex??0]||{}),merge:k,top:(m.startRowIndex??0)===r,left:(m.startColumnIndex??0)===c};
 };
}
const value=cell=>cleanText(cell?.v);
const DATE=/^(\d{1,2})\s*[\/.-]\s*(\d{1,2})(?:\s*[\/.-]\s*(\d{2}|\d{4}))?$/;

/** Picks the year that puts day/month closest to the reference day (sheets usually omit the year). */
function nearestYear(day,month,reference){
 const ref=Date.parse(reference+'T00:00:00Z'),year=Number(reference.slice(0,4));let best=null;
 for(const y of [year-1,year,year+1]){const ms=utcDay(y,month,day);if(ms!==null&&(best===null||Math.abs(ms-ref)<Math.abs(best-ref)))best=ms;}
 return best;
}

/**
 * Parses one weekly tab. grid: rows of cells {v, bg, link} (0-based, row 0 = sheet row 1).
 * Returns null when the tab does not look like a schedule (no row with at least 3 dates).
 */
export function parseEditWeek(grid,{merges=[],title='',gid=0,today=vnToday()}={}){
 const at=gridReader(grid,merges),width=Math.max(0,...grid.map(r=>r?.length||0));
 let dateRow=-1,starts=[];
 for(let r=0;r<Math.min(grid.length,20)&&dateRow<0;r++){
  const found=[];
  for(let c=0;c<width;c++){const cell=at(r,c);if(cell.merge!==null&&!cell.left)continue;const m=DATE.exec(value(cell));if(m)found.push({col:c,day:Number(m[1]),month:Number(m[2]),year:m[3]?Number(m[3].length===2?'20'+m[3]:m[3]):null});}
  if(found.length>=3){dateRow=r;starts=found;}
 }
 if(dateRow<0)return null;
 // Resolve years: the first date nearest to today, the rest strictly after the previous one.
 let previous=null;
 const days=[];
 for(const [i,s] of starts.entries()){
  let ms=s.year?utcDay(s.year,s.month,s.day):previous===null?nearestYear(s.day,s.month,today):null;
  if(ms===null&&previous!==null){const y=new Date(previous).getUTCFullYear();ms=utcDay(y,s.month,s.day);if(ms!==null&&ms<=previous)ms=utcDay(y+1,s.month,s.day);}
  if(ms===null)continue;
  previous=ms;
  const end=i+1<starts.length?starts[i+1].col:s.col+2;
  days.push({date:iso(ms),label:String(s.day).padStart(2,'0')+'/'+String(s.month).padStart(2,'0'),weekday:WEEKDAYS[new Date(ms).getUTCDay()],start:s.col,end});
 }
 if(!days.length)return null;
 // Header row: first row under the dates that names the task or channel column.
 let headerRow=-1;
 for(let r=dateRow+1;r<Math.min(grid.length,dateRow+6)&&headerRow<0;r++){
  for(let c=0;c<width;c++){const h=normalizeName(value(at(r,c)));if(/\btask\b|^kenh|nguoi thuc hien/.test(h)){headerRow=r;break;}}
 }
 const header=c=>headerRow<0?'':normalizeName(value(at(headerRow,c)));
 let channelCol=-1;
 if(headerRow>=0)for(let c=0;c<days[0].start;c++)if(/^kenh|\bvj\b/.test(header(c))){channelCol=c;break;}
 if(channelCol<0)channelCol=Math.max(0,days[0].start-1);
 for(const d of days){
  let task=-1,person=-1;
  for(let c=d.start;c<d.end;c++){const h=header(c);if(task<0&&/\btask\b|cong viec|noi dung/.test(h))task=c;else if(person<0&&/nguoi|thuc hien|editor/.test(h))person=c;}
  d.taskCol=task>=0?task:d.start;d.personCol=person>=0?person:d.end-d.start>1?d.start+1:-1;
 }
 const firstRow=(headerRow>=0?headerRow:dateRow)+1,channels=[];let last=null;
 for(let r=firstRow;r<grid.length;r++){
  const nameCell=at(r,channelCol),name=value(nameCell).replace(/\s*\n\s*/g,' ');
  const cells=days.map(d=>{
   const t=at(r,d.taskCol),p=d.personCol>=0?at(r,d.personCol):{merge:null};
   // A task cell merged over several rows is shown once, on its first row.
   const taskText=t.merge!==null&&!t.top?'':value(t);
   const personText=p.merge!==null&&(p.merge===t.merge||!p.top)?'':value(p);
   const taskLines=lines(taskText),personLines=lines(personText);
   if(!taskLines.length&&!personLines.length)return [];
   const style={...(t.bg?{bg:t.bg}:{}),...(t.link?{link:t.link}:{})};
   if(!taskLines.length)return [{title:'',people:splitPeople(personText),...style}];
   const paired=taskLines.length>1&&personLines.length===taskLines.length;
   return taskLines.map((title,i)=>({title,people:splitPeople(paired?personLines[i]:personLines.join(', ')),...style}));
  });
  // Rows sharing one merged channel cell belong to the same channel.
  if(nameCell.merge!==null&&!nameCell.top&&last&&last.merge===nameCell.merge){cells.forEach((tasks,i)=>last.days[i].push(...tasks));continue;}
  if(!name){
   if(!cells.some(t=>t.length))continue;
   last={name:'(Chưa ghi kênh)',merge:null,days:cells};channels.push(last);continue;
  }
  if(/^tong( cong)?$|^ghi chu$/.test(normalizeName(name)))continue;
  last={name,merge:nameCell.merge,days:cells};channels.push(last);
 }
 const people=[...new Set(channels.flatMap(c=>c.days.flat().flatMap(t=>t.people)))].sort((a,b)=>a.localeCompare(b,'vi'));
 return {gid,title:cleanText(title),start:days[0].date,end:days.at(-1).date,days:days.map(({date,label,weekday})=>({date,label,weekday})),
  channels:channels.map(({name,days})=>({name,days})),people};
}

/**
 * True when a name written in the Sheet refers to this person. Matching ignores accents and case.
 * A sheet name of two or more words also matches the end of the full name ("Minh Thi" → "Nguyễn Minh Thi").
 */
export function personMatches(sheetName,fullName){
 const a=normalizeName(sheetName),b=normalizeName(fullName);
 if(!a||!b)return false;if(a===b)return true;
 return a.split(' ').length>=2&&(' '+b).endsWith(' '+a);
}

/** The week to open: the one containing today, else the latest week that already started, else the first. */
export function pickWeek(weeks,today=vnToday()){
 const sorted=[...weeks].sort((a,b)=>a.start.localeCompare(b.start));
 return sorted.find(w=>w.start<=today&&today<=w.end)||[...sorted].reverse().find(w=>w.start<=today)||sorted[0]||null;
}

/**
 * RPC result for the Lịch dựng screen.
 * @param {any} book
 * @param {{gid?:string|number|null,user?:any,today?:string}} [options]
 */
export function editScheduleScreen(book,{gid=null,user,today=vnToday()}={}){
 const weeks=[...book.weeks].sort((a,b)=>a.start.localeCompare(b.start));
 const chosen=(gid!==null&&gid!==undefined&&gid!==''?weeks.find(w=>String(w.gid)===String(gid)):null)||pickWeek(weeks,today);
 return {sheetUrl:book.sheetUrl+(chosen?'#gid='+chosen.gid:''),readAt:book.readAt,today,me:String(user?.name||''),
  weeks:weeks.map(({gid,title,start,end})=>({gid,title,start,end})),week:chosen||null,skipped:book.skipped||[]};
}

/**
 * RPC result for the home card: today's tasks of this person, plus team totals for managers.
 * @param {any} book
 * @param {{user?:any,today?:string}} [options]
 */
export function editScheduleToday(book,{user,today=vnToday()}={}){
 const week=book.weeks.find(w=>w.days.some(d=>d.date===today));
 const base={today,me:String(user?.name||''),manager:['leader','director'].includes(user?.role)};
 if(!week)return {...base,found:false,mine:[],total:0,channels:0,emptyChannels:[]};
 const i=week.days.findIndex(d=>d.date===today),mine=[];let total=0;const emptyChannels=[];
 for(const c of week.channels){
  const tasks=c.days[i]||[];total+=tasks.length;if(!tasks.length)emptyChannels.push(c.name);
  for(const t of tasks)if(t.people.some(p=>personMatches(p,user?.name)))mine.push({channel:c.name,...t});
 }
 return {...base,found:true,gid:week.gid,weekTitle:week.title,day:week.days[i],mine,total,channels:week.channels.length,emptyChannels:base.manager?emptyChannels:[]};
}

const hex=c=>{
 if(!c||!Object.keys(c).length)return '';
 const [r,g,b]=['red','green','blue'].map(k=>Math.round(Math.min(1,Math.max(0,Number(c[k]||0)))*255));
 if(r>=250&&g>=250&&b>=250)return '';
 return '#'+[r,g,b].map(n=>n.toString(16).padStart(2,'0')).join('');
};
const columnName=n=>{let s='';n+=1;while(n>0){const m=(n-1)%26;s=String.fromCharCode(65+m)+s;n=Math.floor((n-1)/26);}return s;};

/** Converts a spreadsheets.get sheet (with grid data) into {grid, merges}. Exported for tests. */
export function sheetGrid(sheet){
 const grid=[];
 for(const data of sheet.data||[])for(const [ri,row] of (data.rowData||[]).entries()){
  const r=(data.startRow||0)+ri;grid[r]??=[];
  for(const [ci,cell] of (row.values||[]).entries()){
   const v=cell?.formattedValue??'',bg=hex(cell?.effectiveFormat?.backgroundColor),link=cell?.hyperlink&&/^https?:\/\//i.test(cell.hyperlink)?cell.hyperlink:'';
   grid[r][(data.startColumn||0)+ci]={v,...(bg?{bg}:{}),...(link?{link}:{})};
  }
 }
 for(let r=0;r<grid.length;r++)grid[r]??=[];
 return {grid,merges:sheet.merges||[]};
}

export function createEditScheduleReader({env=process.env,fetcher=fetch,tokenProvider,now=Date.now,ttlMs=60000}={}){
 let cached=null,pending=null;
 return async function read({refresh=false}={}){
  if(pending)return structuredClone(await pending);
  if(!refresh&&cached&&now()-cached.at<ttlMs)return structuredClone(cached.book);
  const operation=(async()=>{
   const sheetId=env.EDIT_SCHEDULE_SHEET_ID||EDIT_SCHEDULE_SHEET_ID;
   if(!/^[\w-]{20,150}$/.test(sheetId))throw Error('Cấu hình Google Sheet lịch dựng không hợp lệ.');
   const email=env.GOOGLE_SERVICE_ACCOUNT_EMAIL,key=env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g,'\n');
   if(!tokenProvider&&(!email||!key))throw Error('Chưa cấu hình tài khoản Google đọc Sheet (GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY).');
   let token;
   try{token=tokenProvider?await tokenProvider():(await new JWT({email,key,scopes:['https://www.googleapis.com/auth/spreadsheets.readonly']}).getAccessToken()).token;}
   catch{throw Error('Không xác thực được Google Sheets. Kiểm tra cấu hình tài khoản Google trên Vercel.');}
   const base='https://sheets.googleapis.com/v4/spreadsheets/'+sheetId;
   const get=async params=>{
    let response;try{response=await fetcher(base+'?'+params,{headers:{Authorization:'Bearer '+token},cache:'no-store',signal:AbortSignal.timeout(15000)});}
    catch{throw Error('Đọc Sheet lịch dựng quá thời gian. Vui lòng thử lại.');}
    if(!response.ok)throw Error(response.status===403?'Chưa có quyền đọc Sheet lịch dựng. Chia sẻ Sheet "ORDER TASK DỰNG" cho email GOOGLE_SERVICE_ACCOUNT_EMAIL với quyền Người xem.':response.status===404?'Không tìm thấy Sheet lịch dựng.':'Không đọc được Sheet lịch dựng. Vui lòng thử lại.');
    return response.json();
   };
   const meta=await get(new URLSearchParams({fields:'sheets(properties(sheetId,title,index,hidden,gridProperties(rowCount,columnCount)))'}));
   // Newest tabs are read first; 60 tabs is more than a year of weeks.
   const tabs=(meta.sheets||[]).map(s=>s.properties).filter(p=>p&&!p.hidden).slice(-60);
   const params=new URLSearchParams({fields:'sheets(properties(sheetId,title),merges,data(startRow,startColumn,rowData(values(formattedValue,hyperlink,effectiveFormat(backgroundColor)))))'});
   for(const p of tabs){
    const rows=Math.min(p.gridProperties?.rowCount||200,300),cols=Math.min(p.gridProperties?.columnCount||26,60);
    params.append('ranges',"'"+String(p.title).replaceAll("'","''")+"'!A1:"+columnName(cols-1)+rows);
   }
   const raw=tabs.length?await get(params):{sheets:[]};
   const today=vnToday(now()),weeks=[],skipped=[];
   for(const s of raw.sheets||[]){
    const {grid,merges}=sheetGrid(s),title=s.properties?.title||'',gid=s.properties?.sheetId??0;
    const week=parseEditWeek(grid,{merges,title,gid,today});
    if(week)weeks.push(week);else skipped.push(title);
   }
   const book={weeks,skipped,sheetUrl:'https://docs.google.com/spreadsheets/d/'+sheetId+'/edit',readAt:new Date(now()).toISOString()};
   cached={at:now(),book:structuredClone(book)};return book;
  })();
  pending=operation;
  try{return structuredClone(await operation);}finally{if(pending===operation)pending=null;}
 };
}
// Callers must authenticate the person first (any active member may read the schedule).
export const readEditSchedule=createEditScheduleReader();
