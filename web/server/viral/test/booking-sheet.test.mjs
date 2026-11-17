import test from 'node:test';import assert from 'node:assert/strict';
import {planBookingSheet,syncBookingSheet,columnName,EXTRA_COLUMNS} from '../booking-sheet.mjs';
import {parseBookings} from '../booking-report.mjs';
import {initializeData,createRuntime} from '../runtime.mjs';

const HEADER=['Ngày','Mã Đơn Hàng','Mã KH','Tên Nhãn Hàng','Talent Booking','Doanh Thu Hợp Đồng (VNĐ)','Chi Phí Talent/Quay (VNĐ)','Trạng thái thanh toán','Ghi chú'];
const crm=()=>[
 ['QUẢN LÝ ĐƠN HÀNG BOOKING'],
 HEADER,
 ['01/11/2026','DH001','KH01','Khách cũ','VN - Viral',10000000,4000000,'Đã thanh toán','nhập tay'],
 ['','DH002'],                                   // pre-generated code: must never be taken
 [],                                             // first completely empty row
 ['','','','','','','','','chỉ có ghi chú'],     // has a note: not empty
 ['Tổng cộng','','','','',10000000,4000000],
];
const booking=(over={})=>({code:'BK261115-01',date:'15/11/2026',brand:'Cafe Phố',project:'VN - Viral',quantity:1,amount:25000000,status:'Chờ kịch bản',account:'Account Hà',final_url:'',title:'Booking · Cafe Phố',cc:'CC Bình',vj:'VJ Cường',talent:'Talent Dung',editor:'',shoot_at:'17/11/2026 09:00',deliver_at:'20/11/2026 09:00',acceptance_at:'25/11/2026 09:00',script_url:'',tiktok_url:'',facebook_url:'',views:'',likes:'',comments:'',shares:'',accepted_at:'',accepted_by:'',updated_at:'15/11/2026 10:00',...over});
const apply=(cells,plan)=>{const out=cells.map(r=>[...r]);for(const h of plan.headers)(out[plan.headerRow]??=[])[h.col]=h.name;for(const w of plan.writes)(out[w.row]??=[])[w.col]=w.value;return out;};

test('a new booking takes the first empty row, keeps manual data and is read back by the revenue report',()=>{
 const cells=crm(),plan=planBookingSheet(cells,[booking()]);
 assert.equal(plan.headerRow,1);
 const rows=new Set(plan.writes.map(w=>w.row));assert.deepEqual([...rows],[4],'row 5 (first fully empty row)');
 const after=apply(cells,plan);
 assert.deepEqual(after[2],crm()[2],'manual order untouched');assert.deepEqual(after[3],['','DH002'],'pre-generated code untouched');
 assert.equal(after[5][8],'chỉ có ghi chú');assert.equal(after[6][0],'Tổng cộng');
 assert.equal(after[4][6],undefined,'cost is left for people to fill');
 const added=plan.headers.map(h=>h.name);
 for(const name of ['Số lượng video','Trạng thái booking','Sales phụ trách','Link video final',...EXTRA_COLUMNS.map(c=>c[1])])assert.ok(added.includes(name),'adds '+name);
 const parsed=parseBookings(after).items.find(x=>x.id==='BK261115-01');
 assert.equal(parsed.customer,'Cafe Phố');assert.equal(parsed.project,'VN - Viral');assert.equal(parsed.revenue,25000000);assert.equal(parsed.date,'2026-11-15');assert.equal(parsed.status,'Chờ kịch bản');assert.equal(parsed.sales,'Account Hà');
 assert.equal(parseBookings(after).items.find(x=>x.id==='DH001').revenue,10000000,'existing orders still parse');
});

test('updates go to the same row, only changed cells are written, and a repeat run writes nothing',()=>{
 let cells=apply(crm(),planBookingSheet(crm(),[booking()]));
 const plan=planBookingSheet(cells,[booking({status:'Hoàn tất',views:125400,accepted_by:'Account Hà'})]);
 assert.equal(plan.headers.length,0,'headers already present');
 assert.deepEqual(new Set(plan.writes.map(w=>w.row)),new Set([4]));
 assert.equal(plan.writes.length,3,'status, views, accepted_by');
 cells=apply(cells,plan);assert.equal(planBookingSheet(cells,[booking({status:'Hoàn tất',views:125400,accepted_by:'Account Hà'})]).writes.length,0);
});

test('when no empty row is left new bookings are added at the bottom, in order',()=>{
 const cells=crm().filter(r=>r.length),plan=planBookingSheet(cells,[booking(),booking({code:'BK261115-02',brand:'Trà Sữa'})]);
 const byCode=c=>plan.writes.find(w=>w.value===c).row;
 assert.equal(byCode('BK261115-01'),cells.length);assert.equal(byCode('BK261115-02'),cells.length+1);
 assert.equal(plan.rowsNeeded,cells.length+2);
});

test('a sheet without the report columns is rejected instead of being written blindly',()=>{
 assert.throws(()=>planBookingSheet([['A','B','C']],[booking()]),/Mã Đơn Hàng/);
});

