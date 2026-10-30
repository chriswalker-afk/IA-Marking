import test from 'node:test';
import assert from 'node:assert/strict';
import {contrastRatio,rectanglesIntersect,inspectModerationPages} from '../moderation-preflight.js';

test('contrast and spatial overlap calculations are consistent',()=>{
  assert.ok(contrastRatio('#000000','#ffffff')>20);
  assert.ok(contrastRatio('#999999','#ffffff')<4.5);
  assert.ok(rectanglesIntersect({x:0,y:0,width:10,height:10},{x:9,y:9,width:5,height:5})>0);
  assert.equal(rectanglesIntersect({x:0,y:0,width:10,height:10},{x:30,y:30,width:2,height:2}),0);
});

test('preflight warns about small type, weak contrast, source obstruction and missing marks',async()=>{
  const pdfDocument={
    numPages:1,
    async getPage(){return{
      rotate:0,
      getViewport(){return{width:595,height:842}},
      async getTextContent(){return{items:[{str:'mathematics',width:80,height:11,transform:[1,0,0,1,100,700]}]}}
    }}
  };
  const stamp={id:'a',criterion:'A'};
  const layout={
    x:90,y:128,width:180,height:80,
    fontSize:8.5,textColor:'#999999',fillColor:'#ffffff',fits:true,contentFits:true,
  };
  const issues=await inspectModerationPages({
    pdfDocument,stamps:[stamp],
    getPageStamps:()=>[stamp],
    noteLayout:()=>layout,
    pageLayoutProblems:()=>({items:[{stamp,layout}],problems:[]}),
    criterionKeys:['A','B'],marks:{A:2,B:null}
  });
  assert.ok(issues.some(i=>i.message.includes('below 4.5:1')));
  assert.ok(issues.some(i=>i.message.includes('pt text')));
  assert.ok(issues.some(i=>i.message.includes('cover selectable student text')));
  assert.ok(issues.some(i=>i.message.includes('Marks not yet awarded')));
  assert.equal(issues.some(i=>i.severity==='error'),false);
});

test('scanned-source uncertainty and real collision errors are reported, not hidden',async()=>{
  const page={rotate:0,getViewport:()=>({width:500,height:700}),getTextContent:async()=>({items:[]})};
  const stamp={id:'x',criterion:'B'};
  const issues=await inspectModerationPages({
    pdfDocument:{numPages:1,getPage:async()=>page},
    stamps:[stamp],getPageStamps:()=>[stamp],
    pageLayoutProblems:()=>({items:[{stamp,layout:{fontSize:10,textColor:'#111111',fillColor:'#ffffff'}}],problems:['B1 overlaps B2']}),
    noteLayout:()=>({}),
    criterionKeys:['A','B'],marks:{A:0,B:2},
  });
  assert.ok(issues.some(i=>i.severity==='error'&&i.message.includes('overlaps')));
  assert.ok(issues.some(i=>i.message.includes('no selectable PDF text')));
});
