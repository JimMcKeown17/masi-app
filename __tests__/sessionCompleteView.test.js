import {
  buildReceiptRows,
  buildSessionCompleteParams,
  CELEBRATION_LEVELS,
  deriveSessionCompleteView,
  describeCapturedPill,
  HEADLINES,
} from '../src/utils/sessionCompleteView';
import { resolveTeachingOrder } from '../src/utils/letterOrders';
import { deriveGoalState } from '../src/utils/sessionGoal';
import { colors } from '../src/constants/colors';

const now = new Date('2026-10-13T10:00:00+02:00');
const params = {
  childCount: 2,
  childNames: ['Anelisa', 'Athenkosi'],
  letters: ['m', 'l', 'n', 's'],
  readingLevel: '3 Letter Blends',
  sessionDate: '2026-10-13',
};
const goal = (count, target = 3, ceiling = 5) => ({
  count, target, ceiling, state: deriveGoalState({ target, ceiling, count }),
});
const view = (g, over = {}) => deriveSessionCompleteView({
  goal: g, goalStatus: 'ready', params, now, motionLevel: 'full', ...over,
});

describe('gating table', () => {
  test.each([
    ['exact target today', goal(3), {}, { headline: HEADLINES.reached, showSub: false, mode: 'animated', earned: colors.red500, flip: true, confetti: true, headlineMotion: 'target' }],
    ['met above target today', goal(4), {}, { headline: HEADLINES.reached, showSub: false, mode: 'animated', earned: null, flip: false, confetti: false, headlineMotion: 'other' }],
    ['below today (2/3)', goal(2), {}, { headline: HEADLINES.captured, showSub: true, mode: 'animated', earned: colors.ringStart, flip: true, confetti: false, headlineMotion: 'other' }],
    ['first today (1/3)', goal(1), {}, { headline: HEADLINES.captured, showSub: true, mode: 'animated', earned: colors.ringStart, flip: false, confetti: false, headlineMotion: 'other' }],
    ['exceeded at ceiling + 1 (6, ceiling 5)', goal(6), {}, { headline: HEADLINES.captured, showSub: true, mode: 'animated', earned: null, flip: true, confetti: false, headlineMotion: 'other' }],
    ['exceeded beyond ceiling + 1 (7)', goal(7), {}, { headline: HEADLINES.captured, showSub: true, mode: 'animated', earned: null, flip: false, confetti: false, headlineMotion: 'other' }],
    ['back-dated met', goal(3), { params: { ...params, sessionDate: '2026-10-12' } }, { headline: HEADLINES.captured, showSub: true, mode: 'static', earned: null, flip: false, confetti: false, headlineMotion: 'other' }],
    ['missing sessionDate', goal(3), { params: { ...params, sessionDate: undefined } }, { headline: HEADLINES.captured, showSub: true, mode: 'static', earned: null, flip: false, confetti: false, headlineMotion: 'other' }],
    ['no target today', { count: 2, target: null, ceiling: null, state: 'no_target' }, {}, { headline: HEADLINES.captured, showSub: true, mode: 'animated', earned: null, flip: false, confetti: false, headlineMotion: 'other' }],
    ['defensive count 0 today', goal(0), {}, { headline: HEADLINES.captured, showSub: true, mode: 'static', earned: null, flip: false, confetti: false, headlineMotion: 'other' }],
    ['Yeboneer 1/1 sweeps straight in green', goal(1, 1, 1), {}, { headline: HEADLINES.reached, showSub: false, mode: 'animated', earned: colors.success, flip: false, confetti: true, headlineMotion: 'target' }],
    ['numeracy 5/5', goal(5, 5, 5), {}, { headline: HEADLINES.reached, showSub: false, mode: 'animated', earned: colors.red500, flip: true, confetti: true, headlineMotion: 'target' }],
    ['target 7 continuous slice (4/7)', goal(4, 7, 7), {}, { headline: HEADLINES.captured, showSub: true, mode: 'animated', earned: colors.red500, flip: false, confetti: false, headlineMotion: 'other' }],
  ])('%s', (_name, g, over, expected) => {
    const v = view(g, over);
    expect(v.headline).toBe(expected.headline);
    expect(v.card.showSub).toBe(expected.showSub);
    expect(v.gauge.mode).toBe(expected.mode);
    expect(v.gauge.earned ? v.gauge.earned.color : null).toBe(expected.earned);
    expect(v.gauge.flip).toBe(expected.flip);
    expect(v.confetti).toBe(expected.confetti);
    expect(v.headlineMotion).toBe(expected.headlineMotion);
    expect(v.card.kind).toBe('goal');
    expect(v.card.goal).toEqual(g);
    expect(v.pill).toEqual(describeCapturedPill(over.params || params, { isToday: v.isToday }));
    expect(v.receipt).toEqual(buildReceiptRows(params));
    if (expected.mode === 'static') {
      expect(v.gauge.fromGoal).toBeNull();
      expect(v.card.fromCopy).toBeNull();
    }
  });
});

test('headlines keep the exact two-line copy', () => {
  expect(HEADLINES).toEqual({ captured: 'Session\ncaptured.', reached: 'Daily target\nreached.' });
});

