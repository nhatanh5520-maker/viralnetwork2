/* Receive only a small revision signal; all data still comes from authorized RPCs. */
(function(){
 let tracker=new ViralChangeTracker(),client,channel,started=false,connecting=false,connected=false,checking=false,applying=false,flushTimer=null,renewTimer=null,lastCheck=0,lastLegacyRefresh=0,ready=null,stopped=false,failures=0,failureView='',needsProductionCore=false,generation=0,identity='';
 function status(value){document.body.dataset.liveData=value;}
 function canRefresh(){return !!state&&tab!=='booking'&&!document.hidden&&!busy&&!refreshing&&!approvalPending&&!approvalFocus&&!window._operationalTarget&&!screenInteractionActive();}
 function banner(){
  const pending=tracker.relevant(tab).size,failed=failures>0&&failureView===tab;let box=$('liveDataUpdate');
  if(!state||!pending||!failed&&canRefresh()){box?.remove();return;}
  if(!box){box=document.createElement('div');box.id='liveDataUpdate';box.className='live-data-update';box.setAttribute('role','status');$('screen')?.before(box);}
  box.textContent=failed?'Chưa tải được dữ liệu mới. Hệ thống đang tự thử lại.':formDirty?'Dữ liệu sẽ tự cập nhật sau khi bạn lưu hoặc hủy phần đang nhập.':'Dữ liệu sẽ tự cập nhật khi bạn hoàn tất thao tác.';
 }
 function invalidate(scopes){if(!scopes.length)return;if(scopes.some(x=>['projects','people','settings'].includes(x)))needsProductionCore=true;pendingReadCalls.clear();corePromise=null;coreReady=false;managerPromise=null;lastManagerRefresh=0;if(scopes.some(x=>['production','projects','people','settings'].includes(x)))productionPageCache.clear();if(scopes.some(x=>['expenses','people','settings'].includes(x))&&typeof paymentWorkspace!=='undefined'){paymentWorkspace.loaded=false;expenseContentCache.clear();}}
 function ingest(signal){const changed=tracker.accept(signal);invalidate(changed);if(changed.length){banner();queue();}}
 function queue(delay=800){if(flushTimer)return;const epoch=generation;flushTimer=setTimeout(()=>{if(epoch!==generation)return;flushTimer=null;flush();},delay);}
 async function refreshPage(batch,manual){
  if(tab==='production'){
   if(needsProductionCore){productionReady=false;needsProductionCore=false;}
   const pages=Math.max(1,Math.ceil((state.productionPage?.items?.length||0)/20));
   refreshing=true;try{for(let page=0;page<pages;page++){if(!await loadProductionPage(page,page>0,true,!manual))return false;if(!state.productionPage?.hasMore)break;}return true;}finally{refreshing=false;}
  }
  if(tab==='fieldReview'){await fieldReviewView();return true;}if(tab==='fieldReport'){await fieldReportView();return true;}if(tab==='performance'){await performanceView();return true;}
  const ok=await refreshSnapshot(manual);if(ok&&tab==='staff')await loadStaffWorkload(true);return ok;
 }
 async function flush(manual=false){
  if(applying||!state||document.hidden)return;const batch=tracker.relevant(tab);if(!batch.size){banner();return;}if(!manual&&!canRefresh()){banner();queue(busy||refreshing?250:1000);return;}
  const epoch=generation,view=tab;applying=true;
  try{const ok=await refreshPage(batch,manual);if(epoch!==generation)return;if(ok&&tab===view){tracker.complete(batch);failures=0;}else if(ok===false&&tab===view){if(failureView!==view)failures=0;failureView=view;failures++;}}
  catch{if(epoch===generation&&tab===view){if(failureView!==view)failures=0;failureView=view;failures++;}}
  finally{if(epoch===generation){applying=false;banner();if(tracker.relevant(tab).size)queue(failures&&failureView===tab?Math.min(60000,10000*failures):1000);}}
 }
 async function sdk(){if(window.supabase?.createClient)return;await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='/viral/vendor/supabase.js?v=live1';script.onload=resolve;script.onerror=()=>{script.remove();reject(Error('SDK unavailable'));};document.head.append(script);});}
 async function disconnect(){connected=false;clearTimeout(renewTimer);renewTimer=null;const previous=client;client=null;channel=null;if(previous){await previous.removeAllChannels().catch(()=>{});previous.realtime.disconnect();}}
 function reset(){
  generation++;tracker=new ViralChangeTracker();identity='';started=false;connecting=false;checking=false;applying=false;stopped=false;ready=null;lastCheck=0;lastLegacyRefresh=0;failures=0;failureView='';needsProductionCore=false;
  clearTimeout(flushTimer);flushTimer=null;$('liveDataUpdate')?.remove();disconnect();status('disconnected');
 }
 async function connect(){if(connecting||stopped||document.hidden||!state)return;const epoch=generation;connecting=true;
  try{
   const response=await fetch('/api/viral/changes?connect=1',{cache:'no-store'});if(epoch!==generation)return;
   if(response.status===401){stopped=true;await disconnect();status('signed_out');return;}if(!response.ok)throw Error('Signal unavailable');
   const config=await response.json();if(epoch!==generation)return;lastCheck=Date.now();ready=config.ready===true;if(!ready){status('setup_needed');return;}
   ingest(config.signal);await sdk();if(epoch!==generation)return;await disconnect();if(epoch!==generation||document.hidden||stopped)return;
   const next=window.supabase.createClient(config.url,config.anonKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});client=next;await next.realtime.setAuth(config.accessToken);if(epoch!==generation)return;
   channel=next.channel('viral-change-signal').on('postgres_changes',{event:'UPDATE',schema:'public',table:'viral_change_signal',filter:'id=eq.main'},payload=>{if(epoch===generation)ingest(payload.new);}).subscribe(value=>{if(epoch!==generation)return;connected=value==='SUBSCRIBED';status(connected?'connected':'reconnecting');if(connected)check(true);});
   renewTimer=setTimeout(()=>{if(epoch===generation)connect();},Math.max(10000,Math.min(2700000,(Number(config.expiresAt)*1000-Date.now()-60000)||2700000)));
  }catch{if(epoch===generation){connected=false;status('reconnecting');}}finally{if(epoch===generation)connecting=false;}
 }
 async function check(force=false){if(checking||stopped||document.hidden||!state)return;const interval=connected?300000:ready===false?120000:30000;if(!force&&Date.now()-lastCheck<interval)return;const epoch=generation;checking=true;lastCheck=Date.now();
  try{
   const response=await fetch('/api/viral/changes',{cache:'no-store'});if(epoch!==generation)return;
   if(response.status===401){stopped=true;await disconnect();status('signed_out');return;}if(!response.ok)throw Error('Signal unavailable');const result=await response.json();if(epoch!==generation)return;
   ready=result.ready===true;if(ready){ingest(result.signal);if(!connected&&!connecting)connect();}else{status('setup_needed');if(canRefresh()&&Date.now()-lastLegacyRefresh>=120000){lastLegacyRefresh=Date.now();await refreshPage(new Map([['settings',0]]),false);}}
  }catch{if(epoch===generation)status('reconnecting');}finally{if(epoch===generation)checking=false;}
 }
 function start(){if(!state)return;const id=String(state.user?.id||'');if(identity!==id){reset();identity=id;}if(started)return;started=true;connect();}
 const previousRender=render;render=function(){
  const previousTab=document.body.dataset.tab,scroll=window.scrollY,open=[...($('screen')?.querySelectorAll('details[open]')||[])].map(d=>({id:d.id,label:d.querySelector(':scope > summary')?.textContent}));
  previousRender();if(previousTab===tab){for(const d of $('screen')?.querySelectorAll('details')||[])if(open.some(x=>x.id?x.id===d.id:x.label&&x.label===d.querySelector(':scope > summary')?.textContent))d.open=true;if(scroll&&typeof window.scrollTo==='function')window.scrollTo(0,scroll);}
  start();banner();queue();
 };
 window.addEventListener('viral:session-reset',reset);
 window.addEventListener('viral:saved',event=>{const scopes=event.detail?.scopes||[];tracker.invalidate(scopes);invalidate(scopes);queue(0);});
 document.addEventListener('visibilitychange',()=>{if(document.hidden){disconnect();return;}start();connect();check(true);queue();});
 window.addEventListener('online',()=>{start();connect();check(true);});window.addEventListener('pagehide',()=>disconnect());
 document.addEventListener('toggle',()=>queue(),true);document.addEventListener('focusout',()=>queue());
 setInterval(()=>{if(document.hidden||!state||stopped)return;if(tracker.relevant(tab).size)queue();check();},5000);
 start();
})();
