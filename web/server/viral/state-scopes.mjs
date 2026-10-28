// Server-owned profiles. Browser input never chooses columns or cached data.
const common=['Employees','Settings'];
const production=['Projects','ProductionItems','ProductionTeam','ProductionTaskLinks','Tasks','Shoots','ShootAcks','UserAvatars'];
const attendance=['Attendance','Schedule','AttendanceApprovers'];
const news=['Announcements','PostComments','PostLikes'];
const core=[...common,...production,...attendance,...news,'Ideas','Meetings','Leave','Overtime','OvertimeRequests','Expenses','ExpenseAttachments','EquipmentLoans','PaymentBatches'];
const unique=values=>Object.freeze([...new Set(values)]);
export const READ_SCOPES=Object.freeze({
 attendance:{tables:unique([...common,...attendance,'OvertimeRequests'])},
 production:{tables:unique([...common,...production])},
 home:{tables:unique([...common,...production,...attendance])},
 core:{tables:unique(core)},
 manager:{tables:unique([...common,...attendance,...news,'Tasks','Leave','Overtime','OvertimeRequests'])},
 review:{tables:unique(core)},
 expenses:{tables:unique([...common,...production,'Expenses','ExpenseAttachments','PaymentBatches'])},
 avatars:{tables:unique([...common,'UserAvatars'])},
 personnel:{tables:unique(common)},
 projectFile:{tables:unique([...common,'Projects']),files:true},
 avatarFile:{tables:unique([...common,'UserAvatars']),files:true},
 scheduler:{tables:unique([...common,...production,...attendance,'Notifications'])},
 deliveryFiles:{tables:unique([]),files:true},
});
const methods=Object.freeze({
 snapshotAttendance:'attendance',attendanceStatus:'attendance',managerAttendanceDay:'attendance',fieldReviewData:'attendance',fieldAttendanceReport:'attendance',fieldConfig:'attendance',
 productionPage:'production',productionScreen:'production',staffProductionWorkload:'production',
 snapshotHome:'home',snapshotCore:'core',snapshotManager:'manager',reviewQueue:'review',
 accountingExpenses:'expenses',avatarBatch:'avatars',personnelDirectory:'personnel',
});
export function scopeForMethod(method){return Object.hasOwn(methods,method)?methods[method]:null;}
export class ReadScopeMiss extends Error {
 constructor(table){super('Read profile needs full snapshot');this.table=table;}
}
export function scopeConfig(scope){
 if(!Object.hasOwn(READ_SCOPES,scope))throw Error('Unknown server read scope');return READ_SCOPES[scope];
}
export function scopeSelect(scope){
 const config=scopeConfig(scope);
 return ['version','properties:data->properties','archive:data->attendanceArchive',
  ...config.tables.map((name,i)=>`s${i}:data->books->main->${name}`),
  ...(config.files?['files:data->files']:[])].join(',');
}
export function scopedState(row,scope){
 const config=scopeConfig(scope),main={};
 config.tables.forEach((name,i)=>{const grid=row['s'+i];if(grid!=null){if(!Array.isArray(grid))throw Error('Invalid table in read profile');main[name]=grid;}});
 const data={books:{main},properties:row.properties||{},files:config.files?(row.files||{}):{},outbox:[]};
 if(row.archive!=null)data.attendanceArchive=row.archive;
 return {data,version:row.version};
}
// Mirrors server JSON selection for runtime regression tests and measurements.
export function projectState(data,scope){
 const config=scopeConfig(scope),row={properties:data.properties,archive:data.attendanceArchive,files:data.files,version:0};
 config.tables.forEach((name,i)=>{row['s'+i]=data.books?.main?.[name]??null;});
 return structuredClone(scopedState(row,scope).data);
}
