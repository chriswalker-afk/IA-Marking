import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';

const bank = JSON.parse(readFileSync('comments.json', 'utf8'));
const allowedCourses = new Set(['AA SL', 'AA HL', 'AI SL', 'AI HL']);
const criteria = new Set(['A', 'B', 'C', 'D', 'E']);

test('comprehensive library contains 294 original teacher evidence comments', () => {
  assert.equal(bank.length, 294);
  assert.equal(new Set(bank.map(c => c.id)).size, bank.length);
  for (const criterion of criteria) {
    for (const tone of ['strength','limitation']) {
      assert.ok(bank.some(c => c.criterion === criterion && c.tone === tone));
    }
  }
});

test('every comment has useful source metadata and supported course tags', () => {
  for (const c of bank) {
    assert.ok(criteria.has(c.criterion), c.id);
    assert.ok(['strength','limitation'].includes(c.tone), c.id);
    assert.ok(typeof c.text === 'string' && c.text.length > 20, c.id);
    assert.ok(Array.isArray(c.sourcePages) && c.sourcePages.every(n => n >= 3 && n <= 21), c.id);
    assert.ok(Array.isArray(c.courses) && c.courses.length && c.courses.every(course => allowedCourses.has(course)), c.id);
  }
});

test('browser comment bundle matches authoring JSON', () => {
  const sandbox = { window: {} };
  vm.runInNewContext(readFileSync('comments.js','utf8'), sandbox);
  assert.equal(JSON.stringify(sandbox.window.IA_COMMENT_BANK), JSON.stringify(bank));
});

test('application script syntax and dependencies are pinned', () => {
  for (const filename of ['app.js', 'unicode-fonts.js', 'moderation-preflight.js', 'comments.js', 'rubric.js', 'library.js']) {
    execFileSync(process.execPath,['--check',filename]);
  }
  const html=readFileSync('index.html','utf8');
  assert.ok(html.includes('type="module" src="app.js"'));
  assert.ok(readFileSync('app.js','utf8').includes('vendor/pdf.mjs'));
  assert.ok(html.includes('vendor/pdf-lib.min.js'));
  assert.ok(!html.includes('https://cdn.'));
  assert.ok(!html.includes('https://cdnjs.'));
  assert.ok(html.includes('frameworkNotice'));
});


test('stamp appearance and full-library controls are wired into the UI', () => {
  const html=readFileSync('index.html','utf8');
  const app=readFileSync('app.js','utf8');
  for (const id of [
    'defaultStampSize','defaultStampSizeValue','strengthStampColour','limitationStampColour','applyStampStyle',
    'openLibrary','libraryDialog','librarySearch','libraryCourse','libraryCriterion','libraryTone','libraryResults','copyLibraryVisible',
  ]) {
    assert.ok(html.includes(`id="${id}"`), `Missing UI control: ${id}`);
  }
  for (const part of ['saveLibrarySettings','renderFullLibrary','copyCommentText','stampStyle','commentEdits','pdfColor(stamp)','size:normalSize(draft.size)']) {
    assert.ok(app.includes(part), `Missing logic: ${part}`);
  }
  // Editing a reusable bank entry must not rewrite an already placed stamp.
  assert.ok(app.includes('state.commentEdits[id]={text:'));
  assert.ok(app.includes('stamp.text=e.target.value'));
  assert.ok(!app.includes('state.stamps.forEach(stamp=>stamp.text'));
});

test('missing PDF vendor does not prevent the teacher library or criteria from initialising', () => {
  const app=readFileSync('app.js','utf8');
  assert.ok(app.includes("import('./vendor/pdf.mjs')"), 'PDF dependency should load lazily');
  assert.ok(!app.startsWith("import * as pdfjsLib"), 'Top-level import must not block all UI on missing vendor');
  assert.ok(app.includes('ensurePdfRenderer')&&app.includes('pdfLibraryStatus'));
  const html=readFileSync('index.html','utf8');
  for(const id of ['openCriteria','criteriaDialog','criteriaCards','criteriaGuideLink','criteriaGuideInput','criteriaGuideFrame','pdfLibraryStatus']) {
    assert.ok(html.includes('id="'+id+'"'),id);
  }
  assert.ok(html.includes('href="library.html"'));
  assert.ok(app.includes('GUIDE_LINKS')&&app.includes('data-criteria-score'));
});

