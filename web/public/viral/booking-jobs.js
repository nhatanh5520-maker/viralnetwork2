/* Booking tab (replaces Bảng tin in the main menu). Data: RPC bookingScreen.
 * Tab id is 'bookings' so it does not collide with the Directors' revenue report in booking.js
 * (tab "booking", bookingView), which stays reachable from Tiện ích and from this screen. */
(function(){
 paths.bookings='<path d="M3 9V6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v3a3 3 0 0 0 0 6v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3a3 3 0 0 0 0-6Z"/><path d="M14 5v2m0 3v2m0 3v2"/>';
 const style=document.createElement('style');
 style.textContent='.booking-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}.booking-group{margin:18px 0 8px;font-size:13px;letter-spacing:.04em;text-transform:uppercase;color:var(--muted)}.booking-card{margin-bottom:12px}.booking-card h3{margin:0 0 2px}.booking-meta{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:6px 14px;margin:10px 0;font-size:13px}.booking-meta b{display:block;font-size:11px;color:var(--muted);font-weight:600}.booking-pill{display:inline-block;border-radius:30px;padding:3px 10px;font-size:12px;font-weight:700;background:#263c2f;color:#cef3da}.booking-pill.warn{background:#4a3a17;color:#ffd98a}.booking-pill.done{background:#1d3a4a;color:#a9dcff}.booking-pill.off{background:#3a2a2a;color:#ffc4be}.booking-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.booking-metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.booking-metrics input{margin:4px 0 8px}.booking-form .grid2{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:0 14px}.booking-note{margin:8px 0;padding:8px 10px;border-radius:10px;background:#1b2520;font-size:13px}.booking-badge{margin-left:6px;background:#4a3a17!important;color:#ffd98a!important}';
 document.head.append(style);

 const order=['script','script_review','production','metrics','acceptance','done','cancelled'];
 const pill={script:'warn',script_review:'warn',production:'',metrics:'warn',acceptance:'warn',done:'done',cancelled:'off'};
 const store={data:null,at:0,loading:null,creating:false,draft:null,openMetrics:null};
 const people=()=>[...(state?.productionPeople||state?.employees||[])].sort((a,b)=>String(a.name).localeCompare(String(b.name),'vi'));
 const name=id=>(state?.peopleNames||{})[String(id)]||people().find(p=>String(p.telegram_id)===String(id))?.name||'—';
 const money=n=>Number(n||0).toLocaleString('vi-VN')+' đ';
 const day=iso=>{if(!iso)return '—';const d=new Date(iso);return isNaN(d)?'—':d.toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'})};
 const link=(url,label)=>url&&/^https?:\/\//i.test(url)?`<a href="${esc(url)}" target="_blank" rel="noopener">${esc(label)}</a>`:'—';
 const options=(selected,filter)=>'<option value="">— Chọn —</option>'+people().filter(filter||(()=>true)).map(p=>`<option value="${esc(p.telegram_id)}" ${String(selected||'')===String(p.telegram_id)?'selected':''}>${esc(p.name)}${p.job_title?' · '+esc(p.job_title):''}</option>`).join('');
 const localInput=iso=>{if(!iso)return '';const d=new Date(iso);if(isNaN(d))return '';const p=n=>String(n).padStart(2,'0');return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())+'T'+p(d.getHours())+':'+p(d.getMinutes())};

 async function load(force){
  if(store.loading)return store.loading;
  if(!force&&store.data&&Date.now()-store.at<5000)return true;
  store.loading=call('bookingScreen').then(r=>{store.data=r;store.at=Date.now();return true}).catch(e=>{if(tab==='bookings')msg('Booking: '+(e.message||String(e)),true);return false}).finally(()=>{store.loading=null});
  return store.loading;
 }
 window.bookingJobsRefresh=async function(manual){store.at=0;const ok=await load(true);if(ok&&tab==='bookings'&&(manual||!screenInteractionActive()))draw();badges();return ok;};
 window.bookingJobsView=function(){
  draw();load(false).then(ok=>{if(ok&&tab==='bookings'&&!screenInteractionActive()&&!busy)draw();});
  // The create form needs the staff list and projects, which come with the core snapshot.
  if(!coreReady&&typeof loadCore==='function')loadCore().then(()=>{if(tab==='bookings'&&store.creating&&!screenInteractionActive())draw();}).catch(()=>{});
 };

 function card(b){
  const can=b.can||{},status=`<span class="booking-pill ${pill[b.status]||''}">${esc(b.status_label)}${b.status==='production'&&b.stage_label?' · '+esc(b.stage_label):''}</span>`;
  const late=b.acceptance_at&&b.status!=='done'&&Date.parse(b.acceptance_at)<Date.now()?' <span class="booking-pill off">Quá hạn nghiệm thu</span>':'';
  const metricsDue=b.status==='metrics'&&b.metrics_due_at?`<p class="muted">Nhập số liệu từ ${day(b.metrics_due_at)} (2 ngày sau khi đăng).</p>`:'';
  const m=b.metrics;
  let actions='';
  if(can.review_script)actions+=`<div class="booking-note">Kịch bản: ${link(b.script_url,'Mở kịch bản')}</div><label>Ghi chú cho CC/VJ<textarea data-note="${esc(b.id)}" maxlength="1000" rows="2" placeholder="Bắt buộc khi yêu cầu sửa"></textarea></label><div class="booking-actions"><button data-act="approve" data-id="${esc(b.id)}">Duyệt kịch bản</button><button class="secondary" data-act="revise" data-id="${esc(b.id)}">Yêu cầu sửa</button></div>`;
  if(can.submit_metrics){
   if(store.openMetrics===b.id)actions+=`<form class="booking-metrics-form" data-id="${esc(b.id)}"><div class="booking-metrics"><label>View<input name="views" inputmode="numeric" required value="${m?esc(m.views):''}"></label><label>Thích<input name="likes" inputmode="numeric" value="${m?esc(m.likes):''}"></label><label>Bình luận<input name="comments" inputmode="numeric" value="${m?esc(m.comments):''}"></label><label>Chia sẻ<input name="shares" inputmode="numeric" value="${m?esc(m.shares):''}"></label></div><label>Ghi chú<input name="note" maxlength="500" value="${m?esc(m.note):''}" placeholder="Nền tảng, thời điểm đo…"></label><div class="booking-actions"><button>Lưu số liệu</button><button type="button" class="secondary" data-act="close-metrics">Hủy</button></div></form>`;
   else actions+=`<div class="booking-actions"><button data-act="open-metrics" data-id="${esc(b.id)}">${m?'Sửa số liệu':'Nhập số liệu view & tương tác'}</button></div>`;
  }
  if(can.accept)actions+=`<div class="booking-actions"><button data-act="accept" data-id="${esc(b.id)}">Nghiệm thu xong</button></div>`;
  return `<article class="card booking-card"><div class="booking-head"><div><h3>${esc(b.brand)}</h3><small class="muted">${esc(b.title)} · ${esc(b.project)}</small></div><div>${status}${late}</div></div>
  <div class="booking-meta">${b.order_code?`<span><b>Mã đơn hàng</b>${esc(b.order_code)}</span>`:''}<span><b>Ngày quay</b>${day(b.shoot_at)}</span><span><b>Trả video</b>${day(b.deliver_at)}</span><span><b>Nghiệm thu</b>${day(b.acceptance_at)}</span>${b.amount_vnd!==undefined?`<span><b>Giá trị</b>${money(b.amount_vnd)}</span>`:''}<span><b>Account</b>${esc(name(b.account_id))}</span><span><b>Content Creator</b>${esc(name(b.cc_id))}</span><span><b>VJ</b>${esc(name(b.vj_id))}</span><span><b>Talent</b>${esc(name(b.talent_id))}</span>${b.editor_ids?.length?`<span><b>Editor</b>${b.editor_ids.map(id=>esc(name(id))).join(', ')}</span>`:''}</div>
  <details><summary class="muted">Brief & tư liệu</summary><p style="white-space:pre-wrap">${esc(b.brief)}</p><p>Kịch bản: ${link(b.script_url,'Mở')} · Final: ${link(b.final_url,'Mở')}${b.tiktok_url?' · '+link(b.tiktok_url,'TikTok'):''}${b.facebook_url?' · '+link(b.facebook_url,'Facebook'):''}</p></details>
  ${b.script_status==='revision'&&b.script_note?`<div class="booking-note">↩️ Account yêu cầu sửa kịch bản: ${esc(b.script_note)}</div>`:''}
  ${b.status==='script'?'<p class="muted">CC/VJ lưu link kịch bản trong thẻ video ở Sản xuất để gửi Account duyệt. Chưa được đi quay khi kịch bản chưa duyệt.</p>':''}
  ${m?`<div class="booking-note">📊 View <b>${Number(m.views).toLocaleString('vi-VN')}</b> · Thích ${Number(m.likes).toLocaleString('vi-VN')} · Bình luận ${Number(m.comments).toLocaleString('vi-VN')} · Chia sẻ ${Number(m.shares).toLocaleString('vi-VN')}<br><small class="muted">${esc(name(m.by))} nhập lúc ${day(m.at)}${m.note?' · '+esc(m.note):''}</small></div>`:''}
  ${metricsDue}${actions}
  <div class="booking-actions"><button class="text-button" data-act="open-production" data-id="${esc(b.id)}">Mở video trong Sản xuất ↗</button></div></article>`;
 }

 function createForm(){
  const d=store.draft||{},projects=state?.projects||[];
  return `<section class="card booking-form"><h2>Tạo Booking</h2><form id="bookingCreate"><div class="grid2">
  <label>Dự án<select name="project" required><option value="">— Chọn dự án —</option>${projects.map(p=>`<option ${d.project===p?'selected':''}>${esc(p)}</option>`).join('')}</select></label>
  <label>Thương hiệu<input name="brand" maxlength="120" required value="${esc(d.brand||'')}"></label>
  <label>Tiêu đề video (không bắt buộc)<input name="title" maxlength="160" value="${esc(d.title||'')}" placeholder="Mặc định: Booking · Thương hiệu"></label>
  <label>Giá trị booking (VNĐ)<input name="amount_vnd" type="text" data-money data-money-min="1" data-money-max="1000000000000" inputmode="numeric" required value="${esc(d.amount_vnd||'')}"></label>
  <label>Ngày quay<input name="shoot_at" type="datetime-local" required value="${esc(d.shoot_at||'')}"></label>
  <label>Ngày trả video<input name="deliver_at" type="datetime-local" required value="${esc(d.deliver_at||'')}"></label>
  <label>Ngày nghiệm thu<input name="acceptance_at" type="datetime-local" required value="${esc(d.acceptance_at||'')}"></label>
  <label>Content Creator<select name="cc_id" required>${options(d.cc_id)}</select></label>
  <label>VJ<select name="vj_id" required>${options(d.vj_id)}</select></label>
  <label>Talent<select name="talent_id" required>${options(d.talent_id)}</select></label>
  <label>Editor (không bắt buộc)<select name="editor_id">${options(d.editor_id,p=>(p.production_roles||[]).includes('editor'))}</select></label>
  </div><label>Brief<textarea name="brief" maxlength="2000" rows="4" required>${esc(d.brief||'')}</textarea></label>
  <div class="booking-actions"><button>Tạo booking</button><button type="button" class="secondary" data-act="cancel-create">Hủy</button></div></form></section>`;
 }

 function draw(){
  if(tab!=='bookings')return;
  const data=store.data,list=data?.bookings||[];
  let html=`<section class="card"><div class="booking-head"><div><h2 style="margin:0">Booking</h2><small class="muted">${data?.seesAll?'Toàn bộ booking của công ty':'Booking bạn tham gia'}</small></div><div class="booking-actions" style="margin:0">${state?.user?.role==='director'?'<button class="secondary" data-act="report">Doanh thu booking (Sheets)</button>':''}${data?.canCreate&&!store.creating?'<button data-act="new">＋ Tạo Booking</button>':''}</div></div></section>`;
  if(store.creating)html+=createForm();
  if(!data)html+='<section class="card empty">Đang tải booking…</section>';
  else if(!list.length)html+='<section class="card empty">Chưa có booking nào.</section>';
  else{
   const mine=list.filter(b=>b.can&&(b.can.review_script||b.can.submit_metrics&&!b.metrics||b.can.accept));
   if(mine.length)html+='<h3 class="booking-group">Cần bạn xử lý ('+mine.length+')</h3>'+mine.map(card).join('');
   const shown=new Set(mine.map(b=>b.id));
   for(const s of order){const group=list.filter(b=>b.status===s&&!shown.has(b.id));if(group.length)html+=`<h3 class="booking-group">${esc(group[0].status_label)} (${group.length})</h3>`+group.map(card).join('');}
  }
  $('screen').innerHTML=html;bind();if(typeof bindMoneyInputs==='function')bindMoneyInputs($('screen'));
 }

 async function act(method,args,done){
  if(busy)return;busy=true;msg('Đang lưu…');
  try{const r=await call(method,...args);if(r?.bookings){store.data=r;store.at=Date.now();}formDirty=false;msg(done+(r?.warning?' '+r.warning:''));return r;}
  catch(e){msg(e.message||String(e),true);return null}
  finally{busy=false;if(tab==='bookings')draw();badges();}
 }
 function bind(){
  const screen=$('screen');
  screen.querySelectorAll('[data-act]').forEach(el=>el.onclick=async e=>{
   const id=el.dataset.id,a=el.dataset.act,b=(store.data?.bookings||[]).find(x=>x.id===id);
   if(a==='report'){go('booking');return}
   if(a==='new'){store.creating=true;store.draft=null;draw();return}
   if(a==='cancel-create'){e.preventDefault();store.creating=false;store.draft=null;formDirty=false;draw();return}
   if(a==='open-metrics'){store.openMetrics=id;draw();return}
   if(a==='close-metrics'){store.openMetrics=null;formDirty=false;draw();return}
   if(a==='open-production'&&b){window._productionSearch=b.title;window._productionSearchDraft=b.title;go('production');return}
   if(a==='approve'||a==='revise'){const note=screen.querySelector(`[data-note="${CSS.escape(id)}"]`)?.value||'';if(a==='revise'&&!note.trim()){msg('Ghi rõ nội dung cần sửa cho CC/VJ.',true);return}await act('reviewBookingScript',[id,a,note,b?.script_url],a==='approve'?'Đã duyệt kịch bản. CC/VJ được đi quay.':'Đã gửi yêu cầu sửa kịch bản.');return}
   if(a==='accept'){if(!confirm('Xác nhận nghiệm thu booking '+(b?.brand||'')+'?'))return;await act('acceptBooking',[id],'Đã nghiệm thu booking.');}
  });
  const form=$('bookingCreate');
  if(form){form.oninput=()=>{store.draft=Object.fromEntries(new FormData(form));};form.onsubmit=async e=>{e.preventDefault();const v=Object.fromEntries(new FormData(form)),iso=x=>x?new Date(x).toISOString():'';
   store.draft=v;const request=store.request||(store.request='bk_'+(crypto.randomUUID?crypto.randomUUID():String(Date.now())+Math.random()).replace(/[^A-Za-z0-9]/g,''));
   const r=await act('createBooking',[{...v,amount_vnd:moneyDigits(v.amount_vnd),shoot_at:iso(v.shoot_at),deliver_at:iso(v.deliver_at),acceptance_at:iso(v.acceptance_at),request_id:request}],'Đã tạo booking. CC, VJ và Talent đã được thông báo.');
   if(r?.booking_id){const code=(r.bookings||[]).find(x=>x.id===r.booking_id)?.order_code;if(code)msg('Đã tạo booking '+code+'. CC, VJ và Talent đã được thông báo; đơn hàng đang được ghi vào Sheet CRM.');}
   if(r){store.creating=false;store.draft=null;store.request=null;draw();}
  };}
  screen.querySelectorAll('.booking-metrics-form').forEach(f=>f.onsubmit=async e=>{e.preventDefault();const v=Object.fromEntries(new FormData(f));const r=await act('submitBookingMetrics',[f.dataset.id,v],'Đã lưu số liệu. Account đã được thông báo.');if(r){store.openMetrics=null;draw();}});
 }

 // "BOOKING · brand" badge on production cards.
 function badges(){
  if(tab!=='production'||!store.data)return;
  const items=approvalFocus?[approvalFocus.item]:state?.productionPage?.items||state?.productionItems||[],by=new Map((store.data.bookings||[]).map(b=>[b.production_id,b]));
  document.querySelectorAll('#screen .production-item').forEach((el,i)=>{const x=items[i],b=x&&by.get(String(x.id));if(!b||el.querySelector('.booking-badge'))return;const target=el.querySelector('.compact-task-heading')||el.querySelector('h2,h3');if(!target)return;const s=document.createElement('span');s.className='badge booking-badge';s.textContent='BOOKING · '+b.brand+(['script','script_review'].includes(b.status)?' · '+b.status_label:'');target.append(s);});
 }
 const baseRender=render;
 render=function(){baseRender();if(tab==='production'){if(store.data)badges();else load(false).then(ok=>{if(ok)badges();});}};
 window.addEventListener('viral:session-reset',()=>{store.data=null;store.at=0;store.creating=false;store.draft=null;store.openMetrics=null;});
})();
