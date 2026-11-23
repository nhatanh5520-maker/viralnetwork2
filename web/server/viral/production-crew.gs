// Leader Media: change the Cam-op and Editors of ANY production task, and delete any task.
// The Leader Media is a Leader whose department name contains "Media" (accents and case ignored).
// Only cam_id and the Editor team change here; VJ, approver, shoot time, cost and stage stay as they are.
function mediaLeader_(u){
 const dept=String(u&&u.department||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
 return role_(u&&u.role)==='leader'&&/(^|[^a-z])media([^a-z]|$)/.test(dept);
}
function canChangeProductionCrew_(u,x){return mediaLeader_(u)||canAssignProduction_(u,x);}

function assignProductionCrew(initData,id,data){
 const u=auth_(initData);productionWritable_(u);
 if(!data||typeof data!=='object')throw Error('Thiếu thông tin');
 return createWriteScope_(()=>{
  const cam=productionPerson_(data.cam_id),editorIds=teamInput_(data,'editor_ids',productionPerson_(data.editor_id));
  if(editorIds.length>1&&!book_().getSheetByName('ProductionTeam'))throw Error('Chạy setupV19Team một lần trước khi phân công team');
  const lock=LockService.getScriptLock();lock.waitLock(15000);let before,item;
  try{
   const f=productionRow_(id);before={...withProductionTeam_([f.item])[0]};
   if(!canChangeProductionCrew_(u,before))throw Error('Chỉ Leader Media hoặc người phụ trách phân công mới được đổi Cam-op và Editor');
   if(['published','deleted'].includes(String(before.stage)))throw Error(String(before.stage)==='deleted'?'Task đã bị xóa':'Nội dung đã đăng');
   validateProductionAssignments_([],cam,editorIds,'',before);
   productionSet_(f,'cam_id',cam);productionSet_(f,'editor_id',editorIds[0]||'');productionSet_(f,'updated_at',new Date().toISOString());
   syncProductionNames_(productionRow_(id));SpreadsheetApp.flush();item=productionRow_(id).item;
  }finally{lock.releaseLock()}
  let warning='';
  try{
   syncProductionTasks_(item,before,u);
   if(book_().getSheetByName('ProductionTeam'))saveTeamRole_(item,'Editor',editorIds,u);
   notifyProductionAssignments_(item,before,u);
   if(projectAssignmentChanged_(before,productionRow_(id).item))projectNotify_(id,'assignment');
  }catch(e){console.error(e);warning='Đã lưu Cam-op và Editor; cần kiểm tra task hoặc thông báo.'}
  return productionResult_(id,warning);
 });
}

// Delete: Leader Media may delete any task (other Leaders keep their current rule).
const crewDeleteAllowed_=ideaDeleteAllowed_;
ideaDeleteAllowed_=function(u,x){return mediaLeader_(u)||crewDeleteAllowed_(u,x);};
const crewLeaderDelete_=leaderProductionDelete_;
leaderProductionDelete_=function(u,x){return mediaLeader_(u)||crewLeaderDelete_(u,x);};
