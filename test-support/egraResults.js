// Synthetic fixtures mirror the real capture output; capture tests compare all four sections.
export function buildEgraResult(itemSet, { reason = 'completed', attempted, correct = [], responses = [], notReached, durationMs = 60000, timed = true } = {}) {
  const code = itemSet.question_code;
  const comprehension = code === 'reading_comprehension';
  if (comprehension) {
    const tail = notReached ?? itemSet.questions.length - responses.length;
    if (responses.some(response => response !== 'correct' && response !== 'incorrect') ||
        !Number.isInteger(tail) || tail < 0 || responses.length + tail !== itemSet.questions.length) {
      throw new Error('Story questions require correct/incorrect responses followed by a notReached tail matching the item set');
    }
    const items = itemSet.questions.map((question, position) => ({
      position, item_key: question.item_key, prompt: question.prompt,
      is_correct: position < responses.length && responses[position] === 'correct',
      metadata: { reached: position < responses.length, asked: position < responses.length },
    }));
    const totalCorrect = items.filter(item => item.is_correct).length;
    const maxWrong = responses.reduce((state, response) => {
      const run = response === 'correct' ? 0 : state.run + 1;
      return { run, max: Math.max(state.max, run) };
    }, { run: 0, max: 0 }).max;
    return {
      question_code: code, question_version: itemSet.question_version, item_set_id: itemSet.item_set_id,
      language: itemSet.language, stopped_reason: reason, duration_ms: durationMs, items,
      derived: { total_correct: totalCorrect, total_attempted: responses.length,
        percent: responses.length ? Math.round(totalCorrect / responses.length * 100) : 0,
        last_attempted_position: responses.length - 1, was_timed: false, tracks_progress: true,
        capture_mode: 'sequential', correction_count: 0, max_consecutive_wrong: maxWrong,
        questions_asked: responses.length },
    };
  }
  const sequential = code === 'letter_sounds' || code === 'word_reading';
  const prompts = code === 'letter_sounds' ? itemSet.rows.flat() : itemSet.words.map(w => w.word);
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
    return { position, item_key: String(position), prompt, is_correct: position < count && correct.includes(position),
      ...(sequential ? { metadata: { row: rowAt(position), reached: position < count } }
        : position >= count ? { metadata: { reached: false } } : {}) };
  });
  const totalCorrect = items.filter(item => item.is_correct).length;
  const totalAttempted = count;
  return {
    question_code: code, question_version: itemSet.question_version, item_set_id: itemSet.item_set_id, language: itemSet.language,
    stopped_reason: reason, duration_ms: durationMs, items,
    derived: { total_correct: totalCorrect, total_attempted: totalAttempted,
      percent: totalAttempted ? Math.round(totalCorrect / totalAttempted * 100) : 0,
      last_attempted_position: count - 1, was_timed: timed, tracks_progress: true,
      ...(sequential ? {
        capture_mode: 'sequential', correction_count: 0,
        max_consecutive_wrong: Array.from({ length: count }, (_, i) => correct.includes(i)).reduce((state, right) => {
          const run = right ? 0 : state.run + 1;
          return { run, max: Math.max(state.max, run) };
        }, { run: 0, max: 0 }).max,
      } : timed ? { correct_words_per_minute: durationMs > 0 ? Math.round(totalCorrect / durationMs * 60000) : 0 } : {}),
    },
  };
}
