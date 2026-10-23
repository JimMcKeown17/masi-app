import { egraCatalog } from '../../../../content/egra';
import { adaptEgraForm, EGRA_FORMS, EGRA_BATTERIES, egraFormFor, listEgraForms, egraItemSetFor, egraBatteryFor } from '..';

test('all source forms adapt without changing order, case, repeats or identity', () => {
  expect(EGRA_FORMS).toEqual(egraCatalog.assessments);
  expect(EGRA_BATTERIES).toHaveLength(13);
  let letters = 0, words = 0, questions = 0;
  for (const form of EGRA_FORMS) {
    const adapted = adaptEgraForm(form);
    expect(adapted.form).toBe(form);
    expect(adapted.itemSets.letter_sounds.rows.flat()).toEqual(form.letters.items.map(i => i.text));
    expect(adapted.itemSets.word_reading.words.map(i => i.word)).toEqual(form.words.items.map(i => i.text));
    letters += adapted.itemSets.letter_sounds.rows.flat().length;
    words += adapted.itemSets.word_reading.words.length;
    questions += adapted.itemSets.reading_comprehension.questions.length;
    expect(adapted.battery).toMatchObject({ battery_code: 'egra', battery_version: form.id, fixedLanguage: form.languageCode, languages: [form.languageCode], prerequisites: {} });
    for (const [code, set] of Object.entries(adapted.itemSets)) {
      expect(set).toMatchObject({ question_code: code, question_version: form.id, language: form.languageCode, item_set_id: `${code}@${form.id}.${form.languageCode}` });
      expect(egraItemSetFor(code, form.id, form.languageCode)).toEqual(set);
      expect(egraItemSetFor(code, form.id, 'unknown')).toBeNull();
      expect(egraItemSetFor(code, form.id, form.languageCode === 'en' ? 'xh' : 'en')).toBeNull();
    }
    for (const grid of [form.letters, form.words]) grid.items.forEach((item, position) => expect(position + 1).toBe(Number(item.id)));
    expect(adapted.itemSets.letter_sounds.stop_rule).toEqual({ kind: 'first_row_all_wrong', first_row_length: form.letters.columns });
    expect(adapted.itemSets.word_reading.row_lengths).toEqual(Array(form.words.items.length / form.words.columns).fill(form.words.columns));
    const passage = adapted.itemSets.oral_reading;
    expect(passage.words.map(w => w.word).join(' ')).toBe(form.passage.text.trim().replace(/\s+/g, ' '));
    expect(passage.paragraph_starts).toHaveLength(form.passage.text.split('\n\n').length);
    expect(adapted.battery.questions.map(q => q.title)).toEqual(['Letter sounds', 'Familiar words', 'Reading a story', 'Story questions']);
    adapted.battery.questions.forEach((q, i) => {
      expect(q.question_version).toBe(form.id);
      expect(q.instructions?.[form.languageCode]).toBeTruthy();
      expect(q.durationSec).toBe(i === 3 ? undefined : 60);
      expect(q.materials).toEqual(i === 3 ? null : { item: 'reading_card' });
    });
  }
  expect([letters, words, questions]).toEqual([920, 990, 65]);
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
