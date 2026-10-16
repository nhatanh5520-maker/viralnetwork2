// Project names remain compatible with the original Sheets workflow.
function webProjectManager_(init){const u=auth_(init);if(!['leader','director'].includes(role_(u.role)))throw Error('Chỉ Leader hoặc Ban giám đốc được sửa dự án.');return u;}
function webProjectArchived_(p){return String(p.archived).toLowerCase()==='true';}
function webProjectRecords_(){const explicit=rows_('Projects').filter(p=>p.code),known=new Set(explicit.map(p=>String(p.code).toUpperCase()));const legacy=[...new Set(rows_('ProductionItems').map(x=>String(x.project||'').trim()))].filter(Boolean).map(label=>{const m=/^([A-Z0-9_-]+)\s+-\s+(.+)$/i.exec(label);return m?{code:m[1],name:m[2]}:null;}).filter(p=>p&&!known.has(p.code.toUpperCase()));return [...explicit,...legacy].map(p=>({code:String(p.code),name:String(p.name),label:String(p.code)+' - '+String(p.name),archived:webProjectArchived_(p),revision:JSON.stringify([p.code,p.name,p.avatar_file_id||'',p.archived||'',p.updated_at||''])}));}
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
 const archive=input.action==='archive';if(!archive&&input.action!=='save')throw Error('Thao tác không hợp lệ.');const code=archive?before.code:String(input.code||'').trim().toUpperCase(),name=archive?before.name:String(input.name||'').trim();if(!/^[A-Z0-9_-]{2,20}$/.test(code)||!name||name.length>80)throw Error('Mã dự án hoặc tên không hợp lệ.');if(webProjectRecords_().some(p=>p.code.toUpperCase()===code&&p.code.toUpperCase()!==before.code.toUpperCase()))throw Error('Mã dự án đã tồn tại, kể cả dự án đã ngưng sử dụng.');
 let found;try{found=webProjectRow_(before.code);}catch(e){const sh=sheet_('Projects'),h=sh.getDataRange().getValues()[0];sh.appendRow(h.map(k=>({code:before.code,name:before.name,created_by:u.id,created_at:new Date().toISOString()}[k]||'')));found=webProjectRow_(before.code);}
 const now=new Date().toISOString(),newLabel=code+' - '+name;let imageId=found.values[found.headers.indexOf('avatar_file_id')]||'';
 if(!archive&&input.image)imageId=__storeProjectImage(input.image);else if(!archive&&input.remove_image===true)imageId='';
 if(newLabel!==before.label)webProjectRewrite_(before.label,newLabel,before.code,code);
 const values={code,name,avatar_file_id:imageId,archived:archive?true:before.archived,updated_by:u.id,updated_at:now};if(archive){values.archived_by=u.id;values.archived_at=now;}for(const [key,value] of Object.entries(values))found.sheet.getRange(found.row,webProjectColumn_(found.sheet,key)).setValue(value);
 let audit=book_().getSheetByName('ProjectAudit');if(!audit){audit=book_().insertSheet('ProjectAudit');audit.appendRow(['id','action','old_code','old_name','new_code','new_name','actor','at','old_avatar_file_id','new_avatar_file_id']);}audit.appendRow([Utilities.getUuid(),archive?'archive':'save',before.code,before.name,code,name,u.id,now,found.values[found.headers.indexOf('avatar_file_id')]||'',imageId]);
 return {ok:true,projects:v20Projects_(),projectRecords:webProjectRecords_(),projectAvatars:webProjectImages_(),renamedProject:{from:before.label,to:newLabel},warning:archive?'Đã ngưng sử dụng dự án. Idea, task, bill và lịch sử được giữ nguyên.':'Đã cập nhật dự án và các liên kết liên quan.'};
}
// Require an explicit confirmation for Leader deletion; original ownership and
// department permissions, trash snapshots and restoration remain unchanged.
const webConfirmedDelete_=deleteProductionIdea;
deleteProductionIdea=function(init,id,reason,confirmed){const u=auth_(init);if(role_(u.role)==='leader'&&confirmed!==true)throw Error('Cần xác nhận trước khi xóa task.');return webConfirmedDelete_(init,id,reason);};
