import { fireEvent } from '@testing-library/react-native';
import { runContractTest } from '../../../contractTest/runContractTest';
import { WriteCvcsQuestion } from '..';

describe('WriteCvcsQuestion — OSS contract', () => {
  test('Finish emits a contract-valid Result', async () => {
    const { rendered, verdict } = runContractTest(WriteCvcsQuestion, {
      language: 'en',
      instructions: '.',
    });
    fireEvent.press(rendered.getByText('Start'));
    fireEvent.press(rendered.getByTestId('card-q9.item_1'));
    fireEvent.press(rendered.getByText('Finish'));
    fireEvent.press(rendered.getByText('Yes, finish'));
    const v = await verdict;
    expect(v.valid).toBe(true);
    expect(v.errors).toEqual([]);
  });
});
