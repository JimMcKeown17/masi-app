import { getEgmaAssessment } from '../../../../content/egma';
import { adaptEgmaForm, EARLY_STOP_AT, CORE_STOP_AT, COUNT_ALOUD_STOP_AT, MATHS_QUESTION_CODES } from '../adapter';
import { EGMA_FORMS, MASI_MATHS_BATTERIES, MASI_MATHS_2026_1_DRAFT } from '..';

const form = getEgmaAssessment('masi-egma-en-2026-1-draft')!;
const rows = [
  ['maths_count_aloud','Count aloud',null,null], ['maths_quick_see','Finger flash',null,null],
  ['maths_count_out','Count out counters',null,{item:'counters'}], ['maths_read_numbers','Read numbers to 20',null,{item:'number_card',page:1}],
  ['egma_number_id','Read big numbers',60,{item:'number_card',page:3}], ['maths_which_more','Which is more?',null,{item:'number_card',page:2}],
  ['egma_number_discrimination','Bigger number',null,{item:'number_card',page:4}], ['maths_neighbours','Before and after',null,null],
  ['egma_missing_number','Missing number',null,{item:'number_card',page:5}], ['maths_add_counters','Add with counters',null,{item:'counters'}],
  ['maths_take_away_counters','Take away with counters',null,{item:'counters'}], ['maths_make_five_ten','Make 5 and make 10',null,null],
  ['egma_addition_l1','Addition 1',60,{item:'number_card',page:6}], ['egma_addition_l2','Addition 2',null,{item:'number_card',page:8}],
  ['egma_subtraction_l1','Subtraction 1',60,{item:'number_card',page:7}], ['egma_subtraction_l2','Subtraction 2',null,{item:'number_card',page:9}],
  ['egma_word_problems','Word problems',null,{item:'counters'}],
];

test('the draft form adapts to 17 item sets matching the pack exactly', () => {
  const adapted = adaptEgmaForm(form);
  expect(adapted.form).toBe(form); expect(EGMA_FORMS).toEqual([form]);
  expect(MASI_MATHS_BATTERIES).toEqual([MASI_MATHS_2026_1_DRAFT]);
  expect(MATHS_QUESTION_CODES).toEqual(rows.map(row => row[0]));
  expect(Object.keys(adapted.itemSets)).toEqual(MATHS_QUESTION_CODES);
  for (const question of form.questions) {
    const set = adapted.itemSets[question.questionCode as keyof typeof adapted.itemSets];
    expect(set).toMatchObject({ question_code: question.questionCode, question_version: form.id,
      language: 'en', item_set_id: `${question.questionCode}@${form.id}.en` });
    expect(set.items.map(item => ({ item_key:item.item_key,skill:item.skill,band:item.band })))
      .toEqual(question.items.map(item => ({item_key:item.id,skill:item.skill,band:item.band})));
  }
});

test('the battery matches the spec', () => {
  const { battery } = adaptEgmaForm(form);
  expect(battery).toMatchObject({ battery_code:'masi_maths',battery_version:'2026.1-draft',title:'Maths assessment',
    aboutMinutes:20,languages:['en'],fixedLanguage:'en',numberCard:'Number Card 2026.1' });
  expect(battery.questions.map(q => [q.question_code,q.title,q.durationSec ?? null,q.materials])).toEqual(rows);
  expect(battery.questions.map(q => q.question_version)).toEqual(rows.map(() => form.id));
  expect(battery.prerequisites).toEqual(Object.fromEntries([
    ['egma_number_id','maths_read_numbers',7], ['egma_number_discrimination','maths_which_more',7],
    ['egma_missing_number','maths_neighbours',7], ['egma_addition_l1','maths_add_counters',4],
    ['egma_addition_l2','egma_addition_l1',1], ['egma_subtraction_l1','maths_take_away_counters',4],
    ['egma_subtraction_l2','egma_subtraction_l1',1], ['egma_word_problems','maths_add_counters',4],
  ].map(([code,depends_on,minScore]) => [code,{depends_on,minScore,on_unmet_reason:'skipped_prerequisite_unmet',unmet_label:'Not ready yet'}])));
  for (const question of form.questions) {
    const copy = battery.questions.find(q => q.question_code === question.questionCode)!.instructions!.en;
    expect(copy).toBe(question.instructions + (question.practiceItems.length ? ` Practice first (not scored): ${question.practiceItems.join(', ')}` : ''));
  }
});

test('stop rules use the named constants', () => {
  expect([COUNT_ALOUD_STOP_AT,EARLY_STOP_AT,CORE_STOP_AT]).toEqual([1,3,4]);
  for (const [code,set] of Object.entries(adaptEgmaForm(form).itemSets)) expect(set.stop_rule).toEqual({kind:'consecutive_wrong',
    stop_at:code==='maths_count_aloud'?COUNT_ALOUD_STOP_AT:code.startsWith('egma_')?CORE_STOP_AT:EARLY_STOP_AT });
});

test.each([
  ['maths_count_aloud','Counts to 5',undefined], ['maths_quick_see','3 fingers','3'],
  ['maths_count_out','Give 4',undefined], ['maths_read_numbers','3',undefined],
  ['maths_which_more','2   4','4'], ['maths_neighbours','after 3','4'],
  ['egma_missing_number','5  6  7  __','8'], ['maths_add_counters','2 + 1','3'],
  ['maths_take_away_counters','3 − 1','2'], ['maths_make_five_ten','3 up','2 down'],
  ['egma_addition_l1','1 + 3','4'],
  ['egma_word_problems','Two children are in a taxi.\n(pause)\nThree more children get in.\n(pause)\nHow many children are in the taxi now?','5'],
])('display mapping for %s', (code,prompt,gloss) => {
  const sets = adaptEgmaForm(form).itemSets;
  expect(sets[code as keyof typeof sets].items[0]).toMatchObject({prompt});
  expect(sets[code as keyof typeof sets].items[0].gloss).toBe(gloss);
});

test('an item label overrides its generated prompt', () => {
  const copy = JSON.parse(JSON.stringify(form)); copy.questions[0].items[0].label='Start counting to five';
  expect(adaptEgmaForm(copy).itemSets.maths_count_aloud.items[0].prompt).toBe('Start counting to five');
});

test.each([
  ['non-sequential ids',(copy:any) => { copy.questions[0].items[0].id='2'; }],
  ['two nulls',(copy:any) => { copy.questions[8].items[0].slots=[5,null,7,null]; }],
  ['missing Question',(copy:any) => { copy.questions.pop(); }],
  ['wrong order',(copy:any) => { copy.questions.reverse(); }],
  ['invalid band',(copy:any) => { copy.questions[0].items[0].band=6; }],
  ['wrong answer',(copy:any) => { copy.questions[12].items[0].answer=99; }],
  ['invalid language',(copy:any) => { copy.languageCode='xh'; }],
] as const)('a bad form throws with its id (%s)', (_name,mutate) => {
  const copy = JSON.parse(JSON.stringify(form)); mutate(copy);
  expect(() => adaptEgmaForm(copy)).toThrow(TypeError);
  expect(() => adaptEgmaForm(copy)).toThrow(`${form.id}:`);
});
