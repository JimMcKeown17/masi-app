/**
 * Dashboard Stats Utility
 *
 * Pure functions for computing dashboard statistics from local storage data.
 * No React, no side effects — just data in, stats out.
 */

import { computeLetterMastery, eligibleLetterResults } from './letterMastery';
import {
  languageCodeForHomeLanguage,
  LETTER_EVIDENCE_CODES,
  TRACKER_LETTERS,
} from './assessmentRegistry';
import { toLocalDateString } from './localDate';
import { getScoreBand } from './scoreBands';

// ─── Helpers ───────────────────────────────────────────────────────────

/**
 * Format a Date object as YYYY-MM-DD in LOCAL time (not UTC).
 * Critical: South Africa is UTC+2 — using toISOString() would shift
 * dates backward across midnight, breaking week/month boundaries.
 */
export function toDateString(dateOrString) {
  if (!dateOrString) return null;
  if (typeof dateOrString === 'string' && !dateOrString.includes('T')) {
    return dateOrString.slice(0, 10);
  }
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
      weekDays[dateToIndex[dateStr]].count += Number(session.count || 1);
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
    if (isSameMonth(toDateString(session.session_date), now)) {
      count += Number(session.count || 1);
    }
  }
  return count;
}

function isLaterResult(candidate, existing) {
  return !existing
    || (candidate.assessment_date || '') > (existing.assessment_date || '')
    || (candidate.assessment_date === existing.assessment_date
      && (candidate.created_at || '') > (existing.created_at || ''));
}

function isLetterResultThisYear(result, academicYear) {
  return (academicYear?.is_active === 1 || academicYear?.is_active === true)
    && Boolean(academicYear.starts_on && academicYear.ends_on)
    && LETTER_EVIDENCE_CODES.includes(result.question_code)
    && !result.stopped_reason?.startsWith('skipped_')
    && result.assessment_date >= academicYear.starts_on
    && result.assessment_date <= academicYear.ends_on;
}

function coverageFromIds(children, assessedIds) {
  const total = children.length;
  if (total === 0) return { assessed: 0, total: 0, percent: 0 };
  const assessed = children.filter(child => assessedIds.has(child.id)).length;
  return { assessed, total, percent: Math.round((assessed / total) * 100) };
}

/** Letter coverage from typed results within the active academic year. */
export function getAssessmentCoverage(children, results, academicYear) {
  const assessedIds = new Set(results
    .filter(result => isLetterResultThisYear(result, academicYear))
    .map(result => result.child_id));
  return coverageFromIds(children, assessedIds);
}

/**
 * Coverage from getAssessmentCountsSince's already-qualified letter counts.
 * The repository applies the year/Question/skip scope and returns no rows
 * without an active academic year.
 */
export function getCoverageFromCounts(children, counts) {
  const assessedIds = new Set(counts.filter(row => row.count > 0).map(row => row.child_id));
  return coverageFromIds(children, assessedIds);
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/**
 * Footnote that gives context for the Home header's monthly figures — the
 * days-worked and sessions counts reset each calendar month, so name which month
 * they cover. (Locale-independent so it reads the same on every field device.)
 */
export function getMonthlyStatsFootnote(now = new Date()) {
  return `Days worked and sessions are for ${MONTH_NAMES[now.getMonth()]} ${now.getFullYear()}.`;
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
    const languageCode = languageCodeForHomeLanguage(cls?.home_language);
    const trackerLetters = languageCode ? TRACKER_LETTERS[languageCode] : null;

    if (!trackerLetters) {
      // Keep the ranking's display scale without choosing a language or its evidence.
      rankings.push({ child, masteredCount: 0, total: 26, percent: 0 });
      continue;
    }

    // Stored letter results count regardless of recorder or battery membership.
    // Each letter takes the newest result that reached it, as on the tracker.
    const letterResults = eligibleLetterResults(assessments, { childId: child.id, languageCode });
    const assessmentMastered = computeLetterMastery(letterResults, trackerLetters);

    // Confirmed letters in the child's class language, regardless of recorder or programme.
    const taughtLetters = new Set();
    for (const r of letterMastery) {
      if (r.child_id === child.id && r.language === languageCode && r.confirmed) {
        taughtLetters.add(r.letter);
      }
    }

    // Union — don't double-count letters that are both assessed-mastered and taught
    const allMastered = new Set([...assessmentMastered, ...taughtLetters]);
    const masteredCount = trackerLetters.filter(letter => allMastered.has(letter)).length;
    const total = trackerLetters.length; // 26

    rankings.push({
      child,
      masteredCount,
      total,
      percent: Math.round((masteredCount / total) * 100),
    });
  }

  return rankings.sort((a, b) => b.percent - a.percent);
}

