// Drain the existing atomic three-row claims within one bounded cron request.
// Failed/deferred rows remain stored; historical holds are never selected here.
export async function drainNotifications({claim,send,markSent,markFailed,defer,now=Date.now,sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms)),deadline=now()+45000,maxMessages=60}){
 const attempted=new Set(),chatAt=new Map();let sent=0,failed=0,deferred=0,globalAt=0,stop=false;
 while(!stop&&attempted.size<maxMessages&&now()+12000<deadline){
  const rows=await claim();if(!rows?.length)break;
  for(const row of rows){
   const chat=String(row.chat_id),wait=Math.max(0,(chatAt.get(chat)||0)-now(),globalAt-now());
   if(stop||attempted.has(row.id)||attempted.size>=maxMessages||now()+wait+12000>=deadline){await defer(row);deferred++;stop=true;continue;}
   if(wait)await sleep(wait);
   attempted.add(row.id);chatAt.set(chat,now()+(chat.startsWith('-')?3100:1100));globalAt=now()+40;
   try{await send(row);}catch(error){await markFailed(row,error);failed++;continue;}
   // A database acknowledgement failure must not cause an immediate re-send.
   await markSent(row);sent++;
  }
 }
 return {sent,failed,deferred};
}
