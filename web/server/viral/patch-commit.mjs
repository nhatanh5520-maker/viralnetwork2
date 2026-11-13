// Commit only what a request changed (see supabase/viral-fast-commit.sql).
// Two requests conflict only when one wrote a sheet the other read or wrote; check-ins are saved as
// single-row operations so concurrent check-ins by different people merge instead of failing.

/**
 * Resolves to the Supabase-style {data:boolean} that commitWithUploads expects, plus `version`.
 * Falls back to the legacy full-document viral_commit when the patch function is not installed yet,
 * so the web can be deployed before or after running the SQL.
 */
export async function commitChanges({rpc,version,changes,events,fullData,onFallback=()=>{}}){
 const response=await rpc('viral_commit_patch',{expected_version:version,read_keys:changes.reads,write_keys:changes.writes,patches:changes.patches,outbox_done:changes.outboxDone,events});
 const message=String(response?.error?.message||'');
 if(response?.error&&(response.error.code==='PGRST202'||/viral_commit_patch/.test(message)&&/(not find|does not exist)/i.test(message))){
  onFallback();
  const legacy=await rpc('viral_commit',{expected_version:version,new_data:fullData(),events});
  return {...legacy,version:legacy?.data===true?Number(version)+1:0,legacy:true};
 }
 if(response?.error||!['number','string'].includes(typeof response?.data))return {error:response?.error||Error('invalid commit response')};
 const next=Number(response.data);
 return {data:next>0,version:next};
}

/**
 * JavaScript mirror of viral_commit_patch, used by tests to emulate the database exactly.
 * `log` is an array of {version, keys}; returns the new {state, version} or null on conflict.
 */
export function applyCommitPatch({state,version,log},{expected_version,read_keys,write_keys,patches,outbox_done=[]}){
 if(version!==expected_version){
  if(version<expected_version)return null;
  const since=log.filter(l=>l.version>expected_version&&l.version<=version);
  if(since.length!==version-expected_version)return null;
  const reads=new Set(read_keys);
  if(since.some(l=>l.keys.includes('*')||l.keys.some(k=>reads.has(k))))return null;
 }
 const d=structuredClone(state);
 for(const p of patches){
  let parent=d;for(const k of p.path.slice(0,-1)){if(parent[k]===null||typeof parent[k]!=='object'||Array.isArray(parent[k]))parent[k]={};parent=parent[k];}
  const last=p.path[p.path.length-1];
  if(p.rows){
   const sheet=parent[last];if(!Array.isArray(sheet))return null;
   for(const u of p.rows.update||[]){const i=sheet.findIndex((r,n)=>n>0&&String(r?.[0]??'')===String(u.id));if(i<0||JSON.stringify(sheet[i])!==JSON.stringify(u.base))return null;sheet[i]=structuredClone(u.row);}
   for(const a of p.rows.append||[]){const unique=p.rows.unique||[];if(unique.length&&sheet.some((r,n)=>n>0&&unique.every(c=>String(r?.[c]??'')===String(a?.[c]??''))))return null;sheet.push(structuredClone(a));}
  }else if(p.remove)delete parent[last];else parent[last]=structuredClone(p.value);
 }
 if(outbox_done.length&&Array.isArray(d.outbox)){const done=new Set(outbox_done);d.outbox=d.outbox.filter(x=>!done.has(String(x?.id)));}
 return {state:d,version:version+1,keys:write_keys};
}
