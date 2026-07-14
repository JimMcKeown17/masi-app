import { fireEvent } from '@testing-library/react-native';
import { runContractTest } from '../../../contractTest/runContractTest';
import { ReadSentencesQuestion } from '..';

describe('ReadSentencesQuestion — OSS contract', () => {
  test('Finish on a partially-marked Run emits a contract-valid Result', async () => {
    const { rendered, verdict } = runContractTest(ReadSentencesQuestion, {
      language: 'en',
      instructions: '.',
    });
    fireEvent.press(rendered.getByText('Start'));
    fireEvent.press(rendered.getByLabelText('The, idle'));
    fireEvent.press(rendered.getByText('Finish'));
    fireEvent.press(rendered.getByText('Yes, finish'));
    const v = await verdict;
    expect(v.valid).toBe(true);
    expect(v.errors).toEqual([]);
  });
});
