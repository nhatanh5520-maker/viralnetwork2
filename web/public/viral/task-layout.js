/* Presentation only: progress follows saved production milestones. */
globalThis.ViralTaskLayout={
 production(x={}){
  const stage=String(x.stage||''),edit=Math.max(0,Math.min(100,Number(x.editor_progress)||0));
  if(['ready','published'].includes(stage)||x.final_delivery_status==='completed'&&x.final_url)return {percent:100,label:stage==='published'?'Đã đăng':'Đã gửi hoàn thành Video Final'};
  if(x.idea_approval!=='Duyệt')return {percent:0,label:x.idea_approval==='Không duyệt'?'Idea cần chỉnh sửa theo phản hồi':'Đang chờ duyệt Idea'};
  const handoff=!!(x.editor_received_at||x.editor_handoff_at)||['edit','review','revision'].includes(stage);
  if(handoff){if(stage==='revision')return {percent:Math.round(60+.3*edit),label:'Editor đang chỉnh sửa'+(edit?' · '+edit+'% phần dựng':'')};if(x.final_url||stage==='review')return {percent:90,label:'Đã có link Final · Chờ gửi hoàn thành'};return {percent:Math.round(60+.3*edit),label:edit?'Đang edit · Editor hoàn thành '+edit+'%':'Đã bàn giao tư liệu · Đang chờ edit'};}
  if(x.raw_url||x.script_url||x.vj_script_started_at)return {percent:40,label:x.raw_url?'Đã có Raw · Chờ bàn giao cho Editor':stage==='shoot'?'Đang quay / chờ bàn giao Raw':'Đang làm kịch bản / chuẩn bị quay'};
  return {percent:20,label:'Idea đã duyệt · Chuẩn bị kịch bản / quay'};
 },
 group(t={}){
  if(['done','completed'].includes(String(t.status)))return 'done';
  if(['cancelled','canceled'].includes(String(t.status)))return 'cancelled';
  if(t._review)return 'waiting';
  const x=t.production_item||{};
  if(t.awaiting_assets)return 'waiting';
  if(t.is_edit_task)return Number(x.editor_progress)>0||t.status==='revision'?'active':'waiting';
  if(t.is_vj_task)return x.vj_script_started_at?'active':'waiting';
  if(t.production_id&&x.idea_approval!=='Duyệt')return 'waiting';
  return ['in_progress','revision','review'].includes(String(t.status))?'active':'waiting';
 },
 task(t={}){
  if(t.production_id)return this.production(t.production_item||{});
  if(t.status==='done')return {percent:100,label:'Đã hoàn thành công việc'};
  return {percent:Math.max(0,Math.min(99,Number(t.progress)||0)),label:t.status==='revision'?'Cần chỉnh sửa':t.status==='review'?'Đang chờ người được chọn xác nhận':t.status==='in_progress'?'Đang thực hiện':'Đang chờ thực hiện'};
 }
};
