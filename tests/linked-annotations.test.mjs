import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {normalNoteMode,normalTextAnchor,textAnchorFromDrag,textAnchorRect,markerGeometry,markerLeader,annotationGeometry} from '../annotation-geometry.js';

test('Legacy stamp geometry defaults to attached standard layout',()=>{
  assert.equal(normalNoteMode(undefined),'standard');
  assert.equal(normalNoteMode('slim'),'slim');
  assert.equal(normalNoteMode('malformed'),'standard');
  const box={x:40,y:70,width:150,height:45};
  assert.equal(annotationGeometry({size:18},box,595,842).detached,false);
});

test('Text anchors are page-normalised, clipped, and reject zero-area selections',()=>{
  const anchor=textAnchorFromDrag({x:.7,y:.52},{x:.25,y:.49},'highlight');
  assert.equal(anchor.kind,'highlight');
  assert.ok(Math.abs(anchor.width-.45)<1e-10);
  assert.deepEqual(textAnchorRect(anchor,600,800),{
    kind:'highlight',x:150,y:392,width:270,height:24,
  });
  assert.equal(textAnchorFromDrag({x:.1,y:.1},{x:.1,y:.1},'underline'),null);
  assert.equal(normalTextAnchor({kind:'invalid',x:.2,y:.2,width:.3,height:.1}),null);
  assert.ok(Math.abs(normalTextAnchor({kind:'underline',x:.9,y:.9,width:.8,height:.8}).width-.1)<1e-10);
});

test('Detached marker uses PDF coordinates and thin leader avoids covering badge',()=>{
  const box={x:200,y:100,width:185,height:25};
  const marker=markerGeometry({size:18,markerX:.2,markerY:.3},box,600,800);
  assert.equal(marker.x,120);
  assert.equal(marker.y,240);
  const line=markerLeader(marker,box);
  assert.ok(line);
  assert.ok(line.x1>=120&&line.x1<=200);
  assert.equal(line.x2,200);
  const full=annotationGeometry({
    noteMode:'slim',size:18,markerX:.2,markerY:.3,
    textAnchor:{kind:'underline',x:.3,y:.3,width:.2,height:.02},
  },box,600,800);
  assert.ok(full.detached&&full.marker&&full.leader&&full.anchorLeader);
  assert.equal(full.anchor.kind,'underline');
});

test('Editor, backup, overlay and PDF export use the same annotations',()=>{
  const app=readFileSync('app.js','utf8');
  const html=readFileSync('index.html','utf8');
  const build=readFileSync('scripts/build.mjs','utf8');
  for(const phrase of ['normalNoteMode(s.noteMode)','normalTextAnchor(s.textAnchor)',
    'annotationGeometry(stamp,layout,pageWidth,pageHeight)',
    'annotationGeometry(stamp,layout,page.getWidth(),height)',
    "textAnchorFromDrag(anchorSelection.start,positionOnPage(event),anchorSelection.kind)",
    "markerLeader", "noteMode:normalNoteMode(draft.noteMode)"]){
    assert.ok((app+' '+readFileSync('annotation-geometry.js','utf8')).includes(phrase),phrase);
  }
  for(const id of ['defaultNoteMode','defaultNoteFont'])assert.ok(html.includes('id="'+id+'"'));
  for(const asset of ['annotation-geometry.js','linked-annotations.css'])assert.ok(build.includes("'"+asset+"'"));
  execFileSync(process.execPath,['--check','app.js']);
  execFileSync(process.execPath,['--check','annotation-geometry.js']);
});
