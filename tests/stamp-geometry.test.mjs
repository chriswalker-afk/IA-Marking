import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {selectableTextRectangles,textCoverage,compactWidth,wrapStampText} from '../stamp-geometry.js';

test('PDF.js text geometry is transformed to top-left page coordinates and clamped',()=>{
  const items=[
    {str:'Student reasoning',transform:[11,0,0,11,56,665],width:133,height:12},
    {str:'  ',transform:[10,0,0,10,50,710],width:15,height:11},
    {str:'Outside right edge',transform:[11,0,0,11,575,200],width:100,height:12},
    {str:'outside page',transform:[11,0,0,11,-50,900],width:20,height:12},
  ];
  const rects=selectableTextRectangles(items,595,842);
  assert.equal(rects.length,2);
  assert.equal(rects[0].x,56);
  assert.ok(rects[0].y>160&&rects[0].y<190);
  assert.equal(rects[0].width,133);
  assert.equal(rects[1].x,575);
  assert.equal(rects[1].width,20);
  assert.ok(Math.abs(textCoverage({x:55,y:170,width:145,height:24},rects)-133*12.4)<1);
  assert.equal(textCoverage({x:200,y:100,width:100,height:50},rects),0);
});

test('Dense source text is measured without claiming to understand diagrams or scans',()=>{
  const rectangles=[
    {x:10,y:10,width:90,height:10},
    {x:10,y:22,width:90,height:10},
  ];
  assert.equal(textCoverage({x:10,y:10,width:90,height:22},rectangles),1800);
  assert.equal(textCoverage({x:200,y:200,width:100,height:100},rectangles),0);
  assert.equal(textCoverage({x:10,y:10,width:90,height:22},[]),0);
});

test('Compact sizing balances actual printed footprint with avoiding extremely tall strips',()=>{
  const proposal=compactWidth({currentWidth:250,measure:width=>({
    width,minHeight:width<190?120:width<235?88:75,
  })});
  assert.ok(proposal.width>=190&&proposal.width<=235,JSON.stringify(proposal));
  assert.ok(proposal.area<250*75,JSON.stringify(proposal));
  const short=compactWidth({currentWidth:230,measure:width=>({width,minHeight:48})});
  assert.equal(short.width,150,'Short comments can use a narrow, compact box.');
  assert.throws(()=>compactWidth({}),/measurement/);
});

test('Text wraps beside the criterion only while needed and reclaims the left gutter below',()=>{
  const text='Compare the data and explain why the mathematical model is appropriate for this situation.';
  const lines=wrapStampText(text,{
    lineArea:i=>i<2?{x:40,width:84}:{x:9,width:190},
    measure:value=>Array.from(value).length*4.5,
  });
  assert.equal(lines[0].x,40);
  assert.equal(lines[1].x,40);
  assert.ok(lines.some(line=>line.x===9),'Lines beneath the badge must use almost the full width.');
  lines.forEach((line,i)=>assert.ok(
    line.text.length*4.5<=(i<2?84:190)+.01,
    'Every rendered row must fit its measured PDF width'));
  assert.equal(lines.map(x=>x.text).join(' ').replace(/\s+/g,' '),text);
  const long='πSuperLongMathematicalIdentifierThatNeedsSplitting';
  const parts=wrapStampText(long,{lineArea:()=>({x:9,width:50}),measure:v=>Array.from(v).length*5});
  assert.equal(parts.map(x=>x.text).join(''),long,'Long mathematical identifiers must not lose glyphs.');
  assert.equal(parts.at(-1).text.length>0,true,'Do not introduce an empty trailing line.');
});
test('Compact layout is used consistently for exact PDF rendering and live stamp previews',()=>{
  const app=readFileSync('app.js','utf8');
  const html=readFileSync('index.html','utf8');
  const css=readFileSync('compact-stamps.css','utf8');
  const build=readFileSync('scripts/build.mjs','utf8');
  assert.ok(app.includes('bodyTop=headerTop+Math.max(11,headerFontSize*1.2)+5'));
  assert.ok(app.includes('lineArea:index=>'));
  assert.ok(app.includes('layout.rowXs[i]*scale'));
  assert.ok(app.includes('layout.x+layout.rowXs[index]'));
  assert.ok(app.includes('resolved.rowXs[i]*scale'));
  for(const marker of ['selectableTextByPage','getTextContent()','selectableTextRectangles','textCoverage',
    'compactWidth','makeStampCompact','findStampClearSpace','source-warning']){
    assert.ok(app.includes(marker),marker);
  }
  assert.ok(html.includes('href="compact-stamps.css"'));
  assert.ok(build.includes("'stamp-geometry.js'")&&build.includes("'compact-stamps.css'"));
  assert.ok(css.includes('preview-body{width:100%'));
  execFileSync(process.execPath,['--check','app.js']);
  execFileSync(process.execPath,['--check','stamp-geometry.js']);
});
