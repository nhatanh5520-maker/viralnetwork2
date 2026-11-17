/* Số liệu kênh (Tiện ích). Data: channelMetricsScreen / channelMetricsReport. Permissions are enforced on
 * the server; this file only hides buttons a person cannot use. */
(function(){
 paths.channelMetrics='<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>';
 const style=document.createElement('style');
 style.textContent='.cm-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}.cm-tabs{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}.cm-tabs button.on{outline:2px solid var(--accent,#b8f36b)}.cm-pill{display:inline-block;border-radius:30px;padding:3px 10px;font-size:12px;font-weight:700;background:#263c2f;color:#cef3da}.cm-pill.open{background:#4a3a17;color:#ffd98a}.cm-pill.overdue{background:#4a2420;color:#ffc4be}.cm-pill.upcoming{background:#2a3038;color:#c7d0dc}.cm-pill.est{background:#4a3a17;color:#ffd98a}.cm-values{display:grid;grid-template-columns:repeat(auto-fit,minmax(92px,1fr));gap:6px 12px;margin:10px 0;font-size:13px}.cm-values b{display:block;font-size:11px;color:var(--muted);font-weight:600}.cm-form .cm-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:0 12px}.cm-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.cm-table-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch}.cm-table{width:100%;border-collapse:collapse;font-size:13px;min-width:720px}.cm-table th,.cm-table td{padding:7px 8px;border-bottom:1px solid rgba(255,255,255,.08);text-align:right;white-space:nowrap}.cm-table th:first-child,.cm-table td:first-child,.cm-table th:nth-child(2),.cm-table td:nth-child(2){text-align:left}.cm-table td small{display:block}.cm-up{color:#8be0a4}.cm-down{color:#ffaaa1}.cm-filters{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:0 12px}.cm-narrow{display:none}@media(max-width:640px){.cm-wide{display:none}.cm-narrow{display:block}}.cm-table td:first-child a,.cm-narrow a{word-break:break-all;white-space:normal}.cm-table td:first-child{white-space:normal;min-width:180px;max-width:280px}.cm-shot{max-width:100%;max-height:420px;border-radius:10px;margin-top:8px}.cm-history{font-size:13px}.cm-history td,.cm-history th{padding:4px 6px;text-align:right}.cm-history td:first-child,.cm-history th:first-child{text-align:left}';
 document.head.append(style);

 const S={data:null,report:null,loading:null,view:'',filters:{mode:'week',period:'',project:'',platform:'',vj:''},edit:null,manage:null,shots:{}};
 const STATUS={done:['Đã nhập',''],open:['Chưa nhập','open'],overdue:['Quá hạn','overdue'],upcoming:['Chưa đến hạn','upcoming']};
 const fmt=n=>n===null||n===undefined||n===''?'—':Number(n).toLocaleString('vi-VN');
 const change=v=>v===null||v===undefined?'':`<small class="${v>0?'cm-up':v<0?'cm-down':'muted'}">${v>0?'▲':v<0?'▼':''} ${Math.abs(v).toLocaleString('vi-VN')}%</small>`;
 const fields=()=>S.data?.fields||[{key:'views',label:'View',required:true},{key:'likes',label:'Tim',required:true},{key:'comments',label:'Bình luận',required:true},{key:'shares',label:'Chia sẻ'},{key:'followers',label:'Follower tăng'}];
 const link=c=>/^https?:\/\//i.test(c.name)?`<a href="${esc(c.name)}" target="_blank" rel="noopener">${esc(c.name)}</a>`:esc(c.name);
 const when=iso=>iso?new Date(iso).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',hour:'2-digit',minute:'2-digit',day:'2-digit',month:'2-digit'}):'';

 async function load(force){
  if(S.loading)return S.loading;
  if(!force&&S.data)return true;
  S.loading=call('channelMetricsScreen').then(r=>{S.data=r;if(!S.view)S.view=r.myChannels.length||!r.isManager?'mine':'report';return true;})
   .catch(e=>{if(tab==='channelMetrics')msg('Số liệu kênh: '+(e.message||String(e)),true);return false;}).finally(()=>{S.loading=null;});
  return S.loading;
 }
 async function loadReport(){
  if(!S.data?.isManager)return;
  try{S.report=await call('channelMetricsReport',{...S.filters});if(!S.filters.period)S.filters.period=S.report.period;}
  catch(e){msg(e.message||String(e),true);}
 }
 window.channelMetricsRefresh=async function(manual){
  if(!manual&&(screenInteractionActive()||S.edit||S.manage))return null;
  const ok=await load(true);if(ok&&S.view==='report')await loadReport();if(tab==='channelMetrics')draw();return ok;
 };
 window.channelMetricsView=function(){
  draw();load(false).then(async ok=>{if(!ok||tab!=='channelMetrics')return;if(S.view==='report'&&!S.report)await loadReport();if(tab==='channelMetrics'&&!busy)draw();});
 };

 // --- Forms -----------------------------------------------------------------------------------
 function numberInput(f,value){return `<label>${esc(f.label)}${f.required?' *':''}<input name="${f.key}" data-count inputmode="numeric" autocomplete="off" ${f.required?'required':''} value="${value===null||value===undefined?'':esc(Number(value).toLocaleString('vi-VN'))}"></label>`;}
 function entryForm(channel,type,period,label,record){
  const v=record?.values||{};
  return `<form class="cm-form" data-channel="${esc(channel.id)}" data-type="${type}" data-period="${esc(period)}" data-revision="${record?esc(record.revision):''}">
   <p class="muted" style="margin:6px 0">${esc(label)}${record?' · đã nhập, gửi lại để cập nhật':''}</p>
   <div class="cm-grid">${fields().map(f=>numberInput(f,v[f.key])).join('')}</div>
   <label>Ghi chú<input name="note" maxlength="500" value="${esc(record?.note||'')}" placeholder="Không bắt buộc"></label>
   <label>Ảnh chụp màn hình (JPG/PNG/WebP, tối đa 2 MB)<input name="image" type="file" accept="image/jpeg,image/png,image/webp"></label>
   ${record?.has_screenshot?'<label class="team-picker"><input name="remove_image" type="checkbox"> Xóa ảnh đã gửi</label>':''}
   <div class="cm-actions"><button>${record?'Cập nhật số liệu':'Gửi số liệu'}</button><button type="button" class="secondary" data-act="cancel">Hủy</button></div></form>`;
 }
 function readImage(file){
  return new Promise((resolve,reject)=>{
   if(!file)return resolve(null);
   if(!['image/jpeg','image/png','image/webp'].includes(file.type))return reject(Error('Ảnh cần là JPG, PNG hoặc WebP.'));
   if(file.size>2*1024*1024)return reject(Error('Ảnh tối đa 2 MB. Hãy cắt bớt hoặc chụp lại.'));
   const r=new FileReader();r.onload=()=>resolve({type:file.type,base64:String(r.result).split(',')[1]});r.onerror=()=>reject(Error('Không đọc được ảnh.'));r.readAsDataURL(file);
  });
 }

 // --- Views -------------------------------------------------------------------------------------
 function valuesBlock(values){return `<div class="cm-values">${fields().map(f=>`<span><b>${esc(f.label)}</b>${fmt(values?.[f.key])}</span>`).join('')}</div>`;}
 function channelCard(c){
  const w=c.week,st=STATUS[w.status]||STATUS.open,editing=S.edit&&S.edit.channel===c.id;
  const canWeek=w.status==='open'||w.status==='done'&&S.data.week.open;
  let html=`<article class="card"><div class="cm-head"><div><h3 style="margin:0">${esc(c.platform)} · ${link(c)}</h3><small class="muted">${esc(c.project)}</small></div><span class="cm-pill ${st[1]}">${esc(S.data.week.label)}: ${st[0]}</span></div>`;
  if(w.record)html+=valuesBlock(w.record.values)+(w.record.note?`<p class="muted">${esc(w.record.note)}</p>`:'')+(w.record.has_screenshot?`<button type="button" class="text-button" data-shot="${esc(w.record.id)}">Xem ảnh chụp màn hình</button>${S.shots[w.record.id]?`<img class="cm-shot" alt="Ảnh chụp số liệu" src="${S.shots[w.record.id]}">`:''}`:'');
  if(w.status==='overdue')html+='<p class="muted">Đã quá hạn nhập (23:59 thứ Hai). Nhờ Leader nhập hoặc sửa giúp.</p>';
  if(w.status==='upcoming')html+='<p class="muted">Mở nhập từ 18:00 Chủ nhật.</p>';
  if(editing&&S.edit.type==='week')html+=entryForm(c,'week',w.period,S.data.week.label,w.record);
  else if(canWeek)html+=`<div class="cm-actions"><button data-act="edit" data-channel="${esc(c.id)}" data-type="week">${w.record?'Sửa số liệu tuần':'Nhập số liệu tuần'}</button></div>`;
  if(c.month){
   const m=c.month,est=m.estimate;
   html+=`<div class="booking-note" style="margin-top:10px;padding:8px 10px;border-radius:10px;background:#1b2520"><b>${esc(S.data.month.label)}</b> · ${m.record?'Đã nhập số chính thức':'Chưa nhập số chính thức'}${!m.record&&est?.source==='estimate'?` · <span class="cm-pill est">ước tính</span> ${fmt(est.values.views)} view (${est.weeks_used}/${est.weeks_total} tuần)`:''}</div>`;
   if(m.record)html+=valuesBlock(m.record.values);
   if(editing&&S.edit.type==='month')html+=entryForm(c,'month',m.period,S.data.month.label+' (số chính thức cả tháng)',m.record);
   else html+=`<div class="cm-actions"><button class="secondary" data-act="edit" data-channel="${esc(c.id)}" data-type="month">${m.record?'Sửa số tháng':'Nhập số tháng'}</button></div>`;
  }
  html+=`<details><summary class="muted">Lịch sử 8 tuần</summary><div class="cm-table-wrap"><table class="cm-history"><tr><th>Tuần</th>${fields().map(f=>`<th>${esc(f.label)}</th>`).join('')}</tr>${c.history.map(h=>`<tr><td>${esc(h.label)}</td>${fields().map(f=>`<td>${h.record?fmt(h.record.values[f.key]):'—'}</td>`).join('')}</tr>`).join('')}</table></div></details></article>`;
  return html;
 }
 function mineView(){
  const list=S.data.myChannels;
  if(!list.length)return `<section class="card empty">${S.data.isManager?'Bạn chưa phụ trách kênh nào. Xem Tổng hợp hoặc Quản lý kênh.':'Bạn chưa được giao kênh nào. Leader sẽ gán kênh cho VJ phụ trách.'}</section>`;
  return list.map(channelCard).join('');
 }
 function reportView(){
  const r=S.report,f=S.filters;
  if(!r)return '<section class="card empty">Đang tải tổng hợp…</section>';
  const opt=(list,value,all)=>`<option value="">${all}</option>`+list.map(o=>`<option value="${esc(o.value)}" ${String(value)===String(o.value)?'selected':''}>${esc(o.label)}</option>`).join('');
  let html=`<section class="card"><div class="cm-filters">
   <label>Kỳ<select data-filter="mode"><option value="week" ${f.mode==='week'?'selected':''}>Theo tuần</option><option value="month" ${f.mode==='month'?'selected':''}>Theo tháng</option></select></label>
   <label>${f.mode==='week'?'Tuần':'Tháng'}<select data-filter="period">${r.periods.map(p=>`<option value="${esc(p.period)}" ${p.period===r.period?'selected':''}>${esc(p.label)}</option>`).join('')}</select></label>
   <label>Dự án<select data-filter="project">${opt(r.filters.projects.map(p=>({value:p.code,label:p.label})),f.project,'Tất cả dự án')}</select></label>
   <label>Nền tảng<select data-filter="platform">${opt(r.filters.platforms.map(p=>({value:p,label:p})),f.platform,'Tất cả nền tảng')}</select></label>
   <label>VJ<select data-filter="vj">${opt(r.filters.vjs.map(p=>({value:p.id,label:p.name})),f.vj,'Tất cả VJ')}</select></label></div>
   <div class="cm-actions"><button class="secondary" data-act="export">Xuất Excel</button></div>
   <p class="muted">${esc(r.label)} so với ${esc(r.previousLabel)}.${r.mode==='month'?' Kênh chưa có số chính thức hiển thị số <b>ước tính</b> (số tuần chia theo số ngày nằm trong tháng).':''}</p>
   <div class="cm-values">${r.fields.map(x=>`<span><b>Tổng ${esc(x.label)}</b>${fmt(r.totals.current[x.key])} ${change(r.totals.change[x.key])}</span>`).join('')}</div></section>`;
  // Wide screens: a table. Phones: one card per channel (a wide table would push the numbers off-screen).
  const name=c=>`${esc(c.platform)} · ${link(c)}<small class="muted">${esc(c.project)}${c.active?'':' · đã ngưng'}</small>`;
  const source=row=>row.source==='estimate'?'<span class="cm-pill est">ước tính</span>':row.source==='none'?'<span class="cm-pill open">chưa nhập</span>':'';
  const buttons=row=>`<button class="text-button" data-act="edit" data-channel="${esc(row.channel.id)}" data-type="${r.mode}" data-report="1">${row.source==='official'?'Sửa':'Nhập'}</button>${row.record?.has_screenshot?` <button class="text-button" data-shot="${esc(row.record.id)}">Ảnh</button>`:''}`;
  html+=`<section class="card"><h3>Theo kênh (${r.rows.length})</h3><div class="cm-table-wrap cm-wide"><table class="cm-table"><tr><th>Kênh</th><th>VJ</th>${r.fields.map(x=>`<th>${esc(x.label)}</th>`).join('')}<th></th></tr>${r.rows.map(row=>`<tr><td>${name(row.channel)}${source(row)}</td><td>${esc(row.channel.vj_name||'—')}</td>${r.fields.map(x=>`<td>${fmt(row.values?.[x.key])}${change(row.change[x.key])}</td>`).join('')}<td>${buttons(row)}</td></tr>`).join('')}</table></div>
   <div class="cm-narrow">${r.rows.map(row=>`<div class="item"><div class="cm-head"><div>${name(row.channel)}<small class="muted">VJ: ${esc(row.channel.vj_name||'—')}</small></div><div>${source(row)}</div></div><div class="cm-values">${r.fields.map(x=>`<span><b>${esc(x.label)}</b>${fmt(row.values?.[x.key])} ${change(row.change[x.key])}</span>`).join('')}</div><div class="cm-actions" style="margin-top:0">${buttons(row)}</div></div>`).join('')}</div></section>`;
  const editing=S.edit?.report&&r.rows.find(row=>row.channel.id===S.edit.channel);
  if(editing)html+=`<section class="card"><h3>${esc(editing.channel.platform)} · ${link(editing.channel)}</h3>${entryForm(editing.channel,r.mode,r.period,r.label+' · Leader nhập/sửa (có ghi lịch sử)',editing.source==='official'?editing.record:null)}</section>`;
  for(const row of r.rows)if(row.record&&S.shots[row.record.id])html+=`<section class="card"><h3>Ảnh chụp · ${esc(row.channel.platform)} · ${esc(row.channel.name)}</h3><img class="cm-shot" alt="Ảnh chụp số liệu" src="${S.shots[row.record.id]}"></section>`;
  html+=`<section class="card"><h3>${r.mode==='month'?'Kênh chưa nhập số tháng chính thức':'Kênh chưa nhập'} (${r.missing.length})</h3>${r.missing.length?r.missing.map(c=>`<div class="item"><b>${esc(c.platform)} · ${link(c)}</b><small>${esc(c.project)} · VJ: ${esc(c.vj_name||'—')}</small></div>`).join(''):`<p class="muted">${new Date(r.window.opens)>new Date()?'Kỳ này chưa mở nhập.':'Đã đủ số liệu.'}</p>`}</section>`;
  return html;
 }
 function channelForm(c){
  const d=c||{},people=S.data.people||[],projects=S.data.projectOptions||[];
  return `<form class="cm-channel-form card" data-id="${esc(d.id||'')}" data-revision="${esc(d.revision||'')}"><h3>${c?'Sửa kênh':'Thêm kênh'}</h3><div class="cm-filters">
   <label>Dự án<select name="project_code" required><option value="">— Chọn —</option>${projects.map(p=>`<option value="${esc(p.code)}" ${p.code===d.project_code?'selected':''}>${esc(p.label)}</option>`).join('')}</select></label>
   <label>Nền tảng<select name="platform" required><option value="">— Chọn —</option>${S.data.platforms.map(p=>`<option ${p===d.platform?'selected':''}>${esc(p)}</option>`).join('')}</select></label>
   <label>Tên hoặc link kênh<input name="name" maxlength="200" required value="${esc(d.name||'')}"></label>
   <label>VJ phụ trách<select name="vj_id" required><option value="">— Chọn —</option>${people.map(p=>`<option value="${esc(p.id)}" ${p.id===d.vj_id?'selected':''}>${esc(p.name)}${p.job_title?' · '+esc(p.job_title):''}</option>`).join('')}</select></label></div>
   <div class="cm-actions"><button>Lưu kênh</button>${c?`<button type="button" class="secondary" data-act="toggle" data-id="${esc(c.id)}">${c.active?'Ngưng kênh':'Dùng lại kênh'}</button>`:''}<button type="button" class="secondary" data-act="cancel">Hủy</button></div></form>`;
 }
 function manageView(){
  const list=S.data.channels||[];
  let html=`<section class="card"><div class="cm-head"><h3 style="margin:0">Kênh của các dự án (${list.length})</h3>${S.manage==='new'?'':'<button data-act="new-channel">＋ Thêm kênh</button>'}</div><p class="muted">Leader và Ban giám đốc thêm, sửa, ngưng kênh và đổi VJ phụ trách. Mọi thay đổi được ghi lịch sử.</p></section>`;
  if(S.manage==='new')html+=channelForm(null);
  html+=list.map(c=>S.manage===c.id?channelForm(c):`<article class="card"><div class="cm-head"><div><b>${esc(c.platform)} · ${link(c)}</b><small class="muted" style="display:block">${esc(c.project)} · VJ: ${esc(c.vj_name||'—')}</small></div><div>${c.active?'':'<span class="cm-pill overdue">Đã ngưng</span> '}<button class="secondary" data-act="edit-channel" data-id="${esc(c.id)}">Sửa</button></div></div></article>`).join('');
  return html;
 }
 function draw(){
  if(tab!=='channelMetrics')return;
  const d=S.data;
  if(!d){$('screen').innerHTML='<section class="card empty">Đang tải số liệu kênh…</section>';return;}
  const tabs=d.isManager?[['mine','Kênh của tôi'],['report','Tổng hợp'],['channels','Quản lý kênh']]:[];
  let html=`<section class="card"><div class="cm-head"><div><h2 style="margin:0">Số liệu kênh</h2><small class="muted">${esc(d.week.label)} · nhập từ 18:00 Chủ nhật đến 23:59 thứ Hai${d.month?' · '+esc(d.month.label)+': nhập số chính thức đến hết ngày 02':''}</small></div></div>${tabs.length?`<div class="cm-tabs">${tabs.map(([id,label])=>`<button class="${S.view===id?'on':'secondary'}" data-view="${id}">${label}</button>`).join('')}</div>`:''}</section>`;
  html+=S.view==='report'?reportView():S.view==='channels'?manageView():mineView();
  $('screen').innerHTML=html;bind();
 }

 // --- Events ------------------------------------------------------------------------------------
 async function save(method,args,done){
  if(busy)return null;busy=true;msg('Đang lưu…');
  try{const r=await call(method,...args);if(r?.myChannels)S.data=r;formDirty=false;S.edit=null;S.manage=null;if(S.view==='report')await loadReport();msg(done);return r;}
  catch(e){msg(e.message||String(e),true);return null;}
  finally{busy=false;if(tab==='channelMetrics')draw();}
 }
 function bind(){
  const screen=$('screen');
  screen.querySelectorAll('[data-view]').forEach(b=>b.onclick=async()=>{S.view=b.dataset.view;S.edit=null;S.manage=null;draw();if(S.view==='report'&&!S.report){await loadReport();draw();}});
  screen.querySelectorAll('[data-filter]').forEach(el=>el.onchange=async()=>{const k=el.dataset.filter;S.filters[k]=el.value;if(k==='mode')S.filters.period='';S.edit=null;msg('Đang tải…');await loadReport();msg('');draw();});
  screen.querySelectorAll('[data-shot]').forEach(b=>b.onclick=async()=>{const id=b.dataset.shot;if(S.shots[id]){delete S.shots[id];draw();return;}try{msg('Đang tải ảnh…');S.shots[id]=await call('channelMetricScreenshot',id);msg('');draw();}catch(e){msg(e.message||String(e),true);}});
  screen.querySelectorAll('[data-act]').forEach(el=>el.onclick=async e=>{
   const a=el.dataset.act;
   if(a==='edit'){S.edit={channel:el.dataset.channel,type:el.dataset.type,report:!!el.dataset.report};formDirty=true;draw();return;}
   if(a==='cancel'){e.preventDefault();S.edit=null;S.manage=null;formDirty=false;draw();return;}
   if(a==='new-channel'){S.manage='new';formDirty=true;draw();return;}
   if(a==='edit-channel'){S.manage=el.dataset.id;formDirty=true;draw();return;}
   if(a==='toggle'){const c=(S.data.channels||[]).find(x=>x.id===el.dataset.id);if(!c||!confirm((c.active?'Ngưng':'Dùng lại')+' kênh '+c.name+'?'))return;await save('saveProjectChannel',[{id:c.id,active:!c.active,revision:c.revision}],c.active?'Đã ngưng kênh. Số liệu cũ vẫn được giữ.':'Đã dùng lại kênh.');return;}
   if(a==='export'){if(busy)return;busy=true;msg('Đang tạo file Excel…');try{const f=await call('exportChannelMetrics',{...S.filters,period:S.report?.period});const bytes=Uint8Array.from(atob(f.base64),c=>c.charCodeAt(0)),url=URL.createObjectURL(new Blob([bytes],{type:f.type})),link=document.createElement('a');link.href=url;link.download=f.filename;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);msg('Đã tạo '+f.filename);}catch(err){msg(err.message||String(err),true);}finally{busy=false;}}
  });
  screen.querySelectorAll('input[data-count]').forEach(input=>input.oninput=()=>{
   const raw=input.value.replace(/[.\s]/g,'');
   if(/^\d*$/.test(raw)){input.setCustomValidity('');if(raw){const pos=input.value.length-input.selectionStart;input.value=Number(raw).toLocaleString('vi-VN');try{input.setSelectionRange(input.value.length-pos,input.value.length-pos);}catch{}}}
   else input.setCustomValidity('Nhập số nguyên không âm (dấu chấm phân cách hàng nghìn).');
  });
  screen.querySelectorAll('form.cm-form').forEach(form=>form.onsubmit=async e=>{
   e.preventDefault();if(!form.reportValidity())return;
   const v=Object.fromEntries(new FormData(form));let image=null;
   try{image=await readImage(form.elements.image?.files?.[0]);}catch(err){msg(err.message,true);return;}
   const input={channel_id:form.dataset.channel,period_type:form.dataset.type,period:form.dataset.period,note:v.note||''};
   for(const f of fields())input[f.key]=v[f.key]||'';
   if(form.dataset.revision)input.revision=Number(form.dataset.revision);
   if(image)input.image=image;else if(form.elements.remove_image?.checked)input.remove_image=true;
   await save('submitChannelMetrics',[input],form.dataset.type==='month'?'Đã lưu số liệu tháng.':'Đã lưu số liệu tuần.');
  });
  const cf=screen.querySelector('form.cm-channel-form');
  if(cf)cf.onsubmit=async e=>{e.preventDefault();if(!cf.reportValidity())return;const v=Object.fromEntries(new FormData(cf));const input={project_code:v.project_code,platform:v.platform,name:v.name,vj_id:v.vj_id};if(cf.dataset.id){input.id=cf.dataset.id;input.revision=cf.dataset.revision;}await save('saveProjectChannel',[input],cf.dataset.id?'Đã cập nhật kênh.':'Đã thêm kênh. VJ phụ trách đã được thông báo.');};
 }
 window.addEventListener('viral:session-reset',()=>{S.data=null;S.report=null;S.view='';S.edit=null;S.manage=null;S.shots={};S.filters={mode:'week',period:'',project:'',platform:'',vj:''};});
})();
