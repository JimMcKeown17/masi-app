/**
 * Dashboard Stats Utility
 *
 * Pure functions for computing dashboard statistics from local storage data.
 * No React, no side effects — just data in, stats out.
 */

import { computeAssessmentMastery, normalizeLanguageKey } from './letterMastery';
import { LETTER_SETS, PEDAGOGICAL_ORDERS } from '../constants/egraConstants';

// ─── Helpers ───────────────────────────────────────────────────────────

/**
 * Format a Date object as YYYY-MM-DD in LOCAL time (not UTC).
 * Critical: South Africa is UTC+2 — using toISOString() would shift
 * dates backward across midnight, breaking week/month boundaries.
 */
function toLocalDateString(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function toDateString(dateOrString) {
  if (!dateOrString) return null;
  if (typeof dateOrString === 'string') return dateOrString.slice(0, 10);
  return toLocalDateString(dateOrString);
}

function toMonthString(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function getMonday(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day; // Monday = 1
  d.setDate(d.getDate() + diff);
  return d;
}

function isSameMonth(dateStr, refDate) {
  if (!dateStr) return false;
  return dateStr.slice(0, 7) === toMonthString(refDate);
}

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

// ─── Home Screen Stats ─────────────────────────────────────────────────

/**
 * Count distinct days worked this month (days with a completed time entry).
 * A "completed" entry has both sign_in_time and sign_out_time.
 */
export function getDaysWorkedThisMonth(timeEntries) {
  const now = new Date();
  const monthPrefix = toMonthString(now);
  const days = new Set();

  for (const entry of timeEntries) {
    if (!entry.sign_in_time || !entry.sign_out_time) continue;
    const dateStr = toDateString(entry.sign_in_time);
    if (dateStr && dateStr.startsWith(monthPrefix)) {
      days.add(dateStr);
    }
  }
  return days.size;
}

/**
 * Get session counts for each weekday (Mon–Fri) of the current week.
 * Returns array of 5 objects: [{ day: 'Mon', date: '2026-03-24', count: 3 }, ...]
 */
export function getWeekSessionCounts(sessions) {
  const now = new Date();
  const monday = getMonday(now);
  const todayStr = toDateString(now);

  const weekDays = DAY_LABELS.map((day, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return {
      day,
      date: toDateString(d),
      count: 0,
      isToday: toDateString(d) === todayStr,
      isFuture: toDateString(d) > todayStr,
    };
  });

  const dateToIndex = {};
  weekDays.forEach((wd, i) => { dateToIndex[wd.date] = i; });

  for (const session of sessions) {
    const dateStr = toDateString(session.session_date);
    if (dateStr in dateToIndex) {
      weekDays[dateToIndex[dateStr]].count++;
    }
  }

  return weekDays;
}

/**
 * Count sessions in the current month.
 */
export function getSessionsThisMonth(sessions) {
  const now = new Date();
  let count = 0;
  for (const session of sessions) {
    if (isSameMonth(toDateString(session.session_date), now)) count++;
  }
  return count;
}

/**
 * Assessment coverage: how many children have at least one assessment.
 */
export function getAssessmentCoverage(children, assessments) {
  const total = children.length;
  if (total === 0) return { assessed: 0, total: 0, percent: 0 };

  const assessedIds = new Set();
  for (const a of assessments) {
    if (a.child_id) assessedIds.add(a.child_id);
  }

  const assessed = children.filter(c => assessedIds.has(c.id)).length;
  return {
    assessed,
    total,
    percent: Math.round((assessed / total) * 100),
  };
}

// ─── Ranking Stats ──────────────────────────────────────────────────────

/**
 * Rank children by total letter mastery (assessment-mastered + coach-taught).
 * Returns sorted array (best first) of { child, masteredCount, total, percent }.
 */
export function getLetterMasteryRanking(children, assessments, letterMastery, classes) {
  const rankings = [];

  for (const child of children) {
    // Determine language from class
    const cls = classes.find(c => c.id === child.class_id);
    const langKey = normalizeLanguageKey(cls?.home_language);
    const letterSet = LETTER_SETS[langKey];
    const pedOrder = PEDAGOGICAL_ORDERS[langKey];

    if (!letterSet || !pedOrder) {
      rankings.push({ child, masteredCount: 0, total: 26, percent: 0 });
      continue;
    }

    // Find most recent assessment for this child in this language
    const childAssessments = assessments
      .filter(a => a.child_id === child.id && normalizeLanguageKey(a.letter_language) === langKey)
      .sort((a, b) => {
        const dateCmp = (b.date_assessed || '').localeCompare(a.date_assessed || '');
        if (dateCmp !== 0) return dateCmp;
        return (b.created_at || '').localeCompare(a.created_at || '');
      });
    const latest = childAssessments[0] || null;

    // Assessment-mastered letters
    const assessmentMastered = computeAssessmentMastery(latest, letterSet, pedOrder);

    // Coach-taught letters (not deleted, matching language)
    const taughtLetters = new Set();
    for (const r of letterMastery) {
      if (r.child_id === child.id && r.language === letterSet.language && !r._deleted) {
        taughtLetters.add(r.letter);
      }
    }

    // Union — don't double-count letters that are both assessed-mastered and taught
    const allMastered = new Set([...assessmentMastered, ...taughtLetters]);
    const masteredCount = allMastered.size;
    const total = pedOrder.length; // 26

    rankings.push({
      child,
      masteredCount,
      total,
      percent: Math.round((masteredCount / total) * 100),
    });
  }

  return rankings.sort((a, b) => b.percent - a.percent);
}

/**
 * Rank children by most recent EGRA assessment accuracy.
 * Children with no assessment get accuracy: null and sort to bottom.
 */
export function getAssessmentRanking(children, assessments) {
  const rankings = [];

  for (const child of children) {
    const childAssessments = assessments
      .filter(a => a.child_id === child.id)
      .sort((a, b) => {
        const dateCmp = (b.date_assessed || '').localeCompare(a.date_assessed || '');
        if (dateCmp !== 0) return dateCmp;
        return (b.created_at || '').localeCompare(a.created_at || '');
      });

    const latest = childAssessments[0];
    if (latest && latest.accuracy != null && !isNaN(latest.accuracy)) {
      rankings.push({
        child,
        accuracy: Math.round(latest.accuracy),
        correct: (latest.correct_letters || []).length,
        attempted: latest.last_letter_attempted ? latest.last_letter_attempted.index + 1 : 0,
        date: latest.date_assessed,
        assessment: latest,
      });
    } else {
      rankings.push({ child, accuracy: null, correct: 0, attempted: 0, date: null, assessment: null });
    }
  }

  // Assessed children sorted by total correct letters desc, then unassessed at bottom
  return rankings.sort((a, b) => {
    if (a.accuracy === null && b.accuracy === null) return 0;
    if (a.accuracy === null) return 1;
    if (b.accuracy === null) return -1;
    return b.correct - a.correct;
  });
}

/**
 * Rank children by total session count (all time).
 * Sessions store children_ids as an array, so one session can count for multiple children.
 */
export function getSessionCountRanking(children, sessions) {
  // Count sessions per child
  const countMap = {};
  for (const child of children) {
    countMap[child.id] = 0;
  }

  for (const session of sessions) {
    const ids = session.children_ids || [];
    for (const id of ids) {
      if (id in countMap) countMap[id]++;
    }
  }

  const rankings = children.map(child => ({
    child,
    count: countMap[child.id] || 0,
  }));

  return rankings.sort((a, b) => b.count - a.count);
}

// ─── Tab Stats ──────────────────────────────────────────────────────────

/**
 * Children tab summary stats.
 */
export function getChildrenTabStats(children, classes, assessments) {
  const assessedIds = new Set();
  for (const a of assessments) {
    if (a.child_id) assessedIds.add(a.child_id);
  }
  const unassessedCount = children.filter(c => !assessedIds.has(c.id)).length;

  return {
    childrenCount: children.length,
    classCount: classes.length,
    unassessedCount,
  };
}

/**
 * Sessions tab summary stats.
 */
export function getSessionsTabStats(sessions, children) {
  const now = new Date();
  const monday = getMonday(now);
  const mondayStr = toDateString(monday);
  const fridayDate = new Date(monday);
  fridayDate.setDate(monday.getDate() + 4);
  const fridayStr = toDateString(fridayDate);

  let thisWeek = 0;
  let thisMonth = 0;
  const seenThisWeek = new Set();

  for (const session of sessions) {
    const dateStr = toDateString(session.session_date);
    if (!dateStr) continue;

    if (dateStr >= mondayStr && dateStr <= fridayStr) {
      thisWeek++;
      const ids = session.children_ids || [];
      ids.forEach(id => seenThisWeek.add(id));
    }

    if (isSameMonth(dateStr, now)) {
      thisMonth++;
    }
  }

  const avgPerChild = children.length > 0
    ? Math.round((thisMonth / children.length) * 10) / 10
    : 0;

  const notSeenThisWeek = children.filter(c => !seenThisWeek.has(c.id));

  return {
    thisWeek,
    thisMonth,
    avgPerChild,
    notSeenThisWeek,
  };
}

/**
 * Assessments tab summary stats.
 */
export function getAssessmentsTabStats(children, assessments) {
  const coverage = getAssessmentCoverage(children, assessments);

  // Average accuracy across most recent assessment per child
  const latestByChild = {};
  for (const a of assessments) {
    if (!a.child_id) continue;
    const existing = latestByChild[a.child_id];
    const isBetter = !existing
      || (a.date_assessed || '') > (existing.date_assessed || '')
      || ((a.date_assessed || '') === (existing.date_assessed || '')
          && (a.created_at || '') > (existing.created_at || ''));
    if (isBetter) {
      latestByChild[a.child_id] = a;
    }
  }

  const accuracies = Object.values(latestByChild)
    .map(a => a.accuracy)
    .filter(acc => acc != null && !isNaN(acc));

  const avgAccuracy = accuracies.length > 0
    ? Math.round(accuracies.reduce((sum, a) => sum + a, 0) / accuracies.length)
    : 0;

  return {
    percentAssessed: coverage.percent,
    totalAssessments: assessments.length,
    avgAccuracy,
  };
}
