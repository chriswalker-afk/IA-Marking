(() => {
  'use strict';
  const BUILT_IN=Array.isArray(window.IA_COMMENT_BANK)?window.IA_COMMENT_BANK:[];
  const byId=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','"':'&quot;',"'":'&#39;'}[c]));
  const COMMENTS_KEY='ia-marking-desk-comments', EDITS_KEY='ia-marking-desk-edits';
  function read(key,fallback){try{const value=JSON.parse(localStorage.getItem(key)||'null');return value??fallback;}catch{return fallback;}}
  let customs=read(COMMENTS_KEY,[]),edits=read(EDITS_KEY,{});
  if(!Array.isArray(customs))customs=[];
  if(!edits||typeof edits!=='object'||Array.isArray(edits))edits={};
  let editingId=null,creating=false,toastTimer=null;
  function toast(message){
    const el=byId('referenceToast');el.textContent=message;el.classList.remove('hidden');
    clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.add('hidden'),3500);
  }
  function save(){
    try{localStorage.setItem(COMMENTS_KEY,JSON.stringify(customs));localStorage.setItem(EDITS_KEY,JSON.stringify(edits));}
    catch(error){console.error('Library preferences could not be saved',error);toast('Browser storage unavailable. Copy comments before leaving.');}
  }
  function getComments(){
    return [...customs,...BUILT_IN.map(item=>{
      const edit=edits[item.id];return edit&&typeof edit.text==='string'&&edit.text.trim()
       ? {...item,text:edit.text.slice(0,1800),topic:String(edit.topic||item.topic).slice(0,90)}
       :item;
    })];
  }
  function filtered(){
    const search=byId('refSearch').value.toLowerCase().trim();
    const course=byId('refCourse').value,criterion=byId('refCriterion').value,tone=byId('refTone').value;
    return getComments().filter(item=>
      (course==='all'||(item.courses||[]).includes(course))&&
      (criterion==='all'||item.criterion===criterion)&&
      (tone==='all'||item.tone===tone)&&
      (!search||[item.id,item.topic,item.text,item.criterion,...(item.tags||[])].join(' ').toLowerCase().includes(search))
    );
  }
  function render(){
    const all=getComments(),visible=filtered();
    byId('referenceTotal').textContent=BUILT_IN.length;
    byId('referenceCount').textContent='Showing '+visible.length+' of '+all.length+' comments';
    byId('referenceCopyVisible').disabled=!visible.length;
    byId('referenceResults').innerHTML=visible.length?visible.map(item=>{
      const original=BUILT_IN.some(x=>x.id===item.id),changed=Boolean(edits[item.id]);
      return `<article class="ref-comment" data-ref-id="${esc(item.id)}">
       <div class="ref-comment-head"><span class="polarity ${item.tone==='limitation'?'limitation':'strength'}">${item.tone==='limitation'?'Limitation':'Strength'}</span><strong>${esc(item.criterion)} / ${esc(item.topic)}</strong><small>${esc(item.id)}${!original?' · Personal':changed?' · Edited':''}</small></div>
       <p>${esc(item.text)}</p>
       <div class="ref-comment-actions"><button type="button" data-action="copy" data-id="${esc(item.id)}">Copy comment</button><button type="button" data-action="edit" data-id="${esc(item.id)}">Edit</button>${changed?'<button type="button" data-action="restore" data-id="'+esc(item.id)+'">Restore original</button>':''}${!original?'<button class="ref-delete" type="button" data-action="delete" data-id="'+esc(item.id)+'">Delete</button>':''}</div>
       </article>`;
    }).join(''):'<p class="reference-empty">No comments match your search. Change the filters to see more.</p>';
  }
  async function copy(text){
    try{
      if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(text);
      else {const el=document.createElement('textarea');el.value=text;el.style.position='fixed';el.style.opacity='0';document.body.appendChild(el);el.focus();el.select();if(!document.execCommand('copy'))throw Error('Copy refused');el.remove();}
      toast('Copied to clipboard.');
    }catch(error){console.warn(error);toast('Clipboard access unavailable; select the comment text to copy manually.');}
  }
  function openEdit(id=null){
    creating=!id;editingId=id;
    const item=id?getComments().find(x=>x.id===id):null;
    if(id&&!item)return;
    const builtIn=item&&BUILT_IN.some(x=>x.id===item.id);
    byId('referenceEditTitle').textContent=creating?'Add personal comment':'Edit evidence comment';
    byId('referenceEditCriterion').value=item?.criterion||'A';
    byId('referenceEditTone').value=item?.tone||'strength';
    byId('referenceEditCriterion').disabled=Boolean(builtIn);
    byId('referenceEditTone').disabled=Boolean(builtIn);
    byId('referenceEditTopic').value=item?.topic||'';
    byId('referenceEditText').value=item?.text||'';
    byId('referenceEditNote').textContent=builtIn?'The built-in criterion and evidence type remain unchanged. Wording edits apply to future stamps only.':'This personal comment will be available across all four Mathematics courses in this browser.';
    byId('referenceEditDialog').showModal();
    byId('referenceEditText').focus();
  }
  function closeEdit(){byId('referenceEditDialog').close();editingId=null;creating=false;}
  function saveEdit(){
    const text=byId('referenceEditText').value.trim(),topic=byId('referenceEditTopic').value.trim();
    if(!text||!topic){toast('Both the category and comment text are required.');return;}
    if(creating){
      customs.unshift({id:'custom-'+(crypto?.randomUUID?.()||Date.now().toString(36)),criterion:byId('referenceEditCriterion').value,tone:byId('referenceEditTone').value,topic:topic.slice(0,90),text:text.slice(0,1800),tags:[],courses:['AA SL','AI SL','AA HL','AI HL'],origin:'Teacher custom comment'});
    }else{
      const original=BUILT_IN.find(x=>x.id===editingId);
      if(original){
        if(original.text===text&&original.topic===topic)delete edits[editingId];
        else edits[editingId]={text:text.slice(0,1800),topic:topic.slice(0,90)};
      }else{
        const custom=customs.find(x=>x.id===editingId);
        if(!custom)return;
        Object.assign(custom,{criterion:byId('referenceEditCriterion').value,tone:byId('referenceEditTone').value,topic:topic.slice(0,90),text:text.slice(0,1800)});
      }
    }
    save();closeEdit();render();toast('Comment saved for future use.');
  }
  byId('referenceResults').addEventListener('click',event=>{
    const button=event.target.closest('button[data-action]');if(!button)return;
    const {action,id}=button.dataset;
    const item=getComments().find(x=>x.id===id);
    if(action==='copy'&&item){copy(item.text);return;}
    if(action==='edit'){openEdit(id);return;}
    if(action==='restore'){delete edits[id];save();render();toast('Original wording restored.');return;}
    if(action==='delete'&&confirm('Delete this personal comment from this browser?')){
      customs=customs.filter(x=>x.id!==id);save();render();toast('Personal comment deleted.');
    }
  });
  ['refSearch','refCourse','refCriterion','refTone'].forEach(id=>byId(id).addEventListener(id==='refSearch'?'input':'change',render));
  byId('referenceCreate').addEventListener('click',()=>openEdit());
  byId('referenceSaveEdit').addEventListener('click',saveEdit);
  byId('referenceCancelEdit').addEventListener('click',closeEdit);
  byId('referenceCloseEdit').addEventListener('click',closeEdit);
  byId('referenceCopyVisible').addEventListener('click',()=>{
    const value=filtered().map(x=>x.criterion+' / '+x.topic+' ('+x.tone+')\n'+x.text).join('\n\n');
    if(value)copy(value);
  });
  if(!BUILT_IN.length){byId('referenceCount').textContent='Comment data could not be loaded; check the published comments.js asset.';}
  else render();
})();
