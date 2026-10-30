import {createUnicodeFonts,normaliseAnnotationText,pdfFontError} from './unicode-fonts.js';
import {MarkingHistory,sanitizeQuickPicks} from './marking-history.js';
import {openLocalIAProjectVault,createLocalProjectId} from './project-vault.js';
import {inspectModerationPages} from './moderation-preflight.js';
import {studentChecklistItems,studentFeedbackStrengths,studentChecklistText,feedbackPriority} from './feedback-engine.js';
let pdfjsLib = window.pdfjsLib || null;
let pdfRendererLoad = null;
(() => {
  'use strict';

  const CRITERIA = {
    A: { name: 'Presentation', max: 4 },
    B: { name: 'Mathematical communication', max: 4 },
    C: { name: 'Personal engagement', max: 3 },
    D: { name: 'Reflection', max: 3 },
    E: { name: 'Use of mathematics', max: 6 },
  };
  const GUIDE_LINKS={
    AA:'https://www.ibo.org/globalassets/new-structure/university-admission/pdfs/dp-mathematics-analysis-and-approaches-guide-en.pdf#page=90',
    AI:'https://www.ibo.org/globalassets/new-structure/university-admission/pdfs/dp-mathematics-applications-and-interpretation-guide-en.pdf#page=91',
  };
  // Detailed, originally worded criterion-by-criterion paraphrases; the IB
  // source remains linked and can be viewed in this dialog from an authorised PDF.
  const RUBRIC=window.IA_RUBRIC||{};
  const CRITERION_KEYS = Object.keys(CRITERIA);
  const BANK = window.IA_COMMENT_BANK || [];
  const FEEDBACK_BANK = window.IA_FEEDBACK_BANK || [];
  const allCourses=['AA SL','AI SL','AA HL','AI HL'];
  let mode='marking';
  const isFeedback=()=>mode==='feedback';
  const activeBank=()=>isFeedback()?FEEDBACK_BANK:BANK;
  const STAMP_DEFAULTS = Object.freeze({
    size:20,strengthColor:'#477b97',limitationColor:'#b7803c',
    fontSize:9.5,textColor:'#263d4f',fillColor:'#fbfdff',borderColor:'#477b97',noteWidth:250,
  });
  const NOTE_PAD=6;
  const normalNoteWidth = value => Number.isFinite(Number(value)) ? Math.max(170,Math.min(450,Math.round(Number(value)/5)*5)) : 250;
  const normalNoteHeight = value => value===null || value===undefined || value==='' ? null :
    Number.isFinite(Number(value)) ? Math.max(55,Math.min(750,Math.round(Number(value)))) : null;
  const normalFontSize = value => value!==null && value!==undefined && value!=='' && Number.isFinite(Number(value)) ?
    Math.max(7,Math.min(18,Math.round(Number(value)*2)/2)) : STAMP_DEFAULTS.fontSize;
  const noteLineHeight = size => Math.round(normalFontSize(size)*1.35*10)/10;
  const normalSize = value => Number.isFinite(Number(value)) ? Math.max(14,Math.min(42,Math.round(Number(value)))) : STAMP_DEFAULTS.size;
  const normalColor = (value,fallback) => typeof value==='string' && /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : fallback;
  function normalStyle(value={}) {
    return {
      size:normalSize(value?.size),
      strengthColor:normalColor(value?.strengthColor,STAMP_DEFAULTS.strengthColor),
      limitationColor:normalColor(value?.limitationColor,STAMP_DEFAULTS.limitationColor),
      fontSize:normalFontSize(value?.fontSize),
      textColor:normalColor(value?.textColor,STAMP_DEFAULTS.textColor),
      fillColor:normalColor(value?.fillColor,STAMP_DEFAULTS.fillColor),
      borderColor:normalColor(value?.borderColor,STAMP_DEFAULTS.borderColor),
      noteWidth:normalNoteWidth(value?.noteWidth),
    };
  }
  function stampColor(stamp) {
    return normalColor(stamp?.color,stamp?.tone==='limitation'?state.stampStyle.limitationColor:state.stampStyle.strengthColor);
  }
  function noteFontSize(stamp){return normalFontSize(stamp?.fontSize ?? state.stampStyle.fontSize);}
  function noteTextColor(stamp){return normalColor(stamp?.textColor,state.stampStyle.textColor);}
  function noteFillColor(stamp){return normalColor(stamp?.fillColor,state.stampStyle.fillColor);}
  function noteBorderColor(stamp){return normalColor(stamp?.borderColor,state.stampStyle.borderColor);}
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
      notice.textContent='Warning: the May 2029 and later IB Mathematics IA uses a new four-criterion framework (A-D). A-E feedback and marking exports are unavailable for this session.';
    } else {
      notice.classList.remove('warning');
      notice.textContent=isFeedback()?'First-draft developmental feedback: these are teacher-selected prompts, not official IB marks or replacement solutions. A-E applies to sessions through November 2028.':'A-E assessment framework (final assessment November 2028). The new May 2029 criteria are not supported by this version.';
    }
  }
  const freshJustifications = () => ({A:'',B:'',C:'',D:'',E:''});

  let state = {
    course:'AA SL', candidate:'', session:'', marks:freshMarks(), justifications:freshJustifications(),
    stamps:[], markingStamps:[], feedbackStamps:[], feedbackCompleted:{},
    customComments:[], commentEdits:{}, feedbackComments:[], feedbackEdits:{},
    stampStyle:normalStyle(), pdfName:'', pdfBytes:null,
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
  // Browser-local IA cohort vault. Autosaves are serialized and revisioned;
  // switching projects waits for a completed write before leaving an IA.
  let projectVault=null,activeProjectId=null;
  let projectRevision=0,persistedRevision=0,activeSavedAt=null;
  let saveChain=Promise.resolve(),projectLoading=false,storageError=null;
  let cachedProjectSummaries=[];
  let viewScale = 1;
  let pageWidthPt = 0, pageHeightPt = 0;
  let libraryEditingId = null;
  const MAX_BANK_VISIBLE = 42;
  const QUICK_PICKS_KEY='ia-marking-desk-quick-picks-v1';
  let quickPicks=sanitizeQuickPicks({});
  let bankQuickFilter='all';
  let repeatPlacement=false;
  let lastPlacedDraft=null;
  const markingHistory=new MarkingHistory(60);
  let activeHistoryField=null;
  let applyingHistory=false;

  function historySnapshot(){return markingHistory.snapshot(state);}
  function updateHistoryButtons(){
    $('undoMark').disabled=!markingHistory.canUndo;
    $('redoMark').disabled=!markingHistory.canRedo;
    $('undoMark').title=markingHistory.canUndo?'Undo '+markingHistory.undoLabel+' (Ctrl/Cmd + Z)':'Nothing to undo';
    $('redoMark').title=markingHistory.canRedo?'Redo '+markingHistory.redoLabel+' (Ctrl/Cmd + Shift + Z)':'Nothing to redo';
  }
  function recordHistory(label,before){
    if(!before||applyingHistory)return false;
    const changed=markingHistory.push(label,before,historySnapshot());
    if(changed){updateHistoryButtons();renderEvidenceIfOpen();}
    return changed;
  }
  function beginFieldHistory(label){
    if(applyingHistory)return;
    if(!activeHistoryField)activeHistoryField={before:historySnapshot(),label};
  }
  function finishFieldHistory(){
    if(!activeHistoryField)return;
    const {before,label}=activeHistoryField;activeHistoryField=null;
    recordHistory(label,before);
  }
  function watchHistoryField(element,label,commitOnChange=false){
    if(!element)return;
    const begin=()=>beginFieldHistory(label);
    element.addEventListener('focus',begin);
    if(commitOnChange){
      element.addEventListener('pointerdown',begin);
      element.addEventListener('keydown',event=>{
        if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','PageUp','PageDown','Home','End'].includes(event.key))begin();
      });
      element.addEventListener('change',finishFieldHistory);
    }
    element.addEventListener('blur',finishFieldHistory);
  }
  function applyMarkSnapshot(snapshot,label){
    if(!snapshot)return;
    activeHistoryField=null;
    applyingHistory=true;
    try{
      state.stamps=snapshot.stamps;
      state.marks=snapshot.marks;
      state.justifications=snapshot.justifications;
      if(!state.stamps.some(stamp=>stamp.id===selectedStampId))selectedStampId=null;
      draft=null;movingStampId=null;
      updateScores();renderStamps();renderEditor();renderBank();setInstruction();
      if($('reviewDialog').open)renderReview();
      if($('criteriaDialog').open)renderCriteria();
      renderEvidenceIfOpen();
      scheduleSave();
      toast(label);
    } finally {
      applyingHistory=false;updateHistoryButtons();
    }
  }
  function undoMarking(){
    finishFieldHistory();
    const result=markingHistory.undo();
    if(result)applyMarkSnapshot(result.snapshot,'Undid '+result.label);
  }
  function redoMarking(){
    finishFieldHistory();
    const result=markingHistory.redo();
    if(result)applyMarkSnapshot(result.snapshot,'Redid '+result.label);
  }
  function resetHistory(){
    activeHistoryField=null;
    markingHistory.clear();updateHistoryButtons();
  }
  function storeQuickPicks(){
    try{localStorage.setItem(QUICK_PICKS_KEY,JSON.stringify(quickPicks));}
    catch(error){console.warn('Could not save favourite and recent comments',error);}
  }
  function recordRecentComment(id){
    if(!id || !getComments().some(item=>item.id===id))return;
    quickPicks.recent=[id,...quickPicks.recent.filter(v=>v!==id)].slice(0,24);
    storeQuickPicks();renderQuickPicker();renderBank();
  }
  function toggleFavourite(id){
    if(!getComments().some(item=>item.id===id))return;
    quickPicks.favorites=quickPicks.favorites.includes(id)
      ?quickPicks.favorites.filter(v=>v!==id)
      :[id,...quickPicks.favorites].slice(0,100);
    storeQuickPicks();renderQuickPicker();renderBank();
    if($('libraryDialog').open)renderFullLibrary();
  }
  function renderQuickPicker(){
    const courseItems=getComments().filter(item=>(item.courses||[]).includes(state.course));
    const lookup=new Map(courseItems.map(item=>[item.id,item]));
    const group=(ids,label)=>{
      const entries=ids.map(id=>lookup.get(id)).filter(Boolean).slice(0,10);
      return entries.length?'<optgroup label="'+label+'">'+entries.map(item=>
        '<option value="'+escapeHtml(item.id)+'">'+escapeHtml(item.criterion+' · '+item.topic+' — '+item.text.slice(0,54))+'</option>'
      ).join('')+'</optgroup>':'';
    };
    $('quickStampPicker').innerHTML='<option value="">Choose saved comment…</option>'
      +group(quickPicks.favorites,'★ Favourite comments')
      +group(quickPicks.recent,'Recently stamped');
    $('quickStampPicker').value='';
    $('quickStampAgain').disabled=!lastPlacedDraft;
    $('repeatStamp').classList.toggle('is-active',repeatPlacement);
    $('repeatStamp').setAttribute('aria-pressed',String(repeatPlacement));
    $('repeatStamp').textContent=repeatPlacement?'Repeat: On':'Repeat: Off';
  }
  function renderEvidenceIfOpen(){
    $('evidenceCount').textContent=String(state.stamps.length);
    if($('evidenceDialog').open)renderEvidenceNavigator();
  }
  function renderEvidenceNavigator(){
    const all=state.stamps;
    $('evidenceSummary').innerHTML=CRITERION_KEYS.map(key=>{
      const count=all.filter(x=>x.criterion===key).length;
      const mark=state.marks[key];
      return '<button type="button" data-evidence-jump="'+key+'" class="evidence-summary-chip"><strong>'+key+'</strong><small>'
        +(isFeedback()?'Draft':(mark===null?'—':mark)+'/'+CRITERIA[key].max)+'</small><span>'+count+' stamp'+(count===1?'':'s')+'</span></button>';
    }).join('');
    $('evidenceResults').innerHTML=CRITERION_KEYS.map(key=>{
      const comments=all.filter(x=>x.criterion===key).sort((a,b)=>a.page-b.page||a.y-b.y);
      const strengths=comments.filter(x=>x.tone==='strength').length;
      const limitations=comments.length-strengths;
      return '<section class="evidence-group" id="evidenceGroup_'+key+'"><div class="evidence-group-head"><span class="mini-circle">'+key+'</span>'
        +'<div><h3>Criterion '+key+': '+escapeHtml(CRITERIA[key].name)+'</h3><small>'+strengths+' strengths · '+limitations+(isFeedback()?' actions':' limitations')+' · '+comments.length+' total</small></div>'
        +'<strong>'+ (isFeedback()?'Draft guidance':state.marks[key]===null?'Not marked':state.marks[key]+' / '+CRITERIA[key].max)+'</strong></div>'
        +(comments.length?comments.map(stamp=>
          '<button type="button" class="evidence-result" data-evidence-pin="'+escapeHtml(stamp.id)+'">'
          +'<span class="evidence-result-meta"><span class="polarity '+stamp.tone+'">'+(stamp.tone==='strength'?'Strength':isFeedback()?'Improvement':'Limitation')+'</span>'
          +'<strong>'+escapeHtml(stampLabel(stamp))+'</strong><span>Page '+stamp.page+'</span></span>'
          +'<span class="evidence-result-text">'+escapeHtml(stamp.text)+'</span>'
          +'<span class="evidence-result-visit">Go to page '+stamp.page+' →</span></button>'
        ).join(''):'<p class="evidence-no-comments">No comments placed for this criterion yet.</p>')+'</section>';
    }).join('');
    $('evidenceFooterCount').textContent=all.length+' annotation'+(all.length===1?'':'s')+' across '+(pdfDoc?.numPages||0)+' pages';
  }
  async function jumpToEvidenceStamp(id){
    const stamp=state.stamps.find(item=>item.id===id);
    if(!stamp)return;
    $('evidenceDialog').close();
    finishFieldHistory();selectedStampId=stamp.id;draft=null;movingStampId=null;
    if(currentPage!==stamp.page)await navigate(stamp.page);
    else renderStamps();
    renderEditor();renderBank();setInstruction();
    setWorkspaceView('edit',{openOnMobile:false});
    if(mobileWorkspace())closeMobileDrawer();
    $('pdfScroll').scrollIntoView({behavior:'smooth',block:'nearest'});
    const marker=Array.from($('stampLayer').querySelectorAll('[data-pin-id]')).find(item=>item.dataset.pinId===stamp.id);
    marker?.scrollIntoView({behavior:'smooth',block:'center'});
    marker?.focus({preventScroll:true});
  }


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
  function markingStamps(){return isFeedback()?state.markingStamps:state.stamps;}
  function feedbackStamps(){return isFeedback()?state.stamps:state.feedbackStamps;}
  function activeCustomComments(){return isFeedback()?state.feedbackComments:state.customComments;}
  function activeCommentEdits(){return isFeedback()?state.feedbackEdits:state.commentEdits;}
  function syncStampsForMode(){if(isFeedback())state.feedbackStamps=state.stamps;else state.markingStamps=state.stamps;}
  // Pass 2: Presentation-only workspace preferences never enter marking projects
  // or student PDF backups. The PDF annotation coordinates remain unchanged.
  const WORKSPACE_LAYOUT_KEY='ia-marking-desk-workspace-layout-v2';
  const mobileWorkspace=()=>window.matchMedia('(max-width: 1000px)').matches;
  let documentCollapsed=false,commentCollapsed=false,workspaceView='browse';
  let focusedPdf=false,mobileDrawer=null,layoutOverride=false,wasMobile=null;
  const compactPhone=()=>window.matchMedia('(max-width:650px)').matches;
  let mobileDetailsExpanded=false,mobileProjectsExpanded=false,wasPhone=null;
  function updateMobileChrome(){
    const phone=compactPhone();
    if(wasPhone!==null&&phone!==wasPhone){
      mobileDetailsExpanded=false;mobileProjectsExpanded=false;
    }
    wasPhone=phone;
    document.body.classList.toggle('mobile-details-open',phone&&mobileDetailsExpanded);
    document.querySelector('.masthead').classList.toggle('mobile-projects-open',phone&&mobileProjectsExpanded);
    // Make project control visibility deterministic even under legacy header
    // rules. Only the phone disclosure controls these interface-only classes.
    for(const node of [$('openProjects'),$('newProject'),$('projectSave'),document.querySelector('.header-actions label[for="projectOpen"]')]){
      if(node)node.classList.toggle('mobile-project-control-hidden',phone&&!mobileProjectsExpanded);
    }
    $('mobileDetailsToggle').setAttribute('aria-expanded',String(phone&&mobileDetailsExpanded));
    $('mobileProjectToolsToggle').setAttribute('aria-expanded',String(phone&&mobileProjectsExpanded));
    const count=state.stamps.length;
    $('mobileDetailsSummary').textContent=state.course+' · '+(isFeedback()?'First draft':'Final assessment')+
      (count?' · '+count+' stamp'+(count===1?'':'s'):'');
  }
  function readWorkspacePreferences(){
    try{
      const saved=JSON.parse(localStorage.getItem(WORKSPACE_LAYOUT_KEY)||'{}');
      if(typeof saved.documentCollapsed==='boolean'){
        documentCollapsed=saved.documentCollapsed;layoutOverride=true;
      }
      if(typeof saved.commentCollapsed==='boolean')commentCollapsed=saved.commentCollapsed;
    }catch(error){console.warn('Workspace layout preferences could not be read',error);}
  }
  function saveWorkspacePreferences(){
    try{localStorage.setItem(WORKSPACE_LAYOUT_KEY,JSON.stringify({documentCollapsed,commentCollapsed}));}
    catch(error){console.warn('Workspace layout preferences could not be stored',error);}
  }
  function updateWorkspaceLayout({rerender=true}={}){
    const small=mobileWorkspace();
    if(wasMobile!==null&&small!==wasMobile)mobileDrawer=null;
    wasMobile=small;
    const workspace=$('workspace');
    workspace.classList.toggle('document-collapsed',!small&&(documentCollapsed||focusedPdf));
    workspace.classList.toggle('bank-collapsed',!small&&(commentCollapsed||focusedPdf));
    workspace.dataset.mobileDrawer=small?(mobileDrawer||''):'';
    workspace.dataset.bankView=workspaceView;
    $('bankPaneTitle').textContent=workspaceView==='edit'?'Stamp editor':isFeedback()?'Feedback library':'Comment library';
    $('bankTotal').classList.toggle('hidden',workspaceView==='edit');
    document.body.classList.toggle('pdf-focus',focusedPdf);
    document.body.classList.toggle('workspace-drawer-open',small&&Boolean(mobileDrawer));
    $('workspaceBackdrop').hidden=!(small&&mobileDrawer);
    const drawerActive=small&&Boolean(mobileDrawer);
    // Keep hidden and obscured controls out of keyboard and screen reader
    // navigation while a drawer is open. Modal dialogs retain their own focus.
    for(const selector of ['.masthead','.review-mode-bar','.assessment-bar','.reference-bar','#frameworkNotice','#viewerPane']){
      const element=document.querySelector(selector);
      if(element)element.inert=drawerActive;
    }
    for(const [pane,name] of [['documentPane','document'],['bankPane','comments']]){
      const element=$(pane);
      element.setAttribute('role',drawerActive&&mobileDrawer===name?'dialog':'complementary');
      if(drawerActive&&mobileDrawer===name)element.setAttribute('aria-modal','true');
      else element.removeAttribute('aria-modal');
    }
    $('bankBrowseTab').classList.toggle('is-selected',workspaceView==='browse');
    $('bankEditorTab').classList.toggle('is-selected',workspaceView==='edit');
    $('bankBrowseTab').setAttribute('aria-selected',String(workspaceView==='browse'));
    $('bankEditorTab').setAttribute('aria-selected',String(workspaceView==='edit'));
    $('bankBrowseTab').tabIndex=workspaceView==='browse'?0:-1;
    $('bankEditorTab').tabIndex=workspaceView==='edit'?0:-1;
    $('toggleDocumentPane').setAttribute('aria-expanded',String(small?mobileDrawer==='document':!documentCollapsed&&!focusedPdf));
    $('toggleCommentPane').setAttribute('aria-expanded',String(small?mobileDrawer==='comments'&&workspaceView==='browse':!commentCollapsed&&!focusedPdf&&workspaceView==='browse'));
    $('toggleEditorPane').setAttribute('aria-expanded',String(small?mobileDrawer==='comments'&&workspaceView==='edit':!commentCollapsed&&!focusedPdf&&workspaceView==='edit'));
    $('toggleDocumentPane').classList.toggle('is-selected',small?mobileDrawer==='document':!documentCollapsed&&!focusedPdf);
    $('toggleCommentPane').classList.toggle('is-selected',small?mobileDrawer==='comments'&&workspaceView==='browse':!commentCollapsed&&!focusedPdf&&workspaceView==='browse');
    $('toggleEditorPane').classList.toggle('is-selected',small?mobileDrawer==='comments'&&workspaceView==='edit':!commentCollapsed&&!focusedPdf&&workspaceView==='edit');
    $('focusPdf').setAttribute('aria-pressed',String(focusedPdf));
    $('focusPdf').classList.toggle('is-selected',focusedPdf);
    $('focusPdf').title=focusedPdf?'Restore the workspace panels':'Expand the PDF and hide side panels';
    $('focusPdf').querySelector('.focus-label').textContent=focusedPdf?'Exit focus':'Focus PDF';
    const documentHidden=focusedPdf||(small?mobileDrawer!=='document':false);
    const bankHidden=focusedPdf||(small?mobileDrawer!=='comments':commentCollapsed);
    $('documentPane').inert=documentHidden;
    $('bankPane').inert=bankHidden;
    $('bankBrowseView').inert=bankHidden||workspaceView!=='browse';
    $('selectionEditor').inert=bankHidden||workspaceView!=='edit';
    $('findAnotherComment').inert=bankHidden||workspaceView!=='edit';
    updateMobileChrome();
    if(rerender&&isReady())requestAnimationFrame(()=>{if(isReady())void renderPage();});
  }
  function closeMobileDrawer({restoreFocus=false}={}){
    if(!mobileDrawer)return;
    const wasOpen=mobileDrawer;
    mobileDrawer=null;
    updateWorkspaceLayout({rerender:false});
    if(restoreFocus)$(wasOpen==='document'?'toggleDocumentPane':workspaceView==='edit'?'toggleEditorPane':'toggleCommentPane').focus();
  }
  function setWorkspaceView(view,{openOnMobile=false,focusControl=false}={}){
    if(!['browse','edit'].includes(view))return;
    workspaceView=view;
    commentCollapsed=false;focusedPdf=false;
    if(openOnMobile&&mobileWorkspace())mobileDrawer='comments';
    updateWorkspaceLayout();
    if(focusControl){
      requestAnimationFrame(()=>{
        const control=view==='browse'?'commentSearch':'stampTextEdit';
        const target=$(control)||$('draftTextEdit')||$('bankEditorTab');
        if(!target.inert)target.focus({preventScroll:true});
      });
    }
  }
  function openDocumentPanel(){
    focusedPdf=false;
    if(mobileWorkspace()){mobileDrawer=mobileDrawer==='document'?null:'document';}
    else{documentCollapsed=!documentCollapsed;layoutOverride=true;saveWorkspacePreferences();}
    updateWorkspaceLayout();
    if(mobileWorkspace()&&mobileDrawer==='document')requestAnimationFrame(()=>$('closeDocumentPane').focus({preventScroll:true}));
  }
  function openCommentsPanel(view='browse'){
    focusedPdf=false;workspaceView=view;commentCollapsed=false;
    if(mobileWorkspace())mobileDrawer='comments';
    else saveWorkspacePreferences();
    updateWorkspaceLayout();
    if(mobileWorkspace())requestAnimationFrame(()=>$('closeBankPane').focus({preventScroll:true}));
  }
  function toggleFocusPdf(){
    focusedPdf=!focusedPdf;
    if(focusedPdf)mobileDrawer=null;
    updateWorkspaceLayout();
  }
  function hideContextPanel(){
    if(mobileWorkspace()){closeMobileDrawer({restoreFocus:true});return;}
    commentCollapsed=true;saveWorkspacePreferences();
    updateWorkspaceLayout();
    $('toggleCommentPane').focus();
  }
  function updateModeUI(){
    document.body.classList.toggle('feedback-mode',isFeedback());
    for(const [id,selected] of [['markingMode',!isFeedback()],['feedbackMode',isFeedback()]]){
      const element=$(id);element.classList.toggle('is-selected',selected);element.setAttribute('aria-pressed',String(selected));
    }
    $('modeDescription').textContent=isFeedback()
      ?'First draft: select actionable feedback, place it beside relevant work, then share a checklist of requested revisions. No marks are awarded.'
      :'Final assessment: annotate evidence and record teacher marks against criteria A-E.';
    $('openReview').textContent=isFeedback()?'Review feedback & checklist →':'Review & export →';
    $('stampSectionLabel').textContent=isFeedback()?'Placed feedback':'Placed stamps';
    $('legendLimitationLabel').textContent=isFeedback()?'Improvement':'Limitation';
    $('toneLimitationLabel').textContent=isFeedback()?'Improvements':'Limitations';
    $('libraryToneLimitation').textContent=isFeedback()?'Improvements':'Limitations';
    $('customToneLimitation').textContent=isFeedback()?'Improvement':'Limitation';
    $('bankEyebrow').textContent=isFeedback()?'03 / FEEDBACK':'03 / COMMENTS';
    $('bankIntro').textContent=isFeedback()
      ?'Choose a student-facing strength or improvement action. Personalise it for the draft before placing the stamp. Each improvement becomes a checklist item.'
      :'Choose a teacher-facing assessment observation. Edit it to reflect the actual evidence before stamping.';
    $('bankCaption').textContent=isFeedback()
      ?'Actionable paraphrases from the supplied 2021-2026 examiner-feedback synthesis. These are draft guidance, not official descriptors, worked corrections or marks.'
      :'Curated from the supplied 2021-2026 examiner-feedback synthesis. These are prompts, not IB descriptors or automatic marks.';
    $('emptyViewerTitle').textContent=isFeedback()?'Help students improve their first draft.':'Mark the evidence, not the page.';
    $('emptyViewerDescription').textContent=isFeedback()
      ?'Upload a first-draft IA PDF, place actionable A-E comments in clear spaces, and export the annotated draft with a personalised revision checklist.'
      :'Upload a final IA and place complete teacher comments directly onto clear areas of each PDF page. Drag or resize them before exporting.';
    $('viewerBottomHelp').textContent=isFeedback()
      ?'The exported draft also contains a revision checklist generated from your improvement stamps'
      :'What you see printed on this page is what the moderator receives';
    $('evidenceIntro').textContent=isFeedback()
      ?'Review placed strengths and improvement actions by criterion. Select a stamp to jump to its page and edit the comment.'
      :'See all placed comments grouped by A-E. Select any observation to jump to its page and edit the stamp.';
    $('customFormHint').textContent=isFeedback()
      ?'Write a student-facing prompt that identifies what to reconsider, without supplying the solution. Improvement stamps become student checklist items.'
      :'Phrase this as evidence for a marking decision, rather than instructions to the student. Saved to this browser\'s personal bank.';
    $('referenceLibraryLink').innerHTML=isFeedback()
      ?'Browse feedback library <span aria-hidden="true">↗</span>'
      :'Browse marking library <span aria-hidden="true">↗</span>';
    $('referenceLibraryLink').href=isFeedback()?'library.html?mode=feedback':'library.html';
    $('independentLibraryLink').setAttribute('href',isFeedback()?'library.html?mode=feedback':'library.html');
    $('independentLibraryLink').textContent=isFeedback()?'Open feedback library in a separate page ↗':'Open marking library in a separate page ↗';
    $('documentHelp').title=isFeedback()?'Choose a first-draft IA PDF. Nothing is uploaded to a server.':'Choose a final IA PDF. Nothing is uploaded to a server.';
    if(isReady())$('uploadSubtext').textContent=isFeedback()?'Choose a different draft PDF':'Choose a different final IA';
    $('evidenceTitle').textContent=isFeedback()?'Placed draft feedback':'Criterion evidence navigator';
    $('evidenceEyebrow').textContent=isFeedback()?'FIRST-DRAFT FEEDBACK':'FINAL ASSESSMENT EVIDENCE';
    $('libraryTitle').textContent=isFeedback()?'First draft feedback library':'Final assessment comment library';
    $('libraryEyebrow').textContent=isFeedback()?'STUDENT-FACING PROMPTS':'TEACHER ASSESSMENT EVIDENCE';
    $('libraryIntro').textContent=isFeedback()
      ?'Find actionable comments, copy them into a document or adjust the wording for future drafts. Changes are saved only in this browser.'
      :'Find assessment observations, copy them into a document or adjust the wording for future marking. Changes are saved only in this browser.';
    $('customTitle').textContent=isFeedback()?'Write a feedback prompt':'Write an assessment comment';
    $('customText').placeholder=isFeedback()?'Identify an area to revisit and the next action the student should take.':'Describe what the submitted mathematics demonstrates.';
    $('openLibrary').firstElementChild.textContent=isFeedback()?'Full feedback library':'Full marking library';
    $('openEvidence').childNodes[0].textContent=isFeedback()?'Draft feedback ':'A-E evidence ';
    $('reviewEyebrow').textContent=isFeedback()?'FIRST DRAFT / STUDENT FEEDBACK':'MARKING RECORD';
    $('reviewTitle').textContent=isFeedback()?'Review feedback & checklist':'Review & export';
    $('reviewIntro').textContent=isFeedback()
      ?'Check each student-facing action before sharing the annotated first draft and its checklist. No criterion marks are assigned in this mode.'
      :'Capture criterion-specific reasons for the awarded marks. A stamp count never determines a score.';
    $('moderationPreflightTitle').textContent=isFeedback()?'Student feedback PDF check':'Moderator-ready PDF check';
    $('preflightIntro').textContent=isFeedback()
      ?'Check legibility and overlaps in the annotated first draft. Preview the exact PDF, including its checklist, before sharing with the student.'
      :'Automated checks identify likely problems. Inspect the exact annotated export before releasing it.';
    $('reviewPreviewHint').textContent=isFeedback()
      ?'Review every page, including the final student revision checklist. The PDF you inspect is the exact export.'
      :'Page through the student work and marking summary. The PDF you see here is the same file used by Export.';
    $('reviewConfirmText').textContent=isFeedback()
      ?'I have checked the student-facing feedback and checklist, and confirmed that all PDF comments are legible and do not obscure important mathematics.'
      :'I have inspected the exported preview, confirmed that the full comments are legible and that no important student mathematics is obscured.';
    $('exportAnnotated').textContent=isFeedback()?'Export student feedback PDF ↓':'Export annotated PDF ↓';
    $('feedbackReviewContent').classList.toggle('hidden',!isFeedback());
    $('reviewMarkingNote').classList.toggle('hidden',isFeedback());
    updateFrameworkNotice();
  }
  function switchMode(next){
    if(!['marking','feedback'].includes(next)||next===mode)return;
    finishFieldHistory();syncStampsForMode();mode=next;
    state.stamps=isFeedback()?state.feedbackStamps:state.markingStamps;
    draft=null;selectedStampId=null;movingStampId=null;tab='all';tone='all';search='';
    bankShowAll=false;bankQuickFilter='all';libraryEditingId=null;
    $('commentSearch').value='';
    resetHistory();lastPlacedDraft=null;repeatPlacement=false;
    workspaceView='browse';closeMobileDrawer();updateWorkspaceLayout({rerender:false});
    updateModeUI();renderTabs();renderTone();renderBank();renderEditor();renderStamps();
    renderQuickPicker();updateScores();setInstruction();scheduleSave();
  }
  function setInstruction() {
    const bar = $('instructionBar');
    const cancel = $('cancelPlacement');
    if (movingStampId) {
      const stamp = state.stamps.find(s=>s.id === movingStampId);
      $('instructionText').textContent = `Move ${stamp?.criterion || ''} stamp: click its new position on the PDF.`;
      bar.classList.add('placing'); cancel.classList.remove('hidden');
    } else if (draft) {
      $('instructionText').textContent = `Placing criterion ${draft.criterion} ${draft.tone === 'strength' ? 'strength' : (isFeedback()?'improvement action':'limitation')}: click beside the relevant evidence on the PDF.`;
      bar.classList.add('placing'); cancel.classList.remove('hidden');
    } else {
      $('instructionText').textContent = isFeedback()?'Select an actionable comment, then click clear space beside the relevant part of the draft. The student checklist will update automatically.':'Select a comment, then click on clear space on the actual PDF page. Its full text will be printed there for moderation.';
      bar.classList.remove('placing'); cancel.classList.add('hidden');
    }
    $('stampLayer').classList.toggle('placing',Boolean(draft || movingStampId));
  }
  function getComments() {
    const edits=activeCommentEdits();
    return [...activeCustomComments(), ...activeBank().map(item=>{
      const edit=edits[item.id];
      return edit && typeof edit.text==='string' && edit.text.trim() ? {...item,text:edit.text.slice(0,1800),topic:String(edit.topic||item.topic).slice(0,90)} : item;
    })];
  }
  function saveLibrarySettings() {
    try {
      localStorage.setItem('ia-marking-desk-comments',JSON.stringify(state.customComments));
      localStorage.setItem('ia-marking-desk-edits',JSON.stringify(state.commentEdits));
      localStorage.setItem('ia-marking-desk-feedback-comments',JSON.stringify(state.feedbackComments));
      localStorage.setItem('ia-marking-desk-feedback-edits',JSON.stringify(state.feedbackEdits));
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
    $('defaultNoteFont').value=String(state.stampStyle.fontSize);
    $('defaultNoteFontValue').textContent=`${state.stampStyle.fontSize} pt`;
    $('defaultNoteTextColour').value=state.stampStyle.textColor;
    $('defaultNoteFillColour').value=state.stampStyle.fillColor;
    $('defaultNoteBorderColour').value=state.stampStyle.borderColor;
    $('defaultNoteWidth').value=String(state.stampStyle.noteWidth);
    $('defaultNoteWidthValue').textContent=`${state.stampStyle.noteWidth} pt`;
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
    finishFieldHistory();
    const before=historySnapshot();
    state.marks[key] = score;
    updateScores(); scheduleSave();
    recordHistory('criterion '+key+' mark',before);
    if ($('reviewDialog').open) renderReview();
    if ($('criteriaDialog').open) updateRubricMarks();
  }
  function updateScores() {
    $('scoreStrip').querySelectorAll('[data-score]').forEach(select => {
      select.value = state.marks[select.dataset.score] ?? '';
    });
    const total = totalScore();
    $('totalMark').innerHTML = `${total === null ? '--' : total}<small>/20</small>`;
    if($('criteriaDialog').open)updateRubricMarks();
  }
  let guideObjectUrl=null;

  function updateRubricMarks() {
    if(!$('criteriaDialog').open)return;
    for(const key of CRITERION_KEYS) {
      const mark=state.marks[key],max=CRITERIA[key].max;
      const select=$('criteriaCards').querySelector('[data-criteria-score="'+key+'"]');
      if(select)select.value=mark===null?'':String(mark);
      $('criteriaJumpBar').querySelectorAll('[data-jump-mark="'+key+'"]').forEach(element=>{
        element.textContent=(mark===null?'—':mark)+' / '+max;
      });
      $('criteriaJumpBar').querySelectorAll('[data-criteria-jump="'+key+'"]').forEach(button=>{
        button.classList.toggle('has-mark',mark!==null);
      });
      $('criteriaCards').querySelectorAll('[data-rubric-key="'+key+'"]').forEach(button=>{
        const active=mark!==null && Number(button.dataset.rubricScore)===mark;
        button.setAttribute('aria-pressed',String(active));
        button.classList.toggle('is-awarded',active);
      });
    }
    const total=totalScore(),complete=CRITERION_KEYS.filter(key=>state.marks[key]!==null).length;
    $('criteriaTotal').textContent='Total: '+(total===null?'--':total)+' / 20';
    $('criteriaProgress').textContent=complete+' of 5 criteria marked';
  }

  function renderCriteria() {
    const family=state.course.startsWith('AI')?'AI':'AA';
    const level=state.course.endsWith('HL')?'HL':'SL';
    $('criteriaCoursePill').textContent=state.course;
    $('criteriaSourceCourse').textContent=state.course;
    $('criteriaGuideLink').href=GUIDE_LINKS[family];
    $('criteriaGuideLink').textContent='Read complete official '+family+' guide (A–E, '+level+' mathematics) ↗';

    $('criteriaCards').innerHTML=CRITERION_KEYS.map(key=>{
      const criterion=CRITERIA[key],rubric=RUBRIC[key];
      if(!rubric) return '<p class="criteria-error">The criterion reference data did not load. Try refreshing the page.</p>';
      const descriptions=(key==='E'?rubric[level]:rubric.levels)||[];
      if(descriptions.length!==criterion.max+1)return '<p class="criteria-error">The criterion mark levels are incomplete. Open the official guide instead.</p>';
      const mark=state.marks[key];
      const levels=descriptions.map((description,n)=>{
        const chosen=mark===n;
        return `<button type="button" class="criteria-level ${chosen?'is-awarded':''}" data-rubric-key="${key}" data-rubric-score="${n}" aria-pressed="${chosen}" aria-label="Award ${n} out of ${criterion.max} for criterion ${key}: ${escapeHtml(description)}">
          <span class="criteria-level-mark">${n}</span><span class="criteria-level-copy">${escapeHtml(description)}</span><span class="criteria-level-check" aria-hidden="true">✓</span>
        </button>`;
      }).join('');
      const considerations=(rubric.considerations||[]).map(line=>'<li>'+escapeHtml(line)+'</li>').join('');
      return `<section class="criteria-card" id="criteriaCard_${key}" data-criterion-card="${key}" aria-labelledby="criteriaHeading_${key}">
        <div class="criteria-card-heading">
          <span class="mini-circle" aria-hidden="true">${key}</span>
          <div class="criteria-card-title"><strong id="criteriaHeading_${key}">Criterion ${key}: ${escapeHtml(criterion.name)}</strong>
            <small>${key==='E'?escapeHtml(level)+' descriptor set · ':''}Maximum ${criterion.max} marks</small></div>
          <label class="criteria-mark-select">Teacher mark
            <select data-criteria-score="${key}" aria-label="Criterion ${key} awarded mark">
              <option value="">-- / ${criterion.max}</option>
              ${Array.from({length:criterion.max+1},(_,n)=>`<option value="${n}" ${mark===n?'selected':''}>${n} / ${criterion.max}</option>`).join('')}
            </select>
          </label>
        </div>
        <p class="criteria-focus">${escapeHtml(rubric.focus)}</p>
        <div class="criteria-levels" role="group" aria-label="All achievement levels for criterion ${key}">
          <div class="criteria-levels-head"><span>Mark</span><span>Achievement-level reference</span></div>
          ${levels}
        </div>
        <details class="criteria-considerations"><summary>What evidence should I look for?</summary><ul>${considerations}</ul></details>
        <label class="criteria-rationale">Teacher assessment rationale
          <textarea data-criteria-rationale="${key}" rows="2" maxlength="5000" placeholder="Why is this mark justified by evidence in the submitted IA?">${escapeHtml(state.justifications[key]||'')}</textarea>
        </label>
      </section>`;
    }).join('');
    $('criteriaCards').querySelectorAll('[data-criteria-score]').forEach(select=>{
      select.addEventListener('change',()=>setScore(select.dataset.criteriaScore,select.value));
    });
    $('criteriaCards').querySelectorAll('[data-rubric-key]').forEach(button=>{
      button.addEventListener('click',()=>setScore(button.dataset.rubricKey,button.dataset.rubricScore));
    });
    $('criteriaCards').querySelectorAll('[data-criteria-rationale]').forEach(area=>{
      watchHistoryField(area,'criterion '+area.dataset.criteriaRationale+' rationale');
      area.addEventListener('input',e=>{
        state.justifications[e.target.dataset.criteriaRationale]=e.target.value;
        scheduleSave();
      });
    });
    updateRubricMarks();
  }
  function openCriteriaDialog(){
    renderCriteria();
    $('criteriaDialog').showModal();
    $('criteriaScrollArea').scrollTop=0;
    updateRubricMarks();
  }
  function closeCriteriaGuide(){
    $('criteriaGuideFrame').removeAttribute('src');
    $('criteriaGuideLocalLink').removeAttribute('href');
    $('criteriaGuidePreview').classList.add('hidden');
    $('criteriaGuideInput').value='';
    if(guideObjectUrl){URL.revokeObjectURL(guideObjectUrl);guideObjectUrl=null;}
  }

  function renderTabs() {
    $('criterionTabs').innerHTML = ['all',...CRITERION_KEYS].map(key => `<button class="criterion-tab ${tab===key?'active':''}" data-criterion="${key}" type="button" aria-pressed="${tab===key}">${key === 'all' ? 'All' : key}</button>`).join('');
    $('criterionTabs').querySelectorAll('button').forEach(b => b.addEventListener('click', () => {tab = b.dataset.criterion;bankShowAll = false;renderTabs();renderBank();}));
  }
  function renderBank() {
    const all = getComments().filter(item => (item.courses || []).includes(state.course));
    const query = search.toLowerCase().trim();
    const quickIds=bankQuickFilter==='favorites'?quickPicks.favorites:bankQuickFilter==='recent'?quickPicks.recent:null;
    let items = all.filter(item => (tab === 'all'||item.criterion === tab) && (tone === 'all'||item.tone === tone) && (!quickIds||quickIds.includes(item.id))
      && (!query || [item.text,item.topic,item.criterion,...(item.tags || [])].join(' ').toLowerCase().includes(query)));
    if(quickIds)items=items.sort((a,b)=>quickIds.indexOf(a.id)-quickIds.indexOf(b.id));
    document.querySelectorAll('[data-bank-quick]').forEach(button=>{
      const active=button.dataset.bankQuick===bankQuickFilter;
      button.classList.toggle('is-active',active);
      button.setAttribute('aria-pressed',String(active));
    });
    $('bankTotal').textContent = `${all.length} comments`;
    $('bankFilteredCount').textContent = `${items.length} matching ${items.length===1?'comment':'comments'}`;
    const visible = bankShowAll ? items : items.slice(0,MAX_BANK_VISIBLE);
    $('commentList').innerHTML = visible.map(item => `<div class="comment-card ${draft?.id===item.id?'is-active':''}"><button type="button" class="comment-select" data-comment-id="${escapeHtml(item.id)}" aria-label="Use ${escapeHtml(item.criterion)} ${escapeHtml(item.tone)} comment as stamp"><span class="comment-card-head"><span class="polarity ${item.tone}">${item.tone==='strength'?'Strength':isFeedback()?'Improvement':'Limitation'}</span><span class="topic">${escapeHtml(item.criterion)} / ${escapeHtml(item.topic)}</span>${item.origin==='Teacher custom comment' ? '<span class="custom-tag">CUSTOM</span>' : ''}</span><p>${escapeHtml(item.text)}</p></button><div class="comment-card-actions"><button type="button" class="favourite-button ${quickPicks.favorites.includes(item.id)?'is-favourite':''}" data-favourite-comment="${escapeHtml(item.id)}" aria-pressed="${quickPicks.favorites.includes(item.id)}" aria-label="${quickPicks.favorites.includes(item.id)?'Remove from':'Add to'} favourite comments">${quickPicks.favorites.includes(item.id)?'★':'☆'} <span>Favourite</span></button><button type="button" data-copy-comment="${escapeHtml(item.id)}">Copy</button><button type="button" data-edit-comment="${escapeHtml(item.id)}">Edit</button></div></div>`).join('');
    if(!visible.length) $('commentList').innerHTML = '<p class="bank-empty">'+(bankQuickFilter==='favorites'?'No favourites yet. Star a comment in All to save it for quick stamping.':bankQuickFilter==='recent'?'No recent stamps yet. Placed comments will appear here.':'No matching comments. Try another search or write your own.')+'</p>';
    if(!bankShowAll && items.length>MAX_BANK_VISIBLE) $('commentList').insertAdjacentHTML('beforeend',`<button type="button" id="showMoreComments" class="btn subtle" style="width:100%">Show all ${items.length} comments</button>`);
    $('commentList').querySelectorAll('[data-comment-id]').forEach(button => button.addEventListener('click', () => prepareComment(button.dataset.commentId)));
    $('commentList').querySelectorAll('[data-favourite-comment]').forEach(button => button.addEventListener('click',()=>{
      toggleFavourite(button.dataset.favouriteComment);
    }));
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
      const isChanged=Boolean(activeCommentEdits()[item.id]);
      const editing=item.id===libraryEditingId;
      return `<article class="library-entry" data-library-id="${escapeHtml(item.id)}"><div class="library-entry-header"><span class="polarity ${item.tone}">${item.tone==='strength'?'Strength':isFeedback()?'Improvement':'Limitation'}</span><strong>${escapeHtml(item.criterion)} / ${escapeHtml(item.topic)}</strong><small>${escapeHtml(item.id)}${isCustom?' · Personal':isChanged?' · Edited':''}</small></div>${editing?`<div class="library-edit"><label>Category<input id="libraryEditTopic" maxlength="90" value="${escapeHtml(item.topic)}"></label><label>Comment<textarea id="libraryEditText" maxlength="1800" rows="4">${escapeHtml(item.text)}</textarea></label><div class="library-entry-actions"><button type="button" data-save-library="${escapeHtml(item.id)}" class="btn primary">Save changes</button><button type="button" data-cancel-library>Cancel</button>${isChanged?`<button type="button" data-restore-library="${escapeHtml(item.id)}">Restore original</button>`:''}${isCustom?`<button type="button" data-delete-library="${escapeHtml(item.id)}" class="danger-link">Delete personal comment</button>`:''}</div></div>`:`<p>${escapeHtml(item.text)}</p><div class="library-entry-actions"><button type="button" data-copy-library="${escapeHtml(item.id)}">Copy comment</button><button type="button" data-edit-library="${escapeHtml(item.id)}">Edit wording</button><button type="button" data-use-library="${escapeHtml(item.id)}">Use as stamp</button><button type="button" data-favourite-library="${escapeHtml(item.id)}" aria-pressed="${quickPicks.favorites.includes(item.id)}">${quickPicks.favorites.includes(item.id)?'★ Remove favourite':'☆ Add favourite'}</button></div>`}</article>`;
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
    const custom=activeCustomComments().find(c=>c.id===id);
    if(custom){custom.text=text.slice(0,1800);custom.topic=topic.slice(0,90);}
    else {
      const original=activeBank().find(c=>c.id===id);if(!original)return;
      if(isFeedback()){
        if(text===original.text && topic===original.topic)delete state.feedbackEdits[id];
        else state.feedbackEdits[id]={text:text.slice(0,1800),topic:topic.slice(0,90)};
      }else{
        if(text===original.text && topic===original.topic)delete state.commentEdits[id];
        else state.commentEdits[id]={text:text.slice(0,1800),topic:topic.slice(0,90)};
      }
    }
    libraryEditingId=null;saveLibrarySettings();renderBank();renderFullLibrary();toast('Library comment saved for future use.');
  }
  function handleLibraryAction(event) {
    const button=event.target.closest('button[data-copy-library],button[data-edit-library],button[data-use-library],button[data-save-library],button[data-cancel-library],button[data-restore-library],button[data-delete-library],button[data-favourite-library]');
    if(!button)return;
    const id=button.dataset.copyLibrary||button.dataset.editLibrary||button.dataset.useLibrary||button.dataset.saveLibrary||button.dataset.restoreLibrary||button.dataset.deleteLibrary||button.dataset.favouriteLibrary;
    const item=getComments().find(c=>c.id===id);
    if(button.dataset.copyLibrary && item){copyCommentText(item.text);return;}
    if(button.hasAttribute('data-favourite-library')){toggleFavourite(id);return;}
    if(button.hasAttribute('data-edit-library')){libraryEditingId=id;renderFullLibrary();$('libraryEditText')?.focus();return;}
    if(button.hasAttribute('data-cancel-library')){libraryEditingId=null;renderFullLibrary();return;}
    if(button.hasAttribute('data-save-library')){saveLibraryEdit(id);return;}
    if(button.hasAttribute('data-use-library')){$('libraryDialog').close();libraryEditingId=null;prepareComment(id);return;}
    if(button.hasAttribute('data-restore-library')){delete activeCommentEdits()[id];libraryEditingId=null;saveLibrarySettings();renderBank();renderFullLibrary();toast('Original library wording restored.');return;}
    if(button.hasAttribute('data-delete-library')){
      if(!confirm('Delete this personal library comment? Previously placed stamps will not change.'))return;
      if(isFeedback())state.feedbackComments=state.feedbackComments.filter(c=>c.id!==id);
      else state.customComments=state.customComments.filter(c=>c.id!==id);
      libraryEditingId=null;
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
    finishFieldHistory();
    const item = getComments().find(c=>c.id===id);
    if(!item) return;
    selectedStampId = null; movingStampId = null;
    draft = {...item,priority:'normal',
      size:state.stampStyle.size,noteWidth:state.stampStyle.noteWidth,noteHeight:null,
      fontSize:state.stampStyle.fontSize,textColor:state.stampStyle.textColor,
      fillColor:state.stampStyle.fillColor,borderColor:state.stampStyle.borderColor,
      color:item.tone==='strength'?state.stampStyle.strengthColor:state.stampStyle.limitationColor};
    renderEditor();renderBank();renderStamps();setInstruction();
    setWorkspaceView('edit',{openOnMobile:true,focusControl:true});
    if(!isReady()) toast('Comment selected. Upload a PDF to place the stamp.');
  }
  function prepareFromExistingStamp(stamp){
    if(!stamp)return;
    draft={
      id:stamp.libraryId||'repeat-'+stamp.id,
      libraryId:stamp.libraryId||'',
      criterion:stamp.criterion,tone:stamp.tone,topic:stamp.topic,text:stamp.text,priority:feedbackPriority(stamp.priority),
      size:stamp.size,color:stamp.color,noteWidth:stamp.noteWidth,noteHeight:stamp.noteHeight,
      fontSize:stamp.fontSize,textColor:stamp.textColor,
      fillColor:stamp.fillColor,borderColor:stamp.borderColor,
    };
    selectedStampId=null;movingStampId=null;
    renderEditor();renderBank();renderStamps();setInstruction();
    setWorkspaceView('edit',{openOnMobile:true});
    if(isReady()&&!mobileWorkspace())$('pdfScroll').scrollIntoView({behavior:'smooth',block:'nearest'});
  }
  function appearanceEditor(item,prefix) {
    const size=normalSize(item.size),color=stampColor(item);
    const width=normalNoteWidth(item.noteWidth ?? state.stampStyle.noteWidth);
    const fontSize=noteFontSize(item);
    const natural=noteLayout({...item,noteWidth:width,noteHeight:null},pageWidthPt||595,pageHeightPt||842).minHeight;
    const manualHeight=normalNoteHeight(item.noteHeight);
    const heightValue=manualHeight??Math.min(750,natural);
    return `<details class="individual-appearance" id="${prefix}Appearance" data-editor-key="${escapeHtml(prefix+item.id)}"><summary class="individual-appearance-summary"><span>Stamp appearance &amp; box size</span><small>Optional · customise</small></summary><div class="individual-stamp-style">
      <span class="comment-style-heading">Criterion circle</span>
      <label for="${prefix}Size">Circle size <output id="${prefix}SizeValue">${size} pt</output><input id="${prefix}Size" type="range" min="14" max="42" step="2" value="${size}"></label>
      <label for="${prefix}Color">Circle colour <input id="${prefix}Color" type="color" value="${color}"></label>
      <span class="comment-style-heading">Full comment formatting</span>
      <label class="note-dimension-field" for="${prefix}Font">Font size <output id="${prefix}FontValue">${fontSize} pt</output><input id="${prefix}Font" type="range" min="7" max="18" step=".5" value="${fontSize}" aria-label="Font size for the full teacher comment"></label>
      <div class="note-colours">
        <label for="${prefix}TextColor">Text colour <input id="${prefix}TextColor" type="color" value="${noteTextColor(item)}"></label>
        <label for="${prefix}FillColor">Box background <input id="${prefix}FillColor" type="color" value="${noteFillColor(item)}"></label>
        <label for="${prefix}BorderColor">Box border <input id="${prefix}BorderColor" type="color" value="${noteBorderColor(item)}"></label>
      </div>
      <span class="comment-style-heading">Text box dimensions</span>
      <label class="note-dimension-field" for="${prefix}Width">Box width <output id="${prefix}WidthValue">${width} pt</output><input id="${prefix}Width" type="range" min="170" max="450" step="5" value="${width}"></label>
      <label class="note-dimension-field" for="${prefix}Height">Box height <output id="${prefix}HeightValue">${manualHeight===null?'Auto · '+natural+' pt':manualHeight+' pt'}</output><input id="${prefix}Height" type="range" min="55" max="750" step="5" value="${heightValue}"></label>
      <button id="${prefix}HeightAuto" type="button" class="text-button note-fit-button">Fit box height to full comment</button>
      <small class="note-format-help">Drag the bottom-right handle on a placed comment to resize both dimensions. Export will stop if text is clipped.</small>
    </div></details>`;
  }
  function bindAppearanceEditor(item,prefix,existing) {
    const refresh=()=>{
      const natural=noteLayout({...item,noteHeight:null},pageWidthPt||595,pageHeightPt||842).minHeight;
      const height=normalNoteHeight(item.noteHeight);
      $(`${prefix}HeightValue`).textContent=height===null?`Auto · ${natural} pt`:`${height} pt`;
      if(height===null)$(`${prefix}Height`).value=String(Math.min(750,natural));
      if(existing){renderStamps();scheduleSave();}
    };
    $(`${prefix}Size`).addEventListener('input',e=>{
      item.size=normalSize(e.target.value);$(`${prefix}SizeValue`).textContent=`${item.size} pt`;refresh();
    });
    $(`${prefix}Color`).addEventListener('input',e=>{item.color=normalColor(e.target.value,stampColor(item));refresh();});
    $(`${prefix}Width`).addEventListener('input',e=>{
      item.noteWidth=normalNoteWidth(e.target.value);
      $(`${prefix}WidthValue`).textContent=`${item.noteWidth} pt`;refresh();
    });
    $(`${prefix}Font`).addEventListener('input',e=>{
      item.fontSize=normalFontSize(e.target.value);
      $(`${prefix}FontValue`).textContent=`${item.fontSize} pt`;refresh();
    });
    for(const [suffix,key,fallback] of [
      ['TextColor','textColor',noteTextColor],
      ['FillColor','fillColor',noteFillColor],
      ['BorderColor','borderColor',noteBorderColor],
    ]){
      $(`${prefix}${suffix}`).addEventListener('input',e=>{
        item[key]=normalColor(e.target.value,fallback(item));refresh();
      });
    }
    $(`${prefix}Height`).addEventListener('input',e=>{
      item.noteHeight=normalNoteHeight(e.target.value);refresh();
    });
    $(`${prefix}HeightAuto`).addEventListener('click',()=>{
      const before=existing?historySnapshot():null;
      item.noteHeight=null;refresh();
      if(existing)recordHistory('fit '+item.criterion+' comment box',before);
    });
    if(existing){
      for(const field of ['Size','Color','Width','Font','TextColor','FillColor','BorderColor','Height']){
        watchHistoryField($(`${prefix}${field}`),'format '+item.criterion+' comment',true);
      }
    }
  }
  function renderEditor() {
    // Keep advanced settings open through subsequent edits to this same stamp
    // without expanding them by default for newly chosen comments.
    const previousAppearance=$('selectionEditor').querySelector('.individual-appearance');
    const expandedEditorKey=previousAppearance?.open?previousAppearance.dataset.editorKey:null;
    const restoreAppearance=()=>{
      const active=$('selectionEditor').querySelector('.individual-appearance');
      if(active&&active.dataset.editorKey===expandedEditorKey)active.open=true;
    };
    finishFieldHistory();
    const stamp = selectedStamp();
    const priorityField=item=>isFeedback()&&item.tone==='limitation'
      ?'<label class="feedback-priority-field">Revision priority<select id="feedbackStampPriority" aria-label="Priority for this improvement action">'
        +['high','normal','low'].map(v=>'<option value="'+v+'" '+(feedbackPriority(item.priority)===v?'selected':'')+'>'
          +({high:'High - address first',normal:'Standard',low:'Lower - polish'}[v])+'</option>').join('')+'</select></label>'
      :'';
    const bindPriority=(item,placed)=>{
      const control=$('feedbackStampPriority');if(!control)return;
      control.addEventListener('change',event=>{
        const before=placed?historySnapshot():null;
        item.priority=feedbackPriority(event.target.value);
        if(placed){recordHistory('change revision priority',before);renderStamps();scheduleSave();}
      });
    };
    if(stamp) {
      $('selectionEditor').innerHTML = `<div class="selection-active"><div class="selection-title"><strong>Edit ${stamp.criterion} ${isFeedback()?'feedback':'evidence'} stamp</strong><small>Page ${stamp.page} · ${stamp.tone==='strength'?'Strength':isFeedback()?'Improvement':'Limitation'}</small></div><textarea id="stampTextEdit" maxlength="1800" aria-label="Edit only this placed stamp comment">${escapeHtml(stamp.text)}</textarea>${priorityField(stamp)}${appearanceEditor(stamp,'selectedStamp')}<div class="edit-stamp-toolbar"><button id="moveStamp" class="btn subtle" type="button">Move position</button><button id="copyStamp" class="btn subtle" type="button">Copy text</button><button id="duplicateStamp" class="btn subtle" type="button">Duplicate &amp; place</button><button id="deleteStamp" class="link-button danger-link" type="button">Delete stamp</button></div></div>`;
      $('stampTextEdit').addEventListener('input', e => {stamp.text=e.target.value;renderStamps();scheduleSave();});
      watchHistoryField($('stampTextEdit'),'edit '+stamp.criterion+' comment');
      restoreAppearance();
      bindAppearanceEditor(stamp,'selectedStamp',true);
      bindPriority(stamp,true);
      $('moveStamp').addEventListener('click',()=>{movingStampId=stamp.id;draft=null;selectedStampId=null;renderEditor();setInstruction(); if (currentPage!==stamp.page) navigate(stamp.page);});
      $('copyStamp').addEventListener('click',()=>copyCommentText(stamp.text));
      $('duplicateStamp').addEventListener('click',()=>{
        finishFieldHistory();prepareFromExistingStamp(stamp);
        toast('Duplicate comment ready. Click clear space on the PDF to place it.');
      });
      $('deleteStamp').addEventListener('click',()=>{
        finishFieldHistory();const before=historySnapshot();
        state.stamps=state.stamps.filter(s=>s.id!==stamp.id);selectedStampId=null;
        renderEditor();renderStamps();renderBank();scheduleSave();
        recordHistory('delete '+stamp.criterion+' comment',before);
        if(isFeedback())delete state.feedbackCompleted[stamp.id];
        toast((isFeedback()?'Feedback':'Evidence')+' stamp deleted. Use Undo to restore it.');
      });
      return;
    }
    if(!draft) {
      $('selectionEditor').innerHTML = '<div class="selection-empty"><span class="small-ring">A</span><span>Choose a comment to prepare a stamp.</span></div>';
      return;
    }
    $('selectionEditor').innerHTML = `<div class="selection-active"><div class="selection-title"><strong>Ready: criterion ${escapeHtml(draft.criterion)}</strong><span class="polarity ${draft.tone}">${draft.tone==='strength'?'Strength':isFeedback()?'Improvement':'Limitation'}</span></div><textarea id="draftTextEdit" maxlength="1800" aria-label="Personalise only this stamp comment">${escapeHtml(draft.text)}</textarea>${priorityField(draft)}${appearanceEditor(draft,'draftStamp')}<div class="selection-actions"><small>Personalise this stamp before placing it on the PDF.</small><button type="button" class="btn primary" id="placeHint">${isReady()?'Click PDF to place':'Add PDF first'} &#8594;</button></div></div>`;
    $('draftTextEdit').addEventListener('input',e=>{draft.text=e.target.value;});
    restoreAppearance();
    bindAppearanceEditor(draft,'draftStamp',false);
    bindPriority(draft,false);
    $('placeHint').addEventListener('click',()=>{
      if(!isReady()) $('pdfInput').click();
      else {closeMobileDrawer();$('pdfScroll').scrollIntoView({behavior:'smooth',block:'nearest'});toast('Click beside the evidence on the PDF to place this stamp.');}
    });
  }

  function pageStamps(page) { return state.stamps.filter(s=>s.page===page); }
  function stampLabel(stamp) { return `${stamp.criterion}${1+state.stamps.filter(s=>s.criterion===stamp.criterion).findIndex(s=>s.id===stamp.id)}`; }
  // A placed comment is on the original student page, not in a separate
  // margin. The same PDF-point measurements are used for preview and export.
  // Live preview and final export both use the exact same embedded Unicode
  // fonts and text-width metrics, rather than substituting ASCII placeholders.
  let unicodeBytesPromise=null,unicodeMetricsPromise=null,unicodeMetricFonts=null;
  const pdfFontPaths=[
    'vendor/fonts/NotoSans-Regular.ttf',
    'vendor/fonts/NotoSans-Bold.ttf',
    'vendor/fonts/NotoSansMath-Regular.ttf',
  ];
  async function getUnicodeFontBytes() {
    if(!unicodeBytesPromise)unicodeBytesPromise=Promise.all(pdfFontPaths.map(async path=>{
      const response=await fetch(path,{cache:'force-cache'});
      if(!response.ok)throw new Error('Missing required PDF text font: '+path);
      return new Uint8Array(await response.arrayBuffer());
    })).catch(error=>{unicodeBytesPromise=null;throw error;});
    return unicodeBytesPromise;
  }
  async function ensureUnicodeMetrics(){
    if(!unicodeMetricsPromise)unicodeMetricsPromise=(async()=>{
      if(!window.PDFLib||!window.fontkit)throw new Error('The Unicode PDF font library is unavailable.');
      const doc=await window.PDFLib.PDFDocument.create();
      const metrics=await createUnicodeFonts(doc,window.fontkit,await getUnicodeFontBytes());
      unicodeMetricFonts=metrics;
      return metrics;
    })().catch(error=>{unicodeMetricsPromise=null;throw error;});
    return unicodeMetricsPromise;
  }
  function pdfMeasureFont() {
    // Safe approximate metrics are used only before the fonts have loaded;
    // the editor and export are remeasured once the fonts are available.
    return unicodeMetricFonts?.regular || {widthOfTextAtSize:(txt,size)=>Array.from(String(txt)).length*size*.54};
  }
  function noteLayout(stamp,pageWidth,pageHeight,font=pdfMeasureFont()) {
    const width=Math.min(normalNoteWidth(stamp.noteWidth ?? state.stampStyle.noteWidth),Math.max(100,pageWidth-2*NOTE_PAD));
    const circle=normalSize(stamp.size),textX=Math.max(circle+17,42);
    const fontSize=noteFontSize(stamp),lineHeight=noteLineHeight(fontSize);
    const headerFontSize=Math.max(8,Math.min(12,Math.round(fontSize*.85*10)/10));
    const rows=pdfWrap(stamp.text,font,fontSize,Math.max(30,width-textX-8));
    const minHeight=Math.ceil(Math.max(circle+20,39+rows.length*lineHeight));
    const height=normalNoteHeight(stamp.noteHeight) ?? minHeight;
    const fits=height<=pageHeight-2*NOTE_PAD;
    const contentFits=height>=minHeight;
    const x=Math.min(Math.max(NOTE_PAD,Number(stamp.x||0)*pageWidth),Math.max(NOTE_PAD,pageWidth-width-NOTE_PAD));
    const y=Math.min(Math.max(NOTE_PAD,Number(stamp.y||0)*pageHeight),Math.max(NOTE_PAD,pageHeight-height-NOTE_PAD));
    return {x,y,width,height,circle,textX,rows,fontSize,headerFontSize,lineHeight,minHeight,contentFits,fits,
      textColor:noteTextColor(stamp),fillColor:noteFillColor(stamp),borderColor:noteBorderColor(stamp),pageWidth,pageHeight};
  }
  function noteOverlap(a,b) {
    return a.x<b.x+b.width-3 && a.x+a.width>b.x+3 && a.y<b.y+b.height-3 && a.y+a.height>b.y+3;
  }
  function pageLayoutProblems(stamps,pageWidth,pageHeight,font=pdfMeasureFont()) {
    const items=stamps.map(stamp=>({stamp,layout:noteLayout(stamp,pageWidth,pageHeight,font)}));
    const problems=[];
    for(let i=0;i<items.length;i++) {
      const current=items[i];
      if(!current.layout.fits) problems.push(`${stampLabel(current.stamp)} box is too tall for page ${current.stamp.page}`);
      if(!current.layout.contentFits) problems.push(`${stampLabel(current.stamp)} needs at least ${current.layout.minHeight} pt height for its complete comment (currently ${current.layout.height} pt)`);
      for(let j=0;j<i;j++) if(noteOverlap(current.layout,items[j].layout)) {
        problems.push(`${stampLabel(current.stamp)} overlaps ${stampLabel(items[j].stamp)} on page ${current.stamp.page}`);
      }
    }
    return {items,problems};
  }
  function placeNoteInFreeSpace(stamp,stamps,pageWidth,pageHeight) {
    const others=stamps.filter(item=>item.id!==stamp.id).map(item=>noteLayout(item,pageWidth,pageHeight));
    let best=noteLayout(stamp,pageWidth,pageHeight);
    if(!best.fits) return best;
    if(!others.some(rect=>noteOverlap(best,rect))) {
      stamp.x=best.x/pageWidth;stamp.y=best.y/pageHeight;return best;
    }
    // Nearby clear positions first; never hide or truncate the comment.
    // The teacher can subsequently drag the annotation into better whitespace.
    const step=20;
    const desiredX=best.x,desiredY=best.y;
    const candidates=[];
    for(let radius=step;radius<=Math.max(pageWidth,pageHeight);radius+=step) {
      for(let dy=-radius;dy<=radius;dy+=step) for(const dx of [-radius,radius]) candidates.push([desiredX+dx,desiredY+dy]);
      for(let dx=-radius+step;dx<radius;dx+=step) for(const dy of [-radius,radius]) candidates.push([desiredX+dx,desiredY+dy]);
      if(candidates.length>2000)break;
    }
    for(const [x,y] of candidates) {
      const candidate=noteLayout({...stamp,x:x/pageWidth,y:y/pageHeight},pageWidth,pageHeight);
      if(!others.some(rect=>noteOverlap(candidate,rect))) {
        stamp.x=candidate.x/pageWidth;stamp.y=candidate.y/pageHeight;return candidate;
      }
    }
    return best; // Export validation will require clearing any remaining overlap.
  }
  function renderStampWarnings(problems) {
    const el=$('annotationNotice');
    if(!el)return;
    if(!problems.length){el.classList.add('hidden');el.textContent='';return;}
    el.textContent=`On-page annotations need attention: ${problems.join('; ')}. Move or resize a box, increase its height, reduce the font size, or shorten the comment before exporting.`;
    el.classList.remove('hidden');
  }
  function renderStamps() {
    const stampsOnPage=pageStamps(currentPage);
    $('allPinCount').textContent=state.stamps.length;
    updateMobileChrome();
    renderEvidenceIfOpen();
    renderQuickPicker();
    const pageWidth=pageWidthPt||595,pageHeight=pageHeightPt||842;
    const preview=pageLayoutProblems(stampsOnPage,pageWidth,pageHeight);
    renderStampWarnings(preview.problems);
    $('stampLayer').innerHTML=preview.items.map(({stamp,layout})=>{
      const scale=viewScale||1;
      const label=stampLabel(stamp),color=stampColor(stamp);
      const lines=layout.rows.map(line=>`<span class="onpage-note-line">${escapeHtml(line)}</span>`).join('');
      const mismatch=preview.problems.some(issue=>issue.includes(label));
      return `<div role="button" tabindex="0" class="onpage-stamp ${stamp.id===selectedStampId?'active':''} ${mismatch?'note-conflict':''}" data-pin-id="${escapeHtml(stamp.id)}" style="left:${layout.x*scale}px;top:${layout.y*scale}px;width:${layout.width*scale}px;height:${layout.height*scale}px;--onpage-accent:${color};background:${layout.fillColor};border-color:${layout.borderColor};color:${layout.textColor};border-width:${Math.max(.7,1.25*scale)}px;border-radius:${Math.max(4,7*scale)}px;padding:0" aria-label="${escapeHtml(label+': '+stamp.text)}" title="Drag comment to move; drag bottom-right corner to resize">
        <span class="onpage-border-accent" style="background:${layout.borderColor};width:${Math.max(2,3*scale)}px"></span>
        <span class="onpage-circle" style="left:${8*scale}px;top:${11*scale}px;width:${layout.circle*scale}px;height:${layout.circle*scale}px;font-size:${Math.max(7,layout.circle*.56*scale)}px;background:${color};color:${stampTextColor(stamp)}">${escapeHtml(stamp.criterion)}</span>
        <span class="onpage-note-header" style="left:${layout.textX*scale}px;top:${10*scale}px;font-size:${layout.headerFontSize*scale}px;line-height:${Math.max(12,layout.headerFontSize*1.12)*scale}px;color:${layout.textColor}">${escapeHtml(label)} · ${stamp.tone==='strength'?'Strength':isFeedback()?'Improvement':'Limitation'}</span>
        <span class="onpage-note-body" style="left:${layout.textX*scale}px;top:${25*scale}px;font-size:${layout.fontSize*scale}px;line-height:${layout.lineHeight*scale}px;color:${layout.textColor}">${lines}</span>
        <button type="button" class="note-resize-handle" data-resize-pin="${escapeHtml(stamp.id)}" aria-label="Resize width and height of ${escapeHtml(label)} comment" title="Drag to resize comment width and height"></button>
      </div>`;
    }).join('');
    $('stampLayer').querySelectorAll('[data-pin-id]').forEach(btn=>{
      const select=()=>{
        const stamp=state.stamps.find(x=>x.id===btn.dataset.pinId);if(!stamp)return;
        selectedStampId=stamp.id;draft=null;movingStampId=null;
        renderStamps();renderEditor();renderBank();setInstruction();
        setWorkspaceView('edit',{openOnMobile:true});
      };
      let moved=false,startX=0,startY=0,originX=0,originY=0,dragBefore=null;
      btn.addEventListener('pointerdown',e=>{
        if(e.button!==0 || e.target.closest('.note-resize-handle'))return;
        const stamp=state.stamps.find(x=>x.id===btn.dataset.pinId);if(!stamp)return;
        const layout=noteLayout(stamp,pageWidth,pageHeight);
        finishFieldHistory();dragBefore=historySnapshot();
        moved=false;startX=e.clientX;startY=e.clientY;originX=layout.x;originY=layout.y;
        btn.setPointerCapture?.(e.pointerId);
      });
      btn.addEventListener('pointermove',e=>{
        if(!btn.hasPointerCapture?.(e.pointerId))return;
        const dx=e.clientX-startX,dy=e.clientY-startY;
        if(Math.hypot(dx,dy)<4&&!moved)return;
        moved=true;
        const l=noteLayout({...state.stamps.find(x=>x.id===btn.dataset.pinId),
          x:(originX+dx/(viewScale||1))/pageWidth,y:(originY+dy/(viewScale||1))/pageHeight},pageWidth,pageHeight);
        btn.style.left=`${l.x*(viewScale||1)}px`;btn.style.top=`${l.y*(viewScale||1)}px`;
      });
      btn.addEventListener('pointerup',e=>{
        const stamp=state.stamps.find(x=>x.id===btn.dataset.pinId);if(!stamp)return;
        if(moved){
          const x=(originX+(e.clientX-startX)/(viewScale||1))/pageWidth;
          const y=(originY+(e.clientY-startY)/(viewScale||1))/pageHeight;
          const layout=noteLayout({...stamp,x,y},pageWidth,pageHeight);
          stamp.x=layout.x/pageWidth;stamp.y=layout.y/pageHeight;
          recordHistory('drag '+stamp.criterion+' comment',dragBefore);
          scheduleSave();toast('On-page comment moved; the exported PDF uses this position.');
        }
        select();e.stopPropagation();
      });
      btn.addEventListener('keydown',e=>{
        if(e.target===btn && (e.key==='Enter'||e.key===' ')){e.preventDefault();select();}
      });
      btn.addEventListener('click',e=>e.stopPropagation());
      const handle=btn.querySelector('.note-resize-handle');
      let resizing=false,fromX=0,fromY=0,originalWidth=0,originalHeight=0,anchorX=0,anchorY=0,resizeBefore=null;
      const resizeTo=(event)=>{
        const stamp=state.stamps.find(x=>x.id===btn.dataset.pinId);if(!stamp)return null;
        const scale=viewScale||1;
        const maxWidth=Math.min(450,pageWidth-NOTE_PAD-anchorX);
        const maxHeight=Math.min(750,pageHeight-NOTE_PAD-anchorY);
        const desiredWidth=Math.max(170,Math.min(maxWidth,originalWidth+(event.clientX-fromX)/scale));
        const desiredHeight=Math.max(55,Math.min(maxHeight,originalHeight+(event.clientY-fromY)/scale));
        const mock={...stamp,noteWidth:desiredWidth,noteHeight:desiredHeight};
        const layout=noteLayout(mock,pageWidth,pageHeight);
        btn.style.width=`${layout.width*scale}px`;
        btn.style.height=`${layout.height*scale}px`;
        btn.classList.toggle('note-conflict',!layout.contentFits||!layout.fits);
        btn.querySelector('.onpage-note-body').innerHTML=layout.rows.map(row=>`<span class="onpage-note-line">${escapeHtml(row)}</span>`).join('');
        return {width:layout.width,height:layout.height};
      };
      handle.addEventListener('pointerdown',e=>{
        if(e.button!==0)return;
        const stamp=state.stamps.find(x=>x.id===btn.dataset.pinId);if(!stamp)return;
        const layout=noteLayout(stamp,pageWidth,pageHeight);
        finishFieldHistory();resizeBefore=historySnapshot();
        resizing=true;fromX=e.clientX;fromY=e.clientY;originalWidth=layout.width;originalHeight=layout.height;
        anchorX=layout.x;anchorY=layout.y;
        handle.setPointerCapture?.(e.pointerId);e.stopPropagation();e.preventDefault();
      });
      handle.addEventListener('pointermove',e=>{
        if(resizing && handle.hasPointerCapture?.(e.pointerId))resizeTo(e);
        e.stopPropagation();
      });
      handle.addEventListener('pointerup',e=>{
        if(!resizing)return;
        const next=resizeTo(e);
        resizing=false;
        const stamp=state.stamps.find(x=>x.id===btn.dataset.pinId);
        if(stamp&&next){
          stamp.noteWidth=normalNoteWidth(next.width);stamp.noteHeight=normalNoteHeight(next.height);
          selectedStampId=stamp.id;draft=null;movingStampId=null;
          renderStamps();renderEditor();renderBank();setInstruction();scheduleSave();
          recordHistory('resize '+stamp.criterion+' comment',resizeBefore);
          toast('Comment box resized. Check that all text fits before export.');
        }
        e.stopPropagation();e.preventDefault();
      });
      handle.addEventListener('pointercancel',e=>{resizing=false;renderStamps();e.stopPropagation();});
      handle.addEventListener('click',e=>e.stopPropagation());
      handle.addEventListener('keydown',e=>{
        if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;
        e.preventDefault();e.stopPropagation();
        const stamp=state.stamps.find(x=>x.id===btn.dataset.pinId);if(!stamp)return;
        const before=historySnapshot();
        const l=noteLayout(stamp,pageWidth,pageHeight);
        const nextWidth=l.width+(e.key==='ArrowLeft'?-5:e.key==='ArrowRight'?5:0);
        const nextHeight=l.height+(e.key==='ArrowUp'?-5:e.key==='ArrowDown'?5:0);
        stamp.noteWidth=normalNoteWidth(nextWidth);stamp.noteHeight=normalNoteHeight(nextHeight);
        selectedStampId=stamp.id;renderStamps();renderEditor();scheduleSave();
        recordHistory('resize '+stamp.criterion+' comment',before);
      });
    });
    const container=$('stampsList');
    const sorted=[...state.stamps].sort((a,b)=>a.page-b.page||a.y-b.y);
    container.innerHTML=sorted.length?sorted.map(stamp=>`<button type="button" class="stamp-row ${selectedStampId===stamp.id?'is-selected':''}" data-sidebar-pin="${escapeHtml(stamp.id)}"><span class="mini-circle ${stamp.tone}" style="background:${stampColor(stamp)};color:${stampTextColor(stamp)}">${stamp.criterion}</span><span class="stamp-info"><strong>Page ${stamp.page} · ${stamp.tone==='strength'?'Strength':isFeedback()?'Improvement':'Limitation'}</strong><span>${escapeHtml(stamp.text)}</span></span></button>`).join(''):'<p class="muted centered">Your evidence annotations will appear here.</p>';
    container.querySelectorAll('[data-sidebar-pin]').forEach(button=>button.addEventListener('click',()=>{
      const stamp=state.stamps.find(s=>s.id===button.dataset.sidebarPin);if(!stamp)return;
      selectedStampId=stamp.id;draft=null;movingStampId=null;
      if(currentPage!==stamp.page)navigate(stamp.page);else renderStamps();
      renderEditor();renderBank();setInstruction();
      setWorkspaceView('edit',{openOnMobile:true});
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
    if(!isReady()||event.target.closest('.onpage-stamp'))return;
    finishFieldHistory();
    const position = positionOnPage(event);
    if(movingStampId) {
      const stamp = state.stamps.find(s=>s.id===movingStampId);
      if(!stamp)return;
      const before=historySnapshot();
      stamp.x=position.x;stamp.y=position.y;stamp.page=currentPage;
      if(pageWidthPt&&pageHeightPt)placeNoteInFreeSpace(stamp,pageStamps(currentPage),pageWidthPt,pageHeightPt);
      selectedStampId=stamp.id;movingStampId=null;renderStamps();renderEditor();setInstruction();scheduleSave();
      recordHistory('move '+stamp.criterion+' comment',before);
      toast('Stamp moved.');
      return;
    }
    if(!draft)return;
    if(!draft.text.trim()){toast('Write a comment before placing the stamp.');return;}
    const before=historySnapshot();
    const stamp = {
      id:makeId(),page:currentPage,x:position.x,y:position.y,criterion:draft.criterion,tone:draft.tone,
      topic:draft.topic,text:draft.text.trim(),size:normalSize(draft.size),color:stampColor(draft),
      noteWidth:normalNoteWidth(draft.noteWidth),noteHeight:normalNoteHeight(draft.noteHeight),
      fontSize:noteFontSize(draft),textColor:noteTextColor(draft),fillColor:noteFillColor(draft),
      borderColor:noteBorderColor(draft),libraryId:draft.id,createdAt:now(),priority:feedbackPriority(draft.priority),
    };
    if(pageWidthPt&&pageHeightPt)placeNoteInFreeSpace(stamp,pageStamps(currentPage),pageWidthPt,pageHeightPt);
    state.stamps.push(stamp);
    lastPlacedDraft={...stamp};
    const sourceId=stamp.libraryId;
    if(repeatPlacement){
      draft={...draft};
      selectedStampId=null;
    }else{selectedStampId=stamp.id;draft=null;}
    recordHistory('place '+stamp.criterion+' comment',before);
    renderStamps();renderEditor();renderBank();setInstruction();scheduleSave();
    workspaceView='edit';updateWorkspaceLayout({rerender:false});
    recordRecentComment(sourceId);
    toast(`${stamp.criterion} ${isFeedback()&&stamp.tone==='limitation'?'revision action':stamp.tone} stamp placed on page ${currentPage}.`
      +(repeatPlacement?' Repeat is on: click another clear area to stamp again.':''));
  }
  async function ensurePdfRenderer() {
    if (pdfjsLib) return pdfjsLib;
    if (!pdfRendererLoad) {
      pdfRendererLoad = import('./vendor/pdf.mjs').then(module => {
        pdfjsLib = module;
        window.pdfjsLib = module;
        module.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.mjs';
        $('pdfLibraryStatus').classList.add('hidden');
        return module;
      }).catch(error => {
        console.error('IA Marking Desk: PDF renderer failed to load from deployed vendor assets.',error);
        pdfRendererLoad = null;
        $('pdfLibraryStatus').textContent = 'The PDF viewer is missing from this deployment. The comment library and marking criteria are still available. The site must be published from its compiled GitHub Actions build.';
        $('pdfLibraryStatus').classList.remove('hidden');
        return null;
      });
    }
    return pdfRendererLoad;
  }

  async function loadPdf(bytes,name,keepStamps=false) {
    const renderer = await ensurePdfRenderer();
    if(!renderer) { toast('PDF viewer missing from this deployment. Open the reference library while the site build is corrected.'); return false; }
    const clone = new Uint8Array(bytes);
    try {
      const loaded = await renderer.getDocument({
        data:new Uint8Array(clone),isEvalSupported:false,
        cMapUrl:'vendor/cmaps/',cMapPacked:true,standardFontDataUrl:'vendor/standard_fonts/',wasmUrl:'vendor/wasm/'
      }).promise;
      resetHistory();lastPlacedDraft=null;repeatPlacement=false;
      if(!keepStamps){const replacingExistingPdf=isReady();state.stamps=[];state.markingStamps=[];state.feedbackStamps=[];state.feedbackCompleted={};if(replacingExistingPdf){state.marks=freshMarks();state.justifications=freshJustifications();}selectedStampId=null;movingStampId=null;draft=null;}
      pdfDoc=loaded;state.pdfBytes=clone;state.pdfName=name || 'uploaded-ia.pdf';
      currentPage=1;zoom=1;
      $('emptyViewer').classList.add('hidden');$('pageShell').classList.remove('hidden');
      $('uploadTitle').textContent='Replace PDF';$('uploadSubtext').textContent=isFeedback()?'Choose a different draft PDF':'Choose a different final IA';
      $('documentMeta').classList.remove('hidden');$('documentName').textContent=state.pdfName;
      $('documentDetails').textContent=`${loaded.numPages} pages  /  ${niceBytes(clone.byteLength)}`;
      $('pageTotal').textContent=String(loaded.numPages);$('pageNumber').max=String(loaded.numPages);
      $('footerDocInfo').textContent=`${loaded.numPages} pages  /  ${state.pdfName}`;
      updateModeUI();updateScores();renderEditor();renderStamps();setInstruction();
      if(!layoutOverride)documentCollapsed=true;
      closeMobileDrawer();updateWorkspaceLayout({rerender:false});
      try {await ensureUnicodeMetrics();}
      catch(fontError){
        console.warn('Unicode PDF fonts not available yet:',fontError);
        $('pdfLibraryStatus').textContent='Unicode PDF fonts could not be loaded. You can continue annotating, but export preview will require the fonts to load successfully.';
        $('pdfLibraryStatus').classList.remove('hidden');
      }
      await renderPage();scheduleSave();
      return true;
    } catch(e) {console.error(e);const reason=e?.name==='PasswordException'?'This PDF is password protected. Please use an unlocked copy.':e?.name==='InvalidPDFException'?'The file is not recognised as a valid PDF.':'The PDF could not be opened. Please check the file and retry.';$('pdfLibraryStatus').textContent=reason;$('pdfLibraryStatus').classList.remove('hidden');toast(reason);return false;}
  }
  async function renderPage() {
    if(!isReady())return;
    const token = ++rendering;
    try {
      if (activeRenderTask) { try { activeRenderTask.cancel(); } catch (_) {} }
      const page = await pdfDoc.getPage(currentPage);
      if(token!==rendering)return;
      const original = page.getViewport({scale:1});
      pageWidthPt=original.width;pageHeightPt=original.height;
      const baseWidth=Math.max(280,$('pdfScroll').clientWidth-60);
      const scale=Math.min(1.5,baseWidth/original.width)*zoom;
      const viewport=page.getViewport({scale});
      viewScale=viewport.width/original.width;
      const displayRatio = Math.min(window.devicePixelRatio || 1,2);
      const canvas = $('pdfCanvas');
      canvas.width = Math.floor(viewport.width*displayRatio);
      canvas.height = Math.floor(viewport.height*displayRatio);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      const pageShell=$('pageShell');
      pageShell.style.width=`${viewport.width}px`;
      pageShell.style.height=`${viewport.height}px`;
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
    return renderPage();
  }

  function setLocalSaveStatus(message,kind='saved'){
    const indicator=$('localSaveState');
    indicator.textContent=message;
    indicator.dataset.save=kind;
    indicator.title=message;
  }
  function updateLocalSaveStatus(){
    if(storageError){setLocalSaveStatus('Browser storage unavailable','error');return;}
    if(!projectVault){setLocalSaveStatus('Checking local storage…','pending');return;}
    if(!isReady()){setLocalSaveStatus('No IA open','saved');return;}
    if(projectRevision>persistedRevision){
      setLocalSaveStatus('Saving locally…','pending');return;
    }
    setLocalSaveStatus('Saved on this device','saved');
  }
  // Capture the current project while its ID and source PDF are stable. The
  // serialized chain prevents a delayed write from overwriting newer data.
  async function storeAutosave(){
    if(projectLoading||!isReady()||!activeProjectId)return true;
    if(!projectVault){
      updateLocalSaveStatus();return false;
    }
    clearTimeout(savingTimer);
    const id=activeProjectId,revision=projectRevision;
    const snapshot=projectData(false);
    const source=state.pdfBytes,pageCount=pdfDoc?.numPages||0;
    const task=saveChain.catch(()=>{}).then(()=>projectVault.save({
      id,project:snapshot,pdfBytes:source,pageCount,
    }));
    saveChain=task;
    try{
      const saved=await task;
      if(id===activeProjectId){
        persistedRevision=Math.max(persistedRevision,revision);
        activeSavedAt=saved.savedAt;
        updateLocalSaveStatus();
        if(!storageError)$('projectsStorageWarning').classList.add('hidden');
      }
      if($('projectsDialog').open)await refreshProjectDashboard();
      return true;
    }catch(error){
      console.error('IA browser autosave failed:',error);
      if(id===activeProjectId){
        setLocalSaveStatus('Not saved — download backup','error');
        $('projectsStorageWarning').textContent='Browser save failed: '+(error?.message||String(error))+'. Keep this IA open and download a portable backup before leaving.';
        $('projectsStorageWarning').classList.remove('hidden');
      }
      return false;
    }
  }
  function scheduleSave(){
    if(reviewPreview.bytes)invalidateReviewPreview();
    if(projectLoading)return;
    if(!isReady())return;
    if(!activeProjectId)activeProjectId=createLocalProjectId();
    projectRevision++;
    updateLocalSaveStatus();
    clearTimeout(savingTimer);
    savingTimer=setTimeout(()=>{void storeAutosave();},1300);
  }
  async function preserveActiveProject(){
    finishFieldHistory();
    clearTimeout(savingTimer);
    try{await saveChain;}catch(error){} // New attempt below reports any failure.
    if(!isReady())return true;
    if(!projectVault){
      toast('Browser storage unavailable. Download the editable backup before switching projects.');
      setLocalSaveStatus('Not saved — download backup','error');
      return false;
    }
    if(projectRevision>persistedRevision){
      const success=await storeAutosave();
      if(!success){
        toast('This IA could not be saved. Download its backup instead of switching.');
        return false;
      }
    }
    return true;
  }
  function formatSavedDate(value){
    const time=new Date(value);
    return Number.isNaN(time.getTime())?'Unknown':time.toLocaleString(undefined,{
      year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'
    });
  }
  function renderProjectDashboard(){
    const all=cachedProjectSummaries;
    const count=all.length;
    $('projectCountBadge').textContent=String(count);
    $('downloadAllProjects').disabled=!count||!projectVault;
    $('openClearProjects').disabled=!count||!projectVault;
    $('resumeLast').classList.toggle('hidden',count===0||isReady());
    const recorded=all.filter(row=>row.markedCount===5).length;
    const inProgress=all.filter(row=>row.activeMode==='feedback'?row.feedbackAnnotations>0:row.markedCount>0&&row.markedCount<5||row.markedCount===0&&row.annotations>0).length;
    const stamps=all.reduce((total,row)=>total+row.annotations+(row.feedbackAnnotations||0),0);
    const feedbackActions=all.reduce((total,row)=>total+(row.feedbackActions||0),0);
    $('projectsStats').innerHTML=[
      ['Local projects',count],['5/5 marks recorded',recorded],
      ['In progress',inProgress],['All stamps',stamps],['Student actions',feedbackActions],
    ].map(([label,value])=>'<div class="projects-stat"><strong>'+value+'</strong><small>'+label+'</small></div>').join('');
    const search=$('projectsSearch').value.trim().toLowerCase(),course=$('projectsCourse').value;
    const visible=all.filter(row=>(course==='all'||row.course===course)
      &&(!search||[row.candidate,row.pdfName,row.course,row.session].join(' ').toLowerCase().includes(search)));
    $('projectsRows').innerHTML=visible.length?visible.map(row=>{
      const name=row.candidate||'Unlabelled IA';
      const current=row.id===activeProjectId;
      const progress=row.activeMode==='feedback'?(row.feedbackActions?Math.round(row.feedbackDone/row.feedbackActions*100):0):row.markedCount*20;
      return '<article class="project-card '+(current?'is-current':'')+'" data-project-card="'+escapeHtml(row.id)+'">'
        +'<div class="project-card-heading"><div><strong>'+escapeHtml(name)+'</strong>'
        +'<p>'+escapeHtml(row.pdfName)+'</p></div>'
        +(current?'<span class="project-current-pill">Currently open</span>':'')+'</div>'
        +'<div class="project-card-details"><span>'+escapeHtml(row.course)+'</span>'
        +'<span>'+escapeHtml(row.session||'Session not set')+'</span>'
        +'<span>'+(row.pageCount?row.pageCount+' pages':'Page count on open')+'</span><span>'+niceBytes(row.fileSize)+'</span>'
        +'<span>'+row.annotations+' evidence stamps</span><span>'+(row.feedbackAnnotations||0)+' feedback stamps</span></div>'
        +(row.activeMode==='feedback'
          ?'<div class="project-progress-row"><span>'+row.feedbackDone+'/'+row.feedbackActions+' revision actions checked</span>'
            +'<span class="project-progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+progress+'" aria-label="Feedback revisions checked"><span style="width:'+progress+'%"></span></span>'
            +'<small>First draft feedback</small></div>'
          :'<div class="project-progress-row"><span>'+row.markedCount+'/5 criterion marks</span>'
            +'<span class="project-progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="5" aria-valuenow="'+row.markedCount+'" aria-label="Number of criterion marks recorded"><span style="width:'+progress+'%"></span></span>'
            +'<small>'+(row.total===null?'Not fully marked':row.total+'/20 recorded')+'</small></div>')
        +'<div class="project-card-footer"><span class="project-card-last">Saved '+escapeHtml(formatSavedDate(row.savedAt))+' · '+escapeHtml(row.status)+'</span>'
        +'<div class="project-card-actions">'
        +'<button class="btn primary" type="button" data-local-open="'+escapeHtml(row.id)+'">'+(current?'Return to IA':'Open IA')+'</button>'
        +'<button class="btn subtle" type="button" data-local-backup="'+escapeHtml(row.id)+'">Download backup</button>'
        +'<button class="btn projects-danger" type="button" data-local-delete="'+escapeHtml(row.id)+'">Delete</button>'
        +'</div></div></article>';
    }).join(''):'<p class="projects-empty">'+(count?'No IAs match this search. Try a different course or assessment ID.':'No locally saved IAs yet. Open a PDF and begin marking; it will appear here after a successful browser save.')+'</p>';
  }
  async function refreshProjectDashboard(){
    if(!projectVault){cachedProjectSummaries=[];renderProjectDashboard();return;}
    try{
      cachedProjectSummaries=await projectVault.list();
      renderProjectDashboard();
    }catch(error){
      console.error('Cannot list saved IA projects',error);
      $('projectsStorageWarning').textContent='Could not list local projects: '+(error?.message||String(error));
      $('projectsStorageWarning').classList.remove('hidden');
    }
  }
  async function openProjectsDashboard(){
    $('projectsSearch').value='';
    $('projectsCourse').value='all';
    if(!projectVault&&storageError){
      $('projectsStorageWarning').textContent='Local project storage is unavailable. You can still export the current editable .iamark.json backup.';
      $('projectsStorageWarning').classList.remove('hidden');
    }
    await refreshProjectDashboard();
    $('projectsDialog').showModal();
  }

  function projectData(includePdf=true) {
    return {
      format:'ia-marking-desk',version:1,createdAt:now(),
      course:state.course,candidate:state.candidate,session:state.session,
      marks:{...state.marks},justifications:{...state.justifications},
      stamps:markingStamps().map(s=>({...s})),
      feedbackStamps:feedbackStamps().map(s=>({...s})),
      feedbackCompleted:{...state.feedbackCompleted},activeMode:mode,pdfName:state.pdfName,
      stampStyle:{...state.stampStyle},customComments:state.customComments.map(x=>({...x})),commentEdits:{...state.commentEdits},
      feedbackComments:state.feedbackComments.map(x=>({...x})),feedbackEdits:{...state.feedbackEdits},
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
      if(data.format!=='ia-marking-desk'||data.version!==1||typeof data.pdfBase64!=='string')
        throw Error('Not a supported IA Marking Desk project.');
      const bytes=bytesFromBase64(data.pdfBase64);
      if(!await preserveActiveProject())return;
      projectLoading=true;
      try{
        const success=await loadPdf(bytes,data.pdfName || 'saved-ia.pdf',true);
        if(!success)return;
        restoreMetadata(data);
        activeProjectId=createLocalProjectId();projectRevision=0;persistedRevision=-1;activeSavedAt=null;
      }finally{projectLoading=false;}
      scheduleSave();
      const saved=await storeAutosave();
      toast(saved?'Editable project imported and saved as a separate local IA.':'Project opened, but browser storage failed. Download a backup to preserve it.');
      await refreshProjectDashboard();
    } catch(e) {console.error(e);toast('Could not open project. Please choose a valid .iamark.json file.');}
  }
  function restoreMetadata(data,{includePreferences=true}={}) {
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
    if(includePreferences && data.commentEdits && typeof data.commentEdits==='object' && !Array.isArray(data.commentEdits)){
      for(const [id,change] of Object.entries(data.commentEdits)){
        if(!BANK.some(item=>item.id===id)||typeof change?.text!=='string'||!change.text.trim())continue;
        const original=BANK.find(item=>item.id===id);
        state.commentEdits[id]={text:change.text.slice(0,1800),topic:String(change.topic||original.topic).slice(0,90)};
      }
    }
    if(includePreferences && data.feedbackEdits && typeof data.feedbackEdits==='object' && !Array.isArray(data.feedbackEdits)){
      for(const [id,change] of Object.entries(data.feedbackEdits)){
        if(!FEEDBACK_BANK.some(item=>item.id===id)||typeof change?.text!=='string'||!change.text.trim())continue;
        const original=FEEDBACK_BANK.find(item=>item.id===id);
        state.feedbackEdits[id]={text:change.text.slice(0,1800),topic:String(change.topic||original.topic).slice(0,90)};
      }
    }
    if(includePreferences && Array.isArray(data.feedbackComments)){
      const unique=new Map(state.feedbackComments.map(c=>[c.id,c]));
      for(const item of data.feedbackComments){
        if(typeof item?.id==='string'&&item.id.startsWith('custom-')&&CRITERIA[item.criterion]&&['strength','limitation'].includes(item.tone)&&typeof item.text==='string'&&item.text.trim()){
          unique.set(item.id,{...item,text:item.text.slice(0,1800),topic:String(item.topic||'Personal feedback').slice(0,90),courses:allCourses});
        }
      }
      state.feedbackComments=[...unique.values()];
    }
    if(includePreferences && Array.isArray(data.customComments)){
      const unique=new Map(state.customComments.map(c=>[c.id,c]));
      for(const item of data.customComments){
        if(typeof item?.id==='string' && item.id.startsWith('custom-') && CRITERIA[item.criterion] && ['strength','limitation'].includes(item.tone) && typeof item.text==='string' && item.text.trim()){
          unique.set(item.id,{...item,text:item.text.slice(0,1800),topic:String(item.topic||'Personal evidence').slice(0,90),courses:['AA SL','AA HL','AI SL','AI HL']});
        }
      }
      state.customComments=[...unique.values()];
    }
    const sanitiseSavedStamps=entries=>(Array.isArray(entries)?entries:[]).filter(s=>CRITERIA[s.criterion]&&Number.isInteger(s.page)&&s.page>=1&&s.page<=pdfDoc.numPages&&['strength','limitation'].includes(s.tone)&&Number.isFinite(s.x)&&Number.isFinite(s.y)).map(s=>({
      id:String(s.id||makeId()),page:s.page,x:Math.min(.99,Math.max(.01,s.x)),y:Math.min(.99,Math.max(.01,s.y)),criterion:s.criterion,
      tone:s.tone,topic:String(s.topic||'Evidence').slice(0,100),text:String(s.text||'').slice(0,1800),
      size:normalSize(s.size),color:normalColor(s.color,s.tone==='strength'?state.stampStyle.strengthColor:state.stampStyle.limitationColor),
      noteWidth:normalNoteWidth(s.noteWidth ?? state.stampStyle.noteWidth),noteHeight:normalNoteHeight(s.noteHeight),
      fontSize:normalFontSize(s.fontSize ?? state.stampStyle.fontSize),
      textColor:normalColor(s.textColor,state.stampStyle.textColor),
      fillColor:normalColor(s.fillColor,state.stampStyle.fillColor),
      borderColor:normalColor(s.borderColor,state.stampStyle.borderColor),
      libraryId:String(s.libraryId||''),createdAt:String(s.createdAt||now()),priority:feedbackPriority(s.priority),
    }));
    state.markingStamps=sanitiseSavedStamps(data.stamps);
    state.feedbackStamps=sanitiseSavedStamps(data.feedbackStamps);
    const savedCompletion=data.feedbackCompleted&&typeof data.feedbackCompleted==='object'&&!Array.isArray(data.feedbackCompleted)?data.feedbackCompleted:{};
    state.feedbackCompleted=Object.fromEntries(state.feedbackStamps.filter(x=>savedCompletion[x.id]===true).map(x=>[x.id,true]));
    mode=data.activeMode==='feedback'?'feedback':'marking';
    state.stamps=isFeedback()?state.feedbackStamps:state.markingStamps;
    $('course').value=state.course;$('candidate').value=state.candidate;$('session').value=state.session;updateFrameworkNotice();
    tab='all';bankQuickFilter='all';selectedStampId=null;draft=null;movingStampId=null;
    resetHistory();lastPlacedDraft=null;repeatPlacement=false;
    if(includePreferences)saveLibrarySettings();
    renderStampStyle();updateModeUI();updateScores();renderTabs();renderBank();renderEditor();renderStamps();renderQuickPicker();setInstruction();scheduleSave();
  }
  async function initDatabase(){
    try{
      projectVault=await openLocalIAProjectVault();
      storageError=null;
      await refreshProjectDashboard();
      updateLocalSaveStatus();
      if(isReady()&&projectRevision>persistedRevision)void storeAutosave();
    }catch(error){
      console.error('IA local project storage failed:',error);
      storageError=error;
      updateLocalSaveStatus();
      $('projectsStorageWarning').textContent='Local project saving unavailable: '+(error?.message||String(error))+'. You can continue to mark and download a portable .iamark.json backup, but cannot switch between saved IAs on this device.';
      $('projectsStorageWarning').classList.remove('hidden');
      toast('Browser project storage unavailable. Download backups to avoid losing work.');
    }
  }
  async function openLocalProject(id){
    if(!projectVault)return;
    if(activeProjectId===id&&isReady()){
      if($('projectsDialog').open)$('projectsDialog').close();
      return;
    }
    if(!await preserveActiveProject())return;
    try{
      const record=await projectVault.get(id);
      if(!record?.pdfBytes?.byteLength||!record?.project){
        toast('This saved IA is missing or incomplete. Try another project or restore a backup.');
        await refreshProjectDashboard();return;
      }
      projectLoading=true;
      try{
        const opened=await loadPdf(record.pdfBytes,record.project.pdfName||'saved-ia.pdf',true);
        if(!opened)return;
        restoreMetadata(record.project,{includePreferences:false});
        activeProjectId=id;projectRevision=0;persistedRevision=0;
        activeSavedAt=record.savedAt;
      }finally{projectLoading=false;}
      updateLocalSaveStatus();
      await refreshProjectDashboard();
      if($('projectsDialog').open)$('projectsDialog').close();
      toast('Opened locally saved IA '+(state.candidate||state.pdfName)+'.');
    }catch(error){
      console.error('Could not open saved IA',error);
      toast('Cannot open this project. Its saved data has not been deleted.');
    }
  }
  async function resumeAutosave(){
    if(!projectVault)return;
    const rows=await projectVault.list();
    if(!rows.length){toast('No locally saved IA is available.');return;}
    await openLocalProject(rows[0].id);
  }
  function emptyMarkingWorkspace(){
    clearTimeout(savingTimer);
    if(reviewPreview.bytes)invalidateReviewPreview();
    state={...state,course:'AA SL',candidate:'',session:'',
      marks:freshMarks(),justifications:freshJustifications(),
      stamps:[],markingStamps:[],feedbackStamps:[],feedbackCompleted:{},pdfName:'',pdfBytes:null};
    rendering++;
    if(activeRenderTask){try{activeRenderTask.cancel();}catch(error){}}
    const oldDocument=pdfDoc;pdfDoc=null;
    if(oldDocument?.destroy)Promise.resolve(oldDocument.destroy()).catch(()=>{});
    currentPage=1;zoom=1;viewScale=1;pageWidthPt=0;pageHeightPt=0;
    draft=null;selectedStampId=null;movingStampId=null;
    resetHistory();lastPlacedDraft=null;repeatPlacement=false;bankQuickFilter='all';
    workspaceView='browse';focusedPdf=false;mobileDrawer=null;documentCollapsed=false;commentCollapsed=false;
    mode='marking';activeProjectId=null;projectRevision=0;persistedRevision=0;activeSavedAt=null;
    $('course').value='AA SL';$('candidate').value='';$('session').value='';
    $('emptyViewer').classList.remove('hidden');$('pageShell').classList.add('hidden');
    $('documentMeta').classList.add('hidden');
    $('uploadTitle').textContent='Upload student IA';
    $('uploadSubtext').textContent='Drop a PDF here or browse files';
    $('pageTotal').textContent='--';$('pageNumber').value=1;
    $('footerDocInfo').textContent='Awaiting a PDF';
    $('pdfInput').value='';$('projectOpen').value='';
    $('pdfLibraryStatus').classList.add('hidden');
    updateModeUI();updateScores();renderTabs();renderBank();
    renderEditor();renderStamps();renderQuickPicker();setInstruction();updateWorkspaceLayout({rerender:false});
    updateLocalSaveStatus();
  }
  async function resetProject(){
    if(!await preserveActiveProject()){
      if(!confirm('Browser storage could not save this IA. If you have downloaded its confidential .iamark.json backup, you may discard the current unsaved PDF and start a blank project. Discard it?'))return;
    }
    emptyMarkingWorkspace();
    await refreshProjectDashboard();
    toast('New blank IA ready. Previously marked explorations remain saved locally.');
  }
  function portableProjectFromRecord(record){
    if(!record?.pdfBytes?.byteLength||!record?.project)
      throw new Error('This local project has no original PDF to back up.');
    return {...record.project,format:'ia-marking-desk',version:1,
      pdfBase64:base64FromBytes(new Uint8Array(record.pdfBytes))};
  }
  function makeBackupFilename(row){
    const anon=(row.candidate||'unlabelled-ia').replace(/[^a-z0-9_-]+/gi,'-').replace(/^-|-$/g,'').slice(0,42)||'ia';
    const suffix=row.id.replace(/[^a-z0-9]/gi,'').slice(-8);
    return anon+'-'+suffix+'.iamark.json';
  }
  async function downloadLocalBackup(id){
    if(id===activeProjectId&&isReady()){
      // Always give the teacher the latest edits even if browser storage
      // has failed. A portable download is the fallback recovery route.
      const data=projectData();
      const filename=makeBackupFilename({candidate:state.candidate,id});
      download(new Blob([JSON.stringify(data)],{type:'application/json'}),filename);
      toast('Downloaded a portable, unencrypted IA project backup.');
      return;
    }
    if(!projectVault)return;
    const row=cachedProjectSummaries.find(item=>item.id===id);
    const record=await projectVault.get(id);
    if(!record)throw new Error('The selected IA is not available.');
    const data=portableProjectFromRecord(record);
    download(new Blob([JSON.stringify(data)],{type:'application/json'}),
      makeBackupFilename(row||{id,candidate:record.project?.candidate}));
    toast('Downloaded the saved IA backup, including its original PDF.');
  }
  async function downloadAllLocalBackups(){
    if(!projectVault)return;
    if(!window.JSZip){toast('The local ZIP backup tool did not load. Use individual project backups instead.');return;}
    const button=$('downloadAllProjects');
    const originalLabel=button.textContent;
    button.disabled=true;button.textContent='Preparing local backup ZIP…';
    try{
      if(!await preserveActiveProject())throw new Error('Unsaved IA changes. Download the current project backup first.');
      const rows=await projectVault.list();
      if(!rows.length){toast('There are no locally saved IAs to back up.');return;}
      const zip=new window.JSZip();
      const folder=zip.folder('IA-Marking-Backups');
      for(const row of rows){
        const record=await projectVault.get(row.id);
        if(!record?.pdfBytes?.byteLength)throw new Error('Cannot back up '+(row.candidate||row.pdfName)+': source PDF missing.');
        folder.file(makeBackupFilename(row),JSON.stringify(portableProjectFromRecord(record)));
      }
      zip.file('BACKUP-INSTRUCTIONS.txt',
        'IA MARKING DESK: CONFIDENTIAL LOCAL BACKUP\\n\\n'
        +'The .iamark.json files in IA-Marking-Backups contain original student IA PDFs, teacher stamps and marks.\\n'
        +'These files and this ZIP are NOT encrypted. Handle according to your school data policy.\\n'
        +'Restore each IA through Open project in the IA Marking Desk.\\n'
        +'Deleting projects in your browser does not delete these backup files.\\n');
      const blob=await zip.generateAsync({type:'blob',compression:'DEFLATE',compressionOptions:{level:2}});
      const date=new Date().toISOString().slice(0,10);
      download(blob,'IA-Marking-Cohort-Backups-'+date+'.zip');
      toast('Downloaded '+rows.length+' confidential local IA backups as a ZIP.');
    }catch(error){
      console.error('Bulk IA backup failed',error);
      toast('Could not build the cohort backup: '+(error?.message||String(error)));
    }finally{
      button.disabled=false;button.textContent=originalLabel;
      await refreshProjectDashboard();
    }
  }
  async function deleteLocalProject(id){
    if(!projectVault)return;
    const row=cachedProjectSummaries.find(item=>item.id===id);
    if(!row)return;
    const label=row.candidate||row.pdfName;
    if(!confirm('Permanently delete the locally saved IA "'+label+'"?\\n\\n'
      +'This removes the original PDF and all marking data from this browser. Downloaded backups are not affected.'))return;
    clearTimeout(savingTimer);
    try{
      await saveChain.catch(()=>{});
      await projectVault.remove(id);
      if(activeProjectId===id)emptyMarkingWorkspace();
      await refreshProjectDashboard();
      toast('Deleted the locally saved IA. External backup files are unchanged.');
    }catch(error){
      console.error('Deleting local IA failed',error);
      toast('Could not delete this IA: '+(error?.message||String(error)));
    }
  }
  function updateClearConfirmation(){
    $('confirmClearProjects').disabled=$('clearProjectsPhrase').value.trim()!=='DELETE ALL'||!projectVault;
  }
  function closeClearDialog(){
    if($('clearProjectsDialog').open)$('clearProjectsDialog').close();
    $('clearProjectsPhrase').value='';
    $('clearTeacherPreferences').checked=false;
    $('clearProjectsNotice').textContent='';
    updateClearConfirmation();
  }
  async function clearAllLocalProjects(){
    if(!projectVault||$('clearProjectsPhrase').value.trim()!=='DELETE ALL')return;
    const resetPreferences=$('clearTeacherPreferences').checked;
    const button=$('confirmClearProjects');
    button.disabled=true;button.textContent='Clearing local projects…';
    projectLoading=true;
    clearTimeout(savingTimer);
    try{
      await saveChain.catch(()=>{});
      await projectVault.eraseAll();
      emptyMarkingWorkspace();
      if(resetPreferences){
        for(const key of [
          'ia-marking-desk-comments','ia-marking-desk-edits',
          'ia-marking-desk-stamp-style','ia-marking-desk-feedback-comments',
          'ia-marking-desk-feedback-edits',QUICK_PICKS_KEY,
        ]){try{localStorage.removeItem(key);}catch(error){console.warn(error);}}
        state.customComments=[];state.commentEdits={};state.feedbackComments=[];state.feedbackEdits={};state.stampStyle=normalStyle();
        quickPicks=sanitizeQuickPicks({});
        renderStampStyle();renderBank();renderQuickPicker();
      }
      cachedProjectSummaries=[];
      await refreshProjectDashboard();
      closeClearDialog();
      if($('projectsDialog').open)$('projectsDialog').close();
      toast('All IA Marking Desk browser projects cleared. Existing downloaded files remain unchanged.');
    }catch(error){
      console.error('Clearing IA browser data failed',error);
      $('clearProjectsNotice').textContent='Deletion failed: '+(error?.message||String(error))+
        '. Some data may remain in browser storage. Retry or use browser site-data settings.';
    }finally{
      projectLoading=false;button.disabled=true;button.textContent='Delete all local IA projects';
      updateLocalSaveStatus();
    }
  }

  function renderFeedbackChecklist(){
    const tasks=studentChecklistItems(state.stamps,state.feedbackCompleted);
    const strengths=studentFeedbackStrengths(state.stamps);
    const complete=tasks.filter(item=>item.completed).length;
    $('feedbackProgress').textContent=complete+' of '+tasks.length+' actions checked';
    const strengthsHtml=strengths.length
      ?'<section class="feedback-strengths"><h4>What is working well ('+strengths.length+')</h4>'
        +strengths.map(item=>'<p><strong>'+escapeHtml(item.label)+' · Page '+item.page+'</strong> '+escapeHtml(item.text)+'</p>').join('')+'</section>'
      :'<p class="feedback-muted">No strengths have been stamped yet. You can add supportive comments as well as suggested changes.</p>';
    let lastPriority='';
    const taskHtml=tasks.map(item=>{
      const group=item.priority!==lastPriority;
      lastPriority=item.priority;
      const label={high:'High priority - address first',normal:'Standard revisions',low:'Lower priority - final polish'}[item.priority];
      return (group?'<h4 class="feedback-task-group">'+label+'</h4>':'')
        +'<label class="feedback-task '+(item.completed?'is-complete':'')+'">'
        +'<input type="checkbox" data-feedback-done="'+escapeHtml(item.id)+'" '+(item.completed?'checked':'')+' aria-label="Mark revision '+escapeHtml(item.label)+' as complete">'
        +'<span class="feedback-task-body"><span class="feedback-task-meta"><strong>'+escapeHtml(item.label)+'</strong>'
        +'<span>Criterion '+escapeHtml(item.criterion)+'</span><span>Page '+item.page+'</span><small>'+escapeHtml(item.topic)+'</small></span>'
        +'<span class="feedback-task-text">'+escapeHtml(item.text)+'</span></span></label>';
    }).join('');
    $('feedbackChecklist').innerHTML=strengthsHtml
      +'<div class="feedback-action-count"><strong>Your revision checklist</strong><span>'+tasks.length+' action'+(tasks.length===1?'':'s')+'</span></div>'
      +(tasks.length?'<div class="feedback-tasks">'+taskHtml+'</div>':'<p class="feedback-muted">No improvements have been stamped. Select an improvement prompt and place it beside the relevant part of the draft to add a checklist item.</p>');
  }
  function feedbackChecklistExportText(){
    return studentChecklistText({stamps:feedbackStamps(),completed:state.feedbackCompleted,
      course:state.course,candidate:state.candidate,session:state.session});
  }
  function renderReview() {
    if(isFeedback()){
      const tasks=studentChecklistItems(state.stamps,state.feedbackCompleted);
      const strengths=studentFeedbackStrengths(state.stamps);
      const high=tasks.filter(item=>item.priority==='high').length;
      $('reviewStatus').className='review-status'+(usesNewFramework()?' warning':'');
      $('reviewStatus').textContent=usesNewFramework()
        ?'This A-E feedback workflow is not suitable for the revised May 2029 or later framework. Feedback export is disabled for this session.'
        :strengths.length+' strengths and '+tasks.length+' revision actions placed, including '+high+' high-priority actions. Every action is included in the checklist.';
      $('reviewScores').innerHTML='';
      renderFeedbackChecklist();
      return;
    }
    const missing = CRITERION_KEYS.filter(k=>state.marks[k]===null);
    const noEvidence = CRITERION_KEYS.filter(k=>!state.stamps.some(s=>s.criterion===k));
    $('reviewStatus').className=`review-status ${missing.length?'warning':''}`;
    $('reviewStatus').textContent=missing.length ? `${missing.length} criterion marks are not yet selected. Export remains available as a draft, but it must not be treated as a complete final assessment.` : `All five marks are recorded: ${totalScore()}/20. ${state.stamps.length} evidence stamps are currently placed across the exploration.`;
    $('reviewScores').innerHTML=CRITERION_KEYS.map(key=>{
      const meta=CRITERIA[key],count=state.stamps.filter(s=>s.criterion===key).length;
      return `<section class="review-score"><div class="review-score-header"><span class="mini-circle">${key}</span><strong>${escapeHtml(meta.name)}</strong><span class="evidence-count">${count} ${count===1?'stamp':'stamps'}</span><select data-review-score="${key}" aria-label="Criterion ${key} final mark"><option value="">-- / ${meta.max}</option>${Array.from({length:meta.max+1},(_,n)=>`<option value="${n}" ${state.marks[key]===n?'selected':''}>${n} / ${meta.max}</option>`).join('')}</select></div><small>Briefly justify this mark, referring to the annotated evidence on the pages.</small><textarea data-review-justification="${key}" aria-label="Criterion ${key} assessment rationale" maxlength="5000" rows="2" placeholder="Assessment rationale for criterion ${key}...">${escapeHtml(state.justifications[key])}</textarea></section>`;
    }).join('');
    $('reviewScores').querySelectorAll('[data-review-score]').forEach(sel=>sel.addEventListener('change',()=>setScore(sel.dataset.reviewScore,sel.value)));
    $('reviewScores').querySelectorAll('[data-review-justification]').forEach(ta=>{
      watchHistoryField(ta,'criterion '+ta.dataset.reviewJustification+' rationale');
      ta.addEventListener('input',e=>{state.justifications[ta.dataset.reviewJustification]=e.target.value;scheduleSave();});
    });
    if(noEvidence.length) $('reviewStatus').textContent += ` No page evidence is stamped yet for: ${noEvidence.join(', ')}.`;
    if(usesNewFramework()) {
      $('reviewStatus').classList.add('warning');
      $('reviewStatus').textContent='Export blocked: from May 2029, IB Mathematics uses four new IA criteria. Choose a session through November 2028 for A-E marking, or use the new criteria outside this prototype.';
    }
  }

  function sanitizePdfText(text) {return normaliseAnnotationText(text);}
  function pdfWrap(text,font,size,maxWidth) {
    const paragraphs=sanitizePdfText(text).split('\n');
    const rows=[];
    for(const paragraph of paragraphs){
      const words=paragraph.split(/\s+/u).filter(Boolean);
      let line='';
      for(const word of words){
        const candidate=line?line+' '+word:word;
        if(font.widthOfTextAtSize(candidate,size)<=maxWidth){line=candidate;continue;}
        if(line){rows.push(line);line='';}
        if(font.widthOfTextAtSize(word,size)<=maxWidth){line=word;continue;}
        let part='';
        for(const char of Array.from(word)){
          if(part && font.widthOfTextAtSize(part+char,size)>maxWidth){rows.push(part);part='';}
          part+=char;
        }
        line=part;
      }
      rows.push(line);
    }
    return rows.length?rows:[''];
  }
  function pdfHexColor(hex) {
    return window.PDFLib.rgb(...[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255));
  }
  function pdfColor(stamp) {return pdfHexColor(stampColor(stamp));}
  function pdfTextColor(stamp){return brightColor(stampColor(stamp))?window.PDFLib.rgb(.09,.16,.25):window.PDFLib.rgb(1,1,1);}
  function pdfNoteColor(stamp){return brightColor(stampColor(stamp))?window.PDFLib.rgb(.17,.25,.33):pdfColor(stamp);}

  function pdfFaint(tone){return tone==='strength'?window.PDFLib.rgb(.94,.97,.98):window.PDFLib.rgb(1,.977,.941);}
  function pdfText(page,text,x,y,size,font,color) {
    if(font?.isUnicode)font.draw(page,text,x,y,size,color);
    else page.drawText(sanitizePdfText(text),{x,y,size,font,color});
  }
  // The moderation preview is made from the exact bytes that Export downloads.
  // Any project edit invalidates approval and requires a new preview.
  let reviewPreview={bytes:null,signature:null,pdf:null,page:1,zoom:1,issues:[],visited:new Set()};
  let reviewPreviewTask=null;
  let reviewPreviewLoading=false;
  function previewSignature(){
    // Exclude volatile project timestamps. Any visible/printed change
    // (including mark rationales and box positions) must invalidate approval.
    return JSON.stringify({
      course:state.course,candidate:state.candidate,session:state.session,mode,
      marks:state.marks,justifications:state.justifications,feedbackCompleted:state.feedbackCompleted,
      stamps:state.stamps,pdfName:state.pdfName,pdfSize:state.pdfBytes?.length||0,
    });
  }
  function invalidateReviewPreview(){
    reviewPreview.bytes=null;
    reviewPreview.signature=null;
    reviewPreview.visited.clear();
    $('reviewConfirmed').checked=false;
    $('reviewConfirmed').disabled=true;
    $('reviewPreviewBox').classList.add('hidden');
    $('exportAnnotated').disabled=true;
    $('reviewExportNotice').textContent='Generate the current PDF preview and inspect every page before exporting.';
    if(reviewPreviewTask){try{reviewPreviewTask.cancel();}catch(error){}reviewPreviewTask=null;}
    if(reviewPreview.pdf){if(typeof reviewPreview.pdf.cleanup==='function')Promise.resolve(reviewPreview.pdf.cleanup()).catch(()=>{});reviewPreview.pdf=null;}
  }
  function renderPreflightIssues(issues){
    reviewPreview.issues=issues;
    const errors=issues.filter(x=>x.severity==='error').length;
    const warnings=issues.filter(x=>x.severity==='warning').length;
    const badge=$('preflightBadge');
    badge.className='preflight-badge'+(errors?' has-errors':warnings?' has-issues':'');
    badge.textContent=errors?errors+' blocking':warnings?warnings+' to review':'No automatic warnings';
    $('preflightList').innerHTML=issues.map(item=>
      '<li class="preflight-'+escapeHtml(item.severity)+'">'+escapeHtml(item.message)+'</li>'
    ).join('');
    return errors;
  }
  function updateReviewGate(){
    const valid=Boolean(reviewPreview.bytes && reviewPreview.signature===previewSignature());
    const numPages=reviewPreview.pdf?.numPages||0;
    const visited=reviewPreview.visited.size;
    const complete=valid && numPages>0 && visited===numPages;
    $('reviewConfirmed').disabled=!complete;
    if(!complete)$('reviewConfirmed').checked=false;
    const approved=complete && $('reviewConfirmed').checked;
    $('exportAnnotated').disabled=!approved;
    $('reviewExportNotice').textContent=!valid?'Generate the current PDF preview first.'
      :!complete?'Pages inspected: '+visited+' / '+numPages+'. View each page, including the marking summary, then confirm.'
      :approved?'Preview approved. This exact PDF is ready for download.'
      :'All '+numPages+' pages viewed. Confirm legibility and unobscured student work to enable export.';
  }
  async function renderModeratorPreviewPage(){
    if(!reviewPreview.pdf)return;
    if(reviewPreviewTask){try{reviewPreviewTask.cancel();}catch(error){}reviewPreviewTask=null;}
    const token=reviewPreview.pdf;
    const page=await token.getPage(reviewPreview.page);
    if(reviewPreview.pdf!==token)return;
    const viewport1=page.getViewport({scale:1});
    const maxWidth=$('reviewPreviewBox').clientWidth-42;
    const fitScale=Math.max(.38,Math.min(1.5,maxWidth/viewport1.width));
    const viewport=page.getViewport({scale:fitScale*reviewPreview.zoom});
    const canvas=$('reviewPreviewCanvas');
    const pixelRatio=Math.min(2,window.devicePixelRatio||1);
    canvas.width=Math.ceil(viewport.width*pixelRatio);
    canvas.height=Math.ceil(viewport.height*pixelRatio);
    canvas.style.width=viewport.width+'px';
    canvas.style.height=viewport.height+'px';
    const ctx=canvas.getContext('2d',{alpha:false});
    reviewPreviewTask=page.render({
      canvasContext:ctx,viewport,
      transform:[pixelRatio,0,0,pixelRatio,0,0],
    });
    try{await reviewPreviewTask.promise;}
    catch(error){if(error?.name==='RenderingCancelledException')return;throw error;}
    finally{reviewPreviewTask=null;}
    if(reviewPreview.pdf!==token)return;
    reviewPreview.visited.add(reviewPreview.page);
    $('reviewPreviewPage').textContent='Page '+reviewPreview.page+' / '+token.numPages;
    $('reviewPreviewPrevious').disabled=reviewPreview.page===1;
    $('reviewPreviewNext').disabled=reviewPreview.page===token.numPages;
    $('reviewPreviewZoomLabel').textContent=reviewPreview.zoom===1?'Fit':Math.round(reviewPreview.zoom*100)+'%';
    $('reviewPreviewZoomOut').disabled=reviewPreview.zoom<=.75;
    $('reviewPreviewZoomIn').disabled=reviewPreview.zoom>=3;
    updateReviewGate();
  }
  async function buildAnnotatedPdf(){
    if(!isReady())throw new Error('Upload a student IA PDF first.');
    if(usesNewFramework())throw new Error('The 2029 Mathematics IA assessment needs its new four-criterion rubric; this A–E export cannot be used.');
    if(!window.PDFLib||!window.fontkit)throw new Error('PDF export or Unicode font support is missing from this deployment.');
    await ensureUnicodeMetrics();
      const {PDFDocument,rgb}=window.PDFLib;
      // Draw *onto the existing PDF pages*. No widened pages, side rail,
      // hidden popups or separate continuation notes: the moderator sees
      // exactly the full evidence comment where the teacher placed it.
      const output=await PDFDocument.load(state.pdfBytes,{ignoreEncryption:false});
      const {regular:font,bold}=await createUnicodeFonts(output,window.fontkit,await getUnicodeFontBytes());
      const pages=output.getPages();
      const ink=rgb(.17,.25,.33),muted=rgb(.45,.53,.60),line=rgb(.83,.88,.90);
      const allProblems=[];
      const plans=[];
      for(let i=0;i<pages.length;i++){
        const {width,height}=pages[i].getSize();
        const pagePlan=pageLayoutProblems(pageStamps(i+1),width,height,font);
        plans.push(pagePlan);
        allProblems.push(...pagePlan.problems);
      }
      if(allProblems.length){
        throw new Error('Cannot export because some on-page annotations would overlap or lose text: '+allProblems.join('; '));
      }
      for(let i=0;i<pages.length;i++){
        const page=pages[i],{height}=page.getSize();
        for(const {stamp,layout} of plans[i].items){
          const color=pdfColor(stamp),label=stampLabel(stamp);
          const bottom=height-layout.y-layout.height;
          page.drawRectangle({x:layout.x,y:bottom,width:layout.width,height:layout.height,
            color:pdfHexColor(layout.fillColor),borderColor:pdfHexColor(layout.borderColor),borderWidth:1.25});
          page.drawRectangle({x:layout.x,y:bottom,width:3,height:layout.height,color:pdfHexColor(layout.borderColor)});
          const radius=layout.circle/2;
          const cx=layout.x+8+radius,cy=height-layout.y-11-radius;
          page.drawCircle({x:cx,y:cy,size:radius,color,borderWidth:1.1,borderColor:rgb(1,1,1)});
          const letterSize=Math.min(layout.circle*.55,18);
          pdfText(page,stamp.criterion,cx-bold.widthOfTextAtSize(stamp.criterion,letterSize)/2,cy-letterSize*.33,letterSize,bold,pdfTextColor(stamp));
          const fullTextColor=pdfHexColor(layout.textColor);
          pdfText(page,`${label} | ${stamp.tone==='strength'?'Strength':isFeedback()?'Improvement':'Limitation'}`,layout.x+layout.textX,height-layout.y-16,layout.headerFontSize,bold,fullTextColor);
          layout.rows.forEach((row,index)=>pdfText(page,row,layout.x+layout.textX,height-layout.y-33-index*layout.lineHeight,layout.fontSize,font,fullTextColor));
        }
      }
      if(isFeedback()){
        // The original draft pages come first. A checklist is appended in its
        // own pages, keeping every student calculation and teacher action intact.
        // No criterion scores or teacher mark rationales enter this PDF.
        const tasks=studentChecklistItems(state.stamps,state.feedbackCompleted);
        const strengths=studentFeedbackStrengths(state.stamps);
        let sheet=null,cursor=0,pageIndex=0;
        function newFeedbackSheet(){
          sheet=output.addPage([595,842]);pageIndex++;
          sheet.drawRectangle({x:0,y:0,width:595,height:842,color:rgb(1,1,1)});
          pdfText(sheet,'FIRST DRAFT - STUDENT FEEDBACK',37,808,17,bold,ink);
          pdfText(sheet,'IB Mathematics IA | Teacher feedback, not a final assessment',37,788,9,font,muted);
          sheet.drawLine({start:{x:37,y:777},end:{x:558,y:777},thickness:.8,color:line});
          pdfText(sheet,'Revision checklist / page '+pageIndex,37,34,8.5,font,muted);
          cursor=751;
        }
        const ensureHeight=height=>{if(!sheet||cursor-height<55)newFeedbackSheet();};
        function addHeading(title){
          ensureHeight(43);
          pdfText(sheet,title,37,cursor,12,bold,ink);cursor-=24;
        }
        function addWrapped(text,x=51,size=10){
          const rows=pdfWrap(text,font,size,548-x);
          for(const row of rows){
            ensureHeight(16);
            pdfText(sheet,row,x,cursor,size,font,ink);
            cursor-=15;
          }
        }
        function addEntry(header,text){
          ensureHeight(30);
          pdfText(sheet,header,43,cursor,10.3,bold,ink);cursor-=17;
          addWrapped(text,56,10);
          cursor-=10;
        }
        newFeedbackSheet();
        addWrapped('Course: '+state.course+'   Assessment ID: '+(state.candidate||'Not entered')+'   Session: '+(state.session||'Not entered'),37,10);
        cursor-=7;
        addWrapped('Use these prompts to revise your own mathematical reasoning. Your teacher has not provided replacement solutions or a final mark.',37,9.5);
        cursor-=16;
        addHeading('What is working well ('+strengths.length+')');
        if(!strengths.length)addWrapped('No strengths recorded yet.');
        strengths.forEach(stamp=>addEntry(stamp.label+' | Page '+stamp.page,stamp.text));
        cursor-=8;
        addHeading('Your revision checklist ('+tasks.length+' actions)');
        if(!tasks.length)addWrapped('No changes have been requested yet.');
        let previousPriority='';
        for(const item of tasks){
          if(previousPriority!==item.priority){
            previousPriority=item.priority;
            addHeading(({high:'HIGH PRIORITY',normal:'STANDARD REVISIONS',low:'LOWER PRIORITY - POLISH'})[item.priority]);
          }
          const mark=item.completed?'[x]':'[ ]';
          addEntry(mark+'  '+item.label+' | Page '+item.page+' | '+item.topic,item.text);
        }
        cursor-=8;
        addWrapped('Tick each task as you revise. Check the corresponding stamp on the draft page for context. Make the mathematical decisions and revisions yourself.',37,9.5);
        output.setTitle('Mathematics IA first draft feedback - '+(state.candidate||'exploration'));
        output.setSubject('Teacher-annotated first draft with student revision checklist; no marks');
        output.setProducer('IA Marking Desk - browser-local student feedback');
        return await output.save();
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
      return data;
  }
  async function prepareModeratorPreview(){
    if(reviewPreviewLoading)return;
    reviewPreviewLoading=true;
    const button=$('buildReviewPreview');
    button.disabled=true;button.textContent='Preparing exact PDF preview…';
    invalidateReviewPreview();
    $('preflightBadge').textContent='Checking PDF…';
    try{
      await ensureUnicodeMetrics();
      const issues=await inspectModerationPages({
        pdfDocument:pdfDoc,
        stamps:state.stamps,
        getPageStamps:pageStamps,
        noteLayout,
        pageLayoutProblems,
        criterionKeys:isFeedback()?[]:CRITERION_KEYS,
        marks:state.marks,
      });
      const errorCount=renderPreflightIssues(issues);
      if(errorCount)throw new Error('Fix the blocking annotation problems listed above before previewing.');
      const fingerprint=previewSignature();
      const bytes=await buildAnnotatedPdf();
      if(fingerprint!==previewSignature())throw new Error('Assessment changed while the preview was being built. Generate it again.');
      if(!pdfjsLib)throw new Error('The PDF viewer is unavailable.');
      reviewPreview.bytes=bytes;
      reviewPreview.signature=fingerprint;
      reviewPreview.pdf=await pdfjsLib.getDocument({data:new Uint8Array(bytes)}).promise;
      reviewPreview.page=1;
      reviewPreview.zoom=1;
      reviewPreview.visited.clear();
      $('reviewPreviewBox').classList.remove('hidden');
      await renderModeratorPreviewPage();
      $('reviewExportNotice').scrollIntoView({block:'nearest'});
    }catch(error){
      console.error('Moderator PDF preview failed:',error);
      const message=pdfFontError(error);
      renderPreflightIssues([{severity:'error',message}]);
      $('reviewExportNotice').textContent=message;
      invalidateReviewPreview();
      $('reviewExportNotice').textContent=message;
    }finally{
      reviewPreviewLoading=false;
      button.disabled=false;button.textContent='Rebuild exact PDF preview';
    }
  }
  async function exportPdf(){
    const valid=reviewPreview.bytes && reviewPreview.signature===previewSignature()
      && reviewPreview.visited.size===reviewPreview.pdf?.numPages && $('reviewConfirmed').checked;
    if(!valid){toast('Inspect and approve the exact PDF preview before exporting.');return;}
    // Use exactly the bytes that were inspected - no separate re-rendering.
    download(new Blob([reviewPreview.bytes],{type:'application/pdf'}),saveSafeName()+(isFeedback()?'-draft-feedback.pdf':'-annotated.pdf'));
    toast(isFeedback()?'Exported the annotated draft and complete student revision checklist.':'Exported the exact PDF reviewed on every page. Check it once more after downloading.');
  }

  function initStampStyleEvents() {
    $('defaultStampSize').addEventListener('input',e=>{
      state.stampStyle.size=normalSize(e.target.value);renderStampStyle();saveLibrarySettings();
    });
    $('strengthStampColour').addEventListener('input',e=>{
      state.stampStyle.strengthColor=normalColor(e.target.value,STAMP_DEFAULTS.strengthColor);renderStampStyle();saveLibrarySettings();
    });
    $('limitationStampColour').addEventListener('input',e=>{
      state.stampStyle.limitationColor=normalColor(e.target.value,STAMP_DEFAULTS.limitationColor);renderStampStyle();saveLibrarySettings();
    });
    $('defaultNoteFont').addEventListener('input',e=>{
      state.stampStyle.fontSize=normalFontSize(e.target.value);renderStampStyle();saveLibrarySettings();
    });
    for(const [id,key] of [
      ['defaultNoteTextColour','textColor'],['defaultNoteFillColour','fillColor'],['defaultNoteBorderColour','borderColor'],
    ]){
      $(id).addEventListener('input',e=>{
        state.stampStyle[key]=normalColor(e.target.value,STAMP_DEFAULTS[key]);renderStampStyle();saveLibrarySettings();
      });
    }
    $('defaultNoteWidth').addEventListener('input',e=>{
      state.stampStyle.noteWidth=normalNoteWidth(e.target.value);renderStampStyle();saveLibrarySettings();
    });
    $('applyStampStyle').addEventListener('click',()=>{
      if(!state.stamps.length){toast('No placed comments yet. These styles will apply to new comments.');return;}
      finishFieldHistory();const before=historySnapshot();
      for(const stamp of state.stamps){
        stamp.size=state.stampStyle.size;
        stamp.color=stamp.tone==='strength'?state.stampStyle.strengthColor:state.stampStyle.limitationColor;
        stamp.fontSize=state.stampStyle.fontSize;stamp.textColor=state.stampStyle.textColor;
        stamp.fillColor=state.stampStyle.fillColor;stamp.borderColor=state.stampStyle.borderColor;
      }
      renderStamps();renderEditor();scheduleSave();
      recordHistory('apply stamp formatting to all comments',before);
      toast(`Updated circle, font and colours for all ${state.stamps.length} placed comments. Individual box dimensions are preserved.`);
    });
  }
  function initEvents() {
    $('mobileDetailsToggle').addEventListener('click',()=>{
      mobileDetailsExpanded=!mobileDetailsExpanded;updateMobileChrome();
    });
    $('mobileProjectToolsToggle').addEventListener('click',()=>{
      mobileProjectsExpanded=!mobileProjectsExpanded;updateMobileChrome();
    });
    $('toggleDocumentPane').addEventListener('click',openDocumentPanel);
    $('documentRailToggle').addEventListener('click',openDocumentPanel);
    $('closeDocumentPane').addEventListener('click',()=>{
      if(mobileWorkspace())closeMobileDrawer({restoreFocus:true});
      else openDocumentPanel();
    });
    $('toggleCommentPane').addEventListener('click',()=>openCommentsPanel('browse'));
    $('toggleEditorPane').addEventListener('click',()=>openCommentsPanel('edit'));
    $('bankBrowseTab').addEventListener('click',()=>setWorkspaceView('browse',{openOnMobile:true,focusControl:true}));
    $('bankEditorTab').addEventListener('click',()=>setWorkspaceView('edit',{openOnMobile:true}));
    $('bankPane').querySelector('.bank-view-tabs').addEventListener('keydown',event=>{
      if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
      event.preventDefault();
      const next=event.key==='ArrowLeft'||event.key==='Home'?'browse':'edit';
      setWorkspaceView(next,{openOnMobile:true});
      $(next==='browse'?'bankBrowseTab':'bankEditorTab').focus();
    });
    $('findAnotherComment').addEventListener('click',()=>setWorkspaceView('browse',{openOnMobile:true,focusControl:true}));
    $('closeBankPane').addEventListener('click',hideContextPanel);
    $('workspaceBackdrop').addEventListener('click',()=>closeMobileDrawer({restoreFocus:true}));
    $('focusPdf').addEventListener('click',toggleFocusPdf);
    $('markingMode').addEventListener('click',()=>switchMode('marking'));
    $('feedbackMode').addEventListener('click',()=>switchMode('feedback'));
    $('openProjects').addEventListener('click',()=>{
      void openProjectsDashboard().catch(error=>{console.error(error);toast('Could not load the local project dashboard.');});
    });
    $('closeProjects').addEventListener('click',()=>$('projectsDialog').close());
    $('projectsDone').addEventListener('click',()=>$('projectsDialog').close());
    $('projectsSearch').addEventListener('input',renderProjectDashboard);
    $('projectsCourse').addEventListener('change',renderProjectDashboard);
    $('projectsRows').addEventListener('click',event=>{
      const button=event.target.closest('button[data-local-open],button[data-local-backup],button[data-local-delete]');
      if(!button)return;
      if(button.dataset.localOpen)void openLocalProject(button.dataset.localOpen);
      else if(button.dataset.localBackup)void downloadLocalBackup(button.dataset.localBackup).catch(error=>{
        console.error(error);toast('Could not download this backup: '+(error?.message||String(error)));
      });
      else if(button.dataset.localDelete)void deleteLocalProject(button.dataset.localDelete);
    });
    $('downloadAllProjects').addEventListener('click',()=>{void downloadAllLocalBackups();});
    $('openClearProjects').addEventListener('click',()=>{
      $('clearProjectsPhrase').value='';
      $('clearTeacherPreferences').checked=false;
      $('clearProjectsNotice').textContent='';
      updateClearConfirmation();
      $('clearProjectsDialog').showModal();
    });
    $('closeClearProjects').addEventListener('click',closeClearDialog);
    $('cancelClearProjects').addEventListener('click',closeClearDialog);
    $('clearProjectsPhrase').addEventListener('input',updateClearConfirmation);
    $('confirmClearProjects').addEventListener('click',()=>{void clearAllLocalProjects();});
    $('clearProjectsDialog').addEventListener('close',()=>{
      $('clearProjectsPhrase').value='';
      $('clearTeacherPreferences').checked=false;
      updateClearConfirmation();
    });
    $('course').addEventListener('change',e=>{state.course=e.target.value;updateMobileChrome();renderBank();if($('criteriaDialog').open)renderCriteria();scheduleSave();});
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
    $('undoMark').addEventListener('click',undoMarking);
    $('redoMark').addEventListener('click',redoMarking);
    $('repeatStamp').addEventListener('click',()=>{
      repeatPlacement=!repeatPlacement;renderQuickPicker();
      toast(repeatPlacement?'Repeat stamping is on. Place as many copies as needed.':'Repeat stamping is off.');
    });
    $('quickStampAgain').addEventListener('click',()=>{
      if(!lastPlacedDraft)return;
      prepareFromExistingStamp(lastPlacedDraft);
      toast('Last stamped comment is ready to place again.');
    });
    $('quickStampPicker').addEventListener('change',event=>{
      const id=event.target.value;
      if(!id)return;
      prepareComment(id);
      event.target.value='';
      if(isReady())$('pdfScroll').scrollIntoView({behavior:'smooth',block:'nearest'});
    });
    document.querySelectorAll('[data-bank-quick]').forEach(button=>{
      button.addEventListener('click',()=>{
        bankQuickFilter=button.dataset.bankQuick;
        tab='all';tone='all';search='';bankShowAll=false;
        $('commentSearch').value='';renderTabs();renderTone();renderBank();
      });
    });
    $('openEvidence').addEventListener('click',()=>{
      renderEvidenceNavigator();$('evidenceDialog').showModal();
    });
    $('closeEvidence').addEventListener('click',()=>$('evidenceDialog').close());
    $('evidenceDone').addEventListener('click',()=>$('evidenceDialog').close());
    $('evidenceSummary').addEventListener('click',event=>{
      const target=event.target.closest('[data-evidence-jump]');
      if(!target)return;
      $('evidenceGroup_'+target.dataset.evidenceJump)?.scrollIntoView({block:'start',behavior:'smooth'});
    });
    $('evidenceResults').addEventListener('click',event=>{
      const target=event.target.closest('[data-evidence-pin]');
      if(target)jumpToEvidenceStamp(target.dataset.evidencePin).catch(error=>{
        console.error(error);toast('Could not navigate to the selected evidence stamp.');
      });
    });
    $('arrangeNotes').addEventListener('click',()=>{
      if(!isReady()||!pageWidthPt)return;
      finishFieldHistory();const before=historySnapshot();
      const notes=pageStamps(currentPage);let updated=0;
      for(const stamp of notes){
        const oldX=stamp.x,oldY=stamp.y;
        placeNoteInFreeSpace(stamp,notes.filter(x=>x.id!==stamp.id),pageWidthPt,pageHeightPt);
        if(oldX!==stamp.x||oldY!==stamp.y)updated++;
      }
      renderStamps();scheduleSave();
      recordHistory('arrange page '+currentPage+' comments',before);
      toast(updated?'Moved on-page comments into available positions. Check legibility before export.':'No clear rearrangement was needed.');
    });
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
      const txt=$('customText').value.trim();if(!txt){toast('Write a comment first.');return;}
      const item={id:'custom-'+makeId(),criterion:$('customCriterion').value,tone:$('customTone').value,topic:$('customTopic').value.trim()||(isFeedback()?'Personal feedback':'Personal evidence'),text:txt,tags:[],courses:allCourses,origin:'Teacher custom comment'};
      activeCustomComments().unshift(item);
      saveLibrarySettings();
      $('customDialog').close();tab=item.criterion;tone=item.tone;search='';$('commentSearch').value='';renderTabs();renderTone();renderBank();prepareComment(item.id);
      toast('Personal comment saved to this browser and selected.');
    });
    $('openReview').addEventListener('click',()=>{
      renderReview();$('reviewDialog').showModal();invalidateReviewPreview();
      $('buildReviewPreview').textContent='Generate actual PDF preview';
    });
    $('reviewDialog').addEventListener('close',invalidateReviewPreview);
    $('buildReviewPreview').addEventListener('click',prepareModeratorPreview);
    $('reviewPreviewPrevious').addEventListener('click',()=>{
      if(reviewPreview.pdf && reviewPreview.page>1){reviewPreview.page--;renderModeratorPreviewPage().catch(console.error);}
    });
    $('reviewPreviewNext').addEventListener('click',()=>{
      if(reviewPreview.pdf && reviewPreview.page<reviewPreview.pdf.numPages){reviewPreview.page++;renderModeratorPreviewPage().catch(console.error);}
    });
    $('reviewPreviewZoomIn').addEventListener('click',()=>{
      reviewPreview.zoom=Math.min(3,Math.round((reviewPreview.zoom+.5)*100)/100);
      renderModeratorPreviewPage().catch(console.error);
    });
    $('reviewPreviewZoomOut').addEventListener('click',()=>{
      reviewPreview.zoom=Math.max(.75,Math.round((reviewPreview.zoom-.5)*100)/100);
      renderModeratorPreviewPage().catch(console.error);
    });
    $('reviewConfirmed').addEventListener('change',updateReviewGate);
    $('feedbackChecklist').addEventListener('change',event=>{
      const checkbox=event.target.closest('[data-feedback-done]');if(!checkbox||!isFeedback())return;
      if(checkbox.checked)state.feedbackCompleted[checkbox.dataset.feedbackDone]=true;
      else delete state.feedbackCompleted[checkbox.dataset.feedbackDone];
      scheduleSave();renderFeedbackChecklist();updateReviewGate();
    });
    $('copyFeedbackChecklist').addEventListener('click',()=>copyCommentText(feedbackChecklistExportText()));
    $('downloadFeedbackChecklist').addEventListener('click',()=>{
      if(!isFeedback())return;
      download(new Blob([feedbackChecklistExportText()],{type:'text/plain;charset=utf-8'}),saveSafeName()+'-revision-checklist.txt');
      toast('Student revision checklist downloaded.');
    });
    $('printFeedbackChecklist').addEventListener('click',()=>{
      if(!isFeedback())return;
      window.print();
    });
    $('openCriteria').addEventListener('click',openCriteriaDialog);
    $('reviewOpenCriteria').addEventListener('click',()=>{$('reviewDialog').close();openCriteriaDialog();});
    $('closeCriteria').addEventListener('click',()=>$('criteriaDialog').close());
    $('criteriaDone').addEventListener('click',()=>$('criteriaDialog').close());
    $('criteriaJumpBar').querySelectorAll('[data-criteria-jump]').forEach(button=>{
      button.addEventListener('click',()=>{
        const card=$('criteriaCard_'+button.dataset.criteriaJump);
        if(card)card.scrollIntoView({behavior:'smooth',block:'start'});
      });
    });
    $('criteriaOpenGuide').addEventListener('click',()=>{
      $('criteriaOfficialGuideDetails').open=true;
      $('criteriaOfficialGuideDetails').scrollIntoView({behavior:'smooth',block:'start'});
    });
    $('removeCriteriaGuide').addEventListener('click',closeCriteriaGuide);
    $('criteriaDialog').addEventListener('close',()=>{
      closeCriteriaGuide();
      $('criteriaOfficialGuideDetails').open=false;
    });
    $('criteriaGuideInput').addEventListener('change',e=>{
      const file=e.target.files?.[0];if(!file)return;
      if(!file.name.toLowerCase().endsWith('.pdf')&&file.type!=='application/pdf'){toast('Choose the authorised official guide as a PDF.');e.target.value='';return;}
      closeCriteriaGuide();guideObjectUrl=URL.createObjectURL(file);
      $('criteriaOfficialGuideDetails').open=true;
      $('criteriaGuideFrame').src=guideObjectUrl;$('criteriaGuideLocalLink').href=guideObjectUrl;$('criteriaGuidePreview').classList.remove('hidden');
    });
    $('closeReview').addEventListener('click',()=> $('reviewDialog').close());
    $('exportAnnotated').addEventListener('click',exportPdf);
    window.addEventListener('resize',()=>{updateWorkspaceLayout({rerender:false});if(isReady())renderPage();});
    // Browser-local IndexedDB is not a substitute for a downloaded backup.
    // Attempt an immediate save on tab hiding; block accidental navigation
    // only while known changes have not been committed successfully.
    document.addEventListener('visibilitychange',()=>{
      if(document.hidden&&isReady()&&projectRevision>persistedRevision)void storeAutosave();
    });
    window.addEventListener('beforeunload',event=>{
      if(isReady()&&projectRevision>persistedRevision){
        event.preventDefault();event.returnValue='';
      }
    });
    document.addEventListener('keydown',e=>{
      if(e.key==='Tab'&&mobileWorkspace()&&mobileDrawer&&!document.querySelector('dialog[open]')){
        const pane=$(mobileDrawer==='document'?'documentPane':'bankPane');
        const controls=Array.from(pane.querySelectorAll('button,a[href],input:not([type="hidden"]),select,textarea,summary'))
          .filter(node=>!node.disabled&&!node.inert&&!node.closest('[inert]')&&node.getClientRects().length>0);
        const first=controls[0],last=controls[controls.length-1];
        if(first&&last&&(e.shiftKey&&(document.activeElement===first||!pane.contains(document.activeElement)))){
          e.preventDefault();last.focus();return;
        }
        if(first&&!e.shiftKey&&(document.activeElement===last||!pane.contains(document.activeElement))){
          e.preventDefault();first.focus();return;
        }
      }
      const inField=e.target instanceof HTMLInputElement||e.target instanceof HTMLTextAreaElement||
        e.target instanceof HTMLSelectElement||e.target?.isContentEditable;
      const modifier=e.ctrlKey||e.metaKey;
      const modalOpen=Boolean(document.querySelector('dialog[open]'));
      if(modifier&&!e.altKey&&!inField&&!modalOpen){
        const key=e.key.toLowerCase();
        if(key==='z'){
          e.preventDefault();if(e.shiftKey)redoMarking();else undoMarking();return;
        }
        if(key==='y'){e.preventDefault();redoMarking();return;}
      }
      if(e.key==='Escape'&&!modalOpen){
        if(mobileDrawer){closeMobileDrawer({restoreFocus:true});return;}
        if(focusedPdf){focusedPdf=false;updateWorkspaceLayout();return;}
        draft=null;movingStampId=null;renderEditor();renderBank();setInstruction();
      }
      if(inField||modifier||modalOpen)return;
      if(e.key==='ArrowRight')navigate(currentPage+1);
      if(e.key==='ArrowLeft')navigate(currentPage-1);
    });
  }
  async function handlePdfFile(file) {
    if(!file.name.toLowerCase().endsWith('.pdf')&&!file.type.includes('pdf')){
      toast('Please select a PDF file.');return;
    }
    const wasOpen=isReady();
    if(wasOpen&&!confirm('Open this PDF as a new IA? Your current project will remain in My IAs. Its marks, feedback and annotations will not carry into the new project.'))return;
    if(wasOpen&&!await preserveActiveProject())return;
    const bytes=new Uint8Array(await file.arrayBuffer());
    projectLoading=true;
    let success=false;
    try{
      success=await loadPdf(bytes,file.name);
      if(!success)return;
      // Previously entered marks before the FIRST PDF upload are retained.
      // Replacing a different student's PDF must never inherit their identity.
      if(wasOpen){
        state.course='AA SL';state.candidate='';state.session='';
        $('course').value='AA SL';$('candidate').value='';$('session').value='';
        updateFrameworkNotice();updateScores();renderBank();
      }
      activeProjectId=createLocalProjectId();projectRevision=0;persistedRevision=-1;activeSavedAt=null;
    }finally{projectLoading=false;}
    if(success){
      $('pdfLibraryStatus').classList.add('hidden');
      scheduleSave();
      const saved=await storeAutosave();
      await refreshProjectDashboard();
      toast(saved?file.name+' is ready and saved as a separate local IA.':
        file.name+' is ready, but local storage failed. Download a project backup.');
    }
  }
  function init() {
    try {state.customComments=JSON.parse(localStorage.getItem('ia-marking-desk-comments')||'[]');if(!Array.isArray(state.customComments))state.customComments=[];}catch(e){state.customComments=[];}
    try {const edits=JSON.parse(localStorage.getItem('ia-marking-desk-edits')||'{}');state.commentEdits=edits && !Array.isArray(edits) && typeof edits==='object' ? edits:{};}catch(e){state.commentEdits={};}
    try {state.feedbackComments=JSON.parse(localStorage.getItem('ia-marking-desk-feedback-comments')||'[]');if(!Array.isArray(state.feedbackComments))state.feedbackComments=[];}catch(e){state.feedbackComments=[];}
    try {const edits=JSON.parse(localStorage.getItem('ia-marking-desk-feedback-edits')||'{}');state.feedbackEdits=edits && !Array.isArray(edits) && typeof edits==='object' ? edits:{};}catch(e){state.feedbackEdits={};}
    try {state.stampStyle=normalStyle(JSON.parse(localStorage.getItem('ia-marking-desk-stamp-style')||'{}'));}catch(e){state.stampStyle=normalStyle();}
    try{quickPicks=sanitizeQuickPicks(JSON.parse(localStorage.getItem(QUICK_PICKS_KEY)||'{}'));}catch(e){quickPicks=sanitizeQuickPicks({});}
    if(pdfjsLib)pdfjsLib.GlobalWorkerOptions.workerSrc='vendor/pdf.worker.mjs';
    readWorkspacePreferences();
    initScores();renderStampStyle();updateModeUI();renderTabs();renderTone();renderBank();renderEditor();renderStamps();renderQuickPicker();updateHistoryButtons();setInstruction();updateWorkspaceLayout({rerender:false});initEvents();updateLocalSaveStatus();void initDatabase();
    if(!window.PDFLib)console.warn('PDF export library missing from this deployment; evidence reference tools remain available.');
  }
  init();
})();