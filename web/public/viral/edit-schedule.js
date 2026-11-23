/* Lịch dựng (Tiện ích) + thẻ "Lịch dựng hôm nay" ở Trang chủ.
 * Read only: data comes from the "ORDER TASK DỰNG" Google Sheet through editSchedule / editScheduleToday.
 * Nothing here adds or edits tasks; people keep editing the Sheet. */
(function(){
 paths.editSchedule='<path d="M6 3v18M3 6h18M14 14l7 7M14 21l7-7"/>';
 const style=document.createElement('style');
 style.textContent='.es-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}.es-head h2{margin:0}.es-nav{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:10px}.es-nav select{flex:1;min-width:160px;margin:0}.es-nav button{min-width:44px;padding:9px 12px}.es-tools{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:10px}.es-tools select{flex:1;min-width:150px;margin:0}.es-tools button.on{background:var(--green);color:#06120b}.es-meta{font-size:12px;color:var(--muted);margin-top:8px}.es-meta a{color:var(--green)}'
 +'.es-wrap{overflow:auto;-webkit-overflow-scrolling:touch;max-height:calc(100vh - 220px);border:1px solid var(--line);border-radius:14px}.es-table{border-collapse:separate;border-spacing:0;font-size:13px;min-width:100%}.es-table th,.es-table td{border-bottom:1px solid var(--line);border-right:1px solid var(--line);padding:8px;vertical-align:top;text-align:left;background:var(--panel)}.es-table thead th{position:sticky;top:0;z-index:2;background:var(--panel2);white-space:nowrap}.es-table thead th small{display:block;color:var(--muted);font-weight:500}.es-table th.es-ch{position:sticky;left:0;z-index:1;background:var(--panel2);min-width:150px;max-width:190px;white-space:normal}.es-table thead th.es-ch{z-index:3}.es-table td{min-width:170px;max-width:240px}.es-table .today{background:#16261d}.es-table thead th.today{background:#1d3a28;color:var(--green)}'
 +'.es-task{border-left:4px solid #3a4a40;background:#1b241f;border-radius:8px;padding:6px 8px;margin:0 0 6px}.es-task:last-child{margin-bottom:0}.es-task b{display:block;font-weight:650;line-height:1.35;word-break:break-word}.es-task b.none{color:var(--muted);font-style:italic;font-weight:500}.es-task small{display:block;color:var(--muted);margin-top:2px}.es-task small.me{color:var(--green);font-weight:650}.es-task a{color:var(--green);font-size:12px}.es-empty{color:#55655a}'
 +'.es-days{display:flex;gap:6px;overflow-x:auto;padding-bottom:4px;margin-top:10px;scrollbar-width:none}.es-days button{flex:0 0 auto;min-width:62px;padding:8px 6px;text-align:center;background:#171e1a;color:var(--text);border:1px solid var(--line);line-height:1.25}.es-days button small{display:block;font-size:11px;color:var(--muted)}.es-days button.on{background:var(--green);color:#06120b;border-color:var(--green)}.es-days button.on small{color:#06120b}.es-days button.today:not(.on){border-color:var(--green)}.es-days i{display:inline-block;font-style:normal;font-size:10px;font-weight:750;background:#123923;color:#55efa0;border-radius:20px;padding:1px 6px;margin-top:3px}.es-days button.on i{background:#06120b;color:var(--green)}'
 +'.es-channel h3{font-size:14px;margin:0 0 8px}.es-quiet{font-size:12px;color:var(--muted)}.es-narrow{display:none}@media(max-width:760px){.es-wide{display:none}.es-narrow{display:block}}'
 +'.es-home .row{display:flex;justify-content:space-between;align-items:center;gap:8px}.es-home .es-task{margin-top:8px}.es-home .es-sum{font-size:13px;color:var(--muted);margin-top:10px}';
 document.head.append(style);

 const S={data:null,loading:null,error:'',gid:null,day:null,person:'',mine:false,home:null,homeAt:0,homeLoading:null,homeError:''};
 const norm=v=>String(v??'').replace(/[​-‍⁠﻿]/g,'').normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/đ/g,'d').replace(/Đ/g,'D').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
 // Same rule as the server: equal ignoring accents/case, or a 2+ word sheet name matching the end of the full name.
 const matches=(sheetName,fullName)=>{const a=norm(sheetName),b=norm(fullName);if(!a||!b)return false;if(a===b)return true;return a.split(' ').length>=2&&(' '+b).endsWith(' '+a);};
 const isMe=p=>matches(p,state?.user?.name);
 const time=iso=>iso?new Date(iso).toLocaleTimeString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',hour:'2-digit',minute:'2-digit'}):'';
 const safeColor=c=>/^#[0-9a-f]{6}$/i.test(String(c||''))?c:'';
 const short=w=>w==='Chủ nhật'?'CN':String(w||'').replace('Thứ ','T');

 function visible(t){
  if(S.mine&&!t.people.some(isMe))return false;
  if(S.person&&!t.people.some(p=>norm(p)===norm(S.person)))return false;
  return true;
 }
 function taskMarkup(t,channel){
  const people=t.people.length?t.people.map(p=>isMe(p)?`<span class="me">${esc(p)}</span>`:esc(p)).join(', '):'<span class="es-empty">Chưa ghi người thực hiện</span>';
  const mine=t.people.some(isMe),color=safeColor(t.bg);
  return `<div class="es-task"${color?` style="border-left-color:${color}"`:''}>${channel?`<small>${esc(channel)}</small>`:''}<b class="${t.title?'':'none'}">${t.title?esc(t.title):'Chưa ghi tên task'}</b><small class="${mine?'me':''}">${mine?'★ ':''}${people}</small>${t.link&&/^https?:\/\//i.test(t.link)?`<a href="${esc(t.link)}" target="_blank" rel="noopener">Mở link ↗</a>`:''}</div>`;
 }

 async function load(force){
  if(S.loading)return S.loading;
  S.loading=call('editSchedule',{gid:S.gid,refresh:!!force}).then(r=>{
   S.data=r;S.error='';S.gid=r.week?.gid??null;
   if(!S.day||!r.week?.days.some(d=>d.date===S.day))S.day=r.week?.days.find(d=>d.date===r.today)?.date||r.week?.days[0]?.date||null;
   return true;
  }).catch(e=>{S.error=e.message||String(e);return false;}).finally(()=>{S.loading=null;});
  return S.loading;
 }

 function draw(){
  if(tab!=='editSchedule')return;
  const screen=$('screen'),d=S.data;
  if(!d){screen.innerHTML=S.error?`<section class="card"><h2>Lịch dựng</h2><p class="muted">${esc(S.error)}</p><button id="esRetry">Thử lại</button></section>`:'<section class="card empty">Đang đọc lịch dựng từ Google Sheet…</section>';$('esRetry')?.addEventListener('click',()=>refresh(true));return;}
  const w=d.week,weeks=d.weeks,i=w?weeks.findIndex(x=>String(x.gid)===String(w.gid)):-1;
  const people=w?[...w.people]:[];
  if(S.person&&!people.some(p=>norm(p)===norm(S.person)))S.person='';
  const head=`<section class="card"><div class="es-head"><h2>${w?esc(w.title||'Lịch dựng'):'Lịch dựng'}</h2>${w?`<span class="badge">${esc(w.days[0].label)} – ${esc(w.days.at(-1).label)}</span>`:''}</div>
   ${weeks.length?`<div class="es-nav"><button class="secondary" id="esPrev" ${i<=0?'disabled':''} aria-label="Tuần trước">‹</button><select id="esWeek" aria-label="Chọn tuần">${weeks.map(x=>`<option value="${esc(x.gid)}" ${w&&String(x.gid)===String(w.gid)?'selected':''}>${esc(x.title)} (${esc(x.start.slice(8,10)+'/'+x.start.slice(5,7))} – ${esc(x.end.slice(8,10)+'/'+x.end.slice(5,7))})</option>`).join('')}</select><button class="secondary" id="esNext" ${i<0||i>=weeks.length-1?'disabled':''} aria-label="Tuần sau">›</button></div>`:''}
   ${w?`<div class="es-tools"><button class="secondary ${S.mine?'on':''}" id="esMine">★ Task của tôi</button><select id="esPerson" aria-label="Lọc theo người thực hiện"><option value="">Tất cả người thực hiện</option>${people.map(p=>`<option ${norm(p)===norm(S.person)?'selected':''}>${esc(p)}</option>`).join('')}</select></div>`:''}
   <div class="es-meta">Chỉ xem · dữ liệu đọc từ Google Sheet lúc ${esc(time(d.readAt))} · <a href="${esc(d.sheetUrl)}" target="_blank" rel="noopener">Mở Google Sheet ↗</a></div>${S.error?`<p class="muted">${esc(S.error)}</p>`:''}</section>`;
  if(!w){screen.innerHTML=head+'<section class="card empty">Sheet chưa có tab tuần nào đúng khung (hàng ngày dạng 23/11, cột KÊNH/VJ, TÊN TASK, NGƯỜI THỰC HIỆN).</section>';bindHead();return;}
  const filtering=S.mine||!!S.person;
  // Wide: the Sheet's grid.
  const rows=w.channels.filter(c=>!filtering||c.days.some(ts=>ts.some(visible)));
  const wide=`<div class="es-wide"><div class="es-wrap"><table class="es-table"><thead><tr><th class="es-ch">Kênh / VJ</th>${w.days.map(x=>`<th class="${x.date===d.today?'today':''}">${esc(x.weekday)}<small>${esc(x.label)}${x.date===d.today?' · Hôm nay':''}</small></th>`).join('')}</tr></thead><tbody>${rows.length?rows.map(c=>`<tr><th class="es-ch">${esc(c.name)}</th>${c.days.map((ts,k)=>{const shown=ts.filter(visible);return `<td class="${w.days[k].date===d.today?'today':''}">${shown.length?shown.map(t=>taskMarkup(t)).join(''):'<span class="es-empty">—</span>'}</td>`;}).join('')}</tr>`).join(''):`<tr><td colspan="${w.days.length+1}" class="es-quiet">Không có task phù hợp bộ lọc.</td></tr>`}</tbody></table></div></div>`;
  // Narrow: one day at a time.
  const k=Math.max(0,w.days.findIndex(x=>x.date===S.day)),count=j=>w.channels.reduce((n,c)=>n+(c.days[j]||[]).filter(visible).length,0);
  const withTasks=w.channels.filter(c=>(c.days[k]||[]).some(visible)),without=filtering?[]:w.channels.filter(c=>!(c.days[k]||[]).length);
  const narrow=`<div class="es-narrow"><div class="es-days" role="tablist">${w.days.map((x,j)=>{const n=count(j);return `<button role="tab" data-day="${esc(x.date)}" class="${j===k?'on':''} ${x.date===d.today?'today':''}" aria-selected="${j===k}">${esc(short(x.weekday))}<small>${esc(x.label)}</small>${n?`<i>${n}</i>`:''}</button>`;}).join('')}</div>
   ${withTasks.length?withTasks.map(c=>`<section class="card es-channel"><h3>${esc(c.name)}</h3>${c.days[k].filter(visible).map(t=>taskMarkup(t)).join('')}</section>`).join(''):`<section class="card empty">${filtering?'Không có task phù hợp bộ lọc trong ngày này.':'Ngày này chưa có task nào.'}</section>`}
   ${without.length&&withTasks.length?`<p class="es-quiet">Chưa có task: ${without.map(c=>esc(c.name)).join(' · ')}</p>`:''}</div>`;
  screen.innerHTML=head+wide+narrow;
  bindHead();
  screen.querySelectorAll('[data-day]').forEach(b=>b.onclick=()=>{S.day=b.dataset.day;draw();});
 }
 function bindHead(){
  const weeks=S.data?.weeks||[],i=weeks.findIndex(x=>String(x.gid)===String(S.data?.week?.gid));
  const open=gid=>{S.gid=gid;S.day=null;msg('Đang tải tuần…');load(false).then(ok=>{msg(ok?'':'Lịch dựng: '+S.error,!ok);draw();});};
  $('esPrev')?.addEventListener('click',()=>i>0&&open(weeks[i-1].gid));
  $('esNext')?.addEventListener('click',()=>i<weeks.length-1&&open(weeks[i+1].gid));
  $('esWeek')?.addEventListener('change',e=>open(e.target.value));
  $('esMine')?.addEventListener('click',()=>{S.mine=!S.mine;if(S.mine)S.person='';draw();});
  $('esPerson')?.addEventListener('change',e=>{S.person=e.target.value;if(S.person)S.mine=false;draw();});
 }
 async function refresh(manual){
  if(manual)msg('Đang đọc lại Google Sheet…');
  const ok=await load(!!manual);
  if(manual)msg(ok?'':'Lịch dựng: '+S.error,!ok);
  draw();return ok;
 }
 window.editScheduleView=function(){draw();if(!S.data&&!S.loading)refresh(false);};
 window.editScheduleRefresh=refresh;

 // ---- Trang chủ: "Lịch dựng hôm nay" ----
 function homeMarkup(){
  const h=S.home;
  const head=`<div class="row"><b>✂ &nbsp;Lịch dựng hôm nay</b><button class="text-button" id="esHomeOpen">Xem lịch ›</button></div>`;
  if(!h)return head+(S.homeError?`<p class="es-sum">Chưa đọc được lịch dựng. ${esc(S.homeError)}</p>`:'<p class="es-sum">Đang đọc lịch dựng…</p>');
  if(!h.found)return head+'<p class="es-sum">Google Sheet chưa có tab cho tuần này.</p>';
  const mine=h.mine.slice(0,5);
  const list=h.mine.length?mine.map(t=>taskMarkup(t,t.channel)).join('')+(h.mine.length>5?`<p class="es-sum">+${h.mine.length-5} task khác</p>`:''):`<p class="es-sum">${esc(h.day.weekday)} ${esc(h.day.label)}: hôm nay bạn không có task dựng.</p>`;
  const team=h.manager?`<p class="es-sum">Cả team: <b>${h.total}</b> task · ${h.channels-h.emptyChannels.length}/${h.channels} kênh có task${h.emptyChannels.length?`<br>Chưa có task: ${h.emptyChannels.map(esc).join(' · ')}`:''}</p>`:'';
  return head+list+team;
 }
 function paintHome(){
  const box=$('esHome');if(!box)return;box.innerHTML=homeMarkup();
  $('esHomeOpen')?.addEventListener('click',()=>{if(S.home?.found){S.gid=S.home.gid;S.day=S.home.today;if(S.data&&String(S.data.week?.gid)!==String(S.home.gid))S.data=null;}go('editSchedule');});
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
