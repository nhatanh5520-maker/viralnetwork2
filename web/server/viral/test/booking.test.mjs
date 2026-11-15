import {test} from 'node:test';import assert from 'node:assert/strict';
import {initializeData,createRuntime} from '../runtime.mjs';

const ACC='3001',CC='3002',VJ='3003',TAL='3004',ED='3005',LEAD='3006',DIR='3007',OTHER='3008',KT='3009',ACC2='3010';
function fixture(){
 const d=initializeData(),h=d.books.main.Employees[0];
 for(const [id,name,dept,job,role] of [[ACC,'An Account','Kinh doanh','Account','employee'],[CC,'Chi CC','Content','Content Creator','employee'],[VJ,'Vy VJ','Content','VJ','employee'],[TAL,'Tú Talent','Content','Talent','employee'],[ED,'Em Editor','Media','Editor','employee'],[LEAD,'Lê Leader','Content','Leader Content','leader'],[DIR,'Giám đốc','BGĐ','Giám đốc','director'],[OTHER,'Người khác','Media','Editor','employee'],[KT,'Kế toán','Hành chính','Kế toán','employee'],[ACC2,'Account khác','Kinh doanh','Account','employee']])
  d.books.main.Employees.push(h.map(k=>({telegram_id:id,name,department:dept,job_title:job,role,active:'true'}[k]||'')));
 d.books.main.Settings.push(['accountant_telegram_id',KT]);
 return d;
}
let seq=0;const rid=()=>'bk-test-request-'+String(++seq).padStart(6,'0');
function app(){
 let data=fixture();
 const as=(who)=>(method,...args)=>{const rt=createRuntime(data,{employeeId:who},{BOT_TOKEN:'t'});const out=rt.run(method,['supabase',...args]);data=rt.data;return out;};
 as(LEAD)('createV20Project','VN','Viral');
 return {as,get data(){return data;},set data(v){data=v;}};
}
const input=(over={})=>({request_id:rid(),project:'VN - Viral',brand:'Sữa ABC',amount_vnd:'25.000.000',brief:'Giới thiệu sản phẩm mới',shoot_at:'2026-11-20T02:00:00Z',deliver_at:'2026-11-25T10:00:00Z',acceptance_at:'2026-12-05T10:00:00Z',cc_id:CC,vj_id:VJ,talent_id:TAL,editor_id:ED,...over});
const notes=(data)=>data.books.main.Notifications.slice(1).map(r=>({to:String(r[2]),text:String(r[3])}));

test('full booking flow: create -> script -> approve -> produce -> metrics -> accept',()=>{
 const a=app();
 const created=a.as(ACC)('createBooking',input());const b=created.bookings[0];
 assert.equal(b.status,'script');assert.equal(b.amount_vnd,25000000);assert.equal(b.stage,'shoot');
 const x=a.data.books.main.ProductionItems;assert.equal(x.length,2,'one production video created');
 assert.ok(notes(a.data).some(n=>n.to===TAL&&/BOOKING MỚI/.test(n.text)),'talent is notified');
 assert.ok(!notes(a.data).some(n=>/25\.000\.000|25000000/.test(n.text)),'amount never goes into Telegram');
 // Shooting is locked until the script is approved.
 assert.throws(()=>a.as(VJ)('saveProductionAsset',b.production_id,'raw_url','https://example.com/raw'),/duyệt kịch bản/);
 a.as(CC)('saveProductionAsset',b.production_id,'script_url','https://example.com/script');
 let s=a.as(ACC)('bookingScreen').bookings[0];assert.equal(s.status,'script_review');assert.equal(s.can.review_script,true);
 assert.ok(notes(a.data).some(n=>n.to===ACC&&/CHỜ DUYỆT/.test(n.text)));
 assert.throws(()=>a.as(ACC)('reviewBookingScript',b.id,'revise',''),/ghi rõ/);
 a.as(ACC)('reviewBookingScript',b.id,'revise','Thêm cảnh mở hộp',s.script_url);
 assert.equal(a.as(ACC)('bookingScreen').bookings[0].status,'script');
 assert.throws(()=>a.as(VJ)('saveProductionAsset',b.production_id,'raw_url','https://example.com/raw'),/duyệt kịch bản/);
 a.as(VJ)('saveProductionAsset',b.production_id,'script_url','https://example.com/script-v2');
 s=a.as(ACC)('bookingScreen').bookings[0];assert.equal(s.status,'script_review');
 assert.throws(()=>a.as(ACC)('reviewBookingScript',b.id,'approve','','https://example.com/script'),/vừa được cập nhật/);
 a.as(ACC)('reviewBookingScript',b.id,'approve','',s.script_url);
 assert.equal(a.as(ACC)('bookingScreen').bookings[0].status,'production');
 // Normal production now works.
 a.as(VJ)('saveProductionAsset',b.production_id,'raw_url','https://example.com/raw');
 a.as(VJ)('handoffProductionAssets',b.production_id);
 a.as(ED)('saveProductionAsset',b.production_id,'final_url','https://example.com/final');
 a.as(ED)('completeProductionFinal',b.production_id);
 assert.throws(()=>a.as(VJ)('submitBookingMetrics',b.id,{views:1000}),/sau khi video đã đăng/);
 a.as(LEAD)('setProductionPublished',b.production_id,true);
 s=a.as(VJ)('bookingScreen').bookings[0];assert.equal(s.status,'metrics');assert.equal(s.can.submit_metrics,true);assert.equal(s.amount_vnd,undefined,'VJ does not see the amount');
 assert.throws(()=>a.as(OTHER)('submitBookingMetrics',b.id,{views:5}),/Chỉ CC, VJ hoặc Talent/);
 a.as(VJ)('submitBookingMetrics',b.id,{views:'12.500',likes:800,comments:'40',shares:12});
 s=a.as(ACC)('bookingScreen').bookings[0];assert.equal(s.status,'acceptance');assert.deepEqual([s.metrics.views,s.metrics.likes,s.metrics.comments,s.metrics.shares],[12500,800,40,12]);
 assert.throws(()=>a.as(ACC2)('acceptBooking',b.id),/Account phụ trách/);
 a.as(ACC)('acceptBooking',b.id);
 assert.equal(a.as(ACC)('bookingScreen').bookings[0].status,'done');
});

