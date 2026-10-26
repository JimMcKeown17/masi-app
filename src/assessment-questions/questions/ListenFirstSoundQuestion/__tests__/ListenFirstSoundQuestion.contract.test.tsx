import { fireEvent } from '@testing-library/react-native';
import { runContractTest } from '../../../contractTest/runContractTest';
import { ListenFirstSoundQuestion } from '..';
import { FIXTURE_FIRST_SOUND_EN } from '../../../testFixtures';

describe('ListenFirstSoundQuestion — OSS contract', () => {
  test('Finish on a fully-marked Run emits a contract-valid Result', async () => {
    const { rendered, verdict } = runContractTest(ListenFirstSoundQuestion, {
      language: 'en',
      itemSet: FIXTURE_FIRST_SOUND_EN,
      instructions: '.',
    });

    fireEvent.press(rendered.getByText('Start'));
    [
      'apple',
      'ball',
      'cat',
      'dog',
      'egg',
      'fish',
      'goat',
      'hat',
      'ink',
      'jug',
    ].forEach((p) => {
      fireEvent.press(rendered.getByText('Correct'));
    });
    fireEvent.press(rendered.getByText('Finish'));

    const v = await verdict;
    expect(v.valid).toBe(true);
    expect(v.errors).toEqual([]);
  });

  test('early End with an unreached tail also emits a contract-valid Result', async () => {
    const { rendered, verdict } = runContractTest(ListenFirstSoundQuestion, {
      language: 'en',
      itemSet: FIXTURE_FIRST_SOUND_EN,
      instructions: '.',
    });

    fireEvent.press(rendered.getByText('Start'));
    fireEvent.press(rendered.getByText('Correct'));
    fireEvent.press(rendered.getByTestId('first-sound-end'));
    fireEvent.press(rendered.getByText('End question'));

    const v = await verdict;
    expect(v.valid).toBe(true);
    expect(v.errors).toEqual([]);
  });
});
