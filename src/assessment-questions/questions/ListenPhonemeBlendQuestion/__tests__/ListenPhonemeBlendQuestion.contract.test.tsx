import { fireEvent } from '@testing-library/react-native';
import { runContractTest } from '../../../contractTest/runContractTest';
import { ListenPhonemeBlendQuestion } from '..';

describe('ListenPhonemeBlendQuestion — OSS contract', () => {
  test('Finish on a fully-marked Run emits a contract-valid Result', async () => {
    const { rendered, verdict } = runContractTest(ListenPhonemeBlendQuestion, {
      language: 'en',
      instructions: '.',
    });

    fireEvent.press(rendered.getByText('Start'));
    ['s-u-n', 'c-a-t', 'p-i-g', 'h-a-t', 'r-u-n', 'd-o-g', 'b-i-g', 'm-a-p'].forEach(
      (s) => {
        fireEvent.press(rendered.getByLabelText(`${s}, idle`));
      },
    );
    fireEvent.press(rendered.getByText('Finish'));

    const v = await verdict;
    expect(v.valid).toBe(true);
    expect(v.errors).toEqual([]);
  });

  test('Finish-with-unmarked confirmation path emits a contract-valid Result', async () => {
    const { rendered, verdict } = runContractTest(ListenPhonemeBlendQuestion, {
      language: 'en',
      instructions: '.',
    });

    fireEvent.press(rendered.getByText('Start'));
    fireEvent.press(rendered.getByLabelText('s-u-n, idle'));
    fireEvent.press(rendered.getByText('Finish'));
    fireEvent.press(rendered.getByText('Yes, finish'));

    const v = await verdict;
    expect(v.valid).toBe(true);
    expect(v.errors).toEqual([]);
  });
});
