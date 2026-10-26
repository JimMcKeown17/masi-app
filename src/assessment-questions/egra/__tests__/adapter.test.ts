import { evaluateBatteryState } from '../../battery/evaluateBatteryState';
import { egraCatalog } from '../../../../content/egra';
import { adaptEgraForm, EGRA_FORMS, EGRA_BATTERIES, egraFormFor, listEgraForms, egraItemSetFor, egraBatteryFor, EGRA_LETTER_EXTENSIONS, EGRA_MIN_LETTERS } from '..';

test('all source forms adapt without changing order, case, repeats or identity', () => {
  expect(EGRA_FORMS).toEqual(egraCatalog.assessments);
  expect(EGRA_BATTERIES).toHaveLength(13);
  let letters = 0, words = 0, questions = 0;
  for (const form of EGRA_FORMS) {
    const adapted = adaptEgraForm(form);
    expect(adapted.form).toBe(form);
    const extension = EGRA_LETTER_EXTENSIONS[form.id] ?? [];
    expect(adapted.itemSets.letter_sounds.rows.flat()).toEqual([...form.letters.items.map(i => i.text), ...extension]);
    expect(adapted.itemSets.letter_sounds.rows.flat().length).toBeGreaterThanOrEqual(EGRA_MIN_LETTERS);
    const letterVersion = extension.length ? `${form.id}-masi60` : form.id;
    expect(adapted.itemSets.word_reading.words.map(i => i.word)).toEqual(form.words.items.map(i => i.text));
    letters += adapted.itemSets.letter_sounds.rows.flat().length;
    words += adapted.itemSets.word_reading.words.length;
    questions += adapted.itemSets.reading_comprehension.questions.length;
    expect(adapted.battery).toMatchObject({ battery_code: 'egra', battery_version: form.id, fixedLanguage: form.languageCode, languages: [form.languageCode], prerequisites: {} });
    for (const [code, set] of Object.entries(adapted.itemSets)) {
      const version = code === 'letter_sounds' ? letterVersion : form.id;
      expect(set).toMatchObject({ question_code: code, question_version: version, language: form.languageCode, item_set_id: `${code}@${version}.${form.languageCode}` });
      expect(egraItemSetFor(code, version, form.languageCode)).toEqual(set);
      expect(egraItemSetFor(code, version, 'unknown')).toBeNull();
      expect(egraItemSetFor(code, version, form.languageCode === 'en' ? 'xh' : 'en')).toBeNull();
    }
    if (extension.length) expect(egraItemSetFor('letter_sounds', form.id, form.languageCode)).toBeNull();
    expect(adapted.battery.prerequisites).toEqual({
      reading_comprehension: { depends_on: 'oral_reading', minScore: 1, on_unmet_reason: 'skipped_prerequisite_unmet' },
    });
    for (const grid of [form.letters, form.words]) grid.items.forEach((item, position) => expect(position + 1).toBe(Number(item.id)));
    expect(adapted.itemSets.letter_sounds.stop_rule).toEqual({ kind: 'first_row_all_wrong', first_row_length: form.letters.columns });
    expect(adapted.itemSets.word_reading.row_lengths).toEqual(Array(form.words.items.length / form.words.columns).fill(form.words.columns));
    const passage = adapted.itemSets.oral_reading;
    expect(passage.words.map(w => w.word).join(' ')).toBe(form.passage.text.trim().replace(/\s+/g, ' '));
    expect(passage.paragraph_starts).toHaveLength(form.passage.text.split('\n\n').length);
    expect(adapted.battery.questions.map(q => q.title)).toEqual(['Letter sounds', 'Familiar words', 'Reading a story', 'Story questions']);
    adapted.battery.questions.forEach((q, i) => {
      expect(q.question_version).toBe(i === 0 ? letterVersion : form.id);
      expect(q.instructions?.[form.languageCode]).toBeTruthy();
      if (q.question_code === 'oral_reading') {
        expect(q.instructions?.[form.languageCode]).toBe("Ask the child to read the story aloud. Mark each word Correct or Incorrect. The black ring shows which word you're on. The test stops by itself when the time is up.");
      }
      expect(q.durationSec).toBe(i === 3 ? undefined : 60);
      expect(q.materials).toEqual(i === 3 ? null : { item: 'reading_card' });
    });
  }
  expect([letters, words, questions]).toEqual([1000, 990, 65]);
});

