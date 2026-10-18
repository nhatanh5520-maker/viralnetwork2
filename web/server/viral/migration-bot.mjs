// Read bot identity only; never send a test message or expose the token.
export async function verifyMigrationBot(expectedUsername,token,fetcher=fetch){
 if(!expectedUsername)return;
 if(!token)throw Error('Thêm TELEGRAM_BOT_TOKEN của bot đã chọn trên Vercel trước khi chuyển chính thức.');
 let r,d;try{r=await fetcher(`https://api.telegram.org/bot${token}/getMe`,{signal:AbortSignal.timeout(15000),cache:'no-store'});d=await r.json();}catch{throw Error('Chưa kiểm tra được bot Telegram. Thử lại sau.');}
 if(!r.ok||!d.ok||String(d.result?.username||'').toLowerCase()!==String(expectedUsername).replace(/^@/,'').toLowerCase())throw Error('TELEGRAM_BOT_TOKEN chưa khớp bot @'+String(expectedUsername).replace(/^@/,'')+'. Kiểm tra lại biến trên Vercel.');
}
