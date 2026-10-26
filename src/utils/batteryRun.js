import { evaluateBatteryState, MANUAL_SKIP_REASONS, skipCauseFor } from '../assessment-questions';

export const TRIGGER_LABELS = {
  letter_sounds: 'Letters first row wrong',
  wela_plus_letter_writing: 'Letter writing first row wrong',
  word_reading: 'Words first row wrong',
};

export function skipNoticeFor({ view, firstName }) {
  const trigger = view.firedTrigger;
  if (!trigger) return null;
  const skipped = view.rows.filter(row => row.skipCause?.kind === 'first_row'
    && row.skipCause.trigger === trigger).map(row => row.question.title);
  if (!skipped.length) return null;
  const stillToDo = view.rows.filter(row => ['next', 'not_started'].includes(row.state))
    .map(row => row.question.title);
  const name = firstName || 'This child';
  const midSentenceName = firstName || 'this child';
  const copy = {
    letter_sounds: {
      title: 'No reading or writing today',
      body: `${name} got every letter in the first row wrong. So ${midSentenceName} won't be asked to read or write words, sentences or a story. This is normal.`,
    },
    wela_plus_letter_writing: {
      title: 'No reading or writing today',
      body: `${name} got every letter in the first row of the Writing Sheet wrong. So ${midSentenceName} won't be asked to read or write words, sentences or a story. This is normal.`,
    },
    word_reading: {
      title: 'No more reading or writing today',
      body: `${name} got every word in the first row wrong. So ${midSentenceName} won't be asked to read sentences or a story, or to write. This is normal.`,
    },
  }[trigger];
  // A trigger with no copy here (a future Battery) shows no card rather than breaking the list.
  if (!copy) return null;
  return {
    trigger, title: copy.title,
    body: `${copy.body} ${stillToDo.length ? 'Carry on with the next Question.' : 'Tap Review and finalize to finish.'}`,
    stillToDo, skipped,
  };
}

const RUN_CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const MATERIAL_LABELS = {
  reading_card: 'Reading Card',
  picture_cards: 'Picture Cards',
  writing_sheet: 'Writing Sheet',
};
const SKIP_LABELS = new Map([
  ...MANUAL_SKIP_REASONS.map(({ reason, label }) => [reason, label]),
  ['skipped_prerequisite_unmet', 'Not reached'],
]);

export function runCode(uuid) {
  const bits = Number.parseInt(uuid.replace(/-/g, '').slice(0, 8), 16) >>> 2;
  let code = '';
  for (let shift = 25; shift >= 0; shift -= 5) {
    code += RUN_CODE_ALPHABET[(bits >>> shift) & 31];
  }
  return `${code.slice(0, 3)}-${code.slice(3)}`;
}

export function buildRunView(battery, run, { activeProgrammeId, childAssigned }) {
  const results = run.results ?? [];
  const decidedResults = results.map(({ question_code, stopped_reason, score, items }) => ({
    question_code, stopped_reason, score,
    items: items?.map(({ position, is_correct, metadata }) => ({ position, is_correct, metadata })),
  }));
  const state = evaluateBatteryState(battery, decidedResults);
  const byCode = new Map(results.map(result => [result.question_code, result]));
  const firstWritingSheet = battery.questions.find(question => question.materials?.item === 'writing_sheet');
  let readOnlyReason = null;
  if (run.status !== 'in_progress') readOnlyReason = 'closed';
  else if (run.started_here !== 1) readOnlyReason = 'other_phone';
  else if (run.programme_id !== activeProgrammeId || !childAssigned) readOnlyReason = 'unassigned';

  const rows = battery.questions.map((question, index) => {
    const result = byCode.get(question.question_code);
    let rowState;
    let detail;
    let scoreText = null;
    let skipCause = null;
    if (result) {
      if (result.stopped_reason.startsWith('skipped_')) {
        rowState = 'skipped';
        let label = SKIP_LABELS.get(result.stopped_reason);
        if (result.stopped_reason === 'skipped_prerequisite_unmet') {
          skipCause = skipCauseFor(battery, decidedResults, question.question_code);
          if (skipCause?.kind === 'first_row') label = TRIGGER_LABELS[skipCause.trigger];
          else if (skipCause?.kind === 'prerequisite' && skipCause.depends_on === 'oral_reading') {
            label = 'No story words read';
          }
        }
        detail = `Skipped · ${label}`;
      } else {
        rowState = 'done';
        detail = 'Done';
        const max = result.derived?.max ?? result.derived?.questions_asked ?? result.total_items;
        if (max === 0) scoreText = '—';
        else if (result.score != null && max != null) scoreText = `${result.score} / ${max}`;
      }
    } else {
      const isNext = readOnlyReason === null && question === state.nextQuestion;
      rowState = isNext ? 'next' : 'not_started';
      detail = isNext ? 'Next' : 'Not started';
      if (isNext && question.materials) detail += ` · ${MATERIAL_LABELS[question.materials.item]}`;
      else if (question.durationSec) detail += ` · ${Math.ceil(question.durationSec / 60)} min`;
    }
    return { number: index + 1, question, state: rowState, detail, scoreText, skipCause };
  });

  return {
    code: runCode(run.id),
    decidedCount: state.decided.length,
    totalCount: battery.questions.length,
    eligibleToFinalize: state.eligibleToFinalize,
    next: state.nextQuestion,
    autoSkips: state.autoSkips,
    firedTrigger: state.firedTrigger,
    writable: readOnlyReason === null,
    readOnlyReason,
    writingSheetReminder: Boolean(state.nextQuestion && state.nextQuestion === firstWritingSheet),
    hasWritingSheet: Boolean(firstWritingSheet),
    rows,
  };
}

export function materialsLine(question, language, battery) {
  if (!question.materials) return null;
  const item = MATERIAL_LABELS[question.materials.item];
  const side = question.materials.side ? `side ${question.materials.side}` : null;
  const cardTitle = question.materials.item === 'reading_card' && battery.readingCard
    ? battery.readingCard : `${battery.title} ${battery.battery_version}`;
  return {
    item,
    side,
    footer: `${cardTitle} · ${language.toUpperCase()} · ${side ?? item}`,
  };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// "Today 09:12" for today, "Tue 14:05" within the last six local days, else "3 Sep 14:05",
// so a run left open for weeks never reads as this week.
export function formatRunStart(iso, now) {
  const date = new Date(iso);
  const startOfDay = d => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const daysAgo = Math.round((startOfDay(now) - startOfDay(date)) / 86400000);
  let day;
  if (daysAgo === 0) day = 'Today';
  else if (daysAgo > 0 && daysAgo <= 6) day = WEEKDAYS[date.getDay()];
  else day = `${date.getDate()} ${MONTHS[date.getMonth()]}`;
  const time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  return `${day} ${time}`;
}
