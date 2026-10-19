// Only photo results are cached. Caller must authenticate and resolve current
// employee/custom-avatar permissions BEFORE requesting any IDs here.
export function avatarResolver({now=Date.now,ttl=300000,maxEntries=128}={}){
 const cache=new Map(),pending=new Map();let currentScope='';
 return async function(ids,load,{scope='',deadline=now()+8000}={}){
  if(scope!==currentScope){currentScope=scope;cache.clear();pending.clear();}
  const out={};let index=0;
  const get=async id=>{
   const cached=cache.get(id);if(cached&&cached.until>now())return cached.value;
   if(pending.has(id))return pending.get(id);
   const work=Promise.resolve().then(()=>load(id,deadline)).catch(()=>undefined);pending.set(id,work);
   try{const value=await work;if(typeof value==='string'&&currentScope===scope){cache.delete(id);cache.set(id,{value,until:now()+(value?ttl:30000)});while(cache.size>maxEntries)cache.delete(cache.keys().next().value);}return value;}
   finally{if(pending.get(id)===work)pending.delete(id);}
  };
  const worker=async()=>{while(index<ids.length&&now()<deadline){const id=String(ids[index++]),value=await get(id);if(typeof value==='string')out[id]=value;}};
  await Promise.all([worker(),worker()]);return out;
 };
}
