import {
  deriveSyncState,
  describeReconcileBreakerNote,
  describeSyncState,
  describeWaitingDetail,
} from '../src/utils/syncStatusPresenter';
import { colors } from '../src/constants/colors';

describe('deriveSyncState priority', () => {
  const base = { isOnline: true, isSyncing: false, waitingCount: 0, needsAttentionCount: 0 };

  test('all quiet reads synced', () => {
    expect(deriveSyncState(base)).toBe('synced');
  });

  test('waiting items read waiting', () => {
    expect(deriveSyncState({ ...base, waitingCount: 3 })).toBe('waiting');
  });

  test('offline with waiting items reads offline', () => {
    expect(deriveSyncState({ ...base, isOnline: false, waitingCount: 3 })).toBe('offline');
  });

  test('terminal items read needs_attention', () => {
    expect(deriveSyncState({ ...base, needsAttentionCount: 1 })).toBe('needs_attention');
  });

  test('syncing wins over everything', () => {
    expect(deriveSyncState({ ...base, isSyncing: true, waitingCount: 5, needsAttentionCount: 2 })).toBe('syncing');
  });

  test('terminal wins over waiting (never hidden behind a calm state)', () => {
    expect(deriveSyncState({ ...base, waitingCount: 5, needsAttentionCount: 1 })).toBe('needs_attention');
  });

  test('terminal surfaces even offline', () => {
    expect(deriveSyncState({ ...base, isOnline: false, waitingCount: 2, needsAttentionCount: 1 })).toBe('needs_attention');
  });

  test('offline with a drained outbox is synced, not a problem', () => {
    expect(deriveSyncState({ ...base, isOnline: false })).toBe('synced');
  });

  test('undefined counts are treated as zero', () => {
    expect(deriveSyncState({ isOnline: true, isSyncing: false })).toBe('synced');
  });
});

describe('describeSyncState copy (the trust voice is the deliverable; exact strings)', () => {
  test('synced', () => {
    expect(describeSyncState('synced', {})).toEqual({
      icon: 'checkmark-circle-outline',
      color: colors.success,
      backgroundColor: colors.success + '20',
      message: 'All saved and synced',
      badgeCount: 0,
      accessibilityLabel: 'All saved and synced',
    });
  });

  test('waiting plural', () => {
    expect(describeSyncState('waiting', { waitingCount: 3 })).toEqual({
      icon: 'cloud-upload-outline',
      color: colors.info,
      backgroundColor: colors.info + '20',
      message: 'Saved on your phone · 3 waiting to sync',
      badgeCount: 3,
      accessibilityLabel: 'Saved on your phone. 3 items waiting to sync',
    });
  });

  test('waiting singular', () => {
    const view = describeSyncState('waiting', { waitingCount: 1 });
    expect(view.message).toBe('Saved on your phone · 1 waiting to sync');
    expect(view.accessibilityLabel).toBe('Saved on your phone. 1 item waiting to sync');
  });

  test('offline keeps the reassurance and the calm palette', () => {
    const view = describeSyncState('offline', { waitingCount: 2 });
    expect(view.message).toBe("Saved on your phone · 2 will sync when you're online");
    expect(view.accessibilityLabel).toBe("Saved on your phone. 2 items will sync when you're online");
    expect(view.icon).toBe('cloud-offline-outline');
    expect(view.color).toBe(colors.info);
    expect(view.badgeCount).toBe(2);
  });

  test('needs_attention plural is amber and actionable', () => {
    expect(describeSyncState('needs_attention', { needsAttentionCount: 2 })).toEqual({
      icon: 'alert-circle-outline',
      color: colors.warning,
      backgroundColor: colors.warning + '20',
      message: '2 items need attention',
      badgeCount: 2,
      accessibilityLabel: '2 items need attention',
    });
  });

  test('needs_attention singular', () => {
    expect(describeSyncState('needs_attention', { needsAttentionCount: 1 }).message).toBe('1 item needs attention');
  });

  test('badge shows the actionable count, not the waiting count, in needs_attention', () => {
    expect(describeSyncState('needs_attention', { waitingCount: 9, needsAttentionCount: 2 }).badgeCount).toBe(2);
  });

  test('syncing', () => {
    const view = describeSyncState('syncing', {});
    expect(view.message).toBe('Syncing…');
    expect(view.icon).toBeNull();
    expect(view.badgeCount).toBe(0);
    expect(view.accessibilityLabel).toBe('Syncing');
  });
});

describe('describeWaitingDetail', () => {
  test('null when nothing is waiting', () => {
    expect(describeWaitingDetail({ waitingCount: 0 })).toBeNull();
  });

  test('count-only line with no retry hint when nothing is backed off', () => {
    expect(describeWaitingDetail({ waitingCount: 3 })).toEqual({
      title: '3 items saved on your phone, waiting to sync',
      detail: null,
    });
  });

  test('singular title', () => {
    expect(describeWaitingDetail({ waitingCount: 1 }).title).toBe('1 item saved on your phone, waiting to sync');
  });

  test('backed-off rows add the next-attempt hint', () => {
    const nextRetryAt = '2026-07-10T12:30:00.000Z';
    // Locale-proof: compute the expected rendering with the same formatter.
    const expected = new Date(nextRetryAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    expect(describeWaitingDetail({ waitingCount: 2, backedOffCount: 1, nextRetryAt }).detail)
      .toBe(`Next attempt around ${expected}`);
  });

  test('a backed-off count without a timestamp yields no hint', () => {
    expect(describeWaitingDetail({ waitingCount: 2, backedOffCount: 1, nextRetryAt: null }).detail).toBeNull();
  });
});

describe('describeReconcileBreakerNote copy (exact strings)', () => {
  test('a persisted breaker note becomes an actionable Head Office card', () => {
    expect(describeReconcileBreakerNote({ scope: 'childEaAssignments' })).toEqual({
      scope: 'childEaAssignments',
      title: 'Large roster change from Head Office is waiting',
      actionLabel: 'Apply',
      accessibilityLabel: 'Large roster change from Head Office is waiting. Apply',
    });
  });
});
