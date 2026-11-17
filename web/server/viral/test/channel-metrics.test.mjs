import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';
import {initializeData,createRuntime} from '../runtime.mjs';
import {scopeForMethod,scopeConfig,projectState,ReadScopeMiss} from '../state-scopes.mjs';

const DIR='1000',LEAD='1001',VJ='1010',VJ2='1011',STAFF='1012';
const at=s=>Date.parse(s+'+07:00');                       // Vietnam local time -> ms
// Week of Monday 2026-11-09 .. Sunday 2026-11-15; entry window: Sun 15/11 18:00 -> Mon 16/11 23:59.
const WEEK='2026-11-09';
function app(){
 let data=initializeData();const e=data.books.main.Employees,h=e[0];
 for(const [id,name,role,job] of [[DIR,'Giám đốc','director','Giám đốc'],[LEAD,'Leader Lan','leader','Leader Content'],[VJ,'VJ Cường','employee','VJ'],[VJ2,'VJ Hoa','employee','VJ'],[STAFF,'Editor Em','employee','Editor']])e.push(h.map(k=>({telegram_id:id,name,department:'Content',role,job_title:job,active:'true'}[k]||'')));
 let now=at('2026-11-12T10:00:00');
 const runtime=who=>{const rt=createRuntime(data,who?{employeeId:who}:null);vm.runInContext('cmNow_=function(){return '+now+'}',rt.context);return rt;};
 const as=who=>(method,...args)=>{const rt=runtime(who);const out=rt.run(method,['supabase',...args]);data=rt.data;return out;};
 as(LEAD)('createV20Project','VN','Viral');as(LEAD)('createV20Project','DN','Đà Nẵng');
 const scheduler=()=>{const rt=runtime(null);rt.run('v16Scheduler',[],true);data=rt.data;};
 return {as,scheduler,runtime,set now(v){now=typeof v==='number'?v:at(v);},get data(){return data;}};
}
const addChannel=(a,over={})=>a.as(LEAD)('saveProjectChannel',{project_code:'VN',platform:'TikTok',name:'@viral.vn',vj_id:VJ,...over}).channel_id;
const week=(over={})=>({period_type:'week',period:WEEK,views:'12.345',likes:'800',comments:'45',...over});
const metricRows=data=>{const s=data.books.main.ChannelMetrics||[];return s.slice(1).map(r=>Object.fromEntries(s[0].map((k,i)=>[k,r[i]])));};
const notes=data=>{const n=data.books.main.Notifications;return n.slice(1).map(r=>({key:String(r[1]),to:String(r[2]),text:String(r[3])}));};

test('only Leaders and Directors manage channels; every change is audited',()=>{
 const a=app();
 assert.throws(()=>a.as(VJ)('saveProjectChannel',{project_code:'VN',platform:'TikTok',name:'x',vj_id:VJ}),/Leader hoặc Ban giám đốc/);
 const id=addChannel(a);assert.ok(id);
 addChannel(a,{platform:'YouTube',name:'Viral Daily',vj_id:VJ2});
 assert.throws(()=>addChannel(a),/đã có trong dự án/,'no duplicate active channel');
 assert.throws(()=>addChannel(a,{name:'k',vj_id:'9999'}),/VJ phụ trách/);
 assert.throws(()=>addChannel(a,{name:'k',platform:'Zalo'}),/nền tảng/);
 const ch=a.as(DIR)('channelMetricsScreen').channels.find(c=>c.id===id);
 assert.throws(()=>a.as(DIR)('saveProjectChannel',{id,vj_id:VJ2,revision:'stale'}),/vừa được người khác cập nhật/);
 a.as(DIR)('saveProjectChannel',{id,vj_id:VJ2,revision:ch.revision});
 const ch2=a.as(DIR)('channelMetricsScreen').channels.find(c=>c.id===id);a.as(LEAD)('saveProjectChannel',{id,active:false,revision:ch2.revision});
 const audit=a.data.books.main.ChannelMetricsAudit,h=audit[0],actions=audit.slice(1).filter(r=>r[h.indexOf('channel_id')]===id).map(r=>r[h.indexOf('action')]);
 assert.deepEqual([...actions],['channel_create','channel_reassign','channel_deactivate']);
 assert.ok(notes(a.data).some(n=>n.to===VJ2&&/ĐƯỢC GIAO KÊNH/.test(n.text)),'the new VJ is told');
 assert.equal(a.as(DIR)('channelMetricsScreen').channels.find(c=>c.id===id).active,false);
});

