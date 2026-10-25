import { fireEvent, within } from '@testing-library/react-native';
import { runContractTest } from '../../../contractTest/runContractTest';
import { LetterWritingFromPicturesQuestion } from '..';
import { FIXTURE_LETTER_WRITING_EN } from '../../../testFixtures';

describe('LetterWritingFromPicturesQuestion — OSS contract', () => {
  test('review then Finish emits a contract-valid Result', async () => {
    const { rendered, verdict } = runContractTest(LetterWritingFromPicturesQuestion, {
      language: 'en', itemSet: FIXTURE_LETTER_WRITING_EN, instructions: '.',
    });
    fireEvent.press(rendered.getByText('Start'));
    for (let i = 0; i < 26; i += 1) fireEvent.press(rendered.getByText(i % 2 ? 'Incorrect' : 'Correct'));
    fireEvent.press(rendered.getByText('Finish'));
    expect(await verdict).toEqual({ valid: true, errors: [] });
  });

  test.each([0, 3])('ending after %i marks emits a contract-valid Result', async marks => {
    const { rendered, verdict } = runContractTest(LetterWritingFromPicturesQuestion, {
      language: 'en', itemSet: FIXTURE_LETTER_WRITING_EN, instructions: '.',
    });
    fireEvent.press(rendered.getByText('Start'));
    for (let i = 0; i < marks; i += 1) fireEvent.press(rendered.getByText('Correct'));
    fireEvent.press(rendered.getByTestId('letter-writing-end'));
    fireEvent.press(within(rendered.getByTestId('end-confirmation')).getByText('End question'));
    expect(await verdict).toEqual({ valid: true, errors: [] });
  });
});
