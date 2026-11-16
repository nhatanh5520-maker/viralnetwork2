import test from 'node:test';import assert from 'node:assert/strict';
import vm from 'node:vm';
import {newNotificationEvents,trimNotifications,pendingNotificationEvents,trimCandidates} from '../notification-store.mjs';
import {initializeData,createRuntime} from '../runtime.mjs';

const H=['id','event_key','telegram_id','message','status','created_at','sent_at','error','photo_file_id','attempts','next_attempt_at'];
const DAY=86400000,now=Date.parse('2026-11-16T03:00:00Z'),ago=d=>new Date(now-d*DAY).toISOString();
const sheet=()=>[H,
 ['n1','task:1','1001','Tin cũ đã gửi','sent',ago(10),ago(10),'old error','',1,''],
 ['n2','task:2','1001','Tin mới đã gửi','sent',ago(1),ago(1),'','',1,''],
 ['n3','task:3','1001','Tin cũ chưa gửi','pending',ago(10),'','','',0,''],
 ['n4','task:4','1001','Tin cũ lỗi','failed',ago(10),'','timeout','',8,''],
 ['n5','task:5','1001','','sent',ago(10),ago(10),'','',1,''],
];

test('trim clears only the text of notifications delivered more than 3 days ago',()=>{
 const before=sheet(),out=trimNotifications(before,{now});
 assert.equal(out.trimmed,1);
 assert.deepEqual(out.sheet[1],['n1','task:1','1001','','sent',ago(10),ago(10),'','',1,''],'text and error cleared, id/key/recipient/status kept');
 assert.deepEqual(out.sheet.slice(2),before.slice(2),'recent, unsent, failed and already-empty rows untouched');
 assert.equal(before[1][3],'Tin cũ đã gửi','input not modified');
 assert.equal(trimNotifications(out.sheet,{now}),null,'nothing left to trim');
 assert.equal(trimCandidates(before,{now}),2,'n1 sent + n3 pending (status not yet reconciled)');
});

test('after trimming, the business code still recognizes old events and does not queue them again',()=>{
 let data=initializeData();const e=data.books.main.Employees,h=e[0];
 for(const [id,role] of [['1001','leader'],['1002','employee']])e.push(h.map(k=>({telegram_id:id,name:'NV '+id,department:'Content',role,active:'true'}[k]||'')));
 const rt=createRuntime(data,{employeeId:'1001'});
 const queue=()=>vm.runInContext("queueNotification_('reminder:old-event','1002','Nhắc việc');",rt.context);
 queue();
 const n=rt.data.books.main.Notifications,c=n[0].indexOf('status'),t=n[0].indexOf('created_at');
 n[1][c]='sent';n[1][t]=ago(10);
 const cut=trimNotifications(n,{now});assert.equal(cut.trimmed,1);rt.data.books.main.Notifications=cut.sheet;
 const again=createRuntime(rt.data,{employeeId:'1001'});vm.runInContext("queueNotification_('reminder:old-event','1002','Nhắc việc');",again.context);
 assert.equal(again.data.books.main.Notifications.length,2,'same event key: not queued twice');
});

test('a save hands over only the notifications it created or re-queued',()=>{
 const base={outbox:[{id:'o-old',chatId:'1',text:'x',status:'pending'}],books:{main:{Notifications:sheet()}}};
 const next=structuredClone(base);
 next.outbox.push({id:'o-new',chatId:'2',text:'y',status:'pending'});
 next.books.main.Notifications.push(['n6','task:6','1002','Tin mới','pending',ago(0),'','','',0,'']);
 next.books.main.Notifications[4][4]='pending';                  // n4 re-queued (failed -> pending)
 const ids=newNotificationEvents(base,next).map(e=>e.id).sort();
 assert.deepEqual(ids,['notification:n4','notification:n6','o-new'],'old pending n3 and old outbox o-old are left to the cron');
 assert.deepEqual(newNotificationEvents(base,structuredClone(base)),[],'a save without new notifications sends no events');
});

test('the cron safety net queues every pending notification, optionally only recent ones',()=>{
 const data={outbox:[{id:'o1',chatId:'1',text:'x',status:'pending'}],books:{main:{Notifications:[...sheet(),['n6','task:6','1002','Tin mới','pending',ago(0),'','','',0,'']]}}};
 assert.deepEqual(pendingNotificationEvents(data).map(e=>e.id).sort(),['notification:n3','notification:n4','notification:n6','o1']);
 assert.deepEqual(pendingNotificationEvents(data,{since:now-2*DAY}).map(e=>e.id).sort(),['notification:n6','o1']);
 const e=pendingNotificationEvents(data).find(x=>x.id==='notification:n6');assert.equal(e.chat_id,'1002');assert.equal(e.text,'Tin mới');
});
