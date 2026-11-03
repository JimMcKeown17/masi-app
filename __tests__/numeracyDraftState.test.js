import { newNumeracyDraftInput, taughtCards, swapCard, freezeForWrapUp, setStepChanges, clearChildStepChanges } from '../src/numeracyLesson/numeracyDraftState';
import { toggleStepChange, toggleChipChange, assertStepChanges } from '../src/numeracyLesson/trackerChanges';

const nowIso = '2026-11-01T10:00:00.000Z';
const cards = [
  { slot: 'warm_up', step_key: 'finger_flash.5', activity: 'Flash', readyCount: 2 },
  { slot: 'activity', step_key: 'count.5', activity: 'Count' },
  { slot: 'activity', step_key: 'add.5', activity: 'Add' },
];
const plan = { cards };
const input = () => newNumeracyDraftInput({ group: { id: 'g', programme_id: 'wrong' }, members: [{ id: 'c1' }, { id: 'c1' }, { id: 'c2' }], programmeId: 'maths', lessonDate: '2026-11-01' });
const options = { plan, nowIso };
const replacement = { step_key: 'add.10', activity: 'More' };
const simpleCards = cards.map(({ slot, step_key, activity }) => ({ slot, step_key, activity }));
test('a new numeracy draft input has the numeracy shape', () => {
  expect(input()).toEqual({ kind: 'numeracy', programme_id: 'maths', group_id: 'g', class_id: null, language_code: null, pack_id: null, lesson_date: '2026-11-01', attendance: { childIds: ['c1', 'c2'], absentChildIds: [], addedChildIds: [] }, plan: null, plan_fixed_at: null, ticks: { taught: null }, tracker_changes: {}, reading_level_changes: {}, notes: null });
  expect(taughtCards(input())).toEqual([]);
});
test('the first swap freezes the plan and replaces only that card', () => {
  const draft = input();
  const patch = swapCard(draft, 1, replacement, options);
  expect(patch).toEqual({ plan, plan_fixed_at: nowIso, ticks: { taught: [simpleCards[0], { slot: 'activity', ...replacement }, simpleCards[2]] } });
  expect(draft).toEqual(input());
});
test('a later swap keeps the first freeze time', () => {
  const draft = { ...input(), ...swapCard(input(), 1, replacement, options) };
  const patch = swapCard(draft, 2, replacement, { plan: { cards: [] }, nowIso: 'later' });
  expect(patch).not.toHaveProperty('plan'); expect(patch).not.toHaveProperty('plan_fixed_at');
  expect(taughtCards({ ...draft, ...patch })[0]).toEqual(simpleCards[0]);
  const frozenWithoutTaught = { ...draft, ticks: { taught: null } };
  expect(swapCard(frozenWithoutTaught, 1, replacement, { plan: { cards: [] } }).ticks.taught).toHaveLength(3);
});
test('wrap up freezes and fixes taught from the plan', () => {
  const patch = freezeForWrapUp(input(), options);
  expect(patch).toEqual({ plan, plan_fixed_at: nowIso, ticks: { taught: simpleCards } });
  const frozen = { ...input(), ...patch };
  expect({ ...frozen, ...freezeForWrapUp(frozen, { plan: { cards: [] }, nowIso: 'later' }) }).toEqual(frozen);
});
test('chips only add; the sheet adds and removes', () => {
  const pending = {};
  expect(toggleChipChange({ known: true, pending, stepKey: 'add.5', nowIso })).toBe(pending);
  const removed = toggleStepChange({ storedConfirmed: true, pending, stepKey: 'add.5', nowIso });
  expect(removed).toEqual({ 'add.5': { mastered: false, madeAt: nowIso } });
  expect(toggleStepChange({ storedConfirmed: true, pending: removed, stepKey: 'add.5', nowIso })).toEqual({});
});
test('swapCard appends at index === length', () => {
  expect(swapCard(input(), 0, replacement, { plan: { cards: [] }, nowIso }).ticks.taught).toEqual([{ slot: 'activity', ...replacement }]);
});
test('newNumeracyDraftInput uses programmeId even when group.programme_id differs', () => { expect(input().programme_id).toBe('maths'); });
test('toggleChipChange removes pending and adds an unknown step', () => {
  const pending = { 'add.5': { mastered: false, madeAt: nowIso } };
  expect(toggleChipChange({ known: false, pending, stepKey: 'add.5', nowIso })).toEqual({});
  expect(toggleChipChange({ known: false, pending: {}, stepKey: 'add.5', nowIso })).toEqual({ 'add.5': { mastered: true, madeAt: nowIso } });
  expect(pending['add.5']).toEqual({ mastered: false, madeAt: nowIso });
});
test('toggleStepChange preserves locked changes and cancels a new tick', () => {
  const pending = {};
  expect(toggleStepChange({ locked: true, pending, stepKey: 'add.5', nowIso })).toBe(pending);
  const added = toggleStepChange({ storedConfirmed: false, pending, stepKey: 'add.5', nowIso });
  expect(added).toEqual({ 'add.5': { mastered: true, madeAt: nowIso } });
  expect(toggleStepChange({ storedConfirmed: false, pending: added, stepKey: 'add.5', nowIso })).toEqual({});
});
test('setStepChanges replaces maps and an empty map removes the child', () => {
  const draft = { ...input(), tracker_changes: { c1: { old: true }, c2: { kept: true } } };
  expect(setStepChanges(draft, 'c1', { 'add.5': { mastered: true, madeAt: nowIso } }).tracker_changes.c1).not.toHaveProperty('old');
  for (const changes of [{}, null]) expect(setStepChanges(draft, 'c1', changes)).toEqual({ tracker_changes: { c2: { kept: true } } });
  expect(clearChildStepChanges(draft, 'c1')).toEqual({ tracker_changes: { c2: { kept: true } } });
});
test('assertStepChanges rejects bad shapes and accepts a retired key', () => {
  expect(() => assertStepChanges({ c1: { 'add.30': { mastered: true, madeAt: nowIso } } })).not.toThrow();
  for (const changes of [{ 'Add.5': { mastered: true, madeAt: nowIso } }, { 'add.5': true }, { 'add.5': { mastered: 'yes', madeAt: nowIso } }, { 'add.5': { mastered: true, madeAt: 'bad' } }, { 'add.5': null }, null, []]) {
    let error; try { assertStepChanges({ c1: changes }); } catch (caught) { error = caught; }
    expect(error?.code).toBe('TRACKER_CHANGE_INVALID');
  }
});
