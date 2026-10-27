import test from 'node:test';
import assert from 'node:assert/strict';
import {archiveCandidates,rawRows,parseRaw,reportRows,preparePrune,overlayAttendance,selectArchive,hash,vnDay} from '../attendance-archive.mjs';
import {createRuntime,initializeData} from '../runtime.mjs';
const h=['id','telegram_id','date','check_in','check_out','work_minutes','late_minutes','in_context','out_context'];
const row=(id,date='2026-10-26',end='2026-10-26T10:00:00Z',context='')=>[id,'123',date,'2026-10-26T01:00:00Z',end,450,0,context,''];
function fixture(){return {books:{main:{Attendance:[h,row('done'),row('today','2026-10-27'),row('open','2026-10-26',''),row('pending','2026-10-26',undefined,JSON.stringify({status:'pending'})),row('invalid','2026-10-26',undefined,'{')],'Chấm công HR':[['Ngày'],['old']]}}};}
test('only historical, checked-out, approved rows can leave live state',()=>{
 assert.deepEqual(archiveCandidates(fixture().books.main.Attendance,'2026-10-27').map(r=>r[0]),['done']);
 assert.equal(vnDay(new Date('2026-10-26T18:00:00Z')),'2026-10-27');
});
test('raw backup round-trips all values and catches changed values/IDs',()=>{
 const grid=fixture().books.main.Attendance,raw=rawRows(grid);assert.deepEqual(parseRaw(raw),grid);
 const edited=structuredClone(raw);edited[2][1]='[]';assert.throws(()=>parseRaw(edited));
 const id=structuredClone(raw);id[2][0]='other';assert.throws(()=>parseRaw(id));
 assert.throws(()=>rawRows([h,row('x'),row('x')]));
});
test('prune requires exact readback and leaves input, open/pending/today untouched',()=>{
 const data=fixture(),before=structuredClone(data),grid=data.books.main.Attendance;
 const result=preparePrune(data,grid,'2026-10-27');
 assert.equal(result.moved,1);assert.equal(result.retained,4);assert.deepEqual(data,before);
 assert.deepEqual(selectArchive(grid,result.next.attendanceArchive),[h,row('done')]);
 assert.equal(result.next.books.main['Chấm công HR'].length,1);
 const stale=structuredClone(grid);stale[1][5]=451;assert.throws(()=>preparePrune(data,stale,'2026-10-27'));
});
test('runtime can read archived records without persisting them again',()=>{
 const data=fixture(),grid=data.books.main.Attendance,result=preparePrune(data,grid,'2026-10-27');
 const archive=selectArchive(grid,result.next.attendanceArchive),view=overlayAttendance(result.next,archive);
 assert.equal(view.input.books.main.Attendance.length,6);
 const output=structuredClone(view.input);output.books.main.Attendance.push(row('new','2026-10-28'));
 const persisted=view.strip(output);
 assert.equal(persisted.books.main.Attendance.some(r=>r[0]==='done'),false);
 assert.equal(persisted.books.main.Attendance.some(r=>r[0]==='new'),true);
 const edited=structuredClone(view.input);edited.books.main.Attendance.find(r=>r[0]==='done')[5]=123;assert.throws(()=>view.strip(edited));
});
test('repeat pruning is idempotent, existing archive integrity stays required',()=>{
 const data=fixture(),grid=data.books.main.Attendance,first=preparePrune(data,grid,'2026-10-27');
 const second=preparePrune(first.next,grid,'2026-10-27');assert.equal(second.moved,0);assert.equal(second.archived,1);
 assert.equal(hash(second.next.books.main.Attendance),hash(first.next.books.main.Attendance));
 const corrupt=structuredClone(grid);corrupt[1][5]=0;assert.throws(()=>preparePrune(first.next,corrupt,'2026-10-27'));
});
test('report resolves names, preserves stored minutes, converts UTC and marks unmatched people',()=>{
 const people=[['telegram_id','name','employee_code','department'],['123','Nhân viên A','NV01','Content']];
 const report=reportRows([h,row('done'),[...row('missing')].map((v,i)=>i===1?'456':v)],people);
 const a=report.find(r=>r[11]==='done');assert.equal(a[2],'Nhân viên A');assert.equal(a[4],'08:00:00');assert.equal(a[5],'17:00:00');assert.equal(a[7],450);
 assert.equal(report.find(r=>r[11]==='missing')[2],'Chưa đối chiếu tên');
});
test('actual monthly performance and attendance reports stay identical after archiving',()=>{
 const data=initializeData();
 data.books.main.Employees=[['telegram_id','name','department','role','active'],['123','Nhân viên A','Content','employee',true],['999','Giám đốc','Content','director',true]];
 data.books.main.Attendance=[h,row('done')];
 const settings=data.books.main.Settings,field=settings.find(r=>r[0]==='field_attendance_enabled');if(field)field[1]='true';else settings.push(['field_attendance_enabled','true']);
 const full=createRuntime(data,{employeeId:'999'}),beforePerf=full.run('performance_',['2026-10'],true),beforeReport=full.run('fieldAttendanceReport',['supabase','2026-10']);
 const pruned=preparePrune(data,data.books.main.Attendance,'2026-10-27'),view=overlayAttendance(pruned.next,selectArchive(data.books.main.Attendance,pruned.next.attendanceArchive));
 const daily=createRuntime(pruned.next,{employeeId:'999'});
 assert.equal(JSON.stringify(daily.run('performance_',['2026-10'],true)),JSON.stringify(beforePerf));
 const runtime=createRuntime(view.input,{employeeId:'999'});
 assert.equal(JSON.stringify(runtime.run('performance_',['2026-10'],true)),JSON.stringify(beforePerf));
 assert.equal(JSON.stringify(runtime.run('fieldAttendanceReport',['supabase','2026-10'])),JSON.stringify(beforeReport));
 view.strip(runtime.data);assert.equal(runtime.data.books.main.Attendance.length,1);
});
