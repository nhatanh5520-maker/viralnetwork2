// Web-specific rules; preserve the original Mini App business source.
function webRequireIdeaLeader_(id){
 const person=person_(id);
 if(!person||role_(person.role)!=='leader')throw Error('Người duyệt Idea phải là Leader đang hoạt động.');
}
const webCreateIdeaData_=createProductionItemData_;
createProductionItemData_=function(initData,data){webRequireIdeaLeader_(data?.approver_id);return webCreateIdeaData_(initData,data);};
const webAssignIdeaData_=assignProductionData_;
assignProductionData_=function(initData,id,data){webRequireIdeaLeader_(data?.approver_id);return webAssignIdeaData_(initData,id,data);};
const webIdeaDecision_=approvalSet_Data_;
approvalSet_Data_=function(u,id,key,decision,note,expected){
 if(key==='idea_approval'&&(role_(u.role)!=='leader'||String(productionRow_(id).item.approver_id)!==String(u.id)))throw Error('Chỉ Leader được phân công mới được duyệt Idea.');
 return webIdeaDecision_(u,id,key,decision,note,expected);
};
const webApprovalIds_=tgApprovalIds_;
tgApprovalIds_=function(x,kind){if(kind==='idea'&&role_(person_(x.approver_id)?.role)!=='leader')return [];return webApprovalIds_(x,kind);};
const webReviewQueue_=reviewQueue;
const webPersonalTasks_=personalWorkTasks_;
personalWorkTasks_=function(u){
 const me=String(u.id),links=prodLinkRows_(),team=teamRows_(),tasks=webPersonalTasks_(u),covered=new Set(tasks.map(t=>String(t.production_id||links.find(l=>String(l.task_id)===String(t.id))?.production_id||'')));
 for(const x of rows_('ProductionItems')){
  if(!x.id||x.stage==='deleted'||covered.has(String(x.id)))continue;
  const selected=[x.cam_id,...teamIds_(x,'VJ',team),...teamIds_(x,'Editor',team),...(role_(u.role)==='leader'?[x.approver_id]:[]),...v20Approvers_(x).content,...v20Approvers_(x).media].map(String);
  if(!selected.includes(me))continue;
  tasks.push({id:'web-participant:'+x.id+':'+me,assignee_id:me,title:x.title,category:'Sản xuất',quantity:1,weight:1,status:['ready','published'].includes(x.stage)?'done':'in_progress',created_at:x.created_at,due_at:x.deadline||'',production_id:String(x.id),production_item:withProductionTeam_([x],team)[0]});
 }
 return tasks;
};
reviewQueue=function(initData){
 const u=auth_(initData);
 // Operational approvals remain in their respective Utilities screens.
 return webReviewQueue_(initData,'personal').filter(x=>!x.operational_kind);
};
function webProjectRow_(code){
 const sheet=sheet_('Projects'),all=sheet.getDataRange().getValues(),headers=all[0].map(String),index=all.findIndex((r,i)=>i>0&&String(r[headers.indexOf('code')]).toUpperCase()===String(code).toUpperCase());
 if(index<1)throw Error('Không tìm thấy dự án.');
 return {sheet,headers,row:index+1,values:all[index]};
}
function webProjectImages_(){return Object.fromEntries(rows_('Projects').filter(p=>p.avatar_file_id).map(p=>[String(p.code),'/api/viral/project-image?id='+encodeURIComponent(String(p.avatar_file_id))]));}
function saveProjectAvatar(initData,code,image){
 const u=auth_(initData);if(!['leader','director'].includes(role_(u.role)))throw Error('Chỉ Leader hoặc Ban giám đốc được đổi ảnh dự án.');
 const found=webProjectRow_(code),id=image?__storeProjectImage(image):'';let column=found.headers.indexOf('avatar_file_id')+1;
 if(!column){column=found.headers.length+1;found.sheet.getRange(1,column).setValue('avatar_file_id');}
 found.sheet.getRange(found.row,column).setValue(id);
 return {ok:true,projects:v20Projects_(),projectAvatars:webProjectImages_()};
}
createV20Project=function(initData,code,name,image){
 const u=auth_(initData);if(!['leader','director'].includes(role_(u.role)))throw Error('Chỉ Leader hoặc Ban giám đốc được tạo dự án.');
 code=String(code||'').trim().toUpperCase();name=String(name||'').trim();
 if(!/^[A-Z0-9_-]{2,20}$/.test(code)||!name||name.length>80)throw Error('Mã dự án hoặc tên không hợp lệ.');
 if(rows_('Projects').some(p=>String(p.code).toUpperCase()===code))throw Error('Mã dự án đã tồn tại.');
 const id=image?__storeProjectImage(image):'',sheet=sheet_('Projects');let headers=sheet.getDataRange().getValues()[0].map(String);
 if(!headers.includes('avatar_file_id')){sheet.getRange(1,headers.length+1).setValue('avatar_file_id');headers.push('avatar_file_id');}
 const values={code,name,created_by:u.id,created_at:new Date().toISOString(),telegram_group_chat_id:'',avatar_file_id:id};sheet.appendRow(headers.map(k=>values[k]??''));
 return {ok:true,projects:v20Projects_(),projectAvatars:webProjectImages_()};
};

