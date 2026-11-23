import test from 'node:test';import assert from 'node:assert/strict';
import {parseEditWeek,personMatches,pickWeek,editScheduleScreen,editScheduleToday,sheetGrid,createEditScheduleReader,splitPeople,vnToday} from '../edit-schedule.mjs';

const ZW='​';
// Same layout as the real "ORDER TASK DỰNG" tab: dates merged over two columns, weekday row, header row, channels.
function weekTab(dates=['23/11','24/11','25/11','26/11','27/11','28/11','29/11'],channels=['LƯỢN ĐÀ NẴNG','ĐÀ NẴNG DAILY','VIRAL ĐÀ NẴNG']){
 const width=1+dates.length*2,row=()=>Array.from({length:width},()=>({v:''}));
 const grid=[row(),row(),row(),row(),row()],merges=[{startRowIndex:0,endRowIndex:1,startColumnIndex:1,endColumnIndex:3}];
 dates.forEach((d,i)=>{const c=1+i*2;grid[2][c]={v:d};grid[3][c]={v:['THỨ 2','THỨ 3','THỨ 4','THỨ 5','THỨ 6','THỨ 7','CHỦ NHẬT'][i]};grid[4][c]={v:'TÊN TASK'};grid[4][c+1]={v:'NGƯỜI THỰC HIỆN'};
  merges.push({startRowIndex:2,endRowIndex:3,startColumnIndex:c,endColumnIndex:c+2},{startRowIndex:3,endRowIndex:4,startColumnIndex:c,endColumnIndex:c+2});});
 grid[4][0]={v:'KÊNH/VJ'};
 for(const name of channels){const r=row();r[0]={v:name};for(let c=2;c<width;c+=2)r[c]={v:ZW};grid.push(r);}
 return {grid,merges};
}

test('parses the real weekly layout: 7 days, channels in Sheet order, empty zero-width cells ignored',()=>{
 const {grid,merges}=weekTab(),w=parseEditWeek(grid,{merges,title:'TUẦN 4/THÁNG 11',gid:0,today:'2026-11-23'});
 assert.equal(w.start,'2026-11-23');assert.equal(w.end,'2026-11-29');
 assert.deepEqual(w.days.map(d=>d.weekday),['Thứ 2','Thứ 3','Thứ 4','Thứ 5','Thứ 6','Thứ 7','Chủ nhật']);
 assert.deepEqual(w.days.map(d=>d.label),['23/11','24/11','25/11','26/11','27/11','28/11','29/11']);
 assert.deepEqual(w.channels.map(c=>c.name),['LƯỢN ĐÀ NẴNG','ĐÀ NẴNG DAILY','VIRAL ĐÀ NẴNG']);
 assert.ok(w.channels.every(c=>c.days.length===7&&c.days.every(ts=>ts.length===0)));
 assert.deepEqual(w.people,[]);
});

test('each line of a cell is one task; people pair line by line, or apply to every task',()=>{
 const {grid,merges}=weekTab();
 grid[5][1]={v:'Vlog chợ Hàn\n- Review quán ốc',bg:'#fff2cc'};grid[5][2]={v:'Minh Thi\nThiên Quí'};
 grid[6][3]={v:'Clip cầu Rồng\nClip biển'};grid[6][4]={v:'Minh Thi, Chị Vy'};
 grid[7][13]={v:''};grid[7][14]={v:'Chị Vy'};
 grid[7][5]={v:'Recap',link:'https://example.com/a'};
 const w=parseEditWeek(grid,{merges,today:'2026-11-23'});
 assert.deepEqual(w.channels[0].days[0],[{title:'Vlog chợ Hàn',people:['Minh Thi'],bg:'#fff2cc'},{title:'Review quán ốc',people:['Thiên Quí'],bg:'#fff2cc'}]);
 assert.deepEqual(w.channels[1].days[1],[{title:'Clip cầu Rồng',people:['Minh Thi','Chị Vy']},{title:'Clip biển',people:['Minh Thi','Chị Vy']}]);
 assert.deepEqual(w.channels[2].days[6],[{title:'',people:['Chị Vy']}],'a name without a task is still shown');
 assert.deepEqual(w.channels[2].days[2],[{title:'Recap',people:[],link:'https://example.com/a'}]);
 assert.deepEqual(w.people,['Chị Vy','Minh Thi','Thiên Quí']);
});

