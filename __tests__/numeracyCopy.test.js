import { getCurriculum, getStep } from '../content/numeracy-curriculum';
import { LessonDraftWriteError } from '../src/services/lessonDraftController';
import {
  CHIP_WORDS, PROGRAMME_CHANGED_NOTE, stepTitle, stepPhrase, nextLine, chipLabel,
  readyLine, needHelpLine, canHelpLine, lessonHeader, tickWhenLines, stripSummary,
  keepSumsTogether, numeracySaveErrorMessage,
} from '../src/numeracyLesson/copy';

const curriculum = getCurriculum();

test('step titles and phrases come from the content labels', () => {
  expect(stepTitle(curriculum, 'count.10')).toBe('Count objects · up to 10');
  expect(stepPhrase(curriculum, 'count.10')).toBe('Count objects up to 10');
  expect(stepPhrase(curriculum, 'add.10')).toBe('Add up to 10');
  expect(nextLine(curriculum, ['count.10', 'add.10'])).toBe('Next: Count objects up to 10 · Add up to 10');
  expect(nextLine(curriculum, [])).toBeNull();
  expect(lessonHeader({ groupNumber: 3, minutes: 18 })).toBe('Group 3 · 18 min lesson');
  for (const builder of [stepTitle, stepPhrase, chipLabel]) {
    expect(() => builder(curriculum, 'retired.5')).not.toThrow();
    expect(builder(curriculum, 'retired.5')).toBe('retired.5');
  }
  expect(nextLine(curriculum, ['retired.5'])).toBe('Next: retired.5');
  expect(tickWhenLines(curriculum, 'retired.5')).toBeNull();
  expect(stripSummary(curriculum, 'retired.5')).toBeNull();
  expect(PROGRAMME_CHANGED_NOTE).toBe('Your programme has changed. Go back and open it again.');
});

test('chip labels are short and every bundled skill has a chip word', () => {
  expect(CHIP_WORDS).toEqual({ finger_flash: 'Flash', count: 'Count', read_numbers: 'Read',
    compare: 'Compare', before_after: 'Before/after', add: 'Add', subtract: 'Take away',
    number_pairs: 'Pairs', count_aloud: 'Say', skip_count: 'Skip' });
  expect(Object.isFrozen(CHIP_WORDS)).toBe(true);
  for (const skill of curriculum.skills) expect(CHIP_WORDS).toHaveProperty(skill.key);
  for (const [key, label] of [['add.5', 'Add to 5'], ['finger_flash.5', 'Flash to 5'],
    ['subtract.10', 'Take away to 10'], ['skip_count.2s', 'Skip 2s to 20'], ['number_pairs.10', 'Make 10']]) {
    expect(chipLabel(curriculum, key)).toBe(label);
  }
  const custom = { skills: [{ key: 'new_skill', label: 'New skill', steps: [
    { key: 'new_skill.5', skill: 'new_skill', size: 5, label: 'up to 5' },
  ] }] };
  expect(chipLabel(custom, 'new_skill.5')).toBe('New skill up to 5');
});

test('need-help lines group children by the step they are still on', () => {
  const stillOn = [{ name: 'Sipho', stepKey: 'add.5' }, { name: 'Ayanda', stepKey: 'add.5' },
    { name: 'Lwazi', stepKey: 'count.10' }];
  const line = entries => needHelpLine({ curriculum, cardStepKey: 'add.10', stillOn: entries });
  expect(line(stillOn)).toBe('Sipho and Ayanda are still on up to 5 · Lwazi is still on Count objects up to 10');
  expect(line([stillOn[0], stillOn[2], stillOn[1]])).toBe(line(stillOn));
  expect(line([{ name: 'A', stepKey: null }, ...stillOn, { name: 'B', stepKey: null }]))
    .toBe(`${line(stillOn)} · A and B are not ready yet`);
  expect(line([{ name: 'A', stepKey: null }])).toBe('A is not ready yet');
  expect(line([{ name: 'A', stepKey: 'retired.5' }])).toBe('A is still on retired.5');
  expect(needHelpLine({ curriculum, cardStepKey: 'retired.5', stillOn })).toBe(
    'Sipho and Ayanda are still on Add up to 5 · Lwazi is still on Count objects up to 10');
  expect(line([])).toBeNull();
  expect(canHelpLine([])).toBeNull();
  expect(canHelpLine(['Sipho', 'Ayanda'])).toBe('Sipho and Ayanda can help a partner');
  expect(canHelpLine(['A', 'B', 'C'])).toBe('A, B and C can help a partner');
});