test('a VJ sees only own channels; only the assigned VJ (or a manager) can enter numbers',()=>{
 const a=app(),mine=addChannel(a),other=addChannel(a,{platform:'Facebook',name:'Viral FB',vj_id:VJ2});a.now='2026-11-15T19:00:00';
 const s=a.as(VJ)('channelMetricsScreen');assert.deepEqual([...s.myChannels].map(c=>c.id),[mine]);assert.equal(s.isManager,false);assert.equal(s.channels,undefined,'no company list for a VJ');
 assert.throws(()=>a.as(VJ)('submitChannelMetrics',{channel_id:other,...week()}),/Chỉ VJ phụ trách/);
 assert.throws(()=>a.as(STAFF)('submitChannelMetrics',{channel_id:mine,...week()}),/Chỉ VJ phụ trách/);
 assert.throws(()=>a.as(VJ)('channelMetricsReport',{}),/Leader hoặc Ban giám đốc/);
 assert.equal(a.as(STAFF)('channelMetricsScreen').myChannels.length,0);
 assert.ok(a.as(LEAD)('channelMetricsReport',{}).rows.length===2);
});

test('weekly window: from 18:00 Sunday to 23:59 Monday; after that only a Leader can edit, and it is logged',()=>{
 const a=app(),id=addChannel(a);
 a.now='2026-11-15T17:59:00';assert.throws(()=>a.as(VJ)('submitChannelMetrics',{channel_id:id,...week()}),/Chưa đến giờ nhập/);
 assert.throws(()=>a.as(LEAD)('submitChannelMetrics',{channel_id:id,...week()}),/Chưa đến giờ nhập/,'nobody enters a week before it ends');
 a.now='2026-11-15T18:00:00';assert.equal(a.as(VJ)('channelMetricsScreen').myChannels[0].week.status,'open');
 a.as(VJ)('submitChannelMetrics',{channel_id:id,...week()});
 const r=a.as(VJ)('channelMetricsScreen').myChannels[0].week;assert.equal(r.status,'done');assert.equal(r.record.values.views,12345,'dot thousands separator accepted');
 a.now='2026-11-16T23:59:00';a.as(VJ)('submitChannelMetrics',{channel_id:id,...week({views:'13000',revision:r.record.revision})});
 a.now='2026-11-17T00:00:00';
 const rev=a.as(VJ)('channelMetricsScreen').myChannels[0];
 assert.equal(rev.week.period,WEEK,'until next Sunday 18:00 the screen still shows last week');
 assert.throws(()=>a.as(VJ)('submitChannelMetrics',{channel_id:id,...week({views:'1',revision:rev.week.record.revision})}),/quá hạn/);
 a.as(LEAD)('submitChannelMetrics',{channel_id:id,...week({views:'14000',revision:rev.week.record.revision})});
 assert.equal(metricRows(a.data)[0].views,14000);
 const audit=a.data.books.main.ChannelMetricsAudit,h=audit[0],last=audit.at(-1);
 assert.equal(last[h.indexOf('action')],'metrics_update_by_manager');assert.equal(last[h.indexOf('actor')],LEAD);
 assert.equal(JSON.parse(last[h.indexOf('before_json')]).views,13000);assert.equal(JSON.parse(last[h.indexOf('after_json')]).views,14000);
 // A week that is overdue and was never entered shows as overdue.
 const b=app(),id2=addChannel(b);b.now='2026-11-17T09:00:00';assert.equal(b.as(VJ)('channelMetricsScreen').myChannels[0].week.status,'overdue');
});

