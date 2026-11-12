// Project names remain compatible with the original Sheets workflow.
function webProjectManager_(init){const u=auth_(init);if(!['leader','director'].includes(role_(u.role)))throw Error('Chỉ Leader hoặc Ban giám đốc được sửa dự án.');return u;}
function webProjectArchived_(p){return String(p.archived).toLowerCase()==='true';}
function webProjectRecords_(){const explicit=rows_('Projects').filter(p=>p.code),known=new Set(explicit.map(p=>String(p.code).toUpperCase()));const legacy=[...new Set(rows_('ProductionItems').map(x=>String(x.project||'').trim()))].filter(Boolean).map(label=>{const m=/^([A-Z0-9_-]+)\s+-\s+(.+)$/i.exec(label);return m?{code:m[1],name:m[2]}:null;}).filter(p=>p&&!known.has(p.code.toUpperCase()));return [...explicit,...legacy].map(p=>({code:String(p.code),name:String(p.name),label:String(p.code)+' - '+String(p.name),archived:webProjectArchived_(p),telegram_group_chat_id:String(p.telegram_group_chat_id||''),revision:JSON.stringify([p.code,p.name,p.avatar_file_id||'',p.archived||'',p.updated_at||'',p.telegram_group_chat_id||''])}));}
v20Projects_=function(){return [...new Set(webProjectRecords_().filter(p=>!p.archived).map(p=>p.label))].sort((a,b)=>a.localeCompare(b,'vi'));};
function webCheckProjectActive_(label){if(webProjectRecords_().some(p=>p.archived&&p.label===String(label||'').trim()))throw Error('Dự án đã ngưng sử dụng, không thể tạo nội dung mới.');}
const webProjectCreateIdea_=createProductionItemData_;createProductionItemData_=function(init,data){webCheckProjectActive_(data?.project);return webProjectCreateIdea_(init,data);};
function webProjectColumn_(sh,key){const h=sh.getDataRange().getValues()[0].map(String);let i=h.indexOf(key);if(i<0){i=h.length;sh.getRange(1,i+1).setValue(key);}return i+1;}
function webProjectRewrite_(oldLabel,newLabel,oldCode,newCode){
 for(const sh of book_().getSheets()){
  if(['Projects','ProjectAudit','PaymentBatches','Notifications','Settings'].includes(sh.getName()))continue;
  const a=sh.getDataRange().getValues(),h=a[0].map(String);
  for(let i=1;i<a.length;i++)for(let j=0;j<h.length;j++){
   if(h[j]==='project'&&String(a[i][j])===oldLabel)sh.getRange(i+1,j+1).setValue(newLabel);
   else if(h[j]==='project_code'&&String(a[i][j]).toUpperCase()===oldCode.toUpperCase())sh.getRange(i+1,j+1).setValue(newCode);
  }
 }
 // Preserve settled batch history; update only pending snapshots used for validation.
 const bs=book_().getSheetByName('PaymentBatches');if(bs){const a=bs.getDataRange().getValues(),h=a[0],status=h.indexOf('status'),column=h.indexOf('groups_json');for(let i=1;i<a.length;i++)if(a[i][status]==='pending'){const groups=JSON.parse(a[i][column]);let changed=false;for(const g of groups)for(const bill of g.bills)if(bill.project===oldLabel){bill.project=newLabel;changed=true;}if(changed)bs.getRange(i+1,column+1).setValue(JSON.stringify(groups));}}
}
function updateWebProject(init,oldCode,input){const u=webProjectManager_(init);input=input||{};const before=webProjectRecords_().find(p=>p.code.toUpperCase()===String(oldCode).toUpperCase());if(!before)throw Error('Không tìm thấy dự án.');if(String(input.revision)!==before.revision)throw Error('Dự án vừa thay đổi. Làm mới rồi kiểm tra lại.');
 const chat=input.telegram_group_chat_id===undefined?before.telegram_group_chat_id:webProjectChat_(input.telegram_group_chat_id);const archive=input.action==='archive';if(!archive&&input.action!=='save')throw Error('Thao tác không hợp lệ.');const code=archive?before.code:String(input.code||'').trim().toUpperCase(),name=archive?before.name:String(input.name||'').trim();if(!/^[A-Z0-9_-]{2,20}$/.test(code)||!name||name.length>80)throw Error('Mã dự án hoặc tên không hợp lệ.');if(webProjectRecords_().some(p=>p.code.toUpperCase()===code&&p.code.toUpperCase()!==before.code.toUpperCase()))throw Error('Mã dự án đã tồn tại, kể cả dự án đã ngưng sử dụng.');
 let found;try{found=webProjectRow_(before.code);}catch(e){const sh=sheet_('Projects'),h=sh.getDataRange().getValues()[0];sh.appendRow(h.map(k=>({code:before.code,name:before.name,created_by:u.id,created_at:new Date().toISOString()}[k]||'')));found=webProjectRow_(before.code);}
 const now=new Date().toISOString(),newLabel=code+' - '+name;let imageId=found.values[found.headers.indexOf('avatar_file_id')]||'';
 if(!archive&&input.image)imageId=__storeProjectImage(input.image);else if(!archive&&input.remove_image===true)imageId='';
 if(newLabel!==before.label)webProjectRewrite_(before.label,newLabel,before.code,code);
 const values={code,name,telegram_group_chat_id:chat,avatar_file_id:imageId,archived:archive?true:before.archived,updated_by:u.id,updated_at:now};if(archive){values.archived_by=u.id;values.archived_at=now;}for(const [key,value] of Object.entries(values))found.sheet.getRange(found.row,webProjectColumn_(found.sheet,key)).setValue(value);
 let audit=book_().getSheetByName('ProjectAudit');if(!audit){audit=book_().insertSheet('ProjectAudit');audit.appendRow(['id','action','old_code','old_name','new_code','new_name','actor','at','old_avatar_file_id','new_avatar_file_id']);}const oldChatCol=webProjectColumn_(audit,'old_telegram_group_chat_id'),newChatCol=webProjectColumn_(audit,'new_telegram_group_chat_id');audit.appendRow([Utilities.getUuid(),archive?'archive':'save',before.code,before.name,code,name,u.id,now,found.values[found.headers.indexOf('avatar_file_id')]||'',imageId]);audit.getRange(audit.getLastRow(),oldChatCol).setValue(before.telegram_group_chat_id);audit.getRange(audit.getLastRow(),newChatCol).setValue(chat);
 return {ok:true,projects:v20Projects_(),projectRecords:webProjectRecords_(),projectAvatars:webProjectImages_(),renamedProject:{from:before.label,to:newLabel},warning:archive?'Đã ngưng sử dụng dự án. Idea, task, bill và lịch sử được giữ nguyên.':'Đã cập nhật dự án và các liên kết liên quan.'};
}
// Require an explicit confirmation for Leader deletion; original ownership and
// department permissions, trash snapshots and restoration remain unchanged.
const webConfirmedDelete_=deleteProductionIdea;
deleteProductionIdea=function(init,id,reason,confirmed){const u=auth_(init);if(role_(u.role)==='leader'&&confirmed!==true)throw Error('Cần xác nhận trước khi xóa task.');return webConfirmedDelete_(init,id,reason);};

