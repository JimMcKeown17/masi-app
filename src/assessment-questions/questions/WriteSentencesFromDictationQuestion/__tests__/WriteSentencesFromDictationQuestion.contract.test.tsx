import { fireEvent } from '@testing-library/react-native';
import { runContractTest } from '../../../contractTest/runContractTest';
import { WriteSentencesFromDictationQuestion } from '..';

describe('WriteSentencesFromDictationQuestion — OSS contract', () => {
  test('Finish emits a contract-valid Result', async () => {
    const { rendered, verdict } = runContractTest(
      WriteSentencesFromDictationQuestion,
      { language: 'en', instructions: '.' },
    );
    fireEvent.press(rendered.getByText('Start'));
    fireEvent.press(rendered.getByTestId('card-q10.item_1'));
    fireEvent.press(rendered.getByText('Finish'));
    fireEvent.press(rendered.getByText('Yes, finish'));
    const v = await verdict;
    expect(v.valid).toBe(true);
    expect(v.errors).toEqual([]);
  });
});
