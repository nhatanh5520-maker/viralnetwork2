import {ViralStateReadError} from './state-read.mjs';
// One queue per server process, not a distributed lock. CAS still protects
// against other processes; each operation loads fresh data after acquiring it.
export function attendanceQueue({now=Date.now,maxWait=15000}={}){
 let tail=Promise.resolve();
 return function(method,operation){
  if(!['attendance','fieldAttendance'].includes(method))return operation();
  const began=now(),result=tail.then(()=>{
   if(now()-began>=maxWait)throw new ViralStateReadError('ATTENDANCE_BUSY','Có nhiều lượt chấm công đang xử lý. Lượt này chưa ghi nhận; vui lòng thử lại.');
   return operation();
  });
  tail=result.then(()=>{},()=>{});return result;
 };
}
