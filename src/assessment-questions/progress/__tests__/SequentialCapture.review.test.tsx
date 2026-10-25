import React from 'react';
import { act, fireEvent, render, within } from '@testing-library/react-native';
import { SequentialCapture } from '../SequentialCapture';
import { flatCopy } from '../captureCopy';
import type { Result, ResultItem } from '../../types/Result';
import { LETTER_PAGE_LAYOUT } from '../../ui';

jest.mock('../clock', () => ({ monotonicNow: () => globalThis.performance.now() }));

beforeEach(() => jest.useFakeTimers());
afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); });

function renderCapture(overrides: Partial<React.ComponentProps<typeof SequentialCapture>> = {}) {
  const onComplete = jest.fn<void, [Result]>();
  const items = ['a', 'b', 'c'].map(prompt => ({ item_key: prompt, prompt }));
  const r = render(<SequentialCapture language="en"
    itemSet={{ item_set_id: 'review@fixture.en', question_code: 'review', question_version: 'fixture', language: 'en' }}
    items={items} body={{ kind: 'grid', rows: [[0, 1, 2]], layout: LETTER_PAGE_LAYOUT, variant: 'letter', testID: 'letter-grid' }}
    copy={flatCopy('letter', 3)} stopRule={null} testIDPrefix="letter" onComplete={onComplete} {...overrides} />);
  const press = (text: string) => fireEvent.press(r.getByText(text));
  const mark = (...values: boolean[]) => values.forEach(value => press(value ? 'Correct' : 'Incorrect'));
  const result = () => onComplete.mock.calls[0][0];
  const advance = (ms: number) => act(() => jest.advanceTimersByTime(ms));
  return { ...r, onComplete, press, mark, result, advance, start: () => press('Start') };
}

test('the last mark opens review instead of saving', () => {
  const r = renderCapture(); r.start(); r.mark(true, true, true);
  expect(r.onComplete).not.toHaveBeenCalled();
  expect(r.getByText('Finish')).toBeTruthy();
  ['Correct', 'Incorrect', 'End question'].forEach(text => expect(r.queryByText(text)).toBeNull());
  expect(r.getByLabelText('All 3 marked · 3 correct. Tap any letter to change it.')).toBeTruthy();
});

test('Finish saves completed with the final marks', () => {
  const r = renderCapture(); r.start(); r.mark(true, false, true); r.press('Finish');
  expect(r.onComplete).toHaveBeenCalledTimes(1);
  expect(r.result().stopped_reason).toBe('completed');
  expect(r.result().items.map((i) => i.is_correct)).toEqual([true, false, true]);
  expect(r.result().items.every((i) => i.metadata?.reached === true)).toBe(true);
  expect(r.result().derived).toMatchObject({ total_correct: 2, total_attempted: 3, percent: 67,
    last_attempted_position: 2, tracks_progress: true, capture_mode: 'sequential', correction_count: 0 });
});

test('a flip in review changes the saved mark and adds one correction', () => {
  const r = renderCapture(); r.start(); r.mark(true, true, true);
  fireEvent.press(r.getByLabelText('b, correct. Double-tap to change to incorrect')); r.press('Finish');
  expect(r.result().items.map((i) => i.is_correct)).toEqual([true, false, true]);
  expect(r.result().derived).toMatchObject({ correction_count: 1, percent: 67 });
});

test('Back from review clears the last mark and returns to marking', () => {
  const r = renderCapture(); r.start(); r.mark(true, true, true); r.press('Back');
  expect(r.getByLabelText('c, current')).toBeTruthy(); expect(r.getByText('Correct')).toBeTruthy();
  expect(r.queryByLabelText(/All 3 marked/)).toBeNull();
});

test('a flip keeps the ring on the current item and shows "Letter 1 changed to Incorrect" for 3 s', () => {
  const r = renderCapture(); r.start(); r.mark(true);
  fireEvent.press(r.getByLabelText('a, correct. Double-tap to change to incorrect'));
  expect(r.getByLabelText('b, current')).toBeTruthy();
  expect(r.getByTestId('flip-notice')).toHaveTextContent('Letter 1 changed to Incorrect');
  r.advance(2999); expect(r.getByTestId('flip-notice')).toBeTruthy();
  r.advance(1); expect(r.queryByTestId('flip-notice')).toBeNull();
});