test('syncBookingSheet grows the grid, writes RAW values to A1 ranges and explains permission errors',async()=>{
 const calls=[],cells=crm();
 const fetcher=async(url,init)=>{calls.push({url,body:init.body?JSON.parse(init.body):null});
  if(url.includes('?fields='))return {ok:true,json:async()=>({sheets:[{properties:{sheetId:7,title:'3. Quản Lý Đơn Hàng Booking',gridProperties:{rowCount:7,columnCount:9}}}]})};
  if(url.includes('/values/'))return {ok:true,json:async()=>({values:cells})};
  return {ok:true,json:async()=>({})};};
 const result=await syncBookingSheet([booking()],{fetcher,tokenProvider:async()=>'t',env:{}});
 assert.ok(result.written>0&&result.headersAdded>0);
 const grow=calls.find(c=>c.url.endsWith(':batchUpdate'));assert.equal(grow.body.requests[0].appendDimension.dimension,'COLUMNS');
 const write=calls.find(c=>c.url.endsWith('/values:batchUpdate'));assert.equal(write.body.valueInputOption,'RAW');
 assert.ok(write.body.data.some(d=>d.range==="'3. Quản Lý Đơn Hàng Booking'!B5"&&d.values[0][0]==='BK261115-01'));
 assert.ok(write.body.data.some(d=>d.range==="'3. Quản Lý Đơn Hàng Booking'!F5"&&d.values[0][0]===25000000),'amount is a number');
 const denied=async url=>url.includes('?fields=')?{ok:true,json:async()=>({sheets:[{properties:{sheetId:7,title:'3. Quản Lý Đơn Hàng Booking',gridProperties:{rowCount:7,columnCount:30}}}]})}:url.includes('/values/')?{ok:true,json:async()=>({values:cells})}:{ok:false,status:403,json:async()=>({})};
 await assert.rejects(syncBookingSheet([booking()],{fetcher:denied,tokenProvider:async()=>'t',env:{}}),/Người chỉnh sửa/);
 assert.equal(columnName(0),'A');assert.equal(columnName(25),'Z');assert.equal(columnName(26),'AA');assert.equal(columnName(51),'AZ');
});

test('Directors can create bookings; order codes are sequential per day; sheet rows are server-only',()=>{
 let data=initializeData();const h=data.books.main.Employees[0];
 for(const [id,name,dept,job,role] of [['1000','Giám đốc','Ban giám đốc','Giám đốc','director'],['1001','Leader','Content','Leader Content','leader'],['1011','CC','Content','Content Creator','employee'],['1012','VJ','Content','VJ','employee'],['1013','Talent','Content','Talent','employee']])data.books.main.Employees.push(h.map(k=>({telegram_id:id,name,department:dept,job_title:job,role,active:'true'}[k]||'')));
 const as=who=>(m,...a)=>{const rt=createRuntime(data,{employeeId:who});const out=rt.run(m,['supabase',...a]);data=rt.data;return out;};
 as('1001')('createV20Project','VN','Viral');
 assert.equal(as('1000')('bookingScreen').canCreate,true);assert.equal(as('1011')('bookingScreen').canCreate,false);
 const t=new Date(Date.now()+86400000).toISOString(),input=n=>({project:'VN - Viral',brand:'Brand '+n,brief:'b',amount_vnd:1000000*n,shoot_at:t,deliver_at:t,acceptance_at:t,cc_id:'1011',vj_id:'1012',talent_id:'1013',request_id:'director-booking-'+String(n).padStart(6,'0')});
 as('1000')('createBooking',input(1));const list=as('1000')('createBooking',input(2)).bookings;
 const codes=list.map(b=>b.order_code).sort();assert.match(codes[0],/^BK\d{6}-01$/);assert.equal(codes[1],codes[0].replace(/-01$/,'-02'));
 const b=list.find(x=>x.brand==='Brand 2');assert.equal(b.can.review_script,false);assert.equal(b.amount_vnd,2000000);
 const rt=createRuntime(data,null),rows=rt.run('bookingSheetRows_',[],true);
 assert.equal(rows.length,2);assert.ok(rows.every(r=>r.code&&r.amount>0&&r.quantity===1&&r.cc==='CC'));
 assert.throws(()=>createRuntime(data,{employeeId:'1000'}).run('bookingSheetRows_',['supabase']),/không được phép/);
});

test('a Director creating a booking does not unlock other production edits',()=>{
 let data=initializeData();const h=data.books.main.Employees[0];
 for(const [id,name,dept,job,role] of [['1000','Giám đốc','Ban giám đốc','Giám đốc','director'],['1001','Leader','Content','Leader Content','leader'],['1011','CC','Content','Content Creator','employee'],['1012','VJ','Content','VJ','employee'],['1013','Talent','Content','Talent','employee']])data.books.main.Employees.push(h.map(k=>({telegram_id:id,name,department:dept,job_title:job,role,active:'true'}[k]||'')));
 const as=who=>(m,...a)=>{const rt=createRuntime(data,{employeeId:who});const out=rt.run(m,['supabase',...a]);data=rt.data;return out;};
 as('1001')('createV20Project','VN','Viral');const t=new Date(Date.now()+86400000).toISOString();
 const b=as('1000')('createBooking',{project:'VN - Viral',brand:'X',brief:'b',amount_vnd:1000,shoot_at:t,deliver_at:t,acceptance_at:t,cc_id:'1011',vj_id:'1012',talent_id:'1013',request_id:'director-guard-000001'}).bookings[0];
 assert.throws(()=>as('1000')('saveProductionAsset',b.production_id,'script_url','https://example.com/s'),/chỉ được xem/);
 assert.throws(()=>as('1000')('createProductionItem',{project:'VN - Viral',title:'t',brief:'b',vj_id:'1012',approver_id:'1001',request_id:'director-guard-000002'}),/chỉ được xem/);
 // The Director owns the booking: reviews the script and accepts.
 as('1011')('saveProductionAsset',b.production_id,'script_url','https://example.com/s');
 assert.equal(as('1000')('reviewBookingScript',b.id,'approve','',as('1000')('bookingScreen').bookings[0].script_url).bookings[0].status,'production');
});
