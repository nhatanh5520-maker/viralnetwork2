// Booking: a commercial job wrapped around one normal production video.
// Flow: Account creates booking (brand, amount, dates, CC, VJ, Talent) -> the
// video starts with Idea already approved -> CC/VJ saves the script -> Account
// approves it (raw footage / hand-off are locked until then) -> normal production
// -> after publishing, CC/VJ enter views/engagement (reminded after 48h) ->
// Account confirms acceptance.
const BOOKING_HEADERS=['id','production_id','brand','amount_vnd','acceptance_at','account_id','cc_id','vj_id','talent_id','script_status','script_url','script_note','script_submitted_at','script_reviewed_at','script_reviewed_by','views','likes','comments','shares','metrics_note','metrics_by','metrics_at','accepted_at','accepted_by','created_at','updated_at'];
var BOOKING_SKIP_LEADER=false;

function bookingNormalize_(s){return String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/đ/gi,'d').toLowerCase();}
function bookingRoleText_(id){const p=person_(id);return bookingNormalize_([p?.job_title,p?.department].join(' '));}
function bookingIsAccount_(u){return /account|kinh doanh|sales/.test(bookingRoleText_(u.id));}
function bookingIsAccountManager_(u){const t=bookingRoleText_(u.id);return /account manager|truong phong kinh doanh|sales manager/.test(t)||role_(u.role)==='leader'&&bookingIsAccount_(u);}
function bookingIsAccountant_(u){return String(setting_('accountant_telegram_id')||'')===String(u.id);}
function bookingSeesAll_(u){return isDirector_(u)||role_(u.role)==='leader'||bookingIsAccountant_(u)||bookingIsAccountManager_(u);}
function bookingSeesMoney_(u,b){return isDirector_(u)||bookingIsAccountant_(u)||bookingIsAccountManager_(u)||String(b.account_id)===String(u.id);}
function bookingCanManage_(u,b){return String(b.account_id)===String(u.id)||bookingIsAccountManager_(u);}

// Read paths never create the sheet: a read must not change stored data.
function bookingTable_(create){
 let s=book_().getSheetByName('Bookings');
 if(!s){if(!create)return {sheet:null,headers:BOOKING_HEADERS,list:[]};s=book_().insertSheet('Bookings');s.appendRow(BOOKING_HEADERS);}
 const a=s.getDataRange().getValues(),h=a[0].map(String);
 if(create){if(h.every(x=>!x)){s.getRange(1,1,1,BOOKING_HEADERS.length).setValues([BOOKING_HEADERS]);return bookingTable_(true);}const missing=BOOKING_HEADERS.filter(k=>!h.includes(k));if(missing.length){missing.forEach((k,i)=>s.getRange(1,h.length+i+1).setValue(k));return bookingTable_(true);}}
 const list=a.slice(1).map((r,i)=>{const item={};h.forEach((k,j)=>{if(k)item[k]=r[j];});return {row:i+2,item};}).filter(f=>f.item.id);
 return {sheet:s,headers:h,list};
}
function bookingSet_(t,f,values){for(const [k,v] of Object.entries(values)){const c=t.headers.indexOf(k)+1;if(c<1)throw Error('Thiếu cột Booking '+k);t.sheet.getRange(f.row,c).setValue(v);f.item[k]=v;}}
function bookingFind_(id,create){const t=bookingTable_(create),f=t.list.find(x=>String(x.item.id)===String(id));if(!f)throw Error('Không tìm thấy booking.');return {t,f};}
function bookingForProduction_(productionId){return bookingTable_(false).list.find(f=>String(f.item.production_id)===String(productionId))||null;}
function bookingDate_(value,label,required){if(!value){if(required)throw Error('Cần nhập '+label+'.');return '';}const d=new Date(value);if(isNaN(d.getTime()))throw Error(label+' không hợp lệ.');return d.toISOString();}
function bookingPersonId_(value,label,required){const id=String(value||'').trim();if(!id){if(required)throw Error('Cần chọn '+label+'.');return '';}if(!person_(id))throw Error(label+' chưa có tài khoản đang hoạt động.');return id;}
function bookingName_(id){const p=person_(id);return p?String(p.raw_name||p.name):'';}
function bookingWhen_(iso){return iso?stamp_(new Date(iso),'dd/MM/yyyy HH:mm'):'—';}
function bookingNotify_(b,event,ids,message){const now=new Date().toISOString();[...new Set(ids.map(String).filter(Boolean))].forEach(who=>queueNotification_('booking:'+b.id+':'+event+':'+now+':'+who,who,message));}
function bookingCrew_(b,x){return [b.cc_id,b.vj_id,...(x?teamIds_(x,'VJ'):[])].map(String).filter(Boolean);}

