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

export const READING_LEVEL_OPTIONS = READING_LEVELS.map(level => ({ key: level, label: level }));
