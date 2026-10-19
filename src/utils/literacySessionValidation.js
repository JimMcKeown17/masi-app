export function validateLiteracySession({ selectedChildren, selectedLetters, sessionReadingLevel }) {
  const errors = {};
  if (selectedChildren.length === 0) errors.children = 'Select at least one child';
  if (selectedLetters.length === 0) errors.letters = 'Select at least one letter';
  if (!sessionReadingLevel) errors.readingLevel = 'Select a reading level';
  return errors;
}
