import { fireEvent, act } from '@testing-library/react-native';
import { runContractTest } from '../../../contractTest/runContractTest';
import { LetterSoundsQuestion } from '..';
import { FIXTURE_LETTER_SOUNDS_EN } from '../../../testFixtures';

describe('LetterSoundsQuestion — OSS contract', () => {
  test('manual End finalize emits a contract-valid Result', async () => {
    const { rendered, verdict } = runContractTest(LetterSoundsQuestion, {
      language: 'en',
      itemSet: FIXTURE_LETTER_SOUNDS_EN,
      instructions: 'Stop if the child gets a whole row wrong.',
      durationSec: 60,
    });

    fireEvent.press(rendered.getByText('Start'));
    fireEvent.press(rendered.getByText('End'));
    fireEvent.press(rendered.getByText('Reached the end'));

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
      act(() => {
        jest.advanceTimersByTime(60000);
      });
      fireEvent.press(rendered.getByText('Reached the end'));

      const v = await verdict;
      expect(v.valid).toBe(true);
      expect(v.errors).toEqual([]);
    } finally {
      jest.useRealTimers();
    }
  });
});
