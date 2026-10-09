import { fireEvent } from '@testing-library/react-native';
import { runContractTest } from '../../../contractTest/runContractTest';
import { ListenFirstSoundQuestion } from '..';

describe('ListenFirstSoundQuestion — OSS contract', () => {
  test('Finish on a fully-marked Run emits a contract-valid Result', async () => {
    const { rendered, verdict } = runContractTest(ListenFirstSoundQuestion, {
      language: 'en',
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
      fireEvent.press(rendered.getByLabelText(`${p}, idle`));
    });
    fireEvent.press(rendered.getByText('Finish'));

    const v = await verdict;
    expect(v.valid).toBe(true);
    expect(v.errors).toEqual([]);
  });

  test('Finish-with-unmarked confirmation path also emits a contract-valid Result', async () => {
    const { rendered, verdict } = runContractTest(ListenFirstSoundQuestion, {
      language: 'en',
      instructions: '.',
    });

    fireEvent.press(rendered.getByText('Start'));
    fireEvent.press(rendered.getByLabelText('apple, idle'));
    fireEvent.press(rendered.getByText('Finish'));
    fireEvent.press(rendered.getByText('Yes, finish'));

    const v = await verdict;
    expect(v.valid).toBe(true);
    expect(v.errors).toEqual([]);
  });
});
