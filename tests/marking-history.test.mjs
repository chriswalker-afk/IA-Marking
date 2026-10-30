import test from 'node:test';
import assert from 'node:assert/strict';
import {MarkingHistory,sanitizeQuickPicks} from '../marking-history.js';

const makeState=()=>({stamps:[],marks:{A:null,B:null,C:null,D:null,E:null},justifications:{A:'',B:'',C:'',D:'',E:''}});

test('undo and redo reverse exactly one placement or scoring operation',()=>{
  const manager=new MarkingHistory(10),state=makeState(),before=manager.snapshot(state);
  state.stamps.push({id:'s1',criterion:'A',text:'A strength',x:.2,y:.4});
  assert.equal(manager.push('place A',before,manager.snapshot(state)),true);
  const afterStamp=manager.snapshot(state);
  state.marks.A=3;manager.push('mark A',afterStamp,manager.snapshot(state));
  const previous=manager.undo();
  assert.equal(previous.label,'mark A');
  assert.equal(previous.snapshot.marks.A,null);
  assert.equal(previous.snapshot.stamps.length,1);
  const original=manager.undo();
  assert.equal(original.snapshot.stamps.length,0);
  assert.equal(manager.canUndo,false);
  assert.equal(manager.canRedo,true);
  const redo=manager.redo();
  assert.equal(redo.snapshot.stamps.length,1);
  assert.equal(redo.snapshot.marks.A,null);
  assert.equal(manager.redo().snapshot.marks.A,3);
});

test('future redo steps are discarded after a new edit, and empty changes are not recorded',()=>{
  const manager=new MarkingHistory(5);
  const initial=makeState(),changed=makeState();
  changed.marks.B=2;
  assert.equal(manager.push('noop',initial,makeState()),false);
  manager.push('mark B',initial,changed);
  assert.ok(manager.undo());
  assert.equal(manager.canRedo,true);
  const revised=makeState();revised.marks.C=3;
  manager.push('mark C',initial,revised);
  assert.equal(manager.canRedo,false);
  assert.equal(manager.redo(),null);
});

test('history is bounded, immutable and reset between different PDF students',()=>{
  const manager=new MarkingHistory(5),state=makeState();
  for(let i=0;i<11;i++){
    const before=manager.snapshot(state);
    state.stamps.push({id:'id-'+i});
    manager.push('place',before,manager.snapshot(state));
  }
  assert.equal(manager.past.length,5);
  const current=manager.undo();
  current.snapshot.stamps.push({id:'bad'});
  assert.equal(manager.past.length,4);
  assert.equal(manager.future[0].before.stamps.some(x=>x.id==='bad'),false);
  manager.clear();
  assert.equal(manager.canUndo,false);
  assert.equal(manager.canRedo,false);
});

test('local favourite/recent preferences reject malformed and duplicate IDs',()=>{
  assert.deepEqual(sanitizeQuickPicks(null),{favorites:[],recent:[]});
  assert.deepEqual(sanitizeQuickPicks({favorites:['A','A',null,'B'],recent:['B','B','A',99]}),{favorites:['A','B'],recent:['B','A']});
  const tooMany=Array.from({length:200},(_,i)=>'id'+i);
  const cleaned=sanitizeQuickPicks({favorites:tooMany,recent:tooMany});
  assert.equal(cleaned.favorites.length,100);
  assert.equal(cleaned.recent.length,24);
});
