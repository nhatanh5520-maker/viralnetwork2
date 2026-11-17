// Số liệu kênh: each project has channels (platform, name/link, responsible VJ). Every week the VJ
// enters 7-day numbers per channel, and once a month the official monthly numbers.
// Tables: ProjectChannels, ChannelMetrics (one row per channel+period), ChannelMetricsAudit.
// Read paths never create a table or change data; only the write RPCs do.
// Times are Asia/Ho_Chi_Minh (UTC+7, no daylight saving). The runtime's 'u' date token is UTC-based,
// so weekdays are computed here from the Vietnam calendar date instead.

const CM_PLATFORMS=['TikTok','Facebook','YouTube','Instagram','Khác'];
const CM_CHANNEL_HEADERS=['id','project_code','platform','name','vj_id','active','created_by','created_at','updated_by','updated_at'];
const CM_METRIC_HEADERS=['id','channel_id','period_type','period','project_code','platform','vj_id','views','likes','comments','shares','followers','screenshot_file_id','note','submitted_by','submitted_at','updated_by','updated_at','revision'];
const CM_AUDIT_HEADERS=['id','action','channel_id','period_type','period','actor','at','before_json','after_json'];
// [key, label, required]
const CM_FIELDS=[['views','View',true],['likes','Tim',true],['comments','Bình luận',true],['shares','Chia sẻ',false],['followers','Follower tăng',false]];
const CM_DAY=86400000,CM_VN_OFFSET=7*3600000;

// --- Time (Vietnam calendar) -------------------------------------------------------------------
function cmNow_(){return Date.now();}
function cmVn_(ms){const iso=new Date(ms+CM_VN_OFFSET).toISOString();return {ymd:iso.slice(0,10),hm:iso.slice(11,16),dow:new Date(ms+CM_VN_OFFSET).getUTCDay()};}
function cmAddDays_(ymd,n){return new Date(Date.parse(ymd+'T00:00:00Z')+n*CM_DAY).toISOString().slice(0,10);}
function cmMonday_(ymd){return cmAddDays_(ymd,-((new Date(ymd+'T00:00:00Z').getUTCDay()+6)%7));}
function cmAt_(ymd,hm){return Date.parse(ymd+'T'+hm+':00+07:00');}
function cmIsWeek_(p){return /^\d{4}-\d{2}-\d{2}$/.test(String(p))&&cmMonday_(String(p))===String(p);}
function cmIsMonth_(p){return /^\d{4}-(0[1-9]|1[0-2])$/.test(String(p));}
function cmLastDay_(month){const [y,m]=month.split('-').map(Number);return new Date(Date.UTC(y,m,0)).toISOString().slice(0,10);}
function cmShiftMonth_(month,n){const [y,m]=month.split('-').map(Number);return new Date(Date.UTC(y,m-1+n,1)).toISOString().slice(0,7);}
// Week (Monday..Sunday): open 18:00 Sunday, close 23:59 Monday after.
function cmWeekWindow_(week){return {opens:cmAt_(cmAddDays_(week,6),'18:00'),closes:cmAt_(cmAddDays_(week,7),'23:59')+59999};}
// Month: open on the last day of the month, close at the end of day 2 of the next month.
function cmMonthWindow_(month){return {opens:cmAt_(cmLastDay_(month),'00:00'),closes:cmAt_(cmShiftMonth_(month,1)+'-02','23:59')+59999};}
function cmWindow_(type,period){return type==='week'?cmWeekWindow_(period):cmMonthWindow_(period);}
// The week a VJ is asked about now: the latest week whose entry window has opened.
function cmTargetWeek_(now){let week=cmMonday_(cmVn_(now).ymd);if(now<cmWeekWindow_(week).opens)week=cmAddDays_(week,-7);return week;}
// The month whose entry window is open now, or null.
function cmOpenMonth_(now){const month=cmVn_(now).ymd.slice(0,7);if(now>=cmMonthWindow_(month).opens)return month;const prev=cmShiftMonth_(month,-1);return now<=cmMonthWindow_(prev).closes?prev:null;}
function cmPeriodLabel_(type,period){if(type==='month'){const [y,m]=period.split('-');return 'Tháng '+m+'/'+y;}const d=s=>s.slice(8,10)+'/'+s.slice(5,7);return 'Tuần '+d(period)+'–'+d(cmAddDays_(period,6))+'/'+cmAddDays_(period,6).slice(0,4);}

