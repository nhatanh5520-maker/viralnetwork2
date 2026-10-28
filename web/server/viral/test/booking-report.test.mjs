import test from 'node:test';
import assert from 'node:assert/strict';
import {bookingReport,parseBookings,bookingDate,bookingAmount} from '../booking-report.mjs';
import {createBookingReader,BOOKING_SHEET_NAME} from '../google-booking.mjs';
const headers=['Ngày','Mã Đơn Hàng','Mã KH','Tên Nhãn Hàng','Talent Booking','Số Lượng Video','Doanh Thu Hợp Đồng (VNĐ)','Chi Phí Talent/Quay (VNĐ)','Lợi Nhuận Gộp (VNĐ)','Trạng Thái Booking','Trạng Thái Thanh Toán','Sales Phụ Trách','Hashtag Bắt Buộc','Link Video Final','Ghi Chú Tiến Độ'];
const cells=[['CRM'],[],headers,[46324,'BK1','KH1','Khách A','Dự án A',1,500000,0,500000,'Chờ quay'],['2026-10-31','BK2','KH2','Khách B','Dự án B',2,1000000,300000],['01/11/2026','BK3','KH3','Khách C','Dự án A',1,400000,100000],['','BK4','','Khách D','Dự án A',1,'',''],['','BK5'],['','BK6','','','','TỔNG CỘNG:',1900000,400000,1500000]];
const book={cells,readAt:'2026-10-28T01:00:00Z',sheetName:BOOKING_SHEET_NAME,sheetUrl:'https://docs.google.com/spreadsheets/d/test/edit'};
test('booking parser skips pre-generated IDs and total row even when it has a booking code',()=>{
 const result=parseBookings(cells);assert.equal(result.items.length,4);assert.ok(!result.items.some(x=>['BK5','BK6'].includes(x.id)));
 assert.equal(result.items[0].date,'2026-10-29');assert.equal(result.items[0].cost,0);assert.equal(result.items[3].cost,null);
});
test('month/day/range and project filters use booking date with exact totals',()=>{
 const month=bookingReport(book,{mode:'month',month:'2026-10'});assert.equal(month.total.count,2);assert.equal(month.total.revenue,1500000);assert.equal(month.total.cost,300000);assert.equal(month.total.profit,1200000);
 const project=bookingReport(book,{mode:'month',month:'2026-10',project:'Dự án A'});assert.equal(project.total.count,1);assert.equal(project.total.revenue,500000);assert.equal(project.undatedCount,1);
 assert.equal(bookingReport(book,{mode:'day',day:'2026-10-29'}).items[0].id,'BK1');
 const range=bookingReport(book,{mode:'range',from:'2026-10-31',to:'2026-11-01'});assert.equal(range.total.count,2);assert.equal(range.total.revenue,1400000);
 const all=bookingReport(book,{mode:'all'});assert.equal(all.total.count,4);assert.equal(all.total.revenue,1900000);assert.equal(all.total.missingRevenue,1);assert.equal(all.total.profit,null);assert.equal(all.items.at(-1).id,'BK4');
});
test('invalid dates, money, duplicates and headers never silently produce complete totals',()=>{
 for(const value of ['31/02/2026','2026-02-30','not-a-date',false])assert.equal(bookingDate(value),null);
 assert.equal(bookingDate('29/02/2024'),'2024-02-29');assert.equal(bookingAmount('500.000 VNĐ'),500000);assert.equal(bookingAmount('1,000,000'),1000000);assert.equal(bookingAmount('#SHEET_ERROR:REF'),null);assert.equal(bookingAmount(false),null);
 for(const filters of [{mode:'day',day:'2026-02-30'},{mode:'range',from:'2026-11-02',to:'2026-11-01'},{mode:'month',month:'2026-13'},{mode:'all',offset:-1}])assert.throws(()=>bookingReport(book,filters));
 assert.throws(()=>parseBookings([headers,cells[3],cells[3]]),/bị trùng/);assert.throws(()=>parseBookings([['Mã Đơn Hàng']]),/cần các cột/);
 const changed=structuredClone(cells);changed[3][6]='#SHEET_ERROR:REF';const result=bookingReport({...book,cells:changed},{mode:'all'});assert.equal(result.total.missingRevenue,2);assert.equal(result.total.profit,null);
});
test('pagination does not change totals and includes all matched rows exactly once',()=>{
 const rows=Array.from({length:111},(_,i)=>['2026-10-28','B'+i,'KH','Khách','Dự án',1,1000,100]);
 const b={...book,cells:[headers,...rows]},ids=[];let offset=0;
 do{const r=bookingReport(b,{mode:'all',offset});assert.equal(r.total.count,111);assert.equal(r.total.revenue,111000);ids.push(...r.items.map(x=>x.id));offset=r.nextOffset;}while(offset!==null);
 assert.equal(new Set(ids).size,111);
});
function transport(){let status=200,time=0;const calls=[];
 const fetcher=async(url,options)=>{calls.push({url,options});return {ok:status===200,status,json:async()=>url.includes('ranges=')?{sheets:[{data:[{rowData:cells.map(row=>({values:row.map(v=>({effectiveValue:typeof v==='number'?{numberValue:v}:{stringValue:v}}))}))}]}]}:{sheets:[{properties:{title:BOOKING_SHEET_NAME,sheetId:377270745,gridProperties:{rowCount:1000,columnCount:27}}}]}};};
 const read=createBookingReader({env:{},fetcher,tokenProvider:async()=>'private-test-token',now:()=>time});
 return {read,calls,setStatus:v=>status=v,setTime:v=>time=v};
}
test('Google booking reader reads only selected tab, uses readonly auth and shares bounded fresh cache',async()=>{
 const t=transport(),books=await Promise.all(Array.from({length:20},()=>t.read()));assert.equal(t.calls.length,2);assert.ok(t.calls.every(x=>x.options.cache==='no-store'));assert.ok(new URL(t.calls[1].url).searchParams.get('ranges').includes(BOOKING_SHEET_NAME));
 books[0].cells[3][6]=0;assert.equal(books[1].cells[3][6],500000);await t.read();assert.equal(t.calls.length,2);
 await t.read({refresh:true});assert.equal(t.calls.length,4);
 assert.equal(bookingReport(books[1],{mode:'month',month:'2026-10'}).total.revenue,1500000);
});
test('expired or explicitly refreshed cache never serves old values after Google denies access',async()=>{
 const t=transport();await t.read();t.setStatus(403);t.setTime(31000);await assert.rejects(t.read(),/Chưa có quyền/);
 t.setStatus(200);await t.read();t.setStatus(403);await assert.rejects(t.read({refresh:true}),/Chưa có quyền/);
});