function bookingStatus_(b,x){
 if(!x||x.stage==='deleted')return 'cancelled';
 if(b.accepted_at)return 'done';
 if(b.metrics_at)return 'acceptance';
 if(String(x.stage)==='published')return 'metrics';
 if(b.script_status==='approved')return 'production';
 if(b.script_status==='submitted')return 'script_review';
 return 'script'; // pending or revision: waiting for a (new) script link
}
const BOOKING_STATUS_LABELS={script:'Chờ kịch bản',script_review:'Chờ duyệt kịch bản',production:'Đang sản xuất',metrics:'Chờ số liệu',acceptance:'Chờ nghiệm thu',done:'Hoàn tất',cancelled:'Đã hủy'};
function bookingStageLabel_(x){return ({brief:'Idea',script:'Kịch bản',shoot:'Quay',edit:'Dựng',review:'Duyệt video',revision:'Sửa video',ready:'Chờ đăng',published:'Đã đăng'})[String(x?.stage)]||'';}

function bookingView_(u,b,x,team){
 const status=bookingStatus_(b,x),me=String(u.id),crew=bookingCrew_(b,x),manage=bookingCanManage_(u,b);
 const metricsDue=x&&x.published_at?new Date(Date.parse(x.published_at)+48*3600000).toISOString():'';
 const view={id:String(b.id),production_id:String(b.production_id),brand:String(b.brand),title:String(x?.title||''),project:String(x?.project||''),brief:String(x?.brief||''),
  shoot_at:String(x?.shoot_at||''),deliver_at:String(x?.deadline||''),acceptance_at:String(b.acceptance_at||''),
  account_id:String(b.account_id),cc_id:String(b.cc_id),vj_id:String(b.vj_id),talent_id:String(b.talent_id),editor_ids:x?teamIds_(x,'Editor',team):[],
  stage:String(x?.stage||''),stage_label:bookingStageLabel_(x),script_url:String(x?.script_url||''),script_status:String(b.script_status||'pending'),script_note:String(b.script_note||''),script_reviewed_at:String(b.script_reviewed_at||''),
  published_at:String(x?.published_at||''),metrics_due_at:metricsDue,final_url:String(x?.final_url||''),tiktok_url:String(x?.tiktok_url||''),facebook_url:String(x?.facebook_url||''),
  metrics:b.metrics_at?{views:Number(b.views||0),likes:Number(b.likes||0),comments:Number(b.comments||0),shares:Number(b.shares||0),note:String(b.metrics_note||''),by:String(b.metrics_by||''),at:String(b.metrics_at)}:null,
  accepted_at:String(b.accepted_at||''),created_at:String(b.created_at||''),status,status_label:BOOKING_STATUS_LABELS[status],
  can:{review_script:manage&&status==='script_review',submit_metrics:(crew.includes(me)||String(b.talent_id)===me)&&['metrics','acceptance'].includes(status),accept:manage&&status==='acceptance'}};
 if(bookingSeesMoney_(u,b))view.amount_vnd=Number(b.amount_vnd||0);
 return view;
}
function bookingScreenData_(u){
 const items=new Map(rows_('ProductionItems').map(x=>[String(x.id),x])),team=teamRows_(),me=String(u.id),all=bookingSeesAll_(u);
 const bookings=bookingTable_(false).list.map(f=>f.item).filter(b=>{if(all)return true;const x=items.get(String(b.production_id));return [b.account_id,b.cc_id,b.vj_id,b.talent_id,...(x?[x.cam_id,...teamIds_(x,'VJ',team),...teamIds_(x,'Editor',team)]:[])].map(String).includes(me);})
  .map(b=>bookingView_(u,b,items.get(String(b.production_id)),team)).sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)));
 return {ok:true,bookings,canCreate:!isDirector_(u)&&(bookingIsAccount_(u)||bookingIsAccountManager_(u)),seesAll:all,seesMoney:isDirector_(u)||bookingIsAccountant_(u)||bookingIsAccountManager_(u)};
}
function bookingScreen(initData){const u=auth_(initData);return readScope_(()=>bookingScreenData_(u));}

