// Synthetic fixtures mirror the real capture output; capture tests compare all four sections.
export function buildEgraResult(itemSet, { reason = 'completed', attempted, correct = [], responses, durationMs = 60000, timed = true } = {}) {
  const code = itemSet.question_code;
  const comprehension = code === 'reading_comprehension';
  const sequential = code === 'letter_sounds' || code === 'word_reading';
  const prompts = code === 'letter_sounds' ? itemSet.rows.flat() : comprehension
    ? itemSet.questions.map(q => q.prompt) : itemSet.words.map(w => w.word);
  const count = attempted ?? prompts.length;
  const rowLengths = code === 'letter_sounds' ? itemSet.rows.map(row => row.length) : itemSet.row_lengths;
  const rowAt = position => {
    let start = 0;
    for (let i = 0; i < rowLengths.length; i++) {
      start += rowLengths[i];
      if (position < start) return i;
    }
  };
  const items = prompts.map((prompt, position) => {
    if (comprehension) {
      const response = responses?.[position] ?? 'not_asked';
      return { position, item_key: String(position), prompt, response, is_correct: response === 'correct', metadata: { asked: response !== 'not_asked' } };
    }
    return { position, item_key: String(position), prompt, is_correct: position < count && correct.includes(position),
      ...(sequential ? { metadata: { row: rowAt(position), reached: position < count } }
        : position >= count ? { metadata: { reached: false } } : {}) };
  });
  const totalCorrect = items.filter(item => item.is_correct).length;
  const totalAttempted = comprehension ? items.filter(item => item.metadata.asked).length : count;
  return {
    question_code: code, question_version: itemSet.question_version, item_set_id: itemSet.item_set_id, language: itemSet.language,
    stopped_reason: reason, duration_ms: durationMs, items,
    derived: { total_correct: totalCorrect, total_attempted: totalAttempted,
      percent: totalAttempted ? Math.round(totalCorrect / totalAttempted * 100) : 0,
      last_attempted_position: comprehension ? null : count - 1, was_timed: comprehension ? false : timed, tracks_progress: !comprehension,
      ...(comprehension ? { questions_asked: totalAttempted } : sequential ? {
        capture_mode: 'sequential', correction_count: 0,
        max_consecutive_wrong: Array.from({ length: count }, (_, i) => correct.includes(i)).reduce((state, right) => {
          const run = right ? 0 : state.run + 1;
          return { run, max: Math.max(state.max, run) };
        }, { run: 0, max: 0 }).max,
      } : timed ? { correct_words_per_minute: durationMs > 0 ? Math.round(totalCorrect / durationMs * 60000) : 0 } : {}),
    },
  };
}
