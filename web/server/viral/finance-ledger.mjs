// Read-only reporting. No ledger rows or credentials are persisted in application state.
const norm=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/Đ/g,'D').replace(/\s+/g,' ').trim().toUpperCase();
const columns={date:['NGAY THUC HIEN GIAO DICH','NGAY PHAT SINH'],month:['THANG'],type:['LOAI'],group:['NHOM'],project:['DU AN / BO PHAN','MA DU AN'],person:['NGUOI CHI','NGUOI THUC HIEN GD','NGUOI THUC HIEN GIAO DICH'],title:['NOI DUNG'],amount:['SO TIEN']};
export function ledgerHeaderRow(book,detail=false){return (book?.cells||[]).slice(0,50).findIndex(row=>(row||[]).some(v=>norm(v)===(detail?'NGAY PHAT SINH':'NGAY THUC HIEN GIAO DICH')));}
function layout(book,name,detail){
 const row=ledgerHeaderRow(book,detail);if(row<0)throw Error(`Tab ${name}: không tìm thấy hàng tiêu đề Thu chi trong 50 dòng đầu.`);
 const headers=(book.cells[row]||[]).map(norm),map={};
 for(const [key,aliases] of Object.entries(columns)){const hits=headers.flatMap((h,i)=>aliases.includes(h)?[i]:[]);if(hits.length>1)throw Error(`Tab ${name}: tiêu đề ${aliases[0]} bị trùng.`);map[key]=hits[0]??-1;}
 const legacy=detail&&map.type<0&&map.group<0;
 for(const key of ['date','project','title','amount',...(detail?['person']:[]),...(!legacy?['type','group']:[])])if(map[key]<0)throw Error(`Tab ${name}: thiếu cột ${columns[key][0]}.`);
 return {row,map,legacy};
}
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
 const {row,map,legacy}=layout(book,name,detail),cells=book.cells,items=[],issues=[];
 for(let i=row+1;i<cells.length;i++){
  const r=cells[i]||[],value=key=>r[map[key]];
  if(!['date','type','group','project','person','title','amount'].some(key=>map[key]>=0&&value(key)!==''&&value(key)!=null))continue;
  try{
   const date=isoDate(value('date')),type=legacy?'CHI':norm(value('type'));if(!['THU','CHI','GOP VON'].includes(type))throw Error('Cột LOẠI chỉ nhận THU, CHI hoặc GÓP VỐN.');
   const project=String(value('project')??'').trim(),group=legacy?'Di Chuyển & Ăn uống':String(value('group')??'').trim();
   items.push({id:`${detail?'DA':'TONG'}:${i+1}`,row:i+1,date,type:type==='GOP VON'?'GÓP VỐN':type,group,project,person:detail?String(value('person')??'').trim():'',title:String(value('title')??'').trim(),amount:amount(value('amount')),source:name,method:'',billLinks:[],invoiceLinks:[]});
  }catch(e){issues.push({source:name,row:i+1,message:e.message});}
 }
 return {items,issues};
}
function sum(items){const income=items.filter(x=>x.type==='THU').reduce((n,x)=>n+x.amount,0),expense=items.filter(x=>x.type==='CHI').reduce((n,x)=>n+x.amount,0),capital=items.filter(x=>x.type==='GÓP VỐN').reduce((n,x)=>n+x.amount,0);return {income,expense,capital,balance:income-expense,cashBalance:income+capital-expense,count:items.filter(x=>!x.reconciliation).length};}
const projectKey=p=>/^DA\d+\b/i.exec(p)?.[0].toUpperCase()||('label:'+norm(p||'Chưa phân loại'));
const creative=x=>norm(x.project)==='BO PHAN - SANG TAO';
const bucketKey=x=>x.type+':'+norm(x.group);
export function ledgerReport(book,detailBook,options={},config={}){
 const main=parse(book,config.sheetName||'DATA TỔNG'),detail=parse(detailBook,config.detailSheetName||'DATA _DỰ ÁN',true);
 const view=String(options.view||'groups');if(!['groups','projects'].includes(view))throw Error('Chọn Theo nhóm hoặc Theo dự án.');
 const filterMode=String(options.filterMode||'month');if(!['month','range'].includes(filterMode))throw Error('Bộ lọc thời gian không hợp lệ.');
 const period=String(options.period||new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit'}).format(new Date()));
 if(!/^\d{4}(?:-(?:0[1-9]|1[0-2]))?$/.test(period))throw Error('Tháng báo cáo không hợp lệ.');
 let from='',to='';if(filterMode==='range'){from=isoDate(options.from);to=isoDate(options.to);if(from>to)throw Error('Từ ngày phải trước hoặc bằng đến ngày.');}
 const inTime=x=>filterMode==='range'?x.date>=from&&x.date<=to:x.date.startsWith(period),rows=main.items.filter(inTime),details=detail.items.filter(inTime);
 // DATA TỔNG is authoritative. Allocate its creative-department buckets by type and group.
 // Detail rows are allocations, not additional company transactions.
 const bucketMap=new Map();for(const x of details){const key=bucketKey(x);if(!bucketMap.has(key))bucketMap.set(key,{key,type:x.type,group:x.group,sharedTotal:0,detailTotal:0});bucketMap.get(key).detailTotal+=x.amount;}
 for(const x of rows)if(creative(x)&&bucketMap.has(bucketKey(x)))bucketMap.get(bucketKey(x)).sharedTotal+=x.amount;
 const buckets=[...bucketMap.values()].map(b=>({...b,difference:b.sharedTotal-b.detailTotal}));
 const sharedTotal=buckets.filter(b=>b.type==='CHI').reduce((n,b)=>n+b.sharedTotal,0),detailTotal=buckets.filter(b=>b.type==='CHI').reduce((n,b)=>n+b.detailTotal,0),difference=sharedTotal-detailTotal;
 let reportRows=rows;
 if(view==='projects'){
  reportRows=[...rows.filter(x=>!creative(x)||!bucketMap.has(bucketKey(x))),...details];
  for(const b of buckets)if(b.difference)reportRows.push({id:'RECONCILIATION:'+b.key,row:0,date:to||(period.length===7?period+'-01':period+'-01-01'),type:b.type,group:b.group,project:'Chưa phân bổ / chênh lệch đối chiếu',title:(b.difference>0?'Khoản chưa phân bổ':'Điều chỉnh đối chiếu: chi tiết lớn hơn sổ tổng')+' · '+b.group,person:'',method:'',amount:b.difference,source:'Đối chiếu hai tab',reconciliation:true,billLinks:[],invoiceLinks:[]});
 }
 const key=x=>x.reconciliation?'reconciliation':view==='groups'?'group:'+norm(x.group||'Chưa phân loại'):projectKey(x.project);
 const groups=new Map();for(const x of reportRows){const k=key(x);if(!groups.has(k))groups.set(k,{key:k,name:x.reconciliation?x.project:view==='groups'?(x.group||'Chưa phân loại'):(x.project||'Chưa phân loại'),items:[]});groups.get(k).items.push(x);}
 const selected=String(options.project||'all');if(selected!=='all'&&!groups.has(selected))throw Error('Nhóm/dự án không có dữ liệu trong thời gian này. Chọn Tất cả.');
 const filtered=reportRows.filter(x=>selected==='all'||key(x)===selected).sort((a,b)=>b.date.localeCompare(a.date)||b.row-a.row);
 const offset=Number(options.offset||0);if(!Number.isSafeInteger(offset)||offset<0)throw Error('Trang báo cáo không hợp lệ.');
 const items=filtered.slice(offset,offset+30),issues=[...main.issues,...detail.issues];
 return {ok:true,format:'ledger-v2',view,filterMode,from,to,period,project:selected,total:sum(rows),selectedTotal:sum(filtered),groups:[...groups.values()].map(({items,...g})=>({...g,...sum(items)})).sort((a,b)=>a.name.localeCompare(b.name,'vi')),items,count:filtered.length,nextOffset:offset+items.length<filtered.length?offset+items.length:null,periods:[...new Set(main.items.map(x=>x.date.slice(0,7)).concat(detail.items.map(x=>x.date.slice(0,7))))].sort().reverse(),issues:issues.slice(0,30),issueCount:issues.length,reconciliation:{sharedTotal,detailTotal,difference,buckets,status:buckets.every(b=>b.difference===0)?'matched':'difference'},readAt:new Date().toISOString(),sheetName:config.sheetName||'DATA TỔNG'};
}