// --- Tables ------------------------------------------------------------------------------------
// create=false never inserts a sheet or header: a missing table reads as empty.
function cmTable_(name,headers,create){
 let s=book_().getSheetByName(name);
 if(!s){if(!create)return {sheet:null,headers,list:[]};s=book_().insertSheet(name);s.appendRow(headers);}
 let a=s.getDataRange().getValues(),h=a[0].map(String);
 if(create){const missing=headers.filter(k=>!h.includes(k));if(missing.length){missing.forEach((k,i)=>s.getRange(1,h.length+i+1).setValue(k));a=s.getDataRange().getValues();h=a[0].map(String);}}
 const list=a.slice(1).map((r,i)=>{const item={};h.forEach((k,j)=>{if(k)item[k]=r[j];});return {row:i+2,item};}).filter(f=>f.item.id);
 return {sheet:s,headers:h,list};
}
function cmSet_(t,f,values){for(const [k,v] of Object.entries(values)){const c=t.headers.indexOf(k)+1;if(c<1)throw Error('Thiếu cột '+k);t.sheet.getRange(f.row,c).setValue(v);f.item[k]=v;}}
function cmAppend_(t,values){t.sheet.appendRow(t.headers.map(k=>values[k]??''));}
function cmAudit_(action,channel,type,period,actor,before,after){
 const t=cmTable_('ChannelMetricsAudit',CM_AUDIT_HEADERS,true);
 cmAppend_(t,{id:Utilities.getUuid(),action,channel_id:channel,period_type:type||'',period:period||'',actor:String(actor),at:new Date(cmNow_()).toISOString(),before_json:before?JSON.stringify(before):'',after_json:after?JSON.stringify(after):''});
}
function cmChannels_(){return cmTable_('ProjectChannels',CM_CHANNEL_HEADERS,false).list.map(f=>f.item);}
function cmMetrics_(){return cmTable_('ChannelMetrics',CM_METRIC_HEADERS,false).list.map(f=>f.item);}
function cmActive_(c){return String(c.active).toLowerCase()!=='false';}
function cmMetricId_(channel,type,period){return String(channel)+':'+type+':'+period;}

// --- Permissions -------------------------------------------------------------------------------
function cmIsManager_(u){return isLeader_({...u,role:role_(u.role)});}
function cmRequireManager_(u){if(!cmIsManager_(u))throw Error('Chỉ Leader hoặc Ban giám đốc được thực hiện thao tác này.');}

// --- Values ------------------------------------------------------------------------------------
// Non-negative integers; "12.345" (dot thousands separator) and "12 345" are accepted.
function cmCount_(value,label,required){
 const raw=String(value??'').trim().replace(/[.\s]/g,'');
 if(!raw){if(required)throw Error('Cần nhập '+label+'.');return '';}
 if(!/^\d+$/.test(raw))throw Error(label+' phải là số nguyên không âm.');
 const n=Number(raw);if(!Number.isSafeInteger(n))throw Error(label+' quá lớn.');return n;
}
function cmNumber_(v){return v===''||v===null||v===undefined?null:Number(v);}
function cmValues_(m){return m?Object.fromEntries(CM_FIELDS.map(([k])=>[k,cmNumber_(m[k])])):null;}
function cmProjects_(){const all=webProjectRecords_();return {all,active:all.filter(p=>!p.archived),byCode:new Map(all.map(p=>[p.code.toUpperCase(),p]))};}
function cmProjectLabel_(projects,code){return projects.byCode.get(String(code).toUpperCase())?.label||String(code);}
function cmChannelView_(c,projects){
 const p=projects.byCode.get(String(c.project_code).toUpperCase());
 return {id:String(c.id),project_code:String(c.project_code),project:p?.label||String(c.project_code),project_archived:!!p?.archived,platform:String(c.platform),name:String(c.name),
  vj_id:String(c.vj_id),vj_name:person_(c.vj_id)?.name||'',active:cmActive_(c),revision:String(c.updated_at||c.created_at||'')};
}
function cmRecordView_(m){return m?{id:String(m.id),period_type:String(m.period_type),period:String(m.period),values:cmValues_(m),has_screenshot:!!m.screenshot_file_id,note:String(m.note||''),
 submitted_by:String(m.submitted_by||''),submitted_at:String(m.submitted_at||''),updated_by:String(m.updated_by||''),updated_at:String(m.updated_at||''),revision:Number(m.revision||1)}:null;}