test('submitting the same channel and week again updates one record instead of adding another',()=>{
 const a=app(),id=addChannel(a);a.now='2026-11-15T20:00:00';
 a.as(VJ)('submitChannelMetrics',{channel_id:id,...week()});
 assert.throws(()=>a.as(VJ)('submitChannelMetrics',{channel_id:id,...week()}),/đã có số liệu/,'a second blind submit must not overwrite');
 assert.throws(()=>a.as(VJ)('submitChannelMetrics',{channel_id:id,...week({revision:7})}),/vừa được cập nhật/);
 a.as(VJ)('submitChannelMetrics',{channel_id:id,...week({views:'20.000',shares:'5',revision:1})});
 const rows=metricRows(a.data);assert.equal(rows.length,1);assert.equal(rows[0].views,20000);assert.equal(rows[0].shares,5);assert.equal(rows[0].revision,2);
});

test('numbers must be non-negative integers; view, like and comment are required',()=>{
 const a=app(),id=addChannel(a);a.now='2026-11-15T20:00:00';
 for(const [over,re] of [[{views:''},/Cần nhập View/],[{likes:''},/Cần nhập Tim/],[{comments:''},/Cần nhập Bình luận/],[{views:'-5'},/số nguyên không âm/],[{views:'1,5'},/số nguyên không âm/],[{shares:'abc'},/số nguyên không âm/],[{period:'2026-11-10'},/Tuần không hợp lệ/]])
  assert.throws(()=>a.as(VJ)('submitChannelMetrics',{channel_id:id,...week(over)}),re);
 a.as(VJ)('submitChannelMetrics',{channel_id:id,...week({shares:'',followers:'1 200'})});
 const r=metricRows(a.data)[0];assert.equal(r.shares,'');assert.equal(r.followers,1200);
});

test('monthly window: last day of the month to the end of day 2; official figures replace the estimate',()=>{
 const a=app(),id=addChannel(a),month=over=>({period_type:'month',period:'2026-11',views:'90000',likes:'5000',comments:'300',...over});
 a.now='2026-11-29T23:00:00';assert.throws(()=>a.as(VJ)('submitChannelMetrics',{channel_id:id,...month()}),/Chưa đến giờ nhập/);
 a.now='2026-11-30T08:00:00';assert.equal(a.as(VJ)('channelMetricsScreen').month.period,'2026-11');
 a.now='2026-12-02T23:00:00';assert.equal(a.as(VJ)('channelMetricsScreen').month.period,'2026-11');a.as(VJ)('submitChannelMetrics',{channel_id:id,...month()});
 a.now='2026-12-03T00:00:00';assert.equal(a.as(VJ)('channelMetricsScreen').month,null);
 assert.throws(()=>a.as(VJ)('submitChannelMetrics',{channel_id:id,...month({revision:1})}),/quá hạn/);
 const r=a.as(LEAD)('channelMetricsReport',{mode:'month',period:'2026-11'}).rows[0];assert.equal(r.source,'official');assert.equal(r.values.views,90000);
});

test('the monthly estimate splits a week across two months by its days in each month',()=>{
 const a=app(),id=addChannel(a);
 // Week Mon 28/09 - Sun 04/10: 3 days in September, 4 in October. Week 05/10 - 11/10 is fully in October.
 for(const [w,views,shares] of [['2026-09-28','700','70'],['2026-10-05','1400','']]){
  a.now=at(new Date(Date.parse(w+'T00:00:00Z')+6*864e5).toISOString().slice(0,10)+'T20:00:00');
  a.as(VJ)('submitChannelMetrics',{channel_id:id,period_type:'week',period:w,views,likes:'7',comments:'7',shares});
 }
 a.now='2026-10-20T10:00:00';
 const oct=a.as(LEAD)('channelMetricsReport',{mode:'month',period:'2026-10'}),sep=a.as(LEAD)('channelMetricsReport',{mode:'month',period:'2026-09'});
 assert.equal(oct.rows[0].source,'estimate');assert.equal(oct.rows[0].values.views,400+1400,'4/7 of 700 + all of 1400');
 assert.equal(oct.rows[0].values.shares,40,'optional fields use only weeks that have them');
 assert.equal(sep.rows[0].values.views,300,'3/7 of 700');assert.equal(sep.rows[0].values.likes,3);
 assert.equal(oct.rows[0].change.views,500,'October vs September estimate: +500%');
 assert.ok(oct.rows[0].weeks_used===2&&oct.rows[0].weeks_total===5);
 // Week mode compares with the previous week and lists channels still missing.
 a.now='2026-10-13T09:00:00';const wk=a.as(LEAD)('channelMetricsReport',{mode:'week',period:'2026-10-05'});
 assert.equal(wk.rows[0].values.views,1400);assert.equal(wk.rows[0].previous.values.views,700);assert.equal(wk.rows[0].change.views,100);
 addChannel(a,{platform:'Facebook',name:'Viral FB',vj_id:VJ2});
 assert.deepEqual([...a.as(LEAD)('channelMetricsReport',{mode:'week',period:'2026-10-05'}).missing].map(c=>c.name),['Viral FB']);
 assert.equal(a.as(LEAD)('channelMetricsReport',{mode:'week',period:'2026-10-05',vj:VJ}).missing.length,0,'filters apply');
});

