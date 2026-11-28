import test from 'node:test';import assert from 'node:assert/strict';
import {parseScheduleTab,parseChannelCell,tabKind,personMatches,pickWeek,editScheduleScreen,editScheduleToday,sheetGrid,createEditScheduleReader,splitPeople,vnToday,EDIT_SCHEDULE_SHEET_ID} from '../edit-schedule.mjs';

const M=(r0,r1,c0,c1)=>({startRowIndex:r0,endRowIndex:r1,startColumnIndex:c0,endColumnIndex:c1});
const WD=['THỨ 2','THỨ 3','THỨ 4','THỨ 5','THỨ 6','THỨ 7','CHỦ NHẬT'];
const CHANNELS=[['LƯỢN ĐÀ NẴNG\n- PT: Diễm Hương \n- Lịch đăng bài: 02 - 03 ngày đăng 1 video','LƯỢN ĐÀ NẴNG\nPT: Diễm Hương'],['ĐÀ NẴNG DAILY \n- PT: Linh Chi\n- Lịch đăng bài: 4 video / tuần','ĐÀ NẴNG DAILY \nPT: Linh Chi'],['THUCVY20\n- PT: Thục Vy','THUCVY20\nPT: Thục Vy']];
const dates=start=>Array.from({length:7},(_,i)=>{const d=new Date(Date.parse(start+'T00:00:00Z')+i*86400000);return String(d.getUTCDate()).padStart(2,'0')+'/'+String(d.getUTCMonth()+1).padStart(2,'0')+'/'+d.getUTCFullYear();});

/** Same layout as "THÁNG 12 | LỊCH QUAY": A KÊNH, B BUỔI, C spacer, then 4 columns per day. Weeks stacked. */
function shootTab(weeks=['2026-11-30']){
 const grid=[],merges=[];const width=3+7*4,row=()=>Array.from({length:width},()=>({v:''}));
 for(const start of weeks){
  const r0=grid.length,days=dates(start);
  const t=row();t[0]={v:days[0].slice(0,5)+' - '+days[6].slice(0,5)};t[3]={v:'ORDER LỊCH QUAY'};grid.push(t);merges.push(M(r0,r0+1,0,2),M(r0,r0+1,3,width));
  const d=row();d[0]={v:'Deadline đăng ký: Trước thứ Hai hằng tuần.'};const w=row(),h=row();h[0]={v:'KÊNH'};h[1]={v:'BUỔI'};
  days.forEach((x,i)=>{const c=3+i*4;d[c]={v:x};w[c]={v:WD[i]};merges.push(M(r0+1,r0+2,c,c+4),M(r0+2,r0+3,c,c+4));['Giờ dự kiến','Địa điểm \n(Mỗi ô 1 địa điểm)','Loại','Người quay'].forEach((v,k)=>h[c+k]={v});});
  grid.push(d,w,h);merges.push(M(r0+1,r0+2,0,2));
  for(const [name] of CHANNELS){const top=grid.length;for(let k=0;k<4;k++){const r=row();if(k===0)r[0]={v:name};if(k===0)r[1]={v:'Sáng'};if(k===2)r[1]={v:'Chiều'};grid.push(r);}merges.push(M(top,top+4,0,1));}
 }
 return {grid,merges};
}
/** Same layout as "THÁNG 12 | TASK DỰNG": A KÊNH, then Tên Task · Loại · Người Phụ Trách per day. */
function editTab(weeks=['2026-11-30']){
 const grid=[],merges=[];const width=1+7*3,row=()=>Array.from({length:width},()=>({v:''}));
 for(const start of weeks){
  const r0=grid.length,days=dates(start);
  const t=row();t[0]={v:days[0].slice(0,5)+' - '+days[6].slice(0,5)};t[1]={v:'TASK DỰNG'};grid.push(t);merges.push(M(r0,r0+1,1,width));
  const d=row(),w=row(),h=row();h[0]={v:'KÊNH'};
  days.forEach((x,i)=>{const c=1+i*3;d[c]={v:x};w[c]={v:WD[i]};merges.push(M(r0+1,r0+2,c,c+3),M(r0+2,r0+3,c,c+3));['Tên Task','Loại','Người Phụ Trách'].forEach((v,k)=>h[c+k]={v});});
  grid.push(d,w,h);
  for(const [,name] of CHANNELS){const top=grid.length;for(let k=0;k<4;k++)grid.push(row());grid[top][0]={v:name};merges.push(M(top,top+4,0,1));}
 }
 return {grid,merges};
}
const parse=(tab,title,gid=0,today='2026-11-28')=>parseScheduleTab(tab.grid,{merges:tab.merges,title,gid,today});

