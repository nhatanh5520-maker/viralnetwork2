// Lịch quay và lịch dựng: reads the "Order lịch quay & Dựng" Google Sheet and turns it into
// week × day × channel entries. Read only: the app never writes to this Sheet.
//
// Tabs (one per month, any number of spaces around "|"):
//   "THÁNG 12 | LỊCH QUAY"  → kind "shoot"   day columns: Giờ dự kiến · Địa điểm · Loại · Người quay, plus a BUỔI column
//   "THÁNG 12 | TASK DỰNG"  → kind "edit"    day columns: Tên Task · Loại · Người Phụ Trách
// Each tab stacks week blocks vertically. A block starts with a title row "30/11 - 06/12", then a row of dates
// (each date merged over the day's columns), a weekday row, a header row ("KÊNH", field names) and the channels.
// A channel cell is merged over its rows and reads "NAME\n- PT: owner\n- Lịch đăng bài: …".
// Column positions come from the merges and the header text, never from fixed letters.
import {JWT} from 'google-auth-library';

export const EDIT_SCHEDULE_SHEET_ID='1caT7N_ZIeSvnYW_i7I3aze-5C2YltF-mTHiCxspi7Os';
const WEEKDAYS=['Chủ nhật','Thứ 2','Thứ 3','Thứ 4','Thứ 5','Thứ 6','Thứ 7'];

export const cleanText=value=>String(value??'').replace(/[​-‍⁠﻿]/g,'').replace(/\r/g,'').replace(/ /g,' ').trim();
export const normalizeName=value=>cleanText(value).normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/đ/g,'d').replace(/Đ/g,'D').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const lines=value=>cleanText(value).split(/\n+/).map(line=>cleanText(line.replace(/^\s*(?:[-–•*+]|\d{1,2}[.)])\s+/,''))).filter(Boolean);
export const splitPeople=value=>cleanText(value).split(/\s*(?:,|;|&|\+|\/|\n|\s-\s|\svà\s)\s*/i).map(cleanText).filter(Boolean);
const iso=ms=>new Date(ms).toISOString().slice(0,10);
const utcDay=(y,m,d)=>{const ms=Date.UTC(y,m-1,d),t=new Date(ms);return t.getUTCFullYear()===y&&t.getUTCMonth()===m-1&&t.getUTCDate()===d?ms:null;};
/** Vietnam calendar day (UTC+7) as YYYY-MM-DD. */
export const vnToday=(now=Date.now())=>iso(now+7*3600000);

/** "shoot" for LỊCH QUAY tabs, "edit" for TASK DỰNG tabs, null otherwise. */
export function tabKind(title){
 const t=normalizeName(title);
 if(/\blich quay\b/.test(t))return 'shoot';
 if(/\btask dung\b|\blich dung\b/.test(t))return 'edit';
 return null;
}

/** Cell lookup with merged ranges filled in: a merged block reports its top-left value in every cell. */
function gridReader(grid,merges=[]){
 const owner=new Map();
 merges.forEach((m,i)=>{for(let r=m.startRowIndex??0;r<(m.endRowIndex??0);r++)for(let c=m.startColumnIndex??0;c<(m.endColumnIndex??0);c++)owner.set(r+':'+c,i);});
 const at=(r,c)=>{
  const k=owner.get(r+':'+c);
  if(k===undefined)return {...(grid[r]?.[c]||{}),merge:null,top:true,left:true};
  const m=merges[k];return {...(grid[m.startRowIndex??0]?.[m.startColumnIndex??0]||{}),merge:k,top:(m.startRowIndex??0)===r,left:(m.startColumnIndex??0)===c,end:m.endColumnIndex??c+1,bottom:m.endRowIndex??r+1};
 };
 return at;
}
const value=cell=>cleanText(cell?.v);
const DATE=/^(\d{1,2})\s*[\/.-]\s*(\d{1,2})(?:\s*[\/.-]\s*(\d{2}|\d{4}))?$/;
const WEEK_TITLE=/^\d{1,2}\s*\/\s*\d{1,2}(?:\s*\/\s*\d{2,4})?\s*[-–—]\s*\d{1,2}\s*\/\s*\d{1,2}(?:\s*\/\s*\d{2,4})?$/;

function nearestYear(day,month,reference){
 const ref=Date.parse(reference+'T00:00:00Z'),year=Number(reference.slice(0,4));let best=null;
 for(const y of [year-1,year,year+1]){const ms=utcDay(y,month,day);if(ms!==null&&(best===null||Math.abs(ms-ref)<Math.abs(best-ref)))best=ms;}
 return best;
}
// Header text → field key. Order matters: "Người quay" before the generic "người".
const FIELD_RULES=[
 [/^gio|thoi gian/,'time'],[/dia diem/,'place'],[/^loai/,'type'],
 [/nguoi quay|cam ?op|quay phim/,'people'],[/ten task|^task|cong viec|noi dung/,'title'],
 [/nguoi phu trach|nguoi thuc hien|^nguoi|editor/,'people'],[/ghi chu/,'note'],
];
const fieldOf=h=>FIELD_RULES.find(([re])=>re.test(h))?.[1]||null;

