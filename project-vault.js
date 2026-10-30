/* Local-only cohort project store (Pass 9).
 *
 * Uses the existing IndexedDB database, upgraded from v1 to v2. Each student
 * PDF lives in the 'projects' store; the separate 'projectIndex' holds ONLY
 * lightweight metadata for the dashboard, so listing never loads every PDF.
 * A v1 'latest' draft is migrated within the version-change transaction.
 * Nothing here sends a request to a server or encrypts browser data.
 */
export const LOCAL_IA_DB='ia-marking-desk-local-v1';
export const LOCAL_IA_DB_VERSION=2;
const COURSE_SET=new Set(['AA SL','AI SL','AA HL','AI HL']);
const KEYS=['A','B','C','D','E'];

export function createLocalProjectId(){
  return 'ia-'+(typeof crypto!=='undefined'&&typeof crypto.randomUUID==='function'
    ?crypto.randomUUID():Date.now().toString(36)+'-'+Math.random().toString(36).slice(2));
}

export function summariseLocalProject(id,project,pdfBytes,pageCount,savedAt=new Date().toISOString()){
  const marks=project?.marks||{};
  const markedCount=KEYS.filter(key=>Number.isInteger(marks[key])&&marks[key]>=0&&marks[key]<={A:4,B:4,C:3,D:3,E:6}[key]).length;
  const annotations=Array.isArray(project?.stamps)?project.stamps.length:0;
  const rationaleCount=KEYS.filter(key=>String(project?.justifications?.[key]||'').trim().length>0).length;
  const completeMarks=markedCount===5;
  const total=completeMarks?KEYS.reduce((sum,key)=>sum+marks[key],0):null;
  return {
    id:String(id),
    savedAt:String(savedAt),
    candidate:String(project?.candidate||'').trim().slice(0,60),
    course:COURSE_SET.has(project?.course)?project.course:'AA SL',
    session:String(project?.session||'').trim().slice(0,50),
    pdfName:String(project?.pdfName||'uploaded-ia.pdf').slice(0,240),
    pageCount:Math.max(0,Number.isFinite(pageCount)?Math.trunc(pageCount):0),
    fileSize:pdfBytes?.byteLength||0,
    markedCount,annotations,rationaleCount,total,
    status:completeMarks?'All marks recorded':markedCount||annotations?'In progress':'Not started',
  };
}

function requestPromise(request){
  return new Promise((resolve,reject)=>{
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error||new Error('Browser storage request failed.'));
  });
}
function transactionPromise(tx){
  return new Promise((resolve,reject)=>{
    tx.oncomplete=()=>resolve();
    tx.onerror=()=>reject(tx.error||new Error('Browser storage transaction failed.'));
    tx.onabort=()=>reject(tx.error||new Error('Browser storage transaction was cancelled.'));
  });
}

export class LocalIAProjectVault {
  constructor(db){this.db=db;}
  async list(){
    const rows=await requestPromise(this.db.transaction('projectIndex','readonly').objectStore('projectIndex').getAll());
    return rows.sort((a,b)=>String(b.savedAt).localeCompare(String(a.savedAt)));
  }
  async get(id){
    return await requestPromise(this.db.transaction('projects','readonly').objectStore('projects').get(id));
  }
  async save({id,project,pdfBytes,pageCount,savedAt=new Date().toISOString()}){
    if(!id||!project||!pdfBytes?.byteLength)throw new Error('A project must contain its source PDF before it can be saved.');
    const summary=summariseLocalProject(id,project,pdfBytes,pageCount,savedAt);
    const tx=this.db.transaction(['projects','projectIndex'],'readwrite');
    const done=transactionPromise(tx);
    tx.objectStore('projects').put({id,project,pdfBytes,pageCount, savedAt});
    tx.objectStore('projectIndex').put(summary);
    await done;return summary;
  }
  async remove(id){
    const tx=this.db.transaction(['projects','projectIndex'],'readwrite');
    const done=transactionPromise(tx);
    tx.objectStore('projects').delete(id);
    tx.objectStore('projectIndex').delete(id);
    await done;
  }
  async eraseAll(){
    const names=['projects','projectIndex','draft'];
    const tx=this.db.transaction(names,'readwrite');
    const done=transactionPromise(tx);
    for(const name of names)tx.objectStore(name).clear();
    await done;
  }
  close(){this.db.close();}
}
export function openLocalIAProjectVault(factory=globalThis.indexedDB){
  if(!factory) return Promise.reject(new Error('IndexedDB is unavailable in this browser.'));
  return new Promise((resolve,reject)=>{
    const request=factory.open(LOCAL_IA_DB,LOCAL_IA_DB_VERSION);
    request.onupgradeneeded=(event)=>{
      const db=request.result,tx=request.transaction;
      if(!db.objectStoreNames.contains('draft'))db.createObjectStore('draft',{keyPath:'id'});
      const projects=db.objectStoreNames.contains('projects')?tx.objectStore('projects')
        :db.createObjectStore('projects',{keyPath:'id'});
      const index=db.objectStoreNames.contains('projectIndex')?tx.objectStore('projectIndex')
        :db.createObjectStore('projectIndex',{keyPath:'id'});
      // Preserve legacy v1 browser draft; migrate it atomically. The old
      // entry is deleted only if the entire upgrade transaction succeeds.
      if(event.oldVersion<2){
        const draft=tx.objectStore('draft');
        const legacy=draft.get('latest');
        legacy.onsuccess=()=>{
          const value=legacy.result;
          if(!value?.pdfBytes?.byteLength||!value?.project)return;
          const id='ia-migrated-'+String(value.date||'legacy').replace(/[^a-z0-9_-]/gi,'').slice(0,45);
          const savedAt=/^\d{4}-\d{2}-\d{2}T/.test(value.date||'')?value.date:new Date().toISOString();
          // The old v1 draft did not store a PDF page count. Never infer it
          // from the last stamped page: unstamped pages would be omitted.
          const pageCount=0;
          projects.put({id,project:value.project,pdfBytes:value.pdfBytes,pageCount,savedAt});
          index.put(summariseLocalProject(id,value.project,value.pdfBytes,pageCount,savedAt));
          draft.delete('latest');
        };
      }
    };
    request.onerror=()=>reject(request.error||new Error('Unable to open local project storage.'));
    request.onblocked=()=>reject(new Error('Another IA Marking Desk tab is preventing the storage upgrade. Close other tabs and refresh.'));
    request.onsuccess=()=>{
      const db=request.result;
      db.onversionchange=()=>db.close();
      resolve(new LocalIAProjectVault(db));
    };
  });
}
