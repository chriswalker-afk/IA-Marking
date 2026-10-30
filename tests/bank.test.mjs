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
  for (const filename of ['app.js', 'comments.js']) {
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