test('tab kinds are recognised whatever the spacing around "|"',()=>{
 assert.equal(tabKind('THÁNG 12  | LỊCH QUAY'),'shoot');assert.equal(tabKind('Tháng 1|lịch quay'),'shoot');
 assert.equal(tabKind('THÁNG 12 | TASK DỰNG'),'edit');assert.equal(tabKind('Hướng dẫn'),null);
 assert.equal(EDIT_SCHEDULE_SHEET_ID,'1caT7N_ZIeSvnYW_i7I3aze-5C2YltF-mTHiCxspi7Os');
});

test('channel cell: name, PT owner and posting plan',()=>{
 assert.deepEqual(parseChannelCell('LƯỢN ĐÀ NẴNG\n- PT: Diễm Hương \n- Lịch đăng bài: 02 - 03 ngày đăng 1 video'),{name:'LƯỢN ĐÀ NẴNG',owner:'Diễm Hương',plan:'02 - 03 ngày đăng 1 video'});
 assert.deepEqual(parseChannelCell('ĐÀ NẴNG DAILY \nPT: Linh Chi'),{name:'ĐÀ NẴNG DAILY',owner:'Linh Chi',plan:''});
 assert.deepEqual(parseChannelCell('VIRAL ĐÀ NẴNG'),{name:'VIRAL ĐÀ NẴNG',owner:'',plan:''});
});

test('LỊCH QUAY: columns come from the merged date cells and header; Sáng/Chiều carry down; "Loại" alone is not a shoot',()=>{
 const tab=shootTab(),g=tab.grid;
 // Week block rows: 0 title, 1 dates, 2 weekdays, 3 header, 4..7 LƯỢN (Sáng 4-5, Chiều 6-7).
 for(let i=0;i<7;i++){g[4][5+i*4]={v:'Vận Hành Kênh'};g[5][5+i*4]={v:'Booking'};}
 g[4][3]={v:'8:00'};g[4][4]={v:'Chợ Hàn'};g[4][6]={v:'Cam Khoa'};
 g[7][7]={v:'14:00'};g[7][8]={v:'Cầu Rồng\nSơn Trà',bg:'#fff2cc'};g[7][10]={v:'Cam Khoa, Đăng'};
 g[8][28]={v:'Viral Đà Nẵng office'}; // DAILY, Sunday, only a place
 const [w]=parse(tab,'THÁNG 12  | LỊCH QUAY');
 assert.equal(w.kind,'shoot');assert.equal(w.id,'0:2026-11-30');assert.equal(w.title,'30/11 - 06/12');assert.equal(w.end,'2026-12-06');
 assert.deepEqual(w.days.map(d=>d.weekday),['Thứ 2','Thứ 3','Thứ 4','Thứ 5','Thứ 6','Thứ 7','Chủ nhật']);
 assert.deepEqual(w.channels.map(c=>[c.name,c.owner]),[['LƯỢN ĐÀ NẴNG','Diễm Hương'],['ĐÀ NẴNG DAILY','Linh Chi'],['THUCVY20','Thục Vy']]);
 assert.deepEqual(w.channels[0].days[0],[{session:'Sáng',time:'8:00',place:'Chợ Hàn',type:'Vận Hành Kênh',people:['Cam Khoa']}]);
 assert.deepEqual(w.channels[0].days[1],[{session:'Chiều',time:'14:00',place:'Cầu Rồng · Sơn Trà',type:'',people:['Cam Khoa','Đăng'],bg:'#fff2cc'}]);
 assert.ok(w.channels[0].days.slice(2).every(d=>d.length===0),'rows that only hold a sample "Loại" are ignored');
 assert.deepEqual(w.channels[1].days[6],[{session:'Sáng',time:'',place:'Viral Đà Nẵng office',type:'',people:[]}]);
 assert.deepEqual(w.people,['Cam Khoa','Đăng']);
});

