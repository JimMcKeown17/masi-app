'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readdirSync, readFileSync, writeFileSync, mkdtempSync } = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const { createHash } = require('node:crypto');
const { CURRENT_EDITION, getCurriculum, getStep, listStepKeys } = require('./index');


const SKILLS = [
  { key: 'finger_flash', group: 'main', slot: 'warm_up' },
  { key: 'count', group: 'main', slot: 'activity' },
  { key: 'read_numbers', group: 'main', slot: 'activity' },
  { key: 'compare', group: 'main', slot: 'activity' },
  { key: 'before_after', group: 'main', slot: 'activity' },
  { key: 'add', group: 'main', slot: 'activity' },
  { key: 'subtract', group: 'main', slot: 'activity' },
  { key: 'number_pairs', group: 'main', slot: 'activity' },
  { key: 'count_aloud', group: 'counting', slot: 'warm_up' },
  { key: 'skip_count', group: 'counting', slot: 'warm_up' },
];
const FROZEN_EDITIONS = Object.freeze({});
const ORDER_OVERRIDES = Object.freeze({});
const BANNED_WORDS = [/\bcount(?:ing)?[\s-]+on\b/i, /\bcount(?:ing)?[\s-]+all\b/i, /\bsubiti[sz]\w*/i, /\bnumber[\s-]+bonds?\b/i,
  /\brungs?\b/i, /\bladders?\b/i, /\bbands?\b/i, /\bstrateg\w*/i];

const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const fieldsOf = value => isObject(value) ? value : {};
const itemsOf = value => Array.isArray(value) ? value : [];
const ownerOf = (value, fallback) => typeof value === 'string' && value.trim() ? value : fallback;
const location = (owner, path) => path ? `${owner} ${path}` : owner;

function checkCurriculum(curriculum, { orderOverrides = ORDER_OVERRIDES } = {}) {
  return [...checkStructure(curriculum), ...checkPlainWords(curriculum),
    ...checkOrder(curriculum, orderOverrides), ...checkTicks(curriculum)];
}

function expectedComesAfter(curriculum, rawStep) {
  const step = fieldsOf(rawStep);
  const skills = itemsOf(fieldsOf(curriculum).skills).map(fieldsOf);
  const skill = skills.find(s => s.key === step.skill);
  if (!skill || !Number.isInteger(step.size) || step.size <= 0) return [];
  const steps = itemsOf(skill.steps).map(fieldsOf);
  const index = steps.findIndex(s => s.key === step.key);
  const prev = index > 0 ? steps[index - 1] : null;
  const expected = prev && typeof prev.key === 'string' ? [prev.key] : [];
  const N = step.size;
  if (['add', 'subtract', 'compare', 'number_pairs'].includes(step.skill)) {
    const count = skills.find(s => s.key === 'count');
    const c = itemsOf(count?.steps).map(fieldsOf)
      .filter(s => Number.isInteger(s.size) && s.size >= N && typeof s.key === 'string')
      .sort((a, b) => a.size - b.size)[0];
    if (c) expected.push(c.key);
    if (N > 20) expected.push(`read_numbers.${N}`);
  }
  if (step.skill === 'before_after') expected.push(`read_numbers.${N}`);
  if (step.skill === 'subtract' || step.skill === 'number_pairs') expected.push(`add.${N}`);
  if (step.key === 'number_pairs.5') expected.push('finger_flash.5');
  if (step.skill === 'skip_count') expected.push(`count_aloud.${N}`);
  return expected;
}

function applyOrderOverride(expected, override) {
  const { add, remove } = fieldsOf(override);
  return [...new Set([...itemsOf(expected), ...itemsOf(add)])]
    .filter(key => typeof key === 'string' && !itemsOf(remove).includes(key));
}