// Monthly estimate: each weekly record contributes (days of that week inside the month) / 7.
// Optional fields are summed only from weeks that have them; a field with no data stays null.
function cmMonthEstimate_(weekly,month){
 const sums=Object.fromEntries(CM_FIELDS.map(([k])=>[k,null]));let used=0;
 const weeks=new Set();for(let d=month+'-01';d.slice(0,7)===month;d=cmAddDays_(d,1))weeks.add(cmMonday_(d));
 for(const week of weeks){
  const m=weekly.get(week);if(!m)continue;
  let days=0;for(let i=0;i<7;i++)if(cmAddDays_(week,i).slice(0,7)===month)days++;
  used++;for(const [k] of CM_FIELDS){const v=cmNumber_(m[k]);if(v!==null)sums[k]=(sums[k]||0)+v*days/7;}
 }
 if(!used)return null;
 return {values:Object.fromEntries(Object.entries(sums).map(([k,v])=>[k,v===null?null:Math.round(v)])),weeks_used:used,weeks_total:weeks.size};
}
// Official month figures if entered, otherwise the estimate, labelled as such.
function cmMonthFigures_(byChannel,channelId,month){
 const metrics=byChannel.get(String(channelId))||[],official=metrics.find(m=>m.period_type==='month'&&m.period===month);
 if(official)return {source:'official',values:cmValues_(official),record:cmRecordView_(official)};
 const weekly=new Map(metrics.filter(m=>m.period_type==='week').map(m=>[String(m.period),m])),est=cmMonthEstimate_(weekly,month);
 return est?{source:'estimate',values:est.values,weeks_used:est.weeks_used,weeks_total:est.weeks_total}:{source:'none',values:null};
}
function cmByChannel_(metrics){const out=new Map();for(const m of metrics){const k=String(m.channel_id);if(!out.has(k))out.set(k,[]);out.get(k).push(m);}return out;}
function cmChange_(cur,prev){if(cur===null||cur===undefined||prev===null||prev===undefined||!prev)return null;return Math.round((cur-prev)/prev*1000)/10;}

// --- Screen (VJ and managers) ------------------------------------------------------------------
function channelMetricsScreen(initData){const u=auth_(initData);return readScope_(()=>cmScreenData_(u));}
function cmScreenData_(u){
 const now=cmNow_(),me=String(u.id),manager=cmIsManager_(u),projects=cmProjects_(),channels=cmChannels_(),byChannel=cmByChannel_(cmMetrics_());
 const week=cmTargetWeek_(now),ww=cmWeekWindow_(week),month=cmOpenMonth_(now),mw=month?cmMonthWindow_(month):null;
 const status=(type,period,w,record)=>record?'done':now>w.closes?'overdue':now>=w.opens?'open':'upcoming';
 const history=[];for(let i=0;i<8;i++)history.push(cmAddDays_(week,-7*i));
 const mine=channels.filter(c=>cmActive_(c)&&String(c.vj_id)===me).map(c=>{
  const list=byChannel.get(String(c.id))||[],find=(t,p)=>list.find(m=>m.period_type===t&&String(m.period)===p);
  const wr=find('week',week),mr=month?find('month',month):null;
  return {...cmChannelView_(c,projects),week:{period:week,status:status('week',week,ww,wr),record:cmRecordView_(wr)},
   month:month?{period:month,status:status('month',month,mw,mr),record:cmRecordView_(mr),estimate:cmMonthFigures_(byChannel,c.id,month)}:null,
   history:history.map(p=>({period:p,label:cmPeriodLabel_('week',p),record:cmRecordView_(find('week',p))}))};
 }).filter(c=>!c.project_archived);
 const out={ok:true,now:new Date(now).toISOString(),isManager:manager,platforms:CM_PLATFORMS,fields:CM_FIELDS.map(([key,label,required])=>({key,label,required})),
  week:{period:week,label:cmPeriodLabel_('week',week),opens:new Date(ww.opens).toISOString(),closes:new Date(ww.closes).toISOString(),open:now>=ww.opens&&now<=ww.closes},
  month:month?{period:month,label:cmPeriodLabel_('month',month),opens:new Date(mw.opens).toISOString(),closes:new Date(mw.closes).toISOString(),open:true}:null,
  myChannels:mine};
 if(manager){
  out.channels=channels.map(c=>cmChannelView_(c,projects)).sort((a,b)=>a.project.localeCompare(b.project,'vi')||a.platform.localeCompare(b.platform)||a.name.localeCompare(b.name,'vi'));
  out.projectOptions=projects.active.map(p=>({code:p.code,label:p.label}));
  out.people=people_().map(p=>({id:String(p.telegram_id),name:String(p.name),job_title:String(p.job_title||'')})).sort((a,b)=>a.name.localeCompare(b.name,'vi'));
 }
 return out;
}