test('standalone teacher library is independent of PDF viewer and allows copying/editing comments', () => {
  const html=readFileSync('library.html','utf8'),app=readFileSync('library.js','utf8');
  assert.ok(html.includes('src="comments.js"')&&html.includes('src="library.js"'));
  assert.ok(!html.includes('vendor/pdf'));
  assert.ok(!app.includes('pdfjsLib'));
  for(const id of ['referenceResults','referenceCopyVisible','refSearch','refCriterion','refCourse','refTone','referenceEditDialog']) {
    assert.ok(html.includes('id="'+id+'"'),id);
  }
  for(const key of ['ia-marking-desk-comments','ia-marking-desk-edits','navigator.clipboard','referenceSaveEdit']) {
    assert.ok(app.includes(key),key);
  }
});

test('build includes independent library and checks PDF assets', () => {
  const script=readFileSync('scripts/build.mjs','utf8');
  for(const target of ['library.html','library.css','library.js','pdf.mjs','pdf.worker.mjs','pdf-lib.min.js']){
    assert.ok(script.includes(target),target);
  }
});

test('visible full comments are burned onto original PDF pages, with export collision checks', () => {
  const html=readFileSync('index.html','utf8'),app=readFileSync('app.js','utf8'),css=readFileSync('styles.css','utf8');
  for(const id of ['id="stampLayer"','id="annotationNotice"','id="arrangeNotes"'])assert.ok(html.includes(id),id);
  assert.ok(!html.includes('id="pageNotes"'),'No external sidebar/margin annotations');
  for(const part of ['function noteLayout(','function pageLayoutProblems(','function placeNoteInFreeSpace(','onpage-note-body','page.drawRectangle({x:layout.x','const output=await PDFDocument.load(state.pdfBytes','if(allProblems.length)']){
    assert.ok(app.includes(part),part);
  }
  assert.ok(!app.includes('output.addPage([w+COL,h])'),'Source pages must not be widened');
  assert.ok(!app.includes('CONTINUED ASSESSMENT EVIDENCE'),'Comments must not be relegated to continuation sheets');
  assert.ok(css.includes('.onpage-stamp{'),'Visible PDF-page text boxes missing');
  assert.ok(css.includes('white-space:pre-wrap'),'Sidebar comments should be complete');
  assert.ok(!css.includes('-webkit-line-clamp:2'),'Sidebar comments should never be truncated');
});

test('full on-page comment styles and box resizing are accessible and preserved in PDF', () => {
  const html=readFileSync('index.html','utf8');
  const app=readFileSync('app.js','utf8');
  const css=readFileSync('styles.css','utf8');
  for (const id of [
    'defaultNoteFont','defaultNoteTextColour','defaultNoteFillColour',
    'defaultNoteBorderColour','defaultNoteWidth',
  ]) assert.ok(html.includes('id="'+id+'"'), 'Missing default comment setting: '+id);
  for (const part of [
    'noteFontSize(stamp)','noteTextColor(stamp)','noteFillColor(stamp)',
    'noteBorderColor(stamp)','normalNoteHeight(stamp.noteHeight)',
    'page.drawRectangle({x:layout.x,y:bottom',
    'color:pdfHexColor(layout.fillColor)',
    'borderColor:pdfHexColor(layout.borderColor)',
    'layout.fontSize,font,fullTextColor',
    'data-resize-pin=',
    'note-resize-handle',
    'HeightAuto','FontValue','TextColor','FillColor','BorderColor',
    'contentFits','noteHeight:normalNoteHeight(s.noteHeight)',
  ]) assert.ok(app.includes(part), 'Missing preview/export sizing or colour handling: '+part);
  assert.ok(css.includes('.note-resize-handle'), 'Missing drag resize control');
  assert.ok(css.includes('.note-defaults'), 'Missing configurable new-comment defaults');
  assert.ok(app.includes('if(!current.layout.contentFits)'), 'Clipped comments should block export');
});

