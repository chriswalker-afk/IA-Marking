import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {PDFDocument,rgb} from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import {createUnicodeFonts} from '../unicode-fonts.js';
import {appendStudentChecklistPages,makeStudentChecklistModel} from '../student-checklist-pdf.js';

const assets=[
  readFileSync('node_modules/@expo-google-fonts/noto-sans/400Regular/NotoSans_400Regular.ttf'),
  readFileSync('node_modules/@expo-google-fonts/noto-sans/700Bold/NotoSans_700Bold.ttf'),
  readFileSync('node_modules/@expo-google-fonts/noto-sans-math/400Regular/NotoSansMath_400Regular.ttf'),
];
async function render(stamps,completed={},metadata={}){
  const document=await PDFDocument.create();
  const fonts=await createUnicodeFonts(document,fontkit,assets);
  const model=makeStudentChecklistModel({stamps,completed,
    course:'AA HL',candidate:'IA-014',session:'May 2028',...metadata});
  const summary=appendStudentChecklistPages({document,rgb,fonts,model});
  const bytes=await document.save();
  return {summary,document,bytes,model};
}
test('Standalone document includes every teacher-placed improvement, including repeat wording',async()=>{
  const stamps=[
    {id:'a',criterion:'A',tone:'strength',page:1,text:'The aim is well motivated.'},
    {id:'b',criterion:'B',tone:'limitation',page:2,topic:'Graphs',text:'Check axes π ≤ √16 and σ².',priority:'high'},
    {id:'c',criterion:'B',tone:'limitation',page:3,topic:'Graphs',text:'Check axes π ≤ √16 and σ².',priority:'low'},
    {id:'d',criterion:'D',tone:'limitation',page:4,topic:'Interpretation',text:'Evaluate how your assumptions affect the result.',priority:'normal'},
  ];
  const {summary,document,bytes,model}=await render(stamps,{b:true});
  assert.equal(summary.actionCount,3);
  assert.equal(summary.strengthCount,1);
  assert.ok(bytes.length>10000);
  assert.equal(document.getPageCount(),summary.pagesAdded);
  assert.ok(model.tasks.some(x=>x.label==='B1'&&x.completed));
  assert.ok(model.tasks.some(x=>x.label==='B2'&&!x.completed));
  assert.equal(model.tasks.filter(x=>x.text.includes('Check axes')).length,2);
  const reloaded=await PDFDocument.load(bytes);
  assert.equal(reloaded.getPageCount(),summary.pagesAdded);
  assert.deepEqual(reloaded.getPages()[0].getSize(),{width:595,height:842});
});
test('Long student actions paginate without clipping, crash or silent replacement',async()=>{
  const stamps=Array.from({length:14},(_,index)=>({
    id:'action-'+index,criterion:index%2===0?'E':'D',
    tone:'limitation',page:index+1,topic:'Modelling and reflection',
    priority:index<4?'high':index<10?'normal':'low',
    text:('Investigate the assumptions in your model, revisit your mathematics and explain the limitations using appropriate evidence and notation π² ≤ ∫. ').repeat(7),
  }));
  const result=await render(stamps);
  assert.equal(result.summary.actionCount,14);
  assert.ok(result.summary.pagesAdded>=4,'Expected more than one A4 sheet for long checklist');
  for(const page of result.document.getPages())assert.deepEqual(page.getSize(),{width:595,height:842});
  assert.ok(result.bytes.length>20000);
});
test('A no-improvements draft can still display strengths but never injects a final mark',async()=>{
  const {model,summary}=await render([{id:'s',criterion:'C',tone:'strength',page:1,text:'Your approach is personal.'}],{},{
    marks:{A:4,E:6},justifications:{A:'Teacher-only rationale'},
  });
  assert.equal(summary.actionCount,0);
  assert.equal(summary.strengthCount,1);
  assert.equal(model.marks,undefined);
  assert.equal(model.justifications,undefined);
});
test('PDF fails closed when a feedback comment uses an unsupported glyph',async()=>{
  await assert.rejects(render([{id:'one',criterion:'A',tone:'limitation',page:1,text:'Please review this 🧪 question.'}]),
    /Unsupported comment character/);
});
test('Checklist PDF generation is integrated into both exports and staged preview UI',()=>{
  const app=readFileSync('app.js','utf8');
  const html=readFileSync('index.html','utf8');
  const build=readFileSync('scripts/build.mjs','utf8');
  for(const id of ['downloadFeedbackPdf','reviewJourney','reviewInspectionProgress','reviewNextUnseen',
    'reviewPageProgress','reviewJumpToPreview','reviewFooterGuidance','preflightList'])
    assert.ok(html.includes('id="'+id+'"'),id);
  assert.ok((app.match(/appendStudentChecklistPages\(/g)||[]).length>=2);
  assert.ok(app.includes('async function exportStandaloneChecklistPdf()'));
  assert.ok(app.includes('reviewPreview.visited.add(reviewPreview.page)'));
  assert.ok(app.includes('data-preflight-page'));
  assert.ok(html.includes('href="review-polish.css"'));
  assert.ok(build.includes("'student-checklist-pdf.js'"));
  assert.ok(build.includes("'review-polish.css'"));
  execFileSync(process.execPath,['--check','app.js']);
  execFileSync(process.execPath,['--check','student-checklist-pdf.js']);
});
