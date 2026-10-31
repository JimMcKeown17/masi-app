import { fireEvent } from '@testing-library/react-native';
import { MathsCardsQuestion } from '..';
import { FIXTURE_MATHS_CARDS_COUNTERS_EN as fixture, FIXTURE_MATHS_CARDS_PLAIN_EN as plain } from '../../../testFixtures';
import { runContractTest } from '../../../contractTest/runContractTest';
import type { Result } from '../../../types/Result';
import { validateMathsResult } from '../../../egma/validateMathsResult';

function setup(itemSet = fixture) {
  const maths = jest.fn<ReturnType<typeof validateMathsResult>, [Result]>(validateMathsResult);
  const { rendered, verdict } = runContractTest(MathsCardsQuestion, { language: 'en', itemSet, childName: 'Amahle' },
    { stopRule: itemSet.stop_rule ?? undefined, extraValidators: [maths] });
  const press = (label: string) => fireEvent.press(rendered.getByText(label));
  return { ...rendered, verdict, press, result: () => maths.mock.calls[0][0] };
}

test.each([
  ['Counted from 1', 'count_all'], ['Started from the first number', 'count_on'], ['Just knew', 'known'],
])('counters: each choice saves its strategy (%s)', async (label, strategy) => {
  const r = setup(); r.press('Start'); fixture.items.forEach(() => r.press(label)); r.press('Finish');
  expect(await r.verdict).toEqual({ valid: true, errors: [] });
  expect(r.result().items.every(item => item.metadata?.strategy === strategy)).toBe(true);
});

test('counters: re-open changes a strategy', async () => {
  const r = setup(); r.press('Start'); fixture.items.forEach(() => r.press('Counted from 1'));
  fireEvent.press(r.getByTestId('tile-0')); r.press('Just knew'); r.press('Finish');
  expect(await r.verdict).toEqual({ valid: true, errors: [] });
  expect(r.result().items[0].metadata?.strategy).toBe('known'); expect(r.result().derived.correction_count).toBe(1);
});

test('stop at 3', async () => {
  const r = setup(); r.press('Start'); for (let i = 0; i < 3; i++) r.press('Incorrect'); r.press('Save result');
  expect(await r.verdict).toEqual({ valid: true, errors: [] });
  expect(r.result().stopped_reason).toBe('stop_rule');
});

test('count aloud stops at the first mistake with the one-mistake copy', async () => {
  const itemSet = { ...plain, question_code: 'maths_count_aloud', stop_rule: { kind: 'consecutive_wrong' as const, stop_at: 1 },
    items: [5,10,20].map(n => ({ item_key: String(n), prompt: `to ${n}`, skill: 'count_aloud', band: n })) };
  const r = setup(itemSet); r.press('Start'); r.press('Incorrect');
  expect(r.getByText('Amahle made a mistake. The test has stopped.')).toBeTruthy(); r.press('Save result');
  expect(await r.verdict).toEqual({ valid: true, errors: [] });
  expect(r.result().derived.total_attempted).toBe(1);
});
