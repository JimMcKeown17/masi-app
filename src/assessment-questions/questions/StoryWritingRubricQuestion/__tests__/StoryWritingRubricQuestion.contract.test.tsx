import { fireEvent } from '@testing-library/react-native';
import { runContractTest } from '../../../contractTest/runContractTest';
import { StoryWritingRubricQuestion } from '..';
import { FIXTURE_STORY_WRITING_EN } from '../../../testFixtures';

describe('StoryWritingRubricQuestion — OSS contract', () => {
  test('Finish all scored emits a contract-valid Result', async () => {
    const { rendered, verdict } = runContractTest(StoryWritingRubricQuestion, {
      language: 'en',
      itemSet: FIXTURE_STORY_WRITING_EN,
      instructions: '.',
    });
    fireEvent.press(rendered.getByText('Start'));
    ['meaning_making', 'spelling', 'length', 'vocabulary'].forEach((d) => {
      fireEvent.press(rendered.getByTestId(`chip-${d}-2`));
    });
    fireEvent.press(rendered.getByText('Finish'));
    const v = await verdict;
    expect(v.valid).toBe(true);
    expect(v.errors).toEqual([]);
  });

  test('Skip emits a contract-valid Result with items=[]', async () => {
    const { rendered, verdict } = runContractTest(StoryWritingRubricQuestion, {
      language: 'en',
      itemSet: FIXTURE_STORY_WRITING_EN,
      instructions: '.',
    });
    fireEvent.press(rendered.getByText('Start'));
    fireEvent.press(rendered.getByText('Skip question'));
    fireEvent.press(rendered.getByText('Child refused'));
    const v = await verdict;
    expect(v.valid).toBe(true);
    expect(v.errors).toEqual([]);
  });
});
