export function personalAvatarFile(data,member,id){
 const staff=data.books?.main?.Employees||[],h=staff[0]||[];
 if(!staff.slice(1).some(r=>String(r[h.indexOf('telegram_id')])===String(member?.employeeId)&&String(r[h.indexOf('active')]).toLowerCase()==='true'))return null;
 const a=data.books?.main?.UserAvatars||[],ah=a[0]||[],record=a.slice(1).find(r=>String(r[ah.indexOf('file_id')])===id&&r[ah.indexOf('mode')]==='custom');
 if(!record||!staff.slice(1).some(r=>String(r[h.indexOf('telegram_id')])===String(record[ah.indexOf('telegram_id')])&&String(r[h.indexOf('active')]).toLowerCase()==='true'))return null;
 const file=data.files?.[id];return file&&!file.deleted&&file.folder==='person-avatars'?file:null;
}
export function retainPersonalAvatars(candidate,current){
 const table=current.books?.main?.UserAvatars;if(!table)return;
 candidate.books.main.UserAvatars=structuredClone(table);candidate.files??={};const col=table[0].indexOf('file_id');
 for(const row of table.slice(1)){const id=String(row[col]||''),file=current.files?.[id];if(file&&!file.deleted&&file.folder==='person-avatars')candidate.files[id]=structuredClone(file);}
}
