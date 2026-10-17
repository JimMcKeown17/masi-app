import { runContractTest } from '../contractTest/runContractTest';
import { NullQuestion } from '../questions/NullQuestion';

describe('NullQuestion contract', () => {
  test('emits a Result that the validator accepts', async () => {
    const { verdict } = runContractTest(NullQuestion, { language: 'en' });
    const v = await verdict;
    expect(v.valid).toBe(true);
    expect(v.errors).toEqual([]);
  });
});