test('ready line wording', () => {
  for (const [readyCount, presentCount, text] of [[5, 6, '5 of 6 are ready'], [1, 1, '1 of 1 is ready'],
    [1, 6, '1 of 6 is ready'], [0, 6, '0 of 6 are ready']]) {
    expect(readyLine({ readyCount, presentCount })).toBe(text);
  }
});

test('sums never break across lines', () => {
  expect(keepSumsTogether('Ask: 2 + 2 · 3 + 1')).toBe('Ask: 2\u00a0+\u00a02 · 3\u00a0+\u00a01');
  expect(keepSumsTogether('10 − 2 = 8 · 5 - 1 = 4')).toBe('10\u00a0−\u00a02\u00a0=\u00a08 · 5\u00a0-\u00a01\u00a0=\u00a04');
  for (const value of [null, undefined, 3, {}]) expect(keepSumsTogether(value)).toBe(value);
  const text = '2 + 2';
  const kept = '2\u00a0+\u00a02';
  const custom = { skills: [{ key: 'add', label: text, steps: [{ key: 'add.5', skill: 'add',
    label: text, size: text, tick_when: { setup: text, ask: [text, text, text], expected: [text, text, text], rule: text } }] }] };
  expect(stepTitle(custom, 'add.5')).toBe(`${kept} · ${kept}`);
  expect(stepPhrase(custom, 'add.5')).toBe(`${kept} ${kept}`);
  expect(chipLabel(custom, 'add.5')).toBe(`Add to ${kept}`);
  expect(nextLine(custom, ['add.5'])).toBe(`Next: ${kept} ${kept}`);
  expect(needHelpLine({ curriculum: custom, cardStepKey: 'add.5', stillOn: [{ name: 'A', stepKey: 'add.5' }] }))
    .toBe(`A is still on ${kept}`);
  expect(tickWhenLines(custom, 'add.5')).toEqual({ setup: kept, items: Array(3).fill({ ask: kept, expected: kept }), rule: kept });
  expect(stripSummary(custom, 'add.5')).toBe(`${kept} ${kept}: ${kept} · ${kept} · ${kept}`);
});

test('tick-when lines carry setup, three asks with answers, and the rule', () => {
  const tick = getStep(curriculum, 'add.5').tick_when;
  expect(tickWhenLines(curriculum, 'add.5')).toEqual({ setup: tick.setup,
    items: [{ ask: '2\u00a0+\u00a03', expected: '5' }, { ask: '4\u00a0+\u00a01', expected: '5' },
      { ask: '2\u00a0+\u00a02', expected: '4' }], rule: 'All 3 right? Tick it.' });
  expect(stripSummary(curriculum, 'add.5')).toBe('Add up to 5: 2\u00a0+\u00a03 · 4\u00a0+\u00a01 · 2\u00a0+\u00a02');
});

test('a save error names the children whose steps cannot change', () => {
  expect(numeracySaveErrorMessage({ code: 'CHANGES_NOT_WRITABLE' }, ['Sipho']))
    .toBe("You can't update Sipho's steps any more.");
  expect(numeracySaveErrorMessage({ code: 'CHANGES_NOT_WRITABLE' }, ['Sipho', 'Ayanda']))
    .toBe("You can't update Sipho & Ayanda's steps any more.");
  expect(numeracySaveErrorMessage({ code: 'PROGRAMME_NOT_NUMERACY' }, []))
    .toBe('This is a numeracy lesson, but your programme has changed. Discard it to start again.');
  expect(numeracySaveErrorMessage({ code: 'GROUP_MISSING' }, []))
    .toBe('This group is no longer on this phone. Discard this lesson to start again.');
  expect(numeracySaveErrorMessage({ code: 'CHILD_NOT_WRITABLE' }, ['Sipho']))
    .toBe('Sipho is no longer one of your children. Go back and remove them from the lesson.');
  expect(numeracySaveErrorMessage({ code: 'CHILD_NOT_WRITABLE' }, ['A', 'B']))
    .toBe('A & B are no longer one of your children. Go back and remove them from the lesson.');
  expect(numeracySaveErrorMessage({ code: 'PROGRAMME_NOT_ACTIVE' }, []))
    .toBe("This lesson is for a programme you're no longer assigned to. Discard it to start again.");
  expect(numeracySaveErrorMessage({ code: 'ALREADY_SAVED' }, [])).toBe('This lesson was already saved.');
  expect(numeracySaveErrorMessage(new LessonDraftWriteError(), []))
    .toBe("Couldn't save your last change. Check the lesson and press Save again.");
  expect(numeracySaveErrorMessage(new Error(), [])).toBe("Couldn't save the lesson. Try again.");
});
