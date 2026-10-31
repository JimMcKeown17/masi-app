import React from 'react';
import { Modal } from 'react-native';
import { act, fireEvent, render, within } from '@testing-library/react-native';
import { SequentialCapture } from '../SequentialCapture';
import { flatCopy } from '../captureCopy';
import type { Result } from '../../types/Result';
import { LETTER_PAGE_LAYOUT } from '../../ui';

jest.mock('../clock', () => ({ monotonicNow: () => globalThis.performance.now() }));
beforeEach(() => jest.useFakeTimers());
afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); });

const options = [{ key: 'head', label: 'In their head' }, { key: 'fingers', label: 'Fingers' },
  { key: 'not_seen', label: "Couldn't tell", exclusive: true }];
function setup(overrides: Partial<React.ComponentProps<typeof SequentialCapture>> = {}) {
  const onComplete = jest.fn<void, [Result]>();
  const r = render(<SequentialCapture language="en" childName="Amahle"
    itemSet={{ item_set_id: 'observation@fixture.en', question_code: 'observation', question_version: 'fixture', language: 'en' }}
    items={['a','b','c'].map(prompt => ({ item_key: prompt, prompt }))}
    body={{ kind: 'grid', rows: [[0,1,2]], layout: LETTER_PAGE_LAYOUT, variant: 'letter', testID: 'grid' }}
    copy={flatCopy('letter', 3)} stopRule={null} testIDPrefix="observation" observation={{ options }}
    onComplete={onComplete} {...overrides} />);
  const press = (label: string) => fireEvent.press(r.getByText(label));
  const advance = (ms: number) => act(() => jest.advanceTimersByTime(ms));
  return { ...r, onComplete, press, advance, start: () => press('Start'),
    mark: (...values: boolean[]) => values.forEach(value => press(value ? 'Correct' : 'Incorrect')),
    result: () => onComplete.mock.calls[0][0],
    hasPanel: () => expect(r.getByRole('header', { name: 'How did Amahle work these out? Tick all you saw.' })).toBeTruthy(),
    save: () => { press('In their head'); press('Save'); },
    end: () => { fireEvent.press(r.getByTestId('observation-end')); fireEvent.press(within(r.getByTestId('end-confirmation')).getByText('End question')); },
  };
}

test('observation opens after review Finish and saves the ticked strategies', () => {
  const r = setup({ durationSec: 60 }); r.start(); r.advance(20000); r.mark(true, false, true); r.press('Finish');
  r.hasPanel(); expect(r.onComplete).not.toHaveBeenCalled();
  expect(r.queryByTestId('grid')).toBeNull(); expect(r.queryByText('Finish')).toBeNull();
  expect(r.getByRole('button', { name: 'Save' })).toBeDisabled();
  r.press('Fingers'); r.press('In their head'); r.advance(120000); r.press('Save');
  expect(r.result()).toMatchObject({ stopped_reason: 'completed', duration_ms: 20000,
    derived: { strategies: ['head','fingers'], total_correct: 2 } });
});

test('observation opens after StopCard save with no modal left', () => {
  const r = setup({ durationSec: 60, stopRule: { kind: 'consecutive_wrong', stop_at: 1 } });
  r.start(); r.advance(10000); r.mark(true, false); r.advance(20000); r.press('Save result');
  r.hasPanel(); expect(r.queryByTestId('stop-card')).toBeNull();
  expect(r.queryByTestId('end-confirmation')).toBeNull(); expect(r.UNSAFE_queryByType(Modal)).toBeNull();
  expect(r.onComplete).not.toHaveBeenCalled(); r.advance(120000); r.save();
  expect(r.result()).toMatchObject({ stopped_reason: 'stop_rule', duration_ms: 10000, derived: { strategies: ['head'] } });
  expect(r.onComplete).toHaveBeenCalledTimes(1);
});

test('End then observation keeps the frozen duration', () => {
  const r = setup({ durationSec: 60 }); r.start(); r.mark(true); r.advance(15000);
  fireEvent.press(r.getByTestId('observation-end')); r.advance(20000);
  fireEvent.press(within(r.getByTestId('end-confirmation')).getByText('End question'));
  r.hasPanel(); expect(r.queryByTestId('end-confirmation')).toBeNull(); expect(r.UNSAFE_queryByType(Modal)).toBeNull();
  r.advance(120000); r.save();
  expect(r.result()).toMatchObject({ stopped_reason: 'ea_ended', duration_ms: 15000, derived: { strategies: ['head'] } });
  expect(r.result().items.map(item => item.metadata?.reached)).toEqual([true,false,false]);
  expect(r.onComplete).toHaveBeenCalledTimes(1);
});

test('timer expiry opens observation', () => {
  const r = setup({ durationSec: 60 }); r.start(); r.mark(true); r.advance(60000);
  r.hasPanel(); expect(r.onComplete).not.toHaveBeenCalled(); r.advance(60000); r.save();
  expect(r.result()).toMatchObject({ stopped_reason: 'timer', duration_ms: 60000, derived: { strategies: ['head'] } });
});

test.each(['completed', 'timer', 'stop_rule', 'ea_ended'] as const)('zero correct skips observation and saves strategies [] (%s)', reason => {
  const r = setup({ durationSec: 60, stopRule: reason === 'stop_rule' ? { kind: 'consecutive_wrong', stop_at: 1 } : null });
  r.start();
  if (reason === 'completed') { r.mark(false, false, false); r.press('Finish'); }
  if (reason === 'timer') r.advance(60000); // zero attempts too
  if (reason === 'stop_rule') { r.mark(false); r.press('Save result'); }
  if (reason === 'ea_ended') r.end();
  expect(r.queryByText('How did Amahle work these out? Tick all you saw.')).toBeNull();
  expect(r.onComplete).toHaveBeenCalledTimes(1);
  expect(r.result()).toMatchObject({ stopped_reason: reason, derived: { strategies: [], total_correct: 0 } });
});

test('a skipped Question never asks and has no strategies key', () => {
  const r = setup(); r.start(); r.mark(true); r.press('Skip question'); r.press('Child is tired');
  expect(r.result().stopped_reason).toBe('skipped_tired');
  expect(r.result().items).toEqual([]); expect(r.result().derived).not.toHaveProperty('strategies');
  expect(r.onComplete).toHaveBeenCalledTimes(1);
});

test('onComplete fires once', () => {
  const r = setup({ durationSec: 60 }); r.start(); r.mark(true, true, true);
  const finish = r.getByText('Finish'); act(() => { fireEvent.press(finish); fireEvent.press(finish); });
  r.hasPanel(); expect(r.onComplete).not.toHaveBeenCalled(); r.press('In their head');
  const save = r.getByText('Save'); act(() => { fireEvent.press(save); fireEvent.press(save); });
  r.advance(120000); expect(r.onComplete).toHaveBeenCalledTimes(1);
});

test('finalizeResult runs after strategies are set', () => {
  const finalizeResult = jest.fn((base: Result) => ({ ...base, derived: { ...base.derived, seen: base.derived.strategies } }));
  const r = setup({ finalizeResult }); r.start(); r.mark(true, true, true); r.press('Finish');
  expect(finalizeResult).not.toHaveBeenCalled(); r.save();
  expect(finalizeResult).toHaveBeenCalledTimes(1); expect(r.result().derived.seen).toEqual(['head']);
});