test('current and not-reached tiles are not buttons; marked tiles are buttons with the double-tap hint', () => {
  const r = renderCapture(); r.start();
  expect(r.getByRole('text', { name: 'a, current' })).toBeTruthy();
  expect(within(r.getByTestId('letter-grid')).queryAllByRole('button')).toHaveLength(0);
  r.mark(true);
  expect(within(r.getByTestId('letter-grid')).getAllByRole('button')).toHaveLength(1);
  expect(r.getByRole('button', { name: 'a, correct. Double-tap to change to incorrect' })).toBeTruthy();
  expect(r.getByRole('text', { name: 'c, not reached' })).toBeTruthy();
});

test('End opens "End this question?" with marked and unmarked counts; End question saves ea_ended with the tail not reached', () => {
  const r = renderCapture(); r.start(); r.mark(true); fireEvent.press(r.getByTestId('letter-end'));
  const sheet = within(r.getByTestId('end-confirmation'));
  expect(sheet.getByText('End this question?')).toBeTruthy();
  expect(sheet.getByText("1 marked. The 2 not marked won't count towards the score.")).toBeTruthy();
  fireEvent.press(sheet.getByText('End question'));
  expect(r.result().stopped_reason).toBe('ea_ended');
  expect(r.result().items.map((i) => i.metadata?.reached)).toEqual([true, false, false]);
  expect(r.result().derived).toMatchObject({ total_attempted: 1, percent: 100 });
});

test('Keep marking returns to marking with marks kept', () => {
  const r = renderCapture(); r.start(); r.mark(true); fireEvent.press(r.getByTestId('letter-end')); r.press('Keep marking');
  expect(r.getByLabelText('a, correct. Double-tap to change to incorrect')).toBeTruthy();
  expect(r.getByLabelText('b, current')).toBeTruthy(); expect(r.onComplete).not.toHaveBeenCalled();
});

test('endNoun "test" reads End test and End this test?', () => {
  const r = renderCapture({ endNoun: 'test' }); r.start(); r.press('End test');
  expect(r.getByText('End this test?')).toBeTruthy();
  expect(within(r.getByTestId('end-confirmation')).getByText('End test')).toBeTruthy();
});

test('timed: reading time stops at the last mark and review time is not counted', () => {
  const r = renderCapture({ durationSec: 60 }); r.start(); r.advance(20000); r.mark(true, true, true);
  r.advance(30000); r.press('Finish');
  expect(r.result().duration_ms).toBe(20000); expect(r.result().derived.was_timed).toBe(true);
});

test('timed: Back from review resumes the remaining time', () => {
  const r = renderCapture({ durationSec: 60 }); r.start(); r.advance(20000); r.mark(true, true, true);
  r.advance(30000); r.press('Back'); expect(r.getByText('40s')).toBeTruthy(); r.advance(40000);
  expect(r.result()).toMatchObject({ stopped_reason: 'timer', duration_ms: 60000 });
});

test('timer end saves at once with no review', () => {
  const r = renderCapture({ durationSec: 60 }); r.start(); r.mark(true); r.advance(60000);
  expect(r.result()).toMatchObject({ stopped_reason: 'timer', derived: { last_attempted_position: 0 } });
  expect(r.queryByText('Finish')).toBeNull();
});

test('review → Skip → Cancel returns to review with marks and the frozen time kept', () => {
  const r = renderCapture({ durationSec: 60 }); r.start(); r.advance(20000); r.mark(true, true, true);
  r.press('Skip question'); r.advance(50000); r.press('Cancel');
  expect(r.onComplete).not.toHaveBeenCalled(); expect(r.getByText('Finish')).toBeTruthy();
  fireEvent.press(r.getByLabelText('b, correct. Double-tap to change to incorrect')); r.press('Finish');
  expect(r.result().duration_ms).toBe(20000); expect(r.result().derived.total_correct).toBe(2);
});

test('active → Skip → Cancel returns to marking as today', () => {
  const r = renderCapture({ durationSec: 60 }); r.start(); r.mark(true); r.advance(10000);
  r.press('Skip question'); r.advance(5000); r.press('Cancel');
  expect(r.getByLabelText('b, current')).toBeTruthy(); expect(r.getByText('45s')).toBeTruthy();
  r.advance(45000); expect(r.result()).toMatchObject({ stopped_reason: 'timer', duration_ms: 60000 });
});