test('TASK DỰNG: 3 columns per day; several week blocks stacked in one tab; empty template gives no tasks',()=>{
 const tab=editTab(['2026-11-30','2026-12-07']),g=tab.grid;
 for(let i=0;i<7;i++)g[4][2+i*3]={v:'Vận Hành Kênh'};
 g[4][1]={v:'Recap chợ Hàn'};g[4][3]={v:'Editor Phúc'};
 const second=4+CHANNELS.length*4; // first row of week 2
 g[second+4+4][4]={v:'Vlog Bà Nà\nShort Bà Nà'};g[second+4+4][5]={v:'Booking'};g[second+4+4][6]={v:'Phúc\nHà My'};
 const weeks=parse(tab,'THÁNG 12 | TASK DỰNG',86280882);
 assert.deepEqual(weeks.map(w=>[w.kind,w.id,w.title]),[['edit','86280882:2026-11-30','30/11 - 06/12'],['edit','86280882:2026-12-07','07/12 - 13/12']]);
 assert.deepEqual(weeks[0].channels[0].days[0],[{title:'Recap chợ Hàn',type:'Vận Hành Kênh',people:['Editor Phúc']}]);
 assert.equal(weeks[0].channels[0].days.flat().length,1);
 assert.deepEqual(weeks[1].channels[1].days[1],[{title:'Vlog Bà Nà',type:'Booking',people:['Phúc']},{title:'Short Bà Nà',type:'Booking',people:['Hà My']}]);
 const empty=parse(editTab(),'THÁNG 12 | TASK DỰNG');
 assert.equal(empty.length,1);assert.equal(empty[0].channels.length,3);assert.equal(empty[0].channels.flatMap(c=>c.days.flat()).length,0);
});

test('years: explicit years win; a week crossing New Year keeps going',()=>{
 const [w]=parse(editTab(['2026-12-28']),'THÁNG 12 | TASK DỰNG',1,'2030-06-01');
 assert.equal(w.start,'2026-12-28');assert.equal(w.end,'2027-01-03');assert.equal(w.title,'28/12 - 03/01');
});

test('a tab without dates is skipped',()=>{assert.deepEqual(parseScheduleTab([[{v:'Hướng dẫn'}],[{v:'Ghi chú'}]],{title:'Hướng dẫn'}),[]);});

test('person matching ignores accents/case and accepts the end of the full name',()=>{
 assert.ok(personMatches('MINH THI','Nguyễn Minh Thi'));assert.ok(personMatches('Thi','Thi'));
 assert.ok(!personMatches('Thi','Nguyễn Minh Thi'));assert.ok(!personMatches('','Minh Thi'));
 assert.deepEqual(splitPeople('Minh Thi, Chị Vy và Quí / Hà'),['Minh Thi','Chị Vy','Quí','Hà']);
});

function book(){
 const s=shootTab(),e=editTab();
 s.grid[4][3]={v:'8:00'};s.grid[4][4]={v:'Chợ Hàn'};s.grid[4][6]={v:'Cam Khoa'};
 e.grid[4][4]={v:'Recap'};e.grid[4][6]={v:'Minh Thi'};e.grid[8][4]={v:'Clip'};e.grid[8][6]={v:'Chị Vy'};
 return {sheetUrl:'https://docs.google.com/spreadsheets/d/x/edit',readAt:'2026-11-28T00:00:00Z',weeks:[...parse(s,'THÁNG 12 | LỊCH QUAY',0),...parse(e,'THÁNG 12 | TASK DỰNG',9)]};
}
test('home card: my shoots and edit tasks today; team totals only for Leader/Director',()=>{
 const b=book();
 const cam=editScheduleToday(b,{user:{name:'Cam Khoa',role:'employee'},today:'2026-11-30'});
 assert.equal(cam.found,true);assert.deepEqual(cam.shoot.mine.map(x=>[x.channel,x.place,x.session]),[['LƯỢN ĐÀ NẴNG','Chợ Hàn','Sáng']]);assert.deepEqual(cam.edit.mine,[]);
 const editor=editScheduleToday(b,{user:{name:'Nguyễn Minh Thi',role:'employee'},today:'2026-12-01'});
 assert.deepEqual(editor.edit.mine.map(x=>x.title),['Recap']);assert.deepEqual(editor.edit.emptyChannels,[],'staff do not get the team overview');
 const lead=editScheduleToday(b,{user:{name:'Leader',role:'leader'},today:'2026-12-01'});
 assert.equal(lead.edit.total,2);assert.equal(lead.shoot.total,0);assert.deepEqual(lead.edit.emptyChannels,['THUCVY20']);
 assert.equal(editScheduleToday(b,{user:{name:'X'},today:'2026-11-28'}).found,false);
});