// --- Report (managers) -------------------------------------------------------------------------
function channelMetricsReport(initData,filters){const u=auth_(initData);cmRequireManager_(u);return readScope_(()=>cmReport_(filters||{}));}
function cmReport_(f){
 const now=cmNow_(),mode=f.mode==='month'?'month':'week';
 let period=String(f.period||'');
 if(mode==='week'){if(!period)period=cmTargetWeek_(now);if(!cmIsWeek_(period))throw Error('Tuần không hợp lệ (cần ngày thứ Hai).');}
 else{if(!period){const open=cmOpenMonth_(now);period=open||cmVn_(now).ymd.slice(0,7);}if(!cmIsMonth_(period))throw Error('Tháng không hợp lệ.');}
 const prev=mode==='week'?cmAddDays_(period,-7):cmShiftMonth_(period,-1);
 const projects=cmProjects_(),byChannel=cmByChannel_(cmMetrics_()),project=String(f.project||''),platform=String(f.platform||''),vj=String(f.vj||'');
 const figures=(c,p)=>{if(mode==='month')return cmMonthFigures_(byChannel,c.id,p);const m=(byChannel.get(String(c.id))||[]).find(x=>x.period_type==='week'&&String(x.period)===p);return m?{source:'official',values:cmValues_(m),record:cmRecordView_(m)}:{source:'none',values:null};};
 const rows=[];
 for(const c of cmChannels_()){
  const view=cmChannelView_(c,projects);
  if(project&&view.project_code.toUpperCase()!==project.toUpperCase())continue;if(platform&&view.platform!==platform)continue;if(vj&&view.vj_id!==vj)continue;
  const cur=figures(c,period),old=figures(c,prev);
  if(!view.active&&cur.source==='none')continue;
  rows.push({channel:view,source:cur.source,values:cur.values,weeks_used:cur.weeks_used,weeks_total:cur.weeks_total,record:cur.record||null,
   previous:{source:old.source,values:old.values},change:Object.fromEntries(CM_FIELDS.map(([k])=>[k,cmChange_(cur.values?.[k],old.values?.[k])]))});
 }
 rows.sort((a,b)=>a.channel.project.localeCompare(b.channel.project,'vi')||a.channel.platform.localeCompare(b.channel.platform)||a.channel.name.localeCompare(b.channel.name,'vi'));
 const sum=(pick,k)=>{let s=null;for(const r of rows){const v=pick(r)?.[k];if(v!==null&&v!==undefined)s=(s||0)+v;}return s;};
 const totals={current:Object.fromEntries(CM_FIELDS.map(([k])=>[k,sum(r=>r.values,k)])),previous:Object.fromEntries(CM_FIELDS.map(([k])=>[k,sum(r=>r.previous.values,k)]))};
 totals.change=Object.fromEntries(CM_FIELDS.map(([k])=>[k,cmChange_(totals.current[k],totals.previous[k])]));
 // Missing: active channels whose entry window for this period has opened and that have no figures entered.
 const w=cmWindow_(mode,period),missing=now>=w.opens?rows.filter(r=>r.channel.active&&!r.channel.project_archived&&(mode==='week'?r.source==='none':r.source!=='official')).map(r=>r.channel):[];
 const periods=[];if(mode==='week'){const last=cmTargetWeek_(now);for(let i=0;i<26;i++){const p=cmAddDays_(last,-7*i);periods.push({period:p,label:cmPeriodLabel_('week',p)});}}
 else{const last=cmOpenMonth_(now)||cmVn_(now).ymd.slice(0,7);for(let i=0;i<12;i++){const p=cmShiftMonth_(last,-i);periods.push({period:p,label:cmPeriodLabel_('month',p)});}}
 return {ok:true,mode,period,label:cmPeriodLabel_(mode,period),previous:prev,previousLabel:cmPeriodLabel_(mode,prev),fields:CM_FIELDS.map(([key,label])=>({key,label})),rows,totals,missing,periods,
  window:{opens:new Date(w.opens).toISOString(),closes:new Date(w.closes).toISOString()},
  filters:{projects:projects.all.map(p=>({code:p.code,label:p.label})),platforms:CM_PLATFORMS,vjs:[...new Map(cmChannels_().map(c=>[String(c.vj_id),person_(c.vj_id)?.name||String(c.vj_id)])).entries()].map(([id,name])=>({id,name}))}};
}