/** Splits a channel cell "NAME\n- PT: owner\n- Lịch đăng bài: …" into its parts. */
export function parseChannelCell(text){
 const parts=lines(text);let name='',owner='',plan='';const extra=[];
 for(const line of parts){
  const pt=/^pt\s*[:：]\s*(.+)$/i.exec(line),post=/^l[iị]ch đăng b[aà]i\s*[:：]\s*(.+)$/i.exec(line)||(/^lich dang bai\b/.test(normalizeName(line))?[null,line.replace(/^[^:：]*[:：]\s*/,'')]:null);
  if(pt&&!owner)owner=cleanText(pt[1]);else if(post&&!plan)plan=cleanText(post[1]);else if(!name)name=line;else extra.push(line);
 }
 return {name:name||cleanText(text),owner,plan,...(extra.length?{note:extra.join(' · ')}:{})};
}

/** Finds the row index of each week block (title row "dd/mm - dd/mm"). */
function blockStarts(grid,at){
 const starts=[];
 for(let r=0;r<grid.length;r++){for(let c=0;c<Math.min(3,(grid[r]||[]).length);c++){const cell=at(r,c);if(cell.top&&cell.left&&WEEK_TITLE.test(value(cell))){starts.push({row:r,title:value(cell).replace(/\s*[-–—]\s*/,' - ')});break;}}}
 return starts;
}

/**
 * Parses one week block between rows [from, to). Returns null when the block has no date row.
 * kind: "shoot" | "edit" | null (null: inferred from the header).
 */