// Total content includes pending and rejected Ideas within the same filter scope.
function productionPageData_(initData,filters){
 const u=auth_(initData),f=filters&&typeof filters==='object'?filters:{},team=teamRows_();
 const project=String(f.project||'').trim().slice(0,120),q=String(f.q||'').trim().toLocaleLowerCase('vi').slice(0,100),status=String(f.status||'all'),day=String(f.day||''),dateType=['all','created_at','shoot_at','editor_received_at','final_completed_at','published_at','deadline'].includes(f.dateType)?f.dateType:'all',approvalKey=String(f.approvalKey||''),approvalStatus=String(f.approvalStatus||'');
 if(!['all','doing','review'].includes(status)||day&&!/^\d{4}-\d{2}-\d{2}$/.test(day)||approvalKey&&!['idea_approval','script_approval','final_approval'].includes(approvalKey)||approvalStatus&&!['pending','Duyệt','Không duyệt'].includes(approvalStatus))throw Error('Bộ lọc sản xuất không hợp lệ');
 const range=productionDateRange_(f.from||day,f.to||day);
 const page=Math.max(0,Math.min(100000,Math.floor(Number(f.page)||0))),all=webActiveProductionRows_(productionVisibleRows_(u,team)),peopleById=q?new Map(people_().map(p=>[String(p.telegram_id),String(p.name)])):new Map();
 const metric=String(f.metric||'all');if(!['all','approved','shooting','waiting','reviewing','edited','published'].includes(metric))throw Error('Thống kê không hợp lệ');
 // Summary and drill-down share the same date/search/status scope. Metric is applied only to the list.
 const scoped=all.filter(x=>productionStatMatches_(x,'all')&&(!q||[x.title,x.project,x.brief,x.note,...teamIds_(x,'VJ',team).map(id=>peopleById.get(id)||''),...teamIds_(x,'Editor',team).map(id=>peopleById.get(id)||''),...[x.cam_id,x.designer_id,x.thumbnail_assignee_id,x.approver_id].map(id=>peopleById.get(String(id))||'')].some(v=>String(v||'').toLocaleLowerCase('vi').includes(q)))&&(status==='all'||status==='review'&&x.stage==='brief'&&!x.idea_approval||status==='doing'&&!['ready','published'].includes(String(x.stage)))&&productionTaskRangeMatches_(x,dateType,range)&&(!approvalKey||!approvalStatus||String(x[approvalKey]||'')===(approvalStatus==='pending'?'':approvalStatus)));
 const stats={};if(f.includeStats!==false)scoped.forEach(x=>{const key=String(x.project||'').trim();if(!stats[key])stats[key]={total:0,shooting:0,waiting:0,edited:0,published:0};const st=stats[key];for(const [field,bucket] of [['total','all'],['shooting','shooting'],['waiting','waiting'],['edited','edited'],['published','published']])if(productionStatMatches_(x,bucket))st[field]++});
 const matches=scoped.filter(x=>productionStatMatches_(x,metric)&&(!project||String(x.project||'').trim()===project));
 const start=page*20;return {ok:true,items:withProductionTeam_(matches.slice(start,start+20),team),total:matches.length,page,hasMore:start+20<matches.length,stats};
}
