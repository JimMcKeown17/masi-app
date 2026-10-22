// __tests__/homeAttention.test.js
import fs from 'fs';
import path from 'path';
import { deriveHomeAttentionItems, lessonInProgressFromDraft, MAX_ATTENTION_ITEMS } from '../src/utils/homeAttention';

const NOW = new Date('2026-10-15T08:00:00.000Z'); // Thu 15 Oct, 10:00 SAST

const notice = (overrides = {}) => ({
  entryId: 'time-1',
  userId: 'user-1',
  signInTime: '2026-10-14T05:30:00.000Z', // Wed in SAST
  detectedAt: '2026-10-15T06:00:00.000Z',
  dismissedAt: null,
  ...overrides,
});

const base = {
  needsAttentionCount: 0,
  autoClockOut: null,
  coverage: { assessed: 12, total: 12 },
  assessmentDismissedOn: null,
  now: NOW,
};

const lesson = { draftId: 'draft-1', childNames: ['Amahle', 'Lulu'] };

test('a lesson in progress comes first and offers Resume', () => {
  expect(deriveHomeAttentionItems({ ...base, lessonInProgress: lesson })).toEqual([{
    key: 'lesson_in_progress:draft-1', kind: 'lesson_in_progress', tone: 'neutral',
    title: 'Lesson in progress', subtitle: 'Amahle & Lulu · Resume',
    accessibilityLabel: 'Lesson in progress with Amahle and Lulu. Resume',
    route: 'Lesson', params: { draftId: 'draft-1' }, dismissible: false,
  }]);
});
test('the lesson card stays inside the two-item cap and pushes lower items out', () => {
  expect(deriveHomeAttentionItems({ ...base, lessonInProgress: lesson, needsAttentionCount: 2,
    autoClockOut: notice(), coverage: { assessed: 11, total: 12 } }).map((i) => i.kind))
    .toEqual(['lesson_in_progress', 'sync_attention']);
});
test('three names, or none known, still read naturally', () => {
  const [three] = deriveHomeAttentionItems({ ...base, lessonInProgress: { draftId: 'd', childNames: ['Amahle', 'Lulu', 'Sipho'] } });
  expect(three.subtitle).toBe('Amahle, Lulu & Sipho · Resume');
  const [none] = deriveHomeAttentionItems({ ...base, lessonInProgress: { draftId: 'd', childNames: [] } });
  expect(none).toMatchObject({ subtitle: 'Resume', accessibilityLabel: 'Lesson in progress. Resume' });
});
test('lessonInProgressFromDraft names the present children this phone knows', () => {
  const draft = { id: 'draft-1', attendance: { childIds: ['c1', 'c2', 'c3'], absentChildIds: ['c2'], addedChildIds: [] } };
  const children = [{ id: 'c1', first_name: 'Amahle' }, { id: 'c2', first_name: 'Lulu' }];
  expect(lessonInProgressFromDraft(draft, children)).toEqual({ draftId: 'draft-1', childNames: ['Amahle'] });
  expect(lessonInProgressFromDraft({ ...draft, attendance: { childIds: ['c2'], absentChildIds: ['c2'], addedChildIds: [] } }, children))
    .toEqual({ draftId: 'draft-1', childNames: [] }); // everyone absent: still a lesson in progress
  expect(lessonInProgressFromDraft(null, children)).toBeNull();
});
test('Home does not read lesson drafts until the Lesson route ships', () => {
  const home = fs.readFileSync(path.join(__dirname, '../src/screens/main/HomeScreen.js'), 'utf8');
  expect(home).not.toMatch(/lessonDrafts|lessonInProgress/); // C3 removes this test when it registers Lesson
});

describe('deriveHomeAttentionItems', () => {
  test('a normal day has no items', () => {
    expect(deriveHomeAttentionItems(base)).toEqual([]);
  });

  test('sync attention uses the generic count wording and ignores transport state', () => {
    expect(deriveHomeAttentionItems({ ...base, needsAttentionCount: 1 })[0]).toEqual(expect.objectContaining({
      kind: 'sync_attention',
      tone: 'warning',
      title: '1 item needs attention',
      subtitle: 'Open sync status to sort it out',
      accessibilityLabel: '1 item needs attention. Open sync status to sort it out',
      route: 'SyncStatus',
      dismissible: false,
    }));
    expect(deriveHomeAttentionItems({ ...base, needsAttentionCount: 3 })[0].title).toBe('3 items need attention');
  });

  test('auto clock-out shows the weekday, or Today, and expires after 24 hours', () => {
    const [wed] = deriveHomeAttentionItems({ ...base, autoClockOut: notice() });
    expect(wed).toEqual(expect.objectContaining({
      kind: 'auto_clock_out',
      tone: 'warning',
      title: 'Clocked out after 10 hours',
      subtitle: 'Automatic · Wed · check hours',
      route: 'TimeEntriesList',
      dismissible: true,
      entryId: 'time-1',
    }));

    const [today] = deriveHomeAttentionItems({
      ...base,
      autoClockOut: notice({ signInTime: '2026-10-15T04:00:00.000Z' }),
    });
    expect(today.subtitle).toBe('Automatic · Today · check hours');

    const justInside = new Date(Date.parse('2026-10-15T06:00:00.000Z') + 24 * 3600 * 1000 - 1);
    const atExpiry = new Date(Date.parse('2026-10-15T06:00:00.000Z') + 24 * 3600 * 1000);
    expect(deriveHomeAttentionItems({ ...base, autoClockOut: notice(), now: justInside })).toHaveLength(1);
    expect(deriveHomeAttentionItems({ ...base, autoClockOut: notice(), now: atExpiry })).toEqual([]);
  });

  test('a dismissed auto clock-out notice does not show', () => {
    expect(deriveHomeAttentionItems({
      ...base,
      autoClockOut: notice({ dismissedAt: '2026-10-15T07:00:00.000Z' }),
    })).toEqual([]);
  });

  test('assessment due: plurals, the sub-line, and per-day dismissal', () => {
    const [one] = deriveHomeAttentionItems({ ...base, coverage: { assessed: 11, total: 12 } });
    expect(one).toEqual(expect.objectContaining({
      kind: 'assessment_due',
      tone: 'neutral',
      title: '1 child to assess',
      subtitle: '11 of 12 children assessed',
      route: 'Assessments',
      dismissible: true,
    }));
    expect(deriveHomeAttentionItems({ ...base, coverage: { assessed: 9, total: 12 } })[0].title)
      .toBe('3 children to assess');
    expect(deriveHomeAttentionItems({
      ...base, coverage: { assessed: 11, total: 12 }, assessmentDismissedOn: '2026-10-15',
    })).toEqual([]);
    expect(deriveHomeAttentionItems({
      ...base, coverage: { assessed: 11, total: 12 }, assessmentDismissedOn: '2026-10-14',
    })).toHaveLength(1);
  });

  test('no assessment card while coverage is loading or the roster is empty', () => {
    expect(deriveHomeAttentionItems({ ...base, coverage: null })).toEqual([]);
    expect(deriveHomeAttentionItems({ ...base, coverage: { assessed: 0, total: 0 } })).toEqual([]);
  });

  test('priority order and the two-item cap', () => {
    const items = deriveHomeAttentionItems({
      ...base,
      needsAttentionCount: 2,
      autoClockOut: notice(),
      coverage: { assessed: 11, total: 12 },
    });
    expect(MAX_ATTENTION_ITEMS).toBe(2);
    expect(items.map((item) => item.kind)).toEqual(['sync_attention', 'auto_clock_out']);
  });
});