test('screen: one part at a time, opens the current or first week, or the chosen one',()=>{
 const b=book();
 const shoot=editScheduleScreen(b,{kind:'shoot',user:{name:'A'},today:'2026-11-28'});
 assert.equal(shoot.kind,'shoot');assert.equal(shoot.week.id,'0:2026-11-30');assert.deepEqual(shoot.counts,{shoot:1,edit:1});assert.ok(shoot.sheetUrl.endsWith('#gid=0'));
 const edit=editScheduleScreen(b,{kind:'edit',week:'9:2026-11-30',user:{name:'A'},today:'2026-12-02'});
 assert.equal(edit.week.kind,'edit');assert.ok(edit.sheetUrl.endsWith('#gid=9'));
 assert.equal(editScheduleScreen(b,{kind:'bogus',user:{name:'A'}}).kind,'edit');
 assert.equal(pickWeek(b.weeks.filter(w=>w.kind==='edit'),'2027-01-20').id,'9:2026-11-30');
});

test('sheetGrid keeps text, non-white backgrounds and http links only',()=>{
 const {grid,merges}=sheetGrid({merges:[M(0,1,0,2)],data:[{startRow:1,startColumn:1,rowData:[{values:[
  {formattedValue:'A',effectiveFormat:{backgroundColor:{red:1,green:1,blue:1}}},
  {formattedValue:'B',effectiveFormat:{backgroundColor:{red:1,green:0.949,blue:0.8}},hyperlink:'javascript:alert(1)'},
  {formattedValue:'C',hyperlink:'https://x.test/v'}]}]}]});
 assert.deepEqual(grid[1].slice(1),[{v:'A'},{v:'B',bg:'#fff2cc'},{v:'C',link:'https://x.test/v'}]);assert.equal(merges.length,1);
});

test('reader: read-only scope, GET only, merges requested from the API, one batched read, cached, clear permission error',async()=>{
 const requests=[];let status=200;const s=shootTab(),e=editTab();
 const rows=g=>g.map(r=>({values:r.map(c=>({formattedValue:c.v}))}));
 const fetcher=async(url,options)=>{
  requests.push({url,method:options?.method||'GET',body:options?.body});
  if(status!==200)return {ok:false,status,json:async()=>({})};
  if(url.includes('ranges='))return {ok:true,json:async()=>({sheets:[{properties:{sheetId:0,title:'THÁNG 12  | LỊCH QUAY'},merges:s.merges,data:[{rowData:rows(s.grid)}]},{properties:{sheetId:86280882,title:'THÁNG 12 | TASK DỰNG'},merges:e.merges,data:[{rowData:rows(e.grid)}]}]})};
  return {ok:true,json:async()=>({sheets:[{properties:{sheetId:0,title:'THÁNG 12  | LỊCH QUAY',gridProperties:{rowCount:1019,columnCount:31}}},{properties:{sheetId:86280882,title:'THÁNG 12 | TASK DỰNG',gridProperties:{rowCount:1019,columnCount:22}}},{properties:{sheetId:5,title:'Ẩn',hidden:true}}]})};
 };
 let t=Date.parse('2026-11-28T03:00:00Z');
 const read=createEditScheduleReader({env:{},fetcher,tokenProvider:async()=>'token',now:()=>t});
 const b=await read();
 assert.deepEqual(b.weeks.map(w=>[w.kind,w.id]),[['shoot','0:2026-11-30'],['edit','86280882:2026-11-30']]);
 assert.ok(requests[0].url.includes('/spreadsheets/1caT7N_ZIeSvnYW_i7I3aze-5C2YltF-mTHiCxspi7Os?'),'new Sheet is the default');
 assert.ok(requests.every(r=>r.method==='GET'&&!r.body),'never writes to the Sheet');
 const params=new URL(requests[1].url).searchParams;
 assert.deepEqual(params.getAll('ranges'),["'THÁNG 12  | LỊCH QUAY'!A1:AE600","'THÁNG 12 | TASK DỰNG'!A1:V600"],'hidden tabs skipped; ranges bounded');
 assert.ok(params.get('fields').includes('merges'),'merged ranges are read from the API');
 await read();assert.equal(requests.length,2,'served from cache');
 const other=createEditScheduleReader({env:{EDIT_SCHEDULE_SHEET_ID:'1E2ZuJp4GNT_TlNMTFSfcM3FTzm4B2WqQiUhA39ej__c'},fetcher,tokenProvider:async()=>'token',now:()=>t});
 await other();assert.ok(requests[2].url.includes('/spreadsheets/1E2ZuJp4GNT_TlNMTFSfcM3FTzm4B2WqQiUhA39ej__c?'),'EDIT_SCHEDULE_SHEET_ID still overrides');
 status=403;await assert.rejects(read({refresh:true}),/Người xem/);
 assert.equal(vnToday(Date.parse('2026-11-22T17:30:00Z')),'2026-11-23');
});