function checkOrder(curriculum, overrides) {
  const errors = [];
  const steps = itemsOf(fieldsOf(curriculum).skills)
    .flatMap(skill => itemsOf(fieldsOf(skill).steps)).map(fieldsOf)
    .filter(step => typeof step.key === 'string');
  const byKey = new Map(steps.map(step => [step.key, step]));
  const arrows = step => itemsOf(step.comes_after).filter(key => typeof key === 'string');
  for (const step of steps) {
    if (!Array.isArray(step.comes_after)) continue;
    const actual = new Set(arrows(step));
    const expected = new Set(applyOrderOverride(expectedComesAfter(curriculum, step),
      fieldsOf(overrides)[step.key]));
    for (const key of actual) {
      if (!byKey.has(key)) errors.push(`${step.key} comes_after: "${key}" is not a step`);
      if (!expected.has(key)) errors.push(`${step.key} comes_after: unexpected "${key}"`);
    }
    for (const key of expected) {
      if (!actual.has(key)) errors.push(`${step.key} comes_after: missing "${key}"`);
    }
  }
  const visited = new Set();
  const active = new Set();
  const path = [];
  function visit(key) {
    if (active.has(key)) {
      errors.push(`curriculum comes_after: loop: ${[...path.slice(path.indexOf(key)), key].join(' → ')}`);
      return;
    }
    if (visited.has(key) || !byKey.has(key)) return;
    active.add(key);
    path.push(key);
    for (const next of arrows(byKey.get(key))) visit(next);
    path.pop();
    active.delete(key);
    visited.add(key);
  }
  for (const key of byKey.keys()) visit(key);
  const starts = ['finger_flash.5', 'count.5', 'read_numbers.5', 'count_aloud.10'];
  const actualStarts = new Set(steps.filter(s => Array.isArray(s.comes_after) && s.comes_after.length === 0)
    .map(s => s.key));
  if (actualStarts.size !== starts.length || starts.some(key => !actualStarts.has(key))) {
    errors.push(`curriculum comes_after: starting steps must be exactly ${starts.join(', ')}`);
  }
  return errors;
}

function checkTicks(curriculum) {
  const errors = [];
  for (const rawSkill of itemsOf(fieldsOf(curriculum).skills)) {
    for (const rawStep of itemsOf(fieldsOf(rawSkill).steps)) {
      const step = fieldsOf(rawStep);
      if (typeof step.key !== 'string' || !Number.isInteger(step.size) || step.size <= 0) continue;
      const tick = fieldsOf(step.tick_when);
      const asks = itemsOf(tick.ask);
      const answers = itemsOf(tick.expected);
      for (let i = 0; i < Math.max(asks.length, answers.length); i++) {
        const ask = asks[i];
        const answer = answers[i];
        const report = message => errors.push(`${step.key} tick item ${i + 1}: ${message}`);
        for (const text of [ask, answer]) {
          if (typeof text !== 'string') continue;
          for (const n of text.match(/\d+/g) || []) {
            if (Number(n) > step.size) report(`${n} is bigger than ${step.size}`);
          }
        }
        if (typeof ask !== 'string' || typeof answer !== 'string') continue;
        const x = answer.match(/^\d+(?=\s|$)/)?.[0];
        if (['add', 'subtract', 'number_pairs'].includes(step.skill) && x === undefined) {
          report('expected answer must start with a whole number');
          continue;
        }
        if (step.skill === 'add') {
          const match = ask.match(/(?<![\d.,-])(\d+)(?![\d.,-])\s*\+\s*(?<![\d.,-])(\d+)(?![\d.,-])/);
          if (!match) report('can\'t find a sum like "2 + 3"');
          else {
            const [, a, b] = match.map(Number);
            if (x === undefined || Number(x) !== a + b) report(`${a} + ${b} is ${a + b}, not ${x}`);
          }
        }
        if (step.skill === 'subtract') {
          const match = ask.match(/(?<![\d.,-])(\d+)(?![\d.,-])\s+take away\s+(?<![\d.,-])(\d+)(?![\d.,-])/);
          if (!match) report('can\'t find a sum like "5 take away 2"');
          else {
            const [, a, b] = match.map(Number);
            if (x === undefined || Number(x) !== a - b) report(`${a} take away ${b} is ${a - b}, not ${x}`);
          }
        }
        if (step.skill === 'number_pairs') {
          const match = ask.match(/I have (?<![\d.,-])(\d+)(?![\d,-]|\.\d)[\s\S]*?\bsee (?<![\d.,-])(\d+)(?![\d,-]|\.\d)/i);
          if (!match) report('can\'t find "I have 5. You see 2."');
          else {
            const [, total, seen] = match.map(Number);
            if (total !== step.size) report(`must make ${step.size}`);
            if (x === undefined || Number(x) !== total - seen) {
              report(`${total} with ${seen} seen leaves ${total - seen}, not ${x}`);
            }
          }
        }
      }
    }
  }
  return errors;
}

