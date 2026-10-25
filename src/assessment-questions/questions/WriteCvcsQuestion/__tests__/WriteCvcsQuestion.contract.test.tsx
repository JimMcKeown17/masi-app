import { fireEvent, within } from '@testing-library/react-native';
import { runContractTest } from '../../../contractTest/runContractTest';
import { WriteCvcsQuestion } from '..';
import { FIXTURE_WRITE_CVCS_EN } from '../../../testFixtures';

describe('WriteCvcsQuestion — OSS contract', () => {
  test.each(['completed', 'ea_ended', 'skipped_tired'])('%s emits a contract-valid Result', async reason => {
    const { rendered: r, verdict } = runContractTest(WriteCvcsQuestion, {
      language: 'en', itemSet: FIXTURE_WRITE_CVCS_EN, instructions: '.',
    });
    fireEvent.press(r.getByText('Start'));
    fireEvent.press(r.getByText('Correct'));
    if (reason === 'completed') {
      for (let i = 1; i < 12; i++) fireEvent.press(r.getByText('Incorrect'));
      fireEvent.press(r.getByText('Finish'));
    } else if (reason === 'ea_ended') {
      fireEvent.press(r.getByTestId('cvc-end'));
      fireEvent.press(within(r.getByTestId('end-confirmation')).getByText('End question'));
    } else {
      fireEvent.press(r.getByText('Skip question'));
      fireEvent.press(r.getByText('Child is tired'));
    }
    expect(await verdict).toEqual({ valid: true, errors: [] });
  });
});
