import { fireEvent, act, within } from '@testing-library/react-native';
import { runContractTest } from '../../../contractTest/runContractTest';
import { LetterSoundsQuestion } from '..';
import { FIXTURE_LETTER_SOUNDS_EN } from '../../../testFixtures';

describe('LetterSoundsQuestion — OSS contract', () => {
  test('manual End finalize emits a contract-valid Result', async () => {
    const { rendered, verdict } = runContractTest(LetterSoundsQuestion, {
      language: 'en',
      itemSet: FIXTURE_LETTER_SOUNDS_EN,
      instructions: 'Mark each letter Correct or Incorrect.',
      durationSec: 60,
    });

    fireEvent.press(rendered.getByText('Start'));
    fireEvent.press(rendered.getByText('Correct'));
    fireEvent.press(rendered.getByTestId('letter-end'));
    fireEvent.press(within(rendered.getByTestId('end-confirmation')).getByText('End question'));

    const v = await verdict;
    expect(v.valid).toBe(true);
    expect(v.errors).toEqual([]);
  });

  test('timer expiry emits a contract-valid Result', async () => {
    jest.useFakeTimers();
    try {
      const { rendered, verdict } = runContractTest(LetterSoundsQuestion, {
        language: 'en',
        itemSet: FIXTURE_LETTER_SOUNDS_EN,
        instructions: '.',
        durationSec: 60,
      });

      fireEvent.press(rendered.getByText('Start'));
      fireEvent.press(rendered.getByText('Incorrect'));
      act(() => {
        jest.advanceTimersByTime(60000);
      });
      const v = await verdict;
      expect(v.valid).toBe(true);
      expect(v.errors).toEqual([]);
    } finally {
      jest.useRealTimers();
    }
  });
});