function checkStructure(curriculum) {
  const errors = [];
  const report = (owner, path, problem) => errors.push(`${location(owner, path)}: ${problem}`);
  function object(value, keys, owner, path = '') {
    if (!isObject(value)) report(owner, path, 'must be an object');
    const fields = fieldsOf(value);
    for (const key of Object.keys(fields)) {
      if (!keys.includes(key)) report(owner, path, `unknown field "${key}"`);
    }
    for (const key of keys) {
      if (!Object.hasOwn(fields, key)) report(owner, path, `${key} is missing`);
    }
    return fields;
  }
  function text(value, owner, path) {
    if (typeof value !== 'string') report(owner, path, 'must be a string');
    else {
      if (value.length === 0) report(owner, path, 'is empty');
      if (value !== value.trim()) report(owner, path, 'starts or ends with a space');
    }
  }
  function strings(value, owner, path, length) {
    if (!Array.isArray(value)) report(owner, path, 'must be an array of strings');
    if (length !== undefined && (!Array.isArray(value) || value.length !== length)) {
      report(owner, path, `needs exactly ${length}`);
    }
    // Visit holes too: an absent item is not a string.
    for (let i = 0; i < itemsOf(value).length; i++) text(value[i], owner, `${path}[${i}]`);
  }

  const c = object(curriculum, ['edition', 'skills'], 'curriculum');
  text(c.edition, 'curriculum', 'edition');
  if (typeof c.edition !== 'string' || !/^\d{4}\.\d+(-draft)?$/.test(c.edition)) {
    report('curriculum', 'edition', 'must match YYYY.number with an optional -draft suffix');
  }
  if (!Array.isArray(c.skills)) report('curriculum', 'skills', 'must be an array');
  if (itemsOf(c.skills).length !== SKILLS.length) report('curriculum', 'skills', 'must contain the ten skills in curriculum order');
  const seenKeys = new Set();
  for (const [i, rawSkill] of itemsOf(c.skills).entries()) {
    const skillOwner = ownerOf(fieldsOf(rawSkill).key, `curriculum.skills[${i}]`);
    const skill = object(rawSkill, ['key', 'label', 'hint', 'group', 'slot', 'steps'], skillOwner);
    for (const field of ['key', 'label', 'hint', 'group', 'slot']) text(skill[field], skillOwner, field);
    const expected = SKILLS[i];
    for (const field of ['key', 'group', 'slot']) {
      if (!expected || skill[field] !== expected[field]) {
        report(skillOwner, field, `must be ${expected ? JSON.stringify(expected[field]) : 'one of the ten skills in curriculum order'}`);
      }
    }
    if (!Array.isArray(skill.steps)) report(skillOwner, 'steps', 'must be an array');
    if (Array.isArray(skill.steps) && skill.steps.length === 0) report(skillOwner, 'steps', 'must not be empty');
    let previousSize = 0;
    for (const [j, rawStep] of itemsOf(skill.steps).entries()) {
      const owner = ownerOf(fieldsOf(rawStep).key, `${skillOwner}.steps[${j}]`);
      const step = object(rawStep, ['key', 'skill', 'label', 'size', 'goal', 'activities',
        'tick_when', 'comes_after', 'note_for_partner'], owner);
      for (const field of ['key', 'skill', 'label', 'goal', 'note_for_partner']) text(step[field], owner, field);
      if (step.skill !== skill.key) report(owner, 'skill', 'must equal the containing skill key');
      if (typeof step.key !== 'string' || !/^[a-z_]+\.[0-9a-z]+$/.test(step.key)) {
        report(owner, 'key', 'must match <skill>.<size>');
      }
      if (typeof step.key === 'string') {
        if (seenKeys.has(step.key)) report(owner, 'key', 'appears more than once');
        seenKeys.add(step.key);
      }
      if (typeof step.size !== 'number') report(owner, 'size', 'must be a number');
      else if (!Number.isInteger(step.size) || step.size <= 0) report(owner, 'size', 'must be a positive integer');
      else {
        if (step.size <= previousSize) report(skillOwner, 'steps', 'steps are not in size order');
        previousSize = step.size;
        if (typeof skill.key === 'string') {
          const suffix = skill.key === 'skip_count' ? `${step.size / 10}s` : step.size;
          if (step.key !== `${skill.key}.${suffix}`) report(owner, 'key', 'key does not match its size');
          if (skill.key === 'skip_count' && ![20, 50, 100].includes(step.size)) {
            report(owner, 'size', 'skip count size must be 20, 50 or 100');
          }
        }
      }
      strings(step.comes_after, owner, 'comes_after');
      if (!Array.isArray(step.activities)) report(owner, 'activities', 'must be an array');
      const activities = itemsOf(step.activities);
      if (![2, 3].includes(activities.length)) report(owner, 'activities', 'needs 2 or 3 activities');
      const names = new Set();
      for (const [a, rawActivity] of activities.entries()) {
        const path = `activities[${a}]`;
        const activity = object(rawActivity, ['name', 'minutes', 'how', 'needs', 'source', 'source_ref'], owner, path);
        for (const field of ['name', 'needs', 'source', 'source_ref']) text(activity[field], owner, `${path}.${field}`);
        if (!Number.isInteger(activity.minutes) || activity.minutes < 4 || activity.minutes > 8) {
          report(owner, `${path}.minutes`, 'minutes must be a whole number from 4 to 8');
        }
        strings(activity.how, owner, `${path}.how`);
        if (Array.isArray(activity.how) && activity.how.length === 0) report(owner, `${path}.how`, 'must not be empty');
        if (!['partner', 'adapted', 'new'].includes(activity.source)) report(owner, `${path}.source`, 'must be partner, adapted or new');
        if (typeof activity.name === 'string') {
          if (names.has(activity.name)) report(owner, `${path}.name`, `activity name "${activity.name}" is used twice`);
          names.add(activity.name);
        }
      }
      if (skill.slot === 'warm_up' && !activities.some(a => {
        const minutes = fieldsOf(a).minutes;
        return Number.isInteger(minutes) && minutes >= 4 && minutes <= 5;
      })) report(owner, 'activities', 'warm-up step needs an activity of 5 minutes or less');
      const tick = object(step.tick_when, ['setup', 'ask', 'expected', 'rule'], owner, 'tick_when');
      text(tick.setup, owner, 'tick_when.setup');
      strings(tick.ask, owner, 'tick_when.ask', 3);
      strings(tick.expected, owner, 'tick_when.expected', 3);
      text(tick.rule, owner, 'tick_when.rule');
      if (tick.rule !== 'All 3 right? Tick it.') report(owner, 'tick_when.rule', 'rule must be "All 3 right? Tick it."');
    }
  }
  return errors;
}

