// Only an explicit CAS false proves no business data or events were committed.
export class ViralVersionConflict extends Error {
 constructor(){super('Dữ liệu vừa được cập nhật trong lúc lưu. Làm mới rồi thử lại.');}
}
// Check-in/out is idempotent (a second call returns `already`), so it can safely be retried more
// times than approvals. Concurrent check-ins only collide on the Attendance sheet, and a short
// randomized pause stops several server instances from colliding again in lock-step.
export const ATTENDANCE_METHODS=['attendance','fieldAttendance','overtime'];
const RETRY_LIMITS={decideProductionApproval:3,submitAppProductionApproval:3,...Object.fromEntries(ATTENDANCE_METHODS.map(m=>[m,6]))};
const defaultPause=attempt=>new Promise(resolve=>setTimeout(resolve,Math.round((80+Math.random()*170)*(attempt+1))));
export async function withViralWriteRetry(method,operation,{pause=defaultPause}={}){
 const limit=RETRY_LIMITS[method]||1;
 for(let attempt=0;;attempt++){
  try{return await operation();}
  catch(error){
   if(!(error instanceof ViralVersionConflict)||attempt>=limit-1)throw error;
   await pause(attempt);
  }
 }
}
export const withIdeaApprovalRetry=withViralWriteRetry;
