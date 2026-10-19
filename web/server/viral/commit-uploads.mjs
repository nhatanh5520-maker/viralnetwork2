import {ViralVersionConflict} from './approval-retry.mjs';
export class ViralCommitUncertain extends Error {
 constructor(){super('Chưa xác nhận được kết quả lưu. Hãy làm mới để kiểm tra trước khi thử lại; các tệp đã tải lên (nếu có) được giữ để đối chiếu.');}
}
// A network/DB error can arrive AFTER the commit. Only explicit false proves
// these files are unreferenced; otherwise retain them rather than breaking bills.
export async function commitWithUploads({uploads,upload,remove,commit}){
 const attempted=[];
 const cleanup=async()=>{if(!attempted.length)return;try{await remove(attempted);}catch{console.warn('viral_upload_cleanup_failed');}};
 try{for(const file of uploads){attempted.push(file.id);const result=await upload(file);if(result?.error)throw Error('upload failed');}}
 catch{await cleanup();throw Error('Không tải được tệp đính kèm. Chưa gửi yêu cầu lưu dữ liệu.');}
 let result;
 try{result=await commit();}catch{throw new ViralCommitUncertain();}
 if(result?.error||typeof result?.data!=='boolean')throw new ViralCommitUncertain();
 if(!result.data){await cleanup();throw new ViralVersionConflict();}
 return true;
}
