export class ViralStateReadError extends Error {
 constructor(code,message){super(message+' ['+code+']');this.code=code;}
}
export function stateReadFailure(error){
 const raw=String(error?.code||''),code=/^[A-Za-z0-9_-]{1,24}$/.test(raw)?raw:'STATE_READ';
 const reason=code==='PGRST116'?'Không tìm thấy bản ghi dữ liệu chính. Liên hệ quản trị để kiểm tra.':
  ['42501','PGRST301','PGRST302','PGRST303'].includes(code)?'Máy chủ chưa có quyền đọc dữ liệu. Liên hệ quản trị.':
  code==='57014'||error?.name==='AbortError'||error?.name==='TimeoutError'?'Đọc dữ liệu quá thời gian. Vui lòng thử lại sau ít giây.':
  'Chưa kết nối được dữ liệu. Vui lòng thử lại sau ít giây.';
 return new ViralStateReadError(code,reason);
}
// Share in-flight database reads only. Never cache a settled snapshot or auth.
// Each caller receives its own copy, so one employee cannot mutate another read.
export function sharedStateRead(read){
 let pending=null;
 const load=async function(){
  if(!pending){const operation=Promise.resolve().then(read);pending=operation;operation.then(()=>{if(pending===operation)pending=null;},()=>{if(pending===operation)pending=null;});}
  return structuredClone(await pending);
 };
 load.invalidate=()=>{pending=null;};return load;
}

// Retry a cancelled read once, only for callers explicitly using the read path.
// Permission, missing-record and unknown failures are never retried.
export async function retryStateRead(read,{retry=false,pause=()=>new Promise(resolve=>setTimeout(resolve,500))}={}){
 try{return await read();}catch(error){
  if(!retry||error?.code!=='57014')throw error;
  await pause();return read();
 }
}

const versionKey=value=>{
 if(typeof value==='number'&&(!Number.isSafeInteger(value)||value<0))throw stateReadFailure({code:'STATE_VERSION'});
 const key=String(value??'');if(!/^\d+$/.test(key))throw stateReadFailure({code:'STATE_VERSION'});return key;
};
// Cache only private, unfiltered snapshots, never sessions, users or rendered
// responses. Every request checks the database version before reusing a value.
// Writers never call this reader. Memory is bounded; an outage never serves stale data.
export function versionedStateRead({readVersion,readSnapshot,maxBytes=32*1024*1024}){
 const cache=new Map(),pending=new Map();let bytes=0,generation=0;
 const load=async function(scope='full'){
  const running=pending.get(scope);if(running?.generation===generation)return structuredClone(await running.promise);
  const epoch=generation;
  const operation=Promise.resolve().then(async()=>{
   const current=versionKey(await readVersion());
   const entry=cache.get(scope);
   if(entry&&versionKey(entry.snapshot.version)===current){
    cache.delete(scope);cache.set(scope,entry);return entry.snapshot;
   }
   const snapshot=await readSnapshot(scope);
   if(!snapshot?.data||BigInt(versionKey(snapshot.version))<BigInt(current))throw stateReadFailure({code:'STATE_VERSION'});
   const own=structuredClone(snapshot),size=Buffer.byteLength(JSON.stringify(own));
   if(epoch===generation){
    if(entry){bytes-=entry.size;cache.delete(scope);}
    if(size<=maxBytes){
     while(bytes+size>maxBytes&&cache.size){const key=cache.keys().next().value;bytes-=cache.get(key).size;cache.delete(key);}
     cache.set(scope,{snapshot:own,size});bytes+=size;
    }
   }
   return own;
  });
  pending.set(scope,{generation:epoch,promise:operation});
  const clear=()=>{if(pending.get(scope)?.promise===operation)pending.delete(scope);};operation.then(clear,clear);
  return structuredClone(await operation);
 };
 load.invalidate=()=>{generation++;cache.clear();bytes=0;pending.clear();};
 return load;
}
