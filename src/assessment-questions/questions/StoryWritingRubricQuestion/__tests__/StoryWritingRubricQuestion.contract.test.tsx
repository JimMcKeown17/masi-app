import { fireEvent } from '@testing-library/react-native';
import { runContractTest } from '../../../contractTest/runContractTest';
import { StoryWritingRubricQuestion } from '..';

describe('StoryWritingRubricQuestion — OSS contract', () => {
  test('Finish all scored emits a contract-valid Result', async () => {
    const { rendered, verdict } = runContractTest(StoryWritingRubricQuestion, {
      language: 'en',
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

  test('Abandon emits a contract-valid Result with items=[]', async () => {
    const { rendered, verdict } = runContractTest(StoryWritingRubricQuestion, {
      language: 'en',
      instructions: '.',
    });
    fireEvent.press(rendered.getByText('Start'));
    fireEvent.press(rendered.getByText('Abandon'));
    fireEvent.press(rendered.getByText('Child refused'));
    const v = await verdict;
    expect(v.valid).toBe(true);
    expect(v.errors).toEqual([]);
  });
});