// All Leaders can delete/restore production tasks; assignment/edit permissions stay unchanged.
leaderProductionDelete_=function(u,x){return role_(u.role)==='leader';};
// Production is a company-wide overview for Leaders. Personal tasks and
// selected-approver checks use their own existing rules and are not elevated.
const webProductionVisibility_=productionVisibleRows_;
productionVisibleRows_=function(u,team){return webProductionVisibility_(role_(u.role)==='leader'?{...u,role:'director'}:u,team);};

// Chat IDs are strings; a blank ID disables group delivery for this project.
function webProjectChat_(value){const id=String(value??'').trim();if(id&&!/^-\d{6,20}$/.test(id))throw Error('ID nhóm Telegram phải là số âm, ví dụ -1001234567890.');return id;}
const webCreateProjectWithImage_=createV20Project;
createV20Project=function(init,code,name,image,chat){webProjectChat_(chat);const result=webCreateProjectWithImage_(init,code,name,image),found=webProjectRow_(String(code).trim().toUpperCase());found.sheet.getRange(found.row,webProjectColumn_(found.sheet,'telegram_group_chat_id')).setValue(webProjectChat_(chat));return {...result,projectRecords:webProjectRecords_()};};
const WEB_PROJECT_DIRECTORY=[{"code": "DA002", "name": "Đà Nẵng Daily", "telegram_group_chat_id": "-5491216133"}, {"code": "DA001", "name": "Lượn Đà Nẵng", "telegram_group_chat_id": "-1004493409232"}, {"code": "DA005", "name": "Viral Network", "telegram_group_chat_id": "-5179108258"}, {"code": "DA003", "name": "Jenna in Dana", "telegram_group_chat_id": "-5435244642"}, {"code": "DA007", "name": "Đà Nẵng Local", "telegram_group_chat_id": "-1004453115560"}, {"code": "DA010", "name": "Viral New", "telegram_group_chat_id": "-1003997879382"}, {"code": "DA008", "name": "Đà Nẵng Life", "telegram_group_chat_id": "-1003941050373"}, {"code": "DA009", "name": "Đà Nẵng Real", "telegram_group_chat_id": "-1004345461440"}, {"code": "DA011", "name": "Năng Lượng Đà Nẵng", "telegram_group_chat_id": "-1004283234143"}, {"code": "DA012", "name": "7 Ngày Đi Chơi", "telegram_group_chat_id": "-1004338354523"}];
function syncWebProjectDirectory(init,confirmed){const u=webProjectManager_(init);if(confirmed!==true)throw Error('Cần xác nhận đồng bộ danh sách dự án.');
 let created=0,updated=0,unchanged=0;
 for(const p of WEB_PROJECT_DIRECTORY){const before=webProjectRecords_().find(x=>x.code.toUpperCase()===p.code);
  if(!before){createV20Project(init,p.code,p.name,null,p.telegram_group_chat_id);created++;}
  else if(before.name!==p.name||before.telegram_group_chat_id!==p.telegram_group_chat_id){updateWebProject(init,p.code,{action:'save',revision:before.revision,code:p.code,name:p.name,telegram_group_chat_id:p.telegram_group_chat_id});updated++;}
  else unchanged++;
 }
 PropertiesService.getScriptProperties().setProperty('WEB_PROJECT_DIRECTORY_AUTHORITATIVE','true');const sh=sheet_('Settings'),a=sh.getDataRange().getValues(),i=a.findIndex((row,j)=>j>0&&String(row[0])==='group_chat_id');if(i>0)sh.getRange(i+1,2).setValue("-1003982647263");else sh.appendRow(['group_chat_id',"-1003982647263"]);V19_SETTINGS_CACHE=null;V19_SETTINGS_AT=0;
 let audit=book_().getSheetByName('ProjectAudit');if(!audit){audit=book_().insertSheet('ProjectAudit');audit.appendRow(['id','action','old_code','old_name','new_code','new_name','actor','at']);}
 const h=audit.getDataRange().getValues()[0];audit.appendRow(h.map(k=>({id:Utilities.getUuid(),action:'sync_directory',actor:u.id,at:new Date().toISOString(),new_name:WEB_PROJECT_DIRECTORY.map(p=>p.code).join(', ')}[k]||'')));
 return {ok:true,projects:v20Projects_(),projectRecords:webProjectRecords_(),projectAvatars:webProjectImages_(),warning:'Đồng bộ 10 dự án: '+created+' mới, '+updated+' cập nhật, '+unchanged+' giữ nguyên. Nhóm tổng chỉ được lưu trong cấu hình thông báo chung.'};
}