function parseBlock(grid,at,from,to,{kind,title,today}){
 const width=Math.max(0,...grid.slice(from,to).map(r=>r?.length||0));
 let dateRow=-1,starts=[];
 for(let r=from;r<Math.min(to,from+8)&&dateRow<0;r++){
  const found=[];
  for(let c=0;c<width;c++){const cell=at(r,c);if(!cell.left)continue;const m=DATE.exec(value(cell));if(m)found.push({col:c,end:cell.merge!==null?cell.end:null,day:Number(m[1]),month:Number(m[2]),year:m[3]?Number(m[3].length===2?'20'+m[3]:m[3]):null});}
  if(found.length>=3){dateRow=r;starts=found;}
 }
 if(dateRow<0)return null;
 let previous=null;const days=[];
 for(const [i,s] of starts.entries()){
  let ms=s.year?utcDay(s.year,s.month,s.day):previous===null?nearestYear(s.day,s.month,today):null;
  if(ms===null&&previous!==null){const y=new Date(previous).getUTCFullYear();ms=utcDay(y,s.month,s.day);if(ms!==null&&ms<=previous)ms=utcDay(y+1,s.month,s.day);}
  if(ms===null)continue;previous=ms;
  const end=s.end||(i+1<starts.length?starts[i+1].col:s.col+2);
  days.push({date:iso(ms),label:String(s.day).padStart(2,'0')+'/'+String(s.month).padStart(2,'0'),weekday:WEEKDAYS[new Date(ms).getUTCDay()],start:s.col,end});
 }
 if(!days.length)return null;
 let headerRow=-1,channelCol=-1,sessionCol=-1;
 for(let r=dateRow+1;r<Math.min(to,dateRow+5)&&headerRow<0;r++)for(let c=0;c<days[0].start;c++){const h=normalizeName(value(at(r,c)));if(/^kenh/.test(h)){headerRow=r;channelCol=c;break;}}
 if(headerRow<0){
  for(let r=dateRow+1;r<Math.min(to,dateRow+5)&&headerRow<0;r++)for(let c=days[0].start;c<days[0].end;c++)if(fieldOf(normalizeName(value(at(r,c))))){headerRow=r;break;}
  channelCol=Math.max(0,days[0].start-1);
 }
 const header=c=>headerRow<0?'':normalizeName(value(at(headerRow,c)));
 for(let c=0;c<days[0].start;c++)if(/^buoi|^ca\b/.test(header(c)))sessionCol=c;
 for(const d of days){
  d.fields={};
  for(let c=d.start;c<d.end;c++){const f=fieldOf(header(c));if(f&&d.fields[f]===undefined)d.fields[f]=c;}
  if(d.fields.title===undefined&&d.fields.place===undefined&&d.fields.time===undefined)d.fields.title=d.start;
  if(d.fields.people===undefined&&d.end-d.start>1)d.fields.people=d.end-1;
 }
 const headers=days.flatMap(d=>Object.keys(d.fields));
 kind=kind||(headers.includes('place')||headers.includes('time')||sessionCol>=0?'shoot':'edit');
 const channels=[];let current=null,session='';
 for(let r=(headerRow>=0?headerRow:dateRow)+1;r<to;r++){
  const nameCell=at(r,channelCol),name=value(nameCell);
  if(nameCell.merge!==null&&!nameCell.top&&current&&current.merge===nameCell.merge){/* same channel */}
  else if(name){
   if(/^tong( cong)?$|^ghi chu$/.test(normalizeName(name))){current=null;continue;}
   current={...parseChannelCell(name),merge:nameCell.merge,days:days.map(()=>[])};channels.push(current);session='';
  }
  const label=sessionCol>=0?value(at(r,sessionCol)):'';if(label)session=label;
  const entries=days.map(d=>{
   const read={},seen=new Set();let main=null;
   for(const [field,c] of Object.entries(d.fields)){
    const cell=at(r,c);
    // A cell merged over several rows counts on its first row; merged across fields counts once.
    if(cell.merge!==null&&(!cell.top||seen.has(cell.merge))){read[field]='';continue;}
    if(cell.merge!==null)seen.add(cell.merge);
    read[field]=value(cell);if(!main&&(field==='title'||field==='place')&&read[field])main=cell;
   }
   const people=splitPeople(read.people||''),style={...(main?.bg?{bg:main.bg}:{}),...(main?.link?{link:main.link}:{})};
   if(kind==='shoot'){
    if(!read.time&&!read.place&&!people.length)return [];
    return [{...(session?{session}:{}),time:read.time||'',place:(read.place||'').replace(/\s*\n\s*/g,' · '),type:read.type||'',people,...(read.note?{note:read.note}:{}),...style}];
   }
   const titles=lines(read.title||''),personLines=lines(read.people||'');
   if(!titles.length&&!people.length)return [];
   if(!titles.length)return [{title:'',type:read.type||'',people,...style}];
   const paired=titles.length>1&&personLines.length===titles.length;
   return titles.map((t,i)=>({title:t,type:read.type||'',people:paired?splitPeople(personLines[i]):people,...style}));
  });
  if(!entries.some(e=>e.length))continue;
  if(!current){current={name:'(Chưa ghi kênh)',owner:'',plan:'',merge:null,days:days.map(()=>[])};channels.push(current);}
  entries.forEach((e,i)=>current.days[i].push(...e));
 }
 const people=[...new Set(channels.flatMap(c=>c.days.flat().flatMap(t=>t.people)))].sort((a,b)=>a.localeCompare(b,'vi'));
 return {kind,title:cleanText(title)||days[0].label+' - '+days.at(-1).label,start:days[0].date,end:days.at(-1).date,
  days:days.map(({date,label,weekday})=>({date,label,weekday})),channels:channels.map(({merge,...c})=>c),people};
}

/**
 * Parses one tab into its week blocks. grid: rows of cells {v, bg, link} (row 0 = sheet row 1).
 * Tabs without week title rows are read as a single block (older one-week-per-tab layout).
 */
export function parseScheduleTab(grid,{merges=[],title='',gid=0,today=vnToday()}={}){
 const at=gridReader(grid,merges),kind=tabKind(title),starts=blockStarts(grid,at),weeks=[];
 const blocks=starts.length?starts.map((s,i)=>({from:s.row,to:i+1<starts.length?starts[i+1].row:grid.length,title:s.title})):[{from:0,to:grid.length,title}];
 for(const b of blocks){
  const week=parseBlock(grid,at,b.from,b.to,{kind,title:b.title,today});
  if(week)weeks.push({id:gid+':'+week.start,gid,tab:cleanText(title),...week});
 }
 return weeks;
}

/** Back-compat helper used by older tests: the first week of a tab. */
export function parseEditWeek(grid,options={}){return parseScheduleTab(grid,options)[0]||null;}

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

const KINDS=['shoot','edit'];
/** RPC result for the "Lịch quay và lịch dựng" screen. */
/**
 * @param {any} book
 * @param {{kind?:string,week?:string|null,user?:any,today?:string}} [options]
 */
