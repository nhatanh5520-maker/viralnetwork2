// Only an explicit CAS false proves no business data or events were committed.
export class ViralVersionConflict extends Error {
 constructor(){super('Dữ liệu vừa được cập nhật trong lúc lưu. Làm mới rồi thử lại.');}
}
// Check-in/out is idempotent (a second call returns `already`), so it can safely be retried more
// times than approvals. A short randomized pause stops several server instances from colliding
// again in lock-step at shift start.
export const ATTENDANCE_METHODS=['attendance','fieldAttendance','overtime'];
// Every other save is retried too. A version conflict proves nothing was written (data, events or
// uploads), and each attempt re-runs the business rules on fresh data, so a retry is the same as the
// user pressing the button again a moment later. Without it, two people saving different videos in
// the same second saw "Dữ liệu vừa được cập nhật", because production saves write the whole sheet.
const RETRY_LIMITS=Object.fromEntries(ATTENDANCE_METHODS.map(m=>[m,6])),DEFAULT_RETRY_LIMIT=3;
const defaultPause=attempt=>new Promise(resolve=>setTimeout(resolve,Math.round((80+Math.random()*170)*(attempt+1))));
export async function withViralWriteRetry(method,operation,{pause=defaultPause}={}){
 const limit=RETRY_LIMITS[method]||DEFAULT_RETRY_LIMIT;
 for(let attempt=0;;attempt++){
  try{return await operation();}
  catch(error){
   if(!(error instanceof ViralVersionConflict)||attempt>=limit-1)throw error;
   await pause(attempt);
  }
 }
}
export const withIdeaApprovalRetry=withViralWriteRetry;
