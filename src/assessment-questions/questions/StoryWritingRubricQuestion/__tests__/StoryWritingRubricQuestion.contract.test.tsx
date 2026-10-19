import { fireEvent } from '@testing-library/react-native';
import { runContractTest } from '../../../contractTest/runContractTest';
import { StoryWritingRubricQuestion } from '..';
import { FIXTURE_STORY_WRITING_EN } from '../../../testFixtures';
import { WELA_PLUS_STORY_WRITING_EN, WELA_PLUS_STORY_WRITING_XH } from '../../../itemsets';

const ITEM_SETS = [FIXTURE_STORY_WRITING_EN, WELA_PLUS_STORY_WRITING_EN, WELA_PLUS_STORY_WRITING_XH];

describe('StoryWritingRubricQuestion — OSS contract', () => {
  test.each(ITEM_SETS)('$item_set_id: Finish all scored emits a contract-valid Result', async (itemSet) => {
    const { rendered, verdict } = runContractTest(StoryWritingRubricQuestion, {
      language: itemSet.language,
      itemSet,
      instructions: '.',
    });
    fireEvent.press(rendered.getByText('Start'));
    ['meaning_making', 'spelling', 'length', 'vocabulary'].forEach((d) => {
      fireEvent.press(rendered.getByTestId(`chip-${d}-${itemSet.score_range.min}`));
    });
    fireEvent.press(rendered.getByText('Finish'));
    const v = await verdict;
    expect(v.valid).toBe(true);
    expect(v.errors).toEqual([]);
  });

  test.each(ITEM_SETS)('$item_set_id: Skip emits a contract-valid Result with items=[]', async (itemSet) => {
    const { rendered, verdict } = runContractTest(StoryWritingRubricQuestion, {
      language: itemSet.language,
      itemSet,
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
