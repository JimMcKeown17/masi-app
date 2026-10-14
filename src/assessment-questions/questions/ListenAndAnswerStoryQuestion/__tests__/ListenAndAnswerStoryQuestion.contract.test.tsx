import { fireEvent } from '@testing-library/react-native';
import { runContractTest } from '../../../contractTest/runContractTest';
import { ListenAndAnswerStoryQuestion } from '..';
import { FIXTURE_LISTEN_AND_ANSWER_STORY_EN } from '../../../testFixtures';

describe('ListenAndAnswerStoryQuestion — OSS contract', () => {
  test('Finish on a fully-marked Run emits a contract-valid Result', async () => {
    const { rendered, verdict } = runContractTest(ListenAndAnswerStoryQuestion, {
      language: 'en',
      itemSet: FIXTURE_LISTEN_AND_ANSWER_STORY_EN,
      instructions: '.',
    });

    fireEvent.press(rendered.getByText("I've finished reading"));
    [
      'What was the name of the bird?',
      'Where did Pip live?',
      'What did Pip want to find?',
      'What colour was the bush?',
      'How did Pip feel at the end?',
    ].forEach((p) => {
      fireEvent.press(rendered.getByLabelText(`${p}, idle`));
    });
    fireEvent.press(rendered.getByText('Finish'));

    const v = await verdict;
    expect(v.valid).toBe(true);
    expect(v.errors).toEqual([]);
  });

  test('Finish-with-unmarked confirmation path also emits a contract-valid Result', async () => {
    const { rendered, verdict } = runContractTest(ListenAndAnswerStoryQuestion, {
      language: 'en',
      itemSet: FIXTURE_LISTEN_AND_ANSWER_STORY_EN,
      instructions: '.',
    });

    fireEvent.press(rendered.getByText("I've finished reading"));
    fireEvent.press(rendered.getByLabelText('What was the name of the bird?, idle'));
    fireEvent.press(rendered.getByText('Finish'));
    fireEvent.press(rendered.getByText('Yes, finish'));

    const v = await verdict;
    expect(v.valid).toBe(true);
    expect(v.errors).toEqual([]);
  });

  test('Abandon path emits a contract-valid Result with a skipped_* stopped_reason', async () => {
    const { rendered, verdict } = runContractTest(ListenAndAnswerStoryQuestion, {
      language: 'en',
      itemSet: FIXTURE_LISTEN_AND_ANSWER_STORY_EN,
      instructions: '.',
    });

    fireEvent.press(rendered.getByText("I've finished reading"));
    fireEvent.press(rendered.getByText('Abandon'));
    fireEvent.press(rendered.getByText('Child refused'));

    const v = await verdict;
    expect(v.valid).toBe(true);
    expect(v.errors).toEqual([]);
  });
});