test.each(['grid', 'groups'] as const)('an empty item set shows the no-items card and never starts (%s)', kind => {
  const onStart = jest.fn();
  const body = kind === 'grid'
    ? { kind, rows: [], layout: LETTER_PAGE_LAYOUT, variant: 'letter' as const, testID: 'empty' }
    : { kind, groups: [], card: false, variant: 'letter' as const, testID: 'empty' };
  const r = renderCapture({ items: [], body, onStart });
  expect(r.getByTestId('missing-item-set-en')).toHaveTextContent("This test's card has no items.");
  expect(r.queryByText('Start')).toBeNull(); expect(onStart).not.toHaveBeenCalled();
});

test('rapid double Correct on the last item decides once and opens review', () => {
  const onItemMarked = jest.fn<void, [ResultItem]>(); const r = renderCapture({ onItemMarked }); r.start(); r.mark(true, true);
  const correct = r.getByText('Correct'); act(() => { fireEvent.press(correct); fireEvent.press(correct); });
  expect(r.onComplete).not.toHaveBeenCalled(); expect(r.getByText('Finish')).toBeTruthy();
  expect(onItemMarked).toHaveBeenCalledTimes(3);
});

test('Back from review with under 250 ms left saves timer at the deadline', () => {
  const r = renderCapture({ durationSec: 60 }); r.start(); r.advance(59900); r.mark(true, true, true);
  r.advance(10100); r.press('Back'); r.advance(250);
  expect(r.result()).toMatchObject({ stopped_reason: 'timer', duration_ms: 60000 });
});

test("paged: in review the arrows browse every page; Back returns to the current item's page", () => {
  const items = Array.from({ length: 25 }, (_, p) => ({ item_key: 'repeated', prompt: String.fromCharCode(97 + p) }));
  const r = renderCapture({ items, copy: flatCopy('letter', 25), body: { kind: 'grid', rows: [items.map((_, p) => p)],
    layout: LETTER_PAGE_LAYOUT, variant: 'letter', testID: 'letter-grid' } });
  r.start(); r.mark(...items.map(() => true));
  expect(r.getByLabelText('Card row 1 · page 2 of 2')).toBeTruthy();
  fireEvent.press(r.getByLabelText('Previous page'));
  fireEvent.press(within(r.getByTestId('letter-grid')).getByTestId('tile-0'));
  fireEvent.press(r.getByLabelText('Next page'));
  expect(r.getByLabelText('y, correct. Double-tap to change to incorrect')).toBeTruthy();
  fireEvent.press(r.getByLabelText('Previous page')); r.press('Back');
  expect(r.getByLabelText('Card row 1 · page 2 of 2')).toBeTruthy(); expect(r.getByLabelText('y, current')).toBeTruthy();
  r.mark(true); r.press('Finish');
  expect(r.result().items[0].is_correct).toBe(false);
  expect(r.result().items[24].is_correct).toBe(true);
});

test('finalizeResult receives the base Result and its return is emitted', () => {
  const finalizeResult = jest.fn((base: Result) => ({ ...base, derived: { ...base.derived, custom: 123 } }));
  const r = renderCapture({ finalizeResult }); r.start(); r.mark(true, true, true); r.press('Finish');
  expect(finalizeResult).toHaveBeenCalledTimes(1);
  expect(finalizeResult.mock.calls[0][0].derived.total_correct).toBe(3);
  expect(r.result().derived.custom).toBe(123);
});

test('onItemMarked fires on decide and on flip with the new value, not on Back', () => {
  const onItemMarked = jest.fn<void, [ResultItem]>(); const r = renderCapture({ onItemMarked }); r.start(); r.mark(true);
  fireEvent.press(r.getByLabelText('a, correct. Double-tap to change to incorrect')); r.press('Back');
  expect(onItemMarked).toHaveBeenCalledTimes(2);
  expect(onItemMarked.mock.calls.map(([i]) => i.is_correct)).toEqual([true, false]);
  expect(onItemMarked.mock.calls[1][0]).toMatchObject({ position: 0, item_key: 'a', metadata: { reached: true } });
});
