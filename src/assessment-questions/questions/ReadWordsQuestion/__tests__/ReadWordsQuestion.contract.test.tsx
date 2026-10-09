import { fireEvent } from '@testing-library/react-native';
import { runContractTest } from '../../../contractTest/runContractTest';
import { ReadWordsQuestion } from '..';

describe('ReadWordsQuestion — OSS contract', () => {
  test('End on a partially-marked Run emits a contract-valid Result', async () => {
    const { rendered, verdict } = runContractTest(ReadWordsQuestion, {
      language: 'en',
      instructions: '.',
      durationSec: 60,
    });
    fireEvent.press(rendered.getByText('Start'));
    fireEvent.press(rendered.getByLabelText('cat, idle'));
    fireEvent.press(rendered.getByLabelText('dog, idle'));
    fireEvent.press(rendered.getByText('End'));

    const v = await verdict;
    expect(v.valid).toBe(true);
    expect(v.errors).toEqual([]);
  });

  test('Abandon path emits a contract-valid Result', async () => {
    const { rendered, verdict } = runContractTest(ReadWordsQuestion, {
      language: 'en',
      instructions: '.',
      durationSec: 60,
    });
    fireEvent.press(rendered.getByText('Start'));
    fireEvent.press(rendered.getByText('Abandon'));
    fireEvent.press(rendered.getByText('Child refused'));

    const v = await verdict;
    expect(v.valid).toBe(true);
    expect(v.errors).toEqual([]);
  });
});
