import { fireEvent } from '@testing-library/react-native';
import { runContractTest } from '../../../contractTest/runContractTest';
import { ReadPassageQuestion } from '..';

describe('ReadPassageQuestion — OSS contract', () => {
  test('End on a partially-marked Run emits a contract-valid Result', async () => {
    const { rendered, verdict } = runContractTest(ReadPassageQuestion, {
      language: 'en',
      instructions: '.',
      durationSec: 60,
    });
    fireEvent.press(rendered.getByText('Start'));
    fireEvent.press(rendered.getByTestId('pill-p1.w1'));
    fireEvent.press(rendered.getByText('End'));
    const v = await verdict;
    expect(v.valid).toBe(true);
    expect(v.errors).toEqual([]);
  });
});