test('merged channel cells join rows; merged task cells show once; totals and notes rows are skipped',()=>{
 const {grid,merges}=weekTab(undefined,['KÊNH A','','TỔNG']);
 merges.push({startRowIndex:5,endRowIndex:7,startColumnIndex:0,endColumnIndex:1});
 grid[5][1]={v:'Task 1'};grid[6][1]={v:'Task 2'};
 grid[5][3]={v:'Dài 2 ngày'};merges.push({startRowIndex:5,endRowIndex:7,startColumnIndex:3,endColumnIndex:4});
 grid[7][1]={v:'không tính'};
 const w=parseEditWeek(grid,{merges,today:'2026-11-23'});
 assert.deepEqual(w.channels.map(c=>c.name),['KÊNH A']);
 assert.deepEqual(w.channels[0].days[0].map(t=>t.title),['Task 1','Task 2']);
 assert.deepEqual(w.channels[0].days[1].map(t=>t.title),['Dài 2 ngày'],'a task merged over two rows is not duplicated');
});

test('years: nearest to today, and a week crossing New Year moves to the next year',()=>{
 const {grid,merges}=weekTab(['29/12','30/12','31/12','01/01','02/01','03/01','04/01']);
 const w=parseEditWeek(grid,{merges,today:'2027-01-02'});
 assert.equal(w.start,'2026-12-29');assert.equal(w.end,'2027-01-04');assert.equal(w.days[3].weekday,'Thứ 6');
 const full=weekTab(['23/11/2026','24/11/2026','25/11/2026']);
 assert.equal(parseEditWeek(full.grid,{merges:full.merges,today:'2030-01-01'}).start,'2026-11-23','explicit years win');
});

test('a tab without a date row is not a schedule',()=>{
 assert.equal(parseEditWeek([[{v:'Hướng dẫn'}],[{v:'Ghi tên task vào ô'}]]),null);
});

test('person matching ignores accents/case and accepts the end of the full name',()=>{
 assert.ok(personMatches('MINH THI','Nguyễn Minh Thi'));
 assert.ok(personMatches('minh thi','Minh Thi'));
 assert.ok(personMatches('Thi','Thi'));
 assert.ok(!personMatches('Thi','Nguyễn Minh Thi'),'one word only matches exactly');
 assert.ok(!personMatches('Anh Thi','Nguyễn Minh Thi'));
 assert.ok(!personMatches('','Minh Thi'));
 assert.deepEqual(splitPeople('Minh Thi, Chị Vy và Quí / Hà'),['Minh Thi','Chị Vy','Quí','Hà']);
});

test('home card: my tasks today; team totals and empty channels only for Leader/Director',()=>{
 const {grid,merges}=weekTab();
 grid[5][3]={v:'Vlog'};grid[5][4]={v:'Minh Thi'};grid[6][3]={v:'Clip'};grid[6][4]={v:'Chị Vy'};
 const book={weeks:[parseEditWeek(grid,{merges,gid:3,title:'TUẦN 4',today:'2026-11-24'})]};
 const editor=editScheduleToday(book,{user:{name:'Nguyễn Minh Thi',role:'employee'},today:'2026-11-24'});
 assert.equal(editor.found,true);assert.equal(editor.gid,3);assert.deepEqual(editor.mine.map(t=>[t.channel,t.title]),[['LƯỢN ĐÀ NẴNG','Vlog']]);
 assert.deepEqual(editor.emptyChannels,[],'staff do not get the team overview');
 const lead=editScheduleToday(book,{user:{name:'Leader',role:'leader'},today:'2026-11-24'});
 assert.equal(lead.total,2);assert.equal(lead.channels,3);assert.deepEqual(lead.emptyChannels,['VIRAL ĐÀ NẴNG']);
 assert.equal(editScheduleToday(book,{user:{name:'X',role:'employee'},today:'2026-12-10'}).found,false);
});

