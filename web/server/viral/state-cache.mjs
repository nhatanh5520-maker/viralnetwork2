// Per-process cache of the shared JSON state. Each read asks the database only for what changed since
// the cached version (viral_state_delta), so the multi-MB document is downloaded only once per instance.
// Cached snapshots are never mutated: commits and deltas produce a new object with structural sharing
// (copy-on-write along patch paths), so snapshots already handed to requests stay valid.

export class StaleCacheError extends Error {}
/** Apply row operations ({update:[{id,row}], append:[row]}) to a sheet, returning a new array. */
export function applyRowOps(sheet,{update=[],append=[]}){
 if(!Array.isArray(sheet))throw new StaleCacheError('row patch on missing sheet');
 const out=sheet.slice();
 if(update.length){
  const index=new Map();for(let i=1;i<out.length;i++){const id=String(out[i]?.[0]??'');if(id&&!index.has(id))index.set(id,i);}
  for(const {id,row} of update){const i=index.get(String(id));if(i===undefined)throw new StaleCacheError('row '+id+' missing');out[i]=structuredClone(row);}
 }
 for(const row of append)out.push(structuredClone(row));
 return out;
}
/**
 * Copy-on-write application of commit patches / delta entries, mirroring viral_commit_patch.
 * Snapshots handed out earlier are never modified.
 */
export function applyPatchesImmutable(state,patches,outboxDone=[]){
 let root={...state};
 for(const {path,value,remove,rows} of patches){
  let parent=root;
  for(const p of path.slice(0,-1)){
   const child=parent[p];
   parent[p]=child!==null&&typeof child==='object'&&!Array.isArray(child)?{...child}:{};
   parent=parent[p];
  }
  const last=path[path.length-1];
  if(rows)parent[last]=applyRowOps(parent[last],rows);
  else if(remove)delete parent[last];else parent[last]=structuredClone(value);
 }
 if(outboxDone.length&&Array.isArray(root.outbox)){const done=new Set(outboxDone.map(String));root.outbox=root.outbox.filter(x=>!done.has(String(x?.id)));}
 return root;
}

/**
 * delta(since) -> {version, patches?, full?} from viral_state_delta, or null when that SQL function
 * is not installed (then probe() -> version is used and any change triggers a full download).
 */
export function stateCache({delta,probe,fetchFull}){
 let cached=null,deltaMissing=false;
 const full=async()=>{const {data,version}=await fetchFull(),fresh={data,version};if(!cached||version>=cached.version)cached=fresh;return fresh;};
 return {
  /** Returns {data,version}. `data` is shared and read-only. */
  async read(){
   const base=cached;if(!base)return full();
   if(delta&&!deltaMissing){
    const d=await delta(base.version);
    if(d===null)deltaMissing=true;
    else{
     if(d.full||!Array.isArray(d.patches))return full();
     if(Number(d.version)===base.version)return base;
     let next;
     try{next={data:applyPatchesImmutable(base.data,d.patches),version:Number(d.version)};}
     catch(error){if(error instanceof StaleCacheError)return full();throw error;}
     if(!cached||next.version>=cached.version)cached=next;
     return next;
    }
   }
   const version=await probe();
   if(version===base.version)return base;
   return full();
  },
  /** Keep the cache in step with our own commit when nobody else committed in between. */
  committed(baseVersion,newVersion,patches,outboxDone){
   // Otherwise the next read() fetches the delta from the database.
   if(cached&&cached.version===baseVersion&&newVersion===baseVersion+1){
    try{cached={data:applyPatchesImmutable(cached.data,patches,outboxDone),version:newVersion};}catch{cached=null;}
   }
  },
  invalidate(){cached=null;},
  peek(){return cached;}
 };
}

/**
 * Commit only the sheets that changed. Falls back to the legacy full-document CAS when the
 * viral_commit_patch SQL function has not been installed yet, so deploy order does not matter.
 * Resolves to the Supabase-style {data:boolean} expected by commitWithUploads, plus `version`.
 */
export async function commitChanges({rpc,version,changes,events,fullData,onFallback=()=>{}}){
 const response=await rpc('viral_commit_patch',{expected_version:version,read_keys:changes.reads,write_keys:changes.writes,patches:changes.patches,outbox_done:changes.outboxDone,events});
 const missing=response?.error&&(response.error.code==='PGRST202'||/viral_commit_patch/.test(String(response.error.message||''))&&/(not find|does not exist)/i.test(String(response.error.message||'')));
 if(missing){
  onFallback();
  const legacy=await rpc('viral_commit',{expected_version:version,new_data:fullData(),events});
  return {...legacy,version:legacy?.data===true?version+1:0,legacy:true};
 }
 if(response?.error||typeof response?.data!=='number'&&typeof response?.data!=='string')return {error:response?.error||Error('invalid commit response')};
 const next=Number(response.data);
 return {data:next>0,version:next};
}
