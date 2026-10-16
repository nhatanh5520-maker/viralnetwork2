export function projectImageFile(data,member,id){
 const staff=data.books?.main?.Employees||[],headers=staff[0]||[];
 if(!staff.slice(1).some(r=>String(r[headers.indexOf('telegram_id')])===String(member.employeeId)&&String(r[headers.indexOf('active')]).toLowerCase()==='true'))return null;
 const projects=data.books.main.Projects||[],column=projects[0]?.indexOf('avatar_file_id');
 if(!(column>=0)||!projects.slice(1).some(row=>String(row[column])===id))return null;
 const file=data.files?.[id];return file&&!file.deleted&&file.folder==='project-avatars'?file:null;
}
// Keep web project images when a later legacy workbook replaces production data.
export function retainProjectImages(candidate,current){
 const live=current.books?.main?.Projects||[],imageColumn=live[0]?.indexOf('avatar_file_id');
 if(!(imageColumn>=0))return;
 const codeColumn=live[0].indexOf('code'),target=candidate.books.main.Projects;
 for(const row of live.slice(1)){
  const id=String(row[imageColumn]||''),file=current.files?.[id];if(!id||!file||file.deleted||file.folder!=='project-avatars')continue;
  let column=target[0].indexOf('avatar_file_id');if(column<0){column=target[0].length;target[0].push('avatar_file_id');}
  let match=target.slice(1).find(r=>String(r[target[0].indexOf('code')])===String(row[codeColumn]));
  if(!match){match=target[0].map(k=>row[live[0].indexOf(k)]??'');target.push(match);}
  match[column]=id;candidate.files??={};candidate.files[id]=structuredClone(file);
 }
}

// The approved web directory takes precedence over a later, older workbook.
export function retainProjectDirectory(candidate,current){
 if(current.properties?.WEB_PROJECT_DIRECTORY_AUTHORITATIVE!=='true')return;
 const live=current.books?.main?.Projects||[],target=candidate.books.main.Projects;
 if(!live.length||!target?.length)return;
 const lh=live[0],th=target[0];for(const key of lh)if(!th.includes(key))th.push(key);
 for(const row of live.slice(1)){
  const code=String(row[lh.indexOf('code')]||'');if(!code)continue;
  let match=target.slice(1).find(r=>String(r[th.indexOf('code')]).toUpperCase()===code.toUpperCase());
  const oldLabel=match?String(match[th.indexOf('code')])+' - '+String(match[th.indexOf('name')]):'',newLabel=code+' - '+String(row[lh.indexOf('name')]);
  if(!match){match=[];target.push(match);}for(const key of lh)match[th.indexOf(key)]=row[lh.indexOf(key)]??'';
  if(oldLabel&&oldLabel!==newLabel)for(const [name,matrix] of Object.entries(candidate.books.main)){
   if(['Projects','ProjectAudit','PaymentBatches','Notifications','Settings'].includes(name))continue;
   const col=matrix[0]?.indexOf('project');if(col>=0)for(const item of matrix.slice(1))if(item[col]===oldLabel)item[col]=newLabel;
  }
 }
 candidate.properties??={};candidate.properties.WEB_PROJECT_DIRECTORY_AUTHORITATIVE='true';
 const general=(current.books.main.Settings||[]).find(r=>r[0]==='group_chat_id');if(general){const existing=candidate.books.main.Settings.find(r=>r[0]==='group_chat_id');if(existing)existing[1]=general[1];else candidate.books.main.Settings.push(structuredClone(general));}
 if(current.books.main.ProjectAudit)candidate.books.main.ProjectAudit=structuredClone(current.books.main.ProjectAudit);
}