function checkPlainWords(curriculum) {
  const errors = [];
  function scan(value, owner, path) {
    if (typeof value !== 'string') return;
    for (const pattern of BANNED_WORDS) {
      const match = value.match(pattern);
      if (match) errors.push(`${location(owner, path)}: uses the banned word "${match[0]}"`);
    }
  }
  function scanArray(value, owner, path) {
    itemsOf(value).forEach((text, i) => scan(text, owner, `${path}[${i}]`));
  }
  for (const [i, rawSkill] of itemsOf(fieldsOf(curriculum).skills).entries()) {
    const skill = fieldsOf(rawSkill);
    const skillOwner = ownerOf(skill.key, `curriculum.skills[${i}]`);
    for (const field of ['label', 'hint']) scan(skill[field], skillOwner, field);
    for (const [j, rawStep] of itemsOf(skill.steps).entries()) {
      const step = fieldsOf(rawStep);
      const owner = ownerOf(step.key, `${skillOwner}.steps[${j}]`);
      for (const field of ['label', 'goal']) scan(step[field], owner, field);
      itemsOf(step.activities).forEach((rawActivity, a) => {
        const activity = fieldsOf(rawActivity);
        for (const field of ['name', 'needs']) scan(activity[field], owner, `activities[${a}].${field}`);
        scanArray(activity.how, owner, `activities[${a}].how`);
      });
      const tick = fieldsOf(step.tick_when);
      for (const field of ['setup', 'rule']) scan(tick[field], owner, `tick_when.${field}`);
      for (const field of ['ask', 'expected']) scanArray(tick[field], owner, `tick_when.${field}`);
    }
  }
  return errors;
}

function checkEditionFiles(dir, frozen) {
  const errors = [];
  const files = readdirSync(dir).filter(f => /^curriculum-.*\.json$/.test(f));
  for (const file of files) {
    const body = readFileSync(join(dir, file));
    let edition;
    try {
      edition = fieldsOf(JSON.parse(body.toString('utf8'))).edition;
    } catch {
      errors.push(`curriculum ${file}: is not valid JSON`);
      continue;
    }
    if (typeof edition !== 'string' || file !== `curriculum-${edition}.json`) {
      errors.push(`curriculum ${file}: file name does not match edition`);
    }
    if (typeof edition !== 'string') continue;
    if (!edition.endsWith('-draft') && !Object.hasOwn(frozen, edition)) {
      errors.push(`curriculum ${file}: frozen edition ${edition} is not pinned`);
    }
    if (Object.hasOwn(frozen, edition) && createHash('sha256').update(body).digest('hex') !== frozen[edition]) {
      errors.push(`curriculum ${file}: edition ${edition} changed after it was frozen`);
    }
  }
  for (const edition of Object.keys(frozen)) {
    if (!files.includes(`curriculum-${edition}.json`)) errors.push(`curriculum editions: pinned edition ${edition} has no file`);
  }
  return errors;
}

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
  assert.deepEqual(sorted(add10.comes_after),
    sorted(applyOrderOverride(expectedComesAfter(c, add10), ORDER_OVERRIDES['add.10'])));
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