test('4/7 from layer keeps 3 of 7 and the earned slice exists', () => {
  const v = view(goal(4, 7, 7));
  expect(v.gauge.fromGoal).toEqual({ count: 3, target: 7, ceiling: 7, state: 'below' });
  expect(v.gauge.earned).toEqual({ color: colors.red500 });
  expect(v.card.fromCopy).toEqual({ title: '3 of 7 sessions today', subtitle: '4 more pairs reach your target.' });
});

test('5 → 6 drops the suffix', () => {
  expect(view(goal(6)).gauge.fromGoal.state).toBe('met');
  expect(view(goal(6)).card.goal.state).toBe('exceeded');
});

test('count − 1 === 0 leaves the old sub-line blank', () => {
  expect(view(goal(1)).card.fromCopy).toEqual({ title: 'No sessions yet today', subtitle: '' });
});

test.each([
  { goal: null, goalStatus: 'ready' },
  { goal: null, goalStatus: 'failed' },
  { goal: goal(3), goalStatus: 'failed' },
])('goal null and failed give no card, no gauge, captured headline: %o', (over) => {
  expect(view(null, over)).toEqual(expect.objectContaining({
    card: null,
    gauge: null,
    confetti: false,
    headline: HEADLINES.captured,
    announcement: 'Session captured. Saved for 2 children.',
  }));
});

test.each([null, goal(3)])('loading shows the skeleton and no announcement: %o', (g) => {
  expect(view(g, { goalStatus: 'loading' })).toEqual(expect.objectContaining({
    card: { kind: 'skeleton' },
    gauge: null,
    confetti: false,
    announcement: null,
    headline: HEADLINES.captured,
  }));
});

test('still and calm levels', () => {
  const still = view(goal(3), { motionLevel: 'still' });
  expect(still.celebrate).toBe(false);
  expect(still.gauge).toEqual({ mode: 'static', fromGoal: null, earned: null, flip: false });
  expect(still.card.fromCopy).toBeNull();
  expect(still.confetti).toBe(false);
  expect(still.headlineMotion).toBe('still');
  expect(still.headline).toBe(HEADLINES.reached);
  expect(view(goal(3), { motionLevel: 'calm' })).toEqual(expect.objectContaining({ celebrate: true, confetti: true }));
  expect(CELEBRATION_LEVELS).toEqual(['full', 'calm']);
});

test('a session saved before midnight does not celebrate after it', () => {
  const v = view(goal(0), {
    params: { ...params, sessionDate: '2026-10-18' },
    now: new Date('2026-10-19T00:00:30+02:00'),
  });
  expect(v.isToday).toBe(false);
  expect(v.gauge.mode).toBe('static');
  expect(v.confetti).toBe(false);
  expect(v.headline).toBe(HEADLINES.captured);
  expect(v.pill.text).toBe('Saved for 2 children · Sun 18 Oct');
});

test('isToday uses the Johannesburg day under Auckland', () => {
  const originalTimeZone = process.env.TZ;
  try {
    process.env.TZ = 'Pacific/Auckland';
    const v = view(goal(3), {
      params: { ...params, sessionDate: '2026-10-18' },
      now: new Date('2026-10-18T12:00:00.000Z'),
    });
    expect(v.isToday).toBe(true);
  } finally {
    if (originalTimeZone === undefined) delete process.env.TZ;
    else process.env.TZ = originalTimeZone;
  }
});

describe('announcements', () => {
  test('met today', () => {
    expect(view(goal(3)).announcement).toBe('Session captured. Saved for 2 children. 3 of 3 sessions today. Daily target reached.');
  });
  test('below today', () => {
    expect(view(goal(2)).announcement).toBe('Session captured. Saved for 2 children. 2 of 3 sessions today. One more pair reaches your target.');
  });
  test('back-dated', () => {
    expect(view(goal(3), { now: new Date('2026-10-14T09:00:00+02:00') }).announcement)
      .toBe('Session captured. Saved for 2 children, for Tuesday 13 October. 3 of 3 sessions today. Daily target reached.');
  });
  test('fallback pill has no doubled full stop', () => {
    expect(view(goal(2), { params: { ...params, childCount: undefined } }).announcement)
      .toBe('Session captured. Nice work — it’s saved. 2 of 3 sessions today. One more pair reaches your target.');
  });
  test('zero sessions uses signed-in copy', () => {
    expect(view(goal(0)).announcement)
      .toBe('Session captured. Saved for 2 children. No sessions yet today. Record your first session.');
  });
});

