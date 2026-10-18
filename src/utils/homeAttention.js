// src/utils/homeAttention.js
import { MAX_SHIFT_HOURS } from '../constants/timeTracking';
import { AUTO_CLOCK_OUT_NOTICE_TTL_MS } from '../services/homeAttentionStore';
import { formatDisplayDate, toLocalDateString } from './localDate';

// Home's attention area: blank by default, at most two cards, highest priority
// first. Every rule lives here so Home only renders what this returns.
export const MAX_ATTENTION_ITEMS = 2;

const plural = (count, singular, pluralForm) => (count === 1 ? singular : pluralForm);

const syncAttentionItem = (count) => {
  const title = `${count} ${plural(count, 'item needs', 'items need')} attention`;
  const subtitle = 'Open sync status to sort it out';
  return {
    key: 'sync_attention',
    kind: 'sync_attention',
    tone: 'warning',
    title,
    subtitle,
    accessibilityLabel: `${title}. ${subtitle}`,
    route: 'SyncStatus',
    dismissible: false,
  };
};

const autoClockOutItem = (notice, now) => {
  const sameDay = toLocalDateString(notice.signInTime) === toLocalDateString(now);
  const day = sameDay ? 'Today' : formatDisplayDate(notice.signInTime, { weekday: 'short' });
  const title = `Clocked out after ${MAX_SHIFT_HOURS} hours`;
  return {
    key: `auto_clock_out:${notice.entryId}`,
    kind: 'auto_clock_out',
    tone: 'warning',
    title,
    subtitle: `Automatic · ${day} · check hours`,
    accessibilityLabel: `Clocked out automatically after ${MAX_SHIFT_HOURS} hours, ${day}. Check your hours`,
    route: 'TimeEntriesList',
    dismissible: true,
    entryId: notice.entryId,
  };
};

const assessmentDueItem = ({ assessed, total }) => {
  const remaining = total - assessed;
  const title = `${remaining} ${plural(remaining, 'child', 'children')} to assess`;
  const subtitle = `${assessed} of ${total} children assessed`;
  return {
    key: 'assessment_due',
    kind: 'assessment_due',
    tone: 'neutral',
    title,
    subtitle,
    accessibilityLabel: `${title}. ${subtitle}. Open Assess`,
    route: 'Assessments',
    dismissible: true,
  };
};

const isNoticeVisible = (notice, now) => {
  if (!notice || notice.dismissedAt) return false;
  const age = now.getTime() - Date.parse(notice.detectedAt);
  return Number.isFinite(age) && age < AUTO_CLOCK_OUT_NOTICE_TTL_MS;
};

export function deriveHomeAttentionItems({
  needsAttentionCount = 0,
  autoClockOut = null,
  coverage = null,
  assessmentDismissedOn = null,
  now = new Date(),
} = {}) {
  const items = [];

  if (needsAttentionCount > 0) {
    items.push(syncAttentionItem(needsAttentionCount));
  }
  if (isNoticeVisible(autoClockOut, now)) {
    items.push(autoClockOutItem(autoClockOut, now));
  }
  if (
    coverage
    && coverage.total > 0
    && coverage.total - coverage.assessed > 0
    && assessmentDismissedOn !== toLocalDateString(now)
  ) {
    items.push(assessmentDueItem(coverage));
  }

  return items.slice(0, MAX_ATTENTION_ITEMS);
}
