// Builds the "Số liệu kênh" Excel file from a channelMetricsReport result (already permission-checked).
import ExcelJS from 'exceljs';

const SOURCE={official:'Chính thức',estimate:'Ước tính',none:'Chưa nhập'};
const pct=v=>v===null||v===undefined?'':v/100;

export async function channelMetricsWorkbook(report){
 const wb=new ExcelJS.Workbook();wb.creator='Viral Network';wb.created=new Date();
 const fields=report.fields||[];
 const sheet=wb.addWorksheet('Tổng hợp',{views:[{state:'frozen',ySplit:3}]});
 sheet.addRow(['Số liệu kênh · '+report.label+' (so với '+report.previousLabel+')']).font={bold:true,size:13};
 sheet.addRow([report.mode==='month'?'Tháng chưa có số chính thức hiển thị số ƯỚC TÍNH: số mỗi tuần chia theo số ngày của tuần nằm trong tháng.':'Số liệu 7 ngày, thứ Hai đến Chủ nhật.']).font={italic:true,color:{argb:'FF666666'}};
 const header=['Dự án','Nền tảng','Kênh','VJ phụ trách','Trạng thái kênh','Nguồn số liệu',...fields.map(f=>f.label),...fields.map(f=>f.label+' kỳ trước'),...fields.map(f=>f.label+' tăng/giảm')];
 const h=sheet.addRow(header);h.font={bold:true};h.eachCell(c=>{c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFE8F5E9'}};});
 const n=fields.length;
 for(const r of report.rows||[]){
  const row=sheet.addRow([r.channel.project,r.channel.platform,r.channel.name,r.channel.vj_name,r.channel.active?'Đang dùng':'Đã ngưng',SOURCE[r.source]||r.source,
   ...fields.map(f=>r.values?.[f.key]??''),...fields.map(f=>r.previous?.values?.[f.key]??''),...fields.map(f=>pct(r.change?.[f.key]))]);
  for(let i=0;i<n*2;i++)row.getCell(7+i).numFmt='#,##0';
  for(let i=0;i<n;i++)row.getCell(7+n*2+i).numFmt='+0.0%;-0.0%;0%';
  if(r.source==='estimate')row.getCell(6).font={italic:true,color:{argb:'FFB26A00'}};
 }
 const t=report.totals||{},total=sheet.addRow(['Tổng cộng','','','','','',...fields.map(f=>t.current?.[f.key]??''),...fields.map(f=>t.previous?.[f.key]??''),...fields.map(f=>pct(t.change?.[f.key]))]);
 total.font={bold:true};for(let i=0;i<n*2;i++)total.getCell(7+i).numFmt='#,##0';for(let i=0;i<n;i++)total.getCell(7+n*2+i).numFmt='+0.0%;-0.0%;0%';
 sheet.columns.forEach((c,i)=>{c.width=i<4?24:i<6?14:13;});
 const missing=wb.addWorksheet('Kênh chưa nhập');
 missing.addRow(['Dự án','Nền tảng','Kênh','VJ phụ trách']).font={bold:true};
 for(const c of report.missing||[])missing.addRow([c.project,c.platform,c.name,c.vj_name]);
 missing.columns.forEach(c=>{c.width=26;});
 const note=wb.addWorksheet('Giải thích');
 for(const line of ['Tăng/giảm = (kỳ này − kỳ trước) / kỳ trước. Để trống khi kỳ trước bằng 0 hoặc chưa có số.','Ước tính tháng: mỗi tuần đóng góp (số ngày của tuần nằm trong tháng ÷ 7) × số của tuần.','Chính thức: số tháng do VJ hoặc Leader nhập từ ngày cuối tháng đến hết ngày 2 tháng sau.'])note.addRow([line]);
 note.getColumn(1).width=110;
 const buffer=Buffer.from(await wb.xlsx.writeBuffer());
 return {filename:'so-lieu-kenh-'+report.mode+'-'+report.period+'.xlsx',type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',base64:buffer.toString('base64')};
}
