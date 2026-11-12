export async function commitSchedulerState(before,after,commit){
 if(JSON.stringify(before)===JSON.stringify(after))return {committed:true,changed:false};
 const result=await commit();if(result.error)throw result.error;
 return {committed:result.data===true,changed:true};
}
