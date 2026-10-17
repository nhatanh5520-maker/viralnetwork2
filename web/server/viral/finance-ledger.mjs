// Read-only reporting. No ledger rows or credentials are persisted in application state.
const norm=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/Đ/g,'D').replace(/\s+/g,' ').trim().toUpperCase();
const summaryHeaders=['NGAY THUC HIEN GIAO DICH','THANG','LOAI','NHOM','DU AN / BO PHAN','NOI DUNG','SO TIEN'];
const detailHeaders=['NGAY PHAT SINH','MA DU AN','NGUOI CHI','NOI DUNG','SO TIEN'];
function isoDate(v){
 if(typeof v==='number'&&Number.isFinite(v)&&v>0)v=new Date(Date.UTC(1899,11,30)+Math.floor(v)*86400000).toISOString().slice(0,10);
 const t=String(v??'').trim(),m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(t),local=/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t);
 const s=m?t:local?`${local[3]}-${local[2].padStart(2,'0')}-${local[1].padStart(2,'0')}`:'';
 if(!s||!Number.isFinite(Date.parse(s+'T00:00:00Z'))||new Date(s+'T00:00:00Z').toISOString().slice(0,10)!==s)throw Error('Ngày không hợp lệ (dùng ngày trong Sheet hoặc dd/mm/yyyy).');return s;
}
function amount(v){
 let n=v;if(typeof n==='string'){n=n.trim().replace(/\s|₫|VND/gi,'');if(/^\d{1,3}(?:\.\d{3})+$/.test(n))n=n.replaceAll('.','');else if(/^\d{1,3}(?:,\d{3})+$/.test(n))n=n.replaceAll(',','');if(!/^\d+$/.test(n))throw Error('Số tiền cần là số VNĐ nguyên, không âm.');n=Number(n);}
 if(typeof n!=='number'||!Number.isSafeInteger(n)||n<0||n>1e12)throw Error('Số tiền cần là số VNĐ nguyên, không âm, tối đa 1.000 tỷ.');return n;
}
function parse(book,name,detail=false){
 const expected=detail?detailHeaders:summaryHeaders,cells=book?.cells||[];
 expected.forEach((h,i)=>{if(norm(cells[0]?.[i])!==h)throw Error(`Tab ${name}: cột ${i+1} không đúng mẫu Thu chi mới (${h}).`)});
 const items=[],issues=[];
 for(let i=1;i<cells.length;i++){
  const r=cells[i]||[];if(!r.slice(0,expected.length).some(v=>v!==''&&v!==null&&v!==undefined))continue;
  try{
   const date=isoDate(r[0]),type=detail?'CHI':norm(r[2]);if(!['THU','CHI'].includes(type))throw Error('Cột LOẠI chỉ nhận THU hoặc CHI.');
   const project=String(r[detail?1:4]??'').trim(),group=detail?'Di Chuyển & Ăn uống':String(r[3]??'').trim();
   items.push({id:`${detail?'DA':'TONG'}:${i+1}`,row:i+1,date,type,group,project,person:detail?String(r[2]??'').trim():'',title:String(r[detail?3:5]??'').trim(),amount:amount(r[detail?4:6]),source:name,method:'',billLinks:[],invoiceLinks:[]});
  }catch(e){issues.push({source:name,row:i+1,message:e.message});}
 }
 return {items,issues};
}
function sum(items){const income=items.filter(x=>x.type==='THU').reduce((n,x)=>n+x.amount,0),expense=items.filter(x=>x.type==='CHI').reduce((n,x)=>n+x.amount,0);return {income,expense,balance:income-expense,count:items.filter(x=>!x.reconciliation).length};}
const projectKey=p=>/^DA\d+\b/i.exec(p)?.[0].toUpperCase()||('label:'+norm(p||'Chưa phân loại'));
const shared=x=>x.type==='CHI'&&norm(x.group)==='DI CHUYEN & AN UONG'&&norm(x.project)==='BO PHAN - SANG TAO';
export function ledgerReport(book,detailBook,options={},config={}){
 const main=parse(book,config.sheetName||'DATA TỔNG'),detail=parse(detailBook,config.detailSheetName||'DATA _DỰ ÁN',true);
 const view=String(options.view||'groups');if(!['groups','projects'].includes(view))throw Error('Chọn Theo nhóm hoặc Theo dự án.');
 const filterMode=String(options.filterMode||'month');if(!['month','range'].includes(filterMode))throw Error('Bộ lọc thời gian không hợp lệ.');
 const period=String(options.period||new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit'}).format(new Date()));
 if(!/^\d{4}(?:-(?:0[1-9]|1[0-2]))?$/.test(period))throw Error('Tháng báo cáo không hợp lệ.');
 let from='',to='';if(filterMode==='range'){from=isoDate(options.from);to=isoDate(options.to);if(from>to)throw Error('Từ ngày phải trước hoặc bằng đến ngày.');}
 const inTime=x=>filterMode==='range'?x.date>=from&&x.date<=to:x.date.startsWith(period),rows=main.items.filter(inTime),details=detail.items.filter(inTime);
 const sharedTotal=sum(rows.filter(shared)).expense,detailTotal=sum(details).expense,difference=sharedTotal-detailTotal;
 // Split only the confirmed shared bucket. A visible signed reconciliation retains the main-ledger total,
 // including periods where detail exceeds the bucket; it is never a fabricated receipt or payment.
 let reportRows=rows;
 if(view==='projects'){
  reportRows=[...rows.filter(x=>!shared(x)),...details];
  if(difference)reportRows.push({id:'RECONCILIATION',row:0,date:to||(period.length===7?period+'-01':period+'-01-01'),type:'CHI',group:'Di Chuyển & Ăn uống',project:'Chưa phân bổ / chênh lệch đối chiếu',title:difference>0?'Chi phí chung chưa phân bổ':'Điều chỉnh đối chiếu: chi tiết lớn hơn sổ tổng',person:'',method:'',amount:difference,source:'Đối chiếu hai tab',reconciliation:true,billLinks:[],invoiceLinks:[]});
 }
 const key=x=>x.reconciliation?'reconciliation':view==='groups'?'group:'+norm(x.group||'Chưa phân loại'):projectKey(x.project);
 const groups=new Map();for(const x of reportRows){const k=key(x);if(!groups.has(k))groups.set(k,{key:k,name:x.reconciliation?x.project:view==='groups'?(x.group||'Chưa phân loại'):(x.project||'Chưa phân loại'),items:[]});groups.get(k).items.push(x);}
 const selected=String(options.project||'all');if(selected!=='all'&&!groups.has(selected))throw Error('Nhóm/dự án không có dữ liệu trong thời gian này. Chọn Tất cả.');
 const filtered=reportRows.filter(x=>selected==='all'||key(x)===selected).sort((a,b)=>b.date.localeCompare(a.date)||b.row-a.row);
 const offset=Number(options.offset||0);if(!Number.isSafeInteger(offset)||offset<0)throw Error('Trang báo cáo không hợp lệ.');
 const items=filtered.slice(offset,offset+30),issues=[...main.issues,...detail.issues];
 return {ok:true,format:'ledger-v2',view,filterMode,from,to,period,project:selected,total:sum(rows),selectedTotal:sum(filtered),groups:[...groups.values()].map(({items,...g})=>({...g,...sum(items)})).sort((a,b)=>a.name.localeCompare(b.name,'vi')),items,count:filtered.length,nextOffset:offset+items.length<filtered.length?offset+items.length:null,periods:[...new Set(main.items.map(x=>x.date.slice(0,7)).concat(detail.items.map(x=>x.date.slice(0,7))))].sort().reverse(),issues:issues.slice(0,30),issueCount:issues.length,reconciliation:{sharedTotal,detailTotal,difference,status:difference===0?'matched':'difference'},readAt:new Date().toISOString(),sheetName:config.sheetName||'DATA TỔNG'};
}
