import * as pdfjsLib from './vendor/pdf.mjs';
window.pdfjsLib = pdfjsLib;
(() => {
  'use strict';

  const CRITERIA = {
    A: { name: 'Presentation', max: 4 },
    B: { name: 'Mathematical communication', max: 4 },
    C: { name: 'Personal engagement', max: 3 },
    D: { name: 'Reflection', max: 3 },
    E: { name: 'Use of mathematics', max: 6 },
  };
  const CRITERION_KEYS = Object.keys(CRITERIA);
  const BANK = window.IA_COMMENT_BANK || [];
  const STAMP_DEFAULTS = Object.freeze({size:20,strengthColor:'#477b97',limitationColor:'#b7803c'});
  const normalSize = value => Number.isFinite(Number(value)) ? Math.max(14,Math.min(42,Math.round(Number(value)))) : STAMP_DEFAULTS.size;
  const normalColor = (value,fallback) => typeof value==='string' && /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : fallback;
  function normalStyle(value={}) {
    return {size:normalSize(value?.size),strengthColor:normalColor(value?.strengthColor,STAMP_DEFAULTS.strengthColor),limitationColor:normalColor(value?.limitationColor,STAMP_DEFAULTS.limitationColor)};
  }
  function stampColor(stamp) {
    return normalColor(stamp?.color,stamp?.tone==='limitation'?state.stampStyle.limitationColor:state.stampStyle.strengthColor);
  }
  function brightColor(hex) {
    const [r,g,b]=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
    return (r*299+g*587+b*114)/1000>=158;
  }
  function stampTextColor(stamp){return brightColor(stampColor(stamp))?'#17283f':'#ffffff';}

  const $ = id => document.getElementById(id);
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const now = () => new Date().toISOString();
  const makeId = () => 'stamp-' + (crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const freshMarks = () => ({A:null,B:null,C:null,D:null,E:null});
  const sessionYear = () => Number(state.session.match(/\b20[0-9]{2}\b/)?.[0] || 0);
  const usesNewFramework = () => sessionYear() >= 2029;
  function updateFrameworkNotice() {
    const notice=$('frameworkNotice');
    if(usesNewFramework()) {
      notice.classList.add('warning');
      notice.textContent='Warning: the May 2029 and later IB Mathematics IA uses four different criteria (A-D). The A-E marking tool cannot export a valid assessment for this session.';
    } else {
      notice.classList.remove('warning');
      notice.textContent='A-E assessment framework (final assessment November 2028). The new May 2029 criteria are not supported by this version.';
    }
  }
  const freshJustifications = () => ({A:'',B:'',C:'',D:'',E:''});

  let state = {
    course:'AA SL', candidate:'', session:'', marks:freshMarks(), justifications:freshJustifications(),
    stamps:[], customComments:[], commentEdits:{}, stampStyle:normalStyle(), pdfName:'', pdfBytes:null,
  };
  let pdfDoc = null;
  let currentPage = 1;
  let zoom = 1;
  let tab = 'all';
  let tone = 'all';
  let search = '';
  let bankShowAll = false;
  let draft = null;
  let selectedStampId = null;
  let movingStampId = null;
  let rendering = 0;
  let activeRenderTask = null;
  let savingTimer = null;
  let toastTimer = null;
  let database = null;
  let viewScale = 1;
  let libraryEditingId = null;
  const MAX_BANK_VISIBLE = 42;

  function toast(message) {
    const el = $('toast');
    el.textContent = message;
    el.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.add('hidden'), 3800);
  }
  function saveSafeName() {
    return (state.candidate || 'maths-ia').trim().replace(/[^a-z0-9_-]+/gi,'-').replace(/^-|-$/g,'').slice(0,50) || 'maths-ia';
  }
  function setInstruction() {
    const bar = $('instructionBar');
    const cancel = $('cancelPlacement');
    if (movingStampId) {
      const stamp = state.stamps.find(s=>s.id === movingStampId);
      $('instructionText').textContent = `Move ${stamp?.criterion || ''} stamp: click its new position on the PDF.`;
      bar.classList.add('placing'); cancel.classList.remove('hidden');
    } else if (draft) {
      $('instructionText').textContent = `Placing criterion ${draft.criterion} ${draft.tone === 'strength' ? 'strength' : 'limitation'}: click beside the relevant evidence on the PDF.`;
      bar.classList.add('placing'); cancel.classList.remove('hidden');
    } else {
      $('instructionText').textContent = 'Select a comment from the bank, then click the relevant place on the PDF to add its stamp.';
      bar.classList.remove('placing'); cancel.classList.add('hidden');
    }
    $('stampLayer').classList.toggle('placing',Boolean(draft || movingStampId));
  }
  function getComments() {
    return [...state.customComments, ...BANK.map(item=>{
      const edit=state.commentEdits[item.id];
      return edit && typeof edit.text==='string' && edit.text.trim() ? {...item,text:edit.text.slice(0,1800),topic:String(edit.topic||item.topic).slice(0,90)} : item;
    })];
  }
  function saveLibrarySettings() {
    try {
      localStorage.setItem('ia-marking-desk-comments',JSON.stringify(state.customComments));
      localStorage.setItem('ia-marking-desk-edits',JSON.stringify(state.commentEdits));
      localStorage.setItem('ia-marking-desk-stamp-style',JSON.stringify(state.stampStyle));
    } catch(error) { console.warn('Browser preference storage unavailable',error); }
    scheduleSave();
  }
  async function copyCommentText(value) {
    try {
      if(navigator.clipboard?.writeText) await navigator.clipboard.writeText(String(value));
      else {
        const input=document.createElement('textarea');input.value=String(value);input.style.position='fixed';input.style.opacity='0';
        (document.querySelector('dialog[open]')||document.body).appendChild(input);input.focus();input.select();
        const successful=document.execCommand('copy');input.remove();
        if(!successful)throw Error('Clipboard permission denied');
      }
      toast('Comment copied to clipboard.');
    } catch(error) {console.warn(error);toast('Copy unavailable. Select and copy the text manually.');}
  }
  function renderStampStyle() {
    const size=state.stampStyle.size;
    $('defaultStampSize').value=String(size);
    $('defaultStampSizeValue').textContent=`${size} pt`;
    $('strengthStampColour').value=state.stampStyle.strengthColor;
    $('limitationStampColour').value=state.stampStyle.limitationColor;
    for(const [id,tone,letter] of [['previewStrength','strength','A'],['previewLimitation','limitation','D']]) {
      const el=$(id),stamp={tone};const color=stampColor(stamp);
      el.style.cssText=`width:${Math.min(size+4,42)}px;height:${Math.min(size+4,42)}px;background:${color};color:${stampTextColor(stamp)}`;
      el.textContent=letter;
    }
  }

  function selectedStamp() { return state.stamps.find(x => x.id === selectedStampId) || null; }
  function isReady() { return Boolean(pdfDoc && state.pdfBytes?.length); }
  function totalScore() {
    const scores = Object.values(state.marks);
    return scores.every(x => Number.isInteger(x)) ? scores.reduce((sum,v)=>sum+v,0) : null;
  }
  function niceBytes(bytes) { return bytes < 1048576 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1048576).toFixed(1)} MB`; }

  function initScores() {
    $('scoreStrip').innerHTML = CRITERION_KEYS.map(key => `<label class="score-item" title="Criterion ${key}: ${CRITERIA[key].name}"><span class="score-letter">${key}</span><span class="score-info"><span>${escapeHtml(CRITERIA[key].name)}</span><select data-score="${key}" aria-label="Mark for criterion ${key}"><option value="">-- / ${CRITERIA[key].max}</option>${Array.from({length:CRITERIA[key].max+1},(_,n)=>`<option value="${n}">${n} / ${CRITERIA[key].max}</option>`).join('')}</select></span></label>`).join('');
    $('scoreStrip').querySelectorAll('[data-score]').forEach(select => {
      select.addEventListener('change', () => setScore(select.dataset.score, select.value));
    });
    updateScores();
  }
  function setScore(key, raw) {
    if (!CRITERIA[key]) return;
    const score = raw === '' ? null : Number(raw);
    if (score !== null && (!Number.isInteger(score) || score < 0 || score > CRITERIA[key].max)) return;
    state.marks[key] = score;
    updateScores(); scheduleSave();
    if ($('reviewDialog').open) renderReview();
  }
  function updateScores() {
    $('scoreStrip').querySelectorAll('[data-score]').forEach(select => {
      select.value = state.marks[select.dataset.score] ?? '';
    });
    const total = totalScore();
    $('totalMark').innerHTML = `${total === null ? '--' : total}<small>/20</small>`;
  }
  function renderTabs() {
    $('criterionTabs').innerHTML = ['all',...CRITERION_KEYS].map(key => `<button class="criterion-tab ${tab===key?'active':''}" data-criterion="${key}" type="button" aria-pressed="${tab===key}">${key === 'all' ? 'All' : key}</button>`).join('');
    $('criterionTabs').querySelectorAll('button').forEach(b => b.addEventListener('click', () => {tab = b.dataset.criterion;bankShowAll = false;renderTabs();renderBank();}));
  }
  function renderBank() {
    const all = getComments().filter(item => (item.courses || []).includes(state.course));
    const query = search.toLowerCase().trim();
    const items = all.filter(item => (tab === 'all'||item.criterion === tab) && (tone === 'all'||item.tone === tone) && (!query || [item.text,item.topic,item.criterion,...(item.tags || [])].join(' ').toLowerCase().includes(query)));
    $('bankTotal').textContent = `${all.length} comments`;
    $('bankFilteredCount').textContent = `${items.length} matching ${items.length===1?'comment':'comments'}`;
    const visible = bankShowAll ? items : items.slice(0,MAX_BANK_VISIBLE);
    $('commentList').innerHTML = visible.map(item => `<div class="comment-card ${draft?.id===item.id?'is-active':''}"><button type="button" class="comment-select" data-comment-id="${escapeHtml(item.id)}" aria-label="Use ${escapeHtml(item.criterion)} ${escapeHtml(item.tone)} comment as stamp"><span class="comment-card-head"><span class="polarity ${item.tone}">${item.tone==='strength'?'Strength':'Limitation'}</span><span class="topic">${escapeHtml(item.criterion)} / ${escapeHtml(item.topic)}</span>${item.origin==='Teacher custom comment' ? '<span class="custom-tag">CUSTOM</span>' : ''}</span><p>${escapeHtml(item.text)}</p></button><div class="comment-card-actions"><button type="button" data-copy-comment="${escapeHtml(item.id)}">Copy</button><button type="button" data-edit-comment="${escapeHtml(item.id)}">Edit</button></div></div>`).join('');
    if(!visible.length) $('commentList').innerHTML = '<p class="bank-empty">No matching comments. Try another search or write your own.</p>';
    if(!bankShowAll && items.length>MAX_BANK_VISIBLE) $('commentList').insertAdjacentHTML('beforeend',`<button type="button" id="showMoreComments" class="btn subtle" style="width:100%">Show all ${items.length} comments</button>`);
    $('commentList').querySelectorAll('[data-comment-id]').forEach(button => button.addEventListener('click', () => prepareComment(button.dataset.commentId)));
    $('commentList').querySelectorAll('[data-copy-comment]').forEach(button => button.addEventListener('click',()=>{
      const item=getComments().find(c=>c.id===button.dataset.copyComment);if(item)copyCommentText(item.text);
    }));
    $('commentList').querySelectorAll('[data-edit-comment]').forEach(button => button.addEventListener('click',()=>openLibrary(button.dataset.editComment)));
    $('showMoreComments')?.addEventListener('click', () => {bankShowAll=true;renderBank();});
  }
  function filteredLibraryComments() {
    const query=$('librarySearch').value.toLowerCase().trim();
    const libraryCourse=$('libraryCourse').value;
    const criterion=$('libraryCriterion').value;
    const selectedTone=$('libraryTone').value;
    return getComments().filter(item => (libraryCourse==='all'||(item.courses||[]).includes(libraryCourse))
      && (criterion==='all'||item.criterion===criterion)
      && (selectedTone==='all'||item.tone===selectedTone)
      && (!query||[item.criterion,item.topic,item.text,...(item.tags||[])].join(' ').toLowerCase().includes(query)));
  }
  function renderFullLibrary() {
    const items=filteredLibraryComments();
    $('libraryCount').textContent=`Showing ${items.length} of ${getComments().length} library comments`;
    $('copyLibraryVisible').disabled=!items.length;
    $('libraryResults').innerHTML=items.length ? items.map(item=>{
      const isCustom=item.origin==='Teacher custom comment';
      const isChanged=Boolean(state.commentEdits[item.id]);
      const editing=item.id===libraryEditingId;
      return `<article class="library-entry" data-library-id="${escapeHtml(item.id)}"><div class="library-entry-header"><span class="polarity ${item.tone}">${item.tone==='strength'?'Strength':'Limitation'}</span><strong>${escapeHtml(item.criterion)} / ${escapeHtml(item.topic)}</strong><small>${escapeHtml(item.id)}${isCustom?' · Personal':isChanged?' · Edited':''}</small></div>${editing?`<div class="library-edit"><label>Category<input id="libraryEditTopic" maxlength="90" value="${escapeHtml(item.topic)}"></label><label>Comment<textarea id="libraryEditText" maxlength="1800" rows="4">${escapeHtml(item.text)}</textarea></label><div class="library-entry-actions"><button type="button" data-save-library="${escapeHtml(item.id)}" class="btn primary">Save changes</button><button type="button" data-cancel-library>Cancel</button>${isChanged?`<button type="button" data-restore-library="${escapeHtml(item.id)}">Restore original</button>`:''}${isCustom?`<button type="button" data-delete-library="${escapeHtml(item.id)}" class="danger-link">Delete personal comment</button>`:''}</div></div>`:`<p>${escapeHtml(item.text)}</p><div class="library-entry-actions"><button type="button" data-copy-library="${escapeHtml(item.id)}">Copy comment</button><button type="button" data-edit-library="${escapeHtml(item.id)}">Edit wording</button><button type="button" data-use-library="${escapeHtml(item.id)}">Use as stamp</button></div>`}</article>`;
    }).join(''):'<p class="bank-empty">No comments match these filters. Try removing the search terms.</p>';
  }
  function openLibrary(editId=null) {
    libraryEditingId=editId;
    $('libraryCourse').value='all';
    if(editId){
      const item=getComments().find(c=>c.id===editId);
      $('libraryCriterion').value=item?.criterion||'all';$('libraryTone').value=item?.tone||'all';$('librarySearch').value='';
    } else {
      $('libraryCriterion').value='all';$('libraryTone').value='all';$('librarySearch').value='';
    }
    renderFullLibrary();$('libraryDialog').showModal();
    if(editId){
      const entry=Array.from($('libraryResults').querySelectorAll('[data-library-id]')).find(e=>e.dataset.libraryId===editId);
      entry?.scrollIntoView({block:'center'});$('libraryEditText')?.focus();
    } else {$('librarySearch').focus();}
  }
  function saveLibraryEdit(id) {
    const item=getComments().find(c=>c.id===id);
    if(!item)return;
    const text=$('libraryEditText')?.value.trim();
    const topic=$('libraryEditTopic')?.value.trim();
    if(!text){toast('A library comment cannot be empty.');$('libraryEditText')?.focus();return;}
    if(!topic){toast('Enter a category for this comment.');$('libraryEditTopic')?.focus();return;}
    const custom=state.customComments.find(c=>c.id===id);
    if(custom){custom.text=text.slice(0,1800);custom.topic=topic.slice(0,90);}
    else {
      const original=BANK.find(c=>c.id===id);if(!original)return;
      if(text===original.text && topic===original.topic)delete state.commentEdits[id];
      else state.commentEdits[id]={text:text.slice(0,1800),topic:topic.slice(0,90)};
    }
    libraryEditingId=null;saveLibrarySettings();renderBank();renderFullLibrary();toast('Library comment saved for future use.');
  }
  function handleLibraryAction(event) {
    const button=event.target.closest('button[data-copy-library],button[data-edit-library],button[data-use-library],button[data-save-library],button[data-cancel-library],button[data-restore-library],button[data-delete-library]');
    if(!button)return;
    const id=button.dataset.copyLibrary||button.dataset.editLibrary||button.dataset.useLibrary||button.dataset.saveLibrary||button.dataset.restoreLibrary||button.dataset.deleteLibrary;
    const item=getComments().find(c=>c.id===id);
    if(button.dataset.copyLibrary && item){copyCommentText(item.text);return;}
    if(button.hasAttribute('data-edit-library')){libraryEditingId=id;renderFullLibrary();$('libraryEditText')?.focus();return;}
    if(button.hasAttribute('data-cancel-library')){libraryEditingId=null;renderFullLibrary();return;}
    if(button.hasAttribute('data-save-library')){saveLibraryEdit(id);return;}
    if(button.hasAttribute('data-use-library')){$('libraryDialog').close();libraryEditingId=null;prepareComment(id);return;}
    if(button.hasAttribute('data-restore-library')){delete state.commentEdits[id];libraryEditingId=null;saveLibrarySettings();renderBank();renderFullLibrary();toast('Original library wording restored.');return;}
    if(button.hasAttribute('data-delete-library')){
      if(!confirm('Delete this personal library comment? Previously placed stamps will not change.'))return;
      state.customComments=state.customComments.filter(c=>c.id!==id);libraryEditingId=null;
      saveLibrarySettings();renderBank();renderFullLibrary();toast('Personal comment removed from the library.');
    }
  }
  function renderTone() {
    document.querySelectorAll('[data-tone]').forEach(btn => {
      btn.classList.toggle('active',btn.dataset.tone===tone);
      btn.setAttribute('aria-pressed',String(btn.dataset.tone===tone));
    });
  }
  function prepareComment(id) {
    const item = getComments().find(c=>c.id===id);
    if(!item) return;
    selectedStampId = null; movingStampId = null;
    draft = {...item,size:state.stampStyle.size,color:item.tone==='strength'?state.stampStyle.strengthColor:state.stampStyle.limitationColor};
    renderEditor();renderBank();renderStamps();setInstruction();
    if(!isReady()) toast('Comment selected. Upload a PDF to place the stamp.');
  }
  function appearanceEditor(item,prefix) {
    const size=normalSize(item.size),color=stampColor(item);
    return `<div class="individual-stamp-style"><label for="${prefix}Size">Stamp size <output id="${prefix}SizeValue">${size} pt</output><input id="${prefix}Size" type="range" min="14" max="42" step="2" value="${size}"></label><label for="${prefix}Color">Stamp colour <input id="${prefix}Color" type="color" value="${color}"></label></div>`;
  }
  function bindAppearanceEditor(item,prefix,existing) {
    $(`${prefix}Size`).addEventListener('input',e=>{
      item.size=normalSize(e.target.value);$(`${prefix}SizeValue`).textContent=`${item.size} pt`;
      if(existing){renderStamps();scheduleSave();}
    });
    $(`${prefix}Color`).addEventListener('input',e=>{
      item.color=normalColor(e.target.value,stampColor(item));
      if(existing){renderStamps();scheduleSave();}
    });
  }
  function renderEditor() {
    const stamp = selectedStamp();
    if(stamp) {
      $('selectionEditor').innerHTML = `<div class="selection-active"><div class="selection-title"><strong>Edit ${stamp.criterion} evidence stamp</strong><small>Page ${stamp.page} / ${stamp.tone}</small></div><textarea id="stampTextEdit" maxlength="1800" aria-label="Edit only this placed stamp comment">${escapeHtml(stamp.text)}</textarea>${appearanceEditor(stamp,'selectedStamp')}<div class="edit-stamp-toolbar"><button id="moveStamp" class="btn subtle" type="button">Move position</button><button id="copyStamp" class="btn subtle" type="button">Copy text</button><button id="deleteStamp" class="link-button danger-link" type="button">Delete stamp</button></div></div>`;
      $('stampTextEdit').addEventListener('input', e => {stamp.text=e.target.value;renderStamps();scheduleSave();});
      bindAppearanceEditor(stamp,'selectedStamp',true);
      $('moveStamp').addEventListener('click',()=>{movingStampId=stamp.id;draft=null;selectedStampId=null;renderEditor();setInstruction(); if (currentPage!==stamp.page) navigate(stamp.page);});
      $('copyStamp').addEventListener('click',()=>copyCommentText(stamp.text));
      $('deleteStamp').addEventListener('click',()=>{state.stamps=state.stamps.filter(s=>s.id!==stamp.id);selectedStampId=null;renderEditor();renderStamps();scheduleSave();toast('Evidence stamp deleted.');});
      return;
    }
    if(!draft) {
      $('selectionEditor').innerHTML = '<div class="selection-empty"><span class="small-ring">A</span><span>Choose a comment to prepare a stamp.</span></div>';
      return;
    }
    $('selectionEditor').innerHTML = `<div class="selection-active"><div class="selection-title"><strong>Ready: criterion ${escapeHtml(draft.criterion)}</strong><span class="polarity ${draft.tone}">${draft.tone==='strength'?'Strength':'Limitation'}</span></div><textarea id="draftTextEdit" maxlength="1800" aria-label="Personalise only this stamp comment">${escapeHtml(draft.text)}</textarea>${appearanceEditor(draft,'draftStamp')}<div class="selection-actions"><small>Personalise this stamp before placing it on the PDF.</small><button type="button" class="btn primary" id="placeHint">${isReady()?'Click PDF to place':'Add PDF first'} &#8594;</button></div></div>`;
    $('draftTextEdit').addEventListener('input',e=>{draft.text=e.target.value;});
    bindAppearanceEditor(draft,'draftStamp',false);
    $('placeHint').addEventListener('click',()=>{
      if(!isReady()) $('pdfInput').click();
      else {$('pdfScroll').scrollIntoView({behavior:'smooth',block:'nearest'});toast('Click beside the evidence on the PDF to place this stamp.');}
    });
  }

  function pageStamps(page) { return state.stamps.filter(s=>s.page===page); }
  function stampLabel(stamp) { return `${stamp.criterion}${1+state.stamps.filter(s=>s.criterion===stamp.criterion).findIndex(s=>s.id===stamp.id)}`; }
  function renderStamps() {
    const stampsOnPage = pageStamps(currentPage);
    $('allPinCount').textContent = state.stamps.length;
    $('stampLayer').innerHTML = stampsOnPage.map(pin => {
      const diameter=Math.max(12,Math.round(normalSize(pin.size)*viewScale));
      return `<button type="button" class="pin ${pin.tone} ${pin.id===selectedStampId?'active':''}" data-pin-id="${escapeHtml(pin.id)}" style="left:${(pin.x*100).toFixed(4)}%;top:${(pin.y*100).toFixed(4)}%;width:${diameter}px;height:${diameter}px;font-size:${Math.max(9,Math.round(diameter*.51))}px;background:${stampColor(pin)};color:${stampTextColor(pin)}" title="${escapeHtml(stampLabel(pin)+': '+pin.text)}" aria-label="${escapeHtml(stampLabel(pin)+': '+pin.text)}">${pin.criterion}<em>${escapeHtml(stampLabel(pin).slice(1))}</em></button>`;
    }).join('');
    $('stampLayer').querySelectorAll('[data-pin-id]').forEach(btn=>{
      let moved = false;
      let pressX = 0, pressY = 0;
      btn.addEventListener('pointerdown',e=>{if(e.button!==0)return;pressX=e.clientX;pressY=e.clientY;btn.setPointerCapture?.(e.pointerId);});
      btn.addEventListener('pointermove',e=>{
        if(!btn.hasPointerCapture?.(e.pointerId))return;
        if(Math.hypot(e.clientX-pressX,e.clientY-pressY)<4&&!moved)return;
        moved=true;
        const point = positionOnPage(e);
        btn.style.left=`${point.x*100}%`;btn.style.top=`${point.y*100}%`;
      });
      btn.addEventListener('pointerup',e=>{
        const pin = state.stamps.find(p=>p.id===btn.dataset.pinId);
        if(!pin)return;
        if(moved){const pos=positionOnPage(e);pin.x=pos.x;pin.y=pos.y;scheduleSave();renderStamps();toast('Stamp position updated.');}
        else {selectedStampId=pin.id;draft=null;movingStampId=null;renderEditor();renderBank();setInstruction();renderStamps();}
        e.stopPropagation();
      });
      btn.addEventListener('click',e=>e.stopPropagation());
    });
    const container = $('stampsList');
    const sorted = [...state.stamps].sort((a,b)=>a.page-b.page || a.y-b.y);
    container.innerHTML = sorted.length ? sorted.map(stamp=>`<button type="button" class="stamp-row ${selectedStampId===stamp.id?'is-selected':''}" data-sidebar-pin="${escapeHtml(stamp.id)}"><span class="mini-circle ${stamp.tone}" style="background:${stampColor(stamp)};color:${stampTextColor(stamp)}">${stamp.criterion}</span><span class="stamp-info"><strong>Page ${stamp.page} &middot; ${stamp.tone==='strength'?'Strength':'Limitation'}</strong><span>${escapeHtml(stamp.text)}</span></span></button>`).join('') : '<p class="muted centered">Your evidence annotations will appear here.</p>';
    container.querySelectorAll('[data-sidebar-pin]').forEach(button=>button.addEventListener('click',()=>{
      const stamp=state.stamps.find(s=>s.id===button.dataset.sidebarPin);
      if (!stamp)return;
      selectedStampId=stamp.id;draft=null;movingStampId=null;
      if(currentPage!==stamp.page)navigate(stamp.page);
      else renderStamps();
      renderEditor();renderBank();setInstruction();
    }));
  }
  function positionOnPage(event) {
    const box = $('stampLayer').getBoundingClientRect();
    return {
      x: Math.max(.01, Math.min(.99,(event.clientX-box.left)/box.width)),
      y: Math.max(.01, Math.min(.99,(event.clientY-box.top)/box.height)),
    };
  }
  function handlePageClick(event) {
    if(!isReady()||event.target.closest('.pin'))return;
    const position = positionOnPage(event);
    if(movingStampId) {
      const stamp = state.stamps.find(s=>s.id===movingStampId);
      if(!stamp)return;
      stamp.x=position.x;stamp.y=position.y;stamp.page=currentPage;
      selectedStampId=stamp.id;movingStampId=null;renderStamps();renderEditor();setInstruction();scheduleSave();toast('Stamp moved.');
      return;
    }
    if(!draft)return;
    if(!draft.text.trim()){toast('Write a comment before placing the stamp.');return;}
    const stamp = {id:makeId(),page:currentPage,x:position.x,y:position.y,criterion:draft.criterion,tone:draft.tone,topic:draft.topic,text:draft.text.trim(),size:normalSize(draft.size),color:stampColor(draft),libraryId:draft.id,createdAt:now()};
    state.stamps.push(stamp);selectedStampId=stamp.id;draft=null;
    renderStamps();renderEditor();renderBank();setInstruction();scheduleSave();
    toast(`${stamp.criterion} ${stamp.tone} stamp placed on page ${currentPage}.`);
  }
  async function loadPdf(bytes,name,keepStamps=false) {
    if(!window.pdfjsLib){toast('PDF renderer unavailable. Check your connection and reload.');return false;}
    const clone = new Uint8Array(bytes);
    try {
      const loaded = await pdfjsLib.getDocument({
        data:new Uint8Array(clone),isEvalSupported:false,
        cMapUrl:'vendor/cmaps/',cMapPacked:true,standardFontDataUrl:'vendor/standard_fonts/',wasmUrl:'vendor/wasm/'
      }).promise;
      if(!keepStamps){state.stamps=[];state.marks=freshMarks();state.justifications=freshJustifications();selectedStampId=null;movingStampId=null;draft=null;}
      pdfDoc=loaded;state.pdfBytes=clone;state.pdfName=name || 'uploaded-ia.pdf';
      currentPage=1;zoom=1;
      $('emptyViewer').classList.add('hidden');$('pageShell').classList.remove('hidden');
      $('uploadTitle').textContent='Replace PDF';$('uploadSubtext').textContent='Click to choose a new final IA';
      $('documentMeta').classList.remove('hidden');$('documentName').textContent=state.pdfName;
      $('documentDetails').textContent=`${loaded.numPages} pages  /  ${niceBytes(clone.byteLength)}`;
      $('pageTotal').textContent=String(loaded.numPages);$('pageNumber').max=String(loaded.numPages);
      $('footerDocInfo').textContent=`${loaded.numPages} pages  /  ${state.pdfName}`;
      updateScores();renderEditor();renderStamps();setInstruction();
      await renderPage();scheduleSave();
      return true;
    } catch(e) {console.error(e);toast('Could not open the PDF. It may be password-protected or damaged.');return false;}
  }
  async function renderPage() {
    if(!isReady())return;
    const token = ++rendering;
    try {
      if (activeRenderTask) { try { activeRenderTask.cancel(); } catch (_) {} }
      const page = await pdfDoc.getPage(currentPage);
      if(token!==rendering)return;
      const original = page.getViewport({scale:1});
      const baseWidth = Math.max(250,$('pdfScroll').clientWidth-58);
      const scale = Math.min(1.5,baseWidth/original.width) * zoom;
      const viewport = page.getViewport({scale});
      viewScale=viewport.width/original.width;
      const displayRatio = Math.min(window.devicePixelRatio || 1,2);
      const canvas = $('pdfCanvas');
      canvas.width = Math.floor(viewport.width*displayRatio);
      canvas.height = Math.floor(viewport.height*displayRatio);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      $('pageShell').style.width=`${viewport.width}px`;
      $('pageShell').style.height=`${viewport.height}px`;
      $('stampLayer').style.width=`${viewport.width}px`;
      $('stampLayer').style.height=`${viewport.height}px`;
      const context=canvas.getContext('2d',{alpha:false});
      activeRenderTask = page.render({canvasContext:context,viewport,transform:displayRatio!==1?[displayRatio,0,0,displayRatio,0,0]:null});
      await activeRenderTask.promise;
      if (token === rendering) activeRenderTask = null;
      if(token!==rendering)return;
      $('pageNumber').value=currentPage;
      $('prevPage').disabled=currentPage<=1;
      $('nextPage').disabled=currentPage>=pdfDoc.numPages;
      $('zoomLabel').textContent=zoom===1?'Fit':`${Math.round(zoom*100)}%`;
      renderStamps();
    }catch(e){if(e?.name==='RenderingCancelledException')return;console.error(e);toast('Could not render this PDF page.');}
  }
  function navigate(page) {
    if(!isReady())return;
    const next = Math.max(1,Math.min(pdfDoc.numPages,Math.floor(Number(page)||1)));
    currentPage=next;
    $('pdfScroll').scrollTop=0;
    $('pdfScroll').scrollLeft=0;
    renderPage();
  }

  async function storeAutosave() {
    if(!database||!state.pdfBytes?.length)return;
    try {
      const tx=database.transaction('draft','readwrite');
      tx.objectStore('draft').put({id:'latest',date:now(),project:projectData(false),pdfBytes:state.pdfBytes});
    } catch(e){console.warn('Browser autosave failed',e);}
  }
  function scheduleSave() {
    clearTimeout(savingTimer);
    savingTimer=setTimeout(storeAutosave,1400);
  }
  function projectData(includePdf=true) {
    return {
      format:'ia-marking-desk',version:1,createdAt:now(),
      course:state.course,candidate:state.candidate,session:state.session,
      marks:{...state.marks},justifications:{...state.justifications},
      stamps:state.stamps.map(s=>({...s})),pdfName:state.pdfName,
      stampStyle:{...state.stampStyle},customComments:state.customComments.map(x=>({...x})),commentEdits:{...state.commentEdits},
      ...(includePdf ? {pdfBase64:base64FromBytes(state.pdfBytes || new Uint8Array())} : {}),
    };
  }
  function base64FromBytes(bytes) {
    const step=0x8000,parts=[];
    for(let i=0;i<bytes.length;i+=step) parts.push(String.fromCharCode(...bytes.subarray(i,i+step)));
    return btoa(parts.join(''));
  }
  function bytesFromBase64(data) {
    const binary=atob(data);const array=new Uint8Array(binary.length);
    for(let i=0;i<binary.length;i++)array[i]=binary.charCodeAt(i);
    return array;
  }
  function download(blob,filename) {
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),60000);
  }
  function saveProject() {
    if(!isReady()){toast('Upload a PDF before saving a project.');return;}
    const data=projectData();
    download(new Blob([JSON.stringify(data)],{type:'application/json'}),`${saveSafeName()}.iamark.json`);
    toast('Editable project saved locally, including the original PDF.');
  }
  async function openProjectFile(file) {
    if(!file)return;
    try {
      const data=JSON.parse(await file.text());
      if(data.format!=='ia-marking-desk'||data.version!==1||typeof data.pdfBase64!=='string')throw Error('Not a supported IA Marking Desk project.');
      const bytes=bytesFromBase64(data.pdfBase64);
      const success=await loadPdf(bytes,data.pdfName || 'saved-ia.pdf',true);
      if(!success)return;
      restoreMetadata(data);
      toast('Marking project restored.');
    } catch(e) {console.error(e);toast('Could not open project. Please choose a valid .iamark.json file.');}
  }
  function restoreMetadata(data) {
    const candidateCourse=['AA SL','AI SL','AA HL','AI HL'].includes(data.course)?data.course:'AA SL';
    state.course=candidateCourse;
    state.candidate=String(data.candidate||'').slice(0,60);
    state.session=String(data.session||'').slice(0,50);
    state.marks=freshMarks();state.justifications=freshJustifications();
    for(const key of CRITERION_KEYS){
      const value=data.marks?.[key];
      if(Number.isInteger(value)&&value>=0&&value<=CRITERIA[key].max) state.marks[key]=value;
      state.justifications[key]=String(data.justifications?.[key]||'').slice(0,5000);
    }
    // Library preferences travel with the project, while old v1 projects remain compatible.
    if(data.stampStyle)state.stampStyle=normalStyle(data.stampStyle);
    if(data.commentEdits && typeof data.commentEdits==='object' && !Array.isArray(data.commentEdits)){
      for(const [id,change] of Object.entries(data.commentEdits)){
        if(!BANK.some(item=>item.id===id)||typeof change?.text!=='string'||!change.text.trim())continue;
        const original=BANK.find(item=>item.id===id);
        state.commentEdits[id]={text:change.text.slice(0,1800),topic:String(change.topic||original.topic).slice(0,90)};
      }
    }
    if(Array.isArray(data.customComments)){
      const unique=new Map(state.customComments.map(c=>[c.id,c]));
      for(const item of data.customComments){
        if(typeof item?.id==='string' && item.id.startsWith('custom-') && CRITERIA[item.criterion] && ['strength','limitation'].includes(item.tone) && typeof item.text==='string' && item.text.trim()){
          unique.set(item.id,{...item,text:item.text.slice(0,1800),topic:String(item.topic||'Personal evidence').slice(0,90),courses:['AA SL','AA HL','AI SL','AI HL']});
        }
      }
      state.customComments=[...unique.values()];
    }
    state.stamps=(Array.isArray(data.stamps)?data.stamps:[]).filter(s=>CRITERIA[s.criterion]&&Number.isInteger(s.page)&&s.page>=1&&s.page<=pdfDoc.numPages&&['strength','limitation'].includes(s.tone)&&Number.isFinite(s.x)&&Number.isFinite(s.y)).map(s=>({
      id:String(s.id||makeId()),page:s.page,x:Math.min(.99,Math.max(.01,s.x)),y:Math.min(.99,Math.max(.01,s.y)),criterion:s.criterion,
      tone:s.tone,topic:String(s.topic||'Evidence').slice(0,100),text:String(s.text||'').slice(0,1800),
      size:normalSize(s.size),color:normalColor(s.color,s.tone==='strength'?state.stampStyle.strengthColor:state.stampStyle.limitationColor),
      libraryId:String(s.libraryId||''),createdAt:String(s.createdAt||now()),
    }));
    $('course').value=state.course;$('candidate').value=state.candidate;$('session').value=state.session;updateFrameworkNotice();
    tab='all';selectedStampId=null;draft=null;movingStampId=null;
    saveLibrarySettings();renderStampStyle();updateScores();renderTabs();renderBank();renderEditor();renderStamps();setInstruction();scheduleSave();
  }
  function initDatabase() {
    if(!('indexedDB' in window))return;
    let request;
    try {request=indexedDB.open('ia-marking-desk-local-v1',1);}
    catch(error){console.warn('Browser draft storage unavailable',error);return;}
    request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains('draft'))request.result.createObjectStore('draft',{keyPath:'id'});};
    request.onerror=()=>console.warn('Browser draft storage was blocked. Save editable projects explicitly.');
    request.onsuccess=()=>{
      database=request.result;
      const tx=database.transaction('draft','readonly');
      const get=tx.objectStore('draft').get('latest');
      get.onsuccess=()=>{if(get.result?.pdfBytes?.length&&!isReady()){$('resumeLast').classList.remove('hidden');$('resumeLast').dataset.ready='yes';}};
    };
  }
  async function resumeAutosave() {
    if(!database)return;
    const request=database.transaction('draft','readonly').objectStore('draft').get('latest');
    request.onsuccess=async()=>{
      const saved=request.result;
      if(!saved?.pdfBytes?.length){toast('No browser draft is available.');return;}
      const success=await loadPdf(saved.pdfBytes,saved.project?.pdfName||'autosaved-ia.pdf',true);
      if(success){restoreMetadata(saved.project);$('resumeLast').classList.add('hidden');toast('Browser draft resumed.');}
    };
  }
  function resetProject() {
    if((isReady()||state.stamps.length)&&!confirm('Start a new project? Unsaved project changes will be cleared.'))return;
    state={...state,course:'AA SL',candidate:'',session:'',marks:freshMarks(),justifications:freshJustifications(),stamps:[],pdfName:'',pdfBytes:null};
    rendering++;if(activeRenderTask){try{activeRenderTask.cancel();}catch(_){}}
    pdfDoc=null;currentPage=1;zoom=1;viewScale=1;draft=null;selectedStampId=null;movingStampId=null;
    $('course').value='AA SL';$('candidate').value='';$('session').value='';
    $('emptyViewer').classList.remove('hidden');$('pageShell').classList.add('hidden');
    $('documentMeta').classList.add('hidden');$('uploadTitle').textContent='Upload student IA';$('uploadSubtext').textContent='Drop a PDF here or browse files';
    $('pageTotal').textContent='--';$('pageNumber').value=1;$('footerDocInfo').textContent='Awaiting a PDF';
    $('pdfInput').value='';$('projectOpen').value='';
    if(database){try{database.transaction('draft','readwrite').objectStore('draft').delete('latest');}catch(e){console.warn(e);}}
    $('resumeLast').classList.add('hidden');updateFrameworkNotice();updateScores();renderTabs();renderBank();renderEditor();renderStamps();setInstruction();toast('New marking project started.');
  }

  function renderReview() {
    const missing = CRITERION_KEYS.filter(k=>state.marks[k]===null);
    const noEvidence = CRITERION_KEYS.filter(k=>!state.stamps.some(s=>s.criterion===k));
    $('reviewStatus').className=`review-status ${missing.length?'warning':''}`;
    $('reviewStatus').textContent=missing.length ? `${missing.length} criterion marks are not yet selected. Export remains available as a draft, but it must not be treated as a complete final assessment.` : `All five marks are recorded: ${totalScore()}/20. ${state.stamps.length} evidence stamps are currently placed across the exploration.`;
    $('reviewScores').innerHTML=CRITERION_KEYS.map(key=>{
      const meta=CRITERIA[key],count=state.stamps.filter(s=>s.criterion===key).length;
      return `<section class="review-score"><div class="review-score-header"><span class="mini-circle">${key}</span><strong>${escapeHtml(meta.name)}</strong><span class="evidence-count">${count} ${count===1?'stamp':'stamps'}</span><select data-review-score="${key}" aria-label="Criterion ${key} final mark"><option value="">-- / ${meta.max}</option>${Array.from({length:meta.max+1},(_,n)=>`<option value="${n}" ${state.marks[key]===n?'selected':''}>${n} / ${meta.max}</option>`).join('')}</select></div><small>Briefly justify this mark, referring to the annotated evidence on the pages.</small><textarea data-review-justification="${key}" aria-label="Criterion ${key} assessment rationale" maxlength="5000" rows="2" placeholder="Assessment rationale for criterion ${key}...">${escapeHtml(state.justifications[key])}</textarea></section>`;
    }).join('');
    $('reviewScores').querySelectorAll('[data-review-score]').forEach(sel=>sel.addEventListener('change',()=>setScore(sel.dataset.reviewScore,sel.value)));
    $('reviewScores').querySelectorAll('[data-review-justification]').forEach(ta=>ta.addEventListener('input',e=>{state.justifications[ta.dataset.reviewJustification]=e.target.value;scheduleSave();}));
    if(noEvidence.length) $('reviewStatus').textContent += ` No page evidence is stamped yet for: ${noEvidence.join(', ')}.`;
    if(usesNewFramework()) {
      $('reviewStatus').classList.add('warning');
      $('reviewStatus').textContent='Export blocked: from May 2029, IB Mathematics uses four new IA criteria. Choose a session through November 2028 for A-E marking, or use the new criteria outside this prototype.';
    }
  }

  function sanitizePdfText(text) {
    return String(text??'').replace(/\u2018|\u2019/g,"'").replace(/\u201c|\u201d/g,'"').replace(/[\u2013\u2014]/g,'-').replace(/\u2026/g,'...').replace(/\u00a0/g,' ')
      .replace(/\u03c7\u00b2/g,'chi-squared').replace(/\u03c0/g,'pi').replace(/\u03a3/g,'sum').replace(/\u03b1/g,'alpha').replace(/\u03b2/g,'beta')
      .replace(/\u2264/g,'<=').replace(/\u2265/g,'>=').replace(/\u2248/g,'approximately').replace(/[^\x20-\x7e\n\r]/g,'?');
  }
  function pdfWrap(text,font,size,maxWidth) {
    const words = sanitizePdfText(text).replace(/\r/g,'').split(/\s+/).filter(Boolean);
    const rows=[];let line='';
    for(const word of words){
      const candidate=line?line+' '+word:word;
      if(font.widthOfTextAtSize(candidate,size)<=maxWidth){line=candidate;continue;}
      if(line)rows.push(line);
      if(font.widthOfTextAtSize(word,size)<=maxWidth)line=word;
      else {
        let part='';for(const char of word){if(font.widthOfTextAtSize(part+char,size)>maxWidth && part){rows.push(part);part='';}part+=char;}
        line=part;
      }
    }
    if(line)rows.push(line);
    return rows.length?rows:[''];
  }
  function pdfColor(stamp) {
    const hex=stampColor(stamp);
    return window.PDFLib.rgb(...[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255));
  }
  function pdfTextColor(stamp){return brightColor(stampColor(stamp))?window.PDFLib.rgb(.09,.16,.25):window.PDFLib.rgb(1,1,1);}
  function pdfNoteColor(stamp){return brightColor(stampColor(stamp))?window.PDFLib.rgb(.17,.25,.33):pdfColor(stamp);}

  function pdfFaint(tone){return tone==='strength'?window.PDFLib.rgb(.94,.97,.98):window.PDFLib.rgb(1,.977,.941);}
  function pdfText(page,text,x,y,size,font,color) {page.drawText(sanitizePdfText(text),{x,y,size,font,color});}
  async function exportPdf() {
    if(!isReady()){toast('Upload an IA before exporting its annotations.');return;}
    if(usesNewFramework()){toast('May 2029 or later needs the new four-criterion IB framework; A-E export is blocked.');return;}
    if(!window.PDFLib){toast('PDF export library unavailable. Check your connection and reload.');return;}
    const button=$('exportAnnotated');button.disabled=true;button.textContent='Preparing PDF...';
    try {
      const {PDFDocument,StandardFonts,rgb}=window.PDFLib;
      const source=await PDFDocument.load(state.pdfBytes,{ignoreEncryption:false});
      const output=await PDFDocument.create();
      const font=await output.embedFont(StandardFonts.Helvetica);
      const bold=await output.embedFont(StandardFonts.HelveticaBold);
      const pages=source.getPages();
      const embeds=await output.embedPages(pages);
      const COL=304;const PADDING=14;const ink=rgb(.17,.25,.33),muted=rgb(.45,.53,.60),line=rgb(.83,.88,.90);
      const overflow=[];
      for(let i=0;i<pages.length;i++){
        const sourceSize=pages[i].getSize();const w=sourceSize.width,h=sourceSize.height;
        const p=output.addPage([w+COL,h]);
        p.drawRectangle({x:0,y:0,width:w+COL,height:h,color:rgb(1,1,1)});
        p.drawPage(embeds[i],{x:0,y:0,width:w,height:h});
        p.drawLine({start:{x:w+1,y:0},end:{x:w+1,y:h},thickness:.8,color:line});
        pdfText(p,`PAGE ${i+1} | ASSESSMENT EVIDENCE`,w+15,h-21,9,bold,muted);
        p.drawLine({start:{x:w+15,y:h-31},end:{x:w+COL-15,y:h-31},thickness:.5,color:line});
        const notes=pageStamps(i+1).sort((a,b)=>a.y-b.y);
        let occupiedTop=41;
        for(const stamp of notes){
          const c=pdfColor(stamp);const noteColor=pdfNoteColor(stamp);const label=stampLabel(stamp);const radius=normalSize(stamp.size)/2;
          const x=Math.min(w-radius-2,Math.max(radius+2,stamp.x*w));const y=Math.min(h-radius-2,Math.max(radius+2,(1-stamp.y)*h));
          p.drawCircle({x,y,size:radius,color:c,borderWidth:Math.max(1.2,radius*.14),borderColor:rgb(1,1,1)});
          const letterSize=Math.min(21,Math.max(9,radius*.97));
          const tW=bold.widthOfTextAtSize(stamp.criterion,letterSize);
          pdfText(p,stamp.criterion,x-tW/2,y-letterSize*.34,letterSize,bold,pdfTextColor(stamp));
          const number=label.slice(1),smallRadius=Math.max(4,radius*.47);
          const nx=x+radius*.82,ny=y-radius*.84;
          p.drawCircle({x:nx,y:ny,size:smallRadius,color:rgb(1,1,1),borderWidth:.65,borderColor:c});
          const numberSize=Math.max(5,Math.min(8,smallRadius*.98));
          pdfText(p,number,nx-bold.widthOfTextAtSize(number,numberSize)/2,ny-numberSize*.32,numberSize,bold,noteColor);
          const rows=pdfWrap(stamp.text,font,9.45,COL-45);
          const boxHeight=22+rows.length*13+10;
          const idealTop=Math.max(42,h-y-13);
          const top=Math.max(idealTop,occupiedTop);
          if(top+boxHeight > h-15){overflow.push({stamp,page:i+1});continue;}
          const bottom=h-top-boxHeight;
          p.drawRectangle({x:w+13,y:bottom,width:COL-27,height:boxHeight,color:pdfFaint(stamp.tone),borderColor:line,borderWidth:.5});
          p.drawRectangle({x:w+13,y:bottom,width:3,height:boxHeight,color:c});
          pdfText(p,`${label}  ${stamp.tone==='strength'?'STRENGTH':'LIMITATION'}`,w+22,bottom+boxHeight-16,9,bold,noteColor);
          rows.forEach((row,idx)=>pdfText(p,row,w+22,bottom+boxHeight-33-idx*13,9.45,font,ink));
          occupiedTop=top+boxHeight+8;
        }
        if(!notes.length)pdfText(p,'No evidence stamps on this page.',w+15,h-54,9.5,font,muted);
        const pageBottom=`IA Marking Desk | ${sanitizePdfText(state.candidate||'Unidentified assessment')}`;
        pdfText(p,pageBottom,w+15,9,7.2,font,muted);
      }
      // Overcrowded margins get an overflow page, so comments are never clipped or omitted.
      if(overflow.length){
        let page=null,y=0;
        for(const item of overflow){
          const label=stampLabel(item.stamp),rows=pdfWrap(item.stamp.text,font,10.5,520);
          const height=34+rows.length*14;
          if(!page||y-height<45){page=output.addPage([595,842]);page.drawRectangle({x:0,y:0,width:595,height:842,color:rgb(1,1,1)});pdfText(page,'CONTINUED ASSESSMENT EVIDENCE',35,795,16,bold,ink);y=762;}
          pdfText(page,`${label} | Original page ${item.page} | ${item.stamp.tone}`,35,y,10.5,bold,pdfNoteColor(item.stamp));
          rows.forEach((row,index)=>pdfText(page,row,35,y-18-index*14,10.5,font,ink));
          y-=height+9;
        }
      }
      // A clear criterion summary is included as teacher assessment evidence.
      let sum=null;
      let cursor=776;
      function newSummary() {
        sum=output.addPage([595,842]);sum.drawRectangle({x:0,y:0,width:595,height:842,color:rgb(1,1,1)});
        cursor=777;
        pdfText(sum,'IA MARKING RECORD',37,806,18,bold,ink);
        pdfText(sum,'Teacher assessment | independent marking aid',37,788,9,font,muted);
        sum.drawLine({start:{x:37,y:777},end:{x:558,y:777},thickness:.8,color:line});
        cursor=753;
      }
      newSummary();
      pdfText(sum,`Course: ${state.course}     Assessment ID: ${state.candidate||'Not entered'}`,37,cursor,10.5,font,ink);cursor-=19;
      pdfText(sum,`Session: ${state.session||'Not entered'}     Final total: ${totalScore()===null?'INCOMPLETE':totalScore()+' / 20'}`,37,cursor,10.5,bold,ink);cursor-=32;
      pdfText(sum,'Framework: criteria A-E (last assessment November 2028)',37,cursor,9,font,muted);cursor-=27;
      for(const key of CRITERION_KEYS){
        const notes=state.stamps.filter(s=>s.criterion===key).length;
        const justification=state.justifications[key].trim() || 'No separate rationale recorded; refer to the annotations on the exploration.';
        const lines=pdfWrap(justification,font,10.5,515);
        if(cursor<110)newSummary();
        pdfText(sum,`${key}. ${CRITERIA[key].name} | ${state.marks[key]===null?'Not scored':`${state.marks[key]} / ${CRITERIA[key].max}`}`,37,cursor,12,bold,ink);
        pdfText(sum,`${notes} on-script evidence ${notes===1?'stamp':'stamps'}`,37,cursor-17,9,font,muted);
        cursor-=37;
        for(const text of lines){
          if(cursor<57){
            newSummary();
            pdfText(sum,`${key}. ${CRITERIA[key].name} (continued)`,37,cursor,11,bold,ink);
            cursor-=28;
          }
          pdfText(sum,text,37,cursor,10.5,font,ink);
          cursor-=15;
        }
        cursor-=25;
        if(cursor>=40) sum.drawLine({start:{x:37,y:cursor+12},end:{x:558,y:cursor+12},thickness:.5,color:line});
      }
      if(cursor<50)newSummary();
      pdfText(sum,'Check the applicable official IB guide before final submission.',37,Math.max(34,cursor-13),9,font,muted);
      output.setTitle(`Maths IA assessment - ${state.candidate || 'exploration'}`);
      output.setSubject('Teacher annotation and criterion marking record');
      output.setProducer('IA Marking Desk - local browser export');
      const data=await output.save();
      download(new Blob([data],{type:'application/pdf'}),`${saveSafeName()}-annotated.pdf`);
      toast('Annotated PDF exported. Open it and inspect page layout, comments and anonymity.');
    }catch(err){console.error(err);toast('PDF export failed. Please save your editable project and check the console.');}
    finally {button.disabled=false;button.innerHTML='Export annotated PDF <span aria-hidden="true">&#8595;</span>';}
  }

  function initStampStyleEvents() {
    $('defaultStampSize').addEventListener('input',e=>{state.stampStyle.size=normalSize(e.target.value);renderStampStyle();saveLibrarySettings();});
    $('strengthStampColour').addEventListener('input',e=>{state.stampStyle.strengthColor=normalColor(e.target.value,STAMP_DEFAULTS.strengthColor);renderStampStyle();saveLibrarySettings();});
    $('limitationStampColour').addEventListener('input',e=>{state.stampStyle.limitationColor=normalColor(e.target.value,STAMP_DEFAULTS.limitationColor);renderStampStyle();saveLibrarySettings();});
    $('applyStampStyle').addEventListener('click',()=>{
      if(!state.stamps.length){toast('No placed stamps yet. These settings will be used for new stamps.');return;}
      for(const stamp of state.stamps){stamp.size=state.stampStyle.size;stamp.color=stamp.tone==='strength'?state.stampStyle.strengthColor:state.stampStyle.limitationColor;}
      renderStamps();renderEditor();scheduleSave();toast(`Updated the appearance of all ${state.stamps.length} existing stamps.`);
    });
  }
  function initEvents() {
    $('course').addEventListener('change',e=>{state.course=e.target.value;renderBank();scheduleSave();});
    $('candidate').addEventListener('input',e=>{state.candidate=e.target.value;scheduleSave();});
    $('session').addEventListener('input',e=>{state.session=e.target.value;updateFrameworkNotice();scheduleSave();});
    $('pdfInput').addEventListener('change',e=>{const file=e.target.files?.[0];if(file)handlePdfFile(file);e.target.value='';});
    $('replacePdf').addEventListener('click',()=> $('pdfInput').click());
    $('newProject').addEventListener('click',resetProject);
    $('projectSave').addEventListener('click',saveProject);
    $('exportProject').addEventListener('click',saveProject);
    $('projectOpen').addEventListener('change',e=>{const file=e.target.files?.[0];if(file)openProjectFile(file);e.target.value='';});
    $('resumeLast').addEventListener('click',resumeAutosave);
    $('dropzone').addEventListener('dragover',e=>{e.preventDefault();$('dropzone').classList.add('dragover');});
    $('dropzone').addEventListener('dragleave',()=> $('dropzone').classList.remove('dragover'));
    $('dropzone').addEventListener('drop',e=>{e.preventDefault();$('dropzone').classList.remove('dragover');const file=e.dataTransfer?.files?.[0];if(file)handlePdfFile(file);});
    $('prevPage').addEventListener('click',()=>navigate(currentPage-1));
    $('nextPage').addEventListener('click',()=>navigate(currentPage+1));
    $('pageNumber').addEventListener('change',e=>navigate(e.target.value));
    $('zoomOut').addEventListener('click',()=>{zoom=Math.max(.65,Math.round((zoom-.15)*100)/100);renderPage();});
    $('zoomIn').addEventListener('click',()=>{zoom=Math.min(2.2,Math.round((zoom+.15)*100)/100);renderPage();});
    $('stampLayer').addEventListener('click',handlePageClick);
    $('cancelPlacement').addEventListener('click',()=>{draft=null;movingStampId=null;renderEditor();renderBank();setInstruction();});
    $('commentSearch').addEventListener('input',e=>{search=e.target.value;bankShowAll=false;renderBank();});
    document.querySelectorAll('[data-tone]').forEach(button=>button.addEventListener('click',()=>{tone=button.dataset.tone;bankShowAll=false;renderTone();renderBank();}));
    $('openLibrary').addEventListener('click',()=>openLibrary());
    $('closeLibrary').addEventListener('click',()=>$('libraryDialog').close());
    $('libraryCloseBottom').addEventListener('click',()=>$('libraryDialog').close());
    $('librarySearch').addEventListener('input',()=>{libraryEditingId=null;renderFullLibrary();});
    $('libraryCriterion').addEventListener('change',()=>{libraryEditingId=null;renderFullLibrary();});
    $('libraryCourse').addEventListener('change',()=>{libraryEditingId=null;renderFullLibrary();});
    $('libraryTone').addEventListener('change',()=>{libraryEditingId=null;renderFullLibrary();});
    $('libraryResults').addEventListener('click',handleLibraryAction);
    $('copyLibraryVisible').addEventListener('click',()=>{
      const text=filteredLibraryComments().map(item=>`${item.criterion} / ${item.topic} (${item.tone})\n${item.text}`).join('\n\n');
      if(text)copyCommentText(text);
    });
    initStampStyleEvents();
    $('newCustom').addEventListener('click',()=>{
      $('customCriterion').value=CRITERIA[tab]?tab:'A';$('customTone').value=tone==='limitation'?'limitation':'strength';
      $('customTopic').value='';$('customText').value='';$('customDialog').showModal();$('customText').focus();
    });
    $('saveCustom').addEventListener('click',()=>{
      const txt=$('customText').value.trim();if(!txt){toast('Write an evidence comment first.');return;}
      const item={id:'custom-'+makeId(),criterion:$('customCriterion').value,tone:$('customTone').value,topic:$('customTopic').value.trim()||'Personal evidence',text:txt,tags:[],courses:['AA SL','AA HL','AI SL','AI HL'],origin:'Teacher custom comment'};
      state.customComments.unshift(item);
      saveLibrarySettings();
      $('customDialog').close();tab=item.criterion;tone=item.tone;search='';$('commentSearch').value='';renderTabs();renderTone();renderBank();prepareComment(item.id);
      toast('Personal comment saved to this browser and selected.');
    });
    $('openReview').addEventListener('click',()=>{renderReview();$('reviewDialog').showModal();});
    $('closeReview').addEventListener('click',()=> $('reviewDialog').close());
    $('exportAnnotated').addEventListener('click',exportPdf);
    window.addEventListener('resize',()=>{if(isReady())renderPage();});
    document.addEventListener('keydown',e=>{
      if(e.key==='Escape' && !($('reviewDialog').open||$('customDialog').open||$('libraryDialog').open)) {draft=null;movingStampId=null;renderEditor();renderBank();setInstruction();}
      if(e.target instanceof HTMLInputElement||e.target instanceof HTMLTextAreaElement||e.target instanceof HTMLSelectElement||e.ctrlKey||e.metaKey)return;
      if(e.key==='ArrowRight')navigate(currentPage+1);
      if(e.key==='ArrowLeft')navigate(currentPage-1);
    });
  }
  async function handlePdfFile(file) {
    if(!file.name.toLowerCase().endsWith('.pdf')&&!file.type.includes('pdf')){toast('Please select a PDF file.');return;}
    if(isReady()&&(state.stamps.length||Object.values(state.marks).some(v=>v!==null))&&!confirm('Replace the source PDF and clear the existing stamps and marks?'))return;
    const bytes=new Uint8Array(await file.arrayBuffer());
    const result=await loadPdf(bytes,file.name);
    if(result)toast(`${file.name} is ready for evidence stamps.`);
  }
  function init() {
    try {state.customComments=JSON.parse(localStorage.getItem('ia-marking-desk-comments')||'[]');if(!Array.isArray(state.customComments))state.customComments=[];}catch(e){state.customComments=[];}
    try {const edits=JSON.parse(localStorage.getItem('ia-marking-desk-edits')||'{}');state.commentEdits=edits && !Array.isArray(edits) && typeof edits==='object' ? edits:{};}catch(e){state.commentEdits={};}
    try {state.stampStyle=normalStyle(JSON.parse(localStorage.getItem('ia-marking-desk-stamp-style')||'{}'));}catch(e){state.stampStyle=normalStyle();}
    if(window.pdfjsLib)pdfjsLib.GlobalWorkerOptions.workerSrc='vendor/pdf.worker.mjs';
    initScores();renderStampStyle();renderTabs();renderTone();renderBank();renderEditor();renderStamps();setInstruction();updateFrameworkNotice();initEvents();initDatabase();
    if(!window.pdfjsLib||!window.PDFLib)console.warn('Local PDF libraries not loaded. Use the GitHub Pages Actions build or run npm run build to create vendor files.');
  }
  init();
})();
