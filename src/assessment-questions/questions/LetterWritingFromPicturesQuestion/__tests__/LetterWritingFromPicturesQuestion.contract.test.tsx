import { fireEvent } from '@testing-library/react-native';
import { runContractTest } from '../../../contractTest/runContractTest';
import { LetterWritingFromPicturesQuestion } from '..';

describe('LetterWritingFromPicturesQuestion — OSS contract', () => {
  test('Finish emits a contract-valid Result', async () => {
    const { rendered, verdict } = runContractTest(
      LetterWritingFromPicturesQuestion,
      { language: 'en', instructions: '.' },
    );
    fireEvent.press(rendered.getByText('Start'));
    fireEvent.press(rendered.getByTestId('cell-q5.item_1'));
    fireEvent.press(rendered.getByText('Finish'));
    fireEvent.press(rendered.getByText('Yes, finish'));
    const v = await verdict;
    expect(v.valid).toBe(true);
    expect(v.errors).toEqual([]);
  });
});
