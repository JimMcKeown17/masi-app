import { validateLiteracySession } from '../src/utils/literacySessionValidation';

const valid = { selectedChildren: [{ id: 'c1' }], selectedLetters: ['m'], sessionReadingLevel: 'Word Reading' };

test('a complete form has no errors', () => {
  expect(validateLiteracySession(valid)).toEqual({});
});
test.each([
  ['children', { selectedChildren: [] }, 'Select at least one child'],
  ['letters', { selectedLetters: [] }, 'Select at least one letter'],
  ['readingLevel', { sessionReadingLevel: null }, 'Select a reading level'],
])('each rule alone: %s', (key, override, message) => {
  expect(validateLiteracySession({ ...valid, ...override })).toEqual({ [key]: message });
});
test('all three missing', () => {
  expect(validateLiteracySession({ selectedChildren: [], selectedLetters: [], sessionReadingLevel: '' })).toEqual({
    children: 'Select at least one child',
    letters: 'Select at least one letter',
    readingLevel: 'Select a reading level',
  });
});
