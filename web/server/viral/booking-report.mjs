const normalize=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/Đ/g,'D').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const text=value=>String(value??'').trim();
const aliases={id:['ma don hang','ma booking'],date:['ngay','ngay booking','ngay dat booking'],customerId:['ma kh'],customer:['ten nhan hang','ten khach hang','ten nhan hang doanh nghiep'],project:['talent booking','du an','ten du an'],quantity:['so luong video'],revenue:['doanh thu hop dong vnd','doanh thu hop dong','doanh thu don hang','doanh thu'],cost:['chi phi talent quay vnd','chi phi talent quay','chi phi don hang','chi phi'],status:['trang thai booking'],payment:['trang thai thanh toan'],sales:['sales phu trach'],url:['link video final'],note:['ghi chu tien do','ghi chu']};
export function bookingHeader(cells){
 for(let row=0;row<Math.min(cells.length,20);row++){
  const headers=(cells[row]||[]).map(normalize),columns={};
  for(const [key,names] of Object.entries(aliases))columns[key]=headers.findIndex(h=>names.includes(h));
  if(['id','customer','project','revenue','cost','date'].every(key=>columns[key]>=0))return {row,columns};
 }
 throw Error('Tab booking cần các cột: Ngày (hoặc Ngày booking), Mã Đơn Hàng, Tên Nhãn Hàng, Talent Booking (hoặc Dự án), Doanh Thu Hợp Đồng và Chi Phí Talent/Quay.');
}
export function bookingDate(value){
 if(value===null||value===undefined||value==='')return null;
 if(typeof value==='number'){
  if(!Number.isFinite(value)||value<1||value>2958465)return null;
  return new Date(Date.UTC(1899,11,30)+Math.floor(value)*86400000).toISOString().slice(0,10);
 }
 const input=text(value),iso=/^(\d{4})-(\d{2})-(\d{2})(?:[ T].*)?$/.exec(input),vn=/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(input);
 const day=iso?`${iso[1]}-${iso[2]}-${iso[3]}`:vn?`${vn[3]}-${vn[2].padStart(2,'0')}-${vn[1].padStart(2,'0')}`:'';
 if(!day||day<'1900-01-01'||day>'9999-12-31')return null;
 const date=new Date(day+'T00:00:00Z');return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===day?day:null;
}
export function bookingAmount(value){
 if(value===null||value===undefined||text(value)==='')return null;
 if(typeof value==='number')return Number.isFinite(value)?value:null;
 if(typeof value!=='string')return null;
 const input=value.trim().replace(/\s*(?:VNĐ|VND|đ|₫)\s*$/i,'').replace(/\s/g,'');
 if(/^-?\d+$/.test(input)){const value=Number(input);return Number.isFinite(value)?value:null;}
 if(/^-?\d{1,3}(?:\.\d{3})+$/.test(input))return Number(input.replaceAll('.',''));
 if(/^-?\d{1,3}(?:,\d{3})+$/.test(input))return Number(input.replaceAll(',',''));
 return null;
}
export function parseBookings(cells){
 const {row,columns:c}=bookingHeader(cells),items=[],issues=[],ids=new Set();
 for(let i=row+1;i<cells.length;i++){
  const r=cells[i]||[],get=key=>c[key]<0?'':r[c[key]],id=text(get('id'));
  if([get('id'),get('customer'),get('project'),get('quantity')].some(v=>/^tong (cong|doanh thu)\b/.test(normalize(v))))continue;
  const keys=['date','customerId','customer','project','quantity','revenue','cost','status','payment','sales','url','note'];
  if(!keys.some(key=>text(get(key))))continue; // Pre-generated order codes are not orders.
  if(!id){issues.push({row:i+1,message:'Thiếu mã đơn hàng; dòng chưa được tính.'});continue;}
  if(ids.has(id))throw Error(`Mã đơn hàng ${id} bị trùng tại dòng ${i+1}. Kiểm tra Sheet trước khi xem tổng hợp.`);
  ids.add(id);
  const date=bookingDate(get('date')),revenue=bookingAmount(get('revenue')),cost=bookingAmount(get('cost')),warnings=[];
  if(!date)warnings.push(text(get('date'))?'Ngày booking không hợp lệ':'Chưa có ngày booking');
  if(!text(get('customer')))warnings.push('Chưa có tên khách hàng');
  if(!text(get('project')))warnings.push('Chưa có dự án');
  if(revenue===null)warnings.push(text(get('revenue'))?'Doanh thu không hợp lệ':'Chưa có doanh thu');
  if(cost===null)warnings.push(text(get('cost'))?'Chi phí không hợp lệ':'Chưa có chi phí');
  if(warnings.length)issues.push({row:i+1,id,message:warnings.join('; ')});
  const url=text(get('url'));
  items.push({id,row:i+1,date,customerId:text(get('customerId')),customer:text(get('customer')),project:text(get('project')),quantity:bookingAmount(get('quantity')),revenue,cost,profit:revenue!==null&&cost!==null?revenue-cost:null,status:text(get('status')),payment:text(get('payment')),sales:text(get('sales')),url:/^https:\/\/[^\s]+$/i.test(url)?url:'',note:text(get('note')),warnings});
 }
 return {items,issues};
}
export function bookingReport(book,filters={}){
 const mode=String(filters.mode||'month'),project=String(filters.project||'all');
 if(!['all','month','day','range'].includes(mode))throw Error('Bộ lọc thời gian không hợp lệ.');
 const month=String(filters.month||''),day=String(filters.day||''),from=String(filters.from||''),to=String(filters.to||'');
 if(mode==='month'&&!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw Error('Chọn tháng booking hợp lệ.');
 if(mode==='day'&&(!/^\d{4}-\d{2}-\d{2}$/.test(day)||bookingDate(day)!==day))throw Error('Chọn ngày booking hợp lệ.');
 if(mode==='range'&&(!/^\d{4}-\d{2}-\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}$/.test(to)||bookingDate(from)!==from||bookingDate(to)!==to||from>to))throw Error('Khoảng ngày booking không hợp lệ.');
 const parsed=parseBookings(book.cells),projects=[...new Set(parsed.items.map(x=>x.project).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'vi'));
 const selected=parsed.items.filter(x=>(project==='all'||x.project===project)&&(mode==='all'||x.date&&(mode==='month'?x.date.startsWith(month):mode==='day'?x.date===day:x.date>=from&&x.date<=to))).sort((a,b)=>(b.date||'').localeCompare(a.date||'')||a.row-b.row);
 const total={count:selected.length,revenue:0,cost:0,profit:0,missingRevenue:0,missingCost:0};
 for(const x of selected){if(x.revenue===null)total.missingRevenue++;else total.revenue+=x.revenue;if(x.cost===null)total.missingCost++;else total.cost+=x.cost;}
 total.profit=total.missingRevenue||total.missingCost?null:total.revenue-total.cost;
 const offset=Number(filters.offset||0);if(!Number.isSafeInteger(offset)||offset<0||offset>50000)throw Error('Trang đơn hàng không hợp lệ.');
 return {ok:true,mode,project,month,day,from,to,projects,total,items:selected.slice(offset,offset+50),nextOffset:offset+50<selected.length?offset+50:null,undatedCount:parsed.items.filter(x=>!x.date&&(project==='all'||x.project===project)).length,issues:parsed.issues.slice(0,20),issueCount:parsed.issues.length,readAt:book.readAt,sheetUrl:book.sheetUrl,sheetName:book.sheetName};
}
