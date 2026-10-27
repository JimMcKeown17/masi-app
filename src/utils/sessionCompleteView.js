import { sortLettersByOrder } from './letterOrders';
import { formatNameList } from './childNames';
import { toLocalDateString } from './localDate';
import { formatSessionDate } from './sessionDateFormat';
import { deriveGoalState } from './sessionGoal';
import { getGaugeColor, getGoalCopy } from './sessionGoalPresentation';

export const CELEBRATION_LEVELS = ['full', 'calm'];
export const HEADLINES = { captured: 'Session\ncaptured.', reached: 'Daily target\nreached.' };

export function buildSessionCompleteParams({ selectedChildren, selectedLetters, sessionReadingLevel, sessionDateKey, teachingOrder }) {
  return {
    childCount: selectedChildren.length,
    childNames: selectedChildren.map((child) => child.first_name || 'Child'),
    letters: sortLettersByOrder(selectedLetters, teachingOrder),
    readingLevel: sessionReadingLevel,
    sessionDate: sessionDateKey,
  };
}

export function describeCapturedPill(params, { isToday }) {
  const { childCount, sessionDate } = params;
  if (typeof childCount !== 'number' || !(childCount > 0)) {
    return { text: 'Nice work — it’s saved.', spoken: 'Nice work — it’s saved' };
  }
  const text = `Saved for ${childCount} ${childCount === 1 ? 'child' : 'children'}`;
  if (!isToday && sessionDate) {
    return {
      text: `${text} · ${formatSessionDate(sessionDate, 'pill')}`,
      spoken: `${text}, for ${formatSessionDate(sessionDate, 'spoken')}`,
    };
  }
  return { text, spoken: text };
}

export function buildReceiptRows({ childNames, letters, readingLevel }) {
  const rows = [];
  if (childNames?.length) {
    rows.push({
      key: 'children', label: 'Children', value: formatNameList(childNames),
      accessibilityLabel: 'Children: ' + formatNameList(childNames, { spoken: true }),
    });
  }
  if (letters?.length) {
    rows.push({
      key: 'letters', label: 'Letters', value: letters,
      accessibilityLabel: 'Letters: ' + letters.map((letter) => letter.toUpperCase()).join(', '),
    });
  }
  if (readingLevel) {
    rows.push({
      key: 'readingLevel', label: 'Reading level', value: readingLevel,
      accessibilityLabel: 'Reading level: ' + readingLevel,
    });
  }
  return rows;
}

export function deriveSessionCompleteView({ goal, goalStatus, params = {}, now, motionLevel }) {
  const isToday = Boolean(params.sessionDate && params.sessionDate === toLocalDateString(now));
  const celebrate = CELEBRATION_LEVELS.includes(motionLevel);
  const pill = describeCapturedPill(params, { isToday });
  const base = {
    isToday,
    celebrate,
    headline: HEADLINES.captured,
    pill,
    receipt: buildReceiptRows(params),
    card: null,
    gauge: null,
    confetti: false,
    headlineMotion: celebrate ? 'other' : 'still',
    announcement: `Session captured. ${pill.spoken}.`,
  };
  if (goalStatus === 'loading') {
    return { ...base, card: { kind: 'skeleton' }, announcement: null };
  }
  if (goalStatus !== 'ready' || goal == null) return base;

  const metToday = isToday && goal.state === 'met';
  const exactTargetToday = metToday && goal.count === goal.target;
  const copy = getGoalCopy(goal, true);
  const animated = celebrate && isToday && goal.count !== 0;
  let fromGoal = null;
  let fromCopy = null;
  let earned = null;
  let flip = false;

  if (animated) {
    const count = goal.count - 1;
    fromGoal = { ...goal, count, state: deriveGoalState({ ...goal, count }) };
    fromCopy = getGoalCopy(fromGoal, true);
    if (count === 0) fromCopy = { ...fromCopy, subtitle: '' };
    if (goal.state !== 'no_target' && goal.target && goal.count <= goal.target) {
      earned = { color: getGaugeColor(count === 0 ? goal : fromGoal) };
    }
    flip = goal.state !== 'no_target' && count > 0 && getGaugeColor(fromGoal) !== getGaugeColor(goal);
  }

  return {
    ...base,
    headline: metToday ? HEADLINES.reached : HEADLINES.captured,
    card: { kind: 'goal', goal, copy, fromCopy, showSub: !metToday },
    gauge: { mode: animated ? 'animated' : 'static', fromGoal, earned, flip },
    confetti: celebrate && exactTargetToday,
    headlineMotion: !celebrate ? 'still' : (exactTargetToday ? 'target' : 'other'),
    announcement: `Session captured. ${pill.spoken}. ${copy.title}. ${copy.subtitle}`,
  };
}
