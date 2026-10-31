import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import vm from 'node:vm';
import {studentChecklistItems,studentFeedbackStrengths,studentChecklistText} from '../feedback-engine.js';

const sandbox={window:{}};
vm.runInNewContext(readFileSync('feedback-comments.js','utf8'),sandbox);
const bank=sandbox.window.IA_FEEDBACK_BANK;
const criteria=new Set(['A','B','C','D','E']);
const courses=new Set(['AA SL','AI SL','AA HL','AI HL']);

test('dedicated bank has well-sourced, student-facing feedback across all five IA criteria',()=>{
  assert.equal(bank.length,133);
  assert.equal(new Set(bank.map(item=>item.id)).size,bank.length);
  assert.ok(bank.some(item=>item.tone==='strength'));
  assert.ok(bank.some(item=>item.tone==='limitation'));
  for(const item of bank){
    assert.ok(criteria.has(item.criterion),item.id);
    assert.ok(item.text.length>25,item.id);
    assert.ok(Array.isArray(item.courses)&&item.courses.every(c=>courses.has(c)),item.id);
    assert.ok(Array.isArray(item.sourcePages)&&item.sourcePages.every(page=>page>=3&&page<=21),item.id);
    assert.ok(!/^(the student|the exploration) (has|does not|fails to|demonstrates)/i.test(item.text),item.id);
  }
  for(const criterion of criteria){
    assert.ok(bank.filter(item=>item.criterion===criterion&&item.tone==='limitation').length>=10,criterion);
  }
});

test('one checklist action for each placed limitation - including duplicate prompts',()=>{
  const stamps=[
    {id:'a',criterion:'A',tone:'strength',page:1,text:'Clear aim',topic:'Aim'},
    {id:'b',criterion:'A',tone:'limitation',page:2,text:'Clarify your aims',topic:'Aim',priority:'normal'},
    {id:'c',criterion:'A',tone:'limitation',page:3,text:'Clarify your aims',topic:'Aim',priority:'high'},
    {id:'d',criterion:'B',tone:'limitation',page:4,text:'Label your graph',topic:'Graphs',priority:'low'},
  ];
  const tasks=studentChecklistItems(stamps,{b:true});
  assert.equal(tasks.length,3);
  assert.deepEqual(tasks.map(x=>x.id),['c','b','d']);
  assert.deepEqual(tasks.map(x=>x.label),['A3','A2','B1']);
  assert.equal(tasks.find(x=>x.id==='b').completed,true);
  assert.equal(tasks.find(x=>x.id==='c').completed,false);
  assert.equal(studentFeedbackStrengths(stamps).length,1);
  const text=studentChecklistText({stamps,completed:{b:true},candidate:'IA-014',course:'AA SL',session:'May 2027'});
  assert.ok(text.includes('FIRST DRAFT'));
  assert.ok(text.includes('IA-014'));
  assert.ok(text.includes('[x] A2'));
  assert.ok(text.includes('[ ] A3'));
  assert.equal(text.match(/Clarify your aims/g)?.length,2);
  assert.ok(!text.includes('/20'),'Feedback exports must not imply a numerical grade');
});

test('missing or unsuitable text does not produce an empty task; priority is validated',()=>{
  const tasks=studentChecklistItems([
    {id:'x',criterion:'E',tone:'limitation',page:12,topic:'Model',text:'  Recheck the model assumptions.  ',priority:'unexpected'},
    {id:'y',criterion:'D',tone:'limitation',page:9,text:'   ',priority:'high'},
    {id:'z',criterion:'F',tone:'limitation',page:8,text:'Not an applicable criterion',priority:'high'},
  ]);
  assert.equal(tasks.length,1);
  assert.equal(tasks[0].text,'Recheck the model assumptions.');
  assert.equal(tasks[0].priority,'normal');
  assert.equal(tasks[0].label,'E1');
});

test('feedback is a separate mode, not a repurposing of teacher final marks',()=>{
  const app=readFileSync('app.js','utf8');
  const html=readFileSync('index.html','utf8');
  const build=readFileSync('scripts/build.mjs','utf8');
  for(const id of ['markingMode','feedbackMode','feedbackReviewContent','feedbackChecklist','feedbackProgress','copyFeedbackChecklist','downloadFeedbackChecklist','printFeedbackChecklist']){
    assert.ok(html.includes('id="'+id+'"'),id);
  }
  for(const part of ['markingStamps()','feedbackStamps()','activeMode:mode','state.feedbackCompleted','function switchMode(next)','studentChecklistItems','studentFeedbackStrengths','if(isFeedback())','feedbackComments','feedbackEdits']){
    assert.ok(app.includes(part),part);
  }
  assert.ok(app.includes('appendStudentChecklistPages'), 'Feedback checklist must be appended with the shared PDF renderer');
  assert.ok(app.includes("criterionKeys:isFeedback()?[]:CRITERION_KEYS"),'Feedback preflight must not request final marks');
  assert.ok(build.includes("'feedback-comments.js'")&&build.includes("'feedback-engine.js'"));
  assert.ok(html.includes('<script src="feedback-comments.js"></script>'));
  for(const source of ['app.js','feedback-engine.js','feedback-comments.js','library.js']){
    execFileSync(process.execPath,['--check',source]);
  }
});

test('standalone first-draft library is linked and keeps its edits separate',()=>{
  const html=readFileSync('library.html','utf8');
  const js=readFileSync('library.js','utf8');
  assert.ok(html.includes('library.html?mode=feedback'));
  assert.ok(html.includes('src="feedback-comments.js"'));
  assert.ok(js.includes("FEEDBACK_MODE"));
  assert.ok(js.includes("ia-marking-desk-feedback-comments"));
  assert.ok(js.includes("ia-marking-desk-feedback-edits"));
});