// --- Channel management (Leader / Ban giám đốc) ------------------------------------------------
function saveProjectChannel(initData,input){return createWriteScope_(()=>{
 const u=auth_(initData);cmRequireManager_(u);input=input||{};
 const projects=cmProjects_(),t=cmTable_('ProjectChannels',CM_CHANNEL_HEADERS,true),now=new Date(cmNow_()).toISOString();
 const existing=input.id?t.list.find(f=>String(f.item.id)===String(input.id)):null;
 if(input.id&&!existing)throw Error('Không tìm thấy kênh.');
 if(existing&&String(input.revision??'')!==String(existing.item.updated_at||existing.item.created_at||''))throw Error('Kênh vừa được người khác cập nhật. Làm mới rồi kiểm tra lại.');
 const before=existing?{...existing.item}:null;
 const code=String(input.project_code??before?.project_code??'').trim().toUpperCase(),project=projects.byCode.get(code);
 if(!project)throw Error('Chọn dự án.');if(project.archived&&(!before||String(before.project_code).toUpperCase()!==code))throw Error('Dự án đã ngưng sử dụng.');
 const platform=String(input.platform??before?.platform??'');if(!CM_PLATFORMS.includes(platform))throw Error('Chọn nền tảng.');
 const name=String(input.name??before?.name??'').trim();if(!name||name.length>200)throw Error('Nhập tên kênh hoặc link kênh (tối đa 200 ký tự).');
 const vj=String(input.vj_id??before?.vj_id??'').trim();if(!person_(vj))throw Error('Chọn VJ phụ trách trong danh sách nhân viên.');
 const active=input.active===undefined?(before?cmActive_(before):true):input.active===true;
 if(active&&t.list.some(f=>f!==existing&&cmActive_(f.item)&&String(f.item.project_code).toUpperCase()===code&&String(f.item.platform)===platform&&String(f.item.name).trim().toLowerCase()===name.toLowerCase()))throw Error('Kênh này đã có trong dự án.');
 const values={project_code:code,platform,name,vj_id:vj,active,updated_by:String(u.id),updated_at:now};
 let id;
 if(existing){id=String(existing.item.id);cmSet_(t,existing,values);}
 else{id=Utilities.getUuid();cmAppend_(t,{id,...values,created_by:String(u.id),created_at:now});}
 const action=!existing?'channel_create':before&&cmActive_(before)&&!active?'channel_deactivate':before&&!cmActive_(before)&&active?'channel_reactivate':before&&String(before.vj_id)!==vj?'channel_reassign':'channel_update';
 cmAudit_(action,id,'','',u.id,before,{id,...values});
 if(action==='channel_create'||action==='channel_reassign')queueNotification_('channel-metrics:assign:'+id+':'+vj+':'+now,vj,'📊 BẠN ĐƯỢC GIAO KÊNH\nDự án: '+project.label+'\nKênh: '+platform+' · '+name+'\nMỗi tuần nhập số liệu từ 18:00 Chủ nhật đến 23:59 thứ Hai.\n👉 Mở app → Tiện ích → Số liệu kênh.');
 return {...cmScreenData_(u),channel_id:id};
});}

