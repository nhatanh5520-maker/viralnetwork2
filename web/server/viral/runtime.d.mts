export function initializeData(): any;
export type StateChanges={reads:string[];writes:string[];patches:any[];outboxDone:string[]};
export function createRuntime(input?: any, user?: any, env?: any): {data:any; uploads:any[]; context:any; run:(name:string,args?:any[],internal?:boolean)=>any; changes:(base:any,options?:{rowMerge?:Record<string,string[]>})=>StateChanges};
export function diffState(base:any,next:any,touched?:Iterable<{book:string;name:string}>|null,options?:{rowMerge?:Record<string,string[]>}):StateChanges;
export function sheetRowOps(before:any[],after:any[],uniqueNames?:string[]):{update:any[];append:any[];unique:number[]}|null;
export function stateKey(path:string[]):string;