// --- Production integration -------------------------------------------------
// Booking videos have no Leader Idea approval (the deal is closed), and the
// Content Creator joins the VJ team even without a VJ job title.
const bookingLeaderCheck_=webRequireIdeaLeader_;
webRequireIdeaLeader_=function(id){if(BOOKING_SKIP_LEADER&&!id)return;return bookingLeaderCheck_(id);};
const bookingValidateAssignments_=validateProductionAssignments_;
validateProductionAssignments_=function(vj,cam,editors,thumbnail,before){
 if(BOOKING_SKIP_LEADER)vj=(vj||[]).filter(id=>{const p=person_(id);return !(p&&productionCapabilities_(p).includes('content'));});
 return bookingValidateAssignments_(vj,cam,editors,thumbnail,before);
};
const bookingAssignData_=assignProductionData_;
assignProductionData_=function(initData,id,data){
 if(bookingForProduction_(id)&&!data?.approver_id){BOOKING_SKIP_LEADER=true;try{return bookingAssignData_(initData,id,data);}finally{BOOKING_SKIP_LEADER=false;}}
 return bookingAssignData_(initData,id,data);
};
function bookingRequireScript_(productionId){const f=bookingForProduction_(productionId);if(f&&f.item.script_status!=='approved')throw Error('Booking: Account cần duyệt kịch bản trước khi đi quay, lưu Raw hoặc bàn giao cho Editor.');}
const bookingSaveAsset_=saveProductionAsset;
saveProductionAsset=function(initData,id,field,value){
 if(['raw_url','voice_url'].includes(field))bookingRequireScript_(id);
 const result=bookingSaveAsset_(initData,id,field,value);
 if(field==='script_url')bookingScriptSaved_(initData,id);
 return result;
};
const bookingHandoff_=handoffProductionAssets;
handoffProductionAssets=function(initData,id){bookingRequireScript_(id);return bookingHandoff_(initData,id);};

function bookingScriptSaved_(initData,productionId){
 const u=auth_(initData),found=bookingForProduction_(productionId);if(!found)return;
 const t=bookingTable_(true),f=t.list.find(x=>String(x.item.id)===String(found.item.id)),b=f.item,x=productionRow_(productionId).item,url=String(x.script_url||''),now=new Date().toISOString();
 if(!url||url===String(b.script_url||''))return;
 const head='Thương hiệu: '+b.brand+'\nNội dung: '+x.title+'\nKịch bản: '+url+'\nNgười gửi: '+bookingName_(u.id);
 if(b.script_status==='approved'){
  bookingSet_(t,f,{script_url:url,updated_at:now});
  bookingNotify_(b,'script_updated',[b.account_id],'✏️ KỊCH BẢN BOOKING ĐÃ CẬP NHẬT (đã duyệt trước đó)\n'+head);
  return;
 }
 bookingSet_(t,f,{script_status:'submitted',script_url:url,script_submitted_at:now,updated_at:now});
 bookingNotify_(b,'script_submitted',[b.account_id],'📝 KỊCH BẢN BOOKING CHỜ DUYỆT\n'+head+'\n👉 Mở app → Booking để duyệt hoặc yêu cầu sửa.');
}