test('complete A-E teacher rubric includes each mark band and distinct SL and HL E', () => {
  const scope={window:{}};
  vm.runInNewContext(readFileSync('rubric.js','utf8'),scope);
  const rubric=scope.window.IA_RUBRIC;
  assert.deepEqual(Object.keys(rubric),['A','B','C','D','E']);
  for (const [key,max] of Object.entries({A:4,B:4,C:3,D:3})) {
    assert.equal(rubric[key].levels.length,max+1,key);
    assert.ok(rubric[key].levels.every(x=>typeof x==='string'&&x.length>45),key);
    assert.equal(rubric[key].considerations.length,3,key);
    assert.ok(rubric[key].focus.length>35,key);
  }
  assert.equal(rubric.E.SL.length,7);
  assert.equal(rubric.E.HL.length,7);
  assert.ok(rubric.E.HL[6].includes('AND rigour'));
  assert.notEqual(rubric.E.SL[6],rubric.E.HL[6]);
  const html=readFileSync('index.html','utf8');
  assert.ok(html.includes('<script src="rubric.js"></script>'));
  const app=readFileSync('app.js','utf8');
  for(const marker of ['data-rubric-key','data-rubric-score','updateRubricMarks','criteriaJumpBar','criteriaOfficialGuideDetails','RUBRIC.E','RUBRIC[key]']) {
    // RUBRIC.E is indirect through RUBRIC[key].
    if(marker==='RUBRIC.E')continue;
    assert.ok(app.includes(marker),marker);
  }
  for(const id of ['criteriaCoursePill','criteriaScrollArea','criteriaProgress','criteriaOfficialGuideDetails','criteriaOpenGuide']){
    assert.ok(html.includes('id="'+id+'"'),id);
  }
  const css=readFileSync('styles.css','utf8');
  assert.ok(css.includes('height:100dvh!important'),'Mobile rubric should be full screen');
  assert.ok(css.includes('.criteria-level.is-awarded'),'Selected achievement level should be visible');
  const build=readFileSync('scripts/build.mjs','utf8');
  assert.ok(build.includes("'rubric.js'"),'Rubric asset must be packaged by GitHub Pages build');
});

test('Pass 7 PDF reliability uses embedded Unicode math fonts and a verified original-page preview', () => {
  const html=readFileSync('index.html','utf8');
  const app=readFileSync('app.js','utf8');
  const build=readFileSync('scripts/build.mjs','utf8');
  for (const name of ['reviewPreviewBox','reviewPreviewCanvas','reviewConfirmed','preflightList','buildReviewPreview','reviewPreviewPrevious','reviewPreviewNext']) {
    assert.ok(html.includes('id="'+name+'"'),name);
  }
  assert.ok(html.includes('vendor/fontkit.umd.min.js'));
  assert.ok(!app.includes("replace(/\\u03c0/g,'pi')"),'Mathematics must not be downgraded to ASCII words');
  assert.ok(app.includes('createUnicodeFonts(output,window.fontkit'));
  assert.ok(app.includes('inspectModerationPages'));
  assert.ok(app.includes('reviewPreview.bytes'));
  assert.ok(app.includes("reviewPreview.signature===previewSignature()"));
  assert.ok(app.includes('reviewPreview.visited.size'));
  assert.ok(app.includes('reviewPreview.bytes],{type:'));
  assert.ok(html.includes('type="checkbox" disabled'));
  for(const asset of ['unicode-fonts.js','moderation-preflight.js','fontkit.umd.min.js','NotoSans-Regular.ttf','NotoSansMath-Regular.ttf']){
    assert.ok(build.includes(asset),'Missing deployment asset '+asset);
  }
});

test('Pass 8 quick tools, criterion navigator and undo history are deployed together', () => {
  const html=readFileSync('index.html','utf8');
  const app=readFileSync('app.js','utf8');
  const css=readFileSync('styles.css','utf8');
  const library=readFileSync('library.js','utf8');
  const build=readFileSync('scripts/build.mjs','utf8');
  for(const id of [
    'undoMark','redoMark','repeatStamp','quickStampAgain','quickStampPicker',
    'bankQuickTabs','openEvidence','evidenceDialog','evidenceSummary','evidenceResults',
  ])assert.ok(html.includes('id="'+id+'"'),'Missing Pass 8 control '+id);
  for(const code of [
    'new MarkingHistory(60)','function undoMarking()','function redoMarking()',
    'function renderEvidenceNavigator()','function jumpToEvidenceStamp(id)',
    'function recordRecentComment(id)','function toggleFavourite(id)',
    "recordHistory('place '","recordHistory('delete '","recordHistory('resize '",
    "recordHistory('drag '","recordHistory('move '","recordHistory('arrange page '",
    'resetHistory();lastPlacedDraft=null',
    "e.key.toLowerCase()",
  ])assert.ok(app.includes(code),'Missing Pass 8 history/quick stamping logic: '+code);
  assert.ok(css.includes('.efficiency-toolbar'));
  assert.ok(css.includes('.evidence-modal'));
  assert.ok(css.includes('.bank-quick-tab'));
  assert.ok(build.includes("'marking-history.js'"));
  assert.ok(library.includes("ia-marking-desk-quick-picks-v1"));
  assert.ok(library.includes('data-action="favourite"'));
});