test('reminders: Sunday 19:00, Monday 12:00, Tuesday 09:00 to Leaders, month end and day 2; never twice',()=>{
 const a=app(),done=addChannel(a),todo=addChannel(a,{platform:'YouTube',name:'Viral YT',vj_id:VJ2});
 const count=(re,to)=>notes(a.data).filter(n=>re.test(n.key)&&(!to||n.to===to)).length;
 a.now='2026-11-15T18:30:00';a.scheduler();assert.equal(count(/^channel-metrics:week:/),0,'not before 19:00');
 a.as(VJ)('submitChannelMetrics',{channel_id:done,...week()});
 a.now='2026-11-15T19:00:00';a.scheduler();a.now='2026-11-15T19:40:00';a.scheduler();
 assert.equal(count(/:sun:/,VJ2),1,'one Sunday reminder');assert.equal(count(/:sun:/,VJ),0,'nothing for a VJ who already entered');
 assert.ok(notes(a.data).find(n=>/:sun:/.test(n.key)).text.includes('Viral YT'));
 a.now='2026-11-15T20:30:00';a.scheduler();a.now='2026-11-16T11:59:00';a.scheduler();assert.equal(count(/:mon:/),0,'nothing outside 08:00-20:00 or before Monday 12:00');
 a.now='2026-11-16T12:00:00';a.scheduler();a.now='2026-11-16T15:00:00';a.scheduler();assert.equal(count(/:mon:/,VJ2),1);
 a.now='2026-11-17T09:00:00';a.scheduler();a.scheduler();assert.equal(count(/:leaders:/,LEAD),1,'Leader gets the missing list once');assert.equal(count(/:leaders:/,DIR),0);
 assert.ok(notes(a.data).find(n=>/:leaders:/.test(n.key)).text.includes('VJ Hoa'));
 a.now='2026-11-30T08:59:00';a.scheduler();assert.equal(count(/^channel-metrics:month:/),0);
 a.now='2026-11-30T09:00:00';a.scheduler();a.now='2026-11-30T16:00:00';a.scheduler();
 a.now='2026-12-02T09:30:00';a.scheduler();a.scheduler();
 assert.equal(count(/:month:2026-11:last:/,VJ),1);assert.equal(count(/:month:2026-11:last:/,VJ2),1);assert.equal(count(/:month:2026-11:day2:/,VJ2),1);
 assert.ok(!notes(a.data).some(n=>/^channel-metrics:/.test(n.key)&&/\d{1,3}\.\d{3}/.test(n.text)),'no figures in messages');
});

test('reading the screen or the report never creates tables or changes data',()=>{
 const a=app(),before=JSON.stringify(a.data);
 for(const who of [DIR,LEAD,VJ,STAFF]){const rt=a.runtime(who);rt.run('channelMetricsScreen',['supabase']);if(who===DIR||who===LEAD){rt.run('channelMetricsReport',['supabase',{}]);rt.run('channelMetricsReport',['supabase',{mode:'month'}]);}
  assert.equal(JSON.stringify(rt.data),before,who+' read changed the data');assert.equal(rt.data.books.main.ProjectChannels,undefined);}
});