// --- Actions ----------------------------------------------------------------
function createBooking(initData,data){return createWriteScope_(()=>{
 const u=auth_(initData);
 if(isDirector_(u)||!(bookingIsAccount_(u)||bookingIsAccountManager_(u)))throw Error('Chỉ Account được tạo Booking.');
 data=data||{};
 const requested=String(data.request_id||'');if(!/^[A-Za-z0-9_-]{16,100}$/.test(requested))throw Error('Mã yêu cầu không hợp lệ.');
 const brand=String(data.brand||'').trim(),brief=String(data.brief||'').trim(),project=String(data.project||'').trim(),title=String(data.title||'').trim()||('Booking · '+brand);
 if(!brand||brand.length>120)throw Error('Cần nhập tên thương hiệu (tối đa 120 ký tự).');
 if(!brief||brief.length>2000)throw Error('Cần nhập Brief (tối đa 2000 ký tự).');
 if(!project)throw Error('Cần chọn dự án.');if(title.length>160)throw Error('Tiêu đề tối đa 160 ký tự.');
 const amount=Number(String(data.amount_vnd??'').replace(/[.,\s]/g,''));if(!Number.isSafeInteger(amount)||amount<=0)throw Error('Số tiền booking không hợp lệ.');
 const shoot=bookingDate_(data.shoot_at,'ngày quay',true),deliver=bookingDate_(data.deliver_at,'ngày trả video',true),acceptance=bookingDate_(data.acceptance_at,'ngày nghiệm thu',true);
 if(deliver<shoot)throw Error('Ngày trả video phải sau ngày quay.');if(acceptance<deliver)throw Error('Ngày nghiệm thu phải sau ngày trả video.');
 const cc=bookingPersonId_(data.cc_id,'Content Creator',true),vj=bookingPersonId_(data.vj_id,'VJ',true),talent=bookingPersonId_(data.talent_id,'Talent',true),editor=bookingPersonId_(data.editor_id,'Editor',false);
 const existing=bookingForProduction_(requested);
 if(existing){if(String(existing.item.account_id)!==String(u.id)||String(existing.item.brand)!==brand)throw Error('Mã yêu cầu đã dùng cho booking khác.');return {...bookingScreenData_(u),booking_id:String(existing.item.id),warning:''};}
 BOOKING_SKIP_LEADER=true;let created;
 try{created=createProductionItemData_(initData,{project,title,brief,vj_id:cc,vj_ids:[...new Set([cc,vj])],editor_id:editor,editor_ids:editor?[editor]:[],cam_id:'',approver_id:'',shoot_at:shoot,request_id:requested,note:'Booking: '+brand});}
 finally{BOOKING_SKIP_LEADER=false;}
 const now=new Date().toISOString(),f=productionRow_(requested);
 v20Set_(f,'idea_approval','Duyệt');v20Set_(f,'idea_approval_reviewer',u.id);v20Set_(f,'idea_approval_reviewed_at',now);v20Set_(f,'idea_approval_feedback','Booking đã chốt với khách hàng');
 productionSet_(f,'stage','shoot');productionSet_(f,'deadline',deliver);
 const dept=person_(cc)?.department;if(dept)productionSet_(f,'department',String(dept));
 productionSet_(f,'updated_at',now);
 const t=bookingTable_(true),id='bk_'+requested,values={id,production_id:requested,brand,amount_vnd:amount,acceptance_at:acceptance,account_id:u.id,cc_id:cc,vj_id:vj,talent_id:talent,script_status:'pending',created_at:now,updated_at:now};
 t.sheet.appendRow(t.headers.map(k=>values[k]??''));
 const b={...values};
 bookingNotify_(b,'created',[cc,vj,talent,editor],'📌 BOOKING MỚI\nThương hiệu: '+brand+'\nNội dung: '+title+'\nNgày quay: '+bookingWhen_(shoot)+'\nTrả video: '+bookingWhen_(deliver)+'\nNghiệm thu: '+bookingWhen_(acceptance)+'\nAccount: '+bookingName_(u.id)+'\n👉 Mở app → Booking. CC/VJ lưu link kịch bản để Account duyệt trước khi quay.');
 return {...bookingScreenData_(u),booking_id:id,warning:created?.warning||''};
});}

