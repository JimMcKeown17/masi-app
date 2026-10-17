// __tests__/homeAttention.test.js
import { deriveHomeAttentionItems, MAX_ATTENTION_ITEMS } from '../src/utils/homeAttention';

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
