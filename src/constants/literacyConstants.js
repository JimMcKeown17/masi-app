// Letter teaching order as used on the Masi paper tracker.
// Read vertically down each column, then left to right across columns.
// Note: 'r' is not included — matches the paper tracker exactly.
export const LETTER_ORDER = [
  'a', 'e', 'i', 'o', 'u', 'm', 'l', 'n', 's',  // Column 1
  'd', 'k', 't', 'f', 'g', 'y', 'w', 'b', 'p',  // Column 2
  'c', 'x', 'j', 'h', 'v', 'z', 'q', 'r',       // Column 3 + r
];

// Reading levels in progression order (matches paper tracker)
export const READING_LEVELS = [
  'Cannot blend',
  '2 Letter Blends',
  '3 Letter Blends',
  '4 Letter Blends',
  'Word Reading',
  'Sentence Reading',
  'Paragraph Reading',
];