function broken(mutate, options) {
  const c = structuredClone(getCurriculum()); mutate(c); return checkCurriculum(c, options);
}

test('every bundled edition passes every check', () => {
  const files = readdirSync(__dirname).filter(f => /^curriculum-.*\.json$/.test(f));
  assert.ok(files.includes(`curriculum-${CURRENT_EDITION}.json`));
  for (const f of files) {
    const errors = checkCurriculum(JSON.parse(readFileSync(join(__dirname, f), 'utf8')));
    assert.equal(errors.length, 0, `${f}:\n${errors.join('\n')}`);
  }
  assert.deepEqual(checkEditionFiles(__dirname, FROZEN_EDITIONS), []);
});

test('editions: file names match, and a frozen edition is pinned by hash', () => {
  const dir = mkdtempSync(join(tmpdir(), 'numeracy-'));
  const body = JSON.stringify({ ...structuredClone(getCurriculum()), edition: '2026.1' });
  writeFileSync(join(dir, 'curriculum-2026.1.json'), body);
  assert.match(checkEditionFiles(dir, {}).join('\n'), /frozen edition 2026\.1 is not pinned/);
  assert.match(checkEditionFiles(dir, { '2026.1': '0'.repeat(64) }).join('\n'), /edition 2026\.1 changed after it was frozen/);
  const sha = createHash('sha256').update(body).digest('hex');
  assert.deepEqual(checkEditionFiles(dir, { '2026.1': sha }), []);
  assert.match(checkEditionFiles(dir, { '2026.1': sha, '2027.1': sha }).join('\n'), /pinned edition 2027\.1 has no file/);
  writeFileSync(join(dir, 'curriculum-2026.2.json'), body);
  assert.match(checkEditionFiles(dir, { '2026.1': sha }).join('\n'), /file name does not match edition/);
});

test('structure: a broken key, size order, slot or field name is caught without throwing', () => {
  assert.match(broken(c => { c.skills[5].steps[1].key = 'add.5'; }).join('\n'), /add\.5.*appears more than once/);
  assert.match(broken(c => { const s = c.skills[5].steps; [s[1], s[2]] = [s[2], s[1]]; }).join('\n'), /add.*steps are not in size order/);
  assert.match(broken(c => { c.skills[5].steps[1].size = 11; }).join('\n'), /add\.10.*key does not match its size/);
  assert.match(broken(c => { c.skills[1].slot = 'warm_up'; }).join('\n'), /count.*slot/);
  const typo = broken(c => { const t = c.skills[5].steps[1]; t.tick_When = t.tick_when; delete t.tick_when; }).join('\n');
  assert.match(typo, /add\.10.*unknown field "tick_When"/);
  assert.match(typo, /add\.10.*tick_when is missing/);
  assert.match(broken(c => { c.skills[5].steps[1].activities[0].minutes = '5'; }).join('\n'), /add\.10.*minutes must be a whole number from 4 to 8/);
  assert.doesNotThrow(() => broken(c => { delete c.skills[5].steps[1].tick_when; delete c.skills[5].steps[2].activities; c.skills[6].steps = null; }));
  assert.ok(broken(c => { c.skills[6].steps = null; }).length > 0);
});

test('activities: 2 to 3 per step, 4 to 8 minutes, unique names, a short one for warm-ups', () => {
  assert.match(broken(c => { c.skills[5].steps[1].activities[0].minutes = 3; }).join('\n'), /add\.10.*from 4 to 8/);
  assert.match(broken(c => { c.skills[5].steps[1].activities[0].minutes = 9; }).join('\n'), /add\.10.*from 4 to 8/);
  assert.match(broken(c => { c.skills[5].steps[1].activities.length = 1; }).join('\n'), /add\.10.*needs 2 or 3 activities/);
  assert.match(broken(c => { const a = c.skills[5].steps[1].activities; a.push(a[0], a[1]); }).join('\n'), /add\.10.*needs 2 or 3 activities/);
  assert.match(broken(c => { const a = c.skills[5].steps[1].activities; a[1].name = a[0].name; }).join('\n'), /add\.10.*activity name ".+" is used twice/);
  assert.match(broken(c => { c.skills[0].steps[0].activities.forEach(a => { a.minutes = 6; }); }).join('\n'), /finger_flash\.5.*warm-up step needs an activity of 5 minutes or less/);
  assert.match(broken(c => { c.skills[9].steps[0].activities.forEach(a => { a.minutes = 6; }); }).join('\n'), /skip_count\.2s.*warm-up step/);
  assert.doesNotMatch(broken(c => { c.skills[3].steps[0].activities.forEach(a => { a.minutes = 6; }); }).join('\n'), /warm-up step/);
});