// --- Entering numbers --------------------------------------------------------------------------
function submitChannelMetrics(initData,input){return createWriteScope_(()=>{
 const u=auth_(initData),me=String(u.id),manager=cmIsManager_(u),now=cmNow_();input=input||{};
 const type=input.period_type==='month'?'month':input.period_type==='week'?'week':'';if(!type)throw Error('Kỳ nhập không hợp lệ.');
 const period=String(input.period||'');if(type==='week'?!cmIsWeek_(period):!cmIsMonth_(period))throw Error(type==='week'?'Tuần không hợp lệ.':'Tháng không hợp lệ.');
 const channel=cmChannels_().find(c=>String(c.id)===String(input.channel_id));if(!channel)throw Error('Không tìm thấy kênh.');
 const w=cmWindow_(type,period),inWindow=now>=w.opens&&now<=w.closes,isVj=String(channel.vj_id)===me;
 if(now<w.opens)throw Error(type==='week'?'Chưa đến giờ nhập: số liệu tuần nhập từ 18:00 Chủ nhật.':'Chưa đến giờ nhập: số liệu tháng nhập từ ngày cuối tháng.');
 if(!manager){
  if(!isVj)throw Error('Chỉ VJ phụ trách kênh được nhập số liệu.');
  if(!cmActive_(channel))throw Error('Kênh đã ngưng.');
  if(!inWindow)throw Error('Đã quá hạn nhập ('+(type==='week'?'23:59 thứ Hai':'hết ngày 2')+'). Nhờ Leader sửa nếu cần.');
 }
 const values={};for(const [k,label,required] of CM_FIELDS)values[k]=cmCount_(input[k],label,required);
 const note=String(input.note||'').trim();if(note.length>500)throw Error('Ghi chú tối đa 500 ký tự.');
 const t=cmTable_('ChannelMetrics',CM_METRIC_HEADERS,true),id=cmMetricId_(channel.id,type,period),found=t.list.find(f=>String(f.item.id)===id);
 if(found&&input.revision!==undefined&&input.revision!==null&&input.revision!==''&&Number(input.revision)!==Number(found.item.revision||1))throw Error('Số liệu vừa được cập nhật. Làm mới rồi kiểm tra lại.');
 if(found&&(input.revision===undefined||input.revision===null||input.revision===''))throw Error('Kỳ này đã có số liệu. Làm mới để sửa bản đã nhập.');
 let screenshot=found?String(found.item.screenshot_file_id||''):'';
 if(input.image)screenshot=__storeChannelImage(input.image);else if(input.remove_image===true)screenshot='';
 const stamp=new Date(now).toISOString(),before=found?{...found.item}:null;
 const row={...values,screenshot_file_id:screenshot,note,project_code:String(channel.project_code),platform:String(channel.platform),vj_id:String(channel.vj_id),updated_by:me,updated_at:stamp};
 if(found)cmSet_(t,found,{...row,revision:Number(found.item.revision||1)+1});
 else cmAppend_(t,{id,channel_id:String(channel.id),period_type:type,period,...row,submitted_by:me,submitted_at:stamp,revision:1});
 const action=(found?'metrics_update':'metrics_submit')+(manager&&!(isVj&&inWindow)?'_by_manager':'');
 cmAudit_(action,channel.id,type,period,me,before?{...cmValues_(before),note:before.note,screenshot_file_id:before.screenshot_file_id}:null,{...values,note,screenshot_file_id:screenshot});
 return {...cmScreenData_(u),saved:{channel_id:String(channel.id),period_type:type,period}};
});}

// Screenshot: only the channel's VJ, whoever entered it, Leaders and Directors.
function channelMetricScreenshotFile_(initData,metricId){
 const u=auth_(initData),m=cmMetrics_().find(x=>String(x.id)===String(metricId));if(!m||!m.screenshot_file_id)throw Error('Không có ảnh chụp màn hình.');
 const c=cmChannels_().find(x=>String(x.id)===String(m.channel_id)),me=String(u.id);
 if(!cmIsManager_(u)&&String(c?.vj_id)!==me&&String(m.submitted_by)!==me&&String(m.updated_by)!==me)throw Error('Bạn không được xem ảnh này.');
 return String(m.screenshot_file_id);
}
function channelMetricScreenshot(initData,metricId){const id=channelMetricScreenshotFile_(initData,metricId),blob=DriveApp.getFileById(id).getBlob(),bytes=blob.getBytes();if(bytes.length>4*1024*1024)throw Error('Ảnh quá lớn.');return 'data:'+blob.getContentType()+';base64,'+Utilities.base64Encode(bytes);}

