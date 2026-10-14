import { fireEvent } from '@testing-library/react-native';
import { runContractTest } from '../../../contractTest/runContractTest';
import { ReadWordsQuestion } from '..';
import { FIXTURE_READ_WORDS_EN } from '../../../testFixtures';

describe('ReadWordsQuestion — OSS contract', () => {
  test('End on a partially-marked Run emits a contract-valid Result', async () => {
    const { rendered, verdict } = runContractTest(ReadWordsQuestion, {
      language: 'en',
      itemSet: FIXTURE_READ_WORDS_EN,
      instructions: '.',
      durationSec: 60,
    });
    fireEvent.press(rendered.getByText('Start'));
    fireEvent.press(rendered.getByLabelText('cat, idle'));
    fireEvent.press(rendered.getByLabelText('dog, idle'));
    fireEvent.press(rendered.getByText('End'));
    fireEvent.press(rendered.getByText('Reached the end'));

    const v = await verdict;
    expect(v.valid).toBe(true);
    expect(v.errors).toEqual([]);
  });

  test('Skip path emits a contract-valid Result', async () => {
    const { rendered, verdict } = runContractTest(ReadWordsQuestion, {
      language: 'en',
      itemSet: FIXTURE_READ_WORDS_EN,
      instructions: '.',
      durationSec: 60,
    });
    fireEvent.press(rendered.getByText('Start'));
    fireEvent.press(rendered.getByText('Skip question'));
    fireEvent.press(rendered.getByText('Child refused'));

    const v = await verdict;
    expect(v.valid).toBe(true);
    expect(v.errors).toEqual([]);
  });
});
