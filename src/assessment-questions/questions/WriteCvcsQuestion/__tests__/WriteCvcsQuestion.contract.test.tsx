import { fireEvent } from '@testing-library/react-native';
import { runContractTest } from '../../../contractTest/runContractTest';
import { WriteCvcsQuestion } from '..';
import { FIXTURE_WRITE_CVCS_EN } from '../../../testFixtures';

describe('WriteCvcsQuestion — OSS contract', () => {
  test('Finish emits a contract-valid Result', async () => {
    const { rendered, verdict } = runContractTest(WriteCvcsQuestion, {
      language: 'en',
      itemSet: FIXTURE_WRITE_CVCS_EN,
      instructions: '.',
    });
    fireEvent.press(rendered.getByText('Start'));
    fireEvent.press(rendered.getByLabelText('jam letter 1 j, idle'));
    fireEvent.press(rendered.getByText('Finish'));
    fireEvent.press(rendered.getByText('Yes, finish'));
    const v = await verdict;
    expect(v.valid).toBe(true);
    expect(v.errors).toEqual([]);
  });
});