test('channel screens read only their own tables and match a full read for every role',()=>{
 const a=app();addChannel(a);a.now='2026-11-15T19:00:00';
 const id=addChannel(a,{platform:'Facebook',name:'FB',vj_id:VJ2});a.as(VJ2)('submitChannelMetrics',{channel_id:id,...week()});
 for(const method of ['channelMetricsScreen','channelMetricsReport']){
  const scope=scopeForMethod(method);assert.equal(scope,'channels');
  for(const who of [DIR,LEAD,VJ,VJ2,STAFF]){
   const run=rt=>{vm.runInContext('cmNow_=function(){return '+at('2026-11-15T19:00:00')+'}',rt.context);try{return JSON.stringify(rt.run(method,['supabase']));}catch(e){if(e instanceof ReadScopeMiss)throw Error(method+' needs '+e.table);return 'ERR '+e.message;}};
   assert.equal(run(createRuntime(projectState(a.data,scope),{employeeId:who},{READ_TABLES:scopeConfig(scope).tables})),run(createRuntime(a.data,{employeeId:who})),method+' '+who);
  }
 }
});

test('screenshots: stored privately, visible to the channel VJ and managers only',()=>{
 const a=app(),id=addChannel(a);a.now='2026-11-15T20:00:00';
 const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
 a.as(VJ)('submitChannelMetrics',{channel_id:id,...week({image:{type:'image/png',base64:png}})});
 const m=metricRows(a.data)[0];assert.ok(m.screenshot_file_id);assert.equal(a.data.files[m.screenshot_file_id].folder,'channel-metrics');
 const file=(who)=>{const rt=a.runtime(who);return rt.run('channelMetricScreenshotFile_',['supabase',m.id],true);};
 assert.equal(file(VJ),m.screenshot_file_id);assert.equal(file(LEAD),m.screenshot_file_id);
 assert.throws(()=>file(VJ2),/không được xem/);assert.throws(()=>file(STAFF),/không được xem/);
 assert.ok(a.as(VJ)('channelMetricsScreen').myChannels[0].week.record.has_screenshot);
});

test('Excel export: summary with previous period and change, missing channels, estimate labelled',async()=>{
 const {channelMetricsWorkbook}=await import('../channel-metrics-excel.mjs'),ExcelJS=(await import('exceljs')).default;
 const a=app(),id=addChannel(a);addChannel(a,{platform:'Facebook',name:'Viral FB',vj_id:VJ2});
 a.now='2026-11-08T20:00:00';a.as(VJ)('submitChannelMetrics',{channel_id:id,period_type:'week',period:'2026-11-02',views:'1000',likes:'10',comments:'1'});
 a.now='2026-11-15T20:00:00';a.as(VJ)('submitChannelMetrics',{channel_id:id,...week({views:'1.500'})});
 const file=await channelMetricsWorkbook(a.as(LEAD)('channelMetricsReport',{mode:'week',period:WEEK}));
 assert.equal(file.filename,'so-lieu-kenh-week-'+WEEK+'.xlsx');
 const wb=new ExcelJS.Workbook();await wb.xlsx.load(Buffer.from(file.base64,'base64'));
 const sheet=wb.getWorksheet('Tổng hợp'),rows=[];sheet.eachRow(r=>rows.push(r.values.slice(1)));
 const header=rows[2],row=rows.find(r=>r[2]==='@viral.vn');
 assert.equal(row[header.indexOf('View')],1500);assert.equal(row[header.indexOf('View kỳ trước')],1000);assert.equal(row[header.indexOf('View tăng/giảm')],0.5);
 assert.equal(rows.at(-1)[0],'Tổng cộng');
 const missing=[];wb.getWorksheet('Kênh chưa nhập').eachRow(r=>missing.push(r.values[3]));assert.deepEqual(missing,['Kênh','Viral FB']);
 a.now='2026-11-20T10:00:00';const month=await channelMetricsWorkbook(a.as(LEAD)('channelMetricsReport',{mode:'month',period:'2026-11'}));
 const wb2=new ExcelJS.Workbook();await wb2.xlsx.load(Buffer.from(month.base64,'base64'));const r2=[];wb2.getWorksheet('Tổng hợp').eachRow(r=>r2.push(r.values.slice(1)));
 assert.equal(r2.find(r=>r[2]==='@viral.vn')[5],'Ước tính');
});
