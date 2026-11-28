/* Lịch quay và lịch dựng (Tiện ích) + thẻ trang chủ.
 * Read only: data comes from the "Order lịch quay & Dựng" Google Sheet through editSchedule / editScheduleToday.
 * Two parts: LỊCH QUAY (tabs "THÁNG n | LỊCH QUAY") and LỊCH DỰNG (tabs "THÁNG n | TASK DỰNG").
 * Nothing here adds or edits entries; people keep editing the Sheet. */
(function(){
 const TITLE='Lịch quay và lịch dựng';
 paths.editSchedule='<path d="M6 3v18M3 6h18M14 14l7 7M14 21l7-7"/>';
 const style=document.createElement('style');
 style.textContent='.es-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}.es-head h2{margin:0}.es-kinds{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:12px}.es-kinds button{padding:11px 8px;background:#171e1a;color:var(--text);border:1px solid var(--line);font-weight:700}.es-kinds button.on{background:var(--green);color:#06120b;border-color:var(--green)}.es-nav{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:10px}.es-nav select{flex:1;min-width:160px;margin:0}.es-nav button{min-width:44px;padding:9px 12px}.es-tools{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:10px}.es-tools select{flex:1;min-width:150px;margin:0}.es-tools button.on{background:var(--green);color:#06120b}.es-meta{font-size:12px;color:var(--muted);margin-top:8px}.es-meta a{color:var(--green)}'
 +'.es-wrap{overflow:auto;-webkit-overflow-scrolling:touch;max-height:calc(100vh - 260px);border:1px solid var(--line);border-radius:14px}.es-table{border-collapse:separate;border-spacing:0;font-size:13px;min-width:100%}.es-table th,.es-table td{border-bottom:1px solid var(--line);border-right:1px solid var(--line);padding:8px;vertical-align:top;text-align:left;background:var(--panel)}.es-table thead th{position:sticky;top:0;z-index:2;background:var(--panel2);white-space:nowrap}.es-table thead th small{display:block;color:var(--muted);font-weight:500}.es-table th.es-ch{position:sticky;left:0;z-index:1;background:var(--panel2);min-width:160px;max-width:200px;white-space:normal}.es-table thead th.es-ch{z-index:3}.es-ch small{display:block;color:var(--muted);font-weight:500;margin-top:3px;line-height:1.35}.es-table td{min-width:170px;max-width:240px}.es-table .today{background:#16261d}.es-table thead th.today{background:#1d3a28;color:var(--green)}'
 +'.es-task{border-left:4px solid #3a4a40;background:#1b241f;border-radius:8px;padding:6px 8px;margin:0 0 6px}.es-task:last-child{margin-bottom:0}.es-task b{display:block;font-weight:650;line-height:1.35;word-break:break-word}.es-task b.none{color:var(--muted);font-style:italic;font-weight:500}.es-task small{display:block;color:var(--muted);margin-top:2px}.es-task small.me{color:var(--green);font-weight:650}.es-task .es-time{display:block;font-size:12px;font-weight:700;color:var(--amber)}.es-task a{color:var(--green);font-size:12px}.es-empty{color:#55655a}.es-session{font-size:11px;font-weight:750;letter-spacing:.04em;text-transform:uppercase;color:var(--muted);margin:2px 0 4px}'
 +'.es-days{display:flex;gap:6px;overflow-x:auto;padding-bottom:4px;margin-top:10px;scrollbar-width:none}.es-days button{flex:0 0 auto;min-width:62px;padding:8px 6px;text-align:center;background:#171e1a;color:var(--text);border:1px solid var(--line);line-height:1.25}.es-days button small{display:block;font-size:11px;color:var(--muted)}.es-days button.on{background:var(--green);color:#06120b;border-color:var(--green)}.es-days button.on small{color:#06120b}.es-days button.today:not(.on){border-color:var(--green)}.es-days i{display:inline-block;font-style:normal;font-size:10px;font-weight:750;background:#123923;color:#55efa0;border-radius:20px;padding:1px 6px;margin-top:3px}.es-days button.on i{background:#06120b;color:var(--green)}'
 +'.es-channel h3{font-size:14px;margin:0 0 2px}.es-channel>small{display:block;color:var(--muted);margin-bottom:8px}.es-quiet{font-size:12px;color:var(--muted)}.es-narrow{display:none}@media(max-width:760px){.es-wide{display:none}.es-narrow{display:block}}'
 +'.es-home .row{display:flex;justify-content:space-between;align-items:center;gap:8px}.es-home .es-task{margin-top:8px}.es-home .es-sum{font-size:13px;color:var(--muted);margin-top:10px}.es-home h3{font-size:13px;margin:12px 0 0;color:var(--muted);font-weight:700}';
 document.head.append(style);

 const KIND={shoot:{label:'Lịch quay',icon:'🎥',unit:'suất quay',empty:'Chưa có lịch quay'},edit:{label:'Lịch dựng',icon:'✂',unit:'task dựng',empty:'Chưa có task dựng'}};
 const S={kind:'shoot',data:{},week:{},loading:null,error:'',day:null,person:'',mine:false,home:null,homeAt:0,homeLoading:null,homeError:''};
 const norm=v=>String(v??'').replace(/[​-‍⁠﻿]/g,'').normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/đ/g,'d').replace(/Đ/g,'D').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
 // Same rule as the server: equal ignoring accents/case, or a 2+ word sheet name matching the end of the full name.
 const matches=(sheetName,fullName)=>{const a=norm(sheetName),b=norm(fullName);if(!a||!b)return false;if(a===b)return true;return a.split(' ').length>=2&&(' '+b).endsWith(' '+a);};
 const isMe=p=>matches(p,state?.user?.name);
 const time=iso=>iso?new Date(iso).toLocaleTimeString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',hour:'2-digit',minute:'2-digit'}):'';
 const safeColor=c=>/^#[0-9a-f]{6}$/i.test(String(c||''))?c:'';
 const short=w=>w==='Chủ nhật'?'CN':String(w||'').replace('Thứ ','T');
 const ddmm=d=>d.slice(8,10)+'/'+d.slice(5,7);

 function visible(t){
  if(S.mine&&!t.people.some(isMe))return false;
  if(S.person&&!t.people.some(p=>norm(p)===norm(S.person)))return false;
  return true;
 }
 function entryMarkup(t,kind,channel){
  const people=t.people.length?t.people.map(p=>isMe(p)?`<span class="me">${esc(p)}</span>`:esc(p)).join(', '):`<span class="es-empty">${kind==='shoot'?'Chưa ghi người quay':'Chưa ghi người phụ trách'}</span>`;
  const mine=t.people.some(isMe),color=safeColor(t.bg),meta=[t.type?esc(t.type):'',(mine?'★ ':'')+people].filter(Boolean).join(' · ');
  const main=kind==='shoot'
   ?`${t.time||t.session&&channel?`<span class="es-time">${[channel&&t.session?esc(t.session):'',t.time?'🕒 '+esc(t.time):''].filter(Boolean).join(' · ')}</span>`:''}<b class="${t.place?'':'none'}">${t.place?'📍 '+esc(t.place):'Chưa ghi địa điểm'}</b>`
   :`<b class="${t.title?'':'none'}">${t.title?esc(t.title):'Chưa ghi tên task'}</b>`;
  return `<div class="es-task"${color?` style="border-left-color:${color}"`:''}>${channel?`<small>${esc(channel)}</small>`:''}${main}<small class="${mine?'me':''}">${meta}</small>${t.note?`<small>${esc(t.note)}</small>`:''}${t.link&&/^https?:\/\//i.test(t.link)?`<a href="${esc(t.link)}" target="_blank" rel="noopener">Mở link ↗</a>`:''}</div>`;
 }
 // Shoot entries are grouped by session (Sáng / Chiều) inside a cell.
 function cellMarkup(entries,kind){
  if(kind!=='shoot')return entries.map(t=>entryMarkup(t,kind)).join('');
  const groups=[];for(const t of entries){const key=t.session||'';let g=groups.find(x=>x.key===key);if(!g){g={key,items:[]};groups.push(g);}g.items.push(t);}
  return groups.map(g=>(g.key?`<div class="es-session">${esc(g.key)}</div>`:'')+g.items.map(t=>entryMarkup(t,kind)).join('')).join('');
 }
 const channelHead=c=>`${esc(c.name)}${c.owner?`<small>PT: ${esc(c.owner)}</small>`:''}${c.plan?`<small>Đăng: ${esc(c.plan)}</small>`:''}`;

 async function load(force){
  if(S.loading)return S.loading;
  const kind=S.kind;
  S.loading=call('editSchedule',{kind,week:S.week[kind]||null,refresh:!!force}).then(r=>{
   S.data[kind]=r;S.error='';S.week[kind]=r.week?.id||null;
   if(!S.day||!r.week?.days.some(d=>d.date===S.day))S.day=r.week?.days.find(d=>d.date===r.today)?.date||r.week?.days[0]?.date||null;
   return true;
  }).catch(e=>{S.error=e.message||String(e);return false;}).finally(()=>{S.loading=null;});
  return S.loading;
 }

 function draw(){
  if(tab!=='editSchedule')return;
  const screen=$('screen'),kind=S.kind,d=S.data[kind],K=KIND[kind];
  const kinds=`<div class="es-kinds" role="tablist">${Object.entries(KIND).map(([k,v])=>`<button role="tab" data-kind="${k}" class="${k===kind?'on':''}" aria-selected="${k===kind}">${v.icon} ${v.label}</button>`).join('')}</div>`;
  if(!d){screen.innerHTML=kinds+(S.error?`<section class="card"><h2>${K.label}</h2><p class="muted">${esc(S.error)}</p><button id="esRetry">Thử lại</button></section>`:`<section class="card empty">Đang đọc ${K.label.toLowerCase()} từ Google Sheet…</section>`);bindKinds();$('esRetry')?.addEventListener('click',()=>refresh(true));return;}
  const w=d.week,weeks=d.weeks,i=w?weeks.findIndex(x=>x.id===w.id):-1,people=w?[...w.people]:[];
  if(S.person&&!people.some(p=>norm(p)===norm(S.person)))S.person='';
  const head=`<section class="card"><div class="es-head"><h2>${K.icon} ${K.label}${w?' · '+esc(w.title):''}</h2>${w?`<span class="badge">${esc(w.tab)}</span>`:''}</div>
   ${weeks.length?`<div class="es-nav"><button class="secondary" id="esPrev" ${i<=0?'disabled':''} aria-label="Tuần trước">‹</button><select id="esWeek" aria-label="Chọn tuần">${weeks.map(x=>`<option value="${esc(x.id)}" ${w&&x.id===w.id?'selected':''}>Tuần ${esc(ddmm(x.start))} – ${esc(ddmm(x.end))} · ${esc(x.tab)}</option>`).join('')}</select><button class="secondary" id="esNext" ${i<0||i>=weeks.length-1?'disabled':''} aria-label="Tuần sau">›</button></div>`:''}
   ${w?`<div class="es-tools"><button class="secondary ${S.mine?'on':''}" id="esMine">★ ${kind==='shoot'?'Lịch quay của tôi':'Task của tôi'}</button><select id="esPerson" aria-label="Lọc theo người"><option value="">${kind==='shoot'?'Tất cả người quay':'Tất cả người phụ trách'}</option>${people.map(p=>`<option ${norm(p)===norm(S.person)?'selected':''}>${esc(p)}</option>`).join('')}</select></div>`:''}
   <div class="es-meta">Chỉ xem · dữ liệu đọc từ Google Sheet lúc ${esc(time(d.readAt))} · <a href="${esc(d.sheetUrl)}" target="_blank" rel="noopener">Mở Google Sheet ↗</a></div>${S.error?`<p class="muted">${esc(S.error)}</p>`:''}</section>`;
  if(!w){screen.innerHTML=kinds+head+`<section class="card empty">Sheet chưa có tab "${kind==='shoot'?'THÁNG … | LỊCH QUAY':'THÁNG … | TASK DỰNG'}" đúng khung (dòng tuần dạng 30/11 - 06/12, dòng ngày, cột KÊNH).</section>`;bindKinds();bindHead();return;}
  const filtering=S.mine||!!S.person,total=w.channels.reduce((n,c)=>n+c.days.flat().length,0);
  const rows=w.channels.filter(c=>!filtering||c.days.some(ts=>ts.some(visible)));
  const wide=`<div class="es-wide"><div class="es-wrap"><table class="es-table"><thead><tr><th class="es-ch">Kênh</th>${w.days.map(x=>`<th class="${x.date===d.today?'today':''}">${esc(x.weekday)}<small>${esc(x.label)}${x.date===d.today?' · Hôm nay':''}</small></th>`).join('')}</tr></thead><tbody>${rows.length?rows.map(c=>`<tr><th class="es-ch">${channelHead(c)}</th>${c.days.map((ts,k)=>{const shown=ts.filter(visible);return `<td class="${w.days[k].date===d.today?'today':''}">${shown.length?cellMarkup(shown,kind):'<span class="es-empty">—</span>'}</td>`;}).join('')}</tr>`).join(''):`<tr><td colspan="${w.days.length+1}" class="es-quiet">Không có mục phù hợp bộ lọc.</td></tr>`}</tbody></table></div></div>`;
  const k=Math.max(0,w.days.findIndex(x=>x.date===S.day)),count=j=>w.channels.reduce((n,c)=>n+(c.days[j]||[]).filter(visible).length,0);
  const withEntries=w.channels.filter(c=>(c.days[k]||[]).some(visible)),without=filtering?[]:w.channels.filter(c=>!(c.days[k]||[]).length);
  const narrow=`<div class="es-narrow"><div class="es-days" role="tablist">${w.days.map((x,j)=>{const n=count(j);return `<button role="tab" data-day="${esc(x.date)}" class="${j===k?'on':''} ${x.date===d.today?'today':''}" aria-selected="${j===k}">${esc(short(x.weekday))}<small>${esc(x.label)}</small>${n?`<i>${n}</i>`:''}</button>`;}).join('')}</div>
   ${withEntries.length?withEntries.map(c=>`<section class="card es-channel"><h3>${esc(c.name)}</h3>${c.owner||c.plan?`<small>${[c.owner?'PT: '+esc(c.owner):'',c.plan?'Đăng: '+esc(c.plan):''].filter(Boolean).join(' · ')}</small>`:''}${cellMarkup(c.days[k].filter(visible),kind)}</section>`).join(''):`<section class="card empty">${filtering?'Không có mục phù hợp bộ lọc trong ngày này.':K.empty+' trong ngày này.'}</section>`}
   ${without.length&&withEntries.length?`<p class="es-quiet">${K.empty}: ${without.map(c=>esc(c.name)).join(' · ')}</p>`:''}</div>`;
  screen.innerHTML=kinds+head+(total?'':`<section class="card empty">Tuần này ${K.empty.toLowerCase()} trên Sheet.</section>`)+wide+narrow;
  bindKinds();bindHead();
  screen.querySelectorAll('[data-day]').forEach(b=>b.onclick=()=>{S.day=b.dataset.day;draw();});
 }
 function bindKinds(){
  $('screen').querySelectorAll('[data-kind]').forEach(b=>b.onclick=()=>{if(S.kind===b.dataset.kind)return;S.kind=b.dataset.kind;S.person='';S.error='';draw();if(!S.data[S.kind])load(false).then(draw);});
 }
 function bindHead(){
  const weeks=S.data[S.kind]?.weeks||[],i=weeks.findIndex(x=>x.id===S.data[S.kind]?.week?.id);
  const open=id=>{S.week[S.kind]=id;S.day=null;msg('Đang tải tuần…');load(false).then(ok=>{msg(ok?'':TITLE+': '+S.error,!ok);draw();});};
  $('esPrev')?.addEventListener('click',()=>i>0&&open(weeks[i-1].id));
  $('esNext')?.addEventListener('click',()=>i<weeks.length-1&&open(weeks[i+1].id));
  $('esWeek')?.addEventListener('change',e=>open(e.target.value));
  $('esMine')?.addEventListener('click',()=>{S.mine=!S.mine;if(S.mine)S.person='';draw();});
  $('esPerson')?.addEventListener('change',e=>{S.person=e.target.value;if(S.person)S.mine=false;draw();});
 }
 async function refresh(manual){
  if(manual)msg('Đang đọc lại Google Sheet…');
  const ok=await load(!!manual);
  if(manual)msg(ok?'':TITLE+': '+S.error,!ok);
  draw();return ok;
 }
 window.editScheduleView=function(){draw();if(!S.data[S.kind]&&!S.loading)refresh(false);};
 window.editScheduleRefresh=refresh;

 // ---- Trang chủ: "Lịch quay và lịch dựng hôm nay" ----
 function homeMarkup(){
  const h=S.home;
  const head=`<div class="row"><b>🎥 &nbsp;${TITLE} hôm nay</b><button class="text-button" id="esHomeOpen">Xem lịch ›</button></div>`;
  if(!h)return head+(S.homeError?`<p class="es-sum">Chưa đọc được lịch. ${esc(S.homeError)}</p>`:'<p class="es-sum">Đang đọc lịch…</p>');
  if(!h.found)return head+'<p class="es-sum">Google Sheet chưa có lịch cho hôm nay.</p>';
  const part=kind=>{
   const p=h[kind],K=KIND[kind];if(!p?.found)return '';
   const list=p.mine.slice(0,4).map(t=>entryMarkup(t,kind,t.channel)).join('')+(p.mine.length>4?`<p class="es-sum">+${p.mine.length-4} mục khác</p>`:'');
   return `<h3>${K.icon} ${K.label}</h3>`+(p.mine.length?list:`<p class="es-sum">Hôm nay bạn không có ${K.unit}.</p>`);
  };
  const team=h.manager?`<p class="es-sum">Cả team hôm nay: <b>${h.shoot?.total||0}</b> suất quay · <b>${h.edit?.total||0}</b> task dựng${h.edit?.found&&h.edit.emptyChannels.length?`<br>Kênh chưa có task dựng: ${h.edit.emptyChannels.map(esc).join(' · ')}`:''}</p>`:'';
  return head+`<p class="es-sum">${esc(h.day.weekday)} ${esc(h.day.label)}</p>`+part('shoot')+part('edit')+team;
 }
 function paintHome(){
  const box=$('esHome');if(!box)return;box.innerHTML=homeMarkup();
  $('esHomeOpen')?.addEventListener('click',()=>{
   const h=S.home;
   if(h?.found){S.kind=h.shoot?.mine.length||!h.edit?.mine.length?'shoot':'edit';for(const k of Object.keys(KIND))if(h[k]?.week&&S.week[k]!==h[k].week){S.week[k]=h[k].week;delete S.data[k];}S.day=h.today;}
   go('editSchedule');
  });
 }
 function loadHome(){
  if(S.homeLoading||Date.now()-S.homeAt<60000)return;
  S.homeLoading=call('editScheduleToday',{}).then(r=>{S.home=r;S.homeError='';S.homeAt=Date.now();})
   .catch(e=>{S.homeError=e.message||String(e);S.homeAt=Date.now()-45000;}) // retry after ~15s
   .finally(()=>{S.homeLoading=null;if(tab==='home')paintHome();});
 }
 if(typeof homeView==='function'){
  const previous=homeView;
  homeView=function(){
   previous.apply(this,arguments);
   try{
    // workspace.js replaces the classic home layout; place the card under whichever summary row exists.
    const anchor=$('screen').querySelector('.workspace-stats')||$('screen').querySelector('.home-metrics')||$('screen').querySelector('.home-intro');if(!anchor)return;
    const box=document.createElement('section');box.className='card es-home';box.id='esHome';anchor.after(box);
    paintHome();loadHome();
   }catch(e){console.error(e);}
  };
 }
})();
