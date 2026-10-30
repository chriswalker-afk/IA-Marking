(() => {
  'use strict';
  const FEEDBACK_MODE=new URLSearchParams(window.location.search).get('mode')==='feedback';
  const BUILT_IN=FEEDBACK_MODE
    ?(Array.isArray(window.IA_FEEDBACK_BANK)?window.IA_FEEDBACK_BANK:[])
    :(Array.isArray(window.IA_COMMENT_BANK)?window.IA_COMMENT_BANK:[]);
  const byId=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','"':'&quot;',"'":'&#39;'}[c]));
  const COMMENTS_KEY=FEEDBACK_MODE?'ia-marking-desk-feedback-comments':'ia-marking-desk-comments';
  const EDITS_KEY=FEEDBACK_MODE?'ia-marking-desk-feedback-edits':'ia-marking-desk-edits';
  const PICKS_KEY='ia-marking-desk-quick-picks-v1';
  function read(key,fallback){try{const value=JSON.parse(localStorage.getItem(key)||'null');return value??fallback;}catch{return fallback;}}
  let customs=read(COMMENTS_KEY,[]),edits=read(EDITS_KEY,{});
  const preference=read(PICKS_KEY,{});
  let favorites=Array.isArray(preference.favorites)?[...new Set(preference.favorites.filter(x=>typeof x==='string'))].slice(0,100):[];
  let favoritesOnly=false;
  function saveFavorites(){
    try{
      const previous=read(PICKS_KEY,{});
      localStorage.setItem(PICKS_KEY,JSON.stringify({...previous,favorites}));
    }catch(error){console.warn('Cannot save favourites',error);toast('Browser storage unavailable for favourites.');}
  }
  if(!Array.isArray(customs))customs=[];
  if(!edits||typeof edits!=='object'||Array.isArray(edits))edits={};
  let editingId=null,creating=false,toastTimer=null;
  byId(FEEDBACK_MODE?'referenceFeedbackMode':'referenceMarkingMode').setAttribute('aria-current','page');
  if(FEEDBACK_MODE){
    document.title='First draft feedback prompts | IA Marking Desk';
    document.querySelector('.reference-intro .eyebrow').textContent='STUDENT FIRST-DRAFT GUIDANCE';
    document.querySelector('.reference-intro h1').textContent='Actionable feedback stamp library';
    document.querySelector('.reference-intro p').textContent='Browse and adapt student-facing comments that identify a mathematical issue or a next step, without providing replacement solutions. These prompts are distinct from final-marking evidence.';
    document.querySelector('.reference-note').textContent='The feedback comments and their source-page links are adapted from the supplied 2021-2026 examiner-feedback synthesis, not official achievement descriptors. Changes you save here will be used in the feedback mode. Previously placed comments are not rewritten.';
    document.querySelector('.reference-brand small').textContent='Draft feedback library · A-E through November 2028';
    document.querySelector('.reference-stat span').textContent='draft feedback prompts';
    document.querySelector('.reference-header>a').textContent='← Back to IA review desk';
    byId('refSearch').placeholder='Search student actions, maths or reflection...';
    document.querySelector('.ref-search-label').firstChild.textContent='Search student feedback prompts';
    byId('refTone').querySelector('option[value="limitation"]').textContent='Improvement actions';
  }
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
      (!favoritesOnly||favorites.includes(item.id))&&
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
    byId('referenceFavoritesOnly').setAttribute('aria-pressed',String(favoritesOnly));
    byId('referenceFavoritesOnly').textContent=favoritesOnly?'★ Showing favourites':'☆ Show favourites';
    byId('referenceResults').innerHTML=visible.length?visible.map(item=>{
      const original=BUILT_IN.some(x=>x.id===item.id),changed=Boolean(edits[item.id]);
      return `<article class="ref-comment" data-ref-id="${esc(item.id)}">
       <div class="ref-comment-head"><span class="polarity ${item.tone==='limitation'?'limitation':'strength'}">${item.tone==='limitation'?(FEEDBACK_MODE?'Action':'Limitation'):'Strength'}</span><strong>${esc(item.criterion)} / ${esc(item.topic)}</strong><small>${esc(item.id)}${!original?' · Personal':changed?' · Edited':''}</small></div>
       <p>${esc(item.text)}</p>
       <div class="ref-comment-actions"><button type="button" class="${favorites.includes(item.id)?'ref-is-favourite':''}" data-action="favourite" data-id="${esc(item.id)}" aria-pressed="${favorites.includes(item.id)}">${favorites.includes(item.id)?'★ Saved favourite':'☆ Favourite'}</button><button type="button" data-action="copy" data-id="${esc(item.id)}">Copy comment</button><button type="button" data-action="edit" data-id="${esc(item.id)}">Edit</button>${changed?'<button type="button" data-action="restore" data-id="'+esc(item.id)+'">Restore original</button>':''}${!original?'<button class="ref-delete" type="button" data-action="delete" data-id="'+esc(item.id)+'">Delete</button>':''}</div>
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
    byId('referenceEditTitle').textContent=creating?'Add personal '+(FEEDBACK_MODE?'feedback':'comment'):'Edit '+(FEEDBACK_MODE?'feedback prompt':'evidence comment');
    byId('referenceEditCriterion').value=item?.criterion||'A';
    byId('referenceEditTone').value=item?.tone||'strength';
    byId('referenceEditCriterion').disabled=Boolean(builtIn);
    byId('referenceEditTone').disabled=Boolean(builtIn);
    byId('referenceEditTopic').value=item?.topic||'';
    byId('referenceEditText').value=item?.text||'';
    byId('referenceEditNote').textContent=builtIn
      ?'The criterion and feedback type stay fixed. Edits apply only to future stamps.'
      :'This personal '+(FEEDBACK_MODE?'student-facing feedback':'teacher evidence')+' comment will be available across all four Mathematics courses on this device.';
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
    if(action==='favourite'&&item){
      favorites=favorites.includes(id)?favorites.filter(x=>x!==id):[id,...favorites].slice(0,100);
      saveFavorites();render();toast(favorites.includes(id)?'Added to quick-stamp favourites.':'Removed from favourites.');return;
    }
    if(action==='copy'&&item){copy(item.text);return;}
    if(action==='edit'){openEdit(id);return;}
    if(action==='restore'){delete edits[id];save();render();toast('Original wording restored.');return;}
    if(action==='delete'&&confirm('Delete this personal comment from this browser?')){
      customs=customs.filter(x=>x.id!==id);save();render();toast('Personal comment deleted.');
    }
  });
  ['refSearch','refCourse','refCriterion','refTone'].forEach(id=>byId(id).addEventListener(id==='refSearch'?'input':'change',render));
  byId('referenceCreate').addEventListener('click',()=>openEdit());
  byId('referenceFavoritesOnly').addEventListener('click',()=>{
    favoritesOnly=!favoritesOnly;render();
  });
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
