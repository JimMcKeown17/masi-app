import React from 'react';
import { fireEvent, render, within } from '@testing-library/react-native';
import { getEgmaAssessment } from '../../../../content/egma';
import { batteryFor, bundledItemSetFor, questionComponentFor, evaluateBatteryState, egmaItemSetFor } from '../..';
import { validateResult } from '../../contractTest/validateResult';
import { validateMathsResult } from '../validateMathsResult';
import type { Result } from '../../types/Result';

const form = getEgmaAssessment('masi-egma-en-2026-1-draft')!;
test.each(form.questions)('every maths Question renders its registered component and saves a valid result: $questionCode', question => {
  const battery=batteryFor('masi_maths','2026.1-draft')!;
  const q=battery.questions.find(value=>value.question_code===question.questionCode)!;
  const set=bundledItemSetFor(q.question_code,q.question_version,'en')!;
  const mathsSet=egmaItemSetFor(q.question_code,q.question_version,'en')!;
  expect(set).toBe(mathsSet);
  const entry=questionComponentFor(q.question_code)!;
  const onComplete=jest.fn<void,[Result]>();
  const r=render(<entry.Component {...entry.extraProps} language="en" itemSet={set} instructions={q.instructions?.en}
    durationSec={q.durationSec} onComplete={onComplete} />);
  fireEvent.press(r.getByText('Start'));
  const choice = q.question_code==='maths_add_counters'?'Counted from 1':q.question_code==='maths_take_away_counters'?'Counted back':'Correct';
  fireEvent.press(r.getByText(choice)); fireEvent.press(r.getByTestId('maths-end'));
  fireEvent.press(within(r.getByTestId('end-confirmation')).getByText('End question'));
  if (r.queryByText('In their head')) { fireEvent.press(r.getByText('In their head')); fireEvent.press(r.getByText('Save')); }
  expect(onComplete).toHaveBeenCalledTimes(1);
  const result=onComplete.mock.calls[0][0];
  expect(validateResult(result,{stopRule:mathsSet.stop_rule ?? undefined})).toEqual({valid:true,errors:[]});
  expect(validateMathsResult(result)).toEqual({valid:true,errors:[]});
  expect(result.items.map(item=>[item.metadata?.skill,item.metadata?.band])).toEqual(question.items.map(item=>[item.skill,item.band]));
});

test('masi_maths gates chain through the real battery', () => {
  const battery=batteryFor('masi_maths','2026.1-draft')!;
  const state=evaluateBatteryState(battery,[{question_code:'maths_add_counters',score:3,stopped_reason:'completed'}]);
  expect(state.autoSkips.map(skip=>skip.question_code)).toEqual(['egma_addition_l1','egma_addition_l2','egma_word_problems']);
  expect(state.undecided).not.toContain('egma_addition_l2');
});
