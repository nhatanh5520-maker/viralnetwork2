// Only an explicit CAS false proves no business data or events were committed.
export class ViralVersionConflict extends Error {
 constructor(){super('Dữ liệu vừa được cập nhật trong lúc lưu. Làm mới rồi thử lại.');}
}
export async function withIdeaApprovalRetry(method,operation){
 for(let attempt=0;attempt<3;attempt++){
  try{return await operation();}
  catch(error){
   if(method!=='decideProductionApproval'||!(error instanceof ViralVersionConflict)||attempt===2)throw error;
  }
 }
}