export function editScheduleScreen(book,{kind='edit',week=null,user,today=vnToday()}={}){
 kind=KINDS.includes(kind)?kind:'edit';
 const weeks=(book.weeks||[]).filter(w=>w.kind===kind).sort((a,b)=>a.start.localeCompare(b.start));
 const chosen=(week?weeks.find(w=>w.id===String(week)):null)||pickWeek(weeks,today);
 const counts=Object.fromEntries(KINDS.map(k=>[k,(book.weeks||[]).filter(w=>w.kind===k).length]));
 return {kind,counts,sheetUrl:book.sheetUrl+(chosen?'#gid='+chosen.gid:''),readAt:book.readAt,today,me:String(user?.name||''),
  weeks:weeks.map(({id,gid,tab,title,start,end})=>({id,gid,tab,title,start,end})),week:chosen||null,skipped:book.skipped||[]};
}

/**
 * RPC result for the home card: today's shoots and edit tasks of this person, plus team totals for managers.
 * @param {any} book
 * @param {{user?:any,today?:string}} [options]
 */
export function editScheduleToday(book,{user,today=vnToday()}={}){
 const manager=['leader','director'].includes(user?.role),out={today,me:String(user?.name||''),manager,found:false,day:null};
 for(const kind of KINDS){
  const week=(book.weeks||[]).find(w=>w.kind===kind&&w.days.some(d=>d.date===today)),mine=[];let total=0;const emptyChannels=[];
  if(week){
   const i=week.days.findIndex(d=>d.date===today);out.found=true;out.day=week.days[i];
   for(const c of week.channels){
    const entries=c.days[i]||[];total+=entries.length;if(!entries.length)emptyChannels.push(c.name);
    for(const e of entries)if(e.people.some(p=>personMatches(p,user?.name)))mine.push({channel:c.name,...e});
   }
  }
  out[kind]={found:!!week,week:week?.id||null,mine,total,channels:week?.channels.length||0,emptyChannels:manager?emptyChannels:[]};
 }
 return out;
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
   if(!/^[\w-]{20,150}$/.test(sheetId))throw Error('Cấu hình Google Sheet lịch quay và lịch dựng không hợp lệ.');
   const email=env.GOOGLE_SERVICE_ACCOUNT_EMAIL,key=env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g,'\n');
   if(!tokenProvider&&(!email||!key))throw Error('Chưa cấu hình tài khoản Google đọc Sheet (GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY).');
   let token;
   try{token=tokenProvider?await tokenProvider():(await new JWT({email,key,scopes:['https://www.googleapis.com/auth/spreadsheets.readonly']}).getAccessToken()).token;}
   catch{throw Error('Không xác thực được Google Sheets. Kiểm tra cấu hình tài khoản Google trên Vercel.');}
   const base='https://sheets.googleapis.com/v4/spreadsheets/'+sheetId;
   const get=async params=>{
    let response;try{response=await fetcher(base+'?'+params,{headers:{Authorization:'Bearer '+token},cache:'no-store',signal:AbortSignal.timeout(15000)});}
    catch{throw Error('Đọc Sheet lịch quay và lịch dựng quá thời gian. Vui lòng thử lại.');}
    if(!response.ok)throw Error(response.status===403?'Chưa có quyền đọc Sheet lịch quay và lịch dựng. Chia sẻ Sheet "Order lịch quay & Dựng" cho email GOOGLE_SERVICE_ACCOUNT_EMAIL với quyền Người xem.':response.status===404?'Không tìm thấy Sheet lịch quay và lịch dựng.':'Không đọc được Sheet lịch quay và lịch dựng. Vui lòng thử lại.');
    return response.json();
   };
   const meta=await get(new URLSearchParams({fields:'sheets(properties(sheetId,title,index,hidden,gridProperties(rowCount,columnCount)))'}));
   // Monthly tabs: the 24 most recent visible tabs cover two years.
   const tabs=(meta.sheets||[]).map(s=>s.properties).filter(p=>p&&!p.hidden).slice(-24);
   // Merges come from the API (sheets.merges), so columns are found from the real merged ranges.
   const params=new URLSearchParams({fields:'sheets(properties(sheetId,title),merges,data(startRow,startColumn,rowData(values(formattedValue,hyperlink,effectiveFormat(backgroundColor)))))'});
   for(const p of tabs){
    const rows=Math.min(p.gridProperties?.rowCount||300,600),cols=Math.min(p.gridProperties?.columnCount||26,60);
    params.append('ranges',"'"+String(p.title).replaceAll("'","''")+"'!A1:"+columnName(cols-1)+rows);
   }
   const raw=tabs.length?await get(params):{sheets:[]};
   const today=vnToday(now()),weeks=[],skipped=[];
   for(const s of raw.sheets||[]){
    const {grid,merges}=sheetGrid(s),title=s.properties?.title||'',gid=s.properties?.sheetId??0;
    const found=parseScheduleTab(grid,{merges,title,gid,today});
    if(found.length)weeks.push(...found);else skipped.push(title);
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
