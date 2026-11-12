// Version-keyed snapshot cache for viral_state.main.
//
// Every writer of viral_state bumps `version` (viral_commit, viral_commit_patch,
// viral_attendance_apply, staff-sync, migration, HR). So when a tiny
// `select version` returns the same number as the cached snapshot, the cached
// JSON is byte-for-byte what the database holds and the multi-MB read can be
// skipped. Authorization is still computed per request from that data.
//
// Callers always receive their own deep copy (`data`). `base` is the shared,
// read-only database image used only to compute what changed on commit.
export function versionedStateCache({readVersion,readFull,reconcile=async d=>d,reconcileTtl=20000,now=Date.now,clone=structuredClone}){
 let entry=null,pendingFull=null;
 const full=()=>{
  if(!pendingFull){const op=Promise.resolve().then(readFull);pendingFull=op;op.then(()=>{if(pendingFull===op)pendingFull=null;},()=>{if(pendingFull===op)pendingFull=null;});}
  return pendingFull;
 };
 async function fresh(version){
  let snapshot=await full();
  // A read that started before the latest write can resolve with an older
  // version; read once more instead of serving it as current.
  if(version!==undefined&&snapshot.version<version){pendingFull=null;snapshot=await full();}
  if(!entry||snapshot.version!==entry.version)entry={version:snapshot.version,raw:snapshot.data,reconciled:null,reconciledAt:0,pending:null};
  return entry;
 }
 async function reconciled(current){
  if(current.reconciled&&now()-current.reconciledAt<reconcileTtl)return current.reconciled;
  if(!current.pending){
   const op=Promise.resolve().then(()=>reconcile(clone(current.raw)));current.pending=op;
   op.then(data=>{current.reconciled=data;current.reconciledAt=now();current.pending=null;},()=>{current.pending=null;});
  }
  return current.pending;
 }
 async function load(){
  const version=await readVersion();
  const current=entry&&entry.version===version?entry:await fresh(version);
  const data=await reconciled(current);
  return {data:clone(data),base:current.raw,version:current.version};
 }
 // After a successful commit this process knows the exact new database image.
 load.remember=(version,data)=>{if(!entry||version>entry.version)entry={version,raw:data,reconciled:data,reconciledAt:now(),pending:null};};
 load.invalidate=()=>{entry=null;pendingFull=null;};
 load.peek=()=>entry?{version:entry.version}:null;
 return load;
}
