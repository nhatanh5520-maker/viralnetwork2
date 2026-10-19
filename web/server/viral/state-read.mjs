export class ViralStateReadError extends Error {
 constructor(code,message){super(message+' ['+code+']');this.code=code;}
}
export function stateReadFailure(error){
 const raw=String(error?.code||''),code=/^[A-Za-z0-9_-]{1,24}$/.test(raw)?raw:'STATE_READ';
 const reason=code==='PGRST116'?'Không tìm thấy bản ghi dữ liệu chính. Liên hệ quản trị để kiểm tra.':
  ['42501','PGRST301','PGRST302','PGRST303'].includes(code)?'Máy chủ chưa có quyền đọc dữ liệu. Liên hệ quản trị.':
  code==='57014'||error?.name==='AbortError'||error?.name==='TimeoutError'?'Đọc dữ liệu quá thời gian. Vui lòng thử lại sau ít giây.':
  'Chưa kết nối được dữ liệu. Vui lòng thử lại sau ít giây.';
 return new ViralStateReadError(code,reason);
}
// Share in-flight database reads only. Never cache a settled snapshot or auth.
// Each caller receives its own copy, so one employee cannot mutate another read.
export function sharedStateRead(read){
 let pending=null;
 const load=async function(){
  if(!pending){const operation=Promise.resolve().then(read);pending=operation;operation.then(()=>{if(pending===operation)pending=null;},()=>{if(pending===operation)pending=null;});}
  return structuredClone(await pending);
 };
 load.invalidate=()=>{pending=null;};return load;
}