test('screen opens the week containing today, or a chosen tab',()=>{
 const a=weekTab(['16/11','17/11','18/11','19/11','20/11','21/11','22/11']),b=weekTab();
 const book={sheetUrl:'https://docs.google.com/spreadsheets/d/x/edit',readAt:'2026-11-23T00:00:00Z',weeks:[parseEditWeek(b.grid,{merges:b.merges,gid:2,title:'T4',today:'2026-11-23'}),parseEditWeek(a.grid,{merges:a.merges,gid:1,title:'T3',today:'2026-11-23'})]};
 const now=editScheduleScreen(book,{user:{name:'A'},today:'2026-11-25'});
 assert.equal(now.week.gid,2);assert.deepEqual(now.weeks.map(w=>w.gid),[1,2],'weeks sorted by date');assert.ok(now.sheetUrl.endsWith('#gid=2'));
 assert.equal(editScheduleScreen(book,{gid:'1',user:{name:'A'},today:'2026-11-25'}).week.gid,1);
 assert.equal(pickWeek(book.weeks,'2026-12-20').gid,2,'after the last week: latest week');
 assert.equal(pickWeek(book.weeks,'2026-10-01').gid,1,'before the first week: first week');
});

test('sheetGrid keeps text, non-white backgrounds and http links only',()=>{
 const {grid,merges}=sheetGrid({merges:[{startRowIndex:0,endRowIndex:1,startColumnIndex:0,endColumnIndex:2}],data:[{startRow:1,startColumn:1,rowData:[{values:[
  {formattedValue:'A',effectiveFormat:{backgroundColor:{red:1,green:1,blue:1}}},
  {formattedValue:'B',effectiveFormat:{backgroundColor:{red:1,green:0.949,blue:0.8}},hyperlink:'javascript:alert(1)'},
  {formattedValue:'C',hyperlink:'https://x.test/v'}]}]}]});
 assert.deepEqual(grid[1].slice(1),[{v:'A'},{v:'B',bg:'#fff2cc'},{v:'C',link:'https://x.test/v'}]);
 assert.deepEqual(grid[0],[]);assert.equal(merges.length,1);
});

test('reader: read-only scope, GET requests only, one batched read, cached, clear permission error',async()=>{
 const requests=[];let status=200;
 const {grid}=weekTab();
 const values=grid.map(r=>({values:r.map(c=>({formattedValue:c.v}))}));
 const fetcher=async(url,options)=>{
  requests.push({url,method:options?.method||'GET',body:options?.body});
  if(status!==200)return {ok:false,status,json:async()=>({})};
  if(url.includes('ranges='))return {ok:true,json:async()=>({sheets:[{properties:{sheetId:5,title:'TUẦN 4/THÁNG 11'},merges:[],data:[{rowData:values}]},{properties:{sheetId:6,title:'Hướng dẫn'},data:[{rowData:[{values:[{formattedValue:'Ghi chú'}]}]}]}]})};
  return {ok:true,json:async()=>({sheets:[{properties:{sheetId:5,title:'TUẦN 4/THÁNG 11',gridProperties:{rowCount:1000,columnCount:26}}},{properties:{sheetId:6,title:'Hướng dẫn'}},{properties:{sheetId:9,title:'Ẩn',hidden:true}}]})};
 };
 let t=Date.parse('2026-11-23T03:00:00Z');
 const read=createEditScheduleReader({env:{EDIT_SCHEDULE_SHEET_ID:'1E2ZuJp4GNT_TlNMTFSfcM3FTzm4B2WqQiUhA39ej__c'},fetcher,tokenProvider:async()=>'token',now:()=>t});
 const book=await read();
 assert.equal(book.weeks.length,1);assert.equal(book.weeks[0].gid,5);assert.deepEqual(book.skipped,['Hướng dẫn']);
 assert.ok(requests.every(r=>r.method==='GET'&&!r.body),'never writes to the Sheet');
 assert.equal(requests.length,2);
 const ranges=new URL(requests[1].url).searchParams.getAll('ranges');
 assert.deepEqual(ranges,["'TUẦN 4/THÁNG 11'!A1:Z300","'Hướng dẫn'!A1:Z200"],'hidden tabs skipped; ranges bounded');
 await read();assert.equal(requests.length,2,'served from cache');
 await read({refresh:true});assert.equal(requests.length,4);
 status=403;await assert.rejects(read({refresh:true}),/Người xem/);
 assert.equal(vnToday(Date.parse('2026-11-22T17:30:00Z')),'2026-11-23','Vietnam day starts at 17:00 UTC');
});
