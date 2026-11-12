// Send only the parts of viral_state that changed instead of the whole JSON.
// Granularity: books.<book>.<tab>, books.<new book>, or a top-level key.
// Returns null when something was deleted; callers then use the full commit.
const same=(a,b)=>a===b||JSON.stringify(a)===JSON.stringify(b);
const own=(o,k)=>!!o&&Object.prototype.hasOwnProperty.call(o,k);
export function statePatch(base,next){
 const ops=[];
 for(const key of new Set([...Object.keys(base||{}),...Object.keys(next||{})])){
  if(!own(next,key))return null;
  if(key!=='books'||!own(base,key)||typeof base.books!=='object'||typeof next.books!=='object'||!base.books||!next.books){if(!own(base,key)||!same(base[key],next[key]))ops.push({path:[key],value:next[key]});continue;}
  for(const book of new Set([...Object.keys(base.books),...Object.keys(next.books)])){
   if(!own(next.books,book))return null;
   const before=base.books[book],after=next.books[book];
   if(!own(base.books,book)||!before||!after||typeof before!=='object'||typeof after!=='object'){if(!own(base.books,book)||!same(before,after))ops.push({path:['books',book],value:after});continue;}
   for(const tab of new Set([...Object.keys(before),...Object.keys(after)])){
    if(!own(after,tab))return null;
    if(!own(before,tab)||!same(before[tab],after[tab]))ops.push({path:['books',book,tab],value:after[tab]});
   }
  }
 }
 return ops;
}

// Outbox entries live in the blob only until their commit inserts them into
// viral_outbox (same transaction). Clearing them stops the blob from growing
// and stops every later commit from re-sending the whole history as events.
export function drainOutbox(next){
 const events=(next.outbox||[]).filter(x=>x&&x.status==='pending').map(x=>({id:x.id,chat_id:x.chatId,text:x.text,photo_file_id:null}));
 next.outbox=[];
 return events;
}

const missing=e=>['PGRST202','42883'].includes(String(e?.code||''));
let patchAvailable=true;
export function resetPatchSupport(){patchAvailable=true;}
// rpc(name,args) => {data,error} like supabase-js. Returns the same shape as
// viral_commit so commitWithUploads semantics stay unchanged:
//   data===true  committed, data===false  CAS rejected (nothing written).
export async function commitState({rpc,base,next,version,events=[]}){
 const ops=base?statePatch(base,next):null;
 if(ops&&!ops.length)return {data:true,error:null,unchanged:true};
 if(ops&&patchAvailable){
  const result=await rpc('viral_commit_patch',{expected_version:version,patch:ops,events});
  if(!result?.error)return result;
  if(missing(result.error))patchAvailable=false;
  // P0001 = raised by our function: the transaction rolled back, nothing saved.
  else if(String(result.error.code)!=='P0001')return result;
 }
 return rpc('viral_commit',{expected_version:version,new_data:next,events});
}
