import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {rankStampComments,clampResultIndex,placementFeedback} from '../fast-stamp.js';

const comments=[
  {id:'A-aim',criterion:'A',topic:'Aim and motivation',tags:['research'],text:'Establish a focused aim connecting the investigation to your question.'},
  {id:'B-graph',criterion:'B',topic:'Graph labelling',tags:['visuals','axis'],text:'Make the axes and the units clear on each graph.'},
  {id:'D-eval',criterion:'D',topic:'Model limitations',tags:['reflection'],text:'Explain how an unusual outlier affects your model.'},
  {id:'B-outlier',criterion:'B',topic:'Outliers',tags:['data'],text:'Annotate the outlier clearly on your graph.'},
];
test('Empty search retains original comment-bank ordering',()=>{
  assert.deepEqual(rankStampComments(comments,'').map(x=>x.id),comments.map(x=>x.id));
  assert.deepEqual(rankStampComments(comments,'  ').map(x=>x.id),comments.map(x=>x.id));
});
test('Search matches words across topic, tags, criterion and text and ranks topical results first',()=>{
  assert.deepEqual(rankStampComments(comments,'outlier graph').map(x=>x.id),['B-outlier']);
  assert.deepEqual(rankStampComments(comments,'b outlier').map(x=>x.id),['B-outlier']);
  assert.equal(rankStampComments(comments,'model limitations')[0].id,'D-eval');
  assert.equal(rankStampComments(comments,'axis units')[0].id,'B-graph');
  assert.equal(rankStampComments(comments,'unmatched term').length,0);
});
test('Relevant favourites and recent comments receive a modest ranking boost',()=>{
  const results=rankStampComments(comments,'graph',{favorites:['B-outlier'],recent:['B-outlier']});
  assert.equal(results[0].id,'B-outlier');
  assert.equal(results.length,2);
  // Relevance still matters: a favourite outside the query does not appear.
  assert.deepEqual(rankStampComments(comments,'motivation',{favorites:['B-outlier']}).map(x=>x.id),['A-aim']);
});
test('Keyboard movement wraps only through actual visible results',()=>{
  assert.equal(clampResultIndex(-1,4),3);
  assert.equal(clampResultIndex(4,4),0);
  assert.equal(clampResultIndex(2,4),2);
  assert.equal(clampResultIndex(20,0),-1);
});
test('Placement copy differentiates clear, adjusted, clipped and conflicting boxes',()=>{
  const point={x:20,y:20};
  assert.equal(placementFeedback({requested:point,resolved:{x:20,y:20}}).kind,'ready');
  assert.equal(placementFeedback({requested:point,resolved:{x:70,y:20}}).kind,'adjusted');
  assert.equal(placementFeedback({requested:point,resolved:point,overlaps:true}).kind,'warning');
  assert.equal(placementFeedback({requested:point,resolved:point,contentFits:false}).kind,'warning');
});
test('Fast-stamping UI and deployed assets are installed and valid',()=>{
  const html=readFileSync('index.html','utf8');
  const app=readFileSync('app.js','utf8');
  const build=readFileSync('scripts/build.mjs','utf8');
  const css=readFileSync('fast-stamp.css','utf8');
  for(const id of ['findStampFast','openShortcutHelp','shortcutDialog','commentSearch',
    'searchKeyboardStatus','placementAssist']) assert.ok(html.includes('id="'+id+'"'),id);
  assert.ok(app.includes("addEventListener('pointermove',queuePlacementPreview)"));
  assert.ok(app.includes('placeNoteInFreeSpace(candidate,pageStamps(currentPage)'));
  assert.ok(app.includes("import {rankStampComments,clampResultIndex,placementFeedback}"));
  assert.ok(build.includes("'fast-stamp.js'")&&build.includes("'fast-stamp.css'"));
  assert.ok(html.includes('href="fast-stamp.css"'));
  assert.ok(css.includes('pointer-events:none'),'Hover preview must not eat clicks');
  execFileSync(process.execPath,['--check','app.js']);
  execFileSync(process.execPath,['--check','fast-stamp.js']);
});
