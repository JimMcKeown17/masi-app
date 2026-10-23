'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { egraCatalog, listEgraAssessments, getEgraAssessment } = require('./index');

test('the bundled JSON is the agreed, unchanged 2026-10-23.1 transcription', () => {
  const hash = createHash('sha256').update(readFileSync(join(__dirname, 'egra-assessments.json'))).digest('hex');
  assert.equal(hash, 'ce3f99d782bfc681110d1d8ca43d237d13d04cdca5f43298fe2134a7f1e14e3b');
  assert.equal(egraCatalog.contentVersion, '2026-10-23.1');
  assert.equal(listEgraAssessments().length, 13);
});

test('English HL and FAL remain distinct; unknown languages do not fall back', () => {
  const hl = listEgraAssessments({ languageCode: 'en', variant: 'hl' });
  const fal = listEgraAssessments({ languageCode: 'en', variant: 'fal' });
  assert.equal(hl.length, 3);
  assert.equal(fal.length, 3);
  assert.ok(hl.every(a => !fal.some(b => b.id === a.id)));
  assert.deepEqual(listEgraAssessments({ languageCode: 'unknown' }), []);
  assert.deepEqual(listEgraAssessments({ languageCode: 'en', variant: 'unknown' }), []);
});

test('lookup preserves positional duplicates, full passage and assessor answer key', () => {
  const a = getEgraAssessment('dbe-egra-xh-hl-1-v1');
  assert.deepEqual(a.letters.items.slice(0, 3), [
    { id: '1', text: 'V' }, { id: '2', text: 'l' }, { id: '3', text: 'h' },
  ]);
  const repeated = a.words.items.filter(item => item.text === 'ubisi');
  assert.ok(repeated.length > 1);
  assert.equal(new Set(repeated.map(item => item.id)).size, repeated.length);
  assert.ok(a.passage.text.startsWith('ULolo wayeza'));
  assert.equal(a.comprehension.questions[0].answerText, 'nguLolo');
  assert.equal(getEgraAssessment('english_60_v2'), null);
  assert.equal(getEgraAssessment('unknown'), null);
  assert.equal(getEgraAssessment(undefined), null);
});

test('a consumer cannot mutate content shared by subsequent readers', () => {
  const a = getEgraAssessment('dbe-egra-xh-hl-1-v1');
  assert.throws(() => { a.letters.items[0].text = 'changed'; }, TypeError);
  assert.throws(() => { a.comprehension.questions.pop(); }, TypeError);
  assert.throws(() => { egraCatalog.sources[0].pdfPages = []; }, TypeError);
  assert.throws(() => { listEgraAssessments().pop(); }, TypeError);
  assert.equal(getEgraAssessment(a.id).letters.items[0].text, 'V');
  assert.equal(listEgraAssessments().length, 13);
});

test('all forms have complete positional content and resolvable provenance', () => {
  const sourceIds = new Set(egraCatalog.sources.map(s => s.id));
  const totals = { letters: 0, words: 0, questions: 0 };
  assert.equal(new Set(egraCatalog.assessments.map(a => a.id)).size, 13);
  for (const a of egraCatalog.assessments) {
    for (const section of ['letters', 'words']) {
      const grid = a[section];
      assert.equal(grid.items.length % grid.columns, 0);
      grid.items.forEach((item, i) => {
        assert.equal(item.id, String(i + 1));
        assert.ok(item.text.trim());
      });
      totals[section] += grid.items.length;
    }
    assert.equal(a.comprehension.questions.length, 5);
    a.comprehension.questions.forEach((q, i) => {
      assert.equal(q.id, String(i + 1));
      assert.ok(q.text.trim() && q.answerText.trim());
    });
    totals.questions += a.comprehension.questions.length;
    assert.ok(a.passage.text.trim());
    for (const section of ['letters', 'words', 'passage', 'comprehension']) {
      assert.ok(sourceIds.has(a[section].source.sourceId));
      assert.ok(a[section].source.pdfPages.every(p => Number.isInteger(p) && p > 0));
    }
  }
  assert.deepEqual(totals, { letters: 920, words: 990, questions: 65 });
  assert.equal(getEgraAssessment('dbe-egra-af-hl-2-v1').letters.items.length, 70);
  assert.equal(getEgraAssessment('dbe-egra-en-fal-2-v1').words.items.length, 60);
});
