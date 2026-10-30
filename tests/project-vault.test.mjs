import test from 'node:test';
import assert from 'node:assert/strict';
import {createLocalProjectId,summariseLocalProject,LOCAL_IA_DB,LOCAL_IA_DB_VERSION} from '../project-vault.js';

const marks={A:null,B:null,C:null,D:null,E:null};
const project={candidate:' IA-014 ',course:'AA HL',session:'May 2027',pdfName:'original.pdf',
  marks:{...marks},stamps:[],justifications:{A:'',B:'',C:'',D:'',E:''}};

test('local IA project summaries expose marks/progress but not PDF or comment text',()=>{
  const first=summariseLocalProject('ia-one',project,new Uint8Array([1,2,3]),5,'2026-10-30T10:00:00.000Z');
  assert.equal(first.id,'ia-one');
  assert.equal(first.candidate,'IA-014');
  assert.equal(first.course,'AA HL');
  assert.equal(first.markedCount,0);
  assert.equal(first.total,null);
  assert.equal(first.status,'Not started');
  assert.equal(first.pageCount,5);
  assert.equal(first.fileSize,3);
  assert.equal('pdfBytes' in first,false);
  assert.equal('stamps' in first,false);
  assert.equal('justifications' in first,false);
  assert.deepEqual(Object.keys(first).sort(),[
    'annotations','candidate','course','fileSize','id','markedCount','pageCount',
    'pdfName','rationaleCount','savedAt','session','status','total',
  ].sort());
});

test('zero marks count as awarded and all-five progress does not imply moderation is complete',()=>{
  const withMarks={...project,marks:{A:0,B:2,C:3,D:1,E:6},
    stamps:[{criterion:'A',text:'Evidence is coherent'}, {criterion:'D',text:'Limitations discussed'}],
    justifications:{A:'Evidence 1',B:'',C:'',D:'Evidence 2',E:''}};
  const summary=summariseLocalProject('ia-second',withMarks,new Uint8Array(500),2);
  assert.equal(summary.markedCount,5);
  assert.equal(summary.total,12);
  assert.equal(summary.status,'All marks recorded');
  assert.equal(summary.annotations,2);
  assert.equal(summary.rationaleCount,2);
});

test('partial marks, incorrect numerical values and unknown courses cannot create a false completion',()=>{
  const testProject={...project,course:'not a course',marks:{A:2,B:5,C:0,D:-1,E:6},
    stamps:[{criterion:'E'}]};
  const summary=summariseLocalProject('ia-third',testProject,new Uint8Array(1),1);
  assert.equal(summary.course,'AA SL');
  assert.equal(summary.markedCount,3);
  assert.equal(summary.total,null);
  assert.equal(summary.status,'In progress');
});

test('local IDs are unique and database migration keeps the original storage name',()=>{
  const first=createLocalProjectId(),second=createLocalProjectId();
  assert.match(first,/^ia-[\w-]+$/);
  assert.notEqual(first,second);
  assert.equal(LOCAL_IA_DB,'ia-marking-desk-local-v1');
  assert.equal(LOCAL_IA_DB_VERSION,2);
});