function reviewBookingScript(initData,bookingId,decision,note,scriptUrl){return createWriteScope_(()=>{
 const u=auth_(initData),{t,f}=bookingFind_(bookingId,true),b=f.item,x=productionRow_(b.production_id).item;
 if(!bookingCanManage_(u,b))throw Error('Chỉ Account phụ trách được duyệt kịch bản booking.');
 if(bookingStatus_(b,x)!=='script_review')throw Error('Kịch bản không ở trạng thái chờ duyệt.');
 if(scriptUrl!==undefined&&String(scriptUrl)!==String(b.script_url))throw Error('Kịch bản vừa được cập nhật. Làm mới rồi xem lại trước khi duyệt.');
 note=String(note||'').trim();if(note.length>1000)throw Error('Ghi chú tối đa 1000 ký tự.');
 const now=new Date().toISOString(),head='Thương hiệu: '+b.brand+'\nNội dung: '+x.title;
 if(decision==='approve'){
  bookingSet_(t,f,{script_status:'approved',script_note:note,script_reviewed_at:now,script_reviewed_by:u.id,updated_at:now});
  bookingNotify_(b,'script_approved',[...bookingCrew_(b,x),b.talent_id,x.cam_id],'✅ KỊCH BẢN BOOKING ĐÃ DUYỆT\n'+head+'\nNgày quay: '+bookingWhen_(x.shoot_at)+(note?'\nGhi chú: '+note:'')+'\n👉 Có thể đi quay, lưu Raw và bàn giao cho Editor.');
 }else if(decision==='revise'){
  if(!note)throw Error('Cần ghi rõ nội dung cần sửa.');
  bookingSet_(t,f,{script_status:'revision',script_note:note,script_reviewed_at:now,script_reviewed_by:u.id,updated_at:now});
  bookingNotify_(b,'script_revision',bookingCrew_(b,x),'↩️ KỊCH BẢN BOOKING CẦN SỬA\n'+head+'\nYêu cầu: '+note+'\n👉 Sửa kịch bản rồi lưu lại link để gửi duyệt.');
 }else throw Error('Quyết định không hợp lệ.');
 return bookingScreenData_(u);
});}
function bookingCount_(value,label,required){const raw=String(value??'').replace(/[.,\s]/g,'');if(!raw){if(required)throw Error('Cần nhập '+label+'.');return 0;}const n=Number(raw);if(!Number.isSafeInteger(n)||n<0)throw Error(label+' không hợp lệ.');return n;}
function submitBookingMetrics(initData,bookingId,input){return createWriteScope_(()=>{
 const u=auth_(initData),{t,f}=bookingFind_(bookingId,true),b=f.item,x=productionRow_(b.production_id).item,me=String(u.id);
 if(!bookingCrew_(b,x).includes(me)&&String(b.talent_id)!==me)throw Error('Chỉ CC, VJ hoặc Talent của booking được nhập số liệu.');
 if(!['metrics','acceptance'].includes(bookingStatus_(b,x)))throw Error('Chỉ nhập số liệu sau khi video đã đăng và trước khi nghiệm thu.');
 input=input||{};const note=String(input.note||'').trim();if(note.length>500)throw Error('Ghi chú tối đa 500 ký tự.');
 const values={views:bookingCount_(input.views,'lượt xem',true),likes:bookingCount_(input.likes,'lượt thích'),comments:bookingCount_(input.comments,'bình luận'),shares:bookingCount_(input.shares,'chia sẻ'),metrics_note:note,metrics_by:me,metrics_at:new Date().toISOString(),updated_at:new Date().toISOString()};
 const first=!b.metrics_at;bookingSet_(t,f,values);
 bookingNotify_(b,first?'metrics':'metrics_update',[b.account_id],(first?'📊 SỐ LIỆU BOOKING ĐÃ CÓ':'📊 SỐ LIỆU BOOKING ĐƯỢC CẬP NHẬT')+'\nThương hiệu: '+b.brand+'\nNội dung: '+x.title+'\nView: '+values.views+' · Thích: '+values.likes+' · Bình luận: '+values.comments+' · Chia sẻ: '+values.shares+'\nNgười nhập: '+bookingName_(me)+'\n👉 Mở app → Booking để nghiệm thu.');
 return bookingScreenData_(u);
});}