test('exact lookups and filters never fall back; English HL and FAL remain distinct', () => {
  const hl = egraBatteryFor('egra', 'dbe-egra-en-hl-2-v1');
  const fal = egraBatteryFor('egra', 'dbe-egra-en-fal-2-v1');
  expect(hl).not.toEqual(fal);
  expect(listEgraForms({ languageCode: 'en', variant: 'fal' })).toHaveLength(3);
  expect(listEgraForms({ languageCode: 'unknown' })).toEqual([]);
  expect(egraFormFor('unknown')).toBeNull();
  expect(egraBatteryFor('unknown', fal!.battery_version)).toBeNull();
  expect(egraBatteryFor('egra', 'unknown')).toBeNull();
  expect(egraItemSetFor('unknown', fal!.battery_version, 'en')).toBeNull();
  expect(egraItemSetFor('oral_reading', 'unknown', 'en')).toBeNull();
});

test('printed discrepancies and spaced punctuation are preserved', () => {
  expect(adaptEgraForm(egraFormFor('dbe-egra-af-hl-2-v1')!).itemSets.letter_sounds.rows.flat()).toHaveLength(70);
  expect(adaptEgraForm(egraFormFor('dbe-egra-en-fal-2-v1')!).itemSets.word_reading.words).toHaveLength(60);
  expect(adaptEgraForm(egraFormFor('dbe-egra-en-fal-3-v1')!).itemSets.oral_reading.words.map(w => w.word)).toContain('Lebo .');
  const xh = adaptEgraForm(egraFormFor('dbe-egra-xh-hl-3-v1')!).itemSets.oral_reading.words.map(w => w.word);
  expect(xh.slice(xh.indexOf('uNomehlo-'), xh.indexOf('uNomehlo-') + 2)).toEqual(['uNomehlo-', 'mancinane.']);
});

test('only the four 40-letter Grade 1 cards are extended, each to a balanced 60', () => {
  const short = EGRA_FORMS.filter(form => form.letters.items.length < EGRA_MIN_LETTERS).map(form => form.id).sort();
  expect(Object.keys(EGRA_LETTER_EXTENSIONS).sort()).toEqual(short);
  expect(short).toEqual(['dbe-egra-af-hl-1-v1', 'dbe-egra-en-fal-1-v1', 'dbe-egra-en-hl-1-v1', 'dbe-egra-xh-hl-1-v1']);
  const confusable = new Set(['bd', 'db', 'pq', 'qp', 'mw', 'wm', 'nu', 'un', 'bp', 'pb', 'dq', 'qd']);
  for (const id of short) {
    const form = egraFormFor(id)!;
    const extension = EGRA_LETTER_EXTENSIONS[id];
    const lower = extension.map(letter => letter.toLowerCase());
    expect(extension).toHaveLength(20);
    expect(new Set(lower).size).toBe(20); // 20 different letters
    expect(extension.filter(letter => letter !== letter.toLowerCase())).toHaveLength(10); // 10 capitals
    const rows = adaptEgraForm(form).itemSets.letter_sounds.rows;
    expect(rows.map(row => row.length)).toEqual(Array(6).fill(10));
    expect(rows.slice(0, 4).flat()).toEqual(form.letters.items.map(item => item.text)); // DBE letters first, untouched
    const counts = new Map<string, number>();
    rows.flat().forEach(letter => counts.set(letter.toLowerCase(), (counts.get(letter.toLowerCase()) ?? 0) + 1));
    expect(Math.max(...counts.values())).toBeLessThanOrEqual(4);
    // Neighbours within each new row, plus the join from the last DBE letter.
    const pairs = [[rows[3][9], rows[4][0]], ...[rows[4], rows[5]].flatMap(row => row.slice(1).map((letter, i) => [row[i], letter]))];
    for (const [a, b] of pairs) {
      expect(a.toLowerCase()).not.toBe(b.toLowerCase());
      expect(confusable.has(`${a}${b}`.toLowerCase())).toBe(false);
    }
  }
});