test('tick when: exactly three items with answers and the fixed rule', () => {
  assert.match(broken(c => { c.skills[5].steps[0].tick_when.ask.length = 2; }).join('\n'), /add\.5.*ask.*needs exactly 3/);
  assert.match(broken(c => { c.skills[5].steps[0].tick_when.expected.push('6'); }).join('\n'), /add\.5.*expected.*needs exactly 3/);
  assert.match(broken(c => { c.skills[5].steps[0].tick_when.rule = 'Tick it.'; }).join('\n'), /add\.5.*rule must be "All 3 right\? Tick it\."/);
});

test('text: no empty or space-padded strings', () => {
  assert.match(broken(c => { c.skills[5].steps[1].goal = ''; }).join('\n'), /add\.10 goal: is empty/);
  assert.match(broken(c => { c.skills[5].steps[1].label = 'up to 10 '; }).join('\n'), /add\.10 label: starts or ends with a space/);
  assert.match(broken(c => { c.skills[5].steps[1].activities[0].how[0] = '  Hide'; }).join('\n'), /add\.10 activities\[0\]\.how\[0\]: starts or ends with a space/);
  assert.match(broken(c => { c.skills[5].hint = ''; }).join('\n'), /add hint: is empty/);
});

test('plain words: banned words are caught in every EA-facing field, whatever the case', () => {
  const cases = [
    [c => { c.skills[5].label = 'Strategies'; }, /add label: uses the banned word "Strategies"/],
    [c => { c.skills[5].hint = 'BANDS'; }, /add hint: uses the banned word "BANDS"/],
    [c => { c.skills[5].steps[1].label = 'Counting On'; }, /add\.10 label: uses the banned word "Counting On"/],
    [c => { c.skills[5].steps[1].goal = 'Children start subitising.'; }, /add\.10 goal: uses the banned word "subitising"/],
    [c => { c.skills[5].steps[1].activities[0].name = 'Number bonds'; }, /activities\[0\]\.name: uses the banned word "Number bonds"/],
    [c => { c.skills[5].steps[1].activities[0].how[1] = 'Pick a strategy.'; }, /activities\[0\]\.how\[1\]: uses the banned word "strategy"/],
    [c => { c.skills[5].steps[1].activities[0].needs = 'A ladder'; }, /activities\[0\]\.needs: uses the banned word "ladder"/],
    [c => { c.skills[5].steps[1].tick_when.setup = 'They count all of them.'; }, /tick_when\.setup: uses the banned word "count all"/],
    [c => { c.skills[5].steps[1].tick_when.ask[0] = 'Subitize 3 + 2'; }, /tick_when\.ask\[0\]: uses the banned word "Subitize"/],
    [c => { c.skills[5].steps[1].tick_when.expected[0] = '8, rung 2'; }, /tick_when\.expected\[0\]: uses the banned word "rung"/],
  ];
  for (const [mutate, pattern] of cases) assert.match(broken(mutate).join('\n'), pattern);
});

test('plain words: banned phrases are caught across any spacing or a hyphen', () => {
  for (const phrase of ['count on', 'counting on', 'count all', 'counting all', 'number bond', 'number bonds']) {
    for (const separator of ['\u00a0', '  ', '\t', '\n', '-']) {
      const text = phrase.replace(' ', separator);
      const errors = broken(c => { getStep(c, 'add.10').goal = `Children use ${text} today.`; });
      assert.ok(errors.includes(`add.10 goal: uses the banned word "${text}"`), JSON.stringify(text));
    }
  }
});

test('plain words: ordinary words that contain a banned word, and partner notes, are allowed', () => {
  const errors = broken(c => {
    const t = c.skills[5].steps[1];
    t.goal = 'Her husband brought a bandage. Do not abandon the game. Count to 10.';
    t.note_for_partner = 'Use a rubber band. Which strategy do you teach?';
    t.activities[0].source_ref = 'band W1';
  });
  assert.equal(errors.filter(e => /banned/.test(e)).length, 0, errors.join('\n'));
});

