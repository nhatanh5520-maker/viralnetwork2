/* Live workspace UI. All actions continue through the authenticated Viral RPC. */
function projectCode(name){return String(name||'').split(/\s+-\s+/)[0];}
function projectAvatarMarkup(name,cls='project-avatar'){
 const label=String(name||'Dự án').replace(/^[A-Z0-9_-]+\s+-\s+/i,''),url=state?.projectAvatars?.[projectCode(name)];
 return '<div class="'+cls+'" aria-label="Ảnh dự án '+esc(label)+'">'+(url&&/^\/api\/viral\/project-image\?id=/.test(url)?'<img src="'+esc(url)+'" alt="'+esc(label)+'" loading="lazy" onerror="this.hidden=true;this.nextElementSibling.hidden=false"><span hidden>'+esc(label.charAt(0).toUpperCase())+'</span>':esc(label.charAt(0).toUpperCase()))+'</div>';
}
async function readProjectImage(file){
 if(!file)return null;
 if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>2*1024*1024)throw Error('Chọn ảnh JPG, PNG hoặc WebP dưới 2 MB.');
 const base64=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(Error('Không đọc được ảnh.'));reader.readAsDataURL(file)});
 return {name:file.name,type:file.type,base64};
}
function bindProjectImagePreviews(root){root.querySelectorAll('[data-project-image]').forEach(input=>input.onchange=async()=>{const preview=input.parentElement.querySelector('img');try{const image=await readProjectImage(input.files?.[0]);preview.hidden=!image;if(image)preview.src='data:'+image.type+';base64,'+image.base64}catch(e){input.value='';preview.hidden=true;msg(e.message,true)}})}
let productionFiltersExpanded=false;
function compactProductionFilters(){
 const screen=$('screen'),search=screen.querySelector('.production-search'),date=$('productionDateApply')?.closest('section');
 screen.querySelectorAll('[data-prod-filter]').forEach(b=>b.closest('.chips')?.remove());
 if(!search||!date||approvalFocus)return;
 const details=document.createElement('details');details.className='card production-filter-panel';details.open=productionFiltersExpanded;
 const selected=[window._productionSearch?'Từ khóa: '+window._productionSearch:'',window._productionFrom||window._productionTo?(window._productionFrom||'Đầu kỳ')+' → '+(window._productionTo||'Hiện tại'):'',window._v19DateType&&window._v19DateType!=='all'?$('productionDateType').selectedOptions[0]?.textContent:''].filter(Boolean);
 details.innerHTML='<summary><span>Tìm kiếm & bộ lọc</span><small>'+(selected.length?'Đang lọc':'Chưa áp dụng')+'</small><span class="filter-chevron" aria-hidden="true">⌄</span></summary><div class="production-filter-body"></div>';
 search.before(details);const body=details.querySelector('div');search.classList.remove('card');date.classList.remove('card');date.querySelector('h2')?.remove();body.append(search,date);
 $('productionDateApply').hidden=true;$('clearProductionDay').hidden=true;
 const apply=()=>{const from=$('productionFrom').value,to=$('productionTo').value;if(from&&to&&from>to){msg('Từ ngày phải trước hoặc bằng Đến ngày',true);return;}window._productionSearch=$('productionSearch').value.trim();window._productionSearchDraft=window._productionSearch;window._v19DateType=$('productionDateType').value;window._productionFrom=from;window._productionTo=to;window._v19Day='';productionFiltersExpanded=false;details.open=false;formDirty=false;loadProductionPage(0);};
 const button=$('productionSearchButton');button.textContent='Áp dụng';button.onclick=apply;$('productionSearch').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();apply();}};
 $('productionSearchClear').textContent='Xóa bộ lọc';$('productionSearchClear').onclick=()=>{window._productionSearch='';window._productionSearchDraft='';window._productionFrom='';window._productionTo='';window._v19Day='';window._v19DateType='all';productionFiltersExpanded=false;details.open=false;formDirty=false;loadProductionPage(0);};
 const footer=document.createElement('div');footer.className='actions';footer.append(button,$('productionSearchClear'));const close=document.createElement('button');close.type='button';close.className='secondary';close.textContent='Thu gọn';close.onclick=()=>details.open=false;footer.append(close);body.append(footer);
 if(selected.length){const note=document.createElement('small');note.className='production-active-filters';note.textContent=selected.join(' · ');details.after(note);}
 details.ontoggle=()=>productionFiltersExpanded=details.open;
}
async function submitProjectChange(form,action){
 if(busy)return;const selected=(state.projectRecords||[]).find(p=>p.code===form.elements.project.value);if(!selected)return;
 if(action==='archive'&&!confirm('Xóa / ngưng sử dụng “'+selected.label+'”? Dự án sẽ không còn được chọn khi tạo mới. Idea, công việc, bill và lịch sử cũ vẫn được giữ.'))return;
 busy=true;let saved=false;try{msg('Đang cập nhật dự án…');const image=action==='save'?await readProjectImage(form.elements.image.files?.[0]):null;
 const r=await call('updateWebProject',selected.code,{action,revision:selected.revision,code:form.elements.code.value,name:form.elements.name.value,telegram_group_chat_id:form.elements.telegram_group_chat_id.value,image,remove_image:form.elements.remove_image.checked});saved=true;
 state.projects=r.projects;state.projectRecords=r.projectRecords;state.projectAvatars=r.projectAvatars;
 if(window._v18Project===r.renamedProject.from)window._v18Project=action==='archive'?'':r.renamedProject.to;
 productionPageCache.clear();pendingReadCalls.clear();corePromise=null;expenseContentCache.clear();if(typeof paymentWorkspace!=='undefined'){paymentWorkspace.loaded=false;paymentWorkspace.expenses=[];}
 await loadCore();formDirty=false;render();await loadProductionPage(0,false,true);msg(r.warning);
 }catch(e){msg((saved?'Dự án đã lưu; cần làm mới để tải lại giao diện. ':'')+(e.message||String(e)),true);}finally{busy=false;}
}
function projectEditPanel(section){
 const projects=state.projectRecords||[];if(!section||!projects.length)return;
 const details=document.createElement('details');details.innerHTML='<summary>Sửa dự án</summary><form id="projectEditForm"><label>Dự án<select name="project">'+projects.map(p=>'<option value="'+esc(p.code)+'">'+esc(p.label)+(p.archived?' · Đã ngưng sử dụng':'')+'</option>').join('')+'</select></label><label>Mã dự án<input name="code" maxlength="20" pattern="[A-Za-z0-9_-]{2,20}" required></label><label>Tên dự án<input name="name" maxlength="80" required></label><label>ID nhóm Telegram<input name="telegram_group_chat_id" type="text" placeholder="-1001234567890"><small>Để trống nếu không gửi thông báo dự án vào nhóm.</small></label><label>Ảnh đại diện mới<input name="image" type="file" accept="image/jpeg,image/png,image/webp" data-project-image><img class="project-image-preview" alt="Ảnh đại diện dự án" hidden></label><label class="project-remove-image"><input type="checkbox" name="remove_image"> Gỡ ảnh đại diện hiện tại</label><small class="project-edit-status"></small><div class="actions"><button type="submit">Lưu thay đổi</button><button type="button" class="danger" id="archiveProject">Xóa dự án</button></div></form>';section.append(details);const sync=document.createElement('button');sync.type='button';sync.className='secondary';sync.id='syncProjectDirectory';sync.textContent='Đồng bộ 10 dự án từ Excel nhóm';sync.onclick=()=>{if(confirm('Tạo / cập nhật 10 dự án theo Excel nhóm đã gửi, gồm mã, tên và ID Telegram. Nhóm tổng chỉ dùng cho thông báo chung. Giữ nguyên task, bill và dự án khác. Tiếp tục?'))run('syncWebProjectDirectory',true);};details.prepend(sync);
 const form=details.querySelector('form'),draw=()=>{const p=projects.find(p=>p.code===form.elements.project.value);if(!p)return;form.elements.code.value=p.code;form.elements.name.value=p.name;form.elements.telegram_group_chat_id.value=p.telegram_group_chat_id||'';form.elements.image.value='';form.elements.remove_image.checked=false;const preview=form.querySelector('img'),url=state.projectAvatars?.[p.code];preview.hidden=!url;if(url)preview.src=url;details.querySelector('.project-edit-status').textContent=p.archived?'Dự án đã ngưng sử dụng. Dữ liệu cũ vẫn được giữ.':'';$('archiveProject').disabled=p.archived;};form.elements.project.onchange=draw;bindProjectImagePreviews(details);form.elements.image.addEventListener('change',()=>form.elements.remove_image.checked=false);form.elements.remove_image.onchange=()=>{if(form.elements.remove_image.checked){form.elements.image.value='';form.querySelector('img').hidden=true;}};form.onsubmit=e=>{e.preventDefault();submitProjectChange(form,'save');};$('archiveProject').onclick=()=>submitProjectChange(form,'archive');draw();
}
const workspaceProductionView=productionView;
productionView=function(){window._v19Filter='all';workspaceProductionView();if(!productionReady)return;bindProjectImagePreviews($('screen'));compactProductionCards();compactProductionFilters();
 if(['leader','director'].includes(state.user.role)&&!approvalFocus)projectEditPanel($('screen').querySelector('.project-panel'));
 arrangeProductionWorkspace();
};
function arrangeProductionWorkspace(){
 if(approvalFocus)return;
 const screen=$('screen'),panel=screen.querySelector('.project-panel'),menu=panel?.querySelector('.project-menu'),create=screen.querySelector('.create-panel details');
 const intro=document.createElement('div');intro.className='workspace-page-intro';intro.innerHTML='<div><div class="workspace-eyebrow">VIRAL / WORKSPACE</div><h1>Sản xuất</h1><p>Nội dung của team, tiến độ trong một góc nhìn.</p></div>';
 if(create){const button=document.createElement('button');button.type='button';button.className='workspace-create';button.textContent='Tạo nội dung';button.onclick=()=>{create.open=!create.open;if(create.open){create.querySelector('input[name="title"]')?.focus();create.scrollIntoView?.({behavior:'smooth',block:'start'});}};intro.append(button);}
 screen.prepend(intro);
 if(menu){const management=[...panel.children].filter(el=>el!==menu);if(management.length){const controls=document.createElement('div');controls.className='project-management-controls';management.forEach(el=>controls.append(el));menu.append(controls);}}
 const results=$('productionResults');if(results)results.classList.add('workspace-production-grid');
 const trash=$('ideaTrashOpen')?.closest('section');if(trash){const details=document.createElement('details');details.className='workspace-trash';const summary=document.createElement('summary');summary.textContent='Task đã xóa';details.append(summary);while(trash.firstChild)details.append(trash.firstChild);trash.append(details);trash.classList.add('workspace-trash-panel');}
}
function workspaceClockMarkup(){return '<div class="live-attendance-clock"><div class="live-clock-label"><span class="live-dot"></span> GIỜ VIỆT NAM · TRỰC TIẾP</div><time data-live-clock></time><p data-live-date></p><small>Giờ công được xác nhận sau khi lưu trên máy chủ.</small></div>';}
function updateWorkspaceClock(){const now=new Date();document.querySelectorAll('[data-live-clock]').forEach(el=>el.textContent=new Intl.DateTimeFormat('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(now));document.querySelectorAll('[data-live-date]').forEach(el=>el.textContent=new Intl.DateTimeFormat('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',weekday:'long',day:'2-digit',month:'long',year:'numeric'}).format(now));}
setInterval(updateWorkspaceClock,1000);
const workspaceAttendanceView=attendanceView;
attendanceView=function(){
 workspaceAttendanceView();const screen=$('screen');
 const hero=screen.querySelector('.attendance-hero'),form=$('fieldClockForm'),button=$('fieldClockSubmit');
 const top=document.createElement('section');top.className='card attendance-clock-panel';top.innerHTML=workspaceClockMarkup();
 const actions=document.createElement('div');actions.className='attendance-primary-actions';
 if(button){button.setAttribute('form','fieldClockForm');actions.append(button);}
 else if(!state.attendanceAccess?.enabled){for(const id of ['in','out']){const b=$(id);if(b)actions.append(b);}}
 else {const b=document.createElement('button');b.disabled=true;b.textContent='✓ Đã hoàn tất hôm nay';actions.append(b);}
 top.append(actions);screen.prepend(top);
 if(hero){
  const location=document.createElement('section');location.className='card attendance-location';location.innerHTML='<h2>Địa điểm chấm công</h2>';if(form)location.append(form);
  if(form)top.after(location);
  const history=document.createElement('details');history.className='card attendance-records';const summary=document.createElement('summary');summary.textContent='Chi tiết GPS, xác nhận và lịch sử';history.append(summary);hero.classList.remove('card','attendance-hero');history.append(hero);screen.querySelector('.card:not(.attendance-clock-panel):not(.attendance-location)')?.after(history);
 }
 updateWorkspaceClock();
};
const workspaceHomeView=homeView;
homeView=function(){
 workspaceHomeView();const screen=$('screen'),all=(state.tasks||[]).filter(t=>String(t.assignee_id)===String(state.user.id)),open=all.filter(t=>!['done','cancelled','canceled'].includes(t.status)),done=all.filter(t=>t.status==='done'),late=open.filter(t=>t.due_at&&Date.parse(t.due_at)<Date.now());
 const intro=screen.querySelector('.home-intro');if(intro)intro.innerHTML='<div class="workspace-eyebrow">VIRAL / WORKSPACE</div><h1>Chào '+esc(state.user.name)+' 👋</h1><p>Cùng team tạo nên những nội dung thật hay hôm nay.</p>';
 if(intro&&state.user.role!=='director'){const create=document.createElement('button');create.className='workspace-create';create.textContent='+ Tạo nội dung';create.onclick=()=>{go('production');setTimeout(()=>{$('productionForm')?.closest('details')?.setAttribute('open','');$('productionForm')?.scrollIntoView({behavior:'smooth',block:'start'})},250)};const text=document.createElement('div');while(intro.firstChild)text.append(intro.firstChild);intro.append(text,create);intro.classList.add('workspace-page-intro');}
 const oldMetrics=screen.querySelector('.home-metrics');if(oldMetrics)oldMetrics.remove();
 const stats=document.createElement('div');stats.className='workspace-stats';stats.innerHTML=[['Tổng công việc',all.length,'Công việc của bạn'],['Đang thực hiện',open.length,'Đang chờ bạn xử lý'],['Đã hoàn thành',done.length,'Đã ghi nhận hoàn thành'],['Quá hạn',late.length,'Cần ưu tiên xử lý']].map(([label,count,hint])=>'<button data-workspace-tasks><small>'+label+'</small><strong>'+count+'</strong><span>'+hint+'</span></button>').join('');intro?.after(stats);stats.querySelectorAll('button').forEach(b=>b.onclick=()=>go('tasks'));
 const layout=document.createElement('div');layout.className='workspace-home-grid';const work=document.createElement('section');work.className='card workspace-attention';work.innerHTML='<div class="row"><h2>Công việc cần chú ý</h2><button class="secondary compact" data-workspace-more>Xem tất cả ↗</button></div>'+open.slice(0,5).map(t=>'<div class="workspace-task-row"><span class="task-dot"></span><div><b>'+esc(t.title)+'</b><small>'+esc(t.production_item?.project||t.category||'Công việc cá nhân')+'</small></div><span class="badge">'+taskLabel(t.status)+'</span></div>').join('')+(open.length?'':'<div class="workspace-empty">Bạn đã xử lý xong các công việc hiện có.</div>');work.querySelector('[data-workspace-more]').onclick=()=>go('tasks');layout.append(work);
 const attendance=screen.querySelector('.attendance-hero');if(attendance)attendance.remove();
 const a=state.attendance,kind=a?.check_out?'out':'in',point=a?.[kind+'_context'];
 const status=document.createElement('button');status.type='button';status.className='home-attendance-status';status.textContent=(!a?'Chưa chấm công hôm nay':a.check_out?'Đã xuống ca · '+fmt(a.check_out).split(' ')[0]:'Đã vào ca · '+fmt(a.check_in).split(' ')[0])+(point&&point.status!=='approved'?' · '+(point.status==='rejected'?'Cần bổ sung thông tin':'Chờ xác nhận'):'');status.onclick=()=>go('attendance');stats.after(status);status.after(layout);const shoots=document.createElement('section');shoots.className='card workspace-shoots';const heading=[...screen.querySelectorAll('.section-head')].find(el=>el.textContent.includes('Lịch quay sắp tới'));shoots.innerHTML='<div class="row"><h2>Lịch quay sắp tới</h2></div>';if(heading){let node=heading.nextElementSibling;while(node&&!node.classList.contains('section-head')){const next=node.nextElementSibling;shoots.append(node);node=next;}heading.remove();}layout.append(shoots);
};
function workspaceShell(){
 if(!state?.user)return;
 let sidebar=$('workspaceSidebar');if(!sidebar){sidebar=document.createElement('aside');sidebar.id='workspaceSidebar';document.body.prepend(sidebar);}
 const labels=[['home','Trang chủ'],['attendance','Chấm công'],['production','Sản xuất'],['tasks','Công việc'],['utilities','Tiện ích'],['news','Bảng tin']];
 sidebar.innerHTML='<a class="workspace-brand" href="/"><img class="workspace-company-logo" src="/viral/company-logo.webp" alt="Logo Viral Network" width="210" height="114" decoding="async"></a><div class="workspace-studio workspace-slogan" aria-label="Slogan công ty"><strong>Nội Dung Thật</strong><strong>Giá Trị Thật</strong><strong>Kết Quả Thật</strong></div><nav aria-label="Menu chính">'+labels.map(([id,label])=>'<button data-workspace-tab="'+id+'" class="'+(tab===id?'on':'')+'">'+icon(id)+'<span>'+label+'</span></button>').join('')+'</nav><div class="workspace-sidebar-footer"><span class="live-dot"></span> Không gian làm việc của bạn<br><button data-workspace-profile>Hồ sơ cá nhân ↗</button></div>';
 sidebar.querySelectorAll('[data-workspace-tab]').forEach(b=>b.onclick=()=>go(b.dataset.workspaceTab));sidebar.querySelector('[data-workspace-profile]').onclick=()=>go('profile');
 let top=$('workspaceTopbar');if(!top){top=document.createElement('div');top.id='workspaceTopbar';document.querySelector('.hero').prepend(top);}
 top.innerHTML='<form id="workspaceSearch"><input type="search" aria-label="Tìm kiếm nội dung sản xuất" placeholder="Tìm kiếm nội dung, dự án, nhân viên…"><button class="secondary" aria-label="Tìm kiếm">'+icon('search')+'</button></form><button class="workspace-profile" data-workspace-profile>'+avatar(state.user.id,state.user.name)+'<span><b>'+esc(state.user.name)+'</b><small>'+esc(({director:'Ban giám đốc',leader:'Leader',employee:'Nhân viên'})[state.user.role]||'Nhân viên')+' · '+esc(state.user.department||'')+'</small></span></button>';
 top.querySelector('[data-workspace-profile]').onclick=()=>go('profile');top.querySelector('form').onsubmit=e=>{e.preventDefault();window._productionSearch=top.querySelector('input').value.trim();window._productionSearchDraft=window._productionSearch;go('production')};
 document.body.classList.add('workspace-ready');
}
const workspaceRender=render;
render=function(){workspaceRender();workspaceShell();updateWorkspaceClock();};

const expandedProductionTasks=new Set();
function progressMarkup(progress){return '<div class="compact-task-progress"><div class="row"><small>Tiến độ toàn task</small><b>'+progress.percent+'%</b></div><progress max="100" value="'+progress.percent+'" aria-label="Tiến độ toàn task '+progress.percent+'%"></progress><small class="compact-task-step">'+esc(progress.label)+'</small></div>';}
function compactProductionCards(){
 const items=approvalFocus?[approvalFocus.item]:state.productionPage?.items||state.productionItems||[];
 $('screen').querySelectorAll('.production-item').forEach((card,index)=>{
  const x=items[index];if(!x)return;const key=String(x.id),progress=ViralTaskLayout.production(x),nodes=[...card.childNodes];
  const details=document.createElement('details');details.className='compact-task-details';details.open=!!approvalFocus||expandedProductionTasks.has(key);
  const summary=document.createElement('summary');summary.className='compact-task-summary';summary.innerHTML='<div class="compact-task-heading">'+projectAvatarMarkup(x.project,'project-avatar')+'<div><h2>'+esc(x.title)+'</h2><small>'+esc(x.project)+'</small></div>'+(x.stage==='published'?'<span class="badge">Đã đăng</span>':'')+'</div>'+progressMarkup(progress)+'<span class="compact-task-toggle"><span class="when-closed">Xem chi tiết ↗</span><span class="when-open">Thu gọn ↑</span></span>';
  const body=document.createElement('div');body.className='task-expanded';nodes.forEach(node=>body.append(node));body.querySelector(':scope > .prod-thumb')?.remove();body.querySelector(':scope > .row')?.remove();details.append(summary,body);card.append(details);
  details.ontoggle=()=>{if(details.open)expandedProductionTasks.add(key);else expandedProductionTasks.delete(key)};
 });
}
const expandedPersonalTasks=new Set();
const expandedWorkGroups=new Set();
function personalCompactCard(t){
 const progress=ViralTaskLayout.task(t),production=t.production_item||{},project=production.project||t.project||t.category||'Công việc cá nhân',closed=t.status==='done';
 const extra=closed&&t.production_id?'Phần việc của bạn đã hoàn thành':t._review?'Đang chờ bạn duyệt':progress.label;
 return '<article class="personal-task-card"><details data-personal-task="'+esc(t.id)+'" '+(expandedPersonalTasks.has(String(t.id))?'open':'')+'><summary class="compact-task-summary"><div class="compact-task-heading">'+projectAvatarMarkup(project,'project-avatar')+'<div><small>'+esc(project)+'</small><h3>'+esc(t.title)+'</h3></div></div><small class="personal-task-deadline">'+(t.due_at?'Hạn: '+fmt(t.due_at):t.awaiting_assets?'Chờ bàn giao tư liệu · Chưa tính hạn edit':'Chưa có hạn')+'</small>'+progressMarkup(progress)+(extra!==progress.label?'<small class="personal-task-role">'+esc(extra)+'</small>':'')+'<span class="compact-task-toggle"><span class="when-closed">Xem chi tiết ↗</span><span class="when-open">Thu gọn ↑</span></span></summary><div class="task-expanded">'+(t._review?'<button type="button" data-open-work-approval="'+esc(t._review.production_id)+'" data-kind="'+esc(t._review.kind)+'">Mở để duyệt</button>':'')+(t._genericReview?'<div class="actions"><button data-review-queue="'+esc(t.id)+'" data-decision="done">Duyệt hoàn thành</button><button class="danger" data-review-queue="'+esc(t.id)+'" data-decision="revision">Yêu cầu sửa</button></div>':workTaskCard(t))+'</div></details></article>';
}
tasksView=function(){
 const mine=String(state.user.id),tasks=sortPersonalWork((state.tasks||[]).filter(t=>String(t.assignee_id)===mine)).map(t=>({...t})),queue=state.reviewQueue;
 for(const review of queue||[]){
  if(review.operational_kind)continue;
  if(review.production_id){const found=tasks.find(t=>String(t.production_id)===String(review.production_id));if(found){found._review=review;continue;}
   const production=(state.productionItems||[]).find(x=>String(x.id)===String(review.production_id));tasks.push({...review,status:'open',assignee_id:mine,_review:review,production_item:production||{id:review.production_id,project:review.project,stage:'brief'},category:'Duyệt Idea',quantity:1,weight:1});
  }else{const found=tasks.find(t=>String(t.id)===String(review.id));if(!found)tasks.push({...review,status:'open',assignee_id:mine,_genericReview:true,category:'Xác nhận công việc',quantity:1,weight:1});}
 }
 const groups=[['waiting','Chờ thực hiện'],['active','Đang thực hiện'],['done','Hoàn thành']],cancelled=tasks.filter(t=>ViralTaskLayout.group(t)==='cancelled');
 $('screen').innerHTML='<div class="workspace-eyebrow">VIRAL / CÔNG VIỆC CÁ NHÂN</div><h1 class="workspace-title">Công việc của tôi</h1>'+(!Array.isArray(queue)?'<p class="muted">Đang tải các mục được phân công duyệt…</p>':'')+'<div class="personal-work-board">'+groups.map(([key,label])=>{const rows=tasks.filter(t=>ViralTaskLayout.group(t)===key);return '<details class="personal-work-column" data-work-group="'+key+'" '+(expandedWorkGroups.has(key)?'open':'')+'><summary class="work-group-summary"><h2>'+label+'</h2><span class="work-group-count">'+rows.length+'</span><span class="work-group-arrow" aria-hidden="true">▸</span></summary>'+rows.map(personalCompactCard).join('')+'</details>'}).join('')+'</div>'+(cancelled.length?'<details class="card"><summary>Đã hủy ('+cancelled.length+')</summary>'+cancelled.map(personalCompactCard).join('')+'</details>':'');
 $('screen').querySelectorAll('[data-work-group]').forEach(d=>d.ontoggle=()=>{if(d.open)expandedWorkGroups.add(d.dataset.workGroup);else expandedWorkGroups.delete(d.dataset.workGroup)});
 $('screen').querySelectorAll('[data-personal-task]').forEach(d=>d.ontoggle=()=>{if(d.open)expandedPersonalTasks.add(d.dataset.personalTask);else expandedPersonalTasks.delete(d.dataset.personalTask)});
 bindVJScript();bindEditorProgress();
 $('screen').querySelectorAll('[data-open-production-work]').forEach(b=>b.onclick=()=>openProductionWork(b.dataset.openProductionWork));
 $('screen').querySelectorAll('[data-open-work-approval]').forEach(b=>b.onclick=()=>openReviewTarget('',b.dataset.openWorkApproval,b.dataset.kind));
 $('screen').querySelectorAll('[data-submit]').forEach(b=>b.onclick=()=>run('submitTask',b.dataset.submit));
 $('screen').querySelectorAll('[data-review-queue]').forEach(b=>b.onclick=()=>reviewQueuedTask(b.dataset.reviewQueue,b.dataset.decision));
};

if(state?.user)render();


