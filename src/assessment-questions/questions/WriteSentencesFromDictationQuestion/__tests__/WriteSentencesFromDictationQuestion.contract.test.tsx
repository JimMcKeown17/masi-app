import { fireEvent } from '@testing-library/react-native';
import { runContractTest } from '../../../contractTest/runContractTest';
import { WriteSentencesFromDictationQuestion } from '..';
import { FIXTURE_WRITE_SENTENCES_DICTATION_EN } from '../../../testFixtures';

describe('WriteSentencesFromDictationQuestion — OSS contract', () => {
  test('Finish emits a contract-valid Result', async () => {
    const { rendered, verdict } = runContractTest(
      WriteSentencesFromDictationQuestion,
      {
        language: 'en',
        itemSet: FIXTURE_WRITE_SENTENCES_DICTATION_EN,
        instructions: '.',
      },
    );
    fireEvent.press(rendered.getByText('Start'));
    fireEvent.press(rendered.getByLabelText('Mom, idle'));
    fireEvent.press(rendered.getByText('Finish'));
    fireEvent.press(rendered.getByText('Yes, finish'));
    const v = await verdict;
    expect(v.valid).toBe(true);
    expect(v.errors).toEqual([]);
  });
});
