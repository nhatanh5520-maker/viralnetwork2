export class ViralStateReadError extends Error {
 constructor(code,message){super(message+' ['+code+']');this.code=code;this.stage='';this.httpStatus=/** @type {number|null} */(null);}
}
/** @param {any} error @param {string} [stage] @param {number|null} [httpStatus] */
export function stateReadFailure(error,stage='',httpStatus=null){
 if(error instanceof ViralStateReadError)return error;
 const raw=String(error?.code||''),message=String(error?.message||''),status=Number(httpStatus??error?.httpStatus??error?.status)||null;
 let code=/^[A-Za-z0-9_-]{1,24}$/.test(raw)?raw:'STATE_READ';
 if(['AbortError','TimeoutError'].includes(error?.name)&&!/^\d{5}$/.test(raw))code='STATE_TIMEOUT';
 if(code==='STATE_READ'){
  if(['AbortError','TimeoutError'].includes(error?.name)||/^(?:AbortError|TimeoutError):/.test(message))code='STATE_TIMEOUT';
  else if(/^(?:TypeError: )?fetch failed\b|^Failed to fetch$|^NetworkError when attempting to fetch resource\.?$/i.test(message))code='STATE_NETWORK';
  else if([500,502,503,504].includes(status))code='STATE_HTTP_'+status;
 }
 const reason=code==='PGRST116'?'Không tìm thấy bản ghi dữ liệu chính. Liên hệ quản trị để kiểm tra.':
  ['42501','PGRST301','PGRST302','PGRST303'].includes(code)?'Máy chủ chưa có quyền đọc dữ liệu. Liên hệ quản trị.':
  ['57014','STATE_TIMEOUT'].includes(code)?'Đọc dữ liệu quá thời gian. Vui lòng thử lại sau ít giây.':
  'Chưa kết nối được dữ liệu. Vui lòng thử lại sau ít giây.';
 const safeStage=['main','version','profile','notifications'].includes(stage)?stage:'';
 const failure=new ViralStateReadError(code,reason);failure.stage=safeStage;failure.httpStatus=status;
 if(safeStage)failure.message=reason+' ['+code+'/'+safeStage.toUpperCase()+']';
 return failure;
}
export function retryableStateRead(error){
 const code=stateReadFailure(error).code;
 return ['57014','STATE_TIMEOUT','STATE_NETWORK','STATE_HTTP_500','STATE_HTTP_502','STATE_HTTP_503','STATE_HTTP_504','ECONNRESET','ETIMEDOUT','EAI_AGAIN','08000','08001','08006','57P01','53300'].includes(code);
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

// Retry transient SELECT failures once, only for callers opting into read retry.
// Permission, missing-record and unknown failures are never retried.
export async function retryStateRead(read,{retry=false,retryCancelled=true,pause=()=>new Promise(resolve=>setTimeout(resolve,500))}={}){
 try{return await read();}catch(error){
  if(!retry||!retryableStateRead(error)||!retryCancelled&&stateReadFailure(error).code==='57014')throw error;
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
