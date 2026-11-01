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
const BANNED_WORDS = [/\bcount(?:ing)? on\b/i, /\bcount(?:ing)? all\b/i, /\bsubiti[sz]\w*/i, /\bnumber bonds?\b/i,
  /\brungs?\b/i, /\bladders?\b/i, /\bbands?\b/i, /\bstrateg\w*/i];

const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const fieldsOf = value => isObject(value) ? value : {};
const itemsOf = value => Array.isArray(value) ? value : [];
const ownerOf = (value, fallback) => typeof value === 'string' && value.trim() ? value : fallback;
const location = (owner, path) => path ? `${owner} ${path}` : owner;

function checkCurriculum(curriculum, options = {}) {
  return [...checkStructure(curriculum), ...checkPlainWords(curriculum)];
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

function broken(mutate) {
  const c = structuredClone(getCurriculum()); mutate(c); return checkCurriculum(c);
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

test('plain words: ordinary words that contain a banned word, and partner notes, are allowed', () => {
  const errors = broken(c => {
    const t = c.skills[5].steps[1];
    t.goal = 'Her husband brought a bandage. Do not abandon the game. Count to 10.';
    t.note_for_partner = 'Use a rubber band. Which strategy do you teach?';
    t.activities[0].source_ref = 'band W1';
  });
  assert.equal(errors.filter(e => /banned/.test(e)).length, 0, errors.join('\n'));
});
