// Run continuously on a server, or request /api/viral/cron from your scheduler.
const base=process.env.VIRAL_WEB_URL,secret=process.env.CRON_SECRET;
if(!base||!secret)throw Error('Thiếu VIRAL_WEB_URL hoặc CRON_SECRET');
async function tick(){try{const r=await fetch(new URL('/api/viral/cron',base),{headers:{Authorization:`Bearer ${secret}`},signal:AbortSignal.timeout(55000)});console.log(new Date().toISOString(),r.status,await r.text());}catch(e){console.error(e.message);}}
await tick();setInterval(tick,60000);
