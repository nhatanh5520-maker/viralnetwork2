import vm from 'node:vm';
import fs from 'node:fs';
import crypto from 'node:crypto';
const runtimeDir=[process.cwd()+'/server/viral',process.cwd()+'/web/server/viral'].find(p=>fs.existsSync(p+'/business.gs'));
if(!runtimeDir)throw Error('Không tìm thấy mã nghiệp vụ Viral Network');
const source=fs.readFileSync(runtimeDir+'/business.gs','utf8');
const webPolicy=fs.readFileSync(runtimeDir+'/web-policy.gs','utf8')+'\n'+fs.readFileSync(runtimeDir+'/payment-batches.gs','utf8')+'\n'+fs.readFileSync(runtimeDir+'/project-management.gs','utf8');
const allowed=new Set(JSON.parse(fs.readFileSync(runtimeDir+'/methods.json','utf8')));
const chain=()=>new Proxy({}, {get:(_,key)=>key==='build'?()=>({}):key==='getHandlerFunction'?()=> '':()=>chain()});
const colNumber=s=>[...s].reduce((n,c)=>n*26+c.charCodeAt(0)-64,0);
export function createRuntime(input={},user=null,env={}) {
 const data=structuredClone(input);data.books??={};data.properties??={};data.files??={};data.outbox??=[];
 const cache=new Map();const uploads=[];
 const props={...data.properties,SHEET_ID:'main',BOT_TOKEN:env.BOT_TOKEN||'',WEB_APP_URL:env.WEB_APP_URL||'',BILL_FOLDER_ID:'bills'};
 const blob=(bytes,type='application/octet-stream',name='file')=>({getBytes:()=>[...Buffer.from(bytes)],getDataAsString:()=>Buffer.from(bytes).toString('utf8'),getContentType:()=>type,getName:()=>name,setName(n){name=n;return this;}});
 class Range {
  constructor(sheet,row,col,nr=1,nc=1){if(!Number.isInteger(row)||!Number.isInteger(col)||row<1||col<1)throw Error('Vùng dữ liệu không hợp lệ');Object.assign(this,{sheet,row,col,nr,nc});}
  getValues(){return Array.from({length:this.nr},(_,r)=>Array.from({length:this.nc},(_,c)=>this.sheet.cells[this.row-1+r]?.[this.col-1+c]??''));}
  getValue(){return this.getValues()[0][0];}
  setValues(values){if(values.length!==this.nr||values.some(r=>r.length!==this.nc))throw Error('Kích thước dữ liệu không khớp');values.forEach((r,i)=>r.forEach((v,j)=>{this.sheet.cells[this.row-1+i]??=[];this.sheet.cells[this.row-1+i][this.col-1+j]=v instanceof Date?v.toISOString():v;}));return this;}
  setValue(value){return this.setValues(Array.from({length:this.nr},()=>Array(this.nc).fill(value)));}
  clearContent(){for(let r=0;r<this.nr;r++)for(let c=0;c<this.nc;c++)if(this.sheet.cells[this.row-1+r])this.sheet.cells[this.row-1+r][this.col-1+c]='';return this;}
  clearContents(){return this.clearContent();}getRow(){return this.row;}getColumn(){return this.col;}getNumRows(){return this.nr;}getNumColumns(){return this.nc;}getSheet(){return this.sheet;}
  getA1Notation(){return `${this.row}:${this.col}`;}getFormula(){return this.getFormulas()[0][0];}getFormulas(){const meta=env.GRID_META?.[this.sheet.book]?.[this.sheet.name];return this.getValues().map((r,i)=>r.map((v,j)=>meta?.formulas?.[this.row-1+i]?.[this.col-1+j]||''));}setFormula(){return this;}
  getDataValidation(){return null;}getRichTextValues(){const meta=env.GRID_META?.[this.sheet.book]?.[this.sheet.name];return this.getValues().map((r,i)=>r.map((v,j)=>{const links=meta?.links?.[this.row-1+i]?.[this.col-1+j]||[];return {getText:()=>String(v),getLinkUrl:()=>links[0]||null,getRuns:()=>links.map(url=>({getLinkUrl:()=>url}))};}));}
  createFilter(){this.sheet.filter=chain();return this.sheet.filter;}
 }
 for(const key of ['setDataValidation','clearDataValidations','clearNote','setNote','setNumberFormat','setFontWeight','setBackground'])Range.prototype[key]=function(){return this;};
 class Sheet {
  constructor(name,book){this.name=name;this.book=book;}
  get cells(){return data.books[this.book][this.name];}getName(){return this.name;}getSheetId(){return Object.keys(data.books[this.book]).indexOf(this.name)+1;}getParent(){return new Book(this.book);}
  getLastRow(){let n=this.cells.length;while(n>0&&!this.cells[n-1]?.some(v=>v!==''&&v!==null))n--;return n;}
  getLastColumn(){return Math.max(0,...this.cells.filter(Boolean).map(r=>{let n=r.length;while(n>0&&(r[n-1]===''||r[n-1]==null))n--;return n;}));}
  getMaxRows(){return Math.max(1000,this.getLastRow());}getMaxColumns(){return Math.max(100,this.getLastColumn());}
  getRange(row,col,nr=1,nc=1){if(typeof row==='string'){const m=/^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/.exec(row);if(!m)throw Error('Địa chỉ dữ liệu không hợp lệ');return new Range(this,Number(m[2]),colNumber(m[1]),m[4]?Number(m[4])-Number(m[2])+1:1,m[3]?colNumber(m[3])-colNumber(m[1])+1:1);}return new Range(this,row,col,nr,nc);}
  getDataRange(){return this.getRange(1,1,Math.max(1,this.getLastRow()),Math.max(1,this.getLastColumn()));}
  appendRow(row){this.cells.push([...row]);return this;}deleteRow(row){this.cells.splice(row-1,1);return this;}
  clear(){data.books[this.book][this.name]=[];return this;}clearContents(){return this.clear();}getFilter(){return this.filter||null;}
  insertRowsAfter(after,count){this.cells.splice(after,0,...Array.from({length:count},()=>[]));return this;}
  insertColumnsAfter(after,count){this.cells.forEach(r=>r.splice(after,0,...Array(count).fill('')));return this;}
 }
 for(const key of ['setFrozenRows','setFrozenColumns','hideColumns','showColumns','setColumnWidth','setColumnWidths'])Sheet.prototype[key]=function(){return this;};
 class Book {
  constructor(id){this.id=id;data.books[id]??={};}getId(){return this.id;}getUrl(){return env.WEB_APP_URL||'';}
  getSheetByName(name){return Object.hasOwn(data.books[this.id],name)?new Sheet(name,this.id):null;}
  insertSheet(name){data.books[this.id][name]??=[];return new Sheet(name,this.id);}getSheets(){return Object.keys(data.books[this.id]).map(n=>new Sheet(n,this.id));}
  getSpreadsheetTimeZone(){return env.GRID_TIMEZONE?.[this.id]||'Asia/Ho_Chi_Minh';}getSpreadsheetLocale(){return 'vi_VN';}toast(){}
 }
 const dateFormat=(value,zone,format)=>{
  const d=new Date(value);if(!Number.isFinite(d.getTime()))throw Error('Ngày không hợp lệ');
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:zone||'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23',weekday:'short'}).formatToParts(d).map(p=>[p.type,p.value]));
  return format.replace(/yyyy|MM|dd|HH|mm|ss|EEE|u/g,k=>({yyyy:parts.year,MM:parts.month,dd:parts.day,HH:parts.hour,mm:parts.minute,ss:parts.second,EEE:parts.weekday,u:String((d.getUTCDay()||7))}[k]));
 };
 const fileObject=id=>{const f=data.files[id];if(!f)throw Error('Không thấy tệp đính kèm');return {getId:()=>id,getName:()=>f.name,getUrl:()=>`${env.WEB_APP_URL||''}/api/viral/file?id=${id}`,getBlob:()=>{if(!f.bytes)throw Error('Tệp chưa được nạp');return blob(Buffer.from(f.bytes,'base64'),f.type,f.name);},setTrashed:()=>{f.deleted=true;return true;}};};
 const folder=id=>({getId:()=>id,createFile(b){const fid=crypto.randomUUID(),bytes=Buffer.from(b.getBytes());data.files[fid]={name:b.getName(),type:b.getContentType(),path:fid,folder:id};uploads.push({id:fid,bytes,type:b.getContentType()});return fileObject(fid);}});
 const context=vm.createContext({console,Date,URL,URLSearchParams,Buffer,JSON,Math,Map,Set,Error,Number,String,Boolean,Array,Object,RegExp,parseInt,parseFloat,isNaN,isFinite,encodeURIComponent,decodeURIComponent,
  SpreadsheetApp:{openById:id=>new Book(id),create:()=>new Book(crypto.randomUUID()),flush(){},newDataValidation:chain},
  PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k]??null,getProperties:()=>({...props}),setProperty(k,v){props[k]=String(v);data.properties[k]=String(v);return this;},deleteProperty(k){delete props[k];delete data.properties[k];}})},
  CacheService:{getScriptCache:()=>({get:k=>cache.get(k)??null,put:(k,v)=>cache.set(k,String(v)),remove:k=>cache.delete(k)})},
  LockService:{getScriptLock:()=>({waitLock(){},tryLock:()=>true,releaseLock(){}})},
  Utilities:{getUuid:()=>crypto.randomUUID(),Charset:{UTF_8:'UTF-8'},DigestAlgorithm:{SHA_256:'sha256'},formatDate:dateFormat,
   computeDigest:(algorithm,value)=>[...crypto.createHash('sha256').update(typeof value==='string'?value:Buffer.from(value)).digest()],
   computeHmacSha256Signature:(value,key)=>[...crypto.createHmac('sha256',typeof key==='string'?key:Buffer.from(key)).update(typeof value==='string'?value:Buffer.from(value)).digest()],
   base64Encode:bytes=>Buffer.from(bytes).toString('base64'),base64Decode:value=>[...Buffer.from(value,'base64')],base64EncodeWebSafe:bytes=>Buffer.from(bytes).toString('base64url'),base64DecodeWebSafe:value=>[...Buffer.from(value,'base64url')],newBlob:(value,type,name)=>blob(typeof value==='string'?Buffer.from(value):Buffer.from(value),type,name)},
  DriveApp:{createFolder:()=>folder(crypto.randomUUID()),getFolderById:folder,getFileById:fileObject},
  ScriptApp:{getProjectTriggers:()=>[],deleteTrigger(){},newTrigger:chain},
  UrlFetchApp:{fetch(){throw Error('Dịch vụ ngoài được xử lý bởi máy chủ web.');}},
  HtmlService:{createTemplateFromFile:()=>({evaluate:chain}),createHtmlOutput:chain},
  __storeProjectImage:image=>{
   if(!image||!['image/jpeg','image/png','image/webp'].includes(image.type)||typeof image.base64!=='string'||image.base64.length>2800000||!/^[A-Za-z0-9+/]*={0,2}$/.test(image.base64))throw Error('Ảnh dự án cần là JPG, PNG hoặc WebP dưới 2 MB.');
   const bytes=Buffer.from(image.base64,'base64'),type=image.type;
   const valid=type==='image/png'?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):type==='image/jpeg'?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP';
   if(!valid||bytes.length<12||bytes.length>2*1024*1024)throw Error('Nội dung ảnh dự án không hợp lệ.');
   const id=crypto.randomUUID();data.files[id]={name:'project-'+id,type,path:id,folder:'project-avatars'};uploads.push({id,bytes,type});return id;
  },
  __user:user,__enqueue:(chatId,text)=>{if(!chatId)return false;data.outbox.push({id:crypto.randomUUID(),chatId:String(chatId),text:String(text),status:'pending',createdAt:new Date().toISOString()});return true;}
 });
 vm.runInContext(source,context,{timeout:10000});
 vm.runInContext(`
 const originalTelegramAuth = auth_;
 auth_ = function(initData){
  if(__user){const p=rows_('Employees').find(p=>String(p.telegram_id)===String(__user.employeeId)&&String(p.active).toLowerCase()==='true');if(!p)throw Error('Tài khoản chưa được kích hoạt');return {id:String(p.telegram_id),name:String(p.name),role:role_(p.role),department:String(p.department||'')};}
  if(typeof initData!=='string'||initData.startsWith('v'))throw Error('Cần đăng nhập');return originalTelegramAuth(initData);
 };
 const webFieldBuildPoint=fieldBuildPoint_;
 fieldBuildPoint_=function(u,input,date,now){const point=webFieldBuildPoint(u,input,date,now);if(point.mode==='office')point.place=String(setting_('office_name')||'Văn phòng');return point;};
 dispatchNotifications=function(){return {ok:true,queued:true};};
 tgSend_=function(chatId,text){return __enqueue(chatId,text);};
 rememberDevice=function(initData){auth_(initData);return {ok:true};};
 forgetDevice=function(initData){auth_(initData);return {ok:true};};
 `,context,{timeout:10000});
 vm.runInContext(webPolicy,context,{timeout:10000});
 const run=(name,args=[],internal=false)=>{if(!internal&&!allowed.has(name))throw Error('Chức năng không được phép');if(typeof context[name]!=='function')throw Error('Không tìm thấy chức năng '+name);context.__call=name;context.__args=args;const result=vm.runInContext('globalThis[__call](...__args)',context,{timeout:20000});if(result&&typeof result==='object'&&!Array.isArray(result)&&(result.projects||result.user||result.item)){result.projectAvatars=vm.runInContext('webProjectImages_()',context,{timeout:5000});result.projectRecords=vm.runInContext('webProjectRecords_()',context,{timeout:5000});}return result;};
 return {data,uploads,context,run};
}
export function initializeData(){const rt=createRuntime();for(const name of ['setupV20','setupPersonnel','setupV20Features','setupFieldAttendance','setupV2022'])rt.run(name,[],true);return rt.data;}
