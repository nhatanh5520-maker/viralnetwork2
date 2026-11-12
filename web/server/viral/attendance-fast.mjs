import {statePatch} from './state-commit.mjs';
// Check-in/out touch a single row of Attendance. Instead of replacing the
// whole JSON under optimistic version checks (which fails when many people
// clock in at the same minute), send just that row to viral_attendance_apply.
// The SQL function locks the state row, re-checks the business rule against the
// current database (one row per employee per day; check-out only once, only on
// the exact check-in row this request saw) and appends/updates that row.
//
// Returns null whenever the change is not exactly one attendance row; the caller
// then uses the normal commit path, which keeps the original behaviour.
export function attendanceChange(before,after,{kind,employeeId}){
 if(!['in','out'].includes(kind))return null;
 // createRuntime adds these keys when missing; that alone is not a change.
 const seen={...before};seen.books??={};seen.properties??={};seen.files??={};seen.outbox??=[];
 const ops=statePatch(seen,after);
 if(!ops||ops.length!==1||ops[0].path.join('.')!=='books.main.Attendance')return null;
 const a=before?.books?.main?.Attendance,b=after?.books?.main?.Attendance;
 if(!Array.isArray(a)||!Array.isArray(b)||!a.length||JSON.stringify(a[0])!==JSON.stringify(b[0]))return null;
 const rowFor=row=>Array.isArray(row)&&String(row[1])===String(employeeId)&&/^\d{4}-\d{2}-\d{2}$/.test(String(row[2]).slice(0,10));
 if(kind==='in'){
  if(b.length!==a.length+1)return null;
  for(let i=0;i<a.length;i++)if(JSON.stringify(a[i])!==JSON.stringify(b[i]))return null;
  const row=b[b.length-1];if(!rowFor(row))return null;
  return {kind,employeeId:String(employeeId),workDate:String(row[2]).slice(0,10),newRow:JSON.parse(JSON.stringify(row)),expectedRow:null};
 }
 if(b.length!==a.length)return null;
 let index=-1;
 for(let i=1;i<a.length;i++)if(JSON.stringify(a[i])!==JSON.stringify(b[i])){if(index>=0)return null;index=i;}
 if(index<0||!rowFor(a[index])||!rowFor(b[index])||String(a[index][0])!==String(b[index][0]))return null;
 return {kind,employeeId:String(employeeId),workDate:String(b[index][2]).slice(0,10),newRow:JSON.parse(JSON.stringify(b[index])),expectedRow:JSON.parse(JSON.stringify(a[index]))};
}

let available=true;
export function resetAttendanceFastPath(){available=true;}
// rpc(name,args) => {data,error}. Returns {applied:true,version} on success,
// {applied:false} when the normal path must decide (already done, data moved,
// function not installed yet). Throws only when the outcome is uncertain.
export async function applyAttendance(rpc,change){
 if(!available||!change)return {applied:false};
 let result;
 try{result=await rpc('viral_attendance_apply',{p_kind:change.kind,p_employee:change.employeeId,p_date:change.workDate,p_new_row:change.newRow,p_expected_row:change.expectedRow});}
 catch(error){const e=Error('uncertain');e.uncertain=true;throw e;}
 if(result?.error){
  const code=String(result.error.code||'');
  if(['PGRST202','42883'].includes(code)){available=false;return {applied:false};}
  if(code==='P0001')return {applied:false};
  const e=Error('uncertain');e.uncertain=true;throw e;
 }
 const status=result?.data?.status;
 if(status==='ok')return {applied:true,version:Number(result.data.version)};
 return {applied:false,status};
}
