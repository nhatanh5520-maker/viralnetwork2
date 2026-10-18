const HEADERS = {
 Meetings:['id','title','agenda','start_at','end_at','location','participant_ids','created_by','department','status','created_at'],
 Employees:['telegram_id','name','department','role','active'],
 Attendance:['id','telegram_id','date','check_in','check_out','in_lat','in_lng','out_lat','out_lng','late_minutes','work_minutes'],
 Tasks:['id','assignee_id','title','category','quantity','weight','due_at','status','created_at','completed_at','created_by'],
 Leave:['id','telegram_id','start_date','end_date','reason','status','created_at'],
 Settings:['key','value'],
 Schedule:['id','telegram_id','date','start_time','end_time','note','updated_at','updated_by'],
 Ideas:['id','title','summary','origin_type','creator_id','department','vj_id','suggested_at','status','created_at','updated_at'],
 ProductionItems:['id','project','title','brief','department','origin_idea_id','vj_id','cam_id','editor_id','designer_id','approver_id','shoot_at','deadline','stage','script_url','voice_url','raw_url','final_url','tiktok_url','facebook_url','note','created_by','created_at','updated_at','review_note'],
 Shoots:['id','idea_id','start_at','end_at','location','media_id','status','version','updated_at','updated_by','media_name'],
 ShootAcks:['id','shoot_id','telegram_id','version','response','note','updated_at'],
 OvertimeRequests:['id','telegram_id','date','hours','reason','status','reviewed_by','reviewed_at','created_at'],
 PostComments:['id','post_id','telegram_id','body','created_at'],
 PostLikes:['id','post_id','telegram_id','created_at'],
 Notifications:['id','event_key','telegram_id','message','status','created_at','sent_at','error'],
 Overtime:['id','telegram_id','date','start_at','end_at','minutes','start_lat','start_lng','end_lat','end_lng'],
 Announcements:['id','title','body','audience','created_at','created_by'],
 ProductionTaskLinks:['production_id','role_key','telegram_id','task_id','active','updated_at'],
 ProductionTeam:['production_id','project','title','role','employee_name','responsibility','telegram_id','active','updated_at'],
 Performance:['month','telegram_id','name','work_days','work_minutes','tasks_assigned','tasks_done','on_time_done','weighted_done','weighted_assigned','completion_percent','on_time_percent']
};
const DEFAULTS={office_lat:'',office_lng:'',radius_m:'100',start_time:'08:00',end_time:'17:00',lunch_start:'12:00',lunch_end:'13:30',timezone:'Asia/Ho_Chi_Minh',reminder_chat_id:'',group_chat_id:'',hr_telegram_id:''};
function prop_(key){const v=PropertiesService.getScriptProperties().getProperty(key);if(!v)throw Error('Thiếu Script Property: '+key);return v;}
let V19_BOOK_CACHE,V19_SETTINGS_CACHE,V19_SETTINGS_AT=0;
function book_(){return V19_BOOK_CACHE||(V19_BOOK_CACHE=SpreadsheetApp.openById(prop_('SHEET_ID')));}
function sheet_(n){const s=book_().getSheetByName(n);if(!s)throw Error('Chạy setupTeam20 trước');return s;}
function zone_(){return setting_('timezone')||'Asia/Ho_Chi_Minh';}
function stamp_(d,format){return Utilities.formatDate(d,zone_(),format);}
function cell_(key,value){if(!(value instanceof Date))return value;if(['date','start_date','end_date'].includes(key))return Utilities.formatDate(value,zone_(),'yyyy-MM-dd');if(key==='month')return Utilities.formatDate(value,zone_(),'yyyy-MM');return value.toISOString();}
function dateKey_(value){if(value instanceof Date)return Utilities.formatDate(value,zone_(),'yyyy-MM-dd');return String(value||'').slice(0,10);}
// This cache exists only while constructing a read response. Mutations never reuse it.
let V20_READ_SCOPE=null;
function readScope_(read){if(V20_READ_SCOPE)return read();V20_READ_SCOPE={rows:new Map()};try{return read()}finally{V20_READ_SCOPE=null}}
function rows_(n){if(V20_READ_SCOPE?.rows.has(n))return V20_READ_SCOPE.rows.get(n);const a=sheet_(n).getDataRange().getValues(),h=a.shift(),out=a.filter(r=>r.some(x=>x!=='')).map(r=>Object.fromEntries(h.map((k,i)=>[k,cell_(k,r[i])])));const visible=n==='ProductionItems'?out.filter(x=>String(x.stage)!=='deleted').map(normalizeProductionItem_):out;if(V20_READ_SCOPE)V20_READ_SCOPE.rows.set(n,visible);return visible;}
function setting_(k){if(!V19_SETTINGS_CACHE||Date.now()-V19_SETTINGS_AT>30000){V19_SETTINGS_CACHE=new Map(sheet_('Settings').getDataRange().getValues().map(r=>[String(r[0]),r[1]]));V19_SETTINGS_AT=Date.now()}return ['start_time','end_time','lunch_start','lunch_end'].includes(k)?hrTimeSetting_(V19_SETTINGS_CACHE.get(k),DEFAULTS[k]):String(V19_SETTINGS_CACHE.get(k)??'');}
function setupTeam20(){const b=book_();Object.entries(HEADERS).forEach(([n,h])=>{let s=b.getSheetByName(n)||b.insertSheet(n);if(s.getLastRow()===0){s.appendRow(h);s.setFrozenRows(1);}else if(s.getRange(1,1,1,h.length).getValues()[0].join('|')!==h.join('|'))throw Error('Header '+n+' khác schema V1 mới; sao lưu và chuyển dữ liệu trước khi chạy setup.');});const s=b.getSheetByName('Settings'),existing=new Set(s.getDataRange().getValues().map(r=>String(r[0])));Object.entries(DEFAULTS).forEach(([k,v])=>{if(!existing.has(k))s.appendRow([k,v]);});}
function setupWorkHub(){const b=book_();['Schedule','Announcements','Overtime','Ideas','Shoots','ShootAcks','OvertimeRequests','Notifications','PostComments','PostLikes','ProductionItems','ProductionTaskLinks','Meetings'].forEach(n=>{const h=HEADERS[n],s=b.getSheetByName(n)||b.insertSheet(n);if(s.getLastRow()===0){s.appendRow(h);s.setFrozenRows(1);}else if(s.getRange(1,1,1,h.length).getValues()[0].join('|')!==h.join('|'))throw Error('Header '+n+' không đúng; kiểm tra trước khi sửa.');});const source=b.getSheetByName('Employees').getRange('B2:B100'),rule=SpreadsheetApp.newDataValidation().requireValueInRange(source,true).setAllowInvalid(false).build();b.getSheetByName('Shoots').getRange('K2:K500').setDataValidation(rule);}
function setupProductionWorkflow(){const b=book_(),h=HEADERS.ProductionItems,s=b.getSheetByName('ProductionItems')||b.insertSheet('ProductionItems');if(s.getLastRow()===0){s.appendRow(h);s.setFrozenRows(1);}else if(s.getRange(1,1,1,h.length).getValues()[0].join('|')!==h.join('|'))throw Error('Header ProductionItems không đúng');return 'Đã tạo ProductionItems; dữ liệu cũ được giữ nguyên.';}
function role_(r){r=String(r||'').trim().toLowerCase();if(['director','admin','ban giám đốc','ban giam doc'].includes(r))return 'director';if(['leader','manager'].includes(r))return 'leader';return 'employee';}
function isDirector_(u){return u.role==='director';}
function isLeader_(u){return u.role==='leader'||isDirector_(u);}
function people_(){if(V2016_WRITE_SCOPE?.people)return V2016_WRITE_SCOPE.people;const result=rows_('Employees').filter(e=>String(e.active).toLowerCase()==='true').map(p=>({...p,raw_name:p.name,name:hrLabel_(p)}));if(V2016_WRITE_SCOPE)V2016_WRITE_SCOPE.people=result;return result;}
function visiblePeople_(u){return people_().filter(e=>isDirector_(u)||String(e.department)===u.department);}
function person_(id){return people_().find(e=>String(e.telegram_id)===String(id));}
function canLead_(u,e){return !!e&&(isDirector_(u)||u.role==='leader'&&String(e.department)===u.department&&role_(e.role)==='employee');}
function doGet(e){
 // Index contains static client code. Replace only the HTML attribute; never
 // run the client JavaScript through the HtmlTemplate compiler.
 const raw=HtmlService.createTemplateFromFile('Index').getRawContent();
 const token=String(e&&e.parameter&&e.parameter.launch||'').replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});
 const marker='<?= launchToken ?>';
 if(raw.split(marker).length!==2)throw Error('Index.html không đúng phiên bản: thiếu hoặc trùng vị trí launch token');
 const nav=String(e?.parameter?.review||e?.parameter?.tgWebAppStartParam||'');const safeNav=/^(?:review_[a-f0-9]{24}|task_[A-Za-z0-9_-]{1,480})$/.test(nav)?nav:'';const html=raw.replace(marker,function(){return token;}).replace('data-review-start=""','data-review-start="'+safeNav+'"');
 return HtmlService.createHtmlOutput(html).setTitle('Viral Network · Nội bộ').addMetaTag('viewport','width=device-width, initial-scale=1, viewport-fit=cover');
}
function hex_(bytes){return bytes.map(x=>('0'+(x&255).toString(16)).slice(-2)).join('');}
function auth_(initData){if(typeof initData==='string'&&(initData.startsWith('v1.')||initData.startsWith('v2.')||initData.startsWith('v3.')||initData.startsWith('v4.')))return launchAuth_(initData);if(typeof initData!=='string'||initData.length>8192)throw Error('Mở ứng dụng trong Telegram');const params=initData.split('&').map(p=>{const i=p.indexOf('=');return [decodeURIComponent(p.slice(0,i).replace(/\+/g,' ')),decodeURIComponent(p.slice(i+1).replace(/\+/g,' '))];});const map=Object.fromEntries(params),hash=String(map.hash||'').toLowerCase();if(!/^[a-f0-9]{64}$/.test(hash))throw Error('Thiếu chữ ký Telegram');const date=Number(map.auth_date);if(!Number.isFinite(date)||Math.abs(Date.now()/1000-date)>86400)throw Error('Phiên Telegram hết hạn; mở lại Mini App');const check=params.filter(([k])=>k!=='hash').map(([k,v])=>k+'='+v).sort().join('\n');const secret=Utilities.computeHmacSha256Signature(prop_('BOT_TOKEN'),'WebAppData');const actual=hex_(Utilities.computeHmacSha256Signature(check,secret));let diff=0;for(let i=0;i<64;i++)diff|=actual.charCodeAt(i)^hash.charCodeAt(i);if(diff)throw Error('Chữ ký Telegram không hợp lệ');const user=JSON.parse(map.user||'{}'),id=String(user.id||'');if(!/^\d+$/.test(id))throw Error('Không xác định người dùng');const employee=rows_('Employees').find(r=>String(r.telegram_id)===id&&String(r.active).toLowerCase()==='true');if(!employee)throw Error('Tài khoản chưa được kích hoạt trong Employees');return {id,name:String(employee.name),role:role_(employee.role),department:String(employee.department)};}
function distance_(a,b,c,d){const rad=Math.PI/180,p1=a*rad,p2=c*rad,dp=(c-a)*rad,dl=(d-b)*rad;return 6371000*2*Math.atan2(Math.sqrt(Math.sin(dp/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2),Math.sqrt(1-(Math.sin(dp/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2)));}
function location_(lat,lng,accuracy){lat=Number(lat);lng=Number(lng);accuracy=Number(accuracy);if(!Number.isFinite(lat)||!Number.isFinite(lng)||Math.abs(lat)>90||Math.abs(lng)>180||!Number.isFinite(accuracy)||accuracy>100||accuracy<0)throw Error('GPS chưa đủ chính xác (cần ≤100m)');const a=Number(setting_('office_lat')),b=Number(setting_('office_lng')),radius=Number(setting_('radius_m'));if(!setting_('office_lat')||!setting_('office_lng')||!Number.isFinite(radius)||radius<=0)throw Error('Quản lý cần đặt vị trí văn phòng');const distance=Math.round(distance_(lat,lng,a,b));if(distance>radius)throw Error('Bạn đang cách văn phòng '+distance+'m, giới hạn '+radius+'m');return {lat,lng,distance};}
function snapshot(initData,includeManager){return readScope_(()=>snapshotData_(initData,includeManager))}
function snapshotData_(initData,includeManager){
 const u=auth_(initData),today=stamp_(new Date(),'yyyy-MM-dd'),visible=visiblePeople_(u),ids=new Set(visible.map(e=>String(e.telegram_id))),me=String(u.id),prod=productionSnapshot_(u);
 const ideas=includeManager===false?[]:rows_('Ideas'),allShoots=includeManager===false?[]:rows_('Shoots');
 const visibleIdeas=ideas.filter(x=>isDirector_(u)||u.role==='leader'&&(String(x.department)===u.department||visible.some(e=>String(e.telegram_id)===String(x.vj_id))||allShoots.some(sh=>String(sh.idea_id)===String(x.id)&&visible.some(e=>String(e.telegram_id)===String(sh.media_id))))||String(x.creator_id)===me||String(x.vj_id)===me||allShoots.some(sh=>String(sh.idea_id)===String(x.id)&&String(sh.media_id)===me));
 const ideaIds=new Set(visibleIdeas.map(x=>String(x.id))),shoots=allShoots.filter(x=>ideaIds.has(String(x.idea_id)));
 const out={user:u,today,attendance:attendanceWithShift_(u,rows_('Attendance').find(r=>String(r.telegram_id)===me&&dateKey_(r.date)===today)||null,today),
  tasks:personalWorkTasks_(u),schedule:rows_('Schedule').filter(r=>String(r.telegram_id)===me&&dateKey_(r.date)>=today).sort((a,b)=>dateKey_(a.date).localeCompare(dateKey_(b.date))).slice(0,60),
  announcements:rows_('Announcements').filter(r=>r.audience==='all'||r.audience==='department:'+u.department).slice(-50).reverse(),
  leave:rows_('Leave').filter(r=>String(r.telegram_id)===me).slice(-100),overtimeRequests:rows_('OvertimeRequests').filter(r=>String(r.telegram_id)===me).slice(-100).reverse(),
 ideas:visibleIdeas.slice(-200).reverse(),shoots,shootAcks:includeManager===false?[]:rows_('ShootAcks').filter(r=>shoots.some(s=>String(s.id)===String(r.shoot_id))),
  productionItems:prod.items,homeProduction:prod.home,productionPeople:people_().map(productionPickerPerson_),
  settings:{start:setting_('start_time'),end:setting_('end_time'),lunchStart:setting_('lunch_start'),lunchEnd:setting_('lunch_end'),radius:setting_('radius_m')}};
 out.attendanceAccess=fieldAccess_(u);out.hrApproverId=String(setting_('hr_telegram_id')||'');out.hrLeaveQueue=out.hrApproverId===me?rows_('Leave').filter(r=>String(r.status)==='pending').slice(-100).reverse():[];
 out.taskApproverNames=people_().filter(e=>role_(e.role)==='director'||role_(e.role)==='leader'&&u.role==='employee'&&String(e.department)===u.department).map(e=>String(e.name));
 if(isLeader_(u)&&includeManager!==false){
  const teamTasks=rows_('Tasks').filter(r=>ids.has(String(r.assignee_id)));
  out.employees=visible;out.assignable=visible.filter(e=>isDirector_(u)?role_(e.role)!=='director'&&String(e.telegram_id)!==u.id:role_(e.role)==='employee');
  out.todayAttendance=rows_('Attendance').filter(r=>ids.has(String(r.telegram_id))&&dateKey_(r.date)===today);
  out.todayOvertime=rows_('Overtime').filter(r=>ids.has(String(r.telegram_id))&&dateKey_(r.date)===today);
  out.allTasks=teamTasks.slice(-300).reverse();out.performance=performance_(stamp_(new Date(),'yyyy-MM')).filter(r=>ids.has(String(r.telegram_id)));
  out.leave=rows_('Leave').filter(r=>ids.has(String(r.telegram_id))).slice(-100);
  out.teamSchedule=rows_('Schedule').filter(r=>ids.has(String(r.telegram_id))&&dateKey_(r.date)>=today).slice(0,300);
  out.announcements=rows_('Announcements').filter(r=>isDirector_(u)||r.audience==='all'||r.audience==='department:'+u.department).slice(-100).reverse();
  out.teamOvertimeRequests=rows_('OvertimeRequests').filter(r=>ids.has(String(r.telegram_id))).slice(-100).reverse();
 }
 const postIds=new Set(out.announcements.map(p=>String(p.id)));out.postComments=rows_('PostComments').filter(c=>postIds.has(String(c.post_id))).slice(-500);out.postLikes=rows_('PostLikes').filter(l=>postIds.has(String(l.post_id))).slice(-1000);const names={};people_().forEach(e=>names[String(e.telegram_id)]=String(e.name));out.peopleNames=names;
 Object.assign(out,v20Snapshot_(u));out.meetings=meetingSnapshot_(u);out.meetingPeople=isLeader_(u)?people_().filter(e=>canLead_(u,e)).map(e=>({telegram_id:String(e.telegram_id),name:String(e.name),department:String(e.department)})):[];
 return out;
}
// Keep the first response small for managers. Their team data is loaded after the home screen.
function snapshotCore(initData){return snapshot(initData,false);}
function snapshotHome(initData){return readScope_(()=>snapshotHomeData_(initData))}
function snapshotHomeData_(initData){
 const u=auth_(initData),me=String(u.id),today=stamp_(new Date(),'yyyy-MM-dd'),people=people_(),prod=productionSnapshot_(u,true);
 return {user:u,today,financeAccess:financeAllowed_(u),attendanceAccess:fieldAccess_(u),attendanceShift:fieldEnabled_()?(rows_('Schedule').find(x=>String(x.telegram_id)===me&&dateKey_(x.date)===today)||{start_time:setting_('start_time'),end_time:setting_('end_time')}):null,productionItems:prod.items,homeProduction:prod.home,projects:v20Projects_(),attendance:attendanceWithShift_(u,rows_('Attendance').find(r=>String(r.telegram_id)===me&&dateKey_(r.date)===today)||null,today),tasks:personalWorkTasks_(u),peopleNames:Object.fromEntries(people.map(p=>[String(p.telegram_id),String(p.name)])),settings:{start:setting_('start_time'),end:setting_('end_time'),lunchStart:setting_('lunch_start'),lunchEnd:setting_('lunch_end'),radius:setting_('radius_m')}};
}
function addEmployee(initData,data){
 const u=auth_(initData);if(!isDirector_(u))throw Error('Chỉ Ban giám đốc được thêm nhân sự');
 const id=String(data?.telegram_id||'').trim(),name=String(data?.name||'').trim(),department=String(data?.department||'').trim(),role=String(data?.role||'employee');
 if(!/^\d{5,20}$/.test(id)||!name||name.length>100||!department||department.length>100||!['employee','leader'].includes(role))throw Error('Hãy nhập Telegram ID, tên, phòng ban và vai trò hợp lệ');
 const lock=LockService.getScriptLock();lock.waitLock(15000);
 try{const s=sheet_('Employees'),all=s.getDataRange().getValues();if(all.slice(1).some(r=>String(r[0])===id))throw Error('Telegram ID này đã có trong Employees');s.appendRow([id,name,department,role,true]);SpreadsheetApp.flush();}
 finally{lock.releaseLock()}
 return {ok:true,employee:{telegram_id:id,name,department,role,active:true}};
}
function setHrApprover(initData,id){
 const u=auth_(initData);if(!isDirector_(u))throw Error('Chỉ Ban giám đốc được chọn nhân sự hành chính');id=String(id||'');
 if(!person_(id))throw Error('Hãy chọn tài khoản nhân sự đang hoạt động');
 const s=sheet_('Settings'),a=s.getDataRange().getValues(),i=a.findIndex((r,k)=>k>0&&String(r[0])==='hr_telegram_id');
 if(i>0)s.getRange(i+1,2).setValue(id);else s.appendRow(['hr_telegram_id',id]);V19_SETTINGS_CACHE=null;V19_SETTINGS_AT=0;
 return {ok:true,hrApproverId:id};
}
function avatarBatch(initData,ids){
 auth_(initData);const allowed=new Set(people_().map(p=>String(p.telegram_id)));
 if(!Array.isArray(ids)||ids.length>8)throw Error('Yêu cầu ảnh đại diện không hợp lệ');
 const cache=CacheService.getScriptCache(),token=prop_('BOT_TOKEN'),out={};
 [...new Set(ids.map(String))].forEach(id=>{
  if(!/^\d+$/.test(id)||!allowed.has(id))return;
  const key='v19:avatar:'+id,cached=cache.get(key);
  if(cached!==null){out[id]=cached==='none'?'':cached;return;}
  let photo='';
  try{
   const list=UrlFetchApp.fetch('https://api.telegram.org/bot'+token+'/getUserProfilePhotos',{method:'post',payload:{user_id:id,limit:1},muteHttpExceptions:true});
   if(list.getResponseCode()===200){
    const sizes=JSON.parse(list.getContentText()).result?.photos?.[0]||[],fileId=sizes[0]?.file_id;
    if(fileId){
     const file=UrlFetchApp.fetch('https://api.telegram.org/bot'+token+'/getFile',{method:'post',payload:{file_id:fileId},muteHttpExceptions:true});
     const path=file.getResponseCode()===200?JSON.parse(file.getContentText()).result?.file_path:'';
     if(path){const bytes=UrlFetchApp.fetch('https://api.telegram.org/file/bot'+token+'/'+path,{muteHttpExceptions:true});if(bytes.getResponseCode()===200&&bytes.getContent().length<=50000)photo='data:image/jpeg;base64,'+Utilities.base64Encode(bytes.getContent());}
    }
   }
  }catch(e){console.error('Không tải được avatar '+id);}
  out[id]=photo;
  try{cache.put(key,photo||'none',photo?21600:3600)}catch(e){console.error('Avatar cache: '+e.message)}
 });
 return out;
}
function productionPulse(initData){return visibleProduction_(auth_(initData));}
function teamRows_(){return book_().getSheetByName('ProductionTeam')?rows_('ProductionTeam'):[];}
const V20_TEAM_INDEX=new WeakMap();
function teamIndex_(team){let index=V20_TEAM_INDEX.get(team);if(index)return index;index=new Map();for(const r of team){if(String(r.active).toLowerCase()==='false')continue;const key=String(r.production_id)+'|'+String(r.role);if(!index.has(key))index.set(key,[]);index.get(key).push(String(r.telegram_id))}V20_TEAM_INDEX.set(team,index);return index;}
function teamIds_(x,role,all){const primary=String(x[role==='VJ'?'vj_id':'editor_id']||''),extra=teamIndex_(all||teamRows_()).get(String(x.id)+'|'+role)||[];return [...new Set([primary,...extra].filter(Boolean))];}
function withProductionTeam_(items,team){team=team||teamRows_();return items.map(original=>{const x=normalizeProductionItem_(original);return {...x,vj_ids:teamIds_(x,'VJ',team),editor_ids:teamIds_(x,'Editor',team)}});}
function productionVisibleRows_(u,team){const me=String(u.id),collabs=new Set(team.filter(r=>String(r.telegram_id)===me&&String(r.active).toLowerCase()!=='false').map(r=>String(r.production_id)));return rows_('ProductionItems').map((r,i)=>{const n=Date.parse(String(r.created_at||''));return {r,i,t:Number.isFinite(n)?n:0}}).filter(({r})=>isDirector_(u)||u.role==='leader'&&String(r.department)===u.department||[r.created_by,r.vj_id,r.cam_id,r.editor_id,r.designer_id,r.thumbnail_assignee_id,r.approver_id].some(id=>String(id)===me)||collabs.has(String(r.id))||v20Approvers_(r).content.includes(me)||v20Approvers_(r).media.includes(me)).sort((a,b)=>b.t-a.t||b.i-a.i).map(x=>normalizeProductionItem_(x.r));}
function visibleProduction_(u){const team=teamRows_();return withProductionTeam_(productionVisibleRows_(u,team).slice(0,20),team);}
function productionSnapshot_(u,summaryOnly){const team=teamRows_(),all=productionVisibleRows_(u,team),me=String(u.id),now=Date.now(),upcoming=upcomingShoots_(u,all,team,now),pending=all.filter(x=>(x.stage==='brief'&&x.idea_approval!=='Duyệt')&&(isLeader_(u)||String(x.approver_id)===me)||x.stage==='review'&&((v20Approvers_(x).content.includes(me)&&!x.content_final_approval)||(v20Approvers_(x).media.includes(me)&&!x.media_final_approval)||(x.vj_final_required&&String(x.vj_id)===me&&!x.vj_final_approval)));return {items:summaryOnly?[]:withProductionTeam_(all.slice(0,20),team),home:{pendingCount:pending.length,upcomingCount:upcoming.length,next:upcoming.length?withProductionTeam_([upcoming[0]],team)[0]:null,upcoming:withProductionTeam_(upcoming,team).map(x=>({id:x.id,title:x.title,project:x.project,department:x.department,shoot_at:x.shoot_at,vj_id:x.vj_id,vj_ids:x.vj_ids,cam_id:x.cam_id}))}};}
function productionPage(initData,filters){return readScope_(()=>productionPageData_(initData,filters))}
function productionPageData_(initData,filters){
 const u=auth_(initData),f=filters&&typeof filters==='object'?filters:{},team=teamRows_();
 const project=String(f.project||'').trim().slice(0,120),q=String(f.q||'').trim().toLocaleLowerCase('vi').slice(0,100),status=String(f.status||'all'),day=String(f.day||''),dateType=['all','created_at','shoot_at','editor_received_at','final_completed_at','published_at','deadline'].includes(f.dateType)?f.dateType:'all',approvalKey=String(f.approvalKey||''),approvalStatus=String(f.approvalStatus||'');
 if(!['all','doing','review'].includes(status)||day&&!/^\d{4}-\d{2}-\d{2}$/.test(day)||approvalKey&&!['idea_approval','script_approval','final_approval'].includes(approvalKey)||approvalStatus&&!['pending','Duyệt','Không duyệt'].includes(approvalStatus))throw Error('Bộ lọc sản xuất không hợp lệ');
 const range=productionDateRange_(f.from||day,f.to||day);
 const page=Math.max(0,Math.min(100000,Math.floor(Number(f.page)||0))),all=productionVisibleRows_(u,team),peopleById=q?new Map(people_().map(p=>[String(p.telegram_id),String(p.name)])):new Map();
 const metric=String(f.metric||'all');if(!['all','approved','shooting','waiting','reviewing','edited','published'].includes(metric))throw Error('Thống kê không hợp lệ');
 // Summary and drill-down share the same date/search/status scope. Metric is applied only to the list.
 const scoped=all.filter(x=>productionStatMatches_(x,'all')&&(!q||[x.title,x.project,x.brief,x.note,...teamIds_(x,'VJ',team).map(id=>peopleById.get(id)||''),...teamIds_(x,'Editor',team).map(id=>peopleById.get(id)||''),...[x.cam_id,x.designer_id,x.thumbnail_assignee_id,x.approver_id].map(id=>peopleById.get(String(id))||'')].some(v=>String(v||'').toLocaleLowerCase('vi').includes(q)))&&(status==='all'||status==='review'&&x.stage==='brief'&&!x.idea_approval||status==='doing'&&!['ready','published'].includes(String(x.stage)))&&productionTaskRangeMatches_(x,dateType,range)&&(!approvalKey||!approvalStatus||String(x[approvalKey]||'')===(approvalStatus==='pending'?'':approvalStatus)));
 const stats={};if(f.includeStats!==false)scoped.forEach(x=>{const key=String(x.project||'').trim();if(!stats[key])stats[key]={total:0,shooting:0,waiting:0,edited:0,published:0};const st=stats[key];for(const [field,bucket] of [['total','approved'],['shooting','shooting'],['waiting','waiting'],['edited','edited'],['published','published']])if(productionStatMatches_(x,bucket))st[field]++});
 const matches=scoped.filter(x=>productionStatMatches_(x,metric)&&(!project||String(x.project||'').trim()===project));
 const start=page*20;return {ok:true,items:withProductionTeam_(matches.slice(start,start+20),team),total:matches.length,page,hasMore:start+20<matches.length,stats};
}
function productionScreen(initData,filters){return readScope_(()=>{const u=auth_(initData),people=people_();return {ok:true,user:u,projects:v20Projects_(),peopleNames:Object.fromEntries(people.map(e=>[String(e.telegram_id),String(e.name)])),productionPeople:people.map(productionPickerPerson_),productionPage:productionPageData_(initData,filters)}})}
function productionResult_(id,warning){SpreadsheetApp.flush();return {ok:true,item:withProductionTeam_([productionRow_(id).item])[0],warning:warning||''};}
function productionRequestStatus(initData,requestId){
 const u=auth_(initData),id=String(requestId||'');
 if(!/^[A-Za-z0-9_-]{16,100}$/.test(id))throw Error('Mã yêu cầu không hợp lệ');
 try{const x=productionRow_(id).item;if(String(x.created_by)!==u.id)throw Error('Không có quyền xem nội dung này');return {ok:true,found:true,item:withProductionTeam_([x])[0]};}
 catch(e){if(String(e.message)==='Không thấy nội dung sản xuất')return {ok:true,found:false};throw e}
}
function auditProductionDuplicates(){const s=sheet_('ProductionItems'),all=s.getDataRange().getValues(),h=all[0].map(String),groups={};for(let i=1;i<all.length;i++){const r=all[i],key=[r[h.indexOf('project')],r[h.indexOf('title')],r[h.indexOf('brief')]].map(v=>String(v||'').trim().toLowerCase()).join('|');if(!key.replace(/\|/g,''))continue;(groups[key]||(groups[key]=[])).push({row:i+1,id:String(r[h.indexOf('id')]||''),project:String(r[h.indexOf('project')]||''),title:String(r[h.indexOf('title')]||''),stage:String(r[h.indexOf('stage')]||''),created_at:String(r[h.indexOf('created_at')]||'')})}return Object.values(groups).filter(g=>g.length>1)}
function setupV19Team(){
 const b=book_(),h=HEADERS.ProductionTeam,s=b.getSheetByName('ProductionTeam')||b.insertSheet('ProductionTeam');
 if(!s.getLastRow()){s.appendRow(h);s.setFrozenRows(1)}else if(s.getRange(1,1,1,h.length).getValues()[0].join('|')!==h.join('|'))throw Error('Header ProductionTeam không đúng');
 const existing=new Set(teamRows_().map(r=>[r.production_id,r.role,r.telegram_id].join('|'))),all=rows_('ProductionItems'),byId=new Map(people_().map(p=>[String(p.telegram_id),p]));
 all.forEach(x=>[['VJ','vj_id'],['Editor','editor_id']].forEach(([role,key])=>{const id=String(x[key]||''),p=byId.get(id),sig=[x.id,role,id].join('|');if(p&&!existing.has(sig)){s.appendRow([x.id,x.project,x.title,role,p.name,'Chính',id,true,new Date().toISOString()]);existing.add(sig)}}));
 const names=b.getSheetByName('Employees').getRange('B2:B1000');s.getRange(2,5,Math.max(1,s.getMaxRows()-1)).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInRange(names,true).setAllowInvalid(false).build());
 s.getRange(2,4,Math.max(1,s.getMaxRows()-1)).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['VJ','Editor'],true).setAllowInvalid(false).build());
 s.getRange(2,6,Math.max(1,s.getMaxRows()-1)).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['Chính','Phối hợp'],true).setAllowInvalid(false).build());
 [1,7,8,9].forEach(c=>s.hideColumns(c));const triggers=ScriptApp.getProjectTriggers();if(!triggers.some(t=>t.getHandlerFunction()==='dispatchNotifications'))ScriptApp.newTrigger('dispatchNotifications').timeBased().everyMinutes(1).create();return 'ProductionTeam đã sẵn sàng. Mỗi dòng là một người trong team VJ hoặc Editor; ID được ẩn.';
}
function teamInput_(data,key,primary){const ids=Array.isArray(data[key])?data[key].map(String):[];return [...new Set([primary,...ids].filter(Boolean).map(productionPerson_))];}
function syncExtraTeamTasks_(x,role,ids,u){
 const key=role==='VJ'?'vj_id':'editor_id',primary=String(x[key]||''),want=new Set(ids.filter(id=>String(id)!==primary).map(String)),roleKey=role==='VJ'?'vj_collab':'editor_collab',links=prodLinkRows_().filter(l=>String(l.production_id)===String(x.id)&&String(l.role_key)===roleKey),linkSheet=sheet_('ProductionTaskLinks'),tasks=sheet_('Tasks'),taskRows=tasks.getDataRange().getValues(),now=new Date().toISOString();
 links.forEach(l=>{const id=String(l.telegram_id);if(want.has(id)||String(l.active).toLowerCase()==='false')return;const li=linkSheet.getDataRange().getValues().findIndex((r,i)=>i>0&&String(r[0])===String(x.id)&&String(r[1])===roleKey&&String(r[2])===id);if(li>0)linkSheet.getRange(li+1,5,1,2).setValues([[false,now]]);const ti=taskRows.findIndex((r,i)=>i>0&&String(r[0])===String(l.task_id));if(ti>0&&String(taskRows[ti][7])!=='done')tasks.getRange(ti+1,8).setValue('cancelled')});
 want.forEach(id=>{const link=links.find(l=>String(l.telegram_id)===id),taskId='prod:'+x.id+':'+roleKey+':'+id,due=prodTaskDueValue_(x,key),title=prodTaskTitle_(x,key)+' · phối hợp',category='Sản xuất · '+role+' phối hợp',ti=taskRows.findIndex((r,i)=>i>0&&String(r[0])===taskId);
  if(ti>0){tasks.getRange(ti+1,2,1,7).setValues([[id,title,category,1,1,due,String(taskRows[ti][7])==='cancelled'?'open':taskRows[ti][7]]]);}
  else tasks.appendRow([taskId,id,title,category,1,1,due,'open',now,'',String(u.id||x.created_by||'')]);
  if(link){if(String(link.active).toLowerCase()==='false'){const li=linkSheet.getDataRange().getValues().findIndex((r,i)=>i>0&&String(r[0])===String(x.id)&&String(r[1])===roleKey&&String(r[2])===id);if(li>0)linkSheet.getRange(li+1,5,1,2).setValues([[true,now]])}}
  else linkSheet.appendRow([x.id,roleKey,id,taskId,true,now])
 });
}
function saveTeamRole_(x,role,ids,u){
 const s=book_().getSheetByName('ProductionTeam');if(!s)throw Error('Chạy setupV19Team một lần trước khi phân công nhiều người');
 const primary=String(x[role==='VJ'?'vj_id':'editor_id']||''),unique=[...new Set([primary,...ids].filter(Boolean).map(String))],all=s.getDataRange().getValues();
 for(let i=all.length-1;i>0;i--)if(String(all[i][0])===String(x.id)&&String(all[i][3])===role)s.deleteRow(i+1);
 unique.forEach(id=>{const p=person_(id);s.appendRow([x.id,x.project,x.title,role,p.name,id===primary?'Chính':'Phối hợp',id,true,new Date().toISOString()])});
 syncExtraTeamTasks_(x,role,unique,u);
}
function reconcileTeamFromSheet_(id){
 const f=productionRow_(id),before={...f.item},s=sheet_('ProductionTeam'),a=s.getDataRange().getValues(),now=new Date().toISOString();
 [['VJ',7],['Editor',9]].forEach(([role,col])=>{const entries=a.map((r,i)=>({r,i})).filter(v=>v.i>0&&String(v.r[0])===String(id)&&String(v.r[3])===role&&String(v.r[7]).toLowerCase()!=='false'&&String(v.r[6]||''));let main=entries.find(v=>String(v.r[5])==='Chính')||entries[0];entries.forEach(v=>{const label=v===main?'Chính':'Phối hợp';if(String(v.r[5])!==label)s.getRange(v.i+1,6).setValue(label)});f.sheet.getRange(f.row,col).setValue(main?String(main.r[6]):'')});
 f.sheet.getRange(f.row,24).setValue(now);SpreadsheetApp.flush();const x=productionRow_(id).item,u={id:'sheet',role:'director'};
 syncProductionTasks_(x,before,u);['VJ','Editor'].forEach(role=>syncExtraTeamTasks_(x,role,teamIds_(x,role),u));
}
function onProductionTeamEdit_(e){
 const s=e.range.getSheet(),row=e.range.getRow();if(row<2||e.range.getNumRows()!==1||e.range.getNumColumns()!==1)return;
 try{
  const v=s.getRange(row,1,1,9).getValues()[0],project=String(v[1]||'').trim(),title=String(v[2]||'').trim(),role=String(v[3]||'').trim(),name=String(v[4]||'').trim();
  if(!name&&v[0]){const id=String(v[0]);const removed=String(v[6]||'');s.deleteRow(row);reconcileTeamFromSheet_(id);if(removed)queueNotification_('v19-team-remove:'+id+':'+removed+':'+Date.now(),removed,'⚠️ THAY ĐỔI PHÂN CÔNG\n\nBạn đã được gỡ khỏi team sản xuất. Mở Mini App → Công việc để kiểm tra.');projectTeamSheetNotify_(id);return}
  if(!project||!title||!role||!name)return;
  if(!['VJ','Editor'].includes(role))throw Error('Vai trò phải là VJ hoặc Editor');
  let id=String(v[0]||'');if(!id){const matches=rows_('ProductionItems').filter(x=>String(x.project)===project&&String(x.title)===title);if(matches.length!==1)throw Error('Tên nội dung cần khớp duy nhất trong dự án; nếu trùng, hãy phân công trên Mini App');id=String(matches[0].id)}
  const personId=v17v2PersonByName_(name),x=productionRow_(id).item,responsibility=String(v[5]||'Phối hợp');
  if(!['Chính','Phối hợp'].includes(responsibility))throw Error('Trách nhiệm phải là Chính hoặc Phối hợp');
  const existing=teamRows_().some(r=>String(r.production_id)===id&&String(r.role)===role&&String(r.telegram_id)===personId&&String(r.active).toLowerCase()!=='false'&&String(v[6]||'')!==personId);
  if(existing)throw Error('Người này đã có trong team '+role);
  s.getRange(row,1).setValue(id);s.getRange(row,2,1,2).setValues([[x.project,x.title]]);s.getRange(row,6,1,4).setValues([[responsibility,personId,true,new Date().toISOString()]]);
  if(responsibility==='Chính'){const all=s.getDataRange().getValues();all.forEach((r,i)=>{if(i>0&&i+1!==row&&String(r[0])===id&&String(r[3])===role&&String(r[5])==='Chính')s.getRange(i+1,6).setValue('Phối hợp')})}
  reconcileTeamFromSheet_(id);notifyProductionTeamEdited_(productionRow_(id).item,personId);projectTeamSheetNotify_(id);e.range.clearNote();
 }catch(err){e.range.setValue(e.oldValue||'');e.range.setNote('Không thể cập nhật team: '+err.message);s.getParent().toast(String(err.message),'ProductionTeam',8);console.error(err)}
}
function snapshotManager(initData){return readScope_(()=>snapshotManagerData_(initData))}
function snapshotManagerData_(initData){
 const u=auth_(initData);manager_(u);const visible=visiblePeople_(u),ids=new Set(visible.map(e=>String(e.telegram_id))),today=stamp_(new Date(),'yyyy-MM-dd'),teamTasks=rows_('Tasks').filter(t=>ids.has(String(t.assignee_id)));
 const announcements=rows_('Announcements').filter(r=>isDirector_(u)||r.audience==='all'||r.audience==='department:'+u.department).slice(-100).reverse(),postIds=new Set(announcements.map(p=>String(p.id)));
 return JSON.parse(JSON.stringify({employees:visible,assignable:visible.filter(e=>isDirector_(u)?role_(e.role)!=='director'&&String(e.telegram_id)!==u.id:role_(e.role)==='employee'),todayAttendance:rows_('Attendance').filter(r=>ids.has(String(r.telegram_id))&&dateKey_(r.date)===today),todayOvertime:rows_('Overtime').filter(r=>ids.has(String(r.telegram_id))&&dateKey_(r.date)===today),allTasks:teamTasks.slice(-300).reverse(),performance:performance_(stamp_(new Date(),'yyyy-MM')).filter(r=>ids.has(String(r.telegram_id))),teamSchedule:rows_('Schedule').filter(r=>ids.has(String(r.telegram_id))&&dateKey_(r.date)>=today).slice(0,300),teamOvertimeRequests:rows_('OvertimeRequests').filter(r=>ids.has(String(r.telegram_id))).slice(-100).reverse(),leave:rows_('Leave').filter(r=>ids.has(String(r.telegram_id))).slice(-100),announcements,postComments:rows_('PostComments').filter(c=>postIds.has(String(c.post_id))).slice(-500),postLikes:rows_('PostLikes').filter(l=>postIds.has(String(l.post_id))).slice(-1000)}));
}
function reviewQueue(initData,scope){return readScope_(()=>{
 const u=auth_(initData),personal=scope!=='team';if(!personal)manager_(u);
 const people=new Map(people_().map(p=>[String(p.telegram_id),p])),links=prodLinkRows_(),items=rows_('ProductionItems').map(normalizeProductionItem_),productionTaskIds=new Set(links.map(l=>String(l.task_id)));
 const generic=rows_('Tasks').filter(t=>String(t.status)==='review'&&!String(t.id).startsWith('prod:')&&!productionTaskIds.has(String(t.id))&&String(t.assignee_id)!==String(u.id)&&canLead_(u,people.get(String(t.assignee_id)))&&(!personal||personalTaskReview_(u,t,links,items))).slice(-100).reverse().map(t=>({id:String(t.id),title:String(t.title),assignee_id:String(t.assignee_id),assignee_name:String(people.get(String(t.assignee_id))?.name||''),due_at:String(t.due_at||'')}));
 const production=[];for(const x of items){if(!x.id||String(x.stage)==='deleted')continue;for(const kind of ['idea','content','media','vj']){if((kind!=='vj'||x.vj_final_required&&x.vj_id)&&tgApprovalOpen_(x,kind)&&tgApprovalIds_(x,kind).includes(String(u.id)))production.push({id:'approval:'+x.id+':'+kind,production_id:String(x.id),kind,title:String(x.title||''),project:String(x.project||''),assignee_name:String(people.get(String(x.created_by))?.name||''),due_at:String(x.deadline||''),created_at:String(kind==='idea'?x.created_at:x.updated_at||x.created_at||'')})}}
 production.sort((a,b)=>(Date.parse(a.created_at)||0)-(Date.parse(b.created_at)||0)||a.id.localeCompare(b.id));return [...operationalWorkQueue_(u),...production,...generic];
})}
function openProductionApprovalTask(initData,id,kind){if(!['idea','content','media','vj'].includes(String(kind)))throw Error('Mục duyệt không hợp lệ');const u=auth_(initData),x=productionRow_(id).item;if(!tgApprovalIds_(x,kind).includes(String(u.id)))throw Error('Bạn chưa được phân công duyệt mục này');return readScope_(()=>({...approvalTargetData_(u,id),kind:kind==='idea'?'idea':'final'}))}

function manager_(u){if(!isLeader_(u))throw Error('Chỉ quản lý được thực hiện thao tác này');}
function validDate_(value){const s=String(value||'');if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||isNaN(Date.parse(s+'T00:00:00Z'))||new Date(s+'T00:00:00Z').toISOString().slice(0,10)!==s)throw Error('Ngày không hợp lệ');return s;}
function validTime_(value){const s=String(value||'');if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(s))throw Error('Giờ không hợp lệ');return s;}
function saveSchedule(initData,id,date,start,end,note){const u=auth_(initData);manager_(u);id=String(id||'');date=validDate_(date);start=validTime_(start);end=validTime_(end);note=String(note||'').trim();if(start>=end||note.length>200)throw Error('Ca làm cần giờ kết thúc sau giờ bắt đầu; ghi chú tối đa 200 ký tự');if(!canLead_(u,person_(id)))throw Error('Không có quyền xếp lịch cho người này');const lock=LockService.getScriptLock();lock.waitLock(15000);try{const s=sheet_('Schedule'),all=s.getDataRange().getValues();let row=-1;for(let i=1;i<all.length;i++)if(String(all[i][1])===id&&dateKey_(all[i][2])===date){row=i+1;break;}const vals=[Utilities.getUuid(),id,date,start,end,note,new Date().toISOString(),u.id];if(row>0){vals[0]=all[row-1][0];s.getRange(row,1,1,vals.length).setValues([vals]);}else s.appendRow(vals);return snapshot(initData);}finally{lock.releaseLock();}}
function removeSchedule(initData,id){const u=auth_(initData);manager_(u);const lock=LockService.getScriptLock();lock.waitLock(15000);try{const s=sheet_('Schedule'),data=s.getDataRange().getValues();for(let i=1;i<data.length;i++)if(String(data[i][0])===String(id)){if(!canLead_(u,person_(data[i][1])))throw Error('Không có quyền xóa ca này');s.deleteRow(i+1);return snapshot(initData);}throw Error('Không thấy ca làm');}finally{lock.releaseLock();}}
function publishAnnouncement(initData,title,body,audience,imageUrl){const u=auth_(initData);title=String(title||'').trim();body=String(body||'').trim();audience=String(audience||'');const departments=new Set(people_().map(e=>'department:'+String(e.department)));if(!isDirector_(u)&&audience!=='all'&&audience!=='department:'+u.department)throw Error('Bạn chỉ có thể đăng cho toàn công ty hoặc phòng ban của mình');if(!title||title.length>120||!body||body.length>2000||audience!=='all'&&!departments.has(audience))throw Error('Thông báo không hợp lệ');imageUrl=productionUrl_(imageUrl);const postSheet=sheet_('Announcements');const heads=postSheet.getRange(1,1,1,postSheet.getLastColumn()).getValues()[0].map(String);if(!heads.includes('image_url'))postSheet.getRange(1,postSheet.getLastColumn()+1).setValue('image_url');const id=Utilities.getUuid(),createdAt=new Date().toISOString();postSheet.appendRow([id,title,body,audience,createdAt,u.id,imageUrl]);let warning='';if(audience==='all')try{queueNewsGroupNotification_({id,title,body,audience,image_url:imageUrl},u)}catch(error){console.error('Thông báo Bảng tin: '+error.message);warning='Bài viết đã lưu; thông báo nhóm tổng cần kiểm tra: '+error.message;}const result=snapshot(initData);if(warning)result.warning=warning;return result;}
function queueNewsGroupNotification_(post,u){
 if(String(post.audience)!=='all')return false;
 const chat=String(setting_('group_chat_id')||'').trim();
 if(!/^-\d{6,20}$/.test(chat))throw Error('Điền group_chat_id của nhóm tổng trong Settings');
 const key='news:'+String(post.id)+':'+chat,lock=LockService.getScriptLock();lock.waitLock(5000);
 try{
  const sh=sheet_('Notifications'),existing=sh.getDataRange().getValues().slice(1);
  if(existing.some(row=>String(row[1])===key))return true;
  const body='📣 ĐÃ ĐĂNG TIN\nNgười đăng: '+String(u.name||'Nhân viên')+'\nTiêu đề: '+String(post.title)+'\n\n'+String(post.body)+(post.image_url?'\n\nẢnh đính kèm: '+String(post.image_url):'')+'\n\n👉 Mở Mini App → Bảng tin để xem và bình luận.';
  sh.appendRow([Utilities.getUuid(),key,chat,body,'pending',new Date().toISOString(),'','']);
  return true;
 }finally{lock.releaseLock()}
}

function removeAnnouncement(initData,id){const u=auth_(initData);const s=sheet_('Announcements'),a=s.getDataRange().getValues();for(let i=1;i<a.length;i++)if(String(a[i][0])===String(id)){if(!isDirector_(u)&&String(a[i][5])!==u.id)throw Error('Chỉ tác giả hoặc Ban giám đốc được xóa');s.deleteRow(i+1);return snapshot(initData);}throw Error('Không thấy thông báo');}
function attendanceRow_(sheet,row){const h=fieldEnabled_()?sheet.getRange(1,1,1,sheet.getLastColumn()).getValues()[0].map(String):HEADERS.Attendance,raw=sheet.getRange(row,1,1,h.length).getValues()[0];return Object.fromEntries(h.map((key,i)=>[key,cell_(key,raw[i])]));}
function attendanceWithShift_(u,row,date,selectedShift){
 if(!row)return null;
 const own=selectedShift===undefined?rows_('Schedule').find(r=>String(r.telegram_id)===String(u.id)&&dateKey_(r.date)===date):selectedShift;
 const start=String(own?.start_time||setting_('start_time')),end=String(own?.end_time||setting_('end_time'));
 const minutes=t=>{const d=new Date(t);return Number(stamp_(d,'HH'))*60+Number(stamp_(d,'mm'))};
 const scheduled=t=>{const parts=String(t).split(':').map(Number);return parts[0]*60+parts[1]};
 return {...(fieldEnabled_()?fieldDecorate_(row):row),shift_start:start,shift_end:end,in_offset_minutes:row.check_in?minutes(row.check_in)-scheduled(start):null,out_offset_minutes:row.check_out?minutes(row.check_out)-scheduled(end):null};
}
function attendanceStatus(initData){const u=auth_(initData),date=stamp_(new Date(),'yyyy-MM-dd'),a=rows_('Attendance').find(r=>String(r.telegram_id)===u.id&&dateKey_(r.date)===date)||null;return {attendance:attendanceWithShift_(u,a,date)};}
function managerAttendanceDay(initData,date){
 const u=auth_(initData);manager_(u);date=validDate_(date);
 if(date>stamp_(new Date(),'yyyy-MM-dd'))throw Error('Không thể xem ngày trong tương lai');
 const allowed=new Set(visiblePeople_(u).map(p=>String(p.telegram_id))),shifts=new Map(rows_('Schedule').filter(r=>dateKey_(r.date)===date&&allowed.has(String(r.telegram_id))).map(r=>[String(r.telegram_id),r]));
 const items=rows_('Attendance').filter(r=>dateKey_(r.date)===date&&allowed.has(String(r.telegram_id))).map(r=>attendanceWithShift_({id:String(r.telegram_id)},r,date,shifts.get(String(r.telegram_id))||null));
 return {ok:true,date,items};
}
function attendance(initData,kind,lat,lng,accuracy){const u=auth_(initData);if(!['in','out'].includes(kind))throw Error('Thao tác không hợp lệ');const pos=location_(lat,lng,accuracy),lock=LockService.getScriptLock();lock.waitLock(15000);try{const s=sheet_('Attendance'),date=stamp_(new Date(),'yyyy-MM-dd'),now=new Date(),iso=now.toISOString(),all=s.getDataRange().getValues();let index=-1;for(let i=1;i<all.length;i++)if(String(all[i][1])===u.id&&dateKey_(all[i][2])===date){index=i+1;break;}if(kind==='in'){if(index>0)return {ok:true,attendance:attendanceWithShift_(u,attendanceRow_(s,index),date),already:true};const ownShift=rows_('Schedule').find(r=>String(r.telegram_id)===u.id&&dateKey_(r.date)===date),[h,m]=String(ownShift?.start_time||setting_('start_time')).split(':').map(Number),mins=Number(stamp_(now,'HH'))*60+Number(stamp_(now,'mm'));s.appendRow([Utilities.getUuid(),u.id,date,iso,'',pos.lat,pos.lng,'','',Math.max(0,mins-h*60-m),0]);index=s.getLastRow();}else{if(index<0)throw Error('Bạn chưa check-in');if(all[index-1][4])return {ok:true,attendance:attendanceWithShift_(u,attendanceRow_(s,index),date),already:true};const checkIn=new Date(all[index-1][3]);if(isNaN(checkIn.getTime()))throw Error('Giờ vào không hợp lệ');s.getRange(index,5).setValue(iso);s.getRange(index,8,1,2).setValues([[pos.lat,pos.lng]]);let worked=Math.max(0,Math.round((now-checkIn)/60000));const day=stamp_(now,'yyyy-MM-dd'),ls=new Date(day+'T'+(setting_('lunch_start')||'12:00')+':00+07:00'),le=new Date(day+'T'+(setting_('lunch_end')||'13:30')+':00+07:00');const overlap=Math.max(0,Math.min(now,le)-Math.max(checkIn,ls));worked=Math.max(0,worked-Math.round(overlap/60000));s.getRange(index,11).setValue(worked);}SpreadsheetApp.flush();return {ok:true,attendance:attendanceWithShift_(u,attendanceRow_(s,index),date)};}finally{lock.releaseLock();}}
function overtime(initData,kind,lat,lng,accuracy){const u=auth_(initData);if(!['start','end'].includes(kind))throw Error('Thao tác không hợp lệ');const pos=location_(lat,lng,accuracy),lock=LockService.getScriptLock();lock.waitLock(15000);try{const date=stamp_(new Date(),'yyyy-MM-dd'),regular=rows_('Attendance').find(r=>String(r.telegram_id)===u.id&&dateKey_(r.date)===date);if(!regular?.check_out)throw Error('Cần Check-out ca chính trước khi bắt đầu tăng ca');const s=sheet_('Overtime'),a=s.getDataRange().getValues();let row=-1;for(let i=1;i<a.length;i++)if(String(a[i][1])===u.id&&dateKey_(a[i][2])===date){row=i+1;break;}const now=new Date(),iso=now.toISOString();if(kind==='start'){if(row>0)throw Error('Hôm nay đã bắt đầu tăng ca');if(now<=new Date(regular.check_out))throw Error('Giờ tăng ca phải sau Check-out');s.appendRow([Utilities.getUuid(),u.id,date,iso,'',0,pos.lat,pos.lng,'','']);}else{if(row<0)throw Error('Bạn chưa bắt đầu tăng ca');if(a[row-1][4])throw Error('Hôm nay đã kết thúc tăng ca');const start=new Date(a[row-1][3]);if(isNaN(start.getTime())||now<start)throw Error('Giờ tăng ca không hợp lệ');s.getRange(row,5,1,2).setValues([[iso,Math.round((now-start)/60000)]]);s.getRange(row,9,1,2).setValues([[pos.lat,pos.lng]]);}return snapshot(initData);}finally{lock.releaseLock();}}
function createTask(initData,assignee,title,category,quantity,weight,dueAt){productionWritable_(auth_(initData));const u=auth_(initData);if(!isLeader_(u))throw Error('Không có quyền giao việc');assignee=String(assignee);if(!canLead_(u,person_(assignee))||assignee===u.id||role_(person_(assignee)?.role)==='director')throw Error('Bạn không có quyền giao việc cho người này');title=String(title||'').trim();category=String(category||'').trim();quantity=Number(quantity);weight=Number(weight);const due=new Date(dueAt);if(!title||title.length>160||category.length>60||!Number.isInteger(quantity)||quantity<1||quantity>1000||!Number.isFinite(weight)||weight<=0||weight>100||isNaN(due.getTime()))throw Error('Thông tin công việc không hợp lệ');const id=Utilities.getUuid();sheet_('Tasks').appendRow([id,assignee,title,category,quantity,weight,due.toISOString(),'open',new Date().toISOString(),'',u.id]);queueNotification_('task:'+id+':'+assignee,assignee,'Bạn được giao việc: '+title+'. Hạn '+stamp_(due,'dd/MM/yyyy HH:mm')+'. Mở Mini App để xem.');try{dispatchNotifications();}catch(e){console.error(e)}return snapshot(initData);}
function submitTask(initData,id){productionWritable_(auth_(initData));const u=auth_(initData),lock=LockService.getScriptLock();lock.waitLock(15000);try{const s=sheet_('Tasks'),a=s.getDataRange().getValues();for(let i=1;i<a.length;i++)if(String(a[i][0])===String(id)){if(String(a[i][1])!==u.id)throw Error('Chỉ người được giao mới gửi hoàn thành');if(!['open','in_progress','revision'].includes(String(a[i][7])))throw Error('Công việc không ở trạng thái có thể gửi duyệt');s.getRange(i+1,8).setValue('review');return snapshot(initData);}throw Error('Không tìm thấy công việc');}finally{lock.releaseLock();}}
function completeTask(initData,id){return submitTask(initData,id);}
function reviewTask(initData,id,decision){productionWritable_(auth_(initData));const u=auth_(initData);manager_(u);if(!['done','revision'].includes(decision))throw Error('Trạng thái không hợp lệ');const s=sheet_('Tasks'),a=s.getDataRange().getValues(),lock=LockService.getScriptLock();lock.waitLock(15000);try{for(let i=1;i<a.length;i++)if(String(a[i][0])===String(id)){const person=person_(a[i][1]);if(!canLead_(u,person)||String(person?.telegram_id)===u.id)throw Error('Không có quyền duyệt việc này');if(String(a[i][7])!=='review')throw Error('Việc chưa được gửi duyệt');s.getRange(i+1,8).setValue(decision);if(decision==='done')s.getRange(i+1,10).setValue(new Date().toISOString());return snapshotCore(initData);}throw Error('Không thấy công việc');}finally{lock.releaseLock();}}
function leaveResult_(row){return Object.fromEntries(HEADERS.Leave.map((key,i)=>[key,cell_(key,row[i])]));}
function requestLeave(initData,start,end,reason,requestId){
 const u=auth_(initData),hr=String(setting_('hr_telegram_id')||'');
 start=validDate_(start);end=validDate_(end);reason=String(reason||'').trim();
 if(end<start||!reason||reason.length>300)throw Error('Đơn nghỉ không hợp lệ');
 if(!person_(hr))throw Error('Chưa có tài khoản hành chính nhân sự nhận đơn. Hãy nhờ Ban giám đốc chọn người phụ trách trong mục Nhân sự.');
 requestId=String(requestId||'');if(!/^[A-Za-z0-9_-]{16,100}$/.test(requestId))throw Error('Mã yêu cầu không hợp lệ');
 const id=u.id+':leave:'+requestId,lock=LockService.getScriptLock();lock.waitLock(15000);let row;
 try{const s=sheet_('Leave'),all=s.getDataRange().getValues(),existing=all.find((r,i)=>i>0&&String(r[0])===id);
  if(existing){if(String(existing[1])!==u.id||dateKey_(existing[2])!==start||dateKey_(existing[3])!==end||String(existing[4])!==reason)throw Error('Mã đơn đã được dùng cho nội dung khác');row=existing;}
  else{row=[id,u.id,start,end,reason,'pending',new Date().toISOString()];s.appendRow(row);SpreadsheetApp.flush()}
 }finally{lock.releaseLock()}
 let warning='';try{queueNotification_('leave:'+id+':'+hr,hr,'📩 ĐƠN XIN NGHỈ MỚI\nNhân viên: '+u.name+'\nTừ ngày: '+start+'\nĐến ngày: '+end+'\nLý do: '+reason+'\nMở Mini App → Xin nghỉ để duyệt hoặc từ chối.')}catch(e){console.error(e);warning='Đơn đã lưu; thông báo đến hành chính cần kiểm tra.'}
 return {ok:true,leaveRecord:leaveResult_(row),warning};
}
function reviewLeave(initData,id,status){
 const u=auth_(initData),hr=String(setting_('hr_telegram_id')||'');
 if(u.id!==hr||!['approved','rejected'].includes(status))throw Error('Chỉ người phụ trách hành chính nhân sự được xử lý đơn');
 const lock=LockService.getScriptLock();lock.waitLock(15000);let row;
 try{const s=sheet_('Leave'),a=s.getDataRange().getValues(),i=a.findIndex((r,k)=>k>0&&String(r[0])===String(id));if(i<0)throw Error('Không thấy đơn nghỉ');
  if(String(a[i][5])!=='pending')throw Error('Đơn đã xử lý');s.getRange(i+1,6).setValue(status);const reviewerCol=s.getRange(1,1,1,s.getLastColumn()).getValues()[0].indexOf('reviewed_by')+1;if(reviewerCol)s.getRange(i+1,reviewerCol).setValue(u.id);SpreadsheetApp.flush();row=[...a[i]];row[5]=status;
 }finally{lock.releaseLock()}
 let warning='',delivery='pending';try{const key='leave-result:'+id+':'+status;queueNotification_(key,String(row[1]),'📋 ĐƠN XIN NGHỈ '+(status==='approved'?'ĐÃ DUYỆT':'KHÔNG ĐƯỢC DUYỆT')+'\nTừ ngày: '+dateKey_(row[2])+'\nĐến ngày: '+dateKey_(row[3])+'\nNgười xử lý: '+u.name+'.');const result=dispatchNotificationKey_(key);delivery=result.sent?'sent':'pending';if(!result.sent)warning='Đơn đã xử lý, nhưng tin Telegram chưa gửi được. Kiểm tra Notifications.error và nhờ nhân viên nhắn /start cho bot.'}catch(e){console.error(e);warning='Đơn đã xử lý; thông báo cho nhân viên cần kiểm tra.'}
 return {ok:true,leaveRecord:leaveResult_(row),delivery,warning:warning||'Đã xử lý đơn và gửi thông báo Telegram cho nhân viên.'};
}
function postVisible_(u,post){return isDirector_(u)||post.audience==='all'||post.audience==='department:'+u.department;}
function addComment(initData,postId,body){const u=auth_(initData),post=rows_('Announcements').find(p=>String(p.id)===String(postId));if(!post||!postVisible_(u,post))throw Error('Không thấy bài đăng');body=String(body||'').trim();if(!body||body.length>1000)throw Error('Bình luận cần 1–1000 ký tự');sheet_('PostComments').appendRow([Utilities.getUuid(),String(postId),u.id,body,new Date().toISOString()]);return snapshot(initData);}
function removeComment(initData,id){const u=auth_(initData),s=sheet_('PostComments'),all=s.getDataRange().getValues();for(let i=1;i<all.length;i++)if(String(all[i][0])===String(id)){if(String(all[i][2])!==u.id&&!isDirector_(u))throw Error('Không có quyền xóa bình luận');s.deleteRow(i+1);return snapshot(initData);}throw Error('Không thấy bình luận');}
function toggleLike(initData,postId){const u=auth_(initData),post=rows_('Announcements').find(p=>String(p.id)===String(postId));if(!post||!postVisible_(u,post))throw Error('Không thấy bài đăng');const lock=LockService.getScriptLock();lock.waitLock(15000);try{const s=sheet_('PostLikes'),a=s.getDataRange().getValues();for(let i=1;i<a.length;i++)if(String(a[i][1])===String(postId)&&String(a[i][2])===u.id){s.deleteRow(i+1);return snapshot(initData);}s.appendRow([Utilities.getUuid(),String(postId),u.id,new Date().toISOString()]);return snapshot(initData);}finally{lock.releaseLock();}}
function requestOvertime(initData,date,hours,reason){const u=auth_(initData);if(isDirector_(u))throw Error('Ban giám đốc không cần đề xuất tăng ca trong quy trình này');date=validDate_(date);hours=Number(hours);reason=String(reason||'').trim();if(!Number.isFinite(hours)||hours<0.5||hours>8||hours*2%1!==0||!reason||reason.length>300)throw Error('Chọn 0,5–8 giờ và nhập lý do');const s=sheet_('OvertimeRequests'),all=s.getDataRange().getValues();if(all.slice(1).some(r=>String(r[1])===u.id&&dateKey_(r[2])===date&&String(r[5])!=='rejected'))throw Error('Ngày này đã có đề xuất tăng ca');s.appendRow([Utilities.getUuid(),u.id,date,hours,reason,'pending','','',new Date().toISOString()]);return snapshot(initData);}
function reviewOvertime(initData,id,status){const u=auth_(initData);manager_(u);if(!['approved','rejected'].includes(status))throw Error('Trạng thái không hợp lệ');const s=sheet_('OvertimeRequests'),a=s.getDataRange().getValues();for(let i=1;i<a.length;i++)if(String(a[i][0])===String(id)){if(!canLead_(u,person_(a[i][1]))||String(a[i][1])===u.id)throw Error('Không có quyền duyệt tăng ca này');if(String(a[i][5])!=='pending')throw Error('Đề xuất đã được xử lý');s.getRange(i+1,6,1,3).setValues([[status,u.id,new Date().toISOString()]]);return snapshot(initData);}throw Error('Không thấy đề xuất');}
function createIdea(initData,title,summary,origin,suggestedAt){productionWritable_(auth_(initData));const u=auth_(initData);title=String(title||'').trim();summary=String(summary||'').trim();origin=String(origin||'');let when='';if(suggestedAt){const d=new Date(suggestedAt);if(isNaN(d.getTime()))throw Error('Ngày đề xuất không hợp lệ');when=d.toISOString();}if(!title||title.length>160||!summary||summary.length>2000||!['content','self'].includes(origin))throw Error('Thông tin idea không hợp lệ');const now=new Date().toISOString();const id=Utilities.getUuid();sheet_('Ideas').appendRow([id,title,summary,origin,u.id,u.department,origin==='self'?u.id:'',when,'new',now,now]);people_().filter(e=>role_(e.role)==='leader'&&String(e.department)===u.department).forEach(e=>queueNotification_('idea:'+id+':'+e.telegram_id,String(e.telegram_id),'Idea mới: '+title+' do '+u.name+' đề xuất. Mở Mini App để xem.'));try{dispatchNotifications();}catch(e){console.error(e)}return snapshot(initData);}
function scheduleIdea(initData,ideaId,vjId,mediaId,startAt,endAt,location){productionWritable_(auth_(initData));const u=auth_(initData);manager_(u);const idea=rows_('Ideas').find(x=>String(x.id)===String(ideaId));if(!idea||!isDirector_(u)&&String(idea.department)!==u.department)throw Error('Không có quyền lên lịch idea này');const vj=person_(vjId),media=mediaId?person_(mediaId):null;if(!vj||mediaId&&!media)throw Error('VJ/KOL hoặc Media không hợp lệ');if(media&&String(media.telegram_id)===String(vj.telegram_id))throw Error('VJ/KOL và Media cần là hai người khác nhau');const start=new Date(startAt),end=new Date(endAt);location=String(location||'').trim();if(isNaN(start.getTime())||isNaN(end.getTime())||end<=start||end-start>12*3600000||start<Date.now()-300000||!location||location.length>200)throw Error('Lịch quay không hợp lệ');const lock=LockService.getScriptLock();lock.waitLock(15000);let result;try{const sh=sheet_('Shoots'),a=sh.getDataRange().getValues(),oldIndex=a.findIndex((r,i)=>i>0&&String(r[1])===String(ideaId));const old=oldIndex>0?a[oldIndex]:null;for(let i=1;i<a.length;i++){if(i===oldIndex||String(a[i][6])!=='scheduled')continue;const otherStart=new Date(a[i][2]),otherEnd=new Date(a[i][3]);if(start<otherEnd&&end>otherStart){const otherIdea=rows_('Ideas').find(x=>String(x.id)===String(a[i][1]));const otherVj=String(otherIdea?.vj_id||'');if([String(vjId),String(mediaId)].filter(Boolean).some(id=>id===String(a[i][5])||id===otherVj))throw Error('VJ/KOL hoặc Media đã có lịch quay trùng giờ');}}const version=old?Number(old[7]||0)+1:1,id=old?String(old[0]):Utilities.getUuid(),now=new Date().toISOString();const vals=[id,String(ideaId),start.toISOString(),end.toISOString(),location,String(mediaId||''),'scheduled',version,now,u.id,media?String(media.name):''];if(old)sh.getRange(oldIndex+1,1,1,vals.length).setValues([vals]);else sh.appendRow(vals);const ideas=sheet_('Ideas'),ir=ideas.getDataRange().getValues().findIndex((r,i)=>i>0&&String(r[0])===String(ideaId));ideas.getRange(ir+1,7).setValue(String(vjId));ideas.getRange(ir+1,9,1,2).setValues([['scheduled',now]]);const recipients=new Set([String(vjId),String(mediaId||''),String(idea.creator_id)].filter(Boolean));const prev=new Set([String(idea.vj_id||''),String(old?.[5]||'')].filter(Boolean));const time=stamp_(start,'dd/MM/yyyy HH:mm');for(const who of recipients)queueNotification_('shoot:'+id+':'+version+':'+who,who,'Lịch quay: '+idea.title+' · '+time+' · '+location+'. Mở Mini App để xem chi tiết.');for(const who of prev)if(!recipients.has(who))queueNotification_('shoot-remove:'+id+':'+version+':'+who,who,'Bạn không còn được phân vào lịch quay '+idea.title+' ngày '+time+'.');result=snapshot(initData);}finally{lock.releaseLock();}try{dispatchNotifications();}catch(e){console.error(e)}return result;}
function cancelShoot(initData,shootId){productionWritable_(auth_(initData));const u=auth_(initData);manager_(u);const s=sheet_('Shoots'),all=s.getDataRange().getValues(),row=all.findIndex((r,i)=>i>0&&String(r[0])===String(shootId));if(row<0)throw Error('Không thấy lịch quay');const sh=all[row],idea=rows_('Ideas').find(x=>String(x.id)===String(sh[1]));if(!idea||!isDirector_(u)&&String(idea.department)!==u.department)throw Error('Không có quyền hủy lịch');if(String(sh[6])!=='scheduled')throw Error('Lịch đã hủy');const version=Number(sh[7]||0)+1;s.getRange(row+1,7,1,4).setValues([['cancelled',version,new Date().toISOString(),u.id]]);sheet_('Ideas').getDataRange().getValues().forEach((r,i)=>{if(i>0&&String(r[0])===String(idea.id))sheet_('Ideas').getRange(i+1,9,1,2).setValues([['new',new Date().toISOString()]])});new Set([String(idea.creator_id),String(idea.vj_id||''),String(sh[5]||'')].filter(Boolean)).forEach(id=>queueNotification_('shoot-cancel:'+shootId+':'+version+':'+id,id,'Lịch quay '+idea.title+' đã bị hủy. Mở Mini App để xem.'));try{dispatchNotifications();}catch(e){console.error(e)}return snapshot(initData);}
function respondShoot(initData,shootId,response,note){productionWritable_(auth_(initData));const u=auth_(initData),sh=rows_('Shoots').find(x=>String(x.id)===String(shootId));if(!sh||sh.status!=='scheduled'||!['ack','conflict'].includes(response))throw Error('Lịch quay không hợp lệ');const idea=rows_('Ideas').find(x=>String(x.id)===String(sh.idea_id));if(String(sh.media_id)!==u.id&&String(idea?.vj_id)!==u.id)throw Error('Bạn không có trong lịch quay');note=String(note||'').trim();if(response==='conflict'&&!note||note.length>300)throw Error('Hãy ghi lý do trùng lịch (tối đa 300 ký tự)');const s=sheet_('ShootAcks'),a=s.getDataRange().getValues(),row=a.findIndex((r,i)=>i>0&&String(r[1])===String(shootId)&&String(r[2])===u.id),vals=[row>0?a[row][0]:Utilities.getUuid(),String(shootId),u.id,Number(sh.version),response,note,new Date().toISOString()];if(row>0)s.getRange(row+1,1,1,vals.length).setValues([vals]);else s.appendRow(vals);if(response==='conflict'){const leads=person_(sh.updated_by)?[String(sh.updated_by)]:people_().filter(e=>role_(e.role)==='leader'&&String(e.department)===String(idea.department)).map(e=>String(e.telegram_id));leads.filter(id=>id!==u.id).forEach(id=>queueNotification_('conflict:'+shootId+':'+sh.version+':'+u.id+':'+id,id,u.name+' báo trùng lịch quay '+idea.title+': '+note));}try{dispatchNotifications();}catch(e){console.error(e)}return snapshot(initData);}
function productionRowData_(id){
 const s=sheet_('ProductionItems'),wanted=String(id);
 if(typeof s.getLastRow!=='function'){const a=s.getDataRange().getValues(),h=a[0].map(String),i=a.findIndex((r,k)=>k>0&&String(r[0])===wanted);if(i<0)throw Error('Không thấy nội dung sản xuất');return {sheet:s,row:i+1,item:Object.fromEntries(h.map((key,k)=>[key,cell_(key,a[i][k])]))};}
 const last=s.getLastRow();
 if(last<2)throw Error('Không thấy nội dung sản xuất');
 const ids=s.getRange(2,1,last-1,1);let row=0;
 // Read physical ID cells, including rows hidden by a Sheet filter.
 const idValues=ids.getValues(),index=idValues.findIndex(r=>String(r[0])===wanted);if(index>=0)row=index+2;
 if(!row)throw Error('Không thấy nội dung sản xuất');
 const h=productionHeaders_(s),values=s.getRange(row,1,1,h.length).getValues()[0];
 return {sheet:s,row,item:Object.fromEntries(h.map((key,k)=>[key,cell_(key,values[k])]))};
}
function productionColumn_(f,key){const h=f.sheet.getRange(1,1,1,f.sheet.getLastColumn()).getValues()[0].map(String),i=h.indexOf(key);if(i<0)throw Error('Thiếu cột '+key+' trong ProductionItems; hãy chạy setupV20');return i+1;}
function productionSet_(f,key,value){f.sheet.getRange(f.row,productionColumn_(f,key)).setValue(value);}
function syncProductionNames_(f){const h=productionHeaders_(f.sheet),people=new Map(people_().map(p=>[String(p.telegram_id),String(p.name)]));Object.entries(V17V2_NAME_COLS).forEach(([name,idKey])=>{const col=h.indexOf(name)+1;if(col>0){const value=people.get(String(f.item[idKey]||''))||'';if(!V2016_WRITE_SCOPE||String(f.item[name]||'')!==value)f.sheet.getRange(f.row,col).setValue(value)}});}
function productionLead_(u,x){return isDirector_(u)||u.role==='leader'&&String(x.department)===u.department;}
function canAssignProduction_(u,x){return productionLead_(u,x)||String(x.created_by)===String(u.id)||v20Approvers_(x).content.includes(String(u.id))}
function productionNotify_(x,kind,message,recipients){if(kind==='review')return;const now=Date.now();new Set(recipients.map(String).filter(Boolean)).forEach(id=>queueNotification_('production:'+x.id+':'+kind+':'+now+':'+id,id,message+' · '+x.title+'. Mở Mini App để xem.'));if(['review','published','published-toggle'].includes(kind))try{projectNotify_(x.id,kind)}catch(err){console.error(err)}}
function productionUrl_(value){const v=String(value||'').trim();if(v.length>1000||v&&!/^https:\/\/[^\s]+$/i.test(v))throw Error('Link cần bắt đầu bằng https:// và không có khoảng trắng');return v;}
function productionPerson_(id){if(!id)return '';if(!person_(id))throw Error('Người được chọn chưa có tài khoản đang hoạt động');return String(id);}
// V20.26.1: explicit physical row write; never depend on filtered append/search.
// Caller holds the script lock, including duplicate detection and this write.
function productionInsertRow_(s,values){
 const row=s.getLastRow()+1;
 if(typeof s.getMaxRows==='function'&&row>s.getMaxRows())s.insertRowsAfter(s.getMaxRows(),row-s.getMaxRows());
 const target=s.getRange(row,1,1,values.length);target.setValues([values]);SpreadsheetApp.flush();
 if(String(s.getRange(row,1).getValues()[0][0])!==String(values[0]))throw Error('Không xác minh được ID Idea sau khi lưu; kiểm tra ProductionItems trước khi gửi lại.');
 return row;
}
function createProductionItemData_(initData,data){productionWritable_(auth_(initData));
 const u=auth_(initData);if(!data||typeof data!=='object')throw Error('Thiếu thông tin');
 const project=String(data.project||'').trim(),title=String(data.title||'').trim(),brief=String(data.brief||'').trim(),department=u.department;
 if(!project||project.length>100||!title||title.length>160||!brief||brief.length>2000)throw Error('Cần nhập dự án, tiêu đề và Brief');
 validateProductionAssignments_(teamInput_(data,'vj_ids',data.vj_id),data.cam_id,teamInput_(data,'editor_ids',data.editor_id),'');v20ApproverInput_(data);const lead=isLeader_(u),people=['vj_id','cam_id','editor_id','designer_id','approver_id'].map(k=>productionPerson_(data[k]));
 const vjIds=teamInput_(data,'vj_ids',people[0]),editorIds=teamInput_(data,'editor_ids',people[2]),thumbnailAssignee='';
 if(vjIds.length&&!people[0])people[0]=vjIds[0];if(editorIds.length&&!people[2])people[2]=editorIds[0];data.vj_id=people[0];data.vj_final_required=false;if(!people[0])throw Error('Cần chọn VJ/KOL phụ trách nội dung');
 if((vjIds.length>1||editorIds.length>1)&&!book_().getSheetByName('ProductionTeam'))throw Error('Chạy setupV19Team một lần trước khi phân công team');
 if(people[4]&&people[4]!==people[0]&&!isLeader_({role:role_(person_(people[4]).role)}))throw Error('Người duyệt cần là Leader hoặc Ban giám đốc');
 const budget=productionBudget_(data.estimated_cost_vnd),shoot=data.shoot_at?new Date(data.shoot_at):null,due=null;
 if(shoot&&isNaN(shoot.getTime())||due&&isNaN(due.getTime()))throw Error('Ngày giờ không hợp lệ');
 const requested=String(data.request_id||'');if(requested&&!/^[A-Za-z0-9_-]{16,100}$/.test(requested))throw Error('Mã yêu cầu không hợp lệ');
 const id=requested||Utilities.getUuid(),lock=LockService.getScriptLock();lock.waitLock(15000);let x,created=false;
 try{
  const s=sheet_('ProductionItems'),a=s.getDataRange().getValues(),existing=a.findIndex((r,i)=>i>0&&String(r[0])===id);
  if(existing>0){x=productionRow_(id).item;if(String(x.created_by)!==u.id||String(x.project)!==project||String(x.title)!==title||String(x.brief)!==brief)throw Error('Mã yêu cầu đã dùng cho nội dung khác');}
  else{const now=new Date().toISOString(),row=[id,project,title,brief,department,'',...people,shoot?shoot.toISOString():'',due?due.toISOString():'','brief','','','','','','',String(data.note||'').slice(0,1000),u.id,now,now,''];productionInsertRow_(s,row);const f=productionRow_(id);productionExtraValue_(f,'production_metrics_version','2');productionExtraValue_(f,'vj_final_required',false);if(budget!=='')productionExtraValue_(f,'estimated_cost_vnd',budget);v20Set_(f,'thumbnail_assignee_id',thumbnailAssignee);syncProductionNames_(f);x=productionRow_(id).item;created=true;}
 }finally{lock.releaseLock()}
 let warning='';if(created)try{
  v20SaveApprovers_(id,data,u);syncProductionTasks_(x,{},u);
  if(book_().getSheetByName('ProductionTeam')){saveTeamRole_(x,'VJ',vjIds,u);saveTeamRole_(x,'Editor',editorIds,u)}
  const recipients=people_().filter(e=>role_(e.role)==='leader'&&String(e.department)===department).map(e=>e.telegram_id);
  productionNotify_(x,'new','Có nội dung sản xuất mới cần kiểm tra phân công',recipients);
  notifyProductionAssignments_(x,{},u);
  projectNotify_(id,'created');
 }catch(e){console.error(e);warning='Nội dung đã tạo; cần kiểm tra đồng bộ task hoặc thông báo.'}
 return productionResult_(id,warning);
}
function updateProductionIdea(initData,id,title,brief,requestId){productionWritable_(auth_(initData));
 const u=auth_(initData);title=String(title||'').trim();brief=String(brief||'').trim();requestId=String(requestId||'');
 if(!title||title.length>160||!brief||brief.length>2000||!/^[A-Za-z0-9_-]{16,100}$/.test(requestId))throw Error('Nội dung Idea hoặc mã yêu cầu không hợp lệ');
 const lock=LockService.getScriptLock();lock.waitLock(15000);let before,changed=false;
 try{
  const f=productionRow_(id);before=f.item;
  if(String(before.stage)!=='brief'||String(before.created_by)!==u.id&&!productionLead_(u,before))throw Error('Chỉ người tạo hoặc Leader được sửa Idea trước khi duyệt');
  if(String(before.title)===title&&String(before.brief)===brief)return productionResult_(id);
  const history=sheet_('ProductionIdeaHistory'),all=history.getDataRange().getValues();
  if(all.slice(1).some(r=>String(r[10])===requestId&&String(r[1])===String(id)))return productionResult_(id);
  const version=all.slice(1).filter(r=>String(r[1])===String(id)).length+1,now=new Date().toISOString();
  tgRevisionBump_(f,'idea');history.appendRow([Utilities.getUuid(),String(id),version,String(before.title),String(before.brief),title,brief,u.id,now,String(before.idea_approval_feedback||''),requestId]);
  f.sheet.getRange(f.row,3,1,2).setValues([[title,brief]]);f.sheet.getRange(f.row,approvalColumn_(f.sheet,'idea_approval')).setValue('');
  v20Set_(f,'idea_approval_feedback','');v20Set_(f,'idea_approval_reviewer','');v20Set_(f,'idea_approval_reviewed_at','');f.sheet.getRange(f.row,24).setValue(now);changed=true;
 }finally{lock.releaseLock()}
 let warning='';if(changed){
  const fresh=productionRow_(id).item;
  try{syncProductionTasks_(fresh,before,u)}catch(err){console.error(err);warning='Idea đã lưu; cần kiểm tra đồng bộ Công việc.'}
  try{const key='idea:resubmit:'+id+':'+requestId;queueNotification_(key,String(before.approver_id),'💡 IDEA ĐÃ GỬI DUYỆT LẠI\nDự án: '+before.project+'\nNội dung: '+title+'\nNgười sửa: '+u.name+'\n👉 Mở Mini App → Sản xuất để duyệt.');projectNotify_(id,'idea_resubmitted')}catch(err){console.error(err);warning='Idea đã lưu; cần kiểm tra thông báo.'}
 }
 return productionResult_(id,warning);
}
function productionIdeaHistory(initData,id){
 const u=auth_(initData),x=productionRow_(id).item,team=withProductionTeam_([x])[0];
 if(String(x.created_by)!==u.id&&String(x.approver_id)!==u.id&&!productionLead_(u,x)&&![...team.vj_ids,...team.editor_ids,x.cam_id,x.designer_id,x.thumbnail_assignee_id].map(String).includes(u.id))throw Error('Bạn không có quyền xem lịch sử Idea');
 return {ok:true,items:rows_('ProductionIdeaHistory').filter(r=>String(r.production_id)===String(id)).slice(-10).reverse()};
}
function assignProductionData_(initData,id,data){productionWritable_(auth_(initData));
 const u=auth_(initData);if(!data||typeof data!=='object')throw Error('Thiếu thông tin');v20ApproverInput_(data);const people=['vj_id','cam_id','editor_id','designer_id','approver_id'].map(k=>productionPerson_(data[k]));
 const vjIds=teamInput_(data,'vj_ids',people[0]),editorIds=teamInput_(data,'editor_ids',people[2]),thumbnailAssignee='';
 if(vjIds.length&&!people[0])people[0]=vjIds[0];if(editorIds.length&&!people[2])people[2]=editorIds[0];data.vj_id=people[0];data.vj_final_required=false;if(!people[0])throw Error('Cần chọn VJ/KOL phụ trách nội dung');
 if((vjIds.length>1||editorIds.length>1)&&!book_().getSheetByName('ProductionTeam'))throw Error('Chạy setupV19Team một lần trước khi phân công team');
 if(!people[0]||!people[4])throw Error('Cần chọn VJ/KOL và người duyệt');
 if(people[4]!==people[0]&&!['leader','director'].includes(role_(person_(people[4]).role)))throw Error('Người duyệt cần là Leader, Ban giám đốc hoặc VJ/KOL của nội dung');
 const budget=productionBudget_(data.estimated_cost_vnd),shoot=data.shoot_at?new Date(data.shoot_at):null,due=null;
 if(shoot&&isNaN(shoot.getTime())||due&&isNaN(due.getTime()))throw Error('Ngày giờ không hợp lệ');
 const lock=LockService.getScriptLock();lock.waitLock(15000);let before,item;
 try{const f=productionRow_(id);before={...withProductionTeam_([f.item])[0]};if(!canAssignProduction_(u,before))throw Error('Chỉ người tạo Idea hoặc Leader Content phụ trách mới được sửa phân công');if(before.stage==='published')throw Error('Nội dung đã đăng');v20CheckApproverChange_(before,data);validateProductionAssignments_(vjIds,people[1],editorIds,thumbnailAssignee,before);if(!Object.prototype.hasOwnProperty.call(data,'designer_id'))people[3]=String(before.designer_id||'');
 if(Object.prototype.hasOwnProperty.call(data,'estimated_cost_vnd'))productionExtraValue_(f,'estimated_cost_vnd',budget);f.sheet.getRange(f.row,7,1,7).setValues([[...people,shoot?shoot.toISOString():'',String(before.deadline||'')]]);f.sheet.getRange(f.row,24).setValue(new Date().toISOString());const fresh=productionRow_(id);syncProductionNames_(fresh);SpreadsheetApp.flush();item=productionRow_(id).item;
 }finally{lock.releaseLock()}
 let warning='';try{syncProductionTasks_(item,before,u);if(book_().getSheetByName('ProductionTeam')){saveTeamRole_(item,'VJ',vjIds,u);saveTeamRole_(item,'Editor',editorIds,u)}v20SaveApprovers_(id,data,u);notifyProductionAssignments_(item,before,u);if(projectAssignmentChanged_(before,productionRow_(id).item))projectNotify_(id,'assignment')}catch(e){console.error(e);warning='Đã lưu phân công; cần kiểm tra task hoặc thông báo.'}return productionResult_(id,warning);
}
function handoffProductionAssets(initData,id){productionWritable_(auth_(initData));
 const u=auth_(initData),lock=LockService.getScriptLock();lock.waitLock(15000);let x,changed=false,first=false,signature;
 try{
  const f=productionRow_(id);x=f.item;
  if(!['script','shoot','edit'].includes(String(x.stage)))throw Error('Chỉ bàn giao tư liệu ở bước quay hoặc dựng');
  if(!productionLead_(u,x)&&String(x.cam_id)!==u.id&&!teamIds_(x,'VJ').includes(u.id))throw Error('Bạn không phụ trách bàn giao tư liệu');
  if(!productionAssetsReady_(x)||!String(x.script_url||'').trim()||!String(x.raw_url||'').trim())throw Error('Cần duyệt Idea và lưu link kịch bản, Raw trước khi bàn giao');
  const editors=teamIds_(x,'Editor');if(!editors.length)throw Error('Cần phân công ít nhất một Editor');
  signature=productionHandoffSignature_(x);
  if(String(x.stage)==='edit'&&String(x.editor_handoff_signature||'')===signature){syncEditDeadlineTasks_(x);return productionResult_(id);}
  first=['script','shoot'].includes(String(x.stage));if(first){startEditDeadline_(f);f.sheet.getRange(f.row,14).setValue('edit');}syncEditDeadlineTasks_(f.item);
  performanceMilestone_(f,'shoot',[...teamIds_(x,'VJ'),x.cam_id]);v20Set_(f,'editor_handoff_signature',signature);v20Set_(f,'editor_handoff_at',new Date().toISOString());v20Set_(f,'editor_handoff_by',u.id);f.sheet.getRange(f.row,24).setValue(new Date().toISOString());changed=true;
 }finally{lock.releaseLock()}
 let warning='',delivery='sent';if(changed)try{
  const fresh=productionRow_(id).item,event=first?'handoff':'handoff_update',message=(first?'🎬 TƯ LIỆU ĐÃ BÀN GIAO':'🔄 TƯ LIỆU ĐƯỢC CẬP NHẬT')+'\nDự án: '+x.project+'\nNội dung: '+x.title+'\nKịch bản: '+fresh.script_url+'\nRaw: '+fresh.raw_url+(fresh.voice_url?'\nVoice: '+fresh.voice_url:'\nVoice: Không có')+(fresh.deadline?'\nHạn nộp Video Final: '+stamp_(new Date(fresh.deadline),'dd/MM/yyyy HH:mm'):'')+'\n👉 Mở Mini App → Công việc để dựng video.';
  const keys=[];
  [...new Set(teamIds_(fresh,'Editor'))].forEach(who=>{const key='production:'+id+':'+event+':'+fresh.updated_at+':'+who;queueNotification_(key,who,message);keys.push(key)});
  try{if(projectNotify_(id,event))keys.push('project:'+id+':'+event+':'+String(fresh.updated_at||''))}catch(err){console.error(err);delivery='pending'}
  for(const key of keys){try{if(!dispatchNotificationKey_(key).sent)delivery='pending'}catch(err){console.error(err);delivery='pending'}}
  if(delivery==='pending')warning='Đã lưu bàn giao; một số thông báo đang chờ gửi lại.';
 }catch(err){console.error(err);delivery='pending';warning='Đã lưu bàn giao; cần kiểm tra hàng đợi thông báo.'}
 const result=productionResult_(id,warning);result.delivery=delivery;return result;
}
function updateProductionThumbnail(initData,id,url){throw Error('Chức năng thumbnail đã được bỏ khỏi app');
 const u=auth_(initData),link=productionUrl_(url);if(!link)throw Error('Hãy nhập link thumbnail HTTPS');const lock=LockService.getScriptLock();lock.waitLock(15000);let x,changed=false;
 try{const f=productionRow_(id);x=f.item;if(!x.thumbnail_assignee_id)throw Error('Chưa phân công người làm thumbnail');if(!productionLead_(u,x)&&String(x.thumbnail_assignee_id)!==u.id)throw Error('Chỉ người làm thumbnail hoặc Leader được gửi thumbnail');if(!['edit','review','revision','ready'].includes(String(x.stage)))throw Error('Chưa đến bước làm thumbnail');if(String(x.thumbnail_url||'')===link&&x.thumbnail_approval!=='Không duyệt')return productionResult_(id);for(const [k,v] of Object.entries({thumbnail_url:link,thumbnail_approval:'',thumbnail_feedback:'',thumbnail_reviewer:'',thumbnail_reviewed_at:'',thumbnail_not_required:false}))v20Set_(f,k,v);f.sheet.getRange(f.row,24).setValue(new Date().toISOString());changed=true;
 }finally{lock.releaseLock()}
 if(changed){const fresh=productionRow_(id).item;try{v20Approvers_(fresh).media.forEach(who=>queueNotification_('thumbnail:submit:'+id+':'+fresh.updated_at+':'+who,who,'🖼️ THUMBNAIL CHỜ DUYỆT\nDự án: '+fresh.project+'\nVideo: '+fresh.title+'\nLink: '+link+'\n👉 Mini App → Sản xuất'));projectNotify_(id,'thumbnail_submitted')}catch(err){console.error(err)}}return productionResult_(id);
}
function decideProductionThumbnail(initData,id,decision,note){throw Error('Chức năng thumbnail đã được bỏ khỏi app');
 const u=auth_(initData);if(!['Duyệt','Không duyệt'].includes(decision))throw Error('Quyết định không hợp lệ');note=String(note||'').trim();if(decision==='Không duyệt'&&!note||note.length>1000)throw Error('Không duyệt cần ghi rõ lý do');const lock=LockService.getScriptLock();lock.waitLock(15000);let x;
 try{const f=productionRow_(id);x=f.item;if(!v20Approvers_(x).media.includes(u.id))throw Error('Chỉ Leader Media được phân công mới duyệt thumbnail');if(!x.thumbnail_assignee_id||!x.thumbnail_url||x.thumbnail_not_required||x.stage==='published')throw Error('Thumbnail chưa sẵn sàng để duyệt');if(x.thumbnail_approval==='Duyệt')throw Error('Thumbnail đã duyệt');if(decision==='Duyệt')performanceMilestone_(f,'thumbnail',[x.thumbnail_assignee_id]);for(const [k,v] of Object.entries({thumbnail_approval:decision,thumbnail_feedback:note,thumbnail_reviewer:u.id,thumbnail_reviewed_at:new Date().toISOString()}))v20Set_(f,k,v);f.sheet.getRange(f.row,24).setValue(new Date().toISOString());
 }finally{lock.releaseLock()}const fresh=productionRow_(id).item;try{queueNotification_('thumbnail:review:'+id+':'+fresh.updated_at,String(fresh.thumbnail_assignee_id),'🖼️ THUMBNAIL '+(decision==='Duyệt'?'ĐÃ DUYỆT':'CẦN SỬA')+'\nDự án: '+fresh.project+'\nVideo: '+fresh.title+(note?'\nPhản hồi: '+note:'')+'\n👉 Mini App → Sản xuất');projectNotify_(id,'thumbnail_review',decision,note)}catch(err){console.error(err)}return productionResult_(id);
}
function skipProductionThumbnail(initData,id,note){throw Error('Chức năng thumbnail đã được bỏ khỏi app');
 const u=auth_(initData);note=String(note||'').trim();if(!note||note.length>300)throw Error('Hãy ghi lý do không cần thumbnail');const lock=LockService.getScriptLock();lock.waitLock(15000);try{const f=productionRow_(id),x=f.item;if(!productionLead_(u,x)&&!v20Approvers_(x).media.includes(u.id))throw Error('Leader phụ trách mới được chọn Không cần thumbnail');if(x.stage==='published')throw Error('Video đã đăng');for(const [k,v] of Object.entries({thumbnail_not_required:true,thumbnail_approval:'',thumbnail_feedback:note,thumbnail_reviewer:u.id,thumbnail_reviewed_at:new Date().toISOString()}))v20Set_(f,k,v);f.sheet.getRange(f.row,24).setValue(new Date().toISOString())}finally{lock.releaseLock()}try{projectNotify_(id,'thumbnail_skipped','Không cần thumbnail',note)}catch(err){console.error(err)}return productionResult_(id);
}
function staffProductionWorkload(initData){return readScope_(()=>staffProductionWorkloadData_(initData))}
function staffProductionWorkloadData_(initData){
 auth_(initData);const team=teamRows_(),items=rows_('ProductionItems'),people=people_(),hr=String(setting_('hr_telegram_id')||''),accountant=String(setting_('accountant_telegram_id')||''),out={};
 const add=(id,role,x,status,active)=>{id=String(id||'');if(!id)return;const key=id+'|'+role,row=out[key]||(out[key]={id,role,active:0,waiting:0,items:[]});row[active?'active':'waiting']++;if(row.items.length<30)row.items.push({id:String(x.id),title:String(x.title||''),project:String(x.project||''),deadline:String(x.deadline||''),status})};
 for(const x of items){const stage=String(normalizeProductionItem_(x).stage||'');if(['published','deleted'].includes(stage))continue;if(x.cam_id&&stage==='shoot')add(x.cam_id,'cam',x,'Chờ quay / bàn giao Raw',true);for(const id of teamIds_(x,'VJ',team)){if(['brief','script'].includes(stage))add(id,'vj',x,'Idea / Kịch bản',true);else if(stage==='shoot')add(id,'vj',x,'Chờ quay / bàn giao Raw',true);else if(stage==='review'&&x.vj_final_required&&String(x.vj_id)===id&&x.vj_final_approval!=='Duyệt')add(id,'vj',x,'Chờ VJ duyệt Final',true)}for(const id of teamIds_(x,'Editor',team)){if(stage==='edit')add(id,'editor',x,'Đang dựng',true);else if(stage==='revision')add(id,'editor',x,'Cần sửa Final',true);else if(stage==='review')add(id,'editor',x,'Final chờ duyệt',false)}}
 const inferred={};for(const p of people){const id=String(p.telegram_id),dept=String(p.department||'').toLocaleLowerCase('vi'),roles=productionCapabilities_(p);if(/vj|kol|talent/.test(dept))roles.push('vj');if(/content|nội dung/.test(dept))roles.push('content');if(/cam|kỹ thuật|quay/.test(dept))roles.push('cam');if(/edit|dựng/.test(dept))roles.push('editor');if(/design|thiết kế|đồ họa/.test(dept))roles.push('designer');if(id===hr||/nhân sự|hành chính|\bhr\b/.test(dept))roles.push('hr');if(id===accountant||/kế toán/.test(dept))roles.push('accountant');if(role_(p.role)==='leader')roles.push('leader');if(role_(p.role)==='director')roles.push('director');for(const work of Object.values(out))if(work.id===id&&!roles.includes(work.role))roles.push(work.role);inferred[id]=roles}
 return {ok:true,roles:inferred,workloads:Object.values(out)};
}
function advanceProduction(initData,id,next){productionWritable_(auth_(initData));
 if(next==='edit')return handoffProductionAssets(initData,id);
 if(next==='review'||next==='ready')return completeProductionFinal(initData,id);
 throw Error('Đã bỏ bước gửi duyệt Final. Lưu link Video Final để hoàn tất dựng.');
}

function productionAssetsReady_(x){return String(x.idea_approval)==='Duyệt'&&['script','shoot','edit','review','revision','ready','published'].includes(String(x.stage))}
function productionScriptReady_(x){return String(x.idea_approval)==='Duyệt'&&['script','shoot','edit','review','revision','ready','published'].includes(String(x.stage))}
function productionFinalReady_(x){return productionAssetsReady_(x)&&!!String(x.raw_url||'').trim()&&['edit','review','revision','ready','published'].includes(String(x.stage))}
function saveProductionAsset(initData,id,field,value){productionWritable_(auth_(initData));
 const u=auth_(initData),fields={script_url:15,voice_url:16,raw_url:17,final_url:18,detailed_script_url:0};
 if(!Object.prototype.hasOwnProperty.call(fields,field))throw Error('Loại file không hợp lệ');
 value=productionUrl_(value);if(!value)throw Error('Cần nhập link file');
 const lock=LockService.getScriptLock();lock.waitLock(15000);let changedFinal=false;
 try{
  const f=productionRow_(id),x=f.item,lead=productionLead_(u,x),shootCrew=[x.cam_id,...teamIds_(x,'VJ')].some(v=>String(v)===String(u.id)),editor=teamIds_(x,'Editor').some(v=>String(v)===String(u.id));
  if(!lead&&!(field==='final_url'?editor:shootCrew||['script_url','detailed_script_url'].includes(field)&&String(x.created_by)===String(u.id)))throw Error('Bạn không được cập nhật file này');
  if(x.stage==='published'&&!lead)throw Error('Nội dung đã đăng');
  if(field==='final_url'&&!productionFinalReady_(x))throw Error('Cần duyệt Idea và bàn giao Raw cho Editor trước khi lưu Final');
  if(field!=='final_url'&&!productionAssetsReady_(x))throw Error('Cần duyệt Idea trước khi thêm hoặc sửa tư liệu');
  changedFinal=field==='final_url'&&String(x.final_url||'')!==value;
  if(field==='detailed_script_url')productionExtraValue_(f,field,value);else f.sheet.getRange(f.row,fields[field]).setValue(value);
  if(field==='final_url'){
   if(changedFinal){productionExtraValue_(f,'editor_progress',0);productionExtraValue_(f,'editor_progress_at','');productionExtraValue_(f,'editor_progress_by','');productionExtraValue_(f,'final_delivery_status','draft');productionExtraValue_(f,'final_completed_at','');}
   // Keep past review decisions/feedback intact. They no longer control the workflow.
   if(changedFinal){productionSet_(f,'stage','edit');if(x.stage==='published'){productionSet_(f,'published_status','unpublished');productionSet_(f,'published_at','');productionSet_(f,'published_by','');}}
  }
  f.sheet.getRange(f.row,24).setValue(new Date().toISOString());SpreadsheetApp.flush();
 }finally{lock.releaseLock()}
 return productionResult_(id,field==='final_url'&&changedFinal?'Đã lưu link Final. Bấm Gửi hoàn thành để bàn giao thành phẩm.':'');
}
function completeProductionFinal(initData,id){productionWritable_(auth_(initData));return createWriteScope_(()=>completeProductionFinalData_(initData,id));}
function completeProductionFinalData_(initData,id){productionWritable_(auth_(initData));
 const u=auth_(initData),lock=LockService.getScriptLock();lock.waitLock(15000);let changed=false;
 try{const f=productionRow_(id),x=f.item;
  if(!productionLead_(u,x)&&!teamIds_(x,'Editor').includes(String(u.id)))throw Error('Chỉ Editor được phân công hoặc quản lý phụ trách được gửi hoàn thành');
  if(x.stage==='published')return productionResult_(id);
  if(!productionFinalReady_(x)||!String(x.final_url||'').trim())throw Error('Cần duyệt Idea, bàn giao Raw và lưu link Final trước');
  if(productionFinalApproved_(x)&&x.stage==='ready'){changed=x.final_delivery_status==='completed';}else{
  productionExtraValue_(f,'editor_progress',100);productionExtraValue_(f,'editor_progress_at',new Date().toISOString());productionExtraValue_(f,'editor_progress_by',String(u.id));productionExtraValue_(f,'final_delivery_status','completed');productionExtraValue_(f,'final_completed_at',new Date().toISOString());
  productionSet_(f,'stage','ready');productionSet_(f,'updated_at',new Date().toISOString());
  performanceMilestone_(f,'edit',teamIds_(x,'Editor'));performanceMilestone_(f,'approved',[x.created_by,x.cam_id,...teamIds_(x,'VJ'),...teamIds_(x,'Editor')]);SpreadsheetApp.flush();changed=true;}
 }finally{lock.releaseLock()}
 let warning='';if(changed)try{queueProductionFinalSaved_(productionRow_(id).item,u)}catch(e){console.error(e);warning='Đã gửi hoàn thành; cần kiểm tra hàng đợi thông báo.'}
 return productionResult_(id,warning);
}
function queueProductionFinalSaved_(x,u){
 const key='final-saved:'+x.id+':'+String(x.final_completed_at||x.updated_at),body='🎬 VIDEO ĐÃ EDIT XONG\nDự án: '+x.project+'\nNội dung: '+x.title+'\nNgười cập nhật: '+u.name+'\nVideo Final: '+x.final_url+'\nTrạng thái: Chưa đăng\n👉 Mở Mini App → Sản xuất để xem hoặc đánh dấu Đã đăng.';
 for(const id of [...new Set([x.created_by,x.cam_id,...teamIds_(x,'VJ'),...teamIds_(x,'Editor')].map(String).filter(Boolean))])queueNotification_(key+':'+id,id,body);
 const chat=projectChatId_(x.project);if(chat){const sh=sheet_('Notifications');if(!sh.getDataRange().getValues().slice(1).some(r=>String(r[1])===key+':group'))sh.appendRow([Utilities.getUuid(),key+':group',chat,body,'pending',new Date().toISOString(),'','']);}
}

function reviewProduction(initData,id,decision,note){productionWritable_(auth_(initData));return decideV20Final(initData,id,decision==='ready'?'Duyệt':'Không duyệt',note);}
function setProductionPublished(initData,id,published){productionWritable_(auth_(initData));const u=auth_(initData),lock=LockService.getScriptLock();lock.waitLock(15000);let x;try{const f=productionRow_(id);x=f.item;if(!productionLead_(u,x)&&String(x.approver_id)!==u.id&&String(x.vj_id)!==u.id&&!teamIds_(x,'Editor').includes(String(u.id)))throw Error('Bạn không được thay đổi trạng thái đăng');['stage','published_status','published_at','published_by','updated_at'].forEach(k=>productionColumn_(f,k));if(published){if(!x.final_url)throw Error('Chưa có Video Final');if(!['ready','published'].includes(String(x.stage))||!productionFinalApproved_(x))throw Error('Cần bấm Gửi hoàn thành trước khi đánh dấu đã đăng');productionSet_(f,'published_status','published');productionSet_(f,'published_at',new Date().toISOString());productionSet_(f,'published_by',u.id);productionSet_(f,'stage','published')}else{productionSet_(f,'published_status','unpublished');productionSet_(f,'published_at','');productionSet_(f,'published_by','');if(String(x.stage)==='published')productionSet_(f,'stage','ready')}productionSet_(f,'updated_at',new Date().toISOString());}finally{lock.releaseLock();}let warning='';try{productionNotify_(x,published?'published-toggle':'unpublished-toggle',published?'Video đã được đánh dấu Đã đăng':'Video đã chuyển về Chưa đăng',[x.created_by,x.approver_id,...teamIds_(x,'VJ'),...teamIds_(x,'Editor')]);}catch(e){console.error(e);warning='Đã lưu trạng thái; thông báo sẽ cần kiểm tra.'}return productionResult_(id,warning);}
function queueNotification_(key,id,message){if(!id||!person_(id))return;const s=sheet_('Notifications');let keys=V2016_WRITE_SCOPE?.notificationKeys;if(!keys){keys=new Set(s.getDataRange().getValues().slice(1).map(r=>String(r[1])));if(V2016_WRITE_SCOPE)V2016_WRITE_SCOPE.notificationKeys=keys}if(keys.has(String(key)))return;s.appendRow([Utilities.getUuid(),key,String(id),String(message),'pending',new Date().toISOString(),'','']);keys.add(String(key));}
// V20.26: claim under a short lock, send without the global lock, then record.
// Durable receipts let a later trigger finish recording without resending.
function notificationRow_(s,key,hint){
 if(hint&&hint<=s.getLastRow()){const r=s.getRange(hint,1,1,11).getValues()[0];if(String(r[1])===String(key))return {row:hint,r};}
 const a=s.getDataRange().getValues(),i=a.findIndex((r,k)=>k>0&&String(r[1])===String(key));return i>0?{row:i+1,r:a[i]}:null;
}
function notificationReceiptKey_(token){return 'VN_NOTIFY_RESULT:'+token;}
function notificationRecordLocked_(s,f,token,out){
 if(String(f.r[4])!=='sending'||String(f.r[7])!=='VN_SENDING:'+token)return {sent:String(f.r[4])==='sent',cancelled:String(f.r[4])==='cancelled'};
 const tried=Number(f.r[9]||0)+(out.sent?0:1),failed=!out.sent&&tried>=5;
 const next=out.sent||failed?'':new Date(Date.now()+Math.min(60,2**(tried-1))*60000).toISOString();
 s.getRange(f.row,5,1,7).setValues([[out.sent?'sent':failed?'failed':'pending',f.r[5],out.sent?out.at:f.r[6]||'',out.sent?'':String(out.error||'Telegram chưa xác nhận').slice(0,300),f.r[8]||'',tried,next]]);
 return {sent:!!out.sent};
}
function notificationRecoverLocked_(s,f){
 if(String(f.r[4])==='cancelled'&&String(f.r[7]).startsWith('VN_SENDING:')){PropertiesService.getScriptProperties().deleteProperty(notificationReceiptKey_(String(f.r[7]).slice(11)));return;}
 if(String(f.r[4])!=='sending')return;
 const token=String(f.r[7]||'').replace(/^VN_SENDING:/,''),props=PropertiesService.getScriptProperties(),value=props.getProperty(notificationReceiptKey_(token));
 if(value){const out=JSON.parse(value);notificationRecordLocked_(s,f,token,out);props.deleteProperty(notificationReceiptKey_(token));f.r=s.getRange(f.row,1,1,11).getValues()[0];return;}
 if(!f.r[10]||Date.parse(String(f.r[10]))<=Date.now()){
  // An interrupted HTTP call may have reached Telegram. Do not silently resend.
  s.getRange(f.row,5).setValue('failed');s.getRange(f.row,8).setValue('Lượt gửi gián đoạn; kiểm tra Telegram trước khi thử gửi lại.');s.getRange(f.row,11).setValue('');f.r[4]='failed';
 }
}
function notificationClaim_(key,hint){
 const lock=LockService.getScriptLock();if(!lock.tryLock(1000))return {sent:false,busy:true};
 try{const s=sheet_('Notifications'),f=notificationRow_(s,key,hint);if(!f)return {sent:false};notificationRecoverLocked_(s,f);
  if(String(f.r[4])==='sent')return {sent:true};if(String(f.r[4])==='cancelled')return {sent:false,cancelled:true};
  if(String(f.r[4])!=='pending'||Number(f.r[9]||0)>=5||f.r[10]&&Date.parse(String(f.r[10]))>Date.now())return {sent:false};
  if(obsoleteFinalNotification_(key)){s.getRange(f.row,5).setValue('cancelled');s.getRange(f.row,8).setValue('Đã bỏ bước duyệt Final');return {sent:false,cancelled:true};}
  if((String(key).startsWith('raw24:')||String(key).startsWith('raw12:'))&&!rawDeliveryNotificationCurrent_(key)){s.getRange(f.row,5).setValue('cancelled');s.getRange(f.row,8).setValue('Hạn bàn giao hoặc phân công đã thay đổi');return {sent:false,cancelled:true};}
  const token=Utilities.getUuid(),until=new Date(Date.now()+10*60000).toISOString();
  s.getRange(f.row,5,1,7).setValues([['sending',f.r[5],f.r[6]||'','VN_SENDING:'+token,f.r[8]||'',Number(f.r[9]||0),until]]);
  return {claim:{key:String(key),row:f.row,token,r:f.r}};
 }finally{lock.releaseLock()}
}
function notificationDeliver_(claim){
 let out;try{
  const r=claim.r,photo=String(r[8]||''),request=photo?{method:'post',payload:{chat_id:String(r[2]).trim(),caption:String(r[3]),photo:DriveApp.getFileById(photo).getBlob()},muteHttpExceptions:true}:{method:'post',contentType:'application/json',payload:JSON.stringify({chat_id:String(r[2]).trim(),text:String(r[3]),reply_markup:notificationMessageMarkup_(r[1],r[3])}),muteHttpExceptions:true};
  const response=UrlFetchApp.fetch('https://api.telegram.org/bot'+prop_('BOT_TOKEN')+'/'+(photo?'sendPhoto':'sendMessage'),request),body=response.getContentText();
  out={sent:response.getResponseCode()===200&&JSON.parse(body).ok===true,error:body.slice(0,300),at:new Date().toISOString()};
 }catch(e){out={sent:false,error:String(e).slice(0,300),at:new Date().toISOString()};}
 const props=PropertiesService.getScriptProperties(),receipt=notificationReceiptKey_(claim.token);let persisted=false;
 try{props.setProperty(receipt,JSON.stringify(out));persisted=true}catch(e){console.error('Không lưu được kết quả Telegram',e)}
 const lock=LockService.getScriptLock();if(!lock.tryLock(1000))return {sent:!!out.sent,recordPending:true};
 try{const s=sheet_('Notifications'),f=notificationRow_(s,claim.key,claim.row);if(!f){if(persisted)props.deleteProperty(receipt);return {sent:!!out.sent};}
  const result=notificationRecordLocked_(s,f,claim.token,out);if(persisted)props.deleteProperty(receipt);return result;
 }finally{lock.releaseLock()}
}
function dispatchNotificationKey_(key){const result=notificationClaim_(key);return result.claim?notificationDeliver_(result.claim):result;}
function dispatchNotifications(){
 const lock=LockService.getScriptLock();if(!lock.tryLock(1000))return;let due=[];
 try{const s=sheet_('Notifications'),a=s.getDataRange().getValues();for(let i=1;i<a.length;i++)if(['sending','cancelled'].includes(String(a[i][4]))){const f={row:i+1,r:a[i]};notificationRecoverLocked_(s,f);a[i]=f.r;}
  due=a.map((r,i)=>({r,row:i+1,attempts:Number(r[9]||0)})).filter(x=>x.row>1&&String(x.r[4])==='pending'&&x.attempts<5&&(!x.r[10]||Date.parse(String(x.r[10]))<=Date.now())).sort((a,b)=>a.attempts-b.attempts||a.row-b.row).slice(0,30).map(x=>({key:String(x.r[1]),row:x.row}));
 }finally{lock.releaseLock()}
 const started=Date.now();for(const entry of due){if(Date.now()-started>180000)break;const result=notificationClaim_(entry.key,entry.row);if(result.claim)notificationDeliver_(result.claim);}
}

function onWorkflowEdit(e){if(!e?.range||e.range.getSheet().getName()!=='Shoots'||e.range.getRow()<2)return;const col=e.range.getColumn();if(![3,4,5,6,7,11].includes(col))return;const sh=e.range.getSheet(),row=e.range.getRow(),v=sh.getRange(row,1,1,11).getValues()[0],idea=rows_('Ideas').find(x=>String(x.id)===String(v[1]));if(!idea)return;if(!v[0]){v[0]=Utilities.getUuid();sh.getRange(row,1).setValue(v[0]);}const oldMedia=String(v[5]||'');if(col===11){if(!String(v[10]||'').trim()){sh.getRange(row,6).setValue('');v[5]='';}else{const matches=people_().filter(x=>String(x.name).trim()===String(v[10]).trim());if(matches.length!==1)throw Error('Tên Media phải khớp duy nhất một nhân viên trong Employees');sh.getRange(row,6).setValue(String(matches[0].telegram_id));v[5]=String(matches[0].telegram_id);}}if(!['scheduled','cancelled'].includes(String(v[6]))||!v[2]||!v[3])return;const version=Number(v[7]||0)+1;sh.getRange(row,8,1,3).setValues([[version,new Date().toISOString(),'sheet']]);const recipients=new Set([String(idea.vj_id||''),String(v[5]||''),String(idea.creator_id||'')].filter(Boolean));for(const id of recipients)queueNotification_('sheet-shoot:'+v[0]+':'+version+':'+id,id,String(v[6])==='cancelled'?'Lịch quay '+idea.title+' đã bị hủy.':'Lịch quay được cập nhật: '+idea.title+' · '+String(v[2])+' · '+String(v[4])+'. Mở Mini App để xem.');const removed=col===6?String(e.oldValue||''):col===11?oldMedia:'';if(removed&&!recipients.has(removed))queueNotification_('sheet-remove:'+v[0]+':'+version+':'+removed,removed,'Bạn không còn được phân vào lịch quay '+idea.title+'.');dispatchNotifications();}
function installWorkflowEditTrigger(){const id=book_().getId(),triggers=ScriptApp.getProjectTriggers();if(!triggers.some(t=>t.getHandlerFunction()==='onWorkflowEdit'))ScriptApp.newTrigger('onWorkflowEdit').forSpreadsheet(id).onEdit().create();if(!triggers.some(t=>t.getHandlerFunction()==='dispatchNotifications'))ScriptApp.newTrigger('dispatchNotifications').timeBased().everyMinutes(5).create();}
function performance_(month){const employees=rows_('Employees').filter(r=>String(r.active).toLowerCase()==='true'),att=rows_('Attendance').filter(r=>dateKey_(r.date).startsWith(month)),tasks=rows_('Tasks').filter(r=>String(r.due_at).startsWith(month));return employees.map(e=>{const id=String(e.telegram_id),a=att.filter(x=>String(x.telegram_id)===id),t=tasks.filter(x=>String(x.assignee_id)===id),done=t.filter(x=>x.status==='done'),on=done.filter(x=>String(x.completed_at)<=String(x.due_at)),total=t.reduce((v,x)=>v+Number(x.weight)*Number(x.quantity),0),ach=done.reduce((v,x)=>v+Number(x.weight)*Number(x.quantity),0);return {month,telegram_id:id,name:String(e.name),work_days:a.length,work_minutes:a.reduce((v,x)=>v+Number(x.work_minutes||0),0),tasks_assigned:t.length,tasks_done:done.length,on_time_done:on.length,weighted_done:ach,weighted_assigned:total,completion_percent:total?Math.round(100*ach/total):null,on_time_percent:done.length?Math.round(100*on.length/done.length):null};});}
function refreshPerformance(){const month=stamp_(new Date(),'yyyy-MM'),s=sheet_('Performance'),old=s.getDataRange().getValues(),kept=old.slice(1).filter(r=>String(r[0])!==month);s.clearContents();s.appendRow(HEADERS.Performance);const all=kept.concat(performance_(month).map(x=>HEADERS.Performance.map(k=>x[k]??'')));if(all.length)s.getRange(2,1,all.length,HEADERS.Performance.length).setValues(all);}
function sendReminders(){const token=prop_('BOT_TOKEN'),today=stamp_(new Date(),'yyyy-MM-dd'),now=stamp_(new Date(),'HH:mm'),att=rows_('Attendance').filter(a=>dateKey_(a.date)===today),people=rows_('Employees').filter(e=>String(e.active).toLowerCase()==='true');let msg='';if(now>='08:30'&&now<'10:00')msg='Nhắc bạn check-in hôm nay.';else if(now>='17:30'&&now<'19:00')msg='Nhắc bạn check-out hôm nay.';if(!msg)return;const cache=CacheService.getScriptCache();people.forEach(e=>{const a=att.find(x=>String(x.telegram_id)===String(e.telegram_id));if((msg.includes('check-in')&&!a)||(msg.includes('check-out')&&a&&!a.check_out)){const key=today+':'+msg+':'+e.telegram_id;if(!cache.get(key)){const response=UrlFetchApp.fetch('https://api.telegram.org/bot'+token+'/sendMessage',{method:'post',payload:{chat_id:String(e.telegram_id),text:msg},muteHttpExceptions:true});if(response.getResponseCode()===200)cache.put(key,'1',21600);}}});}
function launchSecret_(){const p=PropertiesService.getScriptProperties();let secret=p.getProperty('LAUNCH_SECRET');if(!secret){secret=Utilities.getUuid().replace(/-/g,'')+Utilities.getUuid().replace(/-/g,'');p.setProperty('LAUNCH_SECRET',secret);}return secret;}
function launchToken_(id){const body='v2.'+String(id);return body+'.'+hex_(Utilities.computeHmacSha256Signature(body,launchSecret_()));}
function launchAuth_(token){if(String(token).startsWith('v4.'))return rememberedAuth_(token);const v3=String(token).split('.');if(v3[0]==='v3'){if(v3.length!==5||!/^\d+$/.test(v3[1])||!/^\d+$/.test(v3[2])||!/^[a-f0-9]{32}$/.test(v3[3])||!/^[a-f0-9]{64}$/.test(v3[4]))throw Error('Phiên mở ứng dụng không hợp lệ');const exp=Number(v3[2]),now=Date.now()/1000;if(exp<=now||exp>now+21660)throw Error('Phiên đăng nhập hết hạn; mở lại ứng dụng');const body=v3.slice(0,4).join('.'),expected=hex_(Utilities.computeHmacSha256Signature(body,launchSecret_()));let diff=0;for(let i=0;i<64;i++)diff|=expected.charCodeAt(i)^v3[4].charCodeAt(i);if(diff)throw Error('Chữ ký phiên không hợp lệ');return launchAuth_(launchToken_(v3[1]));}const parts=String(token).split('.');let id='',body='',signature='',key='';if(parts[0]==='v2'){if(parts.length!==3||!/^[0-9]+$/.test(parts[1])||!/^[a-f0-9]{64}$/.test(parts[2]))throw Error('Nút mở ứng dụng không hợp lệ');id=parts[1];body=parts.slice(0,2).join('.');signature=parts[2];key=launchSecret_();}else if(parts[0]==='v1'){if(parts.length!==4||!/^[0-9]+$/.test(parts[1])||!/^[0-9]+$/.test(parts[2])||!/^[a-f0-9]{64}$/.test(parts[3]))throw Error('Nút cũ không hợp lệ');const exp=Number(parts[2]);if(exp<Date.now()/1000||exp>Date.now()/1000+3600)throw Error('Nút cũ đã hết hạn; nhắn /start cho bot để lấy nút mới không giới hạn giờ');id=parts[1];body=parts.slice(0,3).join('.');signature=parts[3];key=prop_('BOT_TOKEN');}else throw Error('Nút mở ứng dụng không hợp lệ');const actual=hex_(Utilities.computeHmacSha256Signature(body,key));let diff=0;for(let i=0;i<64;i++)diff|=actual.charCodeAt(i)^signature.charCodeAt(i);if(diff)throw Error('Chữ ký nút không hợp lệ');const employee=rows_('Employees').find(r=>String(r.telegram_id)===id&&String(r.active).toLowerCase()==='true');if(!employee)throw Error('Tài khoản chưa được kích hoạt trong Employees');return {id,name:String(employee.name),role:role_(employee.role),department:String(employee.department)};}
function revokeAllLaunchLinks(){PropertiesService.getScriptProperties().setProperty('LAUNCH_SECRET',Utilities.getUuid().replace(/-/g,'')+Utilities.getUuid().replace(/-/g,''));return 'Đã thu hồi mọi nút cũ. Mỗi người nhắn /start để nhận nút mới.';}

// Meetings: dates entered in Vietnam time; never trust client role or recipients.
function setupMeetings(){
 const b=book_();['Meetings','Notifications'].forEach(n=>{const h=HEADERS[n],s=b.getSheetByName(n)||b.insertSheet(n);if(!s.getLastRow()){s.appendRow(h);s.setFrozenRows(1);}else if(s.getRange(1,1,1,h.length).getValues()[0].join('|')!==h.join('|'))throw Error('Header '+n+' không đúng');});
 const triggers=ScriptApp.getProjectTriggers();if(!triggers.some(t=>t.getHandlerFunction()==='dispatchNotifications'))ScriptApp.newTrigger('dispatchNotifications').timeBased().everyMinutes(5).create();
 return 'Đã tạo mục Cuộc họp và lịch gửi lại thông báo mỗi 5 phút.';
}
function meetingIds_(m){try{return JSON.parse(String(m.participant_ids||'[]')).map(String)}catch(e){return []}}
function meetingSnapshot_(u){
 if(!book_().getSheetByName('Meetings'))return [];
 return rows_('Meetings').filter(m=>isDirector_(u)||String(m.created_by)===u.id||meetingIds_(m).includes(u.id)).sort((a,b)=>String(b.start_at).localeCompare(String(a.start_at))).slice(0,150).map(m=>({...m,participant_ids:meetingIds_(m)}));
}
function createMeetingData_(initData,title,agenda,date,start,end,location,participants,requestId){
 const u=auth_(initData);manager_(u);
 title=String(title||'').trim();agenda=String(agenda||'').trim();location=String(location||'').trim();date=validDate_(date);start=validTime_(start);end=validTime_(end);
 if(!title)throw Error('Hãy nhập tên cuộc họp.');if(title.length>160||agenda.length>1500)throw Error('Nội dung cuộc họp quá dài.');if(!location)throw Error('Hãy nhập địa điểm hoặc link họp.');if(location.length>500)throw Error('Địa điểm / link họp quá dài.');if(start>=end)throw Error('Giờ kết thúc phải sau giờ bắt đầu.');
 const from=new Date(date+'T'+start+':00+07:00'),to=new Date(date+'T'+end+':00+07:00');
 if(from.getTime()<Date.now()-60000)throw Error('Hãy chọn thời gian họp trong tương lai.');
 if(!Array.isArray(participants)||!participants.length||participants.length>100)throw Error('Chọn ít nhất một người tham dự.');
 const ids=[...new Set(participants.map(String))];for(const id of ids)if(!canLead_(u,person_(id)))throw Error('Bạn không có quyền mời người này hoặc tài khoản đã ngừng hoạt động.');
 requestId=String(requestId||'');if(!/^[a-zA-Z0-9_-]{10,80}$/.test(requestId))throw Error('Mã yêu cầu không hợp lệ; mở lại mẫu tạo lịch.');
 const id=u.id+':'+requestId,lock=LockService.getScriptLock();lock.waitLock(15000);
 try{const old=rows_('Meetings').find(m=>String(m.id)===id);if(old&&(String(old.title)!==title||String(old.agenda||'')!==agenda||String(old.location)!==location||String(old.start_at)!==from.toISOString()||String(old.end_at)!==to.toISOString()||JSON.stringify(meetingIds_(old).slice().sort())!==JSON.stringify(ids.slice().sort())))throw Error('Mã yêu cầu đã dùng cho cuộc họp khác');if(!old){
 const all=rows_('Meetings'),involved=new Set([...ids,u.id]);
 if(all.some(m=>m.status==='scheduled'&&from<new Date(m.end_at)&&to>new Date(m.start_at)&&[...meetingIds_(m),String(m.created_by)].some(x=>involved.has(x))))throw Error('Một người tham dự hoặc người tổ chức đã có cuộc họp trùng giờ.');
 sheet_('Meetings').appendRow([id,title,agenda,from.toISOString(),to.toISOString(),location,JSON.stringify(ids),u.id,u.department,'scheduled',new Date().toISOString()]);
 }
 const m=old||{title,agenda,start_at:from.toISOString(),end_at:to.toISOString(),location};
 (old?meetingIds_(old):ids).forEach(who=>queueNotification_('meeting:'+id+':'+who,who,'LỊCH HỌP: '+m.title+'\nNgười mời: '+u.name+'\nThời gian: '+stamp_(new Date(m.start_at),'dd/MM/yyyy HH:mm')+' – '+stamp_(new Date(m.end_at),'HH:mm')+' (giờ Việt Nam)\nĐịa điểm / link: '+m.location+(m.agenda?'\nNội dung: '+m.agenda:'')+'\nMở Mini App → Cuộc họp để xem.'));
 SpreadsheetApp.flush();
 }finally{lock.releaseLock()}
 return {ok:true,meeting:meetingResult_(rows_('Meetings').find(m=>String(m.id)===id))};
}
function cancelMeeting(initData,id){
 const u=auth_(initData);manager_(u);const lock=LockService.getScriptLock();lock.waitLock(15000);
 try{const s=sheet_('Meetings'),a=s.getDataRange().getValues(),i=a.findIndex((r,k)=>k>0&&String(r[0])===String(id));if(i<0)throw Error('Không thấy cuộc họp.');const m=Object.fromEntries(HEADERS.Meetings.map((k,j)=>[k,a[i][j]]));
 if(!isDirector_(u)&&String(m.created_by)!==u.id)throw Error('Chỉ người tạo hoặc giám đốc được hủy cuộc họp.');
 if(m.status==='scheduled'){s.getRange(i+1,10).setValue('cancelled');meetingIds_(m).forEach(who=>queueNotification_('meeting-cancel:'+id+':'+who,who,'ĐÃ HỦY CUỘC HỌP: '+m.title+'\nThời gian: '+stamp_(new Date(m.start_at),'dd/MM/yyyy HH:mm')+'\nNgười hủy: '+u.name));}SpreadsheetApp.flush();
 }finally{lock.releaseLock()}
 try{dispatchNotifications()}catch(e){console.error(e)}return snapshot(initData);
}

function setupV16(){setupTeam20();setupWorkHub();setupProductionWorkflow();setupMeetings();const ss=book_(),set=ss.getSheetByName('Settings'),existing=new Set(set.getDataRange().getValues().map(r=>String(r[0])));Object.entries(DEFAULTS).forEach(([k,v])=>{if(!existing.has(k))set.appendRow([k,v]);});const tr=ScriptApp.getProjectTriggers();if(!tr.some(t=>t.getHandlerFunction()==='v16Scheduler'))ScriptApp.newTrigger('v16Scheduler').timeBased().everyMinutes(1).create();if(!tr.some(t=>t.getHandlerFunction()==='dispatchNotifications'))ScriptApp.newTrigger('dispatchNotifications').timeBased().everyMinutes(1).create();return 'V16 sẵn sàng. Điền group_chat_id rồi chạy testV16GroupGreeting().';}
function tgSend_(chatId,text){if(!chatId)return false;const r=UrlFetchApp.fetch('https://api.telegram.org/bot'+prop_('BOT_TOKEN')+'/sendMessage',{method:'post',contentType:'application/json',payload:JSON.stringify({chat_id:String(chatId),text:String(text)}),muteHttpExceptions:true});return r.getResponseCode()===200;}
function overdueTasks_(){const now=new Date();return rows_('Tasks').filter(t=>!['done','review','cancelled','canceled'].includes(String(t.status))&&t.due_at&&new Date(t.due_at)<now);}
function groupGreetingText_(kind){
 const messages={morning:'☀️ Chào buổi sáng Viral Network! Chúc cả team một ngày làm việc hiệu quả.\n\n📍 Nhớ Check-in khi tới văn phòng và kiểm tra Công việc của tôi để sắp xếp hôm nay.',lunch:'🍱 12:00 — Đến giờ nghỉ trưa rồi! Chúc cả team ăn ngon và nghỉ ngơi. Hẹn gặp lại lúc 13:30.\nGiờ nghỉ trưa không tính vào thời gian làm việc.',afternoon:'💪 13:30 — Chào mừng cả team quay lại! Chúc mọi người một buổi chiều làm việc thuận lợi.\nMở Công việc của tôi để cập nhật tiến độ và ưu tiên các việc sắp đến hạn.',home:'🌇 17:00 — Hết ca làm mặc định rồi! Cảm ơn cả team hôm nay.\n\n📍 Nhớ Check-out khi kết thúc ca thực tế, cập nhật tiến độ và gửi hoàn thành cho các việc đã xong. Ai tăng ca nhớ kiểm tra đăng ký tăng ca.'};
 return messages[kind]||'Viral Network';
}
function oncePerDay_(key,fn){const p=PropertiesService.getScriptProperties(),d=stamp_(new Date(),'yyyy-MM-dd'),k='V16:'+d+':'+key;if(p.getProperty(k))return;if(fn()!==false)p.setProperty(k,'1');}
function greetingWindow_(now,scheduled){const a=/^(\d{2}):(\d{2})$/.exec(String(now)),b=/^(\d{2}):(\d{2})$/.exec(String(scheduled));if(!a||!b)return false;const elapsed=(Number(a[1])*60+Number(a[2]))-(Number(b[1])*60+Number(b[2]));return elapsed>=0&&elapsed<15;}
function v16Scheduler(){
 return botBackgroundJob_('greetings',()=>{readScope_(()=>{if(prop_('GROUP_GREETINGS_ENABLED')==='false')return;const hm=stamp_(new Date(),'HH:mm'),group=String(setting_('group_chat_id')||'').trim();if(!group)return;
 const slots=[['morning','08:00','greet_morning'],['lunch','12:00','greet_lunch'],['afternoon','13:30','greet_afternoon'],['home','17:00','greet_home']];
 for(const [kind,time,key] of slots)if(greetingWindow_(hm,time))try{oncePerDay_(key,()=>tgSend_(group,groupGreetingText_(kind)))}catch(e){console.error('Lời chào '+kind+': '+String(e))}
 });
 try{rawDeliveryAlerts_()}catch(e){console.error('Nhắc bàn giao Raw: '+String(e))}
 try{taskDeadlineAlerts_()}catch(e){console.error('Nhắc deadline: '+String(e))}
 });
}
function setupV20Greetings(){const group=String(setting_('group_chat_id')||'').trim();if(!/^-\d{6,20}$/.test(group))throw Error('Điền group_chat_id hợp lệ trong Settings cho nhóm tổng (ID âm), không phải nhóm dự án.');const settings=sheet_('Settings'),rows=settings.getDataRange().getValues();for(const [key,value] of Object.entries({start_time:'08:00',end_time:'17:00',lunch_start:'12:00',lunch_end:'13:30',timezone:'Asia/Ho_Chi_Minh'})){const i=rows.findIndex((r,j)=>j>0&&String(r[0])===key);if(i>0)settings.getRange(i+1,2).setValue(value);else settings.appendRow([key,value])}V19_SETTINGS_CACHE=null;V19_SETTINGS_AT=0;for(const t of ScriptApp.getProjectTriggers())if(t.getHandlerFunction()==='v16Scheduler')ScriptApp.deleteTrigger(t);ScriptApp.newTrigger('v16Scheduler').timeBased().everyMinutes(1).create();return 'Đã cài lại lời chào nhóm tổng lúc 08:00, 12:00, 13:30, 17:00 theo giờ Việt Nam. Ca mặc định 08:00–17:00, nghỉ trưa 12:00–13:30. Mỗi mốc thử trong 15 phút, chỉ đánh dấu sau gửi thành công. Giữ các ca riêng đã khai báo trong Schedule và dữ liệu chấm công cũ.';}
function checkGreetingStatus(){const p=PropertiesService.getScriptProperties(),d=stamp_(new Date(),'yyyy-MM-dd');return {timezone:zone_(),localTime:stamp_(new Date(),'yyyy-MM-dd HH:mm'),group:setting_('group_chat_id'),schedulerTriggers:ScriptApp.getProjectTriggers().filter(t=>t.getHandlerFunction()==='v16Scheduler').length,sentToday:Object.fromEntries(['morning','lunch','afternoon','home'].map(k=>[k,!!p.getProperty('V16:'+d+':greet_'+k)]))}}
function previewV20Greetings(){return '12:00\n'+groupGreetingText_('lunch')+'\n\n13:30\n'+groupGreetingText_('afternoon');}
function taskDeadlineAlerts_(){const now=new Date(),props=PropertiesService.getScriptProperties(),people=people_(),rawTasks=new Set(prodLinkRows_().filter(l=>['vj_id','vj_collab'].includes(String(l.role_key))).map(l=>String(l.task_id)));rows_('Tasks').forEach(t=>{if(rawTasks.has(String(t.id))||!t.due_at||['done','review','cancelled','canceled'].includes(String(t.status)))return;const due=new Date(t.due_at),mins=Math.round((due-now)/60000),id=String(t.id),assignee=String(t.assignee_id),emp=people.find(e=>String(e.telegram_id)===assignee);if(mins>=55&&mins<=65){const k='TASK1H:'+id;if(!props.getProperty(k)){tgSend_(assignee,'⏰ Công việc sắp đến hạn sau 1 giờ\n\n'+t.title+'\nDeadline edit video Final: '+stamp_(due,'dd/MM/yyyy HH:mm'));props.setProperty(k,'1');}}if(mins<0){const k='TASKOVER:'+id;if(!props.getProperty(k)){tgSend_(assignee,'🔴 Công việc đã quá hạn\n\n'+t.title+'\nDeadline edit video Final: '+stamp_(due,'dd/MM/yyyy HH:mm')+'\nVui lòng cập nhật tiến độ.');const leader=people.find(e=>role_(e.role)==='leader'&&emp&&String(e.department)===String(emp.department));if(leader)tgSend_(leader.telegram_id,'🔴 Task quá hạn\n\n'+t.title+'\nNhân viên: '+emp.name+'\nDeadline edit video Final: '+stamp_(due,'dd/MM/yyyy HH:mm'));props.setProperty(k,'1');}}});}
function testV16GroupGreeting(){const id=setting_('group_chat_id');if(!id)throw Error('Hãy điền group_chat_id trong Settings trước');if(!tgSend_(id,groupGreetingText_('morning')))throw Error('Không gửi được. Kiểm tra Chat ID và quyền gửi tin của bot.');return 'Đã gửi tin test vào group.';}


// ===== V17: responsive release + production → personal task sync =====
const V17_ROLES={vj_id:{label:'VJ/KOL',task:'Thực hiện phần VJ/KOL'},cam_id:{label:'Kỹ thuật / Cam-op',task:'Quay & bàn giao footage'},editor_id:{label:'Editor',task:'Dựng video'},designer_id:{label:'Designer',task:'Thiết kế ấn phẩm'}};
function setupV17(){setupV16();const b=book_(),h=HEADERS.ProductionTaskLinks,s=b.getSheetByName('ProductionTaskLinks')||b.insertSheet('ProductionTaskLinks');if(!s.getLastRow()){s.appendRow(h);s.setFrozenRows(1);}else if(s.getRange(1,1,1,h.length).getValues()[0].join('|')!==h.join('|'))throw Error('Header ProductionTaskLinks không đúng.');rows_('ProductionItems').forEach(x=>syncProductionTasks_(x,{}, {id:String(x.created_by||''),name:'V17 migration'}));return 'V17 sẵn sàng. Production đã liên kết với Công việc cá nhân; dữ liệu cũ được giữ nguyên.';}
function productionTeamText_(x){
 const names=ids=>[...new Set(ids.map(String).filter(Boolean))].map(id=>person_(id)?.name||id).join(', ');
 const team=withProductionTeam_([x])[0],lines=[];
 [['VJ/KOL',team.vj_ids],['Kỹ thuật / Cam-op',[x.cam_id]],['Editor',team.editor_ids],['Người duyệt',[x.approver_id]]].forEach(([label,ids])=>{if(ids.some(Boolean))lines.push('• '+label+': '+names(ids))});
 return lines.join('\n');
}
function productionTaskText_(role){return ({vj_id:'• Xem brief / kịch bản\n• Chuẩn bị và thực hiện phần dẫn\n• Phối hợp bàn giao footage',cam_id:'• Chuẩn bị thiết bị quay\n• Quay footage theo brief / kịch bản\n• Bàn giao footage cho Editor',editor_id:'• Nhận footage sau khi quay hoàn tất\n• Dựng video theo brief\n• Lưu link Video Final và bấm Gửi hoàn thành',designer_id:'• Chuẩn bị thiết kế theo brief\n• Bàn giao ấn phẩm đúng deadline',thumbnail_assignee_id:'• Nhận Raw/Voice\n• Làm thumbnail và gửi Leader Media duyệt'})[role]||'• Kiểm tra phân công trong Mini App';}
function prodDue_(x,role){const raw=['editor_id','designer_id','thumbnail_assignee_id'].includes(role)?x.deadline:(x.shoot_at||x.deadline);const d=raw?new Date(raw):new Date(Date.now()+7*86400000);return isNaN(d)?new Date(Date.now()+7*86400000):d;}
function prodTaskTitle_(x,role){const prefix={vj_id:'VJ',cam_id:'Quay',editor_id:'Dựng',designer_id:'Thiết kế',thumbnail_assignee_id:'Thumbnail'}[role]||'Sản xuất';return prefix+' · '+x.title;}
function prodLinkRows_(){const sh=book_().getSheetByName('ProductionTaskLinks');return sh?rows_('ProductionTaskLinks'):[];}
function syncProductionTasks_(x,before,u){if(x.stage==='deleted')return;const links=prodLinkRows_(),linkSheet=sheet_('ProductionTaskLinks'),taskSheet=sheet_('Tasks'),now=new Date().toISOString();Object.keys(V17_ROLES).forEach(role=>{const oldId=String(before&&before[role]||''),newId=String(x[role]||''),existing=links.find(l=>String(l.production_id)===String(x.id)&&String(l.role_key)===role&&String(l.active).toLowerCase()!=='false');if(oldId&&oldId!==newId&&existing){const rows=taskSheet.getDataRange().getValues(),i=rows.findIndex((r,k)=>k>0&&String(r[0])===String(existing.task_id));if(i>0&&!['done'].includes(String(rows[i][7])))taskSheet.getRange(i+1,8).setValue('cancelled');const lr=linkSheet.getDataRange().getValues().findIndex((r,k)=>k>0&&String(r[0])===String(x.id)&&String(r[1])===role&&String(r[3])===String(existing.task_id));if(lr>0)linkSheet.getRange(lr+1,5,1,2).setValues([[false,now]]);}
 if(!newId)return;let link=prodLinkRows_().find(l=>String(l.production_id)===String(x.id)&&String(l.role_key)===role&&String(l.telegram_id)===newId&&String(l.active).toLowerCase()!=='false');const due=prodTaskDueValue_(x,role),title=prodTaskTitle_(x,role),category='Sản xuất · '+V17_ROLES[role].label;if(!link){const taskId='prod:'+x.id+':'+role+':'+newId;taskSheet.appendRow([taskId,newId,title,category,1,1,due,'open',now,'',String(u&&u.id||x.created_by||'')]);linkSheet.appendRow([x.id,role,newId,taskId,true,now]);}else{const rows=taskSheet.getDataRange().getValues(),i=rows.findIndex((r,k)=>k>0&&String(r[0])===String(link.task_id));if(i>0)taskSheet.getRange(i+1,2,1,6).setValues([[newId,title,category,1,1,due]]);}}
 );}
function productionChanges_(x,b){const c=[];if(!b||!b.id)return c;const fields=[['shoot_at','Giờ quay'],['deadline','Deadline edit video Final'],['publish_scheduled_at','Thời gian đăng dự kiến']];fields.forEach(([k,label])=>{if(String(b[k]||'')!==String(x[k]||''))c.push(label+': '+(b[k]?stamp_(new Date(b[k]),'dd/MM HH:mm'):'—')+' → '+(x[k]?stamp_(new Date(x[k]),'dd/MM HH:mm'):'—'));});Object.entries(V17_ROLES).forEach(([k,v])=>{if(String(b[k]||'')!==String(x[k]||''))c.push(v.label+': '+(person_(b[k])?.name||'—')+' → '+(person_(x[k])?.name||'—'));});return c;}
function productionAssignmentRoles_(x){
 const roles=new Map(),add=(id,label,task)=>{id=String(id||'');if(!id)return;const list=roles.get(id)||[];if(!list.some(r=>r.label===label))list.push({label,task});roles.set(id,list)};
 const team=Array.isArray(x.vj_ids)&&Array.isArray(x.editor_ids)?x:withProductionTeam_([x])[0];
 team.vj_ids.forEach((id,i)=>add(id,i?'VJ/KOL phối hợp':'VJ/KOL',productionTaskText_('vj_id')));
 add(x.cam_id,'Kỹ thuật / Cam-op',productionTaskText_('cam_id'));
 team.editor_ids.forEach((id,i)=>add(id,i?'Editor phối hợp':'Editor',productionTaskText_('editor_id')));
 add(x.designer_id,'Designer',productionTaskText_('designer_id'));
 add(x.approver_id,'Người duyệt','• Kiểm tra Idea\n• Duyệt hoặc yêu cầu sửa Idea trong Mini App');
 return roles;
}
function productionAssignmentMessage_(x,roles,team,changes,newRole){
 const tasks=[...new Set(roles.map(r=>r.task))].join('\n');
 return (newRole?'🎬 PHÂN CÔNG SẢN XUẤT':'🔄 CẬP NHẬT PHÂN CÔNG')+'\n\nDự án: '+x.project+'\nNội dung: '+x.title+'\nVai trò của bạn: '+roles.map(r=>r.label).join(', ')+(x.shoot_at?'\nNgày / giờ quay: '+stamp_(new Date(x.shoot_at),'dd/MM/yyyy HH:mm'):'')+(x.deadline?'\nDeadline edit video Final: '+stamp_(new Date(x.deadline),'dd/MM/yyyy HH:mm'):'')+'\n\nTeam:\n'+(team||'—')+'\n\nCông việc của bạn:\n'+tasks+(changes.length?'\n\nThay đổi:\n• '+changes.join('\n• '):'')+'\n\n👉 Mở Mini App → Công việc để xem chi tiết.';
}
function notifyProductionTeamEdited_(x,id){
 const roles=productionAssignmentRoles_(x).get(String(id));if(!roles)return;
 queueNotification_('v19-team-sheet:'+x.id+':'+id+':'+Date.now(),id,productionAssignmentMessage_(x,roles,productionTeamText_(x),[],true));
}
function notifyProductionAssignments_(x,before,u){
 const current=productionAssignmentRoles_(x),previous=before?.id?productionAssignmentRoles_(before):new Map(),changes=productionChanges_(x,before),team=productionTeamText_(x);
 const roster=roles=>[...roles].map(([id,list])=>id+':'+list.map(r=>r.label).join(',')).sort().join('|');
 const rosterChanged=roster(current)!==roster(previous),timeChanged=changes.length>0;
 if(!rosterChanged&&!timeChanged)return;
 const now=Date.now();current.forEach((roles,id)=>{
  const mineBefore=previous.get(id),newRole=!mineBefore||mineBefore.map(r=>r.label).join('|')!==roles.map(r=>r.label).join('|');
  const message=productionAssignmentMessage_(x,roles,team,changes,newRole);
  queueNotification_('v19-prod:'+x.id+':'+now+':'+id,id,message);
  if(newRole&&x.raw_url&&['edit','review','revision','ready'].includes(String(x.stage))&&roles.some(r=>/editor|designer|thumbnail/i.test(String(r.label))))queueNotification_('v20-assets-reassign:'+x.id+':'+now+':'+id,id,'🎬 TƯ LIỆU CHO PHÂN CÔNG MỚI\nDự án: '+x.project+'\nVideo: '+x.title+'\nRaw: '+x.raw_url+'\nVoice: '+(x.voice_url||'Không có')+(x.script_url||x.detailed_script_url?'\nKịch bản: '+(x.script_url||x.detailed_script_url):'')+'\n👉 Mini App → Sản xuất');
 });
 previous.forEach((roles,id)=>{if(!current.has(id))queueNotification_('v19-prod-remove:'+x.id+':'+now+':'+id,id,'⚠️ THAY ĐỔI PHÂN CÔNG\n\nBạn đã được gỡ khỏi '+x.title+'. Mở Mini App → Công việc để kiểm tra.')});
}

// ===== V17 Ver2: Sheet ⇄ Mini App + name-based personnel input =====
const V17V2_NAME_COLS={vj_name:'vj_id',cam_name:'cam_id',editor_name:'editor_id',designer_name:'designer_id',approver_name:'approver_id'};
function setupV17Ver2(){
  setupV17();
  const b=book_(),s=sheet_('ProductionItems'),base=HEADERS.ProductionItems.slice(),names=Object.keys(V17V2_NAME_COLS);
  const current=s.getRange(1,1,1,Math.max(s.getLastColumn(),base.length)).getValues()[0].map(String);
  names.forEach(n=>{if(!current.includes(n)){s.getRange(1,s.getLastColumn()+1).setValue(n);current.push(n);}});
  const source=b.getSheetByName('Employees').getRange('B2:B1000'),rule=SpreadsheetApp.newDataValidation().requireValueInRange(source,true).setAllowInvalid(false).build();
  names.forEach(n=>{const c=current.indexOf(n)+1;s.getRange(2,c,999).setDataValidation(rule);});
  const people=people_(),map=new Map(people.map(p=>[String(p.telegram_id),String(p.name)]));
  if(s.getLastRow()>1){const vals=s.getRange(2,1,s.getLastRow()-1,s.getLastColumn()).getValues();vals.forEach((r,ri)=>names.forEach(n=>{const nc=current.indexOf(n),idc=base.indexOf(V17V2_NAME_COLS[n]);if(!r[nc]&&r[idc]&&map.has(String(r[idc])))s.getRange(ri+2,nc+1).setValue(map.get(String(r[idc])));}));}
  const exists=ScriptApp.getProjectTriggers().some(t=>t.getHandlerFunction()==='onV17Ver2Edit');
  if(!exists)ScriptApp.newTrigger('onV17Ver2Edit').forSpreadsheet(b).onEdit().create();
  return 'V17 Ver2 sẵn sàng: ProductionItems đồng bộ 2 chiều, chọn nhân viên bằng tên, dữ liệu cũ được giữ nguyên.';
}
function v17v2PersonByName_(name){name=String(name||'').trim();if(!name)return '';const people=people_(),exact=people.filter(p=>String(p.name).trim()===name),a=exact.length?exact:people.filter(p=>String(p.raw_name||p.name).trim()===name);if(a.length!==1)throw Error('Tên nhân viên “'+name+'” phải khớp duy nhất một người trong Employees');return String(a[0].telegram_id);}
function onV17Ver2Edit(e){
  if(!e||!e.range)return;
  const sh=e.range.getSheet();
  if(sh.getName()==='Shoots'){onWorkflowEdit(e);return;}
  if(sh.getName()==='ProductionTeam'){onProductionTeamEdit_(e);return;}
  if(sh.getName()!=='ProductionItems'||e.range.getRow()<2)return;
  const row=e.range.getRow(),base=HEADERS.ProductionItems.slice(),last=sh.getLastColumn(),heads=sh.getRange(1,1,1,last).getValues()[0].map(String);if(String(sh.getRange(row,14).getValue())==='deleted')return;
  if(!String(sh.getRange(row,1).getValue()||'')){sh.getRange(row,1).setValue(Utilities.getUuid());const fresh=productionRow_(String(sh.getRange(row,1).getValue()));productionExtraValue_(fresh,'production_metrics_version','2');productionExtraValue_(fresh,'vj_final_required',true);}
  const approvalKey=heads[e.range.getColumn()-1];
  if(e.range.getNumRows()===1&&e.range.getNumColumns()===1&&Object.prototype.hasOwnProperty.call(V19_APPROVALS,approvalKey)){
    const choice=String(e.range.getValue()||'');if(!choice)return;
    try{if(approvalKey==='final_approval')throw Error('Final cần hai Leader duyệt riêng trên Mini App');const note=String(sh.getRange(row,heads.indexOf(approvalKey+'_feedback')+1).getValue()||'');approvalSet_({id:'sheet',role:'director',name:'Google Sheet'},String(sh.getRange(row,1).getValue()),approvalKey,choice,note);e.range.clearNote()}
    catch(err){e.range.setValue(e.oldValue||'');e.range.setNote('Không thể duyệt: '+err.message);sh.getParent().toast(String(err.message),'Không thể duyệt',8);console.error(err);}
    return;
  }
  if(e.range.getNumRows()===1&&e.range.getNumColumns()===1&&['content_final_approval','media_final_approval','vj_final_approval'].includes(approvalKey)){
   const choice=String(e.range.getValue()||'');if(!choice)return;
   try{const kind=approvalKey.startsWith('content')?'content':approvalKey.startsWith('media')?'media':'vj',note=String(sh.getRange(row,heads.indexOf(kind+'_final_feedback')+1).getValue()||'');e.range.setValue(e.oldValue||'');v20FinalSet_({id:'sheet',name:'Google Sheet',role:'director'},String(sh.getRange(row,1).getValue()),kind,choice,note,true);e.range.clearNote()}
   catch(err){e.range.setValue(e.oldValue||'');e.range.setNote('Không thể duyệt: '+err.message);sh.getParent().toast(String(err.message),'Không thể duyệt',8);console.error(err)}return;
  }
  if(e.range.getNumRows()===1&&e.range.getNumColumns()===1&&['content_approvers','media_approvers'].includes(approvalKey)){
   try{const kind=approvalKey.startsWith('content')?'content':'media',x=productionRow_(String(sh.getRange(row,1).getValue())).item,old=v20Approvers_(x),names=String(e.range.getValue()||'').split(',').map(t=>t.trim()).filter(Boolean),ids=names.map(v17v2PersonByName_),data={content_approver_ids:kind==='content'?ids:old.content,media_approver_ids:kind==='media'?ids:old.media,vj_id:x.vj_id,vj_final_required:!!x.vj_final_required};v20SaveApprovers_(x.id,data,{id:'sheet'});e.range.clearNote()}
   catch(err){e.range.setValue(e.oldValue||'');e.range.setNote('Không thể chọn Leader: '+err.message);sh.getParent().toast(String(err.message),'Phân công Final',8);console.error(err)}return;
  }
  Object.entries(V17V2_NAME_COLS).forEach(([nameCol,idCol])=>{const nc=heads.indexOf(nameCol)+1,ic=base.indexOf(idCol)+1;if(nc>0&&ic>0&&e.range.getColumn()===nc){const name=sh.getRange(row,nc).getValue();sh.getRange(row,ic).setValue(v17v2PersonByName_(name));}});
  Object.entries(V17V2_NAME_COLS).forEach(([nameCol,idCol])=>{const nc=heads.indexOf(nameCol)+1,ic=base.indexOf(idCol)+1;if(nc>0&&ic>0&&e.range.getColumn()===ic){const id=String(sh.getRange(row,ic).getValue()||''),p=id?person_(id):null;sh.getRange(row,nc).setValue(p?String(p.name):'');}});
  SpreadsheetApp.flush();
  const id=String(sh.getRange(row,1).getValue()),x=productionRow_(id).item;
  if(!x.project||!x.title||!x.brief)return;
  if(!x.stage)sh.getRange(row,14).setValue('brief');
  if(!x.created_at)sh.getRange(row,23).setValue(new Date().toISOString());
  sh.getRange(row,24).setValue(new Date().toISOString());
  SpreadsheetApp.flush();
  const fresh=productionRow_(id).item;
  syncProductionTasks_(fresh,{}, {id:'sheet',name:'Google Sheet'});
  if(book_().getSheetByName('ProductionTeam')&&[heads.indexOf('vj_name')+1,heads.indexOf('vj_id')+1,heads.indexOf('editor_name')+1,heads.indexOf('editor_id')+1].includes(e.range.getColumn())){
   ['VJ','Editor'].forEach(role=>{const extras=teamRows_().filter(t=>String(t.production_id)===id&&String(t.role)===role&&String(t.responsibility)==='Phối hợp'&&String(t.active).toLowerCase()!=='false').map(t=>String(t.telegram_id));saveTeamRole_(fresh,role,extras,{id:'sheet'})});
  }
  const sig=[fresh.vj_id,fresh.cam_id,fresh.editor_id,fresh.designer_id,fresh.approver_id,fresh.shoot_at,fresh.deadline].join('|');
  const props=PropertiesService.getScriptProperties(),k='V17V2PROD:'+id;
  if(props.getProperty(k)!==sig){notifyProductionAssignments_(fresh,{}, {id:'sheet',name:'Google Sheet'});props.setProperty(k,sig);try{dispatchNotifications();}catch(err){console.error(err);}}
  try{if(projectChatId_(fresh.project)){
    const groupKey='project:'+id+':created',groupSig=projectAssignmentSignature_(fresh),oldSig=props.getProperty('V20GROUPSIG:'+id);
    if(!rows_('Notifications').some(n=>String(n.event_key)===groupKey))projectNotify_(id,'created');
    else if(oldSig&&oldSig!==groupSig)projectNotify_(id,'assignment');
    else if(!oldSig)props.setProperty('V20GROUPSIG:'+id,groupSig);
  }}catch(err){console.error('Thông báo nhóm dự án: '+err);}
}


// ===== V18: project dashboard + Final/Published state + iPhone meeting form =====
function setupV18(){
  setupV17Ver2();
  const s=sheet_('ProductionItems'),heads=s.getRange(1,1,1,s.getLastColumn()).getValues()[0].map(String);
  ['published_status','published_at','published_by'].forEach(k=>{if(!heads.includes(k)){s.getRange(1,s.getLastColumn()+1).setValue(k);heads.push(k);}});
  if(s.getLastRow()>1){
    const all=s.getDataRange().getValues(),h=all[0].map(String),stage=h.indexOf('stage'),status=h.indexOf('published_status'),at=h.indexOf('published_at');
    for(let r=1;r<all.length;r++)if(String(all[r][stage])==='published'&&!String(all[r][status])){s.getRange(r+1,status+1).setValue('published');if(!all[r][at])s.getRange(r+1,at+1).setValue(all[r][h.indexOf('updated_at')]||new Date().toISOString());}
  }
  return 'V18 sẵn sàng: dashboard theo dự án, Video Final, trạng thái Đã đăng/Chưa đăng và form họp iPhone đã được cập nhật. Dữ liệu cũ được giữ nguyên.';
}

function setupV19(){setupV18();const s=sheet_('Announcements'),h=s.getRange(1,1,1,s.getLastColumn()).getValues()[0].map(String);if(!h.includes('image_url'))s.getRange(1,s.getLastColumn()+1).setValue('image_url');setupV19Approvals();setupProductionSheetView_();setupV19Team();}
function setupProductionSheetView_(){
 const s=sheet_('ProductionItems'),h=s.getRange(1,1,1,s.getLastColumn()).getValues()[0].map(String);
 const internal=['id','origin_idea_id','vj_id','cam_id','editor_id','designer_id','approver_id','created_by','published_status','published_by','created_at','updated_at','published_at'];
 internal.forEach(key=>{const c=h.indexOf(key)+1;if(c>0)s.hideColumns(c)});
 ['published_status','published_at','published_by'].forEach(key=>{const c=h.indexOf(key)+1;if(c>0&&s.getMaxRows()>1)s.getRange(2,c,s.getMaxRows()-1).clearDataValidations()});
 Object.keys(V17V2_NAME_COLS).forEach(key=>{const c=h.indexOf(key)+1;if(c>0)s.showColumns(c)});
 return 'ProductionItems chỉ hiện tên nhân sự và các cột nghiệp vụ; ID kỹ thuật được ẩn, dữ liệu vẫn giữ nguyên.';
}
const V19_APPROVALS={idea_approval:{label:'Idea',stage:'brief',next:'shoot',asset:'brief'},script_approval:{label:'Kịch bản',stage:'script',next:'shoot',asset:'script_url'},final_approval:{label:'Video Final',stage:'review',next:'ready',asset:'final_url'}};
function assertFinalReviewable_(x){
 if(['ready','published'].includes(String(x.stage)))throw Error('Video Final đã được duyệt');
 if(String(x.idea_approval)!=='Duyệt')throw Error('Hãy duyệt Idea trước');
 
 if(!String(x.final_url||'').trim())throw Error('Cần có link Video Final trước khi duyệt');
}
function approvalColumn_(s,key){const h=productionHeaders_(s),i=h.indexOf(key);if(i<0)throw Error('Thiếu cột '+key+'; chạy setupV19Approvals một lần');return i+1;}
function setupV19Approvals(){
 const s=sheet_('ProductionItems'),h=s.getRange(1,1,1,s.getLastColumn()).getValues()[0].map(String),rule=SpreadsheetApp.newDataValidation().requireValueInList(['Duyệt','Không duyệt'],true).setAllowInvalid(false).build();
 Object.keys(V19_APPROVALS).forEach(key=>{if(!h.includes(key)){s.getRange(1,s.getLastColumn()+1).setValue(key);h.push(key);}s.getRange(2,h.indexOf(key)+1,Math.max(1,s.getMaxRows()-1)).setDataValidation(rule);});
 if(s.getLastRow()>1){const data=s.getDataRange().getValues();for(let i=1;i<data.length;i++){
  const stage=String(data[i][h.indexOf('stage')]||''),rank=['brief','script','shoot','edit','review','revision','ready','published'].indexOf(stage);
  if(rank>0&&!data[i][h.indexOf('idea_approval')])s.getRange(i+1,h.indexOf('idea_approval')+1).setValue('Duyệt');
  if(rank>1&&!data[i][h.indexOf('script_approval')])s.getRange(i+1,h.indexOf('script_approval')+1).setValue('Duyệt');
  if(['ready','published'].includes(stage)&&!data[i][h.indexOf('final_approval')])s.getRange(i+1,h.indexOf('final_approval')+1).setValue('Duyệt');
 }}
 return 'Đã tạo 3 cột duyệt Idea, Kịch bản, Video Final. Chọn Duyệt hoặc Không duyệt trên Sheet hoặc Mini App.';
}
function approvalSet_(u,id,key,decision,note,expected){productionWritable_(u);return createWriteScope_(()=>approvalSet_Data_(u,id,key,decision,note,expected))}
function approvalSet_Data_(u,id,key,decision,note,expected){
 if(key==='script_approval')throw Error('Không còn bước duyệt kịch bản riêng. Sau duyệt Idea, hãy lưu kịch bản và bàn giao Raw cho Editor.');
 if(!['idea_approval'].includes(key)||!['Duyệt','Không duyệt'].includes(decision))throw Error('Bước duyệt không hợp lệ');
 note=String(note||'').trim();if(decision==='Không duyệt'&&!note||note.length>1000)throw Error('Không duyệt cần ghi rõ lý do (tối đa 1000 ký tự)');
 const lock=LockService.getScriptLock();lock.waitLock(15000);let x;
 try{const f=productionRow_(id);x=f.item;const cfg=V19_APPROVALS[key];if(String(x.approver_id)!==String(u.id))throw Error('Bạn chưa được phân công duyệt Idea');if(tgApprovalsEnabled_()||expected)tgApprovalGuard_(u,x,'idea',expected);if(String(x.stage)!==cfg.stage)throw Error(cfg.label+' chưa ở bước chờ duyệt');if(key==='script_approval'&&String(x.idea_approval)!=='Duyệt')throw Error('Cần duyệt Idea trước khi duyệt kịch bản');if(decision==='Duyệt'&&!String(x[cfg.asset]||'').trim())throw Error('Cần có '+cfg.label+' trước khi duyệt');f.sheet.getRange(f.row,approvalColumn_(f.sheet,key)).setValue(decision);if(decision==='Duyệt'){performanceMilestone_(f,key==='idea_approval'?'idea':'script',key==='idea_approval'?[x.created_by]:[x.created_by,...teamIds_(x,'VJ')]);f.sheet.getRange(f.row,14).setValue(cfg.next);}f.sheet.getRange(f.row,24).setValue(new Date().toISOString());v20Set_(f,key+'_feedback',note);v20Set_(f,key+'_reviewer',u.id);v20Set_(f,key+'_reviewed_at',new Date().toISOString());tgApprovalAudit_(x,'idea',decision,note,u,expected);}finally{try{SpreadsheetApp.flush()}finally{lock.releaseLock()}}
 const recipients=[x.created_by,...teamIds_(x,'VJ'),x.cam_id];v20Notify_(x,key,decision,note,recipients,u);return expected?{ok:true}:productionResult_(id);
}
function decideProductionApproval(initData,id,key,decision,note){productionWritable_(auth_(initData));return approvalSet_(auth_(initData),id,key,decision,note);}

// ===== V20: shared projects, separate Final reviewers, expenses, equipment =====
const V20_COLUMNS=['content_approver_ids','media_approver_ids','content_approvers','media_approvers','content_final_approval','media_final_approval','idea_approval_feedback','idea_approval_reviewer','idea_approval_reviewed_at','script_approval_feedback','script_approval_reviewer','script_approval_reviewed_at','content_final_feedback','media_final_feedback','content_final_reviewer','media_final_reviewer','content_final_reviewed_at','media_final_reviewed_at','editor_handoff_signature','editor_handoff_at','editor_handoff_by','vj_final_required','vj_final_approval','vj_final_feedback','vj_final_reviewer','vj_final_reviewed_at','thumbnail_url','thumbnail_approval','thumbnail_feedback','thumbnail_reviewer','thumbnail_reviewed_at','thumbnail_not_required','thumbnail_assignee_id'];
function projectChatId_(project){const code=String(project||'').match(/^([A-Z0-9_-]+)\s+-\s+/i)?.[1]?.toUpperCase();if(!code)return '';const p=rows_('Projects').find(r=>String(r.code||'').trim().toUpperCase()===code);const id=String(p?.telegram_group_chat_id||'').trim();if(id&&!/^-\d{6,20}$/.test(id))throw Error('ID nhóm Telegram của '+code+' không hợp lệ trong Projects');return id;}
function projectAssignmentSignature_(x){const t=withProductionTeam_([x])[0],a=v20Approvers_(x);return [t.vj_ids.join(','),x.cam_id||'',t.editor_ids.join(','),x.designer_id||'',x.thumbnail_assignee_id||'',x.approver_id||'',a.content.join(','),a.media.join(','),x.shoot_at||'',x.deadline||'',x.publish_scheduled_at||''].join('|');}
function projectAssignmentChanged_(before,after){return projectAssignmentSignature_(before)!==projectAssignmentSignature_(after);}
function projectTeamSheetNotify_(id){try{const x=productionRow_(id).item,chat=projectChatId_(x.project);if(!chat)return;const props=PropertiesService.getScriptProperties(),k='V20GROUPSIG:'+id,prior=props.getProperty(k),sig=projectAssignmentSignature_(x);if(prior&&prior!==sig)projectNotify_(id,'assignment');else if(!prior)props.setProperty(k,sig)}catch(err){console.error('Thông báo nhóm dự án: '+err)}}
function projectMessage_(x,event,decision,note){
 const labels={created:'💡 IDEA MỚI',assignment:'🔄 THAY ĐỔI PHÂN CÔNG',idea_resubmitted:'💡 IDEA ĐÃ GỬI DUYỆT LẠI',handoff:'🎬 TƯ LIỆU ĐÃ BÀN GIAO',handoff_update:'🔄 TƯ LIỆU ĐƯỢC CẬP NHẬT',idea_approval:'DUYỆT IDEA',script_approval:'DUYỆT KỊCH BẢN',content_final_approval:'DUYỆT FINAL CONTENT',media_final_approval:'DUYỆT FINAL MEDIA',vj_final_approval:'DUYỆT FINAL VJ',thumbnail_submitted:'🖼️ THUMBNAIL CHỜ DUYỆT',thumbnail_review:'🖼️ DUYỆT THUMBNAIL',thumbnail_skipped:'🖼️ KHÔNG CẦN THUMBNAIL',review:'🎬 VIDEO FINAL CHỜ DUYỆT',published:'📣 VIDEO ĐÃ ĐĂNG','published-toggle':'📣 VIDEO ĐÃ ĐĂNG'};
 const lines=[(labels[event]||'CẬP NHẬT SẢN XUẤT')+' · '+x.project,'Nội dung: '+x.title];
 if(['idea_approval','script_approval','content_final_approval','media_final_approval','vj_final_approval'].includes(event)){
  lines.push('Kết quả: '+decision);
  if(note)lines.push('Phản hồi: '+String(note).slice(0,900));
  if(decision==='Duyệt'&&event==='idea_approval')lines.push('Bước tiếp theo: Chuẩn bị quay, lưu link kịch bản và Raw, Voice (nếu có), rồi bàn giao cho Editor.'+(x.shoot_at?'\nGiờ quay: '+stamp_(new Date(x.shoot_at),'dd/MM/yyyy HH:mm'):''));
  if(decision==='Duyệt'&&event==='script_approval')lines.push('Bước tiếp theo: Chuẩn bị quay');
  if(decision==='Duyệt'&&productionFinalKinds_(x).some(kind=>x[kind+'_final_approval']!=='Duyệt'))lines.push('Còn chờ các vai trò còn lại duyệt Final');
 }else if(['thumbnail_submitted','thumbnail_review','thumbnail_skipped'].includes(event)){lines.push('Thumbnail: '+(x.thumbnail_url||'Không dùng'), 'Kết quả: '+(decision||x.thumbnail_approval||'Chờ duyệt'));if(note)lines.push('Phản hồi: '+String(note).slice(0,900));
 }else if(event==='handoff'||event==='handoff_update'){
  
  lines.push('Kịch bản: '+(x.script_url||x.detailed_script_url||'Chưa có link'),'Raw: '+x.raw_url,'Voice: '+(x.voice_url||'Không có'),'Bước tiếp theo: Editor dựng và lưu link Final, rồi đánh dấu Đã đăng khi đã xuất bản');
 }else if(event==='idea_resubmitted'){
  lines.push('Bước tiếp theo: Duyệt lại Idea');
 }else if(event==='created'||event==='assignment'){
  const team=withProductionTeam_([x])[0],a=v20Approvers_(x),names=ids=>[...new Set(ids.map(String).filter(Boolean))].map(id=>person_(id)?.name||id).join(', ')||'Chưa phân công';
  lines.push('Người tạo: '+(person_(x.created_by)?.name||'—'),'VJ/KOL: '+names(team.vj_ids),'Cam-op: '+names([x.cam_id]),'Editor: '+names(team.editor_ids),'Người duyệt Idea: '+names([x.approver_id]));
  if(x.shoot_at)lines.push('Giờ quay: '+stamp_(new Date(x.shoot_at),'dd/MM/yyyy HH:mm'));
  if(x.deadline)lines.push('Deadline: '+stamp_(new Date(x.deadline),'dd/MM/yyyy HH:mm'));
 }
 lines.push('👉 Mở Mini App → Sản xuất để xem chi tiết.');return lines.join('\n');
}
function projectNotify_(id,event,decision,note){if(['review','content_final_approval','media_final_approval','vj_final_approval','thumbnail_submitted','thumbnail_review','thumbnail_skipped'].includes(event))return false;if(tgApprovalsEnabled_()&&['created','review','idea_resubmitted','idea_approval','content_final_approval','media_final_approval','vj_final_approval'].includes(event))return tgApprovalProjectEvent_(id,event);const x=productionRow_(id).item,chat=projectChatId_(x.project);if(!chat)return false;const key='project:'+id+':'+event+(event==='created'?'':':'+String(x.updated_at||Date.now()));const s=sheet_('Notifications'),a=s.getDataRange().getValues();if(!a.slice(1).some(r=>String(r[1])===key))s.appendRow([Utilities.getUuid(),key,chat,projectMessage_(x,event,decision,note),'pending',new Date().toISOString(),'','']);if(event==='created'||event==='assignment')PropertiesService.getScriptProperties().setProperty('V20GROUPSIG:'+id,projectAssignmentSignature_(x));if(!V2016_WRITE_SCOPE&&!['created','handoff','handoff_update','idea_resubmitted','thumbnail_submitted','thumbnail_review','thumbnail_skipped'].includes(event))try{dispatchNotificationKey_(key)}catch(err){console.error(err)}return true;}
const V20_SHEETS={Projects:['code','name','created_by','created_at','telegram_group_chat_id'],Expenses:['id','telegram_id','project','production_id','description','amount_vnd','incurred_on','bill_file_id','bill_url','status','reviewed_by','feedback','created_at','reviewed_at','bank_account','bank_name','recipient_name','payment_file_id','payment_url','paid_by','paid_at'],EquipmentLoans:['id','telegram_id','device','borrow_at','return_at','note','status','reviewed_by','feedback','created_at','reviewed_at'],ProductionIdeaHistory:['id','production_id','version','old_title','old_brief','new_title','new_brief','changed_by','changed_at','previous_feedback','request_id'],ExpenseBankChanges:['id','expense_id','old_account','old_bank','old_recipient','new_account','new_bank','new_recipient','changed_by','changed_at','previous_reviewer','previous_reviewed_at']};
function ensureProjectGroupColumn_(){const sh=book_().getSheetByName('Projects');if(sh&&sh.getLastRow()>0&&!String(sh.getRange(1,5).getValue()).trim())sh.getRange(1,5).setValue('telegram_group_chat_id');}
function setupV20(){setupV19();ensureProjectGroupColumn_();const b=book_(),s=sheet_('ProductionItems'),h=s.getRange(1,1,1,s.getLastColumn()).getValues()[0].map(String);V20_COLUMNS.forEach(k=>{if(!h.includes(k)){s.getRange(1,s.getLastColumn()+1).setValue(k);h.push(k)}});Object.entries(V20_SHEETS).forEach(([n,cols])=>{const sh=b.getSheetByName(n)||b.insertSheet(n);if(!sh.getLastRow()){sh.appendRow(cols);sh.setFrozenRows(1)}else{const old=sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0].map(String),used=old.filter(Boolean).length,prefix=Math.min(used,cols.length);if(used>cols.length&&!['Expenses','EquipmentLoans'].includes(n)||old.slice(0,prefix).some((col,i)=>col!==cols[i]))throw Error('Header '+n+' không đúng');for(let i=prefix;i<cols.length;i++)sh.getRange(1,i+1).setValue(cols[i])}});const notificationSheet=sheet_('Notifications');for(const [col,name] of [[9,'photo_file_id'],[10,'attempts'],[11,'next_attempt_at']]){const old=String(notificationSheet.getRange(1,col).getValue()).trim();if(old&&old!==name)throw Error('Header Notifications cột '+col+' không đúng');if(!old)notificationSheet.getRange(1,col).setValue(name)}V20_COLUMNS.forEach(k=>s.getRange(2,h.indexOf(k)+1,Math.max(1,s.getMaxRows()-1)).clearDataValidations());['content_approver_ids','media_approver_ids','editor_handoff_signature','thumbnail_reviewer','thumbnail_reviewed_at','thumbnail_assignee_id'].forEach(k=>s.hideColumns(h.indexOf(k)+1));const rule=SpreadsheetApp.newDataValidation().requireValueInList(['Duyệt','Không duyệt'],true).setAllowInvalid(false).build();['content_final_approval','media_final_approval','vj_final_approval','thumbnail_approval'].forEach(k=>s.getRange(2,h.indexOf(k)+1,Math.max(1,s.getMaxRows()-1)).setDataValidation(rule));const projects=sheet_('Projects'),known=new Set(rows_('Projects').map(p=>String(p.code)+' - '+String(p.name)));rows_('ProductionItems').forEach(x=>{const text=String(x.project||''),m=/^([A-Za-z0-9_-]+)\s+-\s+(.+)$/.exec(text);if(m&&!known.has(text)){projects.appendRow([m[1],m[2],x.created_by||'',new Date().toISOString(),'']);known.add(text)}});if(!PropertiesService.getScriptProperties().getProperty('BILL_FOLDER_ID'))PropertiesService.getScriptProperties().setProperty('BILL_FOLDER_ID',DriveApp.createFolder('Viral Network - Hoa don').getId());setupProductionSheetViewV20_();setupReadableOperationsSheets_();setupReadableV20PeopleSheets_();migrateThumbnailAssignees_();setupThumbnailNameColumn_();return 'V20.11.4 đã sẵn sàng: tên nhân sự trên các bảng chi phí và thiết bị.'}
function setupProductionSheetViewV20_(){const sh=sheet_('ProductionItems'),h=sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0].map(String);['review_note','final_approval','idea_approval_reviewer','idea_approval_reviewed_at','script_approval_reviewer','script_approval_reviewed_at','content_final_reviewer','media_final_reviewer','content_final_reviewed_at','media_final_reviewed_at','thumbnail_reviewer','thumbnail_reviewed_at'].forEach(k=>{const col=h.indexOf(k)+1;if(col>0)sh.hideColumns(col)});return 'Đã ẩn cột cũ và lịch sử kỹ thuật; dữ liệu vẫn giữ nguyên.'}
function migrateThumbnailAssignees_(){const prop='V20_THUMB_MIGRATED:'+prop_('SHEET_ID'),props=PropertiesService.getScriptProperties();if(props.getProperty(prop)==='1')return;const s=sheet_('ProductionItems'),h=s.getRange(1,1,1,s.getLastColumn()).getValues()[0].map(String),col=h.indexOf('thumbnail_assignee_id')+1;if(!col)throw Error('Thiếu thumbnail_assignee_id');const n=s.getLastRow()-1;if(n<=0)return;const raw=s.getRange(2,1,n,s.getLastColumn()).getValues(),changes=[];raw.forEach((r,i)=>{if(r[0]&&r[9]&&!r[col-1])changes.push([i+2,String(r[9])])});changes.forEach(([row,id])=>s.getRange(row,col).setValue(id));props.setProperty(prop,'1')}
function repairAttendanceWorkMinutes_(){const s=sheet_('Attendance'),n=s.getLastRow()-1;if(n<=0)return;const rows=s.getRange(2,1,n,11).getValues();rows.forEach((r,i)=>{if(!r[0])return;const value=Number(r[10]),valid=r[10]!==''&&Number.isFinite(value)&&value>=0,start=new Date(r[3]),end=new Date(r[4]);if(valid&&value>0||valid&&value===0&&!r[4])return;if(isNaN(start.getTime())||isNaN(end.getTime())||end<start){if(!valid)s.getRange(i+2,11).setValue(0);return}const day=dateKey_(r[2]),ls=new Date(day+'T'+(setting_('lunch_start')||'12:00')+':00+07:00'),le=new Date(day+'T'+(setting_('lunch_end')||'13:30')+':00+07:00'),lunch=Math.max(0,Math.min(end,le)-Math.max(start,ls)),minutes=Math.max(0,Math.round((end-start-lunch)/60000));if(!valid||minutes>0&&value===0)s.getRange(i+2,11).setValue(minutes)})}
function v20SheetFormula_(formula){const locale=String(book_().getSpreadsheetLocale()||'').toLowerCase();return /^(vi|fr|de|es|it|pt|nl|pl|id|ru|tr|sv|da|nb|fi|cs|sk|hu|ro|uk)([-_]|$)/.test(locale)||/[-_]vn$/.test(locale)?formula.replace(/,/g,';'):formula}
function setupReadableOperationsSheets_(){const name=idCol=>`=ARRAYFORMULA(IF(${idCol}2:${idCol}="","",IFNA(VLOOKUP(${idCol}2:${idCol},Employees!A:B,2,FALSE),"Chưa có tên")))`,view=(tab,raw,columns)=>{const s=sheet_(tab),h=s.getRange(1,1,1,s.getLastColumn()).getValues()[0].map(String);if(h.slice(0,raw).some((v,i)=>v!==HEADERS[tab][i])&&(tab!=='Leave'||h.slice(0,7).some((v,i)=>v!==HEADERS.Leave[i])))throw Error('Header '+tab+' đã đổi; cần kiểm tra trước khi tạo cột HR');columns.forEach(([title,formula])=>{let col=h.indexOf(title)+1;if(!col){col=s.getLastColumn()+1;s.getRange(1,col).setValue(title);h.push(title)}s.getRange(2,col).setFormula(v20SheetFormula_(formula))});s.setFrozenRows(1);s.hideColumns(1,raw);s.getRange(1,raw+1,1,columns.length).setFontWeight('bold').setBackground('#dff3e7')};
 const localTime=c=>`=ARRAYFORMULA(IF(${c}2:${c}="","",IFERROR(TEXT(MOD(IF(ISNUMBER(${c}2:${c}),${c}2:${c},DATEVALUE(LEFT(${c}2:${c},10))+TIMEVALUE(MID(${c}2:${c},12,8))+7/24),1),"HH:mm"),"")))`;
 const localDateTime=c=>`=ARRAYFORMULA(IF(${c}2:${c}="","",IFERROR(TEXT(IF(ISNUMBER(${c}2:${c}),${c}2:${c},DATEVALUE(LEFT(${c}2:${c},10))+TIMEVALUE(MID(${c}2:${c},12,8))+7/24),"dd/MM/yyyy HH:mm"),${c}2:${c})))`;
 repairAttendanceWorkMinutes_();view('Attendance',11,[['Ngày (xem)','=ARRAYFORMULA(IF(C2:C="","",IFERROR(TEXT(C2:C,"dd/MM/yyyy"),C2:C)))'],['Họ tên (xem)',name('B')],['Giờ vào (xem)',localTime('D')],['Giờ ra (xem)',localTime('E')],['Đi muộn (phút)','=ARRAYFORMULA(IF(B2:B="","",IFERROR(J2:J,0)))'],['Làm việc (phút)','=ARRAYFORMULA(IF(B2:B="","",IFERROR(K2:K,0)))']]);
 view('Tasks',11,[['Công việc (xem)','=ARRAYFORMULA(IF(A2:A="","",C2:C))'],['Người thực hiện (xem)',name('B')],['Hạn (xem)',localDateTime('G')],['Trạng thái (xem)','=ARRAYFORMULA(IF(A2:A="","",H2:H))'],['Người giao (xem)',name('K')],['Ngày giao (xem)',localDateTime('I')]]);
 const leave=sheet_('Leave'),head=leave.getRange(1,1,1,leave.getLastColumn()).getValues()[0].map(String);if(head[7]&&head[7]!=='reviewed_by')throw Error('Leave cột H đã có dữ liệu; chưa thể thêm người xử lý');if(!head[7])leave.getRange(1,8).setValue('reviewed_by');view('Leave',8,[['Nhân viên (xem)',name('B')],['Từ ngày (xem)','=ARRAYFORMULA(IF(A2:A="","",C2:C))'],['Đến ngày (xem)','=ARRAYFORMULA(IF(A2:A="","",D2:D))'],['Lý do (xem)','=ARRAYFORMULA(IF(A2:A="","",E2:E))'],['Duyệt nghỉ (xem)','=ARRAYFORMULA(IF(A2:A="","",F2:F))'],['Người xử lý (xem)',name('H')],['Ngày gửi (xem)',localDateTime('G')]])}
function setupReadableV20PeopleSheets_(){
 const name=c=>`=ARRAYFORMULA(IF(${c}2:${c}="","",IFNA(VLOOKUP(${c}2:${c},Employees!A:B,2,FALSE),"Chưa có tên")))`;
 const view=(tab,columns,technical)=>{const sh=sheet_(tab),base=V20_SHEETS[tab],h=sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0].map(String);if(base.some((col,i)=>h[i]!==col))throw Error('Header '+tab+' không đúng; chưa thể tạo cột tên');columns.forEach(([title,idCol])=>{let col=h.indexOf(title)+1;if(!col){col=sh.getLastColumn()+1;sh.getRange(1,col).setValue(title);h.push(title)}sh.getRange(2,col).setFormula(v20SheetFormula_(name(idCol)));sh.getRange(1,col).setFontWeight('bold').setBackground('#dff3e7')});technical.forEach(col=>sh.hideColumns(col));sh.setFrozenRows(1)};
 view('Expenses',[['Nhân viên gửi phiếu (xem)','B'],['Người duyệt chi (xem)','K'],['Người hoàn tiền (xem)','T']],[1,2,4,8,11,18,20]);
 view('EquipmentLoans',[['Người mượn (xem)','B'],['Người duyệt (xem)','H']],[1,2,8]);
}
function setupThumbnailNameColumn_(){const s=sheet_('ProductionItems'),h=s.getRange(1,1,1,s.getLastColumn()).getValues()[0].map(String),id=h.indexOf('thumbnail_assignee_id')+1;if(!id)return;let col=h.indexOf('thumbnail_assignee_name')+1;if(!col){col=s.getLastColumn()+1;s.getRange(1,col).setValue('thumbnail_assignee_name')}let n=id,letter='';while(n){n--;letter=String.fromCharCode(65+n%26)+letter;n=Math.floor(n/26)}s.getRange(2,col).setFormula(v20SheetFormula_(`=ARRAYFORMULA(IF(${letter}2:${letter}="","",IFNA(VLOOKUP(${letter}2:${letter},Employees!A:B,2,FALSE),"Chưa có tên")))`))}
function v20Set_(f,k,v){if(V2016_WRITE_SCOPE&&Object.prototype.hasOwnProperty.call(f.item,k)&&String(f.item[k]??'')===String(v??''))return;const cell=f.sheet.getRange(f.row,approvalColumn_(f.sheet,k));if(!['content_final_approval','media_final_approval','vj_final_approval','thumbnail_approval'].includes(k))cell.clearDataValidations();cell.setValue(v)}
function v20Approvers_(x){const parse=v=>String(v||'').split(',').map(t=>t.trim()).filter(Boolean);return {content:parse(x.content_approver_ids),media:parse(x.media_approver_ids)}}
function v20ApproverInput_(data){return {content:[],media:[]};}

function v20CheckApproverChange_(x,data){return {content:[],media:[]};}

function v20SaveApprovers_(id,data,u){const f=productionRow_(id);productionExtraValue_(f,'vj_final_required',false);}

function v20ResetFinal_(f){tgRevisionBump_(f,'final');for(const k of ['content_final_approval','media_final_approval','content_final_feedback','media_final_feedback','content_final_reviewer','media_final_reviewer','content_final_reviewed_at','media_final_reviewed_at','vj_final_approval','vj_final_feedback','vj_final_reviewer','vj_final_reviewed_at','final_approval'])v20Set_(f,k,'')}
function v20Notify_(x,stage,decision,note,recipients,u){const nextStep=decision==='Duyệt'&&stage==='idea_approval'?'\nViệc tiếp theo: VJ/KOL và Cam-op chuẩn bị đi quay; lưu link kịch bản, Raw và Voice (nếu có), rồi bàn giao cho Editor.'+(x.shoot_at?'\nGiờ quay: '+stamp_(new Date(x.shoot_at),'dd/MM/yyyy HH:mm'):''):decision==='Duyệt'&&stage==='script_approval'?'\nViệc tiếp theo: VJ/KOL và Cam-op chuẩn bị đi quay.'+(x.shoot_at?'\nGiờ quay: '+stamp_(new Date(x.shoot_at),'dd/MM/yyyy HH:mm'):'')+(x.script_url?'\nKịch bản: '+x.script_url:''):'';const label={idea_approval:'IDEA',script_approval:'KỊCH BẢN',content_final_approval:'FINAL · CONTENT',media_final_approval:'FINAL · MEDIA',vj_final_approval:'FINAL · VJ CHÍNH'}[stage]||stage,body=(decision==='Duyệt'?'✅ ĐÃ DUYỆT ':'✏️ CẦN CHỈNH SỬA ')+label+'\nDự án: '+x.project+'\nNội dung: '+x.title+'\nNgười phản hồi: '+(u.name||person_(u.id)?.name||'Quản lý')+(note?'\nNhận xét: '+note:'')+nextStep+'\n👉 Mở Mini App → Sản xuất để xem chi tiết.';[...new Set(recipients.map(String).filter(Boolean))].forEach(id=>{const key='v20:review:'+x.id+':'+stage+':'+Date.now()+':'+id;queueNotification_(key,id,body);if(!tgApprovalsEnabled_())try{dispatchNotificationKey_(key)}catch(err){console.error(err)}});try{projectNotify_(x.id,stage,decision,note)}catch(err){console.error(err)}}
function v20FinalSet_(u,id,kind,decision,note,sheetMode,expected){productionWritable_(u);return createWriteScope_(()=>v20FinalSet_Data_(u,id,kind,decision,note,sheetMode,expected))}
function v20FinalSet_Data_(){throw Error('Đã bỏ duyệt Video Final. Lưu link Final rồi chọn Đã đăng trong Mini App.');}

function decideV20VjFinal(initData,id,decision,note){productionWritable_(auth_(initData));return v20FinalSet_(auth_(initData),id,'vj',decision,note,false)}
function decideV20Final(initData,id,decision,note){productionWritable_(auth_(initData));const u=auth_(initData),x=productionRow_(id).item,a=v20Approvers_(x),kind=a.content.includes(u.id)?'content':a.media.includes(u.id)?'media':'';if(!kind)throw Error('Bạn không được phân công duyệt Final');return v20FinalSet_(u,id,kind,decision,note,false)}
function createV20Project(initData,code,name){productionWritable_(auth_(initData));const u=auth_(initData);if(!isLeader_(u))throw Error('Leader trở lên mới được thêm dự án');code=String(code||'').trim().toUpperCase();name=String(name||'').trim();if(!/^[A-Z0-9_-]{2,20}$/.test(code)||!name||name.length>80)throw Error('Mã dự án hoặc tên không hợp lệ');const lock=LockService.getScriptLock();lock.waitLock(15000);try{if(rows_('Projects').some(x=>String(x.code).toUpperCase()===code))throw Error('Mã dự án đã tồn tại');sheet_('Projects').appendRow([code,name,u.id,new Date().toISOString(),'']);return {ok:true,projects:v20Projects_()}}finally{lock.releaseLock()}}
function v20Projects_(){const explicit=rows_('Projects').map(p=>String(p.code)+' - '+String(p.name)),legacy=rows_('ProductionItems').map(p=>String(p.project||'').trim());return [...new Set([...explicit,...legacy].filter(Boolean))].sort((a,b)=>a.localeCompare(b,'vi'))}
function v20Snapshot_(u){const me=String(u.id),hr=String(setting_('hr_telegram_id')||''),accountant=String(setting_('accountant_telegram_id')||''),isReviewer=me===accountant||isDirector_(u);return {financeAccess:isDirector_(u),projects:v20Projects_(),accountantId:accountant,expenses:expensesWithProduction_(rows_('Expenses').filter(x=>x.id&&(String(x.telegram_id)===me||isReviewer)).sort((a,b)=>(Date.parse(b.created_at)||0)-(Date.parse(a.created_at)||0)).slice(0,150)),equipmentLoans:rows_('EquipmentLoans').filter(x=>String(x.telegram_id)===me||me===hr||isDirector_(u)).slice(-150).reverse()}}
function setV20Accountant(initData,id){const u=auth_(initData);if(!isDirector_(u))throw Error('Chỉ Giám đốc được chọn kế toán');if(!person_(id))throw Error('Chọn nhân sự đang hoạt động');const s=sheet_('Settings'),a=s.getDataRange().getValues(),i=a.findIndex((r,k)=>k>0&&String(r[0])==='accountant_telegram_id');if(i>0)s.getRange(i+1,2).setValue(String(id));else s.appendRow(['accountant_telegram_id',String(id)]);V19_SETTINGS_CACHE=null;return {ok:true,accountantId:String(id)}}
function v20Bill_(data){const m=/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(data||''));if(!m||m[2].length>6*1024*1024)throw Error('Ảnh bill cần là JPG, PNG hoặc WebP, tối đa khoảng 4 MB');const bytes=Utilities.base64Decode(m[2]);if(bytes.length>4*1024*1024)throw Error('Ảnh bill quá 4 MB');const sig=bytes.slice(0,12).map(x=>x&255),jpeg=sig[0]===255&&sig[1]===216&&sig[2]===255,png=sig.slice(0,4).join(',')==='137,80,78,71',webp=String.fromCharCode(...sig.slice(0,4))==='RIFF'&&String.fromCharCode(...sig.slice(8,12))==='WEBP';if(!(m[1]==='image/jpeg'&&jpeg||m[1]==='image/png'&&png||m[1]==='image/webp'&&webp))throw Error('Định dạng ảnh bill không hợp lệ');return Utilities.newBlob(bytes,m[1],'bill.'+m[1].split('/')[1])}
function submitV20Expense(initData,data){
 const u=auth_(initData),id=String(data.request_id||''),amount=Number(data.amount_vnd),description=String(data.description||'').trim(),project=String(data.project||'').trim(),date=String(data.incurred_on||''),bankAccount=String(data.bank_account||'').replace(/\s/g,''),bankName=String(data.bank_name||'').trim(),recipientName=String(data.recipient_name||'').trim();
 if(!/^[0-9]{6,25}$/.test(bankAccount)||!bankName||bankName.length>100||!recipientName||recipientName.length>100)throw Error('Nhập đủ STK, ngân hàng và tên người nhận');
 if(!/^[A-Za-z0-9_-]{16,100}$/.test(id)||!description||description.length>300||!project||!v20Projects_().includes(project)||!Number.isInteger(amount)||amount<1000||amount>100000000||!/^\d{4}-\d{2}-\d{2}$/.test(date))throw Error('Phiếu chi chưa đủ thông tin');
 const productionId=expenseProductionRequired_(u,project,data.production_id);
 const approver=String(setting_('accountant_telegram_id')||'').trim();if(!person_(approver))throw Error('Giám đốc cần chọn kế toán trong mục Nhân sự');
 const lock=LockService.getScriptLock();lock.waitLock(15000);let row,warning='',queued=false;
 try{row=rows_('Expenses').find(x=>String(x.id)===id);
  if(row){if(String(row.telegram_id)!==u.id||Number(row.amount_vnd)!==amount||String(row.description)!==description||String(row.project)!==project||String(row.production_id)!==productionId)throw Error('Mã phiếu đã được dùng cho phiếu khác');}
  else{const photos=Array.isArray(data.bill_images)?data.bill_images:[data.bill_data];if(!photos.length||photos.length>10||photos.some(x=>typeof x!=='string')||photos.reduce((n,x)=>n+x.length,0)>12*1024*1024)throw Error('Chọn 1–10 ảnh bill, tổng dung lượng sau nén tối đa 12 MB');
   const blobs=photos.map(v20Bill_),folder=DriveApp.getFolderById(prop_('BILL_FOLDER_ID')),files=[];let attachmentSheet,attachmentBase=0;
   try{blobs.forEach((blob,i)=>files.push(folder.createFile(blob.setName('bill_'+id+'_'+(i+1)+'.'+blob.getName().split('.').pop()))));
    const sh=sheet_('Expenses'),values=[id,u.id,project,productionId,description,amount,date,files[0].getId(),files[0].getUrl(),'pending','','',new Date().toISOString(),'',bankAccount,bankName,recipientName,'','','',''];
    const attachments=expenseAttachmentsSheet_();const base=attachments.getLastRow()+1;attachmentSheet=attachments;attachmentBase=base;attachments.getRange(base,1,files.length,5).setValues(files.map((f,i)=>[id,i+1,f.getId(),f.getUrl(),new Date().toISOString()]));
    sh.getRange(expenseFreeRow_(sh,values.length),1,1,values.length).setValues([values]);row=Object.fromEntries(V20_SHEETS.Expenses.map((k,i)=>[k,values[i]??'']));
   }catch(err){if(!row){if(attachmentSheet&&attachmentBase)try{attachmentSheet.getRange(attachmentBase,1,files.length,5).clearContent()}catch(_){}files.forEach(f=>{try{f.setTrashed(true)}catch(_){}})}throw err;}
  }
  try{queueExpenseNotification_(row,approver);queued=true}catch(err){console.error(err);warning='Phiếu đã lưu; thông báo kế toán chưa được tạo. Bấm Kiểm tra thông báo để thử lại.'}
 }finally{lock.releaseLock()}
 let notification='pending';if(queued)try{notification=dispatchNotificationKey_('v20:expense:'+id).sent?'sent':'pending'}catch(err){console.error(err)}
 return {ok:true,expense:expensesWithProduction_([row])[0],notification,warning};
}
function expenseFreeRow_(sh,width){const n=Math.max(1,sh.getLastRow());if(n>1){const rows=sh.getRange(2,1,n-1,width).getValues();const blank=rows.findIndex(r=>r.every(v=>v===''||v===null));if(blank>=0)return blank+2;}if(n+1>sh.getMaxRows())sh.insertRowsAfter(sh.getMaxRows(),1);return n+1;}
function expenseAttachmentsSheet_(){const b=book_();let sh=b.getSheetByName('ExpenseAttachments');if(!sh){sh=b.insertSheet('ExpenseAttachments');sh.appendRow(['expense_id','position','file_id','file_url','created_at']);sh.setFrozenRows(1)}return sh;}
function queueExpenseNotification_(row,approver){if(row.status!=='pending')return;queueNotification_('v20:expense:'+row.id,approver,'🧾 PHIẾU CHI CHỜ DUYỆT\nMã phiếu: '+row.id+'\nNhân viên: '+(person_(row.telegram_id)?.name||'Nhân viên')+'\nDự án: '+row.project+'\nNội dung sản xuất: '+expenseProductionText_(row)+'\nKhoản chi: '+row.description+'\nSố tiền: '+Number(row.amount_vnd).toLocaleString('vi-VN')+' đ\n👉 Mở Mini App → Tiện ích → Báo chi phí để xem toàn bộ ảnh bill.');}
function retryV20ExpenseNotification(initData,id){const u=auth_(initData),row=rows_('Expenses').find(x=>String(x.id)===String(id));if(!row||String(row.telegram_id)!==u.id&&u.id!==String(setting_('accountant_telegram_id'))&&!isDirector_(u))throw Error('Bạn không được kiểm tra phiếu này');if(row.status!=='pending')return {ok:true,expense:expensesWithProduction_([row])[0],warning:'Phiếu đã được xử lý.'};const approver=String(setting_('accountant_telegram_id')||'').trim();if(!person_(approver))throw Error('Chưa chọn kế toán');const lock=LockService.getScriptLock();lock.waitLock(15000);try{queueExpenseNotification_(row,approver);const sh=sheet_('Notifications'),a=sh.getDataRange().getValues(),i=a.findIndex((r,k)=>k>0&&String(r[1])==='v20:expense:'+id);if(i>0&&String(a[i][4])==='sending')return {ok:true,expense:expensesWithProduction_([row])[0],warning:'Thông báo đang được gửi; chưa cần gửi lại.'};if(i>0&&String(a[i][4])!=='sent'){sh.getRange(i+1,3).setValue(approver);sh.getRange(i+1,5).setValue('pending');sh.getRange(i+1,10,1,2).setValues([[0,'']]);}}finally{lock.releaseLock()}const result=dispatchNotificationKey_('v20:expense:'+id);return {ok:true,expense:expensesWithProduction_([row])[0],warning:result.sent?'Thông báo đã gửi kế toán.':'Phiếu đã lưu; thông báo chưa gửi được. Xem cột error trong Notifications.'};}
function getV20ExpenseBills(initData,id){const u=auth_(initData),x=rows_('Expenses').find(r=>String(r.id)===String(id));if(!x)throw Error('Không thấy bill');if(String(x.telegram_id)!==u.id&&u.id!==String(setting_('accountant_telegram_id')||'')&&!isDirector_(u))throw Error('Bạn không được xem bill này');const sh=book_().getSheetByName('ExpenseAttachments'),files=sh?sh.getDataRange().getValues().slice(1).filter(r=>String(r[0])===String(id)).sort((a,b)=>Number(a[1])-Number(b[1])).map(r=>String(r[2])):[];return {ok:true,files:[...new Set([String(x.bill_file_id),...files].filter(Boolean))].slice(0,10)};}
function getV20ExpenseBillImage(initData,id,fileId){const info=getV20ExpenseBills(initData,id);if(!info.files.includes(String(fileId)))throw Error('Ảnh không thuộc phiếu này');const blob=DriveApp.getFileById(String(fileId)).getBlob(),bytes=blob.getBytes();if(bytes.length>4*1024*1024)throw Error('Ảnh bill quá lớn');return 'data:'+blob.getContentType()+';base64,'+Utilities.base64Encode(bytes);}
function setupV2022(){expenseAttachmentsSheet_();setupFastCreate();const triggers=ScriptApp.getProjectTriggers().filter(t=>t.getHandlerFunction()==='repairExpenseNotifications');triggers.slice(1).forEach(t=>ScriptApp.deleteTrigger(t));if(!triggers.length)ScriptApp.newTrigger('repairExpenseNotifications').timeBased().everyMinutes(1).create();repairExpenseNotifications();return 'V20.22 đã sẵn sàng. Dữ liệu cũ được giữ nguyên.';}

function reviewV20Expense(initData,id,decision,feedback){const u=auth_(initData),accountant=String(setting_('accountant_telegram_id')||'');if(u.id!==accountant&&!isDirector_(u))throw Error('Chỉ kế toán được duyệt chi phí');if(!['approved','rejected'].includes(decision))throw Error('Quyết định không hợp lệ');feedback=String(feedback||'').trim();if(decision==='rejected'&&!feedback||feedback.length>1000)throw Error('Không duyệt cần ghi rõ lý do');const lock=LockService.getScriptLock();lock.waitLock(15000);let row;try{const sh=sheet_('Expenses'),all=sh.getDataRange().getValues(),i=all.findIndex((r,k)=>k>0&&String(r[0])===String(id));if(i<0)throw Error('Không thấy phiếu chi');if(String(all[i][9])!=='pending')throw Error('Phiếu đã được xử lý');sh.getRange(i+1,10,1,5).setValues([[decision,u.id,feedback,all[i][12],new Date().toISOString()]]);row=rows_('Expenses').find(x=>String(x.id)===String(id))}finally{lock.releaseLock()}const key='v20:expense:review:'+id;queueNotification_(key,row.telegram_id,'🧾 PHIẾU CHI '+(decision==='approved'?'ĐÃ DUYỆT':'KHÔNG ĐƯỢC DUYỆT')+'\nDự án: '+row.project+'\nNội dung sản xuất: '+expenseProductionText_(row)+'\nSố tiền: '+Number(row.amount_vnd).toLocaleString('vi-VN')+' đ'+(feedback?'\nPhản hồi: '+feedback:'')+'\n👉 Xem chi tiết trong Mini App.');try{dispatchNotificationKey_(key)}catch(err){console.error(err)}return {ok:true,expense:expensesWithProduction_([row])[0]}}
function queueV20PaymentPhoto_(expense){
 const key='v20:expense:paid:'+expense.id,s=sheet_('Notifications'),all=s.getDataRange().getValues();
 if(all.slice(1).some(r=>String(r[1])===key))return;
 s.appendRow([Utilities.getUuid(),key,String(expense.telegram_id),'💸 ĐÃ HOÀN TIỀN\nDự án: '+expense.project+'\nNội dung sản xuất: '+expenseProductionText_(expense)+'\nKhoản chi: '+expense.description+'\nSố tiền: '+Number(expense.amount_vnd).toLocaleString('vi-VN')+' đ\nẢnh chuyển khoản được lưu trong Mini App → Tiện ích → Báo chi phí.','pending',new Date().toISOString(),'','',String(expense.payment_file_id)]);
}
function payV20Expense(initData,id,imageData){
 const u=auth_(initData),accountant=String(setting_('accountant_telegram_id')||'');
 if(u.id!==accountant&&!isDirector_(u))throw Error('Chỉ kế toán hoặc Giám đốc được xác nhận thanh toán');
 const lock=LockService.getScriptLock();lock.waitLock(15000);let expense;
 try{
  const sh=sheet_('Expenses'),all=sh.getDataRange().getValues(),i=all.findIndex((r,k)=>k>0&&String(r[0])===String(id));
  if(i<0)throw Error('Không thấy phiếu chi');
  if(String(all[i][9])==='paid'){expense=rows_('Expenses').find(x=>String(x.id)===String(id));if(!expense.payment_file_id)throw Error('Phiếu ghi đã thanh toán nhưng thiếu ảnh; cần kiểm tra Sheet');}
  else{
   if(String(all[i][9])!=='approved')throw Error('Chỉ phiếu đã duyệt mới được thanh toán');
   if(!String(all[i][14]||'').trim())throw Error('Nhân viên cần bổ sung STK trước khi thanh toán');
   const blob=v20Bill_(imageData),folder=DriveApp.getFolderById(prop_('BILL_FOLDER_ID'));
   const file=folder.createFile(blob.setName('chuyen_khoan_'+id+'.'+blob.getName().split('.').pop()));
   const updated=all[i].slice(9,21);updated[0]='paid';updated[8]=file.getId();updated[9]=file.getUrl();updated[10]=u.id;updated[11]=new Date().toISOString();sh.getRange(i+1,10,1,12).setValues([updated]);
   SpreadsheetApp.flush();expense=rows_('Expenses').find(x=>String(x.id)===String(id));
  }
 }finally{lock.releaseLock()}
 let warning='';try{queueV20PaymentPhoto_(expense)}catch(err){console.error(err);warning='Đã lưu thanh toán; cần kiểm tra hàng đợi thông báo Telegram.'}
 return {ok:true,expense:expensesWithProduction_([expense])[0],warning};
}
function getV20PaymentProof(initData,id){
 const u=auth_(initData),x=rows_('Expenses').find(r=>String(r.id)===String(id));
 if(!x||String(x.status)!=='paid'||!x.payment_file_id)throw Error('Phiếu chưa có ảnh chuyển khoản');
 if(String(x.telegram_id)!==u.id&&u.id!==String(setting_('accountant_telegram_id')||'')&&!isDirector_(u))throw Error('Bạn không được xem ảnh này');
 const blob=DriveApp.getFileById(String(x.payment_file_id)).getBlob(),bytes=blob.getBytes();
 if(bytes.length>4*1024*1024)throw Error('Ảnh chuyển khoản quá lớn');
 return 'data:'+blob.getContentType()+';base64,'+Utilities.base64Encode(bytes);
}
function v20ExpenseStatus(initData,id){const u=auth_(initData),x=rows_('Expenses').find(r=>String(r.id)===String(id));if(!x)throw Error('Không thấy phiếu chi');if(String(x.telegram_id)!==u.id&&u.id!==String(setting_('accountant_telegram_id')||'')&&!isDirector_(u))throw Error('Bạn không được xem phiếu này');return {ok:true,expense:expensesWithProduction_([x])[0]}}
function updateV20ExpenseBank(initData,id,data){
 const u=auth_(initData),account=String(data?.bank_account||'').replace(/\s/g,''),bank=String(data?.bank_name||'').trim(),name=String(data?.recipient_name||'').trim();
 if(!/^[0-9]{6,25}$/.test(account)||!bank||bank.length>100||!name||name.length>100)throw Error('Nhập đủ STK, ngân hàng và tên người nhận');
 const lock=LockService.getScriptLock();lock.waitLock(15000);let row,reapproval=false;
 try{const sh=sheet_('Expenses'),a=sh.getDataRange().getValues(),i=a.findIndex((r,k)=>k>0&&String(r[0])===String(id));if(i<0)throw Error('Không thấy phiếu chi');if(String(a[i][1])!==u.id)throw Error('Chỉ chủ phiếu được sửa tài khoản nhận tiền');if(!['pending','approved'].includes(String(a[i][9])))throw Error('Phiếu đã hoàn tất, không thể sửa STK');
  const old=a[i],changed=String(old[14]||'')!==account||String(old[15]||'')!==bank||String(old[16]||'')!==name;
  if(changed){sheet_('ExpenseBankChanges').appendRow([Utilities.getUuid(),String(id),String(old[14]||''),String(old[15]||''),String(old[16]||''),account,bank,name,u.id,new Date().toISOString(),String(old[10]||''),String(old[13]||'')]);sh.getRange(i+1,15,1,3).setValues([[account,bank,name]]);if(String(old[9])==='approved'){reapproval=true;sh.getRange(i+1,10,1,5).setValues([['pending','','',old[12],'']])}}
  row=rows_('Expenses').find(x=>String(x.id)===String(id))
 }finally{lock.releaseLock()}
 if(reapproval)try{const accountant=String(setting_('accountant_telegram_id')||'');queueNotification_('expense:bank-change:'+id+':'+Date.now(),accountant,'⚠️ STK PHIẾU CHI ĐÃ THAY ĐỔI\nNhân viên: '+u.name+'\nKhoản chi: '+row.description+'\nTài khoản mới: '+bank+' · '+account+' · '+name+'\nPhiếu chuyển về Chờ duyệt. Kiểm tra lại trước khi hoàn tiền.')}catch(err){console.error(err)}
 return {ok:true,expense:expensesWithProduction_([row])[0]};
}
function submitV20Loan(initData,data){const u=auth_(initData),id=String(data.request_id||''),device=String(data.device||'').trim(),borrow=new Date(data.borrow_at),back=new Date(data.return_at),hr=String(setting_('hr_telegram_id')||'');if(!person_(hr))throw Error('Giám đốc cần chọn HR');if(!/^[A-Za-z0-9_-]{16,100}$/.test(id)||!device||device.length>120||isNaN(borrow)||isNaN(back)||back<=borrow)throw Error('Thông tin phiếu mượn thiết bị không hợp lệ');const lock=LockService.getScriptLock();lock.waitLock(15000);let row;try{row=rows_('EquipmentLoans').find(x=>String(x.id)===id);if(row){if(String(row.telegram_id)!==u.id)throw Error('Mã phiếu đã được dùng');return {ok:true,loan:row}}const project=String(data.project||'').trim(),productionId=String(data.production_id||'');if(!project||project!=='Công việc nội bộ'&&!v20Projects_().includes(project))throw Error('Hãy chọn dự án hợp lệ');let production=null;if(productionId){production=productionVisibleRows_(u,teamRows_()).find(x=>String(x.id)===productionId&&String(x.project)===project);if(!production)throw Error('Nội dung không thuộc dự án hoặc bạn không có quyền xem')}const sh=sheet_('EquipmentLoans'),headers=sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0].map(String);if(!headers.includes('project'))throw Error('Hãy chạy setupV20Features trước');const values={id,telegram_id:u.id,device,borrow_at:borrow.toISOString(),return_at:back.toISOString(),note:String(data.note||'').slice(0,500),status:'pending',created_at:new Date().toISOString(),project,production_id:productionId,production_title:production?.title||'',employee_name:u.name};sh.appendRow(headers.map(k=>values[k]??''));row=rows_('EquipmentLoans').find(x=>String(x.id)===id)}finally{lock.releaseLock()}const key='v20:loan:'+id;queueNotification_(key,hr,'📷 PHIẾU MƯỢN THIẾT BỊ\nNhân viên: '+u.name+'\nDự án: '+row.project+(row.production_title?'\nNội dung: '+row.production_title:'')+'\nThiết bị: '+device+'\nTừ: '+stamp_(borrow,'dd/MM/yyyy HH:mm')+'\nTrả dự kiến: '+stamp_(back,'dd/MM/yyyy HH:mm')+'\n👉 Mở Mini App → Tiện ích để duyệt.');try{dispatchNotificationKey_(key)}catch(err){console.error(err)}return {ok:true,loan:row}}
function reviewV20Loan(initData,id,decision,feedback){const u=auth_(initData);if(u.id!==String(setting_('hr_telegram_id')||'')&&!isDirector_(u))throw Error('Chỉ HR được duyệt phiếu mượn');if(!['approved','rejected'].includes(decision))throw Error('Quyết định không hợp lệ');feedback=String(feedback||'').trim();if(decision==='rejected'&&!feedback||feedback.length>1000)throw Error('Không duyệt cần ghi rõ lý do');const lock=LockService.getScriptLock();lock.waitLock(15000);let row;try{const sh=sheet_('EquipmentLoans'),a=sh.getDataRange().getValues(),i=a.findIndex((r,k)=>k>0&&String(r[0])===String(id));if(i<0||String(a[i][6])!=='pending')throw Error('Phiếu không còn chờ duyệt');sh.getRange(i+1,7,1,5).setValues([[decision,u.id,feedback,a[i][9],new Date().toISOString()]]);row=rows_('EquipmentLoans').find(x=>String(x.id)===String(id))}finally{lock.releaseLock()}const key='v20:loan:review:'+id;queueNotification_(key,row.telegram_id,'📷 PHIẾU MƯỢN '+(decision==='approved'?'ĐÃ DUYỆT':'KHÔNG ĐƯỢC DUYỆT')+'\nThiết bị: '+row.device+(feedback?'\nPhản hồi: '+feedback:''));try{dispatchNotificationKey_(key)}catch(err){console.error(err)}return {ok:true,loan:row}}
function getV20ExpenseBill(initData,id){const u=auth_(initData),x=rows_('Expenses').find(r=>String(r.id)===String(id));if(!x)throw Error('Không thấy bill');if(String(x.telegram_id)!==u.id&&u.id!==String(setting_('accountant_telegram_id')||'')&&!isDirector_(u))throw Error('Bạn không được xem bill này');const blob=DriveApp.getFileById(String(x.bill_file_id)).getBlob(),bytes=blob.getBytes();if(bytes.length>4*1024*1024)throw Error('Ảnh bill quá lớn');return 'data:'+blob.getContentType()+';base64,'+Utilities.base64Encode(bytes)}
function publishProduction(initData,id,tiktok,facebook){productionWritable_(auth_(initData));
 const u=auth_(initData),tt=productionUrl_(tiktok),fb=productionUrl_(facebook),lock=LockService.getScriptLock();lock.waitLock(15000);let x;
 try{const f=productionRow_(id);x=f.item;if(!productionLead_(u,x)&&String(x.approver_id)!==u.id&&!teamIds_(x,'VJ').includes(u.id))throw Error('Bạn không được đánh dấu đã đăng');if(!['ready','published'].includes(String(x.stage))||!x.final_url||!productionFinalApproved_(x))throw Error('Cần bấm Gửi hoàn thành trước khi đánh dấu đã đăng');['tiktok_url','facebook_url','published_status','published_at','published_by','stage','updated_at'].forEach(k=>productionColumn_(f,k));productionSet_(f,'tiktok_url',tt);productionSet_(f,'facebook_url',fb);productionSet_(f,'published_status','published');productionSet_(f,'published_at',new Date().toISOString());productionSet_(f,'published_by',u.id);productionSet_(f,'updated_at',new Date().toISOString());productionSet_(f,'stage','published');}finally{lock.releaseLock()}
 let warning='';try{productionNotify_(x,'published','Video đã được đánh dấu Đã đăng',[x.created_by,...teamIds_(x,'VJ'),...teamIds_(x,'Editor')])}catch(e){console.error(e);warning='Đã lưu trạng thái; cần kiểm tra thông báo.'}return productionResult_(id,warning);
}
// V20.13: Main Mini App login when Telegram data is unavailable in HtmlService.
function botApi_(method,payload){
 const r=UrlFetchApp.fetch('https://api.telegram.org/bot'+prop_('BOT_TOKEN')+'/'+method,{method:'post',contentType:'application/json',payload:JSON.stringify(payload||{}),muteHttpExceptions:true});
 let data;try{data=JSON.parse(r.getContentText());}catch(e){throw Error('Telegram trả phản hồi không hợp lệ');}
 if(r.getResponseCode()!==200||!data.ok)throw Error('Telegram '+method+': '+String(data.description||r.getResponseCode()));
 return data.result;
}
function botUsername_(){
 const props=PropertiesService.getScriptProperties();let name=props.getProperty('BOT_USERNAME');
 if(!name){name=String(botApi_('getMe',{}).username||'');if(!/^\w+$/.test(name))throw Error('Không đọc được tên bot');props.setProperty('BOT_USERNAME',name);}
 return name;
}
function checkAppConnection(){
 const started=Date.now();book_().getId();botApi_('getMe',{});
 const employee=rows_('Employees').find(x=>String(x.active).toLowerCase()==='true'&&/^\d+$/.test(String(x.telegram_id)));
 if(!employee)throw Error('Employees chưa có tài khoản đang kích hoạt');
 const before=Date.now(),result=snapshotHome(launchToken_(employee.telegram_id));
 if(!result||!result.user||!result.user.id)throw Error('Không lấy được dữ liệu trang chủ');
 const report={sheetConnected:true,botConnected:true,homeLoadMs:Date.now()-before,totalMs:Date.now()-started};
 console.log(JSON.stringify(report));return report;
}
function mainLoginHash_(secret){return hex_(Utilities.computeHmacSha256Signature('main-login:'+secret,launchSecret_()));}
function beginMainLogin(){
 const name=botUsername_(),nonce=Utilities.getUuid().replace(/-/g,''),secret=Utilities.getUuid().replace(/-/g,'')+Utilities.getUuid().replace(/-/g,'');
 mainLoginStore_(nonce,{hash:mainLoginHash_(secret),created:Date.now(),id:''});
 return {nonce,secret,url:'https://t.me/'+name+'?start=signin_'+nonce};
}
function completeMainLogin_(nonce,id){
 if(!/^[a-f0-9]{32}$/.test(nonce))return false;
 const raw=mainLoginRead_(nonce);if(!raw)return false;
 const data=JSON.parse(raw);if(Date.now()-data.created>600000)return false;
 if(data.id&&data.id!==String(id))return false;
 data.id=String(id);mainLoginStore_(nonce,data);return true;
}
function pollMainLogin(nonce,secret){
 if(!/^[a-f0-9]{32}$/.test(String(nonce))||!/^[a-f0-9]{64}$/.test(String(secret)))throw Error('Phiên xác nhận không hợp lệ');
 const raw=mainLoginRead_(nonce);if(!raw)return {expired:true};
 let data=JSON.parse(raw);const expected=mainLoginHash_(secret);let diff=0;for(let i=0;i<64;i++)diff|=expected.charCodeAt(i)^String(data.hash).charCodeAt(i);if(diff)throw Error('Phiên xác nhận không hợp lệ');
 if(Date.now()-data.created>600000)return {expired:true};if(!data.id){pollBotUpdates();const latest=mainLoginRead_(nonce);if(latest)data=JSON.parse(latest);if(!data.id)return {pending:true};}
 const employee=rows_('Employees').find(x=>String(x.telegram_id)===data.id&&String(x.active).toLowerCase()==='true');if(!employee)throw Error('Tài khoản chưa được kích hoạt trong Employees');
 const body='v3.'+data.id+'.'+Math.floor((data.created+6*3600000)/1000)+'.'+nonce;
 return {token:body+'.'+hex_(Utilities.computeHmacSha256Signature(body,launchSecret_()))};
}
function setEmployeeMenu_(id){
 const url=prop_('WEB_APP_URL').split(/[?#]/)[0]+'?launch='+encodeURIComponent(launchToken_(id));
 return botApi_('setChatMenuButton',{chat_id:String(id),menu_button:{type:'web_app',text:'Mở app',web_app:{url}}});
}
function configureBotMenu(){
 const url=prop_('WEB_APP_URL').split(/[?#]/)[0];
 botApi_('setChatMenuButton',{menu_button:{type:'web_app',text:'Mở app',web_app:{url}}});
 const failures=[];let updated=0;
 const ids=[...new Set(rows_('Employees').filter(x=>String(x.active).toLowerCase()==='true'&&/^\d+$/.test(String(x.telegram_id))).map(x=>String(x.telegram_id)))];
 for(const id of ids)try{setEmployeeMenu_(id);updated++;}catch(e){failures.push(id+': '+e.message);}
 return {updated,failed:failures.length,failures};
}
function setupBotAccess(){
 launchSecret_();botUsername_();
 const hook=botApi_('getWebhookInfo',{});if(hook.url)botApi_('deleteWebhook',{drop_pending_updates:false});
 const triggers=ScriptApp.getProjectTriggers();if(!triggers.some(t=>t.getHandlerFunction()==='pollBotUpdates'))ScriptApp.newTrigger('pollBotUpdates').timeBased().everyMinutes(1).create();
 const menus=configureBotMenu();pollBotUpdates();return 'Đã bật đọc /start mỗi phút và nút Mở app riêng cho '+menus.updated+' nhân viên. '+(menus.failed?'Có '+menus.failed+' menu chưa cài được; nhân viên nhắn /start để thử lại.':'');
}
function sendLaunchButton_(id){
 const url=prop_('WEB_APP_URL').split(/[?#]/)[0]+'?launch='+encodeURIComponent(launchToken_(id));
 botApi_('sendMessage',{chat_id:String(id),text:'Bấm nút dưới đây để mở ứng dụng nội bộ. Không chuyển tiếp nút này cho người khác.',reply_markup:{inline_keyboard:[[{text:'Mở ứng dụng',web_app:{url}}]]}});
 try{setEmployeeMenu_(id);}catch(e){console.warn('Không cập nhật được menu cho nhân viên');}
}
function pollBotUpdates(){
 return botBackgroundJob_('bot-updates',()=>{const props=PropertiesService.getScriptProperties();
  const result=botApi_('getUpdates',{offset:Number(props.getProperty('BOT_OFFSET')||0),timeout:0,allowed_updates:['message','callback_query']}),allowed=new Set(rows_('Employees').filter(x=>String(x.active).toLowerCase()==='true').map(x=>String(x.telegram_id)));
  for(const update of result){
   if(update.callback_query)tgHandleApprovalCallback_(update.callback_query,update.update_id);
   const m=update.message;
   if(m)tgHandleApprovalFeedback_(m,update.update_id);
   if(m&&m.chat&&m.chat.type==='private'&&/^\/start(?:@\w+)?(?:\s|$)/.test(m.text||'')){
    const id=String(m.from.id);
    if(allowed.has(id)){
     const match=String(m.text||'').match(/^\/start(?:@\w+)?\s+signin_([a-f0-9]{32})\s*$/);
     if(match){const ok=completeMainLogin_(match[1],id);tgSend_(id,ok?'Đã xác nhận tài khoản. Quay lại Mini App đang mở, hoặc dùng nút Mở ứng dụng dưới đây.':'Phiên xác nhận đã hết hạn. Hãy mở lại Mini App để xác nhận mới.');}
     sendLaunchButton_(id);
    }else tgSend_(id,'Telegram ID của bạn: '+id+'\nHãy gửi ID này cho quản lý để thêm tài khoản vào Mini App, sau đó nhắn /start lại.');
   }
   props.setProperty('BOT_OFFSET',String(update.update_id+1));
  }
  if(tgApprovalsEnabled_())syncTelegramApprovals();
 });
}

// Remembered device sessions: no scheduled expiry, still checked against Employees.
function rememberedAuth_(token){
 const p=String(token).split('.');
 if(p.length!==4||p[0]!=='v4'||!/^\d+$/.test(p[1])||!/^[a-f0-9]{32}$/.test(p[2])||!/^[a-f0-9]{64}$/.test(p[3]))throw Error('Phiên ghi nhớ không hợp lệ');
 const actual=hex_(Utilities.computeHmacSha256Signature(p.slice(0,3).join('.'),launchSecret_()));let diff=0;for(let i=0;i<64;i++)diff|=actual.charCodeAt(i)^p[3].charCodeAt(i);if(diff)throw Error('Chữ ký phiên ghi nhớ không hợp lệ');
 const raw=PropertiesService.getScriptProperties().getProperty('REMEMBER_DEVICE:'+p[2]);
 if(!raw||String(JSON.parse(raw).id)!==p[1])throw Error('Phiên ghi nhớ đã bị thu hồi');
 return launchAuth_(launchToken_(p[1]));
}
function rememberDevice(initData,existing){
 const u=auth_(initData);
 if(existing)try{if(rememberedAuth_(existing).id===u.id)return {token:existing};}catch(e){}
 const nonce=Utilities.getUuid().replace(/-/g,''),body='v4.'+u.id+'.'+nonce;
 PropertiesService.getScriptProperties().setProperty('REMEMBER_DEVICE:'+nonce,JSON.stringify({id:u.id,created:Date.now()}));
 return {token:body+'.'+hex_(Utilities.computeHmacSha256Signature(body,launchSecret_()))};
}
function forgetDevice(initData,token){
 const u=auth_(initData),p=String(token||'').split('.');if(p[0]!=='v4'||p.length!==4)return {ok:true};
 const owner=rememberedAuth_(token);if(owner.id!==u.id)throw Error('Bạn không được thu hồi phiên của người khác');
 PropertiesService.getScriptProperties().deleteProperty('REMEMBER_DEVICE:'+p[2]);return {ok:true};
}
function revokeAllRememberedAccess(initData){
 const u=auth_(initData);if(!isDirector_(u))throw Error('Chỉ giám đốc được thu hồi tất cả phiên ghi nhớ');
 const props=PropertiesService.getScriptProperties(),all=props.getProperties();let count=0;
 Object.keys(all).filter(k=>k.startsWith('REMEMBER_DEVICE:')).forEach(k=>{props.deleteProperty(k);count++;});
 return 'Đã thu hồi '+count+' phiên ghi nhớ. Các nút mở riêng vẫn dùng được.';
}

// V20.15 personnel module. Existing operational schemas and workflows are retained.
const HR_EXTRA=['employee_id','employee_code','job_title','joined_on','left_on','revision','previous_telegram_ids','display_name'];
const HR_PRIVATE={BankProfiles:['employee_id','bank_name','account_number','holder_name','status','pending_json','revision','updated_at','updated_by'],PersonnelAudit:['id','employee_id','kind','actor_id','at','before_json','after_json']};
function hrLabel_(p){return String(p.name||'')+(p.employee_code?' · '+String(p.employee_code):'');}
function hrManager_(u){return isDirector_(u)||String(u.id)===String(setting_('accountant_telegram_id')||'');}
function hrRequireManager_(u){if(!hrManager_(u))throw Error('Chỉ kế toán hoặc giám đốc được quản lý hồ sơ nhân sự');}
function hrPrivateBook_(){const id=PropertiesService.getScriptProperties().getProperty('HR_PRIVATE_SHEET_ID');if(!id)throw Error('Chạy setupPersonnel một lần trước khi dùng hồ sơ');return SpreadsheetApp.openById(id);}
function hrPrivateRows_(name){const s=hrPrivateBook_().getSheetByName(name);if(!s)throw Error('Thiếu bảng hồ sơ riêng');const a=s.getDataRange().getValues(),h=a.shift();return a.filter(r=>r.some(v=>v!=='')).map(r=>Object.fromEntries(h.map((k,i)=>[k,cell_(k,r[i])])));}
function hrAudit_(employeeId,kind,actor,before,after){hrPrivateBook_().getSheetByName('PersonnelAudit').appendRow([Utilities.getUuid(),employeeId,kind,actor.id,new Date().toISOString(),JSON.stringify(before||{}),JSON.stringify(after||{})]);}
function setupPersonnel(){
 const lock=LockService.getScriptLock();lock.waitLock(15000);
 try{
  const s=sheet_('Employees'),h=s.getRange(1,1,1,s.getLastColumn()).getValues()[0].map(String);
  if(h.slice(0,5).join('|')!==HEADERS.Employees.join('|'))throw Error('Năm cột đầu Employees không đúng; chưa thay đổi dữ liệu');
  HR_EXTRA.forEach(k=>{if(!h.includes(k)){h.push(k);s.getRange(1,h.length).setValue(k);}});
  const a=s.getDataRange().getValues();
  for(let i=1;i<a.length;i++){if(!a[i].some(v=>v!==''))continue;const obj=Object.fromEntries(h.map((k,j)=>[k,a[i][j]]));if(!obj.employee_id)s.getRange(i+1,h.indexOf('employee_id')+1).setValue(Utilities.getUuid());if(!obj.revision)s.getRange(i+1,h.indexOf('revision')+1).setValue(1);s.getRange(i+1,h.indexOf('display_name')+1).setValue(hrLabel_(obj));}
  ['telegram_id','employee_code','previous_telegram_ids'].forEach(k=>s.getRange(2,h.indexOf(k)+1,Math.max(1,s.getMaxRows()-1)).setNumberFormat('@'));
  const props=PropertiesService.getScriptProperties();let id=props.getProperty('HR_PRIVATE_SHEET_ID');
  if(!id){const created=SpreadsheetApp.create('Viral Network - Ho so nhan su rieng');id=created.getId();props.setProperty('HR_PRIVATE_SHEET_ID',id);}
  const privateBook=SpreadsheetApp.openById(id);Object.entries(HR_PRIVATE).forEach(([n,cols])=>{const sh=privateBook.getSheetByName(n)||privateBook.insertSheet(n);if(!sh.getLastRow())sh.appendRow(cols);else if(sh.getRange(1,1,1,cols.length).getValues()[0].join('|')!==cols.join('|'))throw Error('Header hồ sơ riêng không đúng');});
  const bank=privateBook.getSheetByName('BankProfiles');bank.getRange(2,3,Math.max(1,bank.getMaxRows()-1)).setNumberFormat('@');
  hrRefreshNameDropdowns_();SpreadsheetApp.flush();return 'Đã bổ sung cột nhân sự, giữ nguyên 5 cột cũ. File ngân hàng/nhật ký riêng: '+privateBook.getUrl()+'. Không chia sẻ file này cho toàn bộ nhân viên.';
 }finally{lock.releaseLock();}
}
function hrRefreshNameDropdowns_(){
 const employees=sheet_('Employees'),h=employees.getRange(1,1,1,employees.getLastColumn()).getValues()[0].map(String),c=h.indexOf('display_name')+1;if(!c)return;
 const source=employees.getRange(2,c,Math.max(1,employees.getMaxRows()-1)),rule=SpreadsheetApp.newDataValidation().requireValueInRange(source,true).setAllowInvalid(false).build();
 for(const sh of book_().getSheets()){if(sh.getName()==='Employees'||sh.getLastRow()<2)continue;for(let col=1;col<=sh.getLastColumn();col++){const cell=sh.getRange(2,col),v=cell.getDataValidation();if(!v||cell.getFormula())continue;const args=v.getCriteriaValues(),range=args&&args[0];if(range&&typeof range.getSheet==='function'&&range.getSheet().getName()==='Employees')sh.getRange(2,col,Math.max(1,sh.getMaxRows()-1)).setDataValidation(rule);}}
}
function hrFind_(key){const rows=rows_('Employees'),p=rows.find(x=>String(x.employee_id)===String(key)||String(x.telegram_id)===String(key));if(!p||!p.employee_id)throw Error('Không thấy nhân viên hoặc chưa chạy setupPersonnel');return p;}
function hrPublic_(p){return {employee_id:String(p.employee_id||''),telegram_id:String(p.telegram_id||''),name:String(p.name||''),employee_code:String(p.employee_code||''),department:String(p.department||''),job_title:String(p.job_title||''),role:role_(p.role),active:String(p.active).toLowerCase()==='true',joined_on:dateKey_(p.joined_on),left_on:dateKey_(p.left_on),revision:Number(p.revision||1),display_name:hrLabel_(p)};}
function personnelDirectory(initData){const u=auth_(initData);hrRequireManager_(u);const people=rows_('Employees').map(hrPublic_);const issues=[];for(const p of people){if(!p.employee_code)issues.push(p.display_name+': chưa có mã nhân viên');if(!p.department)issues.push(p.display_name+': thiếu phòng ban');if(!p.telegram_id)issues.push(p.display_name+': thiếu Telegram ID');if(people.some(q=>q.employee_id!==p.employee_id&&p.employee_code&&q.employee_code.toUpperCase()===p.employee_code.toUpperCase()))issues.push(p.display_name+': trùng mã nhân viên');}return {people,issues,director:isDirector_(u)};}
function personnelDetail(initData,key){const u=auth_(initData);hrRequireManager_(u);return {employee:hrPublic_(hrFind_(key))};}
function hrValidation_(data,before,all,u){
 const out={telegram_id:String(data.telegram_id||'').trim(),name:String(data.name||'').trim(),employee_code:String(data.employee_code||'').trim(),department:String(data.department||'').trim(),job_title:String(data.job_title||'').trim(),role:String(data.role||'employee'),active:data.active===true||data.active==='true',joined_on:String(data.joined_on||''),left_on:String(data.left_on||'')};
 if(/^[=+@]/.test(out.name)||/^[=+@]/.test(out.department)||/^[=+@]/.test(out.job_title)||!/^\d{5,20}$/.test(out.telegram_id)||!out.name||out.name.length>100||!out.department||out.department.length>100||!out.employee_code||out.employee_code.length>40||! /^[A-Za-z0-9._-]+$/.test(out.employee_code)||out.job_title.length>100||!['employee','leader','director'].includes(out.role))throw Error('Nhập tên, Telegram ID, mã nhân viên, phòng ban và quyền hợp lệ');
 for(const k of ['joined_on','left_on'])if(out[k]&&(!/^\d{4}-\d{2}-\d{2}$/.test(out[k])||isNaN(new Date(out[k]))||new Date(out[k]).toISOString().slice(0,10)!==out[k]))throw Error('Ngày không hợp lệ');
 if(out.joined_on&&out.left_on&&out.left_on<out.joined_on)throw Error('Ngày nghỉ việc phải sau ngày vào làm');
 if(all.some(p=>String(p.employee_id)!==String(before?.employee_id||'')&&String(p.employee_code||'').toUpperCase()===out.employee_code.toUpperCase()))throw Error('Mã nhân viên đã được cấp cho người khác');
 if(all.some(p=>String(p.employee_id)!==String(before?.employee_id||'')&&(String(p.telegram_id)===out.telegram_id||String(p.previous_telegram_ids||'').split(',').includes(out.telegram_id))))throw Error('Telegram ID đã thuộc hồ sơ khác, kể cả ID cũ');
 if(!isDirector_(u)&&((before&&role_(before.role)!==out.role)||(!before&&out.role!=='employee')||out.role==='director'))throw Error('Kế toán không được thay đổi quyền sử dụng');
 if(before&&role_(before.role)==='director'&&(!out.active||out.role!=='director')&&!all.some(p=>String(p.employee_id)!==String(before.employee_id)&&String(p.active).toLowerCase()==='true'&&role_(p.role)==='director'))throw Error('Phải giữ ít nhất một giám đốc đang hoạt động');
 return out;
}
function hrIdentityPlan_(oldId,newId){
 const fields=new Set(['telegram_id','assignee_id','creator_id','vj_id','cam_id','editor_id','designer_id','approver_id','media_id','created_by','updated_by','reviewed_by','paid_by','published_by','participant_ids','content_approver_ids','media_approver_ids','thumbnail_assignee_id','thumbnail_reviewer','accounting_reviewer','employee_ids','recipient_id','leader_id','idea_approval_reviewer','script_approval_reviewer','content_final_reviewer','media_final_reviewer','editor_handoff_by','vj_final_reviewer','changed_by','previous_reviewer','approver_ids']);const plan=[];
 for(const sh of book_().getSheets()){
  if(sh.getName()==='Employees'||sh.getLastRow()<2)continue;const a=sh.getDataRange().getValues(),h=a[0].map(String);
  for(let i=1;i<a.length;i++)for(let j=0;j<h.length;j++){
   let next=a[i][j];if(fields.has(h[j]))next=String(next??'').replace(/\d+/g,id=>id===oldId?newId:id);
   if((sh.getName()==='Tasks'&&h[j]==='id'||h[j]==='task_id')&&/^prod:/.test(String(next)))next=String(next).replace(/:(\d+)$/,(_,id)=>':'+(id===oldId?newId:id));
   if(sh.getName()==='Settings'&&j===1&&String(a[i][0]).endsWith('_telegram_id')&&String(next)===oldId)next=newId;
   if(String(next)!==String(a[i][j])){const cell=sh.getRange(i+1,j+1);if(cell.getFormula())throw Error('Ô '+sh.getName()+'!'+cell.getA1Notation()+' có công thức tham chiếu ID cũ; cần kiểm tra trước khi đổi Telegram ID');plan.push({cell,before:a[i][j],after:next});}
  }
 }
 return plan;
}
function savePersonnel(initData,data){
 const u=auth_(initData);hrRequireManager_(u);hrPrivateBook_();const lock=LockService.getScriptLock();lock.waitLock(15000);let before,after,identityChanged=false;
 try{
  const all=rows_('Employees');before=data.employee_id?hrFind_(data.employee_id):null;
  if(before&&Number(data.revision)!==Number(before.revision||1))throw Error('Hồ sơ đã được người khác sửa. Tải lại trước khi lưu');
  const values=hrValidation_(data,before,all,u),s=sheet_('Employees'),a=s.getDataRange().getValues(),h=a[0].map(String);if(!HR_EXTRA.every(k=>h.includes(k)))throw Error('Chạy setupPersonnel trước');
  const row=before?a.findIndex((r,i)=>i>0&&String(r[h.indexOf('employee_id')])===String(before.employee_id))+1:s.getLastRow()+1;
  after={...(before||{}),...values,employee_id:before?.employee_id||Utilities.getUuid(),revision:Number(before?.revision||0)+1};
  identityChanged=!!before&&String(before.telegram_id)!==values.telegram_id;
  if(identityChanged&&data.confirm_identity_change!==true)throw Error('Cần xác nhận cập nhật Telegram ID và liên kết lịch sử');
  after.previous_telegram_ids=[...new Set((String(before?.previous_telegram_ids||'').split(',').filter(Boolean)).concat(identityChanged?String(before.telegram_id):[]))].join(',');after.display_name=hrLabel_(after);
  const plan=identityChanged?hrIdentityPlan_(String(before.telegram_id),after.telegram_id):[];
  for(const k of ['telegram_id','name','department','role','active',...HR_EXTRA]){const j=h.indexOf(k);plan.push({cell:s.getRange(row,j+1),before:before?a[row-1][j]:'',after:after[k]??''});}
  const changed=[];
  try{for(const edit of plan){changed.push(edit);edit.cell.setValue(typeof edit.after==='string'&&/^[=+@]/.test(edit.after)?"'"+edit.after:edit.after);}SpreadsheetApp.flush();hrAudit_(after.employee_id,'personnel',u,before?hrPublic_(before):{},hrPublic_(after));}
  catch(e){for(const edit of changed.reverse())edit.cell.setValue(edit.before);SpreadsheetApp.flush();throw e;}
  V19_SETTINGS_CACHE=null;V19_SETTINGS_AT=0;V20_READ_SCOPE=null;
  if(identityChanged){const props=PropertiesService.getScriptProperties();for(const [key,value] of Object.entries(props.getProperties()))if(key.startsWith('REMEMBER_DEVICE:')&&hrRememberedId_(value)===String(before.telegram_id))props.deleteProperty(key);props.deleteProperty('BOT_USERNAME');}
 }finally{lock.releaseLock();}
 let warning='';if(identityChanged)try{setEmployeeMenu_(after.telegram_id);}catch(e){warning='Đã lưu hồ sơ. Tài khoản Telegram mới cần nhắn /start để nhận nút mở.';}
 return {ok:true,employee:hrPublic_(after),identityChanged,selfChanged:identityChanged&&String(before.telegram_id)===String(u.id),selfAccessChanged:!!before&&String(before.telegram_id)===String(u.id)&&(!after.active||role_(before.role)!==after.role),warning};
}
function personnelHistory(initData,key,offset){const u=auth_(initData);hrRequireManager_(u);const p=hrFind_(key),page=Math.max(0,Number(offset)||0),all=hrPrivateRows_('PersonnelAudit').filter(x=>String(x.employee_id)===String(p.employee_id)&&x.kind==='personnel').reverse();return {items:all.slice(page,page+20).map(x=>({...x,before:JSON.parse(x.before_json||'{}'),after:JSON.parse(x.after_json||'{}'),before_json:undefined,after_json:undefined})),hasMore:all.length>page+20};}
function restorePersonnel(initData,key,auditId,revision){const u=auth_(initData);hrRequireManager_(u);const p=hrFind_(key),entry=hrPrivateRows_('PersonnelAudit').find(x=>String(x.id)===String(auditId)&&String(x.employee_id)===String(p.employee_id)&&x.kind==='personnel');if(!entry)throw Error('Không thấy nhật ký');const old=JSON.parse(entry.before_json||'{}');if(!old.telegram_id)throw Error('Không thể khôi phục trước khi hồ sơ được tạo');return savePersonnel(initData,{...old,employee_id:p.employee_id,revision,confirm_identity_change:true});}
function bankProfile(initData,key){const u=auth_(initData),p=hrFind_(key||u.id);if(!hrManager_(u)&&String(p.telegram_id)!==u.id)throw Error('Bạn không được xem tài khoản ngân hàng của người khác');const row=hrPrivateRows_('BankProfiles').find(x=>String(x.employee_id)===String(p.employee_id));return {employee:hrPublic_(p),manager:hrManager_(u),bank:row?{...row,pending:JSON.parse(row.pending_json||'null'),pending_json:undefined}:{employee_id:p.employee_id,revision:0,status:'empty'}};}
function proposeBankProfile(initData,key,data,revision){
 const u=auth_(initData),p=hrFind_(key||u.id);if(!hrManager_(u)&&String(p.telegram_id)!==u.id)throw Error('Bạn không được sửa ngân hàng của người khác');
 const proposed={bank_name:String(data.bank_name||'').trim(),account_number:String(data.account_number||'').replace(/\s/g,''),holder_name:String(data.holder_name||'').trim()};
 if(/^[=+@]/.test(proposed.bank_name)||/^[=+@]/.test(proposed.holder_name)||!proposed.bank_name||proposed.bank_name.length>100||!/^\d{6,25}$/.test(proposed.account_number)||!proposed.holder_name||proposed.holder_name.length>100)throw Error('Nhập đủ ngân hàng, số tài khoản và tên chủ tài khoản');
 const lock=LockService.getScriptLock();lock.waitLock(15000);try{const s=hrPrivateBook_().getSheetByName('BankProfiles'),a=s.getDataRange().getValues(),idx=a.findIndex((r,i)=>i>0&&String(r[0])===String(p.employee_id)),old=idx>0?Object.fromEntries(HR_PRIVATE.BankProfiles.map((k,j)=>[k,a[idx][j]])):{};if(Number(old.revision||0)!==Number(revision||0))throw Error('Thông tin ngân hàng đã thay đổi. Hãy tải lại');const next={...old,employee_id:p.employee_id,status:'pending',pending_json:JSON.stringify(proposed),revision:Number(old.revision||0)+1,updated_at:new Date().toISOString(),updated_by:u.id};const row=idx>0?idx+1:s.getLastRow()+1;const range=s.getRange(row,1,1,HR_PRIVATE.BankProfiles.length);try{range.setNumberFormat('@').setValues([HR_PRIVATE.BankProfiles.map(k=>next[k]??'')]);hrAudit_(p.employee_id,'bank_proposal',u,old,next);}catch(e){range.setValues([HR_PRIVATE.BankProfiles.map(k=>old[k]??'')]);throw e;}return {ok:true};}finally{lock.releaseLock();}
}
function reviewBankProfile(initData,key,decision,revision){
 const u=auth_(initData);hrRequireManager_(u);if(!['approve','reject'].includes(decision))throw Error('Quyết định không hợp lệ');const p=hrFind_(key),lock=LockService.getScriptLock();lock.waitLock(15000);
 try{const s=hrPrivateBook_().getSheetByName('BankProfiles'),a=s.getDataRange().getValues(),i=a.findIndex((r,k)=>k>0&&String(r[0])===String(p.employee_id));if(i<0)throw Error('Chưa có thông tin chờ duyệt');const old=Object.fromEntries(HR_PRIVATE.BankProfiles.map((k,j)=>[k,a[i][j]]));if(Number(old.revision)!==Number(revision)||old.status!=='pending')throw Error('Thông tin đã thay đổi hoặc đã xử lý');const proposed=JSON.parse(old.pending_json||'{}'),next={...old,...(decision==='approve'?proposed:{}),status:decision==='approve'?'approved':old.account_number?'approved':'empty',pending_json:'',revision:Number(old.revision)+1,updated_at:new Date().toISOString(),updated_by:u.id};try{s.getRange(i+1,1,1,HR_PRIVATE.BankProfiles.length).setNumberFormat('@').setValues([HR_PRIVATE.BankProfiles.map(k=>next[k]??'')]);hrAudit_(p.employee_id,'bank_'+decision,u,old,next);}catch(e){s.getRange(i+1,1,1,HR_PRIVATE.BankProfiles.length).setValues([HR_PRIVATE.BankProfiles.map(k=>old[k]??'')]);throw e;}return {ok:true};}finally{lock.releaseLock();}
}

function hrRememberedId_(value){try{return String(JSON.parse(value).id)}catch(e){return ''}}

// Pending requests survive Apps Script cache eviction. A nonce is not an auth credential.
function mainLoginRead_(nonce){return PropertiesService.getScriptProperties().getProperty('MAIN_LOGIN:'+nonce)||CacheService.getScriptCache().get('main-login:'+nonce)}
function mainLoginStore_(nonce,data){const props=PropertiesService.getScriptProperties();for(const [key,value] of Object.entries(props.getProperties()))if(key.startsWith('MAIN_LOGIN:')){try{if(Date.now()-JSON.parse(value).created>600000)props.deleteProperty(key)}catch(e){props.deleteProperty(key)}}props.setProperty('MAIN_LOGIN:'+nonce,JSON.stringify(data));CacheService.getScriptCache().put('main-login:'+nonce,JSON.stringify(data),Math.max(1,Math.floor((data.created+600000-Date.now())/1000)))}

// V20.16: local caches are limited to one create request; no mutable production rows cached.
let V2016_WRITE_SCOPE=null;
function createWriteScope_(fn){if(V2016_WRITE_SCOPE)return fn();V2016_WRITE_SCOPE={};try{return fn()}finally{V2016_WRITE_SCOPE=null}}
function createProductionItem(initData,data){productionWritable_(auth_(initData));return createWriteScope_(()=>createProductionItemData_(initData,data))}
function createMeeting(initData,title,agenda,date,start,end,location,participants,requestId){return createWriteScope_(()=>createMeetingData_(initData,title,agenda,date,start,end,location,participants,requestId))}
function meetingResult_(m){if(!m)throw Error('Chưa tìm thấy cuộc họp đã lưu');return {...m,participant_ids:meetingIds_(m)}}
function meetingRequestStatus(initData,requestId){const u=auth_(initData);manager_(u);requestId=String(requestId||'');if(!/^[a-zA-Z0-9_-]{10,80}$/.test(requestId))throw Error('Mã yêu cầu không hợp lệ');const m=rows_('Meetings').find(x=>String(x.id)===u.id+':'+requestId);return m?{ok:true,found:true,meeting:meetingResult_(m)}:{ok:true,found:false}}
function setupFastCreate(){const triggers=ScriptApp.getProjectTriggers();for(const t of triggers)if(t.getHandlerFunction()==='dispatchNotifications')ScriptApp.deleteTrigger(t);ScriptApp.newTrigger('dispatchNotifications').timeBased().everyMinutes(1).create();return 'Đã cài gửi thông báo mỗi phút. Tạo cuộc họp trả kết quả sau lưu, không chờ Telegram hoặc tải lại toàn bộ app.'}

// ===== V20.19: performance milestones and equipment project links =====
function setupV20Features(){
 const lock=LockService.getScriptLock();lock.waitLock(15000);
 try{for(const [name,cols] of [['ProductionItems',['performance_milestones']],['EquipmentLoans',['project','production_id','production_title']]]){
  const s=sheet_(name),h=s.getRange(1,1,1,s.getLastColumn()).getValues()[0].map(String);
  for(const key of cols)if(!h.includes(key)){s.getRange(1,s.getLastColumn()+1).setValue(key);h.push(key)}
 }return 'V20.19 sẵn sàng. Giữ nguyên dữ liệu cũ; hiệu suất mới được ghi từ các mốc hoàn thành tiếp theo.';
 }finally{lock.releaseLock()}
}
function performanceMilestone_(f,key,ids){
 // No retrospective guesses: record the first verified milestone and its roster/deadline.
 if(typeof f.sheet.getLastColumn!=='function')return;
 const h=f.sheet.getRange(1,1,1,f.sheet.getLastColumn()).getValues()[0].map(String),col=h.indexOf('performance_milestones')+1;if(!col)return;
 const cell=f.sheet.getRange(f.row,col);let events;try{events=JSON.parse(String(cell.getValue()||'{}'))}catch(e){throw Error('Dữ liệu mốc hiệu suất không hợp lệ; cần kiểm tra Sheet')}
 if(events[key])return;
 events[key]={at:new Date().toISOString(),ids:[...new Set(ids.map(String).filter(Boolean))],deadline:String(f.item.deadline||'')};cell.setValue(JSON.stringify(events));
}
function productionStatMatches_(x,metric){
 if(metric==='all')return x.stage!=='deleted';
 if(x.stage==='deleted'||x.idea_approval!=='Duyệt')return false;
 x=normalizeProductionItem_(x);if(metric==='approved')return true;
 const published=x.stage==='published',finished=productionFinalApproved_(x);
 if(metric==='published')return published;if(published)return false;
 if(metric==='edited')return finished;
 const handedOff=!!(x.editor_received_at||x.editor_handoff_at)||(['edit','revision','review','ready'].includes(x.stage)&&!!x.raw_url);
 if(metric==='shooting')return !finished&&!handedOff;
 return metric==='waiting'&&!finished&&handedOff;
}

function equipmentProjectOptions(initData,project){return readScope_(()=>{const u=auth_(initData),projects=v20Projects_();project=String(project||'');if(project&&project!=='Công việc nội bộ'&&!projects.includes(project))throw Error('Dự án không hợp lệ');return {projects,items:project&&project!=='Công việc nội bộ'?productionVisibleRows_(u,teamRows_()).filter(x=>String(x.project)===project).map(x=>({id:String(x.id),title:String(x.title),shoot_at:String(x.shoot_at||'')})):[]}})}
// Performance scope follows the Leader's specialty across departments.
function performanceAccessText_(p){return (String(p.job_title||'')+' '+String(p.department||'')).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/gi,'d').toLowerCase();}
function performanceCanViewPerson_(u,p,actor){
 if(isDirector_(u)||String(p.telegram_id)===String(u.id))return true;
 if(u.role!=='leader'||role_(p.role)==='director')return false;
 const leader=performanceAccessText_(actor||u),person=performanceAccessText_(p);
 const content=/content|noi dung|sang tao/.test(leader),media=/media/.test(leader);
 if(content||media)return content&&/\bvj\b|\bkol\b|tal+ent/.test(person)||media&&/\bcam\b|\bquay\b|\beditor\b|\bedit\b|\bdung\b|ky thuat/.test(person);
 return String(p.department)===String(u.department);
}
function personnelPerformance(initData,month,personId){return readScope_(()=>{
 const u=auth_(initData),period=performancePeriod_(month);month=period.month;
 const everyone=rows_('Employees'),actor=everyone.find(p=>String(p.telegram_id)===String(u.id)),people=everyone.filter(p=>performanceCanViewPerson_(u,p,actor));
 personId=String(personId||'');const selected=personId?people.filter(p=>String(p.telegram_id)===personId):people;if(personId&&!selected.length)throw Error('Bạn không được xem hiệu suất của nhân viên này');
 const aliases=new Map();for(const p of everyone){aliases.set(String(p.telegram_id),String(p.telegram_id));for(const id of String(p.previous_telegram_ids||'').split(/[,;\s]+/).filter(Boolean))aliases.set(id,String(p.telegram_id))}
 const results=selected.map(p=>({id:String(p.telegram_id),name:hrLabel_(p),department:String(p.department||''),counts:{idea:0,script:0,shoot:0,edit:0,approved:0,thumbnail:0},completed:0,onTime:0,withDeadline:0,inProgress:0,overdue:0,items:[]})),byId=new Map(results.map(p=>[p.id,p])),companyVideos=new Set();
 const team=teamRows_(),now=Date.now(),seen=new Set();let untracked=0;
 for(const x of rows_('ProductionItems')){
  if(x.stage==='deleted'||seen.has(String(x.id)))continue;seen.add(String(x.id));let events={};try{events=JSON.parse(String(x.performance_milestones||'{}'))}catch(e){continue}
  if([x.created_by,x.vj_id,x.cam_id,x.editor_id,...teamIds_(x,'VJ',team),...teamIds_(x,'Editor',team)].some(id=>byId.has(String(id)))&&!Object.keys(events).length&&['edit','review','ready','published'].includes(String(x.stage)))untracked++;
  for(const key of ['idea','shoot','edit','approved']){let event=events[key];if(key==='edit'){const completedAt=x.final_completed_at||events.approved?.at;if(!completedAt)continue;event={...event,at:completedAt,ids:event?.ids||teamIds_(x,'Editor',team),deadline:event?.deadline||x.deadline};}if(!event?.at||!Number.isFinite(Date.parse(event.at))||!Array.isArray(event.ids)||!productionRangeMatches_(event.at,period))continue;
   const ids=[...new Set((event.ids||[]).map(id=>aliases.get(String(id))||String(id)))];let visible=false;
   for(const id of ids){const p=byId.get(id);if(!p)continue;visible=true;p.counts[key]++;if(key!=='approved'){p.completed++;const due=Date.parse(event.deadline);if(Number.isFinite(due)){p.withDeadline++;if(Date.parse(event.at)<=due)p.onTime++}}p.items.push({id:String(x.id),title:String(x.title||''),project:String(x.project||''),kind:key,at:event.at,deadline:event.deadline||''})}
   if(visible&&key==='approved')companyVideos.add(String(x.id));
  }
  if(!['published','ready','cancelled','canceled'].includes(String(x.stage))){const ids=new Set([x.created_by,x.cam_id,...teamIds_(x,'VJ',team),...teamIds_(x,'Editor',team)].filter(Boolean).map(String));for(const id of ids){const p=byId.get(id);if(!p)continue;p.inProgress++;if(x.deadline&&Date.parse(x.deadline)<now)p.overdue++}}
 }
 return {ok:true,month,period,scope:isDirector_(u)?'company':u.role==='leader'?'team':'self',people:people.map(p=>({id:String(p.telegram_id),name:hrLabel_(p)})),results,approvedVideos:companyVideos.size,untracked,notice:'Mỗi nội dung chỉ tính một lần cho từng mốc và từng người. Số đang làm/quá hạn là hiện tại. Dữ liệu cũ thiếu mốc không được đoán ngày hoàn thành.'};
})}

// ===== V20.20: office/shoot attendance with delegated review =====
const FIELD_CONFIG_HEADERS=['department','approver_ids','revision','updated_by','updated_at','history_json'];
function setupFieldAttendance(){
 setupV20Features();const lock=LockService.getScriptLock();lock.waitLock(15000);
 try{const s=sheet_('Attendance'),h=s.getRange(1,1,1,s.getLastColumn()).getValues()[0].map(String);for(const key of ['in_context','out_context'])if(!h.includes(key)){s.getRange(1,s.getLastColumn()+1).setValue(key);h.push(key)}
 const b=book_(),config=b.getSheetByName('AttendanceApprovers')||b.insertSheet('AttendanceApprovers');if(!config.getLastRow()){config.appendRow(FIELD_CONFIG_HEADERS);config.setFrozenRows(1)}else if(config.getRange(1,1,1,FIELD_CONFIG_HEADERS.length).getValues()[0].join('|')!==FIELD_CONFIG_HEADERS.join('|'))throw Error('Header AttendanceApprovers khác cấu trúc; giữ dữ liệu và kiểm tra trước');
 const settings=sheet_('Settings'),a=settings.getDataRange().getValues(),i=a.findIndex(r=>String(r[0])==='field_attendance_enabled');if(i>=0)settings.getRange(i+1,2).setValue('true');else settings.appendRow(['field_attendance_enabled','true']);V19_SETTINGS_CACHE=null;V19_SETTINGS_AT=0;
 return 'V20.20 đã bật. Giữ dữ liệu cũ; giám đốc vào Tiện ích → Duyệt chấm công để chọn người duyệt theo team.';
 }finally{lock.releaseLock()}
}
function fieldEnabled_(){return setting_('field_attendance_enabled')==='true'}
function fieldRequire_(){if(!fieldEnabled_())throw Error('Chạy setupFieldAttendance một lần trước khi dùng chấm công đi quay')}
function fieldContext_(value){if(!value)return null;try{const x=typeof value==='string'?JSON.parse(value):value;if(!x||!['office','shoot'].includes(x.mode)||!['approved','pending','needs_info'].includes(x.status))throw Error();return x}catch(e){throw Error('Thông tin chấm công bổ sung không hợp lệ; HR cần kiểm tra Sheet')}}
function fieldPoint_(row,kind){return fieldContext_(row[(kind==='in'?'in':'out')+'_context'])}
function fieldDecorate_(row){if(!row)return row;return {...row,in_context:fieldPoint_(row,'in'),out_context:fieldPoint_(row,'out')}}
function fieldIds_(value){return [...new Set(String(value||'').split(',').map(s=>s.trim()).filter(Boolean))]}
function fieldAccess_(u){if(!fieldEnabled_())return {enabled:false,canView:false};const configs=rows_('AttendanceApprovers'),depts=configs.filter(x=>fieldIds_(x.approver_ids).includes(String(u.id))).map(x=>String(x.department)),hr=String(u.id)===String(setting_('hr_telegram_id')||'');return {enabled:true,canView:isDirector_(u)||hr||depts.length>0,canReport:isDirector_(u)||hr||String(u.id)===String(setting_('accountant_telegram_id')||''),canConfigure:isDirector_(u),isHR:hr,departments:depts}}
function fieldCanReview_(u,point,owner){return String(u.id)!==String(owner)&&(isDirector_(u)||rows_('AttendanceApprovers').some(c=>String(c.department)===String(point.department)&&fieldIds_(c.approver_ids).includes(String(u.id))))}
function fieldAssignedShoot_(u,x,date,team){return !!x&&String(x.idea_approval)==='Duyệt'&&!['cancelled','canceled'].includes(String(x.stage))&&x.shoot_at&&Number.isFinite(Date.parse(x.shoot_at))&&stamp_(new Date(x.shoot_at),'yyyy-MM-dd')===date&&[String(x.cam_id||''),...teamIds_(x,'VJ',team)].includes(String(u.id))}
function fieldAttendanceOptions(initData,project){return readScope_(()=>{
 const u=auth_(initData);fieldRequire_();const today=stamp_(new Date(),'yyyy-MM-dd'),team=teamRows_(),projects=v20Projects_(),visible=productionVisibleRows_(u,team);project=String(project||'');if(project&&!projects.includes(project))throw Error('Dự án không hợp lệ');
 const items=visible.filter(x=>project?String(x.project)===project:fieldAssignedShoot_(u,x,today,team)).map(x=>({id:String(x.id),title:String(x.title),project:String(x.project),shoot_at:String(x.shoot_at||''),assignedToday:fieldAssignedShoot_(u,x,today,team)}));
 return {ok:true,projects,items,shift:rows_('Schedule').find(x=>String(x.telegram_id)===String(u.id)&&dateKey_(x.date)===today)||{start_time:setting_('start_time'),end_time:setting_('end_time')}};
})}
function fieldBuildPoint_(u,data,date,now){
 if(!data||!['office','shoot'].includes(data.mode))throw Error('Chọn Văn phòng hoặc Đi quay');
 const text=(key,max)=>{const v=String(data[key]||'').trim();if(v.length>max)throw Error('Thông tin '+key+' quá dài');return v};const place=text('place',200),project=text('project',120),productionId=text('production_id',100),reason=text('reason',1000);
 let pos=null;const gps=data.lat!==null&&data.lat!==undefined&&data.lat!==''&&data.lng!==null&&data.lng!==undefined&&data.lng!==''&&data.accuracy!==null&&data.accuracy!==undefined&&data.accuracy!=='';
 if(gps){const lat=Number(data.lat),lng=Number(data.lng),accuracy=Number(data.accuracy);if(!Number.isFinite(lat)||Math.abs(lat)>90||!Number.isFinite(lng)||Math.abs(lng)>180||!Number.isFinite(accuracy)||accuracy<0)throw Error('GPS không hợp lệ');pos={lat,lng,accuracy}}
 let production=null,auto=false,flags=[];
 if(data.mode==='office'){if(!pos)throw Error('Chấm công văn phòng cần GPS');location_(pos.lat,pos.lng,pos.accuracy);auto=true}
 else{if(!place||!project||!v20Projects_().includes(project))throw Error('Chọn dự án và nhập địa điểm quay');const team=teamRows_();if(productionId){production=productionVisibleRows_(u,team).find(x=>String(x.id)===productionId&&String(x.project)===project);if(!production)throw Error('Video không thuộc dự án hoặc bạn không có quyền xem')}
  if(!fieldAssignedShoot_(u,production,date,team))flags.push('Ngoài lịch quay được phân công hôm nay');if(!pos||pos.accuracy>100)flags.push(!pos?'Không lấy được GPS':'GPS chưa đủ chính xác');auto=!flags.length;if(!auto&&!reason)throw Error('Đi quay ngoài lịch hoặc thiếu GPS cần ghi lý do để người phụ trách xác nhận');
 }
 return {mode:data.mode,place:data.mode==='office'?'Văn phòng':place,project:data.mode==='shoot'?project:'',production_id:data.mode==='shoot'?productionId:'',production_title:production?.title||'',department:String(u.department||''),lat:pos?.lat??null,lng:pos?.lng??null,accuracy:pos?.accuracy??null,reason,flags,status:auto?'approved':'pending',revision:1,submitted_at:now,reviewed_by:auto?'system':'',reviewed_at:auto?now:'',feedback:auto?(data.mode==='office'?'GPS trong phạm vi văn phòng':'Đúng lịch quay và có GPS'):'',history:[{action:'submit',at:now,actor:String(u.id),status:auto?'approved':'pending'}]};
}
function fieldAttendance(initData,kind,data){
 const u=auth_(initData);fieldRequire_();if(!['in','out'].includes(kind))throw Error('Thao tác không hợp lệ');const lock=LockService.getScriptLock();lock.waitLock(15000);let result;
 try{const s=sheet_('Attendance'),a=s.getDataRange().getValues(),h=a[0].map(String),date=stamp_(new Date(),'yyyy-MM-dd'),now=new Date(),iso=now.toISOString(),i=a.findIndex((r,k)=>k>0&&String(r[1])===String(u.id)&&dateKey_(r[2])===date),contextCol=h.indexOf(kind+'_context');if(contextCol<0)throw Error('Chạy setupFieldAttendance trước');
  if(i>0&&(kind==='in'?a[i][3]:a[i][4]))return {ok:true,attendance:attendanceWithShift_(u,Object.fromEntries(h.map((k,j)=>[k,cell_(k,a[i][j])])),date),already:true};
  if(kind==='out'&&i<0)throw Error('Bạn chưa vào ca');const point=fieldBuildPoint_(u,data,date,iso),row=i>0?a[i].slice():Array(h.length).fill('');
  if(kind==='in'){const shift=rows_('Schedule').find(x=>String(x.telegram_id)===String(u.id)&&dateKey_(x.date)===date),[hh,mm]=String(shift?.start_time||setting_('start_time')).split(':').map(Number),minutes=Number(stamp_(now,'HH'))*60+Number(stamp_(now,'mm'));[row[0],row[1],row[2],row[3],row[5],row[6],row[9],row[10]]=[Utilities.getUuid(),String(u.id),date,iso,point.lat??'',point.lng??'',Math.max(0,minutes-hh*60-mm),0]}
  else{const start=new Date(row[3]);if(isNaN(start)||now<start)throw Error('Giờ vào không hợp lệ');row[4]=iso;row[7]=point.lat??'';row[8]=point.lng??'';const ls=new Date(date+'T'+(setting_('lunch_start')||'12:00')+':00+07:00'),le=new Date(date+'T'+(setting_('lunch_end')||'13:30')+':00+07:00'),lunch=Math.max(0,Math.min(now,le)-Math.max(start,ls));row[10]=Math.max(0,Math.round((now-start-lunch)/60000))}
  row[contextCol]=JSON.stringify(point);if(i>0){const cell=s.getRange(i+1,contextCol+1),previous=a[i][contextCol]||'';cell.setValue(row[contextCol]);try{s.getRange(i+1,1,1,11).setValues([row.slice(0,11)])}catch(e){cell.setValue(previous);throw e}}else s.appendRow(row);
  SpreadsheetApp.flush();const attendance=attendanceWithShift_(u,Object.fromEntries(h.map((k,j)=>[k,cell_(k,row[j])])),date);result={ok:true,attendance};
 }finally{lock.releaseLock()}
 try{fieldNotifyPending_(result.attendance,kind)}catch(e){console.error(e);result.warning='Đã lưu giờ chấm công; thông báo người duyệt đang cần kiểm tra.'}return result;
}
function fieldNotifyPending_(row,kind){const point=fieldPoint_(row,kind);if(point?.status!=='pending')return;const ids=new Set(rows_('AttendanceApprovers').filter(c=>String(c.department)===point.department).flatMap(c=>fieldIds_(c.approver_ids)).filter(id=>id!==String(row.telegram_id)&&person_(id)));if(!ids.size)people_().filter(p=>role_(p.role)==='director').forEach(p=>ids.add(String(p.telegram_id)));const text='📍 CHẤM CÔNG ĐI QUAY CHỜ XÁC NHẬN\nNhân viên: '+(person_(row.telegram_id)?.name||row.telegram_id)+'\n'+(kind==='in'?'Vào ca: ':'Xuống ca: ')+stamp_(new Date(kind==='in'?row.check_in:row.check_out),'dd/MM/yyyy HH:mm')+'\nDự án: '+point.project+'\nĐịa điểm: '+point.place+(point.production_title?'\nVideo: '+point.production_title:'')+'\nLý do: '+point.reason+'\n👉 Tiện ích → Duyệt chấm công';for(const id of ids)if(id!==String(row.telegram_id)&&person_(id))queueNotification_('field-attendance:'+row.id+':'+kind+':'+point.revision+':'+id,id,text)}
function fieldConfig(initData){const u=auth_(initData);fieldRequire_();if(!isDirector_(u))throw Error('Chỉ giám đốc được cấu hình người duyệt');return {ok:true,people:people_().map(p=>({id:String(p.telegram_id),name:String(p.name),department:String(p.department)})),teams:[...new Set([...people_().map(p=>String(p.department)),...rows_('AttendanceApprovers').map(c=>String(c.department))])].filter(Boolean).sort(),configs:rows_('AttendanceApprovers')}}
function saveFieldApprovers(initData,department,ids,revision){const u=auth_(initData);fieldRequire_();if(!isDirector_(u))throw Error('Chỉ giám đốc được chọn người duyệt');department=String(department||'').trim();if(!department||department.length>100||/^[=+@-]/.test(department))throw Error('Team không hợp lệ');if(!Array.isArray(ids)||ids.length>40)throw Error('Danh sách người duyệt không hợp lệ');ids=[...new Set(ids.map(String))];if(ids.some(id=>!person_(id)))throw Error('Người duyệt phải đang hoạt động');const lock=LockService.getScriptLock();lock.waitLock(15000);
 try{const s=sheet_('AttendanceApprovers'),a=s.getDataRange().getValues(),i=a.findIndex((r,k)=>k>0&&String(r[0])===department),old=i>0?Number(a[i][2]):0;if(Number(revision)!==old)throw Error('Cấu hình đã thay đổi; tải lại trước khi lưu');const history=i>0?JSON.parse(a[i][5]||'[]'):[],now=new Date().toISOString();history.push({at:now,actor:String(u.id),before:i>0?String(a[i][1]):'',after:ids.join(',')});const values=[department,ids.join(','),old+1,u.id,now,JSON.stringify(history)];if(i>0)s.getRange(i+1,1,1,values.length).setValues([values]);else s.appendRow(values);return {ok:true};}finally{lock.releaseLock()}}
function fieldReviewData(initData,date){return readScope_(()=>{
 const u=auth_(initData);fieldRequire_();const access=fieldAccess_(u);if(!access.canView)throw Error('Bạn chưa được phân công xem hoặc duyệt chấm công');date=validDate_(date||stamp_(new Date(),'yyyy-MM-dd'));if(date>stamp_(new Date(),'yyyy-MM-dd'))throw Error('Không xem ngày tương lai');const all=rows_('Employees'),people=new Map(all.map(p=>[String(p.telegram_id),p]));
 const items=rows_('Attendance').filter(r=>dateKey_(r.date)===date).map(fieldDecorate_).filter(r=>isDirector_(u)||access.isHR||[r.in_context?.department,r.out_context?.department,people.get(String(r.telegram_id))?.department].some(d=>access.departments.includes(String(d)))).map(r=>({...attendanceWithShift_({id:String(r.telegram_id)},r,date),name:hrLabel_(people.get(String(r.telegram_id))||{name:r.telegram_id}),department:people.get(String(r.telegram_id))?.department||'',canReviewIn:!!r.in_context&&fieldCanReview_(u,r.in_context,r.telegram_id),canReviewOut:!!r.out_context&&fieldCanReview_(u,r.out_context,r.telegram_id)}));
 return {ok:true,date,access,items,names:Object.fromEntries(all.map(p=>[String(p.telegram_id),hrLabel_(p)]))};
})}
function reviewFieldAttendance(initData,id,kind,decision,note,revision){
 const u=auth_(initData);fieldRequire_();if(!['in','out'].includes(kind)||!['approved','needs_info'].includes(decision))throw Error('Quyết định không hợp lệ');note=String(note||'').trim();if(note.length>1000||decision==='needs_info'&&!note)throw Error('Cần ghi rõ nội dung cần bổ sung');const lock=LockService.getScriptLock();lock.waitLock(15000);let row;
 try{const s=sheet_('Attendance'),a=s.getDataRange().getValues(),h=a[0].map(String),i=a.findIndex((r,k)=>k>0&&String(r[0])===String(id)),col=h.indexOf(kind+'_context');if(i<0||col<0)throw Error('Không thấy chấm công');row=Object.fromEntries(h.map((k,j)=>[k,cell_(k,a[i][j])]));const point=fieldPoint_(row,kind);if(!point||!fieldCanReview_(u,point,row.telegram_id))throw Error('Bạn không được duyệt chấm công này, hoặc đang duyệt chính mình');if(Number(revision)!==Number(point.revision)||point.status==='approved')throw Error('Chấm công đã được xử lý; tải lại');const now=new Date().toISOString();point.history.push({action:'review',at:now,actor:String(u.id),before:point.status,status:decision,note});Object.assign(point,{status:decision,reviewed_by:String(u.id),reviewed_at:now,feedback:note,revision:point.revision+1});s.getRange(i+1,col+1).setValue(JSON.stringify(point));row[kind+'_context']=point;
 }finally{lock.releaseLock()}
 let warning='';try{queueNotification_('field-result:'+id+':'+kind+':'+row[kind+'_context'].revision,row.telegram_id,'📍 CHẤM CÔNG '+(decision==='approved'?'ĐÃ XÁC NHẬN':'CẦN BỔ SUNG')+'\n'+(kind==='in'?'Vào ca':'Xuống ca')+' ngày '+row.date+(note?'\nGhi chú: '+note:'')+'\n👉 Mở Trang chủ để kiểm tra.')}catch(e){console.error(e);warning='Đã xác nhận; thông báo nhân viên cần kiểm tra'}return {ok:true,warning};
}
function supplementFieldAttendance(initData,id,kind,data,revision){
 const u=auth_(initData);fieldRequire_();if(!['in','out'].includes(kind))throw Error('Thao tác không hợp lệ');const lock=LockService.getScriptLock();lock.waitLock(15000);let row;
 try{const s=sheet_('Attendance'),a=s.getDataRange().getValues(),h=a[0].map(String),i=a.findIndex((r,k)=>k>0&&String(r[0])===String(id)),col=h.indexOf(kind+'_context');if(i<0||col<0||String(a[i][1])!==String(u.id))throw Error('Không có quyền sửa chấm công');row=Object.fromEntries(h.map((k,j)=>[k,cell_(k,a[i][j])]));const point=fieldPoint_(row,kind);if(!point||point.mode!=='shoot'||point.status==='approved'||Number(revision)!==Number(point.revision))throw Error('Chấm công đã thay đổi hoặc đã xác nhận');const reason=String(data?.reason||'').trim(),place=String(data?.place||'').trim();if(!reason||reason.length>1000||!place||place.length>200)throw Error('Nhập địa điểm và lý do bổ sung hợp lệ');const now=new Date().toISOString();point.history.push({action:'supplement',at:now,actor:String(u.id),before:{reason:point.reason,place:point.place,status:point.status},after:{reason,place}});Object.assign(point,{reason,place,status:'pending',revision:point.revision+1,reviewed_by:'',reviewed_at:'',feedback:''});s.getRange(i+1,col+1).setValue(JSON.stringify(point));row[kind+'_context']=point;
 }finally{lock.releaseLock()}
 let warning='';try{fieldNotifyPending_(row,kind)}catch(e){console.error(e);warning='Đã lưu bổ sung; thông báo người duyệt cần kiểm tra'}return {ok:true,attendance:attendanceWithShift_(u,row,dateKey_(row.date)),warning};
}
function fieldAttendanceReport(initData,month){return readScope_(()=>{
 const u=auth_(initData);fieldRequire_();const hr=String(u.id)===String(setting_('hr_telegram_id')||'');if(!hr&&!isDirector_(u)&&String(u.id)!==String(setting_('accountant_telegram_id')||''))throw Error('Chỉ HR, giám đốc hoặc kế toán được lấy bảng tổng hợp');month=String(month||'');if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw Error('Tháng không hợp lệ');const names=new Map(rows_('Employees').map(p=>[String(p.telegram_id),hrLabel_(p)]));
 const items=rows_('Attendance').filter(r=>dateKey_(r.date).startsWith(month)).map(fieldDecorate_).map(r=>{const done=!!r.check_out,confirmed=['in','out'].every(k=>!r[k+'_context']||r[k+'_context'].status==='approved');return {id:r.id,date:dateKey_(r.date),telegram_id:String(r.telegram_id),name:names.get(String(r.telegram_id))||r.telegram_id,check_in:r.check_in,check_out:r.check_out,work_minutes:Number(r.work_minutes||0),confirmed_minutes:done&&confirmed?Number(r.work_minutes||0):0,status:!done?'Chưa xuống ca':confirmed?'Đã xác nhận':'Chờ xác nhận / bổ sung',in_context:r.in_context,out_context:r.out_context}});
 return {ok:true,month,items,notice:'Giờ ghi nhận và giờ đã xác nhận được tách riêng; chưa phải bảng lương. Giữ cách trừ nghỉ trưa hiện tại, tăng ca duyệt riêng.'};
})}

// V20.21: readable, derived HR attendance. Never writes Attendance.
function hrTimeSetting_(value,fallback){
 if(value instanceof Date&&!isNaN(value.getTime()))return Utilities.formatDate(value,zone_(),'HH:mm');
 if(typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<1){const minutes=Math.round(value*1440)%1440;return String(Math.floor(minutes/60)).padStart(2,'0')+':'+String(minutes%60).padStart(2,'0')}
 const m=/^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(String(value??'').trim());if(m&&Number(m[1])<24&&Number(m[2])<60)return m[1].padStart(2,'0')+':'+m[2];
 return String(fallback||'');
}
function hrAttendanceMinutes_(row){
 if(!row.check_in||isNaN(new Date(row.check_in)))return null;if(!row.check_out)return 0;
 const start=new Date(row.check_in),end=new Date(row.check_out);if(isNaN(start)||isNaN(end)||end<start)return null;
 const day=dateKey_(row.date),ls=new Date(day+'T'+setting_('lunch_start')+':00+07:00'),le=new Date(day+'T'+setting_('lunch_end')+':00+07:00');
 if(isNaN(ls)||isNaN(le)||le<ls)return null;
 return Math.max(0,Math.round((end-start-Math.max(0,Math.min(end,le)-Math.max(start,ls)))/60000));
}
const HR_ATTENDANCE_HEADERS=['Ngày','Tháng','Họ tên','Mã nhân viên','Telegram ID','Phòng ban','Chức vụ','Giờ vào','Giờ ra','Hình thức vào','Hình thức ra','Dự án / địa điểm vào','Dự án / địa điểm ra','Trạng thái','Phút làm việc ghi nhận','Phút đã xác nhận','Đi muộn (phút)','Người duyệt vào','Người duyệt ra','Ghi chú','ID chấm công'];
function hrAttendanceViewRows_(attendance,employees){
 const names=new Map(employees.filter(p=>p.telegram_id).map(p=>[String(p.telegram_id),p]));
 const literal=value=>{const s=String(value??'');return /^[=+@-]/.test(s)?"'"+s:s};
 const time=v=>{const d=v?new Date(v):null;return d&&!isNaN(d)?Utilities.formatDate(d,'Asia/Ho_Chi_Minh','HH:mm:ss'):''};
 return attendance.filter(r=>r.id&&r.telegram_id).sort((a,b)=>String(dateKey_(b.date)).localeCompare(String(dateKey_(a.date)))||String(b.check_in).localeCompare(String(a.check_in))).map(r=>{
  const person=names.get(String(r.telegram_id))||{},points=[],notes=[];let invalid=false;
  for(const k of ['in','out']){try{points.push(fieldPoint_(r,k))}catch(e){points.push(null);invalid=true;notes.push('Thông tin '+(k==='in'?'vào':'ra')+' cần kiểm tra')}}
  const [pin,pout]=points,minutes=hrAttendanceMinutes_(r),date=dateKey_(r.date);if(minutes===null||!/^\d{4}-\d{2}-\d{2}$/.test(date)){invalid=true;notes.push('Ngày / giờ không hợp lệ')}
  const done=!!r.check_out,approved=!invalid&&points.every(p=>!p||p.status==='approved'),status=invalid?'Cần kiểm tra dữ liệu':points.some(p=>p?.status==='needs_info')?'Cần bổ sung':points.some(p=>p?.status==='pending')?'Chờ xác nhận':!done?'Chưa xuống ca':'Đã xác nhận';
  const mode=p=>p?.mode==='shoot'?'Đi quay':'Văn phòng',location=p=>p?[p.project,p.place].filter(Boolean).join(' · '):'',review=p=>p?.reviewed_by?(names.get(String(p.reviewed_by))?.name||p.reviewed_by):p?.status==='approved'?'Tự động':'';
  points.filter(Boolean).forEach(p=>{if(p.reason)notes.push(p.reason);if(p.feedback)notes.push(p.feedback)});
  const late=Number(r.late_minutes);return [date.replace(/^(\d{4})-(\d{2})-(\d{2})$/,'$3/$2/$1'),date.slice(0,7),person.name||'Chưa có tên',person.employee_code||'',String(r.telegram_id),person.department||'',person.job_title||'',time(r.check_in),time(r.check_out),mode(pin),done?mode(pout):'',location(pin),location(pout),status,minutes??'',done&&approved?minutes:0,Number.isFinite(late)&&late>=0?late:'',review(pin),review(pout),notes.join(' · '),String(r.id)].map(v=>typeof v==='string'?literal(v):v);
 });
}
function setupAttendanceHR(){
 const lock=LockService.getScriptLock();lock.waitLock(15000);try{
  const b=book_(),props=PropertiesService.getScriptProperties();let s=b.getSheetByName('Chấm công HR');const owned=props.getProperty('HR_ATTENDANCE_VIEW_ID');
  if(s&&s.getLastRow()&&owned!==String(s.getSheetId()))throw Error('Tab Chấm công HR đã có dữ liệu riêng. Hãy đổi tên tab đó trước để giữ dữ liệu.');
  if(!s)s=b.insertSheet('Chấm công HR');props.setProperty('HR_ATTENDANCE_VIEW_ID',String(s.getSheetId()));
  refreshAttendanceHR_();const triggers=ScriptApp.getProjectTriggers();if(!triggers.some(t=>t.getHandlerFunction()==='refreshAttendanceHR'))ScriptApp.newTrigger('refreshAttendanceHR').timeBased().everyMinutes(1).create();
  return 'Đã tạo Chấm công HR. Tự cập nhật khoảng mỗi phút; giữ nguyên Attendance. Không nhập sửa trong tab tổng hợp.';
 }finally{lock.releaseLock()}
}
function refreshAttendanceHR(){const lock=LockService.getScriptLock();if(!lock.tryLock(1000))return;try{return refreshAttendanceHR_()}finally{lock.releaseLock()}}
function refreshAttendanceHR_(){
 const s=book_().getSheetByName('Chấm công HR'),owned=PropertiesService.getScriptProperties().getProperty('HR_ATTENDANCE_VIEW_ID');if(!s||owned!==String(s.getSheetId()))throw Error('Chạy setupAttendanceHR trước');
 const data=readScope_(()=>hrAttendanceViewRows_(rows_('Attendance'),rows_('Employees'))),count=Math.max(2,data.length+1),width=HR_ATTENDANCE_HEADERS.length,previous=s.getLastRow();
 if(s.getMaxRows()<count)s.insertRowsAfter(s.getMaxRows(),count-s.getMaxRows());if(s.getMaxColumns()<width)s.insertColumnsAfter(s.getMaxColumns(),width-s.getMaxColumns());
 s.getRange(1,1,Math.max(previous,count),width).setNumberFormat('@');s.getRange(1,1,data.length+1,width).setValues([HR_ATTENDANCE_HEADERS,...data]);if(!data.length)s.getRange(2,1,1,width).clearContent();if(previous>count)s.getRange(count+1,1,previous-count,width).clearContent();
 s.getRange(1,1,1,width).setFontWeight('bold').setBackground('#dff3e7');s.setFrozenRows(1);s.setFrozenColumns(3);s.getRange(2,15,Math.max(1,count-1),3).setNumberFormat('0');
 const filter=s.getFilter();if(!filter||filter.getRange().getNumRows()!==Math.max(2,count)){const criteria=[];if(filter){for(let c=1;c<=width;c++)criteria.push(filter.getColumnFilterCriteria(c));filter.remove()}const fresh=s.getRange(1,1,Math.max(2,count),width).createFilter();criteria.forEach((v,i)=>{if(v)fresh.setColumnFilterCriteria(i+1,v)})}
 s.setColumnWidths(1,width,145);s.setColumnWidth(3,200);s.setColumnWidths(12,2,240);s.setColumnWidth(20,300);s.hideColumns(21);s.getRange(1,1).setNote('Tổng hợp tự động từ Attendance, giờ Việt Nam. Cập nhật: '+Utilities.formatDate(new Date(),'Asia/Ho_Chi_Minh','dd/MM/yyyy HH:mm:ss')+'. Không sửa dữ liệu trong tab này. Phút đã xác nhận chưa phải bảng lương.');
 return 'Đã cập nhật '+data.length+' dòng chấm công HR';
}

// V20.22: production capabilities follow the specific job title, independently of access role.
function productionCapabilities_(p){const text=String(p.job_title||p.department||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/gi,'d').toLowerCase(),out=[];if(/vj|kol|talent/.test(text))out.push('vj');if(/cam|quay|ky thuat|\bktv\b/.test(text))out.push('cam');if(/editor|edit|dung/.test(text))out.push('editor');if(/design|thiet ke|do hoa/.test(text))out.push('designer');if(/content|noi dung/.test(text))out.push('content');if(out.includes('editor')||out.includes('designer'))out.push('thumbnail');return out;}
function productionPickerPerson_(p){return {telegram_id:String(p.telegram_id),name:String(p.raw_name||p.name),employee_code:String(p.employee_code||''),job_title:String(p.job_title||p.department||''),department:String(p.department),role:role_(p.role),production_roles:productionCapabilities_(p)}}
function validateProductionAssignments_(vj,cam,editors,thumbnail,before){const old=before||{},team=before?withProductionTeam_([before])[0]:{};for(const [role,ids,previous] of [['vj',vj,team.vj_ids||[]],['cam',[cam],[old.cam_id]],['editor',editors,team.editor_ids||[]],['thumbnail',[thumbnail],[old.thumbnail_assignee_id]]])for(const id of ids.filter(Boolean)){if(previous.map(String).includes(String(id)))continue;const p=person_(id);if(!p||!productionCapabilities_(p).includes(role))throw Error('Nhân viên '+(p?.raw_name||p?.name||id)+' không phù hợp vị trí '+role);}}

function repairExpenseNotifications(){const lock=LockService.getScriptLock();if(!lock.tryLock(1000))return;try{const approver=String(setting_('accountant_telegram_id')||'').trim();if(!person_(approver))return;const keys=new Set(sheet_('Notifications').getDataRange().getValues().slice(1).map(r=>String(r[1])));let count=0;for(const row of expensesWithProduction_(rows_('Expenses')))if(row.id&&row.status==='pending'&&!keys.has('v20:expense:'+row.id)){queueExpenseNotification_(row,approver);if(++count>=30)break;}}finally{lock.releaseLock()}}

// V20.24: one-request roster/header caches; mutable task rows remain uncached.
function productionHeaders_(sheet){
 if(V2016_WRITE_SCOPE?.productionHeaders)return V2016_WRITE_SCOPE.productionHeaders;
 const headers=sheet.getRange(1,1,1,sheet.getLastColumn()).getValues()[0].map(String);
 if(V2016_WRITE_SCOPE)V2016_WRITE_SCOPE.productionHeaders=headers;
 return headers;
}
function assignProduction(initData,id,data){productionWritable_(auth_(initData));return createWriteScope_(()=>assignProductionData_(initData,id,data))}
function productionAssignmentStatus(initData,id,data){return createWriteScope_(()=>{
 const u=auth_(initData),x=withProductionTeam_([productionRow_(id).item])[0];
 if(!canAssignProduction_(u,x))throw Error('Bạn không có quyền kiểm tra phân công này');
 const sameIds=(a,b)=>[...new Set((a||[]).map(String))].sort().join(',')===[...new Set((b||[]).map(String))].sort().join(',');
 const ids=v20Approvers_(x),vj=teamInput_(data,'vj_ids',data.vj_id),editors=teamInput_(data,'editor_ids',data.editor_id);
 const sameTime=(a,b)=>!a&&!b||!!a&&!!b&&new Date(a).getTime()===new Date(b).getTime();
 const matches=sameIds(x.vj_ids,vj)&&sameIds(x.editor_ids,editors)&&String(x.vj_id||'')===String(vj[0]||'')&&String(x.editor_id||'')===String(editors[0]||'')&&['cam_id','approver_id'].every(k=>String(x[k]||'')===String(data[k]||''))&&sameTime(x.shoot_at,data.shoot_at)&&(!Object.prototype.hasOwnProperty.call(data,'estimated_cost_vnd')||String(x.estimated_cost_vnd??'')===String(productionBudget_(data.estimated_cost_vnd)))&&sameIds(ids.content,data.content_approver_ids)&&sameIds(ids.media,data.media_approver_ids)&&!!x.vj_final_required===!!data.vj_final_required;
 return {ok:true,found:matches,item:matches?x:undefined};
})}

// V20.25 — soft deletion of unapproved Ideas, with durable action history.
function productionRow_(id,allowDeleted=false){const f=productionRowData_(id);if(!allowDeleted&&f.item.stage==='deleted')throw Error('Idea đã xóa. Hãy khôi phục trước khi thao tác.');f.item=normalizeProductionItem_(f.item);return f;}
function ideaTrashSheet_(){const b=book_(),s=b.getSheetByName('ProductionIdeaTrash')||b.insertSheet('ProductionIdeaTrash');if(!s.getLastRow()){s.appendRow(['id','production_id','action','actor_id','at','reason','snapshot_json']);s.setFrozenRows(1)}return s;}
function ideaDeleteAllowed_(u,x){return !isDirector_(u)&&(String(x.created_by)===String(u.id)||leaderProductionDelete_(u,x));}
function ideaTrashNotice_(x,u,action,reason,at){const chat=projectChatId_(x.project);if(!chat)return;sheet_('Notifications').appendRow([Utilities.getUuid(),'idea-trash:'+x.id+':'+action+':'+at,chat,(action==='delete'?'🗑 TASK ĐÃ XÓA':'♻️ TASK ĐÃ KHÔI PHỤC')+'\nDự án: '+x.project+'\nNội dung: '+x.title+'\nNgười xử lý: '+u.name+(reason?'\nLý do: '+reason:''),'pending',at,'','']);}
function deleteProductionIdea(initData,id,reason){productionWritable_(auth_(initData));return createWriteScope_(()=>{
 const u=auth_(initData);reason=String(reason||'').trim();if(reason.length>500)throw Error('Lý do tối đa 500 ký tự');const lock=LockService.getScriptLock();lock.waitLock(15000);let x,at,warning='';
 try{const f=productionRow_(id,true);x=f.item;if(!ideaDeleteAllowed_(u,x))throw Error('Chỉ người tạo hoặc Leader phụ trách được xóa Idea');
 if(x.stage!=='deleted'&&(x.stage!=='brief'||x.idea_approval==='Duyệt')&&!leaderProductionDelete_(u,x))throw Error('Chỉ Leader phụ trách được xóa task đã duyệt');
 const audit=ideaTrashSheet_(),a=audit.getDataRange().getValues();let entry=a.slice(1).reverse().find(r=>String(r[1])===String(id)&&String(r[2])==='delete');
 if(x.stage!=='deleted'){
 const links=prodLinkRows_().filter(l=>String(l.production_id)===String(id)),ids=new Set(links.map(l=>String(l.task_id))),tasks=rows_('Tasks').filter(t=>ids.has(String(t.id))).map(t=>({id:String(t.id),status:String(t.status||'')}));at=new Date().toISOString();
 audit.appendRow([Utilities.getUuid(),String(id),'delete',u.id,at,reason,JSON.stringify({item:x,tasks})]);
 const stage=f.sheet.getRange(f.row,14);stage.clearDataValidations();stage.setValue('deleted');f.sheet.getRange(f.row,24).setValue(at);entry=[null,id,'delete',u.id,at,reason,JSON.stringify({item:x,tasks})];
 }else at=entry?.[4]||new Date().toISOString();
 const saved=entry?JSON.parse(entry[6]):{tasks:[]},taskIds=new Set(saved.tasks.map(t=>String(t.id))),tasks=sheet_('Tasks'),tr=tasks.getDataRange().getValues();
 tr.forEach((r,i)=>{if(i&&taskIds.has(String(r[0]))&&!['done','cancelled','canceled'].includes(String(r[7])))tasks.getRange(i+1,8).setValue('cancelled')});
 const ns=sheet_('Notifications'),nr=ns.getDataRange().getValues();nr.forEach((r,i)=>{if(i&&['pending','sending'].includes(String(r[4]))&&!String(r[1]).startsWith('idea-trash:')&&String(r[1]).split(':').some(k=>k===String(id)||taskIds.has(k)))ns.getRange(i+1,5).setValue('cancelled')});
 if(x.stage!=='deleted')try{ideaTrashNotice_(x,u,'delete',reason,at)}catch(e){warning='Idea đã xóa; thông báo nhóm cần kiểm tra.';console.error(e)}
 }finally{lock.releaseLock()}
 return {ok:true,deletedId:String(id),warning};
})}
function deletedProductionIdeas(initData){return createWriteScope_(()=>{
 const u=auth_(initData),s=sheet_('ProductionItems'),a=s.getDataRange().getValues(),h=a.shift().map(String);return {ok:true,items:a.map(r=>Object.fromEntries(h.map((k,i)=>[k,cell_(k,r[i])]))).filter(x=>x.stage==='deleted'&&(isDirector_(u)||ideaDeleteAllowed_(u,x))).sort((a,b)=>String(b.updated_at).localeCompare(String(a.updated_at))).slice(0,100).map(x=>({id:x.id,title:x.title,project:x.project,deleted_at:x.updated_at,can_restore:ideaDeleteAllowed_(u,x)}))};
})}
function restoreProductionIdea(initData,id){productionWritable_(auth_(initData));return createWriteScope_(()=>{
 const u=auth_(initData),lock=LockService.getScriptLock();lock.waitLock(15000);let x,warning='';
 try{const f=productionRow_(id,true);x=f.item;if(!ideaDeleteAllowed_(u,x))throw Error('Bạn không có quyền khôi phục Idea');if(x.stage!=='deleted')return productionResult_(id);
 const audit=ideaTrashSheet_(),entry=audit.getDataRange().getValues().slice(1).reverse().find(r=>String(r[1])===String(id)&&r[2]==='delete');if(!entry)throw Error('Thiếu lịch sử xóa, cần kiểm tra trước khi khôi phục');const saved=JSON.parse(entry[6]);if(!saved.item||!['brief','script','shoot','edit','review','revision','ready','published'].includes(saved.item.stage))throw Error('Lịch sử không hợp lệ');if((saved.item.stage!=='brief'||saved.item.idea_approval==='Duyệt')&&!leaderProductionDelete_(u,x))throw Error('Chỉ Leader phụ trách được khôi phục task này');
 const tasks=sheet_('Tasks'),tr=tasks.getDataRange().getValues(),statuses=new Map(saved.tasks.map(t=>[String(t.id),t.status]));tr.forEach((r,i)=>{if(i&&statuses.has(String(r[0]))&&String(r[7])==='cancelled')tasks.getRange(i+1,8).setValue(statuses.get(String(r[0])))});
 const at=new Date().toISOString();audit.appendRow([Utilities.getUuid(),String(id),'restore',u.id,at,'',JSON.stringify({delete_id:entry[0]})]);tgRevisionBump_(f,'idea');f.sheet.getRange(f.row,14).setValue(saved.item.stage);f.sheet.getRange(f.row,24).setValue(at);
 try{ideaTrashNotice_(x,u,'restore','',at)}catch(e){warning='Idea đã khôi phục; thông báo nhóm cần kiểm tra.';console.error(e)}
 }finally{lock.releaseLock()}
 return productionResult_(id,warning);
})}

// Background Telegram jobs serialize via a durable lease, not a held data lock.
function botBackgroundJob_(name,fn){
 const lock=LockService.getScriptLock();if(!lock.tryLock(1000))return;const props=PropertiesService.getScriptProperties(),key='VN_BOT_JOB:'+name;let lease;
 try{const old=props.getProperty(key);if(old){const active=JSON.parse(old);if(props.getProperty(key+':done')!==old&&Number(active.until)>Date.now())return;props.deleteProperty(key+':done');}lease=JSON.stringify({token:String(Date.now())+':'+Math.random(),until:Date.now()+10*60000});props.setProperty(key,lease);}finally{lock.releaseLock()}
 try{return fn()}finally{try{props.setProperty(key+':done',lease)}catch(e){console.error('Không lưu được trạng thái tiến trình bot',e)}const done=LockService.getScriptLock();if(done.tryLock(1000))try{if(props.getProperty(key)===lease){props.deleteProperty(key);props.deleteProperty(key+':done')}}finally{done.releaseLock()}}
}

// V20.27: read-only reporting from a separate finance spreadsheet.
function financeAllowed_(u){return isDirector_(u);}
function financeBook_(){const id=String(PropertiesService.getScriptProperties().getProperty('FINANCE_SHEET_ID')||'').trim();if(!/^[A-Za-z0-9_-]{20,}$/.test(id))throw Error('Chưa cấu hình FINANCE_SHEET_ID');try{return SpreadsheetApp.openById(id)}catch(e){throw Error('Không mở được Sheet thu chi. Chia sẻ quyền xem cho tài khoản triển khai Apps Script.');}}
function financeTab_(book){const name=PropertiesService.getScriptProperties().getProperty('FINANCE_SHEET_NAME')||'Trang tính1';const sh=book.getSheetByName(name);if(!sh)throw Error('Không thấy tab '+name+' trong Sheet thu chi');return sh;}
function financeNorm_(v){return String(v??'').trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/Đ/g,'D').replace(/\s+/g,' ').toLowerCase();}
function financeDate_(v,tz){if(v instanceof Date&&!isNaN(v.getTime()))return Utilities.formatDate(v,tz,'yyyy-MM-dd');const text=String(v||'').trim(),m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(text)||/^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text);if(!m)return '';const parts=m[1].length===4?[+m[1],+m[2],+m[3]]:[+m[3],+m[2],+m[1]],d=new Date(Date.UTC(parts[0],parts[1]-1,parts[2]));return d.getUTCFullYear()===parts[0]&&d.getUTCMonth()===parts[1]-1&&d.getUTCDate()===parts[2]?parts.map((x,i)=>String(x).padStart(i?2:4,'0')).join('-'):'';}
function financeRead_(sh,tz){
 const last=sh.getLastRow();if(last<8)throw Error('Sheet thu chi thiếu tiêu đề hàng 7–8');
 const h=sh.getRange(7,1,1,11).getValues()[0],expected=['MÃ GIAO DỊCH','NGÀY','LOẠI','NHÓM','DỰ ÁN / BỘ PHẬN','NỘI DUNG','SỐ TIỀN','NGƯỜI THỰC HIỆN GIAO DỊCH','PHƯƠNG THỨC','CHỨNG TỪ'];
 expected.forEach((x,i)=>{if(financeNorm_(h[i])!==financeNorm_(x))throw Error('Cột '+(i+1)+' của Sheet thu chi không đúng cấu trúc: '+x)});
 const values=last>8?sh.getRange(9,1,last-8,11).getValues():[],items=[],issues=[],seen=new Set();let prepared=0;
 values.forEach((r,i)=>{
  if(r.every(v=>v===''||v==null))return;
  if(r.slice(1).every(v=>v===''||v==null)){prepared++;return}
  const id=String(r[0]||'').trim(),date=financeDate_(r[1],tz),type=String(r[2]||'').trim().toUpperCase(),amount=r[6],row=i+9;
  const faults=[];if(!id)faults.push('thiếu mã');if(!date)faults.push('ngày không hợp lệ');if(!['THU','CHI'].includes(type))faults.push('loại phải là THU/CHI');if(typeof amount!=='number'||!Number.isFinite(amount)||amount<0||amount>1e14)faults.push('số tiền phải là số không âm');if(seen.has(id))faults.push('trùng mã '+id);
  if(faults.length){issues.push({row,message:faults.join('; ')});return}seen.add(id);
  const project=String(r[4]||'').trim(),code=/^(DA\d+)\b/i.exec(project)?.[1].toUpperCase();const key=code||(financeNorm_(project)==='chung cong ty'?'common':!project?'unclassified':'other:'+project);
  items.push({id,row,date,type,group:String(r[3]||'').trim(),project,key,title:String(r[5]||'').trim(),amount:Math.round(amount*100)/100,person:String(r[7]||'').trim(),method:String(r[8]||'').trim(),billText:String(r[9]||''),invoiceText:String(r[10]||'')});
 });return {items,issues,prepared};
}
function financeSum_(items){const totals=items.reduce((a,x)=>{a[x.type==='THU'?'income':'expense']+=Math.round(x.amount*100);return a},{income:0,expense:0});return {income:totals.income/100,expense:totals.expense/100,balance:(totals.income-totals.expense)/100,count:items.length};}
function financeLinks_(text,rich,formula){const links=[];const add=v=>{v=String(v||'').trim();if(/^https:\/\/[^\s<>"']+$/i.test(v))links.push(v)};add(text);if(rich){add(rich.getLinkUrl());for(const run of rich.getRuns())add(run.getLinkUrl())}const m=/^=HYPERLINK\(\s*"((?:[^"]|"")+)"/i.exec(String(formula||''));if(m)add(m[1].replace(/""/g,'"'));return [...new Set(links)];}
function financeReport(initData,options){return readScope_(()=>{
 const u=auth_(initData);if(!financeAllowed_(u))throw Error('Chỉ Ban giám đốc được xem Thu chi');
 options=options||{};const period=String(options.period||stamp_(new Date(),'yyyy-MM'));if(!/^\d{4}(?:-(?:0[1-9]|1[0-2]))?$/.test(period))throw Error('Tháng báo cáo không hợp lệ');
 const offset=Number(options.offset||0);if(!Number.isInteger(offset)||offset<0)throw Error('Trang báo cáo không hợp lệ');const selected=String(options.project||'all'),book=financeBook_(),sh=financeTab_(book),source=financeRead_(sh,book.getSpreadsheetTimeZone());
 const selectedRows=source.items.filter(x=>x.date.startsWith(period)),groups=new Map();
 rows_('Projects').forEach(p=>{const code=String(p.code||'').trim();if(code)groups.set(code,{key:code,name:code+' · '+String(p.name||''),items:[]})});
 groups.set('common',{key:'common',name:'Chung công ty',items:[]});groups.set('unclassified',{key:'unclassified',name:'Chưa phân loại',items:[]});
 selectedRows.forEach(x=>{if(!groups.has(x.key))groups.set(x.key,{key:x.key,name:x.project||'Chưa phân loại',items:[]});groups.get(x.key).items.push(x)});
 const groupList=[...groups.values()].map(g=>({key:g.key,name:g.name,...financeSum_(g.items)}));if(selected!=='all'&&!groups.has(selected))throw Error('Nhóm báo cáo không hợp lệ');
 const filtered=selectedRows.filter(x=>selected==='all'||x.key===selected).sort((a,b)=>b.date.localeCompare(a.date)||b.row-a.row),page=filtered.slice(offset,offset+30);
 // Only read hyperlink metadata for the returned page, in one contiguous range.
 let rich=[],formulas=[],first=0;if(page.length){first=Math.min(...page.map(x=>x.row));const last=Math.max(...page.map(x=>x.row)),range=sh.getRange(first,10,last-first+1,2);rich=range.getRichTextValues();formulas=range.getFormulas()}
 const items=page.map(x=>{const index=x.row-first,{billText,invoiceText,...item}=x;return {...item,billLinks:financeLinks_(billText,rich[index]?.[0],formulas[index]?.[0]),invoiceLinks:financeLinks_(invoiceText,rich[index]?.[1],formulas[index]?.[1])}});
 return {ok:true,period,project:selected,total:financeSum_(selectedRows),groups:groupList,items,count:filtered.length,nextOffset:offset+items.length<filtered.length?offset+items.length:null,periods:[...new Set([stamp_(new Date(),'yyyy-MM'),...source.items.flatMap(x=>[x.date.slice(0,7),x.date.slice(0,4)])])].sort().reverse(),issues:source.issues.slice(0,20),issueCount:source.issues.length,preparedRows:source.prepared,readAt:new Date().toISOString(),sheetName:sh.getName()};
})}
// Run once in the editor to verify private-sheet access and yearly totals.
function checkFinanceConnection(){const book=financeBook_(),sh=financeTab_(book),source=financeRead_(sh,book.getSpreadsheetTimeZone()),years=[...new Set(source.items.map(x=>x.date.slice(0,4)))];const result={tab:sh.getName(),validTransactions:source.items.length,preparedRows:source.prepared,issues:source.issues,years:years.map(year=>({year,...financeSum_(source.items.filter(x=>x.date.startsWith(year)))})),months:[...new Set(source.items.map(x=>x.date.slice(0,7)))].sort().map(month=>({month,...financeSum_(source.items.filter(x=>x.date.startsWith(month)))}))};console.log(JSON.stringify(result));return result;}

// V20.28: planned publishing is separate from the actual published_at milestone.
function productionScheduleDate_(value){if(!value)return '';const d=new Date(value);if(isNaN(d.getTime()))throw Error('Thời gian đăng không hợp lệ');return d.toISOString()}
function saveProductionSchedule_(f,value){const key='publish_scheduled_at',s=f.sheet,h=s.getRange(1,1,1,s.getLastColumn()).getValues()[0].map(String);let col=h.indexOf(key)+1;if(!col){col=h.length+1;if(typeof s.getMaxColumns==='function'&&col>s.getMaxColumns())s.insertColumnsAfter(s.getMaxColumns(),col-s.getMaxColumns());s.getRange(1,col).setValue(key)}s.getRange(f.row,col).setValue(value);if(V2016_WRITE_SCOPE)V2016_WRITE_SCOPE.productionHeaders=null}
function personalTaskReview_(u,t,links,items){const link=links.find(l=>String(l.task_id)===String(t.id)&&String(l.active).toLowerCase()!=='false');if(link){const x=items.find(x=>String(x.id)===String(link.production_id));return !!x&&String(x.approver_id||'')===String(u.id)}return [t.approver_id,t.reviewer_id].some(id=>id&&String(id)===String(u.id))}

// V20.29: immutable first asset handoff + 48 elapsed hours, including weekends.
function productionExtraValue_(f,key,value){const s=f.sheet,h=s.getRange(1,1,1,s.getLastColumn()).getValues()[0].map(String);let col=h.indexOf(key)+1;if(!col){col=h.length+1;if(typeof s.getMaxColumns==='function'&&col>s.getMaxColumns())s.insertColumnsAfter(s.getMaxColumns(),col-s.getMaxColumns());s.getRange(1,col).setValue(key)}s.getRange(f.row,col).setValue(value);f.item[key]=value;if(V2016_WRITE_SCOPE)V2016_WRITE_SCOPE.productionHeaders=null}
function startEditDeadline_(f){const received=f.item.editor_received_at?new Date(f.item.editor_received_at):new Date(),due=new Date(received.getTime()+48*60*60*1000).toISOString();if(!f.item.editor_received_at)productionExtraValue_(f,'editor_received_at',received.toISOString());f.sheet.getRange(f.row,13).setValue(due);f.item.deadline=due}
function syncEditDeadlineTasks_(x){if(!x.deadline)return;const links=prodLinkRows_().filter(l=>String(l.production_id)===String(x.id)&&['editor_id','editor_collab'].includes(String(l.role_key))&&String(l.active).toLowerCase()!=='false'),ids=new Set(links.map(l=>String(l.task_id)));if(!ids.size)return;const s=sheet_('Tasks'),rows=s.getDataRange().getValues();rows.forEach((r,i)=>{if(i&&ids.has(String(r[0]))&&!['done','cancelled','canceled'].includes(String(r[7]))&&String(r[6])!==String(x.deadline))s.getRange(i+1,7).setValue(x.deadline)})}
function editTaskMetadata_(tasks,links,items,team=[]){const byId=new Map(items.map(x=>[String(x.id),x])),byTask=new Map(links.filter(l=>String(l.active).toLowerCase()!=='false').map(l=>[String(l.task_id),l]));return tasks.map(t=>{const l=byTask.get(String(t.id));if(!l||!['editor_id','editor_collab','vj_id','vj_collab'].includes(String(l.role_key)))return t;const raw=byId.get(String(l.production_id));if(!raw)return t;const x=normalizeProductionItem_(raw);if(['vj_id','vj_collab'].includes(String(l.role_key))){const handed=!!(x.editor_received_at||x.editor_handoff_at)||['edit','review','revision','ready','published'].includes(String(x.stage));return {...t,is_vj_task:true,production_id:String(x.id),production_item:productionWorkProgress_(withProductionTeam_([x],team)[0]),due_at:rawDeliveryDue_(x),status:['cancelled','canceled'].includes(String(t.status))?t.status:handed?'done':x.vj_script_started_at?'in_progress':t.status};}const received=String(x.editor_received_at||x.editor_handoff_at||''),handed=!!received||['edit','review','revision','ready','published'].includes(String(x.stage));return {...t,status:!['cancelled','canceled'].includes(String(t.status))&&['ready','published'].includes(x.stage)?'done':!['cancelled','canceled'].includes(String(t.status))&&['edit','revision'].includes(x.stage)&&['done','review'].includes(String(t.status))?'in_progress':t.status,is_edit_task:true,production_id:String(x.id),production_item:productionWorkProgress_(withProductionTeam_([x],team)[0]),editor_received_at:received,awaiting_assets:!handed,due_at:handed?String(x.deadline||t.due_at||''):''}})}
function personalWorkTasks_(u){const links=prodLinkRows_(),items=rows_('ProductionItems'),picked=productionPickedTaskIndex_(links,items,teamRows_()),tasks=editTaskMetadata_(rows_('Tasks').filter(t=>String(t.assignee_id)===String(u.id)&&workTaskCurrentlyPicked_(t,picked)),links,items,teamRows_());return tasks.sort((a,b)=>{const closed=t=>['done','cancelled','canceled'].includes(String(t.status)),ac=closed(a),bc=closed(b);if(ac!==bc)return ac?1:-1;if(ac)return (Date.parse(b.completed_at||b.created_at)||0)-(Date.parse(a.completed_at||a.created_at)||0);const ar=a.is_edit_task&&a.editor_received_at,br=b.is_edit_task&&b.editor_received_at;if(ar&&br)return Date.parse(ar)-Date.parse(br)||String(a.id).localeCompare(String(b.id));if(!!ar!==!!br)return ar?-1:1;return (Date.parse(b.created_at)||0)-(Date.parse(a.created_at)||0)}).slice(0,100)}

function prodTaskDueValue_(x,role){if(role==='editor_id'&&!x.editor_received_at&&!x.editor_handoff_at&&['brief','script','shoot'].includes(String(x.stage)))return '';return prodDue_(x,role).toISOString()}

function productionBudget_(value){if(value===undefined||value===null||String(value).trim()==='')return '';const n=Number(value);if(!Number.isSafeInteger(n)||n<0||n>1000000000000)throw Error('Chi phí dự kiến cần là số VNĐ nguyên không âm, tối đa 1.000 tỷ');return n}

// V20.29.1: validate current role assignments, not merely leftover Tasks.assignee_id.
function productionPickedTaskIndex_(links,items,team){const byItem=new Map(items.map(x=>[String(x.id),x])),linked=new Set(links.map(l=>String(l.task_id))),allowed=new Map();for(const l of links){if(String(l.active).toLowerCase()==='false')continue;const x=byItem.get(String(l.production_id));if(!x||String(x.stage)==='deleted')continue;const who=String(l.telegram_id||''),role=String(l.role_key||'');let picked=false;if(role==='editor_id')picked=who===String(x.editor_id||'');else if(role==='editor_collab')picked=who!==String(x.editor_id||'')&&teamIds_(x,'Editor',team).includes(who);else if(role==='vj_id')picked=who===String(x.vj_id||'');else if(role==='vj_collab')picked=who!==String(x.vj_id||'')&&teamIds_(x,'VJ',team).includes(who);else if(['cam_id','designer_id'].includes(role))picked=who===String(x[role]||'');if(picked&&who){const key=String(l.task_id),ids=allowed.get(key)||new Set();ids.add(who);allowed.set(key,ids)}}return {linked,allowed}}
function workTaskCurrentlyPicked_(t,index){const id=String(t.id),who=String(t.assignee_id);if(index.linked.has(id)||id.startsWith('prod:'))return !!index.allowed.get(id)?.has(who);return true}

// V20.30: schedule-relative Raw delivery, separate from immutable Editor clock.
function productionHandoffSignature_(x){return String(x.raw_url||'')+'|'+String(x.voice_url||'')+(x.detailed_script_url?'|'+String(x.detailed_script_url):'')}
function rawDeliveryDue_(x){const t=Date.parse(x.vj_script_started_at||'');return Number.isFinite(t)?new Date(t+12*3600000).toISOString():''}
function upcomingShoots_(u,items,team,now){const me=String(u.id);return items.filter(x=>['script','shoot'].includes(String(x.stage))&&x.idea_approval==='Duyệt'&&!x.editor_received_at&&!x.editor_handoff_at&&Number.isFinite(Date.parse(x.shoot_at))&&Date.parse(x.shoot_at)>=now&&(isDirector_(u)||u.role==='leader'&&String(x.department)===String(u.department)||String(x.cam_id)===me||teamIds_(x,'VJ',team).includes(me))).sort((a,b)=>Date.parse(a.shoot_at)-Date.parse(b.shoot_at)||String(a.id).localeCompare(String(b.id)))}
function rawDeliveryAlertPlans_(items,now){const plans=[];for(const x of items){if(!['script','shoot'].includes(String(x.stage))||x.idea_approval!=='Duyệt'||x.editor_received_at||x.editor_handoff_at)continue;const due=rawDeliveryDue_(x),ms=Date.parse(due)-now;if(!due||ms>2*3600000)continue;const crew=teamIds_(x,'VJ');if(!crew.length)continue;const overdue=ms<=0,kind=overdue?'overdue':'soon',who=[...crew];if(overdue)who.push(String(x.approver_id||''),...String(x.content_approver_ids||'').split(','));const msg=(overdue?'🔴 QUÁ HẠN BÀN GIAO TƯ LIỆU':'⏰ SẮP ĐẾN HẠN BÀN GIAO TƯ LIỆU')+'\nDự án: '+x.project+'\nNội dung: '+x.title+'\nBắt đầu làm kịch bản: '+stamp_(new Date(x.vj_script_started_at),'dd/MM/yyyy HH:mm')+'\nHạn bàn giao tư liệu (12 giờ): '+stamp_(new Date(due),'dd/MM/yyyy HH:mm')+'\nVJ vui lòng lưu Kịch bản, Raw, Voice (nếu có), rồi bấm Bàn giao Raw/Voice cho Editor trong Mini App.';for(const id of [...new Set(who.filter(Boolean))])plans.push({key:'raw12:'+x.id+':'+Date.parse(x.vj_script_started_at)+':'+kind+':'+id,id,message:msg})}return plans}
function rawDeliveryAlerts_(){const plans=readScope_(()=>rawDeliveryAlertPlans_(rows_('ProductionItems'),Date.now()));if(!plans.length)return;const lock=LockService.getScriptLock();if(!lock.tryLock(1000))return;try{createWriteScope_(()=>{for(const p of plans)queueNotification_(p.key,p.id,p.message)})}finally{lock.releaseLock()}}
function setupV20RawReminders(){if(!ScriptApp.getProjectTriggers().some(t=>t.getHandlerFunction()==='v16Scheduler'))ScriptApp.newTrigger('v16Scheduler').timeBased().everyMinutes(1).create();if(!ScriptApp.getProjectTriggers().some(t=>t.getHandlerFunction()==='dispatchNotifications'))ScriptApp.newTrigger('dispatchNotifications').timeBased().everyMinutes(1).create();return 'Đã bật nhắc bàn giao Raw và hàng đợi thông báo. Giữ các trigger cũ và dữ liệu hiện tại.'}

function rawDeliveryNotificationCurrent_(key){const m=String(key).match(/^raw12:(.+):(\d+):(soon|overdue):([^:]+)$/);if(!m)return false;const x=rows_('ProductionItems').find(x=>String(x.id)===m[1]);return !!x&&rawDeliveryAlertPlans_([x],Date.now()).some(p=>p.key===String(key))}
function normalizeProductionItem_(x){
 x={...x,script_url:String(x.script_url||'').trim()||String(x.detailed_script_url||'').trim(),vj_final_required:false};
 if(x.stage==='deleted')return x;
 if(x.stage==='published'||x.published_status==='published'){x.stage='published';return x;}
 if(x.idea_approval==='Duyệt'){
  if(productionFinalApproved_(x))x.stage='ready';
  else if(['review','revision','ready'].includes(String(x.stage)))x.stage='edit';
  else if(x.stage==='script')x.stage='shoot';
 }
 return x;
}

// V20.30.6 — group-only approval keyboards. Incoming identity comes ONLY from getUpdates.
const TG_APPROVAL_TABLES={
 TelegramApprovalMessages:['id','production_id','kind','signature','chat_id','message_id','status','render_hash','created_at','updated_at','error'],
 TelegramApprovalFeedback:['id','card_id','kind','actor_id','chat_id','prompt_message_id','status','created_at','expires_at','update_id'],
 TelegramApprovalHistory:['id','production_id','kind','decision','feedback','actor_id','actor_name','at','signature','source','update_id']
};
let TG_APPROVAL_ENABLED_CACHE=null;
function tgApprovalsEnabled_(){if(typeof PropertiesService==='undefined')return false;if(TG_APPROVAL_ENABLED_CACHE===null)TG_APPROVAL_ENABLED_CACHE=PropertiesService.getScriptProperties().getProperty('TELEGRAM_APPROVALS_ENABLED')==='true';return TG_APPROVAL_ENABLED_CACHE}
function tgApprovalProjectEvent_(id,event){
 if(event!=='created')return true;
 const x=productionRow_(id).item,chat=projectChatId_(x.project);if(!chat)return false;
 const s=sheet_('Notifications'),key='project:'+id+':created';if(!s.getDataRange().getValues().slice(1).some(r=>String(r[1])===key))s.appendRow([Utilities.getUuid(),key,chat,'Tin Idea có nút duyệt được quản lý trong TelegramApprovalMessages.','cancelled',new Date().toISOString(),'','']);
 PropertiesService.getScriptProperties().setProperty('V20GROUPSIG:'+id,projectAssignmentSignature_(x));return true;
}
function setupTelegramApprovals(){
 if(!/^https:\/\//i.test(String(prop_('WEB_APP_URL'))))throw Error('WEB_APP_URL cần là URL triển khai HTTPS của Mini App');
 const hook=botApi_('getWebhookInfo',{});if(hook.url)throw Error('Bot đang dùng webhook. Giữ webhook hiện tại; chưa bật tính năng này. Kiểm tra trước khi chạy setupBotAccess.');
 const lock=LockService.getScriptLock();lock.waitLock(15000);
 try{const b=book_();for(const [name,h] of Object.entries(TG_APPROVAL_TABLES)){const s=b.getSheetByName(name)||b.insertSheet(name);if(!s.getLastRow()){s.appendRow(h);s.setFrozenRows(1)}else if(s.getRange(1,1,1,h.length).getValues()[0].map(String).join('|')!==h.join('|'))throw Error('Header '+name+' không đúng; giữ dữ liệu và kiểm tra trước')}
 const s=sheet_('ProductionItems'),h=productionHeaders_(s);for(const key of ['idea_approval','content_approver_ids','media_approver_ids','content_final_approval','media_final_approval','vj_final_required','vj_final_approval'])if(!h.includes(key))throw Error('Thiếu cột '+key+' trong ProductionItems; chưa bật nút duyệt');for(const key of ['tg_idea_revision','tg_final_revision'])if(!h.includes(key)){s.getRange(1,s.getLastColumn()+1).setValue(key);h.push(key)}
 }finally{lock.releaseLock()}
 const triggers=ScriptApp.getProjectTriggers();if(!triggers.some(t=>t.getHandlerFunction()==='pollBotUpdates'))ScriptApp.newTrigger('pollBotUpdates').timeBased().everyMinutes(1).create();
 PropertiesService.getScriptProperties().setProperty('TELEGRAM_APPROVALS_ENABLED','true');TG_APPROVAL_ENABLED_CACHE=true;
 return 'Đã bật duyệt Idea trong nhóm; Video Final dùng Gửi hoàn thành. Bot xử lý mỗi phút; có thể chạy syncTelegramApprovals để tạo tin chờ duyệt ngay.';
}
function tgRevisionBump_(f,kind){if(!tgApprovalsEnabled_())return;const key='tg_'+kind+'_revision';if(productionHeaders_(f.sheet).includes(key))productionExtraValue_(f,key,Number(f.item[key]||0)+1)}
function tgDigest_(value){return hex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,String(value),Utilities.Charset.UTF_8))}
function tgApprovalSignature_(x,kind){const a=v20Approvers_(x);return tgDigest_(JSON.stringify(kind==='idea'?[String(x.id),x.project,x.title,x.brief,String(x.approver_id||''),Number(x.tg_idea_revision||0)]:[String(x.id),x.project,x.final_url,Number(x.tg_final_revision||0),a.content.slice().sort(),a.media.slice().sort(),!!x.vj_final_required,String(x.vj_id||'')]))}
function tgApprovalKinds_(x,kind){return kind==='idea'?['idea']:productionFinalKinds_(x)}
function tgApprovalIds_(x,kind){return kind==='idea'?[String(x.approver_id||'')]:kind==='vj'?[String(x.vj_id||'')]:v20Approvers_(x)[kind]||[]}
function tgApprovalDecision_(x,kind){return String(x[kind==='idea'?'idea_approval':kind+'_final_approval']||'')}
function tgApprovalOpen_(x,kind){return kind==='idea'&&String(x.stage)==='brief'&&!tgApprovalDecision_(x,kind);}

function tgApprovalCandidate_(x,kind){return kind==='idea'&&tgApprovalOpen_(x,'idea');}

function tgApprovalGuard_(u,x,kind,expected){
 if(!person_(u.id))throw Error('Tài khoản không còn hoạt động');
 if(!tgApprovalIds_(x,kind).includes(String(u.id)))throw Error('Bạn chưa được phân công duyệt mục này');
 if(expected&&(String(expected.production_id)!==String(x.id)||expected.signature!==tgApprovalSignature_(x,kind==='idea'?'idea':'final')||String(expected.chat_id)!==String(projectChatId_(x.project))))throw Error('Nút thuộc phiên bản hoặc phân công cũ. Hãy dùng tin duyệt mới');
 if(!tgApprovalOpen_(x,kind))throw Error('Mục này đã được xử lý hoặc không còn chờ duyệt');
}
function tgApprovalAudit_(x,kind,decision,note,u,expected){
 if(!tgApprovalsEnabled_())return;
 try{sheet_('TelegramApprovalHistory').appendRow([Utilities.getUuid(),String(x.id),kind,decision,note,u.id,u.name||person_(u.id)?.name||'',new Date().toISOString(),tgApprovalSignature_(x,kind==='idea'?'idea':'final'),expected?.source==='app'?'app':expected?'telegram':'app',expected?.update_id||''])}catch(e){console.error('Không ghi được lịch sử duyệt',e)}
}
function productionApprovalHistory(initData,id){return readScope_(()=>{const u=auth_(initData),x=productionRow_(id).item;if(!productionVisibleRows_(u,teamRows_()).some(v=>String(v.id)===String(x.id)))throw Error('Bạn không có quyền xem task này');return {ok:true,items:book_().getSheetByName('TelegramApprovalHistory')?rows_('TelegramApprovalHistory').filter(r=>String(r.production_id)===String(id)).slice(-50).reverse():[]}})}
function tgCardRows_(){return rows_('TelegramApprovalMessages')}
function tgTablePatch_(name,id,values){const s=sheet_(name),a=s.getDataRange().getValues(),h=TG_APPROVAL_TABLES[name],i=a.findIndex((r,n)=>n>0&&String(r[0])===String(id));if(i<0)throw Error('Không tìm thấy bản ghi Telegram');const r=a[i].slice();for(const [k,v] of Object.entries(values)){const col=h.indexOf(k);if(col>=0)r[col]=v}s.getRange(i+1,1,1,h.length).setValues([r]);return Object.fromEntries(h.map((k,n)=>[k,r[n]]))}
function tgAppUrl_(card){const base=String(PropertiesService.getScriptProperties().getProperty('TELEGRAM_MINI_APP_URL')||'').trim(),bot=botUsername_();if(!new RegExp('^https://t\\.me/'+bot+'(?:/[A-Za-z0-9_]+)?$','i').test(base))throw Error('Cần cấu hình TELEGRAM_MINI_APP_URL là link Mini App Telegram trong BotFather');return base+'?startapp='+(card?'review_'+card.id:'home')}
let TG_APPROVAL_RENDER_CONTEXT=null;
function tgRenderPerson_(id){return TG_APPROVAL_RENDER_CONTEXT?TG_APPROVAL_RENDER_CONTEXT.people.get(String(id)):person_(id)}
function tgRenderChat_(project){return TG_APPROVAL_RENDER_CONTEXT?TG_APPROVAL_RENDER_CONTEXT.chats.get(String(project))||'':projectChatId_(project)}
function tgMessageLink_(chat,id){return /^-100\d+$/.test(String(chat))?'https://t.me/c/'+String(chat).slice(4)+'/'+id:''}
function tgPrivateApprovalMarkup_(key){const match=/^approval-alert:([a-f0-9]{24}):/.exec(String(key));if(!match||!tgApprovalsEnabled_())return undefined;const card=tgCardRows_().find(c=>c.id===match[1]);if(!card)return undefined;const link=tgMessageLink_(card.chat_id,card.message_id);return {inline_keyboard:[[{text:'📱 Mở để duyệt',url:tgAppUrl_(card)}],...(link?[[{text:'📩 Xem thông báo trong nhóm',url:link}]]:[])]}}
function tgApprovalRender_(card,x){
 if(card.kind==='final'){
  const lines=['🎬 VIDEO FINAL · ĐÃ BỎ BƯỚC DUYỆT',x?.title||card.production_id,'Trạng thái: '+(x?.stage==='published'?'Đã đăng':x?.final_url?'Đã edit xong':'Chờ Editor cập nhật Final')];
  for(const k of ['content','media','vj'])if(x?.[k+'_final_feedback'])lines.push('Phản hồi cũ · '+k+': '+x[k+'_final_feedback']);
  const keys=[];if(/^https:\/\//i.test(String(x?.final_url||'')))keys.push([{text:'▶️ Xem Video Final',url:x.final_url}]);keys.push([{text:'📱 Mở nội dung',url:tgAppUrl_(card)}]);
  return {text:lines.join('\n').slice(0,4000),reply_markup:{inline_keyboard:keys},closed:true};
 }
 const current=!!x&&String(x.stage)!=='deleted'&&tgApprovalSignature_(x,card.kind)===card.signature&&String(tgRenderChat_(x.project))===String(card.chat_id);
 if(!current)return {text:'⌛ LƯỢT DUYỆT CŨ\nTask: '+card.production_id+'\nNội dung hoặc người duyệt đã thay đổi. Hãy dùng tin duyệt mới hoặc mở Mini App.',reply_markup:{inline_keyboard:[[{text:'📱 Mở để duyệt',url:tgAppUrl_(card)}]]},closed:true};
 const names=ids=>ids.filter(Boolean).map(id=>tgRenderPerson_(id)?.raw_name||tgRenderPerson_(id)?.name||id).join(', ')||'Chưa phân công';
 const lines=[card.kind==='idea'?'💡 IDEA CHỜ DUYỆT':'🎬 VIDEO FINAL · DUYỆT',x.title,'Dự án: '+x.project,'Người tạo: '+names([String(x.created_by||'')])],keyboard=[];
 if(card.kind==='idea')lines.push('\n'+String(x.brief||'').slice(0,1800));
 else if(/^https:\/\//i.test(String(x.final_url||'')))keyboard.push([{text:'▶️ Xem Video Final',url:x.final_url}]);
 for(const kind of tgApprovalKinds_(x,card.kind)){
 const label={idea:'Idea',content:'Content',media:'Media',vj:'VJ chính'}[kind],decision=tgApprovalDecision_(x,kind),open=tgApprovalOpen_(x,kind),prefix=kind==='idea'?'idea_approval':kind+'_final',who=x[prefix+'_reviewer'],at=x[prefix+'_reviewed_at'];
 lines.push('\n'+(decision==='Duyệt'?'✅ ':decision==='Không duyệt'?'❌ ':'⏳ ')+label+': '+(decision?decision+' · '+names([String(who||'')])+(at?' · '+stamp_(new Date(at),'dd/MM HH:mm'):''):'Đang chờ '+names(tgApprovalIds_(x,kind))+' duyệt'));
 if(x[prefix+'_feedback'])lines.push('Phản hồi: '+String(x[prefix+'_feedback']).slice(0,650));
 // All decisions now happen in the Mini App; group cards contain URL buttons only.
 }
 if(x.stage==='ready'||x.final_approval==='Duyệt'&&card.kind==='final')lines.push('\n✅ Đủ vai trò duyệt · Đã edit xong');
 if(x.stage==='revision')lines.push('\n✏️ Editor cần sửa và gửi Final mới');
 keyboard.push([{text:'📱 Mở để duyệt',url:tgAppUrl_(card)}]);
 const closed=!tgApprovalKinds_(x,card.kind).some(k=>tgApprovalOpen_(x,k));
 return {text:lines.join('\n').slice(0,4000),reply_markup:{inline_keyboard:keyboard},closed};
}
function tgCardCreate_(x,kind){
 const lock=LockService.getScriptLock();if(!lock.tryLock(1000))return null;
 try{const fresh=productionRow_(x.id).item;if(!tgApprovalCandidate_(fresh,kind))return null;const chat=projectChatId_(fresh.project);if(!chat)return null;const signature=tgApprovalSignature_(fresh,kind),existing=tgCardRows_().find(c=>String(c.production_id)===String(x.id)&&c.kind===kind&&c.signature===signature&&String(c.chat_id)===chat);if(existing)return existing;
 const now=new Date().toISOString(),card={id:Utilities.getUuid().replace(/-/g,'').slice(0,24),production_id:String(x.id),kind,signature,chat_id:chat,message_id:'',status:'queued',render_hash:'',created_at:now,updated_at:now,error:''};sheet_('TelegramApprovalMessages').appendRow(TG_APPROVAL_TABLES.TelegramApprovalMessages.map(k=>card[k]));return card;
 }finally{lock.releaseLock()}
}
function tgCardNotifyAssignees_(card,x){
 const link=tgMessageLink_(card.chat_id,card.message_id),ids=new Set(tgApprovalKinds_(x,card.kind).filter(k=>tgApprovalOpen_(x,k)).flatMap(k=>tgApprovalIds_(x,k))),prefix=card.kind==='idea'?'💡 IDEA CẦN BẠN DUYỆT':'🎬 FINAL CẦN BẠN DUYỆT';
 for(const id of ids)queueNotification_('approval-alert:'+card.id+':'+id,id,prefix+'\nDự án: '+x.project+'\nNội dung: '+x.title+'\nBấm Mở để duyệt để vào đúng task trong Mini App.'+(link?'\nĐến tin duyệt: '+link:'\nNhóm thường: mở nhóm dự án để tìm tin duyệt.')+'\nBạn cũng có thể duyệt trong Mini App.');
}
function tgCardSync_(card,x){
 if(!card.message_id&&x&&tgApprovalSignature_(x,card.kind)!==card.signature)x=productionRow_(card.production_id).item;
 const rendered=tgApprovalRender_(card,x),hash=tgDigest_(JSON.stringify([rendered.text,rendered.reply_markup]));
 if(card.message_id&&card.render_hash===hash)return false;
 if(!card.message_id&&(!x||!tgApprovalCandidate_(x,card.kind))){const lock=LockService.getScriptLock();if(lock.tryLock(1000))try{tgTablePatch_('TelegramApprovalMessages',card.id,{status:'closed',updated_at:new Date().toISOString()})}finally{lock.releaseLock()}return false}
 let created=false;
 if(!card.message_id){
 const lock=LockService.getScriptLock();if(!lock.tryLock(1000))return false;
 try{const current=tgCardRows_().find(c=>c.id===card.id);if(!current||current.status!=='queued')return false;tgTablePatch_('TelegramApprovalMessages',card.id,{status:'sending',updated_at:new Date().toISOString()})}finally{lock.releaseLock()}
 try{const sent=botApi_('sendMessage',{chat_id:card.chat_id,text:rendered.text,reply_markup:rendered.reply_markup});card.message_id=String(sent.message_id);created=true}catch(e){const l=LockService.getScriptLock();if(l.tryLock(1000))try{tgTablePatch_('TelegramApprovalMessages',card.id,{status:'failed',error:String(e).slice(0,300),updated_at:new Date().toISOString()})}finally{l.releaseLock()}throw e}
 }else try{botApi_('editMessageText',{chat_id:card.chat_id,message_id:Number(card.message_id),text:rendered.text,reply_markup:rendered.reply_markup})}catch(e){if(!/message is not modified/i.test(String(e)))throw e}
 const lock=LockService.getScriptLock();lock.waitLock(3000);try{tgTablePatch_('TelegramApprovalMessages',card.id,{message_id:card.message_id,status:rendered.closed?'closed':'active',render_hash:hash,updated_at:new Date().toISOString(),error:''})}finally{lock.releaseLock()}
 if(created)try{tgCardNotifyAssignees_(card,x)}catch(e){console.error('Tin duyệt đã gửi; cần kiểm tra thông báo riêng',e)}return true;
}
function syncTelegramApprovals(){if(!tgApprovalsEnabled_())return {enabled:false};return botBackgroundJob_('approval-cards',()=>{
 const items=rows_('ProductionItems').filter(x=>x.id).map(normalizeProductionItem_),byId=new Map(items.map(x=>[String(x.id),x])),existing=tgCardRows_();let changed=0;const started=Date.now();
 TG_APPROVAL_RENDER_CONTEXT=readScope_(()=>({people:new Map(people_().map(p=>[String(p.telegram_id),p])),chats:new Map([...new Set(items.map(x=>String(x.project)))].map(p=>[p,projectChatId_(p)]))}));
 try{
 // Existing open messages are reconciled first: app decisions, replacement and deletion.
 for(const card of existing.filter(c=>!['closed','failed','sending'].includes(String(c.status)))){if(changed>=15||Date.now()-started>45000)break;try{if(tgCardSync_(card,byId.get(String(card.production_id))))changed++}catch(e){console.error('Không cập nhật được tin duyệt '+card.id,e)}}
 const signatures=new Set(existing.map(c=>c.production_id+':'+c.kind+':'+c.signature+':'+c.chat_id));
 for(const x of items){if(changed>=15||Date.now()-started>45000)break;for(const kind of ['idea','final']){if(!tgApprovalCandidate_(x,kind))continue;try{const chat=projectChatId_(x.project);if(!chat||signatures.has(String(x.id)+':'+kind+':'+tgApprovalSignature_(x,kind)+':'+chat))continue;const card=tgCardCreate_(x,kind);if(card&&tgCardSync_(card,x))changed++}catch(e){console.error('Không tạo được tin duyệt '+x.id,e)}}}
 return {ok:true,changed};
 }finally{TG_APPROVAL_RENDER_CONTEXT=null}
 })}
function tgApprovalActor_(id){const p=person_(String(id));if(!p)throw Error('Tài khoản không còn hoạt động');return {id:String(id),name:String(p.raw_name||p.name),role:role_(p.role),department:String(p.department||'')}}
function tgCallbackCard_(q){const m=/^ap:([a-f0-9]{24}):(idea|content|media|vj):(yes|no)$/.exec(String(q.data||''));if(!m)throw Error('Nút không hợp lệ');const card=tgCardRows_().find(c=>c.id===m[1]);if(!card||!q.message||!['group','supergroup'].includes(q.message.chat?.type)||String(q.message.chat.id)!==String(card.chat_id)||String(q.message.message_id)!==String(card.message_id))throw Error('Nút không thuộc tin duyệt gốc');if(card.kind==='idea'&&m[2]!=='idea'||card.kind==='final'&&m[2]==='idea')throw Error('Vai trò duyệt không hợp lệ');return {card,kind:m[2],decision:m[3]}}
function tgAnswer_(q,text,alert){try{botApi_('answerCallbackQuery',{callback_query_id:q.id,text:String(text).slice(0,180),show_alert:!!alert})}catch(e){try{tgSend_(String(q.from.id),String(text))}catch(err){console.error('Không phản hồi được nút duyệt',err)}}}
function tgApprovalApply_(u,card,kind,decision,note,updateId){const expected={...card,update_id:String(updateId||'')};return kind==='idea'?approvalSet_(u,card.production_id,'idea_approval',decision,note,expected):v20FinalSet_(u,card.production_id,kind,decision,note,false,expected)}
function tgHandleApprovalCallback_(q,updateId){if(!tgApprovalsEnabled_()||!String(q.data||'').startsWith('ap:'))return;tgAnswer_(q,'Đã chuyển sang duyệt trong Mini App. Bấm Mở để duyệt trên tin nhóm.',true)}
function tgHandleApprovalFeedback_(m,updateId){if(!tgApprovalsEnabled_()||!m?.reply_to_message||!['group','supergroup'].includes(m.chat?.type))return false;const pending=rows_('TelegramApprovalFeedback').find(v=>String(v.chat_id)===String(m.chat.id)&&String(v.prompt_message_id)===String(m.reply_to_message.message_id)&&v.status==='pending');if(!pending)return false;if(String(m.from?.id)===String(pending.actor_id))botApi_('sendMessage',{chat_id:String(m.chat.id),text:'Đã chuyển sang nhập phản hồi và duyệt trong Mini App. Bấm Mở để duyệt trên tin nhóm.',reply_parameters:{message_id:m.message_id}});return true}
// Failed sends are not blindly retried: the HTTP request may already have reached Telegram.
function retryFailedTelegramApprovalMessages(){
 const lock=LockService.getScriptLock();lock.waitLock(5000);let count=0;try{for(const c of tgCardRows_().filter(c=>c.status==='failed'||c.status==='sending'&&Date.parse(c.updated_at)<Date.now()-10*60000)){if(c.message_id)continue;tgTablePatch_('TelegramApprovalMessages',c.id,{status:'queued',error:'',updated_at:new Date().toISOString()});count++}}finally{lock.releaseLock()}return 'Đã đưa '+count+' tin vào hàng đợi. Chỉ chạy sau khi đã kiểm tra nhóm tránh gửi trùng.';
}
function checkTelegramApprovals(){
 const enabled=tgApprovalsEnabled_(),hook=botApi_('getWebhookInfo',{}),cards=enabled?tgCardRows_():[],items=rows_('ProductionItems'),missing=items.filter(x=>tgApprovalCandidate_(x,'idea')||tgApprovalCandidate_(x,'final')).filter(x=>!projectChatId_(x.project)).map(x=>({id:x.id,project:x.project}));
 const out={enabled,pollTrigger:ScriptApp.getProjectTriggers().some(t=>t.getHandlerFunction()==='pollBotUpdates'),webhookActive:!!hook.url,cards:cards.length,pending:cards.filter(c=>c.status==='queued').length,failed:cards.filter(c=>c.status==='failed'||c.status==='sending').map(c=>({id:c.id,task:c.production_id,status:c.status,error:c.error})),missingGroup:missing};console.log(JSON.stringify(out));return out;
}

// Repair URLs on existing cards, including completed approvals; never resend messages.
function repairTelegramApprovalLinks(){const result=botBackgroundJob_('approval-cards',()=>{const props=PropertiesService.getScriptProperties(),cards=tgCardRows_().filter(c=>c.message_id),start=Number(props.getProperty('TG_LINK_REPAIR_CURSOR')||0),items=new Map(rows_('ProductionItems').filter(x=>x.id).map(x=>[String(x.id),normalizeProductionItem_(x)]));let i=start,changed=0;const at=Date.now();for(;i<cards.length&&i<start+15&&Date.now()-at<45000;i++){if(tgCardSync_(cards[i],items.get(String(cards[i].production_id))))changed++}if(i>=cards.length)props.deleteProperty('TG_LINK_REPAIR_CURSOR');else props.setProperty('TG_LINK_REPAIR_CURSOR',String(i));return {ok:true,changed,processed:i,total:cards.length,done:i>=cards.length}});console.log(JSON.stringify(result));return result}

// V20.30.8: direct navigation and guarded decisions in Mini App only.
function setupAppApprovalLinks(){tgAppUrl_();const p=PropertiesService.getScriptProperties();p.deleteProperty('TG_LINK_REPAIR_CURSOR');return repairTelegramApprovalLinks()}
function approvalTargetData_(u,id,card){const x=productionRow_(id).item,team=teamRows_();if(String(x.stage)==='deleted'||!productionVisibleRows_(u,team).some(r=>String(r.id)===String(id)))throw Error('Task đã xóa hoặc bạn không có quyền xem');return {ok:true,item:withProductionTeam_([x],team)[0],kind:card?.kind||'',stale:!!card&&card.signature!==tgApprovalSignature_(x,card.kind),peopleNames:productionPeopleNames_(),productionPeople:people_(),projects:v20Projects_()}}
function productionPeopleNames_(){return Object.fromEntries(people_().map(p=>[String(p.telegram_id),String(p.name||'')]))}
function openProductionApproval(initData,start){const u=auth_(initData);if(/^task_[A-Za-z0-9_-]{1,480}$/.test(String(start||''))){let id;try{id=Utilities.newBlob(Utilities.base64DecodeWebSafe(String(start).slice(5))).getDataAsString('UTF-8')}catch(e){throw Error('Đường dẫn nội dung không hợp lệ')}return readScope_(()=>({...approvalTargetData_(u,id,null),kind:'task'}));}const m=/^review_([a-f0-9]{24})$/.exec(String(start||''));if(!m)throw Error('Đường dẫn task không hợp lệ');const card=tgCardRows_().find(c=>String(c.id)===m[1]);if(!card)throw Error('Không tìm thấy thông báo duyệt');return readScope_(()=>approvalTargetData_(u,card.production_id,card))}
function productionApprovalSnapshot_(x){return {id:String(x.id),project:x.project,title:x.title,brief:x.brief,approver_id:x.approver_id,tg_idea_revision:x.tg_idea_revision,final_url:x.final_url,tg_final_revision:x.tg_final_revision,content_approver_ids:x.content_approver_ids,media_approver_ids:x.media_approver_ids,vj_final_required:x.vj_final_required,vj_id:x.vj_id}}
function submitAppProductionApproval(initData,data){productionWritable_(auth_(initData));const u=auth_(initData);if(!data||!['idea','content','media','vj'].includes(data.kind)||String(data.snapshot?.id)!==String(data.id)||!/^app_[A-Za-z0-9_-]{12,100}$/.test(String(data.request_id||'')))throw Error('Yêu cầu duyệt không hợp lệ');const snap=data.snapshot,expected={production_id:String(data.id),signature:tgApprovalSignature_(snap,data.kind==='idea'?'idea':'final'),chat_id:projectChatId_(snap.project),source:'app',update_id:data.request_id};try{if(data.kind==='idea')approvalSet_(u,data.id,'idea_approval',data.decision,data.note,expected);else v20FinalSet_(u,data.id,data.kind,data.decision,data.note,false,expected)}catch(e){const x=productionRow_(data.id).item,prefix=data.kind==='idea'?'idea_approval':data.kind+'_final';if(tgApprovalSignature_(x,data.kind==='idea'?'idea':'final')===expected.signature&&tgApprovalDecision_(x,data.kind)===data.decision&&String(x[prefix+'_reviewer'])===u.id&&String(x[prefix+'_feedback']||'')===String(data.note||'').trim()&&!!x[prefix+'_reviewed_at']&&String(x[prefix+'_reviewed_at'])!==String(data.prior_reviewed_at||''))return productionResult_(data.id,'Quyết định đã lưu. Thông báo cần kiểm tra đồng bộ.');throw e}return productionResult_(data.id)}
function productionApprovalRequestStatus(initData,data){const u=auth_(initData);if(!data||!['idea','content','media','vj'].includes(data.kind)||String(data.snapshot?.id)!==String(data.id))throw Error('Yêu cầu kiểm tra không hợp lệ');const lock=LockService.getScriptLock();if(!lock.tryLock(1000))return {ok:true,pending:true,saved:false};try{const result=approvalTargetData_(u,data.id),x=result.item,kind=data.kind,prefix=kind==='idea'?'idea_approval':kind+'_final',same=tgApprovalSignature_(x,kind==='idea'?'idea':'final')===tgApprovalSignature_(data.snapshot,kind==='idea'?'idea':'final');const saved=same&&tgApprovalDecision_(x,kind)===String(data.decision)&&String(x[prefix+'_reviewer'])===String(u.id)&&String(x[prefix+'_feedback']||'')===String(data.note||'').trim()&&!!x[prefix+'_reviewed_at']&&String(x[prefix+'_reviewed_at'])!==String(data.prior_reviewed_at||'');return {ok:true,saved,pending:false,item:x,stale:!same,retryAllowed:same&&tgApprovalOpen_(x,kind),processed:!tgApprovalOpen_(x,kind)}}finally{lock.releaseLock()}}

// V20.30.10: optional Final Leaders, mandatory primary VJ; no change to Idea approval.
function productionFinalKinds_(x){return [];}
function productionFinalApproved_(x){return x.idea_approval==='Duyệt'&&!!String(x.final_url||'').trim()&&String(x.final_delivery_status||'')!=='draft';}
// Run once after replacing Code.gs, before deploying. Idempotent, no Telegram HTTP.
function setupProductionV203010(){
 const lock=LockService.getScriptLock();lock.waitLock(15000);const result={ok:true,oldTasks:0,missingVj:[],changed:0,publishedPreserved:0};
 try{const s=sheet_('ProductionItems'),h=s.getRange(1,1,1,s.getLastColumn()).getValues()[0].map(String);
  for(const key of ['id','stage','vj_id','idea_approval','final_approval','content_approver_ids','media_approver_ids','content_final_approval','media_final_approval','vj_final_approval','updated_at'])if(!h.includes(key))throw Error('Thiếu cột '+key+'; chưa đồng bộ task cũ');
  for(const key of ['production_metrics_version','vj_final_required'])if(!h.includes(key)){const col=h.length+1;if(typeof s.getMaxColumns==='function'&&col>s.getMaxColumns())s.insertColumnsAfter(s.getMaxColumns(),col-s.getMaxColumns());s.getRange(1,col).setValue(key);h.push(key);}
  const a=s.getDataRange().getValues();for(let i=1;i<a.length;i++){const x=Object.fromEntries(h.map((k,j)=>[k,cell_(k,a[i][j])]));if(!x.id)continue;
   const f={sheet:s,row:i+1,item:x};if(String(x.production_metrics_version)!=='2'){result.oldTasks++;if(!x.production_metrics_version)productionExtraValue_(f,'production_metrics_version','legacy');}
   if(x.vj_final_required!==true){s.getRange(i+1,h.indexOf('vj_final_required')+1).setValue(true);result.changed++;}
   if(!x.vj_id&&x.stage!=='deleted')result.missingVj.push({id:String(x.id),title:String(x.title||'')});
   if(x.stage==='published'||x.published_status==='published'){result.publishedPreserved++;continue;}
   const fresh=normalizeProductionItem_(x);if(fresh.stage!==x.stage||String(fresh.final_approval||'')!==String(x.final_approval||'')){productionSet_(f,'stage',fresh.stage);v20Set_(f,'final_approval',fresh.final_approval||'');productionSet_(f,'updated_at',new Date().toISOString());result.changed++;}
  }
 }finally{try{SpreadsheetApp.flush()}finally{lock.releaseLock()}}
 console.log(JSON.stringify(result));return result;
}

// V20.30.12: Final is a deliverable, not an approval step.
function obsoleteFinalNotification_(key){
 key=String(key);
 if(/^approval-alert:/.test(key)){const m=/^approval-alert:([^:]+):/.exec(key),card=m&&tgCardRows_().find(c=>String(c.id)===m[1]);return !!card&&card.kind==='final';}
 return /^(?:production|project):.+:review:/.test(key)||/^project:.+:(?:content|media|vj)_final_approval:/.test(key)||/^v20:review:.+:(?:content|media|vj)_final_approval:/.test(key);
}
function setupProductionV203012(){
 const lock=LockService.getScriptLock();lock.waitLock(15000);const out={ok:true,changed:0,publishedPreserved:0,cancelledFinalNotifications:0};
 try{
  const sh=sheet_('ProductionItems'),a=sh.getDataRange().getValues(),h=a[0].map(String),stage=h.indexOf('stage'),updated=h.indexOf('updated_at');
  if(!h.includes('id')||stage<0||updated<0||!h.includes('final_url')||!h.includes('idea_approval'))throw Error('Thiếu cột trong ProductionItems');
  for(let i=1;i<a.length;i++){if(!a[i][h.indexOf('id')])continue;const x=Object.fromEntries(h.map((k,j)=>[k,cell_(k,a[i][j])])),fresh=normalizeProductionItem_(x);
   if(x.stage==='published'||x.published_status==='published')out.publishedPreserved++;
   if(fresh.stage!==x.stage){sh.getRange(i+1,stage+1).setValue(fresh.stage);sh.getRange(i+1,updated+1).setValue(new Date().toISOString());out.changed++;}
  }
  const notifications=book_().getSheetByName('Notifications');if(notifications){const n=notifications.getDataRange().getValues();for(let i=1;i<n.length;i++)if(['pending','failed'].includes(String(n[i][4]))&&obsoleteFinalNotification_(n[i][1])){notifications.getRange(i+1,5).setValue('cancelled');notifications.getRange(i+1,8).setValue('Đã bỏ bước duyệt Final');out.cancelledFinalNotifications++;}}
 }finally{try{SpreadsheetApp.flush()}finally{lock.releaseLock()}}
 console.log(JSON.stringify(out));return out;
}


// V20.30.13: one progress value per production video; no notification on percentage updates.
function editorProgressOpen_(x){return x.idea_approval==='Duyệt'&&!productionFinalApproved_(x)&&['edit','revision','review'].includes(String(x.stage))&&!!String(x.raw_url||'').trim()&&(!!String(x.editor_received_at||x.editor_handoff_at||'')||String(x.stage)==='edit'||String(x.stage)==='revision');}
function setEditorProgress(initData,id,percent){productionWritable_(auth_(initData));return createWriteScope_(()=>{
 const u=auth_(initData),n=Number(percent);if(!Number.isInteger(n)||n<10||n>90||n%10!==0)throw Error('Tiến độ phải là 10%, 20%, … 90%. Dùng Gửi hoàn thành để đạt 100%.');
 const lock=LockService.getScriptLock();lock.waitLock(15000);
 try{const f=productionRow_(id),x=f.item;if(!teamIds_(x,'Editor').includes(String(u.id)))throw Error('Chỉ Editor đang được phân công được cập nhật tiến độ');if(!editorProgressOpen_(x))throw Error('Chỉ cập nhật sau khi bàn giao và trước khi gửi hoàn thành');
 if(Number(x.editor_progress||0)!==n){const now=new Date().toISOString();productionExtraValue_(f,'editor_progress',n);productionExtraValue_(f,'editor_progress_at',now);productionExtraValue_(f,'editor_progress_by',String(u.id));productionSet_(f,'updated_at',now);SpreadsheetApp.flush();}
 }finally{lock.releaseLock()}return productionResult_(id);
});}
function openProductionWorkTask(initData,id){return readScope_(()=>({...approvalTargetData_(auth_(initData),id,null),kind:'task'}));}

// Independent role checks are intentional: the same person can be HR AND accountant.
function operationalWorkQueue_(u){
 const me=String(u.id),hr=me===String(setting_('hr_telegram_id')||''),accountant=me===String(setting_('accountant_telegram_id')||''),director=isDirector_(u),names=new Map(rows_('Employees').map(p=>[String(p.telegram_id),String(p.name||p.telegram_id)])),q=[];
 const push=(kind,x,title,status,detail,extra)=>q.push({id:'operational:'+kind+':'+x.id+(extra?.point?':'+extra.point:''),record_id:String(x.id),operational_kind:kind,title,assignee_name:names.get(String(x.telegram_id))||String(x.telegram_id||''),created_at:String(x.created_at||x.date||''),status,detail,...extra});
 if(hr)for(const x of rows_('Leave'))if(x.id&&x.status==='pending')push('leave',x,'Đơn xin nghỉ','Chờ HR duyệt',String(x.start_date)+' → '+String(x.end_date)+' · '+String(x.reason||''));
 if(hr||director)for(const x of rows_('EquipmentLoans'))if(x.id&&x.status==='pending')push('loan',x,'Mượn thiết bị: '+String(x.device||''),'Chờ HR duyệt',String(x.project||'')+' · '+String(x.borrow_at||''));
 if(accountant||director)for(const x of expensesWithProduction_(rows_('Expenses')))if(x.id&&['pending','approved'].includes(x.status))push('expense',x,String(x.description||'Phiếu chi'),x.status==='pending'?'Chờ kế toán duyệt':'Chờ thanh toán',String(x.project||'')+' · '+Number(x.amount_vnd||0).toLocaleString('vi-VN')+' đ · Nội dung: '+expenseProductionText_(x)+(x.status==='approved'&&!x.bank_account?' · Chờ bổ sung STK':''));
 const access=fieldAccess_(u);if(access.enabled&&access.canView){const employees=new Map(rows_('Employees').map(p=>[String(p.telegram_id),p]));for(const x of rows_('Attendance')){if(!x.id)continue;const owner=employees.get(String(x.telegram_id));if(!owner)continue;for(const point of ['in','out']){let p;try{p=fieldPoint_(x,point)}catch(e){continue}if(p&&p.status==='pending'&&fieldCanReview_(u,p,owner.telegram_id))push('attendance',x,'Chấm công đi quay · '+(point==='in'?'Vào ca':'Xuống ca'),'Chờ xác nhận',String(x.date||'')+' · '+String(owner.department||''),{point,date:String(x.date||'')});}}}
 return q.sort((a,b)=>(Date.parse(a.created_at)||0)-(Date.parse(b.created_at)||0)||a.id.localeCompare(b.id));
}
function openOperationalWork(initData,kind,id,point){return readScope_(()=>{
 const u=auth_(initData),entry=operationalWorkQueue_(u).find(x=>x.operational_kind===String(kind)&&x.record_id===String(id)&&String(x.point||'')===String(point||''));if(!entry)throw Error('Phiếu đã được xử lý hoặc bạn không có quyền xử lý');
 const table={leave:'Leave',loan:'EquipmentLoans',expense:'Expenses',attendance:'Attendance'}[kind],item=rows_(table).find(x=>String(x.id)===String(id));return {ok:true,entry,item:kind==='expense'?expensesWithProduction_([item])[0]:item,hrApproverId:String(setting_('hr_telegram_id')||''),accountantId:String(setting_('accountant_telegram_id')||''),peopleNames:Object.fromEntries(rows_('Employees').map(p=>[String(p.telegram_id),String(p.name||p.telegram_id)]))};
});}

function productionWorkProgress_(x){const keys=["id","stage","idea_approval","raw_url","final_url","final_delivery_status","editor_received_at","editor_handoff_at","editor_id","editor_ids","editor_progress","editor_progress_by","editor_progress_at","vj_id","vj_ids","vj_script_started_at","vj_script_started_by","raw_delivery_due_at"];return Object.fromEntries(keys.map(k=>[k,x[k]===undefined?"":x[k]]));}

function expenseProductionRequired_(u,project,id){id=String(id||'').trim();if(!id)throw Error('Bắt buộc chọn Nội dung sản xuất cho phiếu chi');const x=productionVisibleRows_(u,teamRows_()).find(x=>String(x.id)===id&&String(x.stage)!=='deleted');if(!x||String(x.project)!==String(project))throw Error('Nội dung sản xuất không thuộc dự án đã chọn hoặc bạn không có quyền xem');return id;}
function expenseProductionOptions(initData,project){return readScope_(()=>{const u=auth_(initData);project=String(project||'').trim();if(!project||!v20Projects_().includes(project))throw Error('Chọn dự án hợp lệ');return {ok:true,project,items:productionVisibleRows_(u,teamRows_()).filter(x=>String(x.project)===project&&String(x.stage)!=='deleted').map(x=>({id:String(x.id),title:String(x.title||'')}))};});}

// Completion notifications have the same two navigation buttons in private chats and groups.
function notificationMessageMarkup_(key,message){
 const match=/^final-saved:([^:]+):/.exec(String(key||''));if(!match)return tgPrivateApprovalMarkup_(key);
 const url=/^Video Final: (https:\/\/[^\s]+)$/m.exec(String(message||''))?.[1],buttons=[];
 if(url)buttons.push([{text:'▶️ Xem Video Final',url}]);
 try{const token=Utilities.base64EncodeWebSafe(String(match[1]),Utilities.Charset.UTF_8).replace(/=+$/,'');buttons.push([{text:'📱 Mở nội dung',url:tgAppUrl_(null).replace(/\?startapp=home$/,'?startapp=task_'+token)}]);}catch(e){console.error('Không tạo được nút mở nội dung Final: '+String(e));}
 return buttons.length?{inline_keyboard:buttons}:undefined;
}

function startVJScript(initData,id){productionWritable_(auth_(initData));return createWriteScope_(()=>{
 const u=auth_(initData),lock=LockService.getScriptLock();lock.waitLock(15000);
 try{const f=productionRow_(id),x=f.item;if(!teamIds_(x,'VJ').includes(String(u.id)))throw Error('Chỉ VJ được phân công được bắt đầu làm kịch bản');if(x.idea_approval!=='Duyệt'||!['script','shoot'].includes(String(x.stage))||x.editor_received_at||x.editor_handoff_at)throw Error('Chỉ bắt đầu sau khi Idea được duyệt và trước khi bàn giao');
 if(!x.vj_script_started_at){const now=new Date().toISOString(),due=new Date(Date.parse(now)+12*3600000).toISOString();productionExtraValue_(f,'vj_script_started_at',now);productionExtraValue_(f,'vj_script_started_by',String(u.id));productionExtraValue_(f,'raw_delivery_due_at',due);productionSet_(f,'updated_at',now);SpreadsheetApp.flush();}
 }finally{lock.releaseLock()}return productionResult_(id);
});}

// Resolve invoice links in one pass, independent of the paginated Production screen.
function expensesWithProduction_(items){
 const linked=items.some(x=>String(x?.production_id||'').trim()),byId=linked?new Map(rows_('ProductionItems').map(x=>[String(x.id),x])):new Map();
 return items.map(x=>{const id=String(x.production_id||'').trim(),task=id?byId.get(id):null;return {...x,production_title:String(task?.title||x.production_title||''),production_link_state:!id?'unlinked':!task?'missing':String(task.stage)==='deleted'?'deleted':'linked'};});
}
function expenseProductionText_(x){const item=x.production_link_state?x:expensesWithProduction_([x])[0];if(item.production_title)return item.production_title+(item.production_link_state==='deleted'?' (nội dung đã xóa)':'');return item.production_link_state==='unlinked'?'Phiếu cũ chưa liên kết nội dung':'Không tìm thấy nội dung · '+String(item.production_id||'');}

// V20.30.20: dates use the Vietnam calendar; endpoints reject director writes.
function productionWritable_(u){if(isDirector_(u))throw Error('Ban giám đốc chỉ được xem Công việc và Sản xuất');}
function leaderProductionDelete_(u,x){return u.role==='leader'&&String(x.department)===String(u.department);}
function productionDateRange_(from,to){
 const valid=v=>{v=String(v||'');if(!v)return '';if(!/^\d{4}-\d{2}-\d{2}$/.test(v)||new Date(v+'T00:00:00Z').toISOString().slice(0,10)!==v)throw Error('Ngày không hợp lệ');return v;};
 from=valid(from);to=valid(to);if(from&&to&&from>to)throw Error('Từ ngày phải trước hoặc bằng Đến ngày');return {from,to};
}
function productionRangeMatches_(value,range){if(!range.from&&!range.to)return true;const t=Date.parse(String(value||''));if(!Number.isFinite(t))return false;return (!range.from||t>=Date.parse(range.from+'T00:00:00+07:00'))&&(!range.to||t<Date.parse(range.to+'T00:00:00+07:00')+86400000);}
function productionDateValue_(x,key){if(key==='editor_received_at')return x.editor_received_at||x.editor_handoff_at||performanceEventAt_(x,'shoot');if(key==='final_completed_at')return x.final_completed_at||performanceEventAt_(x,'approved');return x[key]||'';}
function performanceEventAt_(x,key){try{return JSON.parse(String(x.performance_milestones||'{}'))[key]?.at||''}catch(e){return ''}}
function performancePeriod_(input){
 const f=input&&typeof input==='object'?input:{mode:'month',month:input},mode=f.mode||'month';
 if(mode==='month'){const month=String(f.month||stamp_(new Date(),'yyyy-MM'));if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw Error('Tháng không hợp lệ');const [y,m]=month.split('-').map(Number),last=new Date(Date.UTC(y,m,0)).getUTCDate();return {...productionDateRange_(month+'-01',month+'-'+String(last).padStart(2,'0')),month,mode};}
 if(mode==='day'){const day=String(f.day||'');if(!day)throw Error('Chọn ngày để xem');return {...productionDateRange_(day,day),month:day.slice(0,7),day,mode};}
 if(mode==='range'){if(!f.from||!f.to)throw Error('Chọn đủ Từ ngày và Đến ngày');return {...productionDateRange_(f.from,f.to),month:String(f.from).slice(0,7),mode};}throw Error('Chế độ xem không hợp lệ');
}

function productionTaskRangeMatches_(x,type,range){
 if(!range.from&&!range.to)return true;
 const keys=type==='all'?['created_at','shoot_at','editor_received_at','final_completed_at','published_at']:[type];
 return keys.some(key=>productionRangeMatches_(productionDateValue_(x,key),range));
}
