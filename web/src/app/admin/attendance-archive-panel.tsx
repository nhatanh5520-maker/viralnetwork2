'use client';
import {useState} from 'react';
type Status={version:number;before:string;eligible:number;live:number;archived:number;serviceAccountEmail:string};
export default function AttendanceArchivePanel(){
 const [status,S]=useState<Status|null>(null),[busy,B]=useState(false),[message,M]=useState(''),[error,E]=useState('');
 async function run(action?:'sync'|'archive'){
  B(true);E('');M('');try{
   const response=await fetch('/api/viral/attendance-archive',action?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,version:status?.version})}:{cache:'no-store'}),data=await response.json();
   if(!response.ok)throw Error(data.error||'Chưa thực hiện được.');
   if(action){M(`Đã đối chiếu ${data.copied} bản ghi trên Sheet; chuyển khỏi Supabase ${data.moved} bản ghi.`);S(null);}else S(data);
  }catch(e){E((e as Error).message);S(null);}finally{B(false);}
 }
 return <div className="card"><h2>Lưu trữ bảng công</h2><p>Đồng bộ công sang Google Sheets. Chỉ chuyển khỏi Supabase các ngày trước hôm nay đã có giờ ra và hoàn tất duyệt. Web vẫn đọc được lịch sử đã lưu trữ.</p><p><a href="https://docs.google.com/spreadsheets/d/1VNqrBFuLrte3zju7d0MzPoft0yzJwN8pHveJVh2t84w/edit" target="_blank" rel="noopener noreferrer">Mở Sheet chấm công ↗</a></p><button disabled={busy} onClick={()=>run()}>Kiểm tra</button>{status&&<><p>Đang lưu: {status.live} · Đã lưu trữ: {status.archived} · Đủ điều kiện trước {status.before}: {status.eligible}</p>{status.serviceAccountEmail&&<p>Chia sẻ Sheet quyền Editor cho: <strong>{status.serviceAccountEmail}</strong></p>}<div className="toolbar"><button disabled={busy} onClick={()=>run('sync')}>Đồng bộ lên Sheet</button><button disabled={busy||!status.eligible} onClick={()=>run('archive')}>Đồng bộ và chuyển công cũ khỏi Supabase</button></div></>}{busy&&<p>Đang đối chiếu dữ liệu…</p>}{message&&<p role="status">{message}</p>}{error&&<p role="alert" className="err">{error}</p>}</div>;
}
