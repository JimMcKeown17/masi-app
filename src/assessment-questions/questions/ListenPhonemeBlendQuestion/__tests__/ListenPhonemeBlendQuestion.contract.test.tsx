import { fireEvent } from '@testing-library/react-native';
import { runContractTest } from '../../../contractTest/runContractTest';
import { ListenPhonemeBlendQuestion } from '..';
import { FIXTURE_PHONEME_BLEND_EN } from '../../../testFixtures';

describe('ListenPhonemeBlendQuestion — OSS contract', () => {
  test('Finish on a fully-marked Run emits a contract-valid Result', async () => {
    const { rendered, verdict } = runContractTest(ListenPhonemeBlendQuestion, {
      language: 'en',
      itemSet: FIXTURE_PHONEME_BLEND_EN,
      instructions: '.',
    });

    fireEvent.press(rendered.getByText('Start'));
    ['s-u-n', 'c-a-t', 'p-i-g', 'h-a-t', 'r-u-n', 'd-o-g', 'b-i-g', 'm-a-p'].forEach(
      (s) => {
        fireEvent.press(rendered.getByText('Correct'));
      },
    );
    fireEvent.press(rendered.getByText('Finish'));

    const v = await verdict;
    expect(v.valid).toBe(true);
    expect(v.errors).toEqual([]);
  });

  test('early End with an unreached tail emits a contract-valid Result', async () => {
    const { rendered, verdict } = runContractTest(ListenPhonemeBlendQuestion, {
      language: 'en',
      itemSet: FIXTURE_PHONEME_BLEND_EN,
      instructions: '.',
    });

    fireEvent.press(rendered.getByText('Start'));
    fireEvent.press(rendered.getByText('Correct'));
    fireEvent.press(rendered.getByTestId('blend-end'));
    fireEvent.press(rendered.getByText('End question'));

    const v = await verdict;
    expect(v.valid).toBe(true);
    expect(v.errors).toEqual([]);
  });
});
