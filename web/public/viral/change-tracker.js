(function(root){
 const dependencies={production:['production','projects','people','settings'],tasks:['work','production','projects','people','settings'],home:['production','work','attendance','projects','people','settings'],attendance:['attendance','people','settings'],news:['news','people','settings'],expenses:['expenses','projects','people','settings'],equipment:['equipment','projects','people','settings'],leave:['leave','people','settings'],meetings:['meetings','people','settings'],schedule:['schedule','meetings','attendance','people','settings'],staff:['people','production','work','settings'],profile:['people','expenses','settings'],fieldReview:['attendance','people','settings'],fieldReport:['attendance','people','settings'],performance:['production','work','attendance','people','settings'],utilities:['people','settings'],hrAccounts:['people','settings']};
 class ChangeTracker{
  constructor(){this.latest=new Map();this.pending=new Map();}
  accept(signal){const changed=[];for(const [scope,raw] of Object.entries(signal?.versions||{})){const revision=Number(raw);if(!Number.isSafeInteger(revision)||revision<0)continue;if(!this.latest.has(scope)||revision>this.latest.get(scope)){this.latest.set(scope,revision);this.pending.set(scope,revision);changed.push(scope);}}return changed;}
  relevant(tab){if(tab==='finance')return new Map();const keys=dependencies[tab];return new Map([...this.pending].filter(([key])=>!keys||keys.includes(key)));}
  complete(batch){for(const [scope,revision] of batch)if(this.pending.get(scope)===revision)this.pending.delete(scope);}
 }
 root.ViralChangeTracker=ChangeTracker;if(typeof module==='object'&&module.exports)module.exports={ChangeTracker};
})(typeof globalThis==='object'?globalThis:this);
