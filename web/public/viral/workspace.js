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
const workspaceProductionView=productionView;
productionView=function(){workspaceProductionView();if(!productionReady)return;bindProjectImagePreviews($('screen'));
 if(['leader','director'].includes(state.user.role)&&!approvalFocus){
  const projects=state.projects||[],section=$('screen').querySelector('.project-panel');
  if(section&&projects.length){const details=document.createElement('details');details.innerHTML='<summary>Thay ảnh đại diện dự án</summary><form id="projectAvatarForm"><label>Dự án<select name="project">'+projects.map(p=>'<option value="'+esc(projectCode(p))+'">'+esc(p)+'</option>').join('')+'</select></label><label>Ảnh mới<input name="image" type="file" accept="image/jpeg,image/png,image/webp" data-project-image required><img class="project-image-preview" alt="Xem trước ảnh dự án" hidden></label><button>Lưu ảnh đại diện</button></form>';section.append(details);bindProjectImagePreviews(details);details.querySelector('form').onsubmit=async e=>{e.preventDefault();try{const f=e.target,image=await readProjectImage(f.elements.image.files[0]);if(image)await run('saveProjectAvatar',f.elements.project.value,image)}catch(e){msg(e.message,true)}};}
 }
};
function workspaceClockMarkup(){return '<div class="live-attendance-clock"><div class="live-clock-label"><span class="live-dot"></span> GIỜ VIỆT NAM · TRỰC TIẾP</div><time data-live-clock></time><p data-live-date></p><small>Giờ công được xác nhận sau khi lưu trên máy chủ.</small></div>';}
function updateWorkspaceClock(){const now=new Date();document.querySelectorAll('[data-live-clock]').forEach(el=>el.textContent=new Intl.DateTimeFormat('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(now));document.querySelectorAll('[data-live-date]').forEach(el=>el.textContent=new Intl.DateTimeFormat('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',weekday:'long',day:'2-digit',month:'long',year:'numeric'}).format(now));}
setInterval(updateWorkspaceClock,1000);
const workspaceAttendanceView=attendanceView;
attendanceView=function(){workspaceAttendanceView();$('screen').insertAdjacentHTML('afterbegin','<div class="workspace-eyebrow">VIRAL / CHẤM CÔNG</div><h1 class="workspace-title">Một ngày làm việc hiệu quả</h1>'+workspaceClockMarkup());updateWorkspaceClock();};
const workspaceHomeView=homeView;
homeView=function(){
 workspaceHomeView();const screen=$('screen'),all=(state.tasks||[]).filter(t=>String(t.assignee_id)===String(state.user.id)),open=all.filter(t=>!['done','cancelled','canceled'].includes(t.status)),done=all.filter(t=>t.status==='done'),late=open.filter(t=>t.due_at&&Date.parse(t.due_at)<Date.now());
 const intro=screen.querySelector('.home-intro');if(intro)intro.innerHTML='<div class="workspace-eyebrow">VIRAL / WORKSPACE</div><h1>Chào '+esc(state.user.name)+' 👋</h1><p>Cùng team tạo nên những nội dung thật hay hôm nay.</p>';
 if(intro&&state.user.role!=='director'){const create=document.createElement('button');create.className='workspace-create';create.textContent='+ Tạo nội dung';create.onclick=()=>{go('production');setTimeout(()=>{$('productionForm')?.closest('details')?.setAttribute('open','');$('productionForm')?.scrollIntoView({behavior:'smooth',block:'start'})},250)};intro.append(create);}
 const oldMetrics=screen.querySelector('.home-metrics');if(oldMetrics)oldMetrics.remove();
 const stats=document.createElement('div');stats.className='workspace-stats';stats.innerHTML=[['Tổng công việc',all.length,'Công việc của bạn'],['Đang thực hiện',open.length,'Đang chờ bạn xử lý'],['Đã hoàn thành',done.length,'Đã ghi nhận hoàn thành'],['Quá hạn',late.length,'Cần ưu tiên xử lý']].map(([label,count,hint])=>'<button data-workspace-tasks><small>'+label+'</small><strong>'+count+'</strong><span>'+hint+'</span></button>').join('');intro?.after(stats);stats.querySelectorAll('button').forEach(b=>b.onclick=()=>go('tasks'));
 const layout=document.createElement('div');layout.className='workspace-home-grid';const work=document.createElement('section');work.className='card workspace-attention';work.innerHTML='<div class="row"><h2>Công việc cần chú ý</h2><button class="secondary compact" data-workspace-more>Xem tất cả ↗</button></div>'+open.slice(0,5).map(t=>'<div class="workspace-task-row"><span class="task-dot"></span><div><b>'+esc(t.title)+'</b><small>'+esc(t.production_item?.project||t.category||'Công việc cá nhân')+'</small></div><span class="badge">'+taskLabel(t.status)+'</span></div>').join('')+(open.length?'':'<div class="workspace-empty">Bạn đã xử lý xong các công việc hiện có.</div>');work.querySelector('[data-workspace-more]').onclick=()=>go('tasks');layout.append(work);
 const attendance=screen.querySelector('.attendance-hero');if(attendance){attendance.insertAdjacentHTML('afterbegin',workspaceClockMarkup());layout.append(attendance);}stats.after(layout);updateWorkspaceClock();
};
function workspaceShell(){
 if(!state?.user)return;
 let sidebar=$('workspaceSidebar');if(!sidebar){sidebar=document.createElement('aside');sidebar.id='workspaceSidebar';document.body.prepend(sidebar);}
 const labels=[['home','Trang chủ'],['attendance','Chấm công'],['production','Sản xuất'],['tasks','Công việc'],['utilities','Tiện ích'],['news','Bảng tin']];
 sidebar.innerHTML='<a class="workspace-brand" href="/"><span>V</span><b>VIRAL<br>NETWORK</b></a><div class="workspace-studio"><small>KHÔNG GIAN LÀM VIỆC</small><b>Viral Studio</b><span>Creative team · Đà Nẵng</span></div><nav aria-label="Menu chính">'+labels.map(([id,label])=>'<button data-workspace-tab="'+id+'" class="'+(tab===id?'on':'')+'">'+icon(id)+'<span>'+label+'</span></button>').join('')+'</nav><div class="workspace-sidebar-footer"><span class="live-dot"></span> Không gian làm việc của bạn<br><button data-workspace-profile>Hồ sơ cá nhân ↗</button></div>';
 sidebar.querySelectorAll('[data-workspace-tab]').forEach(b=>b.onclick=()=>go(b.dataset.workspaceTab));sidebar.querySelector('[data-workspace-profile]').onclick=()=>go('profile');
 let top=$('workspaceTopbar');if(!top){top=document.createElement('div');top.id='workspaceTopbar';document.querySelector('.hero').prepend(top);}
 top.innerHTML='<form id="workspaceSearch"><input type="search" aria-label="Tìm kiếm nội dung sản xuất" placeholder="Tìm kiếm nội dung, dự án, nhân viên…"><button class="secondary" aria-label="Tìm kiếm">'+icon('search')+'</button></form><button class="workspace-profile" data-workspace-profile>'+avatar(state.user.id,state.user.name)+'<span><b>'+esc(state.user.name)+'</b><small>'+esc(({director:'Ban giám đốc',leader:'Leader',employee:'Nhân viên'})[state.user.role]||'Nhân viên')+' · '+esc(state.user.department||'')+'</small></span></button>';
 top.querySelector('[data-workspace-profile]').onclick=()=>go('profile');top.querySelector('form').onsubmit=e=>{e.preventDefault();window._productionSearch=top.querySelector('input').value.trim();window._productionSearchDraft=window._productionSearch;go('production')};
 document.body.classList.add('workspace-ready');
}
const workspaceRender=render;
render=function(){workspaceRender();workspaceShell();updateWorkspaceClock();};

if(state?.user)render();