function acceptBooking(initData,bookingId){return createWriteScope_(()=>{
 const u=auth_(initData),{t,f}=bookingFind_(bookingId,true),b=f.item,x=productionRow_(b.production_id).item;
 if(!bookingCanManage_(u,b))throw Error('Chỉ Account phụ trách được nghiệm thu booking.');
 if(bookingStatus_(b,x)!=='acceptance')throw Error('Booking cần có số liệu trước khi nghiệm thu.');
 const now=new Date().toISOString();bookingSet_(t,f,{accepted_at:now,accepted_by:u.id,updated_at:now});
 bookingNotify_(b,'accepted',[...bookingCrew_(b,x),b.talent_id],'🎉 BOOKING ĐÃ NGHIỆM THU\nThương hiệu: '+b.brand+'\nNội dung: '+x.title+'\nCảm ơn cả team!');
 return bookingScreenData_(u);
});}

// --- Reminders (run by the every-minute scheduler, 08:00-20:00 only) --------
function bookingAlerts_(){
 const hm=stamp_(new Date(),'HH:mm');if(hm<'08:00'||hm>'20:00')return;
 const t=bookingTable_(false);if(!t.list.length)return;
 const now=Date.now(),day=stamp_(new Date(),'yyyy-MM-dd'),items=new Map(rows_('ProductionItems').map(x=>[String(x.id),x]));
 for(const f of t.list){
  const b=f.item,x=items.get(String(b.production_id));if(!x||b.accepted_at)continue;const status=bookingStatus_(b,x);
  if(status==='metrics'){const published=Date.parse(x.published_at);if(published&&now-published>=48*3600000)bookingCrew_(b,x).forEach(who=>queueNotification_('booking:'+b.id+':metrics_reminder:'+day+':'+who,who,'⏰ NHẮC NHẬP SỐ LIỆU BOOKING\nThương hiệu: '+b.brand+'\nNội dung: '+x.title+'\nVideo đã đăng lúc '+bookingWhen_(x.published_at)+'\n👉 Mở app → Booking, nhập view, thích, bình luận, chia sẻ.'));}
  const acceptance=Date.parse(b.acceptance_at);
  if(acceptance&&now>acceptance)queueNotification_('booking:'+b.id+':acceptance_late:'+day+':'+b.account_id,b.account_id,'🔴 BOOKING QUÁ NGÀY NGHIỆM THU\nThương hiệu: '+b.brand+'\nNội dung: '+x.title+'\nNgày nghiệm thu: '+bookingWhen_(b.acceptance_at)+'\nTrạng thái: '+BOOKING_STATUS_LABELS[status]);
 }
}
const bookingScheduler_=v16Scheduler;
v16Scheduler=function(){const result=bookingScheduler_.apply(this,arguments);try{readScope_(()=>bookingAlerts_())}catch(e){console.error('Nhắc booking: '+String(e))}return result;};