function gradeAtAssessmentDate(child, assessmentDate, classes, memberships) {
  // Use the same SAST date conversion as saveQuestionResult. Membership windows
  // are [local enrollment day, local exit day): the move day belongs to the
  // next class, regardless of the timestamp's clock time within that day.
  const membership = memberships.filter(row => (
    row.child_id === child.id
    && toLocalDateString(row.enrolled_at) <= assessmentDate
    && (!row.exited_at || assessmentDate < toLocalDateString(row.exited_at))
  )).sort((a, b) => b.enrolled_at.localeCompare(a.enrolled_at))[0];
  const historicalClass = classes.find(row => row.id === membership?.class_id);
  // The current class can also be outside the EA's assigned-class context.
  // Joined membership grades still supply that current-class fallback.
  const currentMembership = memberships.find(row => (
    row.child_id === child.id && row.class_id === child.class_id
  ));
  return membership?.class_grade ?? historicalClass?.grade
    ?? currentMembership?.class_grade ?? classes.find(row => row.id === child.class_id)?.grade ?? null;
}

function rankQuestionResults(children, assessments, questionCode, classes, memberships) {
  const latestByChild = new Map();
  for (const result of assessments || []) {
    if (result.question_code !== questionCode || result.stopped_reason?.startsWith('skipped_')) continue;
    if (isLaterResult(result, latestByChild.get(result.child_id))) latestByChild.set(result.child_id, result);
  }
  return children.flatMap(child => {
    const assessment = latestByChild.get(child.id);
    if (!assessment) return [];
    const grade = gradeAtAssessmentDate(child, assessment.assessment_date, classes, memberships);
    return [{
      child,
      score: assessment.score,
      total: assessment.total_items,
      date: assessment.assessment_date,
      assessment,
      grade,
      band: getScoreBand({
        toolCode: assessment.question_code,
        grade,
        language: assessment.language,
        rawScore: assessment.score,
      }),
    }];
  }).sort((a, b) => b.score - a.score);
}

/** Rank the latest non-skipped letter result, including battery Questions. */
export function getLetterScoreRanking(children, assessments, classes = [], memberships = []) {
  return rankQuestionResults(children, assessments, 'letter_sounds', classes, memberships);
}

/** Rank the latest non-skipped word result on its own stored scale. */
export function getWordAssessmentRanking(children, assessments, classes = [], memberships = []) {
  return rankQuestionResults(children, assessments, 'word_reading', classes, memberships);
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

/** Count distinct sessions attended by at least one of the listed children. */
export function getDistinctSessionCount(children, sessions) {
  const childIds = new Set(children.map(child => child.id));
  const sessionIds = new Set();
  for (const session of sessions) {
    if ((session.children_ids || []).some(id => childIds.has(id))) {
      sessionIds.add(session.id);
    }
  }
  return sessionIds.size;
}

// ─── Tab Stats ──────────────────────────────────────────────────────────

/**
 * Children tab summary stats.
 */
export function getChildrenTabStats(deliveryChildren, assessableChildren, classes, assessments, academicYear) {
  const coverage = getAssessmentCoverage(assessableChildren, assessments, academicYear);
  return {
    childrenCount: deliveryChildren.length,
    classCount: classes.length,
    unassessedCount: assessableChildren.length - coverage.assessed,
  };
}

/**
 * Sessions tab summary stats.
 */
export function getSessionsTabStats(sessions, children, userId) {
  // Shared/rotated devices keep another EA's same-programme sessions cached after
  // sign-out (getSessions is programme-scoped, not user-scoped). Scope to the
  // signed-in EA so the tab agrees with the Sessions Today ring (#10, #4).
  const ownSessions = userId ? sessions.filter(s => s.user_id === userId) : sessions;
  const now = new Date();
  const monday = getMonday(now);
  const mondayStr = toDateString(monday);
  const fridayDate = new Date(monday);
  fridayDate.setDate(monday.getDate() + 4);
  const fridayStr = toDateString(fridayDate);

  let thisWeek = 0;
  let thisMonth = 0;
  const seenThisWeek = new Set();

  for (const session of ownSessions) {
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
 * Assessments tab summary stats for the supplied active children.
 * Total means the number of non-skipped letter results in the active academic
 * year for those children; it is a result count, not a distinct-child count.
 */
export function getAssessmentsTabStats(children, assessments, academicYear) {
  const activeChildIds = new Set(children.map(child => child.id));
  const activeAssessments = assessments.filter(result => (
    activeChildIds.has(result.child_id) && isLetterResultThisYear(result, academicYear)
  ));
  const coverage = getAssessmentCoverage(children, activeAssessments, academicYear);
  const latestByChild = new Map();
  for (const result of activeAssessments) {
    if (isLaterResult(result, latestByChild.get(result.child_id))) latestByChild.set(result.child_id, result);
  }
  const scores = [...latestByChild.values()].map(result => result.score).filter(Number.isFinite);
  const avgScore = scores.length > 0
    ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length)
    : 0;
  return { percentAssessed: coverage.percent, totalAssessments: activeAssessments.length, avgScore };
}