describe('captured pill', () => {
  test('one child today', () => {
    expect(describeCapturedPill({ childCount: 1, sessionDate: '2026-10-13' }, { isToday: true }))
      .toEqual({ text: 'Saved for 1 child', spoken: 'Saved for 1 child' });
  });
  test('back-dated date uses the long spoken form', () => {
    expect(describeCapturedPill({ childCount: 2, sessionDate: '2026-10-13' }, { isToday: false }))
      .toEqual({ text: 'Saved for 2 children · Tue 13 Oct', spoken: 'Saved for 2 children, for Tuesday 13 October' });
  });
  test('missing date does not add a suffix', () => {
    expect(describeCapturedPill({ childCount: 2 }, { isToday: false }))
      .toEqual({ text: 'Saved for 2 children', spoken: 'Saved for 2 children' });
  });
  test.each([undefined, null, 0, -1, '2'])('fallback for nonpositive or missing numeric count %p', (childCount) => {
    expect(describeCapturedPill({ childCount }, { isToday: true }))
      .toEqual({ text: 'Nice work — it’s saved.', spoken: 'Nice work — it’s saved' });
  });
});

describe('receipt', () => {
  test('children, supplied letters and reading level have spoken labels', () => {
    expect(buildReceiptRows({ childNames: ['Anelisa', 'Athenkosi'], letters: ['s', 'm', 'n', 'l'], readingLevel: '3 Letter Blends' }))
      .toEqual([
        { key: 'children', label: 'Children', value: 'Anelisa & Athenkosi', accessibilityLabel: 'Children: Anelisa and Athenkosi' },
        { key: 'letters', label: 'Letters', value: ['s', 'm', 'n', 'l'], accessibilityLabel: 'Letters: S, M, N, L' },
        { key: 'readingLevel', label: 'Reading level', value: '3 Letter Blends', accessibilityLabel: 'Reading level: 3 Letter Blends' },
      ]);
  });
  test('omits absent and empty rows', () => {
    expect(buildReceiptRows({ childNames: [], letters: undefined, readingLevel: null })).toEqual([]);
    expect(buildReceiptRows({ childNames: [], letters: [], readingLevel: '' })).toEqual([]);
  });
  test('only letters gives one row', () => {
    expect(buildReceiptRows({ letters: ['s', 'm'] })).toEqual([
      { key: 'letters', label: 'Letters', value: ['s', 'm'], accessibilityLabel: 'Letters: S, M' },
    ]);
  });
});

test('route params come from what the form already holds', () => {
  expect(buildSessionCompleteParams({
    selectedChildren: [{ id: 'c1', first_name: 'Anelisa' }, { id: 'c2', first_name: '' }, { id: 'c3' }],
    selectedLetters: ['s', 'm', 'n', 'l'],
    sessionReadingLevel: '3 Letter Blends',
    sessionDateKey: '2026-10-13',
    teachingOrder: resolveTeachingOrder('2026-10-23', 'en').letters,
  })).toEqual({
    childCount: 3,
    childNames: ['Anelisa', 'Child', 'Child'],
    letters: ['s', 'n', 'l', 'm'],
    readingLevel: '3 Letter Blends',
    sessionDate: '2026-10-13',
  });
  expect(buildReceiptRows({ childNames: ['Child', 'Child'] })[0].value).toBe('Child & Child');
});

test('sorting leaves the selections unchanged and keeps unknown letters last in input order', () => {
  const selectedChildren = Object.freeze([
    Object.freeze({ id: 'c1', first_name: 'Amahle' }),
    Object.freeze({ id: 'c2', first_name: 'Amahle' }),
  ]);
  const selectedLetters = Object.freeze(['?', 's', 'm', '!', 'l', 'm']);
  const result = buildSessionCompleteParams({
    selectedChildren, selectedLetters, sessionReadingLevel: 'Cannot blend', sessionDateKey: '2026-10-13',
    teachingOrder: resolveTeachingOrder('2026-10-23', 'en').letters,
  });
  expect(result.letters).toEqual(['s', 'l', 'm', 'm', '?', '!']);
  expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  const rows = buildReceiptRows({ childNames: result.childNames, letters: result.letters });
  expect(rows[0].value).toBe('Amahle & Amahle');
  expect(rows[1].value).toEqual(result.letters);
  expect(selectedLetters).toEqual(['?', 's', 'm', '!', 'l', 'm']);
});


test.each([
  ['en', ['d', 's', 'n', 'a'], ['s', 'a', 'n', 'd']],
  ['xh', ['a', 'o'], ['o', 'a']],
])('receipt params follow the %s class order', (code, selectedLetters, expected) => {
  const params = buildSessionCompleteParams({
    selectedChildren: [], selectedLetters, sessionReadingLevel: null, sessionDateKey: '2026-10-13',
    teachingOrder: resolveTeachingOrder('2026-10-23', code).letters,
  });
  expect(params.letters).toEqual(expected);
  expect(buildReceiptRows(params)[0].value).toEqual(expected);
});

test('receipt params with no teaching order keep selection order', () => {
  const selectedLetters = Object.freeze(['d', 's', 'n', 'a']);
  const params = buildSessionCompleteParams({
    selectedChildren: [], selectedLetters, sessionReadingLevel: null, sessionDateKey: '2026-10-13',
    teachingOrder: null,
  });
  expect(params.letters).toEqual(['d', 's', 'n', 'a']);
  expect(params.letters).not.toBe(selectedLetters);
  expect(buildReceiptRows(params)[0]).toEqual({
    key: 'letters', label: 'Letters', value: ['d', 's', 'n', 'a'], accessibilityLabel: 'Letters: D, S, N, A',
  });
});
