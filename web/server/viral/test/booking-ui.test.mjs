import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
import {bookingReport} from '../booking-report.mjs';
const header=['Ngày','Mã Đơn Hàng','Tên Nhãn Hàng','Talent Booking','Doanh Thu Hợp Đồng (VNĐ)','Chi Phí Talent/Quay (VNĐ)','Trạng Thái Booking','Ghi Chú Tiến Độ'];
const book={cells:[header,['2026-10-29','BK1','Khách A','Dự án A',500000,100000,'Chờ quay','Nội dung'],['2026-11-01','BK2','Khách B','Dự án B',1000000,200000]],readAt:'2026-10-28T01:00:00Z'};
function setup(role='director'){
 const dom=new JSDOM('<div id="screen"></div>',{url:'https://app.test',runScripts:'outside-only'}),w=dom.window,calls=[];w.scrollTo=()=>{};
 w.eval(`var state={user:{id:'1',role:${JSON.stringify(role)}},today:'2026-10-28'},tab='booking',webSessionGeneration=0,formDirty=false;var $=id=>document.getElementById(id);function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}function go(value){tab=value;}`);
 w.call=async(method,filters)=>{calls.push({method,filters});return bookingReport(book,filters);};
 w.eval(fs.readFileSync('public/viral/booking.js','utf8')+';window.testBookingReport=()=>bookingState.report;');
 const tick=async()=>{for(let i=0;i<10;i++)await Promise.resolve();};return {w,calls,tick};
}
test('director sees booking cards, opens order details and returns with filters intact',async()=>{
 const x=setup(),{w}=x;try{
 w.bookingView();await x.tick();assert.equal(x.calls[0].method,'bookingReport');assert.equal(w.document.querySelectorAll('[data-booking-order]').length,1);
 const card=w.document.querySelector('[data-booking-order]');assert.match(card.textContent,/Khách A/);assert.match(card.textContent,/500.000/);card.click();
 assert.ok(w.document.getElementById('bookingBack'));assert.match(w.document.getElementById('screen').textContent,/Chi tiết đơn hàng/);assert.match(w.document.getElementById('screen').textContent,/29\/10\/2026/);
 w.document.getElementById('bookingBack').click();assert.equal(w.document.getElementById('bookingMonth').value,'2026-10');
 const mode=w.document.getElementById('bookingMode');mode.value='all';mode.dispatchEvent(new w.Event('change'));w.document.getElementById('bookingApply').click();await x.tick();assert.equal(w.document.querySelectorAll('[data-booking-order]').length,2);
 const project=w.document.getElementById('bookingProject');project.value='Dự án B';project.dispatchEvent(new w.Event('change'));w.document.getElementById('bookingApply').click();await x.tick();assert.equal(w.document.querySelectorAll('[data-booking-order]').length,1);assert.match(w.document.querySelector('[data-booking-order]').textContent,/Khách B/);
 }finally{w.close();}
});
test('Leader and Employee cannot render booking data or send report requests',async()=>{
 for(const role of ['leader','employee']){const {w,calls,tick}=setup(role);try{w.bookingView();await w.loadBooking();await tick();assert.equal(calls.length,0);assert.match(w.document.getElementById('screen').textContent,/Chỉ Ban giám đốc/);}finally{w.close();}}
});
test('booking utility is shown only to Directors and no booking data is embedded in public scripts',()=>{
 const client=fs.readFileSync('public/viral/client.js','utf8'),utility=client.slice(client.indexOf('function utilitiesView()'),client.indexOf('function expenseImageData'));
 for(const role of ['director','leader','employee']){const {w}=setup(role);try{w.eval(utility);w.utilitiesView();assert.equal(!!w.document.querySelector('[data-go="booking"]'),role==='director');}finally{w.close();}}
 const script=fs.readFileSync('public/viral/booking.js','utf8');assert.doesNotMatch(script,/Tiệm mì Tiều Châu|1oCiRiVG|GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY/);
});
test('late booking response after session reset cannot restore private report data',async()=>{
 const x=setup(),{w}=x;try{let resolve;w.call=()=>new Promise(r=>resolve=r);w.bookingView();w.eval('webSessionGeneration++;state={user:{id:"2",role:"employee"}}');w.dispatchEvent(new w.Event('viral:session-reset'));w.bookingView();resolve(bookingReport(book,{mode:'all'}));await x.tick();assert.match(w.document.getElementById('screen').textContent,/Chỉ Ban giám đốc/);assert.equal(w.testBookingReport(),null);}finally{w.close();}
});
