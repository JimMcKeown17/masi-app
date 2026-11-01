import { act, fireEvent, within } from '@testing-library/react-native';
import { MathsGridQuestion } from '..';
import { FIXTURE_MATHS_GRID_TIMED_EN as fixture } from '../../../testFixtures';
import { runContractTest } from '../../../contractTest/runContractTest';
import type { Result } from '../../../types/Result';
import { validateMathsResult } from '../../../egma/validateMathsResult';

jest.mock('../../../progress/clock', () => ({ monotonicNow: () => globalThis.performance.now() }));
beforeEach(() => jest.useFakeTimers());
afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); });
function setup() {
  const validateMaths = jest.fn<ReturnType<typeof validateMathsResult>, [Result]>(validateMathsResult);
  const { rendered, verdict } = runContractTest(MathsGridQuestion, {
    language: 'en', itemSet: fixture, durationSec: 60, instructions: 'Read each sum.', childName: 'Amahle',
  }, { stopRule: fixture.stop_rule ?? undefined, extraValidators: [validateMaths] });
  const press = (label: string) => fireEvent.press(rendered.getByText(label));
  return { ...rendered, verdict, press, result: () => validateMaths.mock.calls[0][0],
    advance: (ms: number) => act(() => jest.advanceTimersByTime(ms)),
    observe: () => { press('In their head'); press('Save'); },
  };
}

test('timed grid: End mid-way gives a contract-valid result with rate fields', async () => {
  const r = setup(); r.press('Start'); r.advance(10000); r.press('Correct');
  fireEvent.press(r.getByTestId('maths-end'));
  fireEvent.press(within(r.getByTestId('end-confirmation')).getByText('End question'));
  r.observe(); expect(await r.verdict).toEqual({ valid: true, errors: [] });
  expect(r.result()).toMatchObject({ stopped_reason: 'ea_ended', duration_ms: 10000,
    derived: { correct_per_minute: 1, seconds_remaining: 0, strategies: ['head'] } });
  expect(r.result().items.slice(1).every(item => item.metadata?.reached === false)).toBe(true);
});

test('timed grid: all items before the timer gives completed with a scaled rate', async () => {
  const r = setup(); r.press('Start'); r.advance(30000);
  fixture.items.forEach(() => r.press('Correct')); r.press('Finish'); r.advance(10000); r.observe();
  expect(await r.verdict).toEqual({ valid: true, errors: [] });
  expect(r.result()).toMatchObject({ stopped_reason: 'completed', duration_ms: 30000,
    derived: { total_correct: 5, correct_per_minute: 10, seconds_remaining: 30 } });
});

test('stop at 4 on a timed grid then the strategy step saves', async () => {
  const r = setup(); r.press('Start'); r.advance(15000); r.press('Correct');
  for (let i = 0; i < 4; i++) r.press('Incorrect');
  r.press('Save result'); expect(r.queryByTestId('stop-card')).toBeNull(); r.observe();
  expect(await r.verdict).toEqual({ valid: true, errors: [] });
  expect(r.result()).toMatchObject({ stopped_reason: 'stop_rule', duration_ms: 15000,
    derived: { correct_per_minute: 1, seconds_remaining: 0, strategies: ['head'] } });
});

test('skip path is contract-valid', async () => {
  const r = setup(); r.press('Start'); r.press('Skip question'); r.press('Child is tired');
  expect(await r.verdict).toEqual({ valid: true, errors: [] });
  expect(r.result().items).toEqual([]); expect(r.result().derived).not.toHaveProperty('correct_per_minute');
  expect(r.result().derived).not.toHaveProperty('strategies');
});

test.each([true, false])('timer expiry is contract-valid, including zero attempts (%s)', mark => {
  return (async () => {
    const r = setup(); r.press('Start'); if (mark) r.press('Correct'); r.advance(60000); if (mark) r.observe();
    expect(await r.verdict).toEqual({ valid: true, errors: [] });
    expect(r.result()).toMatchObject({ stopped_reason: 'timer', duration_ms: 60000,
      derived: { correct_per_minute: mark ? 1 : 0, seconds_remaining: 0, strategies: mark ? ['head'] : [] } });
  })();
});