// --- Reminders (minute scheduler; 08:00–20:00 only; one message per person per milestone) --------
function cmMissingFor_(type,period,channels,metrics,projects){
 const done=new Set(metrics.filter(m=>m.period_type===type&&String(m.period)===period).map(m=>String(m.channel_id)));
 return channels.filter(c=>cmActive_(c)&&!done.has(String(c.id))&&!projects.byCode.get(String(c.project_code).toUpperCase())?.archived);
}
function cmLine_(c,projects){return '• '+cmProjectLabel_(projects,c.project_code)+' · '+c.platform+' · '+c.name;}
function cmRemindVjs_(type,period,stage,missing,projects,heading){
 const byVj=new Map();for(const c of missing){const k=String(c.vj_id);if(!byVj.has(k))byVj.set(k,[]);byVj.get(k).push(c);}
 for(const [vj,list] of byVj)queueNotification_('channel-metrics:'+type+':'+period+':'+stage+':'+vj,vj,heading+'\n'+list.map(c=>cmLine_(c,projects)).join('\n')+'\n👉 Mở app → Tiện ích → Số liệu kênh.');
}
function cmAlerts_(){
 const now=cmNow_(),v=cmVn_(now);if(v.hm<'08:00'||v.hm>='20:00')return;
 const channels=cmChannels_();if(!channels.length)return;
 const metrics=cmMetrics_(),projects=cmProjects_(),week=cmTargetWeek_(now),label=cmPeriodLabel_('week',week),closes='23:59 thứ Hai';
 // Sunday 19:00 and Monday 12:00: the VJ; Tuesday 09:00: Leaders get the list of channels still missing.
 if(v.dow===0&&v.hm>='19:00')cmRemindVjs_('week',week,'sun',cmMissingFor_('week',week,channels,metrics,projects),projects,'📊 NHẮC NHẬP SỐ LIỆU KÊNH · '+label+'\nHạn: '+closes+'. Kênh chưa nhập:');
 if(v.dow===1&&v.hm>='12:00')cmRemindVjs_('week',week,'mon',cmMissingFor_('week',week,channels,metrics,projects),projects,'⏰ CÒN HÔM NAY ĐỂ NHẬP SỐ LIỆU KÊNH · '+label+'\nHạn: '+closes+'. Kênh chưa nhập:');
 if(v.dow===2&&v.hm>='09:00'){
  const missing=cmMissingFor_('week',week,channels,metrics,projects);
  if(missing.length){
   let leaders=people_().filter(p=>role_(p.role)==='leader');if(!leaders.length)leaders=people_().filter(p=>role_(p.role)==='director');
   const text='📋 KÊNH CHƯA NHẬP SỐ LIỆU · '+label+' ('+missing.length+' kênh)\n'+missing.map(c=>cmLine_(c,projects)+' — VJ: '+(person_(c.vj_id)?.name||c.vj_id)).join('\n')+'\nLeader có thể nhập/sửa thay trong app → Tiện ích → Số liệu kênh.';
   for(const l of leaders)queueNotification_('channel-metrics:week:'+week+':leaders:'+l.telegram_id,String(l.telegram_id),text);
  }
 }
 // Monthly: last day of the month and day 2 of the next month, from 09:00.
 const month=cmOpenMonth_(now);
 if(month&&v.hm>='09:00'){
  const stage=v.ymd===cmLastDay_(month)?'last':v.ymd===cmShiftMonth_(month,1)+'-02'?'day2':'';
  if(stage)cmRemindVjs_('month',month,stage,cmMissingFor_('month',month,channels,metrics,projects),projects,'📊 NHẬP SỐ LIỆU KÊNH '+cmPeriodLabel_('month',month).toUpperCase()+'\nHạn: hết ngày 02. Kênh chưa nhập số chính thức của tháng:');
 }
}
const cmScheduler_=v16Scheduler;
v16Scheduler=function(){const result=cmScheduler_.apply(this,arguments);try{readScope_(()=>cmAlerts_())}catch(e){console.error('Nhắc số liệu kênh: '+String(e))}return result;};
