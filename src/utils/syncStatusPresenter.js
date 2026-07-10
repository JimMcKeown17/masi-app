import { colors } from '../constants/colors';

// Sync-status trust presenter (ZZ Finding 6). The state machine AND the field-facing copy
// live here so every surface (Home banner, header indicator, sync screen) tells the same
// story: locally-saved work is safe ("Saved on your phone"), a retriable backlog is calm,
// and only terminal failures read as actionable. Palette note: this theme has no blue;
// "calm" is colors.info (muted) and "actionable" is colors.warning (amber). Do not use
// colors.primary/colors.emphasis here (both are brand red).

export const deriveSyncState = ({
  isOnline,
  isSyncing,
  waitingCount = 0,
  needsAttentionCount = 0,
} = {}) => {
  if (isSyncing) return 'syncing';
  if (needsAttentionCount > 0) return 'needs_attention';
  if (!isOnline && waitingCount > 0) return 'offline';
  if (waitingCount > 0) return 'waiting';
  return 'synced';
};

const plural = (count, singular, pluralForm) => (count === 1 ? singular : pluralForm);

export const describeSyncState = (state, { waitingCount = 0, needsAttentionCount = 0 } = {}) => {
  switch (state) {
    case 'syncing':
      return {
        icon: null,
        color: colors.primary,
        backgroundColor: colors.info + '20',
        message: 'Syncing…',
        badgeCount: 0,
        accessibilityLabel: 'Syncing',
      };
    case 'needs_attention': {
      const message = `${needsAttentionCount} ${plural(needsAttentionCount, 'item needs', 'items need')} attention`;
      return {
        icon: 'alert-circle-outline',
        color: colors.warning,
        backgroundColor: colors.warning + '20',
        message,
        badgeCount: needsAttentionCount,
        accessibilityLabel: message,
      };
    }
    case 'offline':
      return {
        icon: 'cloud-offline-outline',
        color: colors.info,
        backgroundColor: colors.info + '20',
        message: `Saved on your phone · ${waitingCount} will sync when you're online`,
        badgeCount: waitingCount,
        accessibilityLabel: `Saved on your phone. ${waitingCount} ${plural(waitingCount, 'item', 'items')} will sync when you're online`,
      };
    case 'waiting':
      return {
        icon: 'cloud-upload-outline',
        color: colors.info,
        backgroundColor: colors.info + '20',
        message: `Saved on your phone · ${waitingCount} waiting to sync`,
        badgeCount: waitingCount,
        accessibilityLabel: `Saved on your phone. ${waitingCount} ${plural(waitingCount, 'item', 'items')} waiting to sync`,
      };
    case 'synced':
    default:
      return {
        icon: 'checkmark-circle-outline',
        color: colors.success,
        backgroundColor: colors.success + '20',
        message: 'All saved and synced',
        badgeCount: 0,
        accessibilityLabel: 'All saved and synced',
      };
  }
};

export const describeWaitingDetail = ({ waitingCount = 0, backedOffCount = 0, nextRetryAt = null } = {}) => {
  if (waitingCount <= 0) return null;
  const title = `${waitingCount} ${plural(waitingCount, 'item', 'items')} saved on your phone, waiting to sync`;
  let detail = null;
  if (backedOffCount > 0 && nextRetryAt) {
    const time = new Date(nextRetryAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    detail = `Next attempt around ${time}`;
  }
  return { title, detail };
};
