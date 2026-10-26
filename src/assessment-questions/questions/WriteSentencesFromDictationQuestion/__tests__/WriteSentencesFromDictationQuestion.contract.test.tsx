import { fireEvent, within } from '@testing-library/react-native';
import { runContractTest } from '../../../contractTest/runContractTest';
import { WriteSentencesFromDictationQuestion } from '..';
import { FIXTURE_WRITE_SENTENCES_DICTATION_EN } from '../../../testFixtures';

describe('WriteSentencesFromDictationQuestion — OSS contract', () => {
  test.each(['completed', 'ea_ended', 'skipped_tired'])('%s emits a contract-valid Result', async reason => {
    const { rendered: r, verdict } = runContractTest(WriteSentencesFromDictationQuestion, {
      language: 'en', itemSet: FIXTURE_WRITE_SENTENCES_DICTATION_EN, instructions: '.',
    });
    fireEvent.press(r.getByText('Start'));
    fireEvent.press(r.getByText('Correct'));
    if (reason === 'completed') {
      for (let i = 1; i < 15; i++) fireEvent.press(r.getByText('Incorrect'));
      fireEvent.press(r.getByText('Finish'));
    } else if (reason === 'ea_ended') {
      fireEvent.press(r.getByTestId('dictation-end'));
      fireEvent.press(within(r.getByTestId('end-confirmation')).getByText('End question'));
    } else {
      fireEvent.press(r.getByText('Skip question'));
      fireEvent.press(r.getByText('Child is tired'));
    }
    expect(await verdict).toEqual({ valid: true, errors: [] });
  });
});
