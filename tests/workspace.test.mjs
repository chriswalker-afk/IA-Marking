import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const html=readFileSync('index.html','utf8');
const css=readFileSync('workspace.css','utf8');
const js=readFileSync('app.js','utf8');
const build=readFileSync('scripts/build.mjs','utf8');
test('PDF-first workspace exposes accessible panel and editor controls',()=>{
  for(const id of ['workspace','documentPane','viewerPane','bankPane','workspaceBackdrop','documentRailToggle','toggleDocumentPane','toggleCommentPane','toggleEditorPane','bankBrowseTab','bankEditorTab','bankBrowseView','selectionEditor','findAnotherComment','focusPdf','mobileDetailsToggle','mobileProjectToolsToggle','mobileDetailsSummary']){
    assert.ok(html.includes('id="'+id+'"'),id);
  }
  for(const [control,target] of [['toggleDocumentPane','documentPane'],['toggleCommentPane','bankPane'],['toggleEditorPane','selectionEditor'],['bankBrowseTab','bankBrowseView'],['bankEditorTab','selectionEditor']]){
    assert.match(html,new RegExp('id="'+control+'"[^>]*aria-controls="'+target+'"'));
  }
});
test('Layout state is separate from student project data',()=>{
  for(const key of ['WORKSPACE_LAYOUT_KEY','updateWorkspaceLayout','setWorkspaceView','openDocumentPanel','openCommentsPanel','toggleFocusPdf','closeMobileDrawer','aria-modal','state.feedbackStamps']){
    assert.ok(js.includes(key),key);
  }
  assert.ok(js.includes("if(!layoutOverride)documentCollapsed=true"));
  assert.ok(!js.includes('state.workspaceView='));
});
test('Small screens retain PDF-first overlay drawers',()=>{
  for(const key of ['max-width:1000px','position:fixed','data-mobile-drawer="document"','data-mobile-drawer="comments"','document-collapsed','bank-collapsed','data-bank-view="edit"','pdf-focus']){
    assert.ok(css.includes(key),key);
  }
  assert.ok(build.includes("'workspace.css'"));
  assert.ok(html.includes('href="workspace.css"'));
});
test('App and build scripts parse',()=>{
  execFileSync(process.execPath,['--check','app.js']);
  execFileSync(process.execPath,['--check','scripts/build.mjs']);
});
