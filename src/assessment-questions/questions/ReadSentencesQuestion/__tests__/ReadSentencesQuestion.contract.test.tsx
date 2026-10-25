import { fireEvent, within } from '@testing-library/react-native';
import { runContractTest } from '../../../contractTest/runContractTest';
import { ReadSentencesQuestion } from '..';
import { FIXTURE_READ_SENTENCES_EN } from '../../../testFixtures';

describe('ReadSentencesQuestion — OSS contract', () => {
  test('End on a partially-marked Run emits a contract-valid Result', async () => {
    const { rendered, verdict } = runContractTest(ReadSentencesQuestion, {
      language: 'en',
      itemSet: FIXTURE_READ_SENTENCES_EN,
      instructions: '.',
    });
    fireEvent.press(rendered.getByText('Start'));
    fireEvent.press(rendered.getByText('Correct'));
    fireEvent.press(rendered.getByTestId('sentences-end'));
    fireEvent.press(within(rendered.getByTestId('end-confirmation')).getByText('End question'));
    const v = await verdict;
    expect(v.valid).toBe(true);
    expect(v.errors).toEqual([]);
  });
});
