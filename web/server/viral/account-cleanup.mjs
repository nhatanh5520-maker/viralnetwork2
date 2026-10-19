// Auth and business SQL are separate services. A missing row immediately after
// a timeout does not prove the business transaction cannot still finish.
export async function unfinishedAccount({lookup,remove,mayHaveCommitted}){
 let result;try{result=await lookup();}catch{return 'uncertain';}
 const {data,error}=result;if(data)return 'linked';
 if(error||mayHaveCommitted)return 'uncertain';
 try{const {error:cleanupError}=await remove();return cleanupError?'cleanup_failed':'removed';}catch{return 'cleanup_failed';}
}