const sorted = a => [...a].sort();
const step = key => getStep(getCurriculum(), key);

test('order: the expected arrows follow the four rules', () => {
  const c = getCurriculum();
  const cases = {
    'finger_flash.5': [], 'read_numbers.20': ['read_numbers.10'], 'add.10': ['add.5', 'count.10'],
    'add.15': ['add.10', 'count.20'], 'compare.50': ['compare.20', 'read_numbers.50'],
    'before_after.5': ['read_numbers.5'], 'subtract.15': ['add.15', 'count.20', 'subtract.10'],
    'number_pairs.5': ['add.5', 'count.5', 'finger_flash.5'], 'skip_count.2s': ['count_aloud.20'],
    'skip_count.10s': ['count_aloud.100', 'skip_count.5s'],
  };
  for (const [key, want] of Object.entries(cases)) assert.deepEqual(sorted(expectedComesAfter(c, step(key))), sorted(want), key);
  // the bundled content is checked WITH its declared overrides applied, so an accepted partner change passes
  for (const key of listStepKeys(c)) assert.deepEqual(sorted(step(key).comes_after), sorted(applyOrderOverride(expectedComesAfter(c, step(key)), ORDER_OVERRIDES[key])), key);
});

test('order: a missing or extra arrow is caught unless an override records it', () => {
  const drop = c => { c.skills[5].steps[1].comes_after = ['add.5']; };
  assert.match(broken(drop, { orderOverrides: {} }).join('\n'), /add\.10.*missing "count\.10"/);
  assert.match(broken(c => { c.skills[5].steps[1].comes_after.push('compare.5'); }, { orderOverrides: {} }).join('\n'), /add\.10.*unexpected "compare\.5"/);
  const c = structuredClone(getCurriculum()); drop(c);
  assert.deepEqual(checkCurriculum(c, { orderOverrides: { 'add.10': { remove: ['count.10'] } } }), []);
});

test('order: the documented partner edit (JSON change plus override entry) passes every content check', () => {
  const clone = structuredClone(getCurriculum());
  getStep(clone, 'add.10').comes_after = ['add.5'];
  const overrides = { 'add.10': { remove: ['count.10'] } };
  assert.deepEqual(checkCurriculum(clone, { orderOverrides: overrides }), []);
  for (const key of listStepKeys(clone)) {
    const step = getStep(clone, key);
    assert.deepEqual(sorted(step.comes_after),
      sorted(applyOrderOverride(expectedComesAfter(clone, step), overrides[key])), key);
  }
  const other = getStep(clone, 'subtract.10');
  other.comes_after = other.comes_after.filter(key => key !== 'count.10');
  assert.match(checkCurriculum(clone, { orderOverrides: overrides }).join('\n'),
    /subtract\.10.*missing "count\.10"/);
});

test('order: an unknown key or a loop is caught', () => {
  assert.match(broken(c => { c.skills[5].steps[1].comes_after.push('add.7'); }, { orderOverrides: {} }).join('\n'), /add\.10.*"add\.7" is not a step/);
  const c = structuredClone(getCurriculum());
  c.skills[5].steps[0].comes_after.push('add.10');
  assert.match(checkCurriculum(c, { orderOverrides: { 'add.5': { add: ['add.10'] } } }).join('\n'), /loop: .*add\.5.*add\.10/);
});

test('order: exactly the four starting steps', () => {
  const c = getCurriculum();
  assert.deepEqual(listStepKeys(c).filter(k => step(k).comes_after.length === 0),
    ['finger_flash.5', 'count.5', 'read_numbers.5', 'count_aloud.10']);
  const fifth = structuredClone(c); fifth.skills[3].steps[0].comes_after = [];
  assert.match(checkCurriculum(fifth, { orderOverrides: { 'compare.5': { remove: ['count.5'] } } }).join('\n'),
    /starting steps must be exactly finger_flash\.5, count\.5, read_numbers\.5, count_aloud\.10/);
});

