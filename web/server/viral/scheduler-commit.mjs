import {ReadScopeMiss} from './state-scopes.mjs';

// A read-only preview avoids loading unrelated business data every minute.
// If anything is due, rerun against an uncached full snapshot before committing.
export async function prepareScheduler({loadPreview,loadFresh,run}){
 const previewState=await loadPreview();let preview;
 try{preview=run(previewState.data,true);}catch(error){if(!(error instanceof ReadScopeMiss))throw error;}
 if(preview&&JSON.stringify(previewState.data)===JSON.stringify(preview.data))return {state:previewState,rt:preview,full:false};
 const state=await loadFresh();return {state,rt:run(state.data,false),full:true};
}

export async function commitSchedulerState(before,after,commit){
 if(JSON.stringify(before)===JSON.stringify(after))return {committed:true,changed:false};
 const result=await commit();if(result.error)throw result.error;
 return {committed:result.data===true,changed:true};
}
