// Telegram notifications live in two places: the Notifications sheet inside the JSON state (the business
// code reads its event_key column to avoid sending the same thing twice) and the viral_outbox table (the
// delivery queue). These helpers keep the JSON copy small without breaking that de-duplication.

const rowsOf=sheet=>{const h=(sheet?.[0]||[]).map(String);return {h,col:k=>h.indexOf(k)};};

/**
 * Events a single save must hand to viral_outbox: notifications created or re-queued by this save only.
 * Older pending rows were already inserted by the save that created them, and the minute cron re-sends
 * every pending row as a safety net, so they do not need to ride along with every check-in.
 */
export function newNotificationEvents(base,next){
 const events=[],known=new Set((base?.outbox||[]).map(x=>String(x?.id)));
 for(const x of next?.outbox||[])if(x?.status==='pending'&&!known.has(String(x.id)))events.push({id:x.id,chat_id:x.chatId,text:x.text,photo_file_id:null});
 const before=base?.books?.main?.Notifications||[],after=next?.books?.main?.Notifications||[],{col}=rowsOf(after);
 const id=col('id'),status=col('status'),to=col('telegram_id'),message=col('message'),photo=col('photo_file_id');
 if(id<0||status<0)return events;
 const {col:bcol}=rowsOf(before),bid=bcol('id'),bstatus=bcol('status'),previous=new Map(before.slice(1).map(r=>[String(r?.[bid]),String(r?.[bstatus]??'')]));
 for(const r of after.slice(1)){
  const s=String(r?.[status]??'');if(!['pending','failed'].includes(s)||!r?.[to])continue;
  const key=String(r[id]);if(previous.has(key)&&previous.get(key)===s)continue;
  events.push({id:'notification:'+key,chat_id:String(r[to]),text:String(r[message]??''),photo_file_id:(photo>=0&&r[photo])||null});
 }
 return events;
}

/**
 * Clears the text of notifications that were delivered more than `keepDays` ago. Rows, ids, event keys,
 * recipients and statuses stay, so the business code still sees them and never re-sends. The text is
 * already stored in viral_outbox. Returns null when there is nothing to trim.
 */
export function trimNotifications(sheet,{now=Date.now(),keepDays=3}={}){
 if(!Array.isArray(sheet)||sheet.length<2)return null;
 const {col}=rowsOf(sheet),status=col('status'),message=col('message'),error=col('error'),created=col('created_at'),sent=col('sent_at');
 if(status<0||message<0||created<0)return null;
 const cutoff=now-keepDays*86400000;let trimmed=0;
 const out=sheet.map((r,i)=>{
  if(!i||!Array.isArray(r)||String(r[status])!=='sent'||!String(r[message]??''))return r;
  const at=Date.parse(String((sent>=0&&r[sent])||r[created]||''));if(!Number.isFinite(at)||at>cutoff)return r;
  const copy=[...r];copy[message]='';if(error>=0)copy[error]='';trimmed++;return copy;
 });
 return trimmed?{sheet:out,trimmed}:null;
}

/** Every notification still waiting to be handed to viral_outbox (optionally only recent ones). */
export function pendingNotificationEvents(data,{since=-Infinity}={}){
 const sheet=data?.books?.main?.Notifications||[],{col}=rowsOf(sheet),id=col('id'),status=col('status'),to=col('telegram_id'),message=col('message'),photo=col('photo_file_id'),created=col('created_at');
 const events=(data?.outbox||[]).filter(x=>x?.status==='pending').map(x=>({id:x.id,chat_id:x.chatId,text:x.text,photo_file_id:null}));
 if(id<0||status<0)return events;
 for(const r of sheet.slice(1)){
  if(!['pending','failed'].includes(String(r?.[status]??''))||!r?.[to])continue;
  const at=Date.parse(String(created>=0?r[created]:''));if(Number.isFinite(at)&&at<since)continue;
  events.push({id:'notification:'+r[id],chat_id:String(r[to]),text:String(r[message]??''),photo_file_id:(photo>=0&&r[photo])||null});
 }
 return events;
}

/** Rows that may be trimmable (older than keepDays, still holding text). Statuses may not be reconciled yet. */
export function trimCandidates(sheet,{now=Date.now(),keepDays=3}={}){
 if(!Array.isArray(sheet)||sheet.length<2)return 0;
 const {col}=rowsOf(sheet),status=col('status'),message=col('message'),created=col('created_at'),cutoff=now-keepDays*86400000;
 if(status<0||message<0||created<0)return 0;
 return sheet.slice(1).filter(r=>['sent','pending'].includes(String(r?.[status]))&&String(r?.[message]??'')&&Date.parse(String(r?.[created]))<=cutoff).length;
}