test('ticks: the sums are checked for add, take away and number pairs', () => {
  assert.match(broken(c => { c.skills[5].steps[1].tick_when.expected[1] = '11'; }).join('\n'), /add\.10 tick item 2: 6 \+ 4 is 10, not 11/);
  assert.match(broken(c => { c.skills[6].steps[0].tick_when.expected[0] = '4'; }).join('\n'), /subtract\.5 tick item 1: 5 take away 2 is 3, not 4/);
  assert.match(broken(c => { c.skills[7].steps[1].tick_when.expected[2] = '7'; }).join('\n'), /number_pairs\.10 tick item 3: 10 with 2 seen leaves 8, not 7/);
  assert.match(broken(c => { c.skills[7].steps[1].tick_when.ask[0] = 'I have 5. You see 3. How many are under the paper?'; }).join('\n'), /number_pairs\.10 tick item 1: must make 10/);
  assert.match(broken(c => { c.skills[5].steps[0].tick_when.ask[0] = 'two plus three'; }).join('\n'), /add\.5 tick item 1: can't find a sum like "2 \+ 3"/);
});

test('ticks: decimals, signs and glued digits are not read as whole numbers', () => {
  for (const [key, ask, answer] of [
    ['add.5', '2 + 3', '5'],
    ['subtract.5', '5 take away 0', '5'],
    ['number_pairs.5', 'I have 5. You see 0. How many are hidden?', '5'],
  ]) {
    for (const malformed of ['5.1', '-5', '5,1', 'about 5']) {
      const errors = broken(c => {
        const tick = getStep(c, key).tick_when;
        tick.ask[0] = ask; tick.expected[0] = malformed;
      });
      assert.ok(errors.includes(`${key} tick item 1: expected answer must start with a whole number`),
        `${key}: ${malformed}: ${errors.join('\n')}`);
    }
    assert.deepEqual(broken(c => {
      const tick = getStep(c, key).tick_when;
      tick.ask[0] = ask; tick.expected[0] = `${answer} (five)`;
    }), []);
  }
  const cases = [
    ['add.5', '1.2 + 3', '5', 'can\'t find a sum like "2 + 3"'],
    ['add.5', '-2 + 3', '5', 'can\'t find a sum like "2 + 3"'],
    ['add.5', '2 + 3.5', '5', 'can\'t find a sum like "2 + 3"'],
    ['add.5', '1,2 + 3', '5', 'can\'t find a sum like "2 + 3"'],
    ['subtract.5', '5 take away 2.5', '3', 'can\'t find a sum like "5 take away 2"'],
    ['subtract.5', '-5 take away 2', '3', 'can\'t find a sum like "5 take away 2"'],
    ['number_pairs.10', 'I have 10. You see 2.5. How many are hidden?', '8', 'can\'t find "I have 5. You see 2."'],
  ];
  for (const [key, ask, answer, message] of cases) {
    const errors = broken(c => {
      const tick = getStep(c, key).tick_when;
      tick.ask[0] = ask; tick.expected[0] = answer;
    });
    assert.ok(errors.includes(`${key} tick item 1: ${message}`), `${ask}: ${errors.join('\n')}`);
  }
  assert.ok(broken(c => {
    const tick = getStep(c, 'number_pairs.5').tick_when;
    tick.ask[0] = 'I have 5. You see 1. How many are hidden?'; tick.expected[0] = '-4';
  }).includes('number_pairs.5 tick item 1: expected answer must start with a whole number'));
});

test('ticks: every number in a tick item is within the step size', () => {
  assert.match(broken(c => { const t = c.skills[5].steps[0].tick_when; t.ask[2] = '4 + 3'; t.expected[2] = '7'; }).join('\n'), /add\.5 tick item 3: 7 is bigger than 5/);
  assert.match(broken(c => { c.skills[2].steps[2].tick_when.ask[0] = 'Card 21'; }).join('\n'), /read_numbers\.20 tick item 1: 21 is bigger than 20/);
});

const { renderCurriculumMarkdown, readableDocPath } = require('./render.cjs');

test('the readable doc for the partner matches the JSON', () => {
  const onDisk = readFileSync(readableDocPath(CURRENT_EDITION), 'utf8');
  assert.equal(onDisk, renderCurriculumMarkdown(getCurriculum()),
    'docs/numeracy is out of date: run npm run content:numeracy-doc');
});

test('the readable doc path drops the -draft suffix and changes with the content', () => {
  assert.ok(readableDocPath('2026.1-draft').endsWith(join('docs', 'numeracy', 'curriculum-draft-2026.1.md')));
  assert.ok(readableDocPath('2026.2').endsWith(join('docs', 'numeracy', 'curriculum-draft-2026.2.md')));
  const c = structuredClone(getCurriculum()); c.skills[5].steps[1].goal = 'Children add up to 10.';
  assert.match(renderCurriculumMarkdown(c), /### Add · up to 10\n\n\*\*Goal:\*\* Children add up to 10\.\n/);
});