test('visibility and money: participants see their bookings; amount only for Account, accountant, director',()=>{
 const a=app();const b=a.as(ACC)('createBooking',input()).bookings[0];
 assert.equal(a.as(OTHER)('bookingScreen').bookings.length,0,'unrelated staff see nothing');
 assert.equal(a.as(ED)('bookingScreen').bookings.length,1,'assigned editor sees it');
 assert.equal(a.as(ED)('bookingScreen').bookings[0].amount_vnd,undefined);
 assert.equal(a.as(TAL)('bookingScreen').bookings[0].amount_vnd,undefined);
 assert.equal(a.as(KT)('bookingScreen').bookings[0].amount_vnd,25000000);
 assert.equal(a.as(DIR)('bookingScreen').bookings[0].amount_vnd,25000000);
 assert.equal(a.as(LEAD)('bookingScreen').bookings[0].amount_vnd,undefined,'content leader sees bookings but not money');
 assert.equal(a.as(ACC2)('bookingScreen').bookings.length,0,'another Account does not see it');
 assert.equal(a.as(ACC2)('bookingScreen').canCreate,true);assert.equal(a.as(VJ)('bookingScreen').canCreate,false);
 assert.ok(b.id);
});

test('validation: only Accounts and Directors create; dates in order; repeated request does not duplicate',()=>{
 const a=app();
 assert.throws(()=>a.as(VJ)('createBooking',input()),/Chỉ Account/);
 assert.equal(a.as(DIR)('bookingScreen').canCreate,true,'Directors can create bookings');
 assert.throws(()=>a.as(ACC)('createBooking',input({deliver_at:'2026-11-19T00:00:00Z'})),/sau ngày quay/);
 assert.throws(()=>a.as(ACC)('createBooking',input({amount_vnd:'0'})),/Số tiền/);
 assert.throws(()=>a.as(ACC)('createBooking',input({talent_id:''})),/Talent/);
 const one=input();a.as(ACC)('createBooking',one);a.as(ACC)('createBooking',one);
 assert.equal(a.as(ACC)('bookingScreen').bookings.length,1);assert.equal(a.data.books.main.ProductionItems.length,2);
});

test('reading the booking screen never changes stored data',()=>{
 const a=app();const before=JSON.stringify(a.data);a.as(VJ)('bookingScreen');a.as(DIR)('bookingScreen');assert.equal(JSON.stringify(a.data),before);
});

test('normal (non-booking) production keeps the original rules',()=>{
 const a=app();
 assert.throws(()=>a.as(LEAD)('createProductionItem',{project:'VN - Viral',title:'Video thường',brief:'b',vj_id:VJ,editor_id:ED,approver_id:'',request_id:rid()}),/Leader/);
});

test('scheduler reminds CC/VJ 48h after publishing, once per day, only in working hours',()=>{
 const a=app();const b=a.as(ACC)('createBooking',input()).bookings[0];
 a.as(CC)('saveProductionAsset',b.production_id,'script_url','https://example.com/s');a.as(ACC)('reviewBookingScript',b.id,'approve','',a.as(ACC)('bookingScreen').bookings[0].script_url);
 a.as(VJ)('saveProductionAsset',b.production_id,'raw_url','https://example.com/raw');a.as(VJ)('handoffProductionAssets',b.production_id);
 a.as(ED)('saveProductionAsset',b.production_id,'final_url','https://example.com/final');a.as(ED)('completeProductionFinal',b.production_id);a.as(LEAD)('setProductionPublished',b.production_id,true);
 // Move publish time 3 days back.
 const items=a.data.books.main.ProductionItems,h=items[0],row=items.find(r=>String(r[0])===b.production_id);row[h.indexOf('published_at')]=new Date(Date.now()-72*3600000).toISOString();
 const run=()=>{const rt=createRuntime(a.data,null,{BOT_TOKEN:'t'});rt.run('v16Scheduler',[],true);a.data=rt.data;};
 const count=()=>notes(a.data).filter(n=>/NHẮC NHẬP SỐ LIỆU/.test(n.text)).length;
 const hour=Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Ho_Chi_Minh',hour:'2-digit',hourCycle:'h23'}).format(new Date()));
 run();run();
 if(hour>=8&&hour<20)assert.equal(count(),2,'CC and VJ once each');else assert.equal(count(),0,'no reminders at night');
 // Sent once in total, not once a day: the key carries no date, and the scheduler skips keys it has seen.
 const keys=a.data.books.main.Notifications.slice(1).map(r=>String(r[1])).filter(k=>k.includes(':metrics_reminder:'));
 for(const k of keys)assert.doesNotMatch(k,/\d{4}-\d{2}-\d{2}/,'reminder key must not contain a date');
});
