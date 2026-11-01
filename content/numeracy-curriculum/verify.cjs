'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { CURRENT_EDITION, getCurriculum, getStep, listStepKeys } = require('./index');

test('the bundled edition is 2026.1-draft with ten skills and 37 steps in curriculum order', () => {
  const c = getCurriculum();
  assert.equal(CURRENT_EDITION, '2026.1-draft');
  assert.equal(c.edition, CURRENT_EDITION);
  assert.equal(getCurriculum(), c);
  assert.deepEqual(c.skills.map(s => s.key), ['finger_flash', 'count', 'read_numbers', 'compare',
    'before_after', 'add', 'subtract', 'number_pairs', 'count_aloud', 'skip_count']);
  const keys = listStepKeys(c);
  assert.equal(keys.length, 37);
  assert.deepEqual(keys.slice(0, 5), ['finger_flash.5', 'finger_flash.10', 'count.5', 'count.10', 'count.20']);
  assert.deepEqual(keys.slice(-3), ['skip_count.2s', 'skip_count.5s', 'skip_count.10s']);
});

test('each skill carries its EA label, row hint, group and slot', () => {
  assert.deepEqual(getCurriculum().skills.map(s => [s.key, s.label, s.hint, s.group, s.slot]), [
    ['finger_flash', 'Finger flash', 'up to…', 'main', 'warm_up'],
    ['count', 'Count objects', 'up to…', 'main', 'activity'],
    ['read_numbers', 'Read numbers', 'up to…', 'main', 'activity'],
    ['compare', 'Compare', 'up to…', 'main', 'activity'],
    ['before_after', 'Before & after', 'up to…', 'main', 'activity'],
    ['add', 'Add', 'totals to…', 'main', 'activity'],
    ['subtract', 'Take away', 'within…', 'main', 'activity'],
    ['number_pairs', 'Number pairs', 'that make…', 'main', 'activity'],
    ['count_aloud', 'Count aloud', 'to…', 'counting', 'warm_up'],
    ['skip_count', 'Skip count', 'in…', 'counting', 'warm_up'],
  ]);
});

test('getStep finds a step with its skill, size, label and order', () => {
  const c = getCurriculum();
  const add10 = getStep(c, 'add.10');
  assert.deepEqual([add10.key, add10.skill, add10.label, add10.size], ['add.10', 'add', 'up to 10', 10]);
  assert.deepEqual(add10.comes_after, ['add.5', 'count.10']);
  assert.deepEqual([getStep(c, 'skip_count.5s').size, getStep(c, 'skip_count.5s').label], [50, '5s to 50']);
  assert.equal(getStep(c, 'number_pairs.10').label, 'pairs that make 10');
  assert.equal(getStep(c, 'add.5').tick_when.ask[0], '2 + 3');
});

test('getStep never normalises or falls back', () => {
  const c = getCurriculum();
  for (const key of ['add.7', 'ADD.10', ' add.10', 'add', 'skip_count.5', '', undefined, null]) {
    assert.equal(getStep(c, key), null, String(key));
  }
  const other = { edition: 'x', skills: [{ key: 'k', steps: [{ key: 'k.1' }] }] };
  assert.equal(getStep(other, 'k.1').key, 'k.1');
  assert.deepEqual(listStepKeys(other), ['k.1']);
});

test('content is deep-frozen for every reader', () => {
  const c = getCurriculum();
  assert.throws(() => { getStep(c, 'add.5').tick_when.ask[0] = '9 + 9'; }, TypeError);
  assert.throws(() => { getStep(c, 'add.5').activities.push({}); }, TypeError);
  assert.throws(() => { c.skills.pop(); }, TypeError);
  assert.throws(() => { listStepKeys(c).push('x.1'); }, TypeError);
  assert.equal(getStep(getCurriculum(), 'add.5').tick_when.ask[0], '2 + 3');
});
