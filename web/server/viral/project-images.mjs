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