test('a short letter card without a Masi extension is rejected', () => {
  const form = JSON.parse(JSON.stringify(egraFormFor('dbe-egra-en-hl-1-v1')));
  form.id = 'dbe-egra-new-short-v1';
  expect(() => adaptEgraForm(form)).toThrow('Masi cards need at least 60');
});

test.each(['id', 'columns', 'empty', 'letter', 'maxScore'])('rejects malformed %s with the form name', change => {
  const form = JSON.parse(JSON.stringify(egraCatalog.assessments[0]));
  if (change === 'id') form.words.items[1].id = '1';
  if (change === 'columns') form.words.columns = 7;
  if (change === 'empty') form.passage.text = '  ';
  if (change === 'letter') form.letters.items[0].text = 'ab';
  if (change === 'maxScore') form.comprehension.questions[0].maxScore = 2;
  expect(() => adaptEgraForm(form)).toThrow(TypeError);
  expect(() => adaptEgraForm(form)).toThrow(form.id);
});

test('story questions auto-skip when the child read no story words or the story was skipped', () => {
  const { evaluateBatteryState } = require('../../battery/evaluateBatteryState');
  const battery = egraBatteryFor('egra', 'dbe-egra-en-fal-2-v1')!;
  const before = [
    { question_code: 'letter_sounds', stopped_reason: 'timer', score: 20 },
    { question_code: 'word_reading', stopped_reason: 'timer', score: 5 },
  ];
  const story = (stopped_reason: string, score: number | null) =>
    evaluateBatteryState(battery, [...before, { question_code: 'oral_reading', stopped_reason, score }]);
  expect(story('ea_ended', 0).autoSkips).toEqual([{ question_code: 'reading_comprehension', reason: 'skipped_prerequisite_unmet', trigger: null }]);
  expect(story('ea_ended', 0).nextQuestion).toBeNull();
  expect(story('skipped_tired', null).autoSkips).toHaveLength(1);
  expect(story('timer', 1).autoSkips).toEqual([]);
  expect(story('timer', 1).nextQuestion?.question_code).toBe('reading_comprehension');
  // Letters and words never auto-skip yet (stronger skip rules are a later decision).
  expect(evaluateBatteryState(battery, [{ question_code: 'letter_sounds', stopped_reason: 'stop_rule', score: 0 }]).nextQuestion?.question_code).toBe('word_reading');
});

test('EGRA: the story-questions gate still needs one word marked Correct', () => {
  const { battery, itemSets } = adaptEgraForm(egraFormFor('dbe-egra-en-fal-2-v1')!);
  const { buildEgraResult } = require('../../../../test-support/egraResults');
  const before = ['letter_sounds', 'word_reading'].map(question_code => ({ question_code, stopped_reason: 'timer' as const, score: 5 }));
  for (const totalCorrect of [0, 1]) {
    const result = buildEgraResult(itemSets.oral_reading, { reason: 'ea_ended', attempted: 3, correct: totalCorrect ? [0] : [] });
    expect(result.derived.capture_mode).toBe('sequential');
    expect(result.items.filter((item: any) => item.metadata.reached)).toHaveLength(3);
    const state = evaluateBatteryState(battery, [...before, { question_code: result.question_code, stopped_reason: result.stopped_reason, score: result.derived.total_correct }]);
    expect(state.autoSkips).toEqual(totalCorrect ? [] : [{ question_code: 'reading_comprehension', reason: 'skipped_prerequisite_unmet', trigger: null }]);
    expect(state.nextQuestion?.question_code ?? null).toBe(totalCorrect ? 'reading_comprehension' : null);
  }
});
