/* Bounded reversible marking history. PDF bytes and teacher's reusable library
 * are deliberately not duplicated into undo snapshots. History is reset when
 * switching IA documents, so an undo can never restore another student's PDF.
 */
const clone=value=>JSON.parse(JSON.stringify(value));
export class MarkingHistory {
  constructor(limit=60) {
    this.limit=Math.max(5,Math.floor(limit));
    this.past=[];
    this.future=[];
  }
  snapshot(state) {
    return clone({
      stamps:state.stamps,
      marks:state.marks,
      justifications:state.justifications,
    });
  }
  push(label,before,after) {
    const first=JSON.stringify(before),last=JSON.stringify(after);
    if(first===last)return false;
    this.past.push({label,before:clone(before),after:clone(after)});
    if(this.past.length>this.limit)this.past.shift();
    this.future.length=0;
    return true;
  }
  undo(){
    const item=this.past.pop();
    if(!item)return null;
    this.future.push(item);
    return {label:item.label,snapshot:clone(item.before)};
  }
  redo(){
    const item=this.future.pop();
    if(!item)return null;
    this.past.push(item);
    return {label:item.label,snapshot:clone(item.after)};
  }
  clear(){this.past.length=0;this.future.length=0;}
  get canUndo(){return this.past.length>0;}
  get canRedo(){return this.future.length>0;}
  get undoLabel(){return this.past.at(-1)?.label||'';}
  get redoLabel(){return this.future.at(-1)?.label||'';}
}

export function sanitizeQuickPicks(source){
  const data=source && typeof source==='object' && !Array.isArray(source)?source:{};
  const list=(arr,limit)=>Array.isArray(arr)?
    [...new Set(arr.filter(id=>typeof id==='string'&&id.length>0&&id.length<150))].slice(0,limit):[];
  return {favorites:list(data.favorites,100),recent:list(data.recent,24)};
}
