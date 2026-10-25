import { flatCopy, nestedCopy, reviewLine, endMessage } from '../captureCopy';

test('flat copy names and positions words', () => {
  const copy = flatCopy('word', 40);
  expect(copy.position(5)).toEqual([{ text: 'Word ' }, { text: '6 of 40', strong: true }]);
  expect(copy.itemName(5)).toBe('Word 6');
});
test('nested word letters use group-local positions', () => {
  const copy = nestedCopy('Word', 'letter', [[0, 1, 2, 3], [4, 5, 6, 7]]);
  expect(copy.position(6)).toEqual([{ text: 'Word ' }, { text: '2', strong: true }, { text: ' · letter ' }, { text: '3 of 4', strong: true }]);
  expect(copy.itemName(6)).toBe('Letter 3 of word 2');
});
test('nested sentence words name the inner and outer positions', () => {
  const copy = nestedCopy('Sentence', 'word', [[0, 1, 2], [3, 4]]);
  expect(copy.position(1)).toEqual([{ text: 'Sentence ' }, { text: '1', strong: true }, { text: ' · word ' }, { text: '2 of 3', strong: true }]);
  expect(copy.itemName(1)).toBe('Word 2 of sentence 1');
});
test('review line emphasizes the marked count', () => {
  expect(reviewLine(18, 15, 'letter')).toEqual([{ text: 'All 18 marked', strong: true }, { text: ' · 15 correct. Tap any letter to change it.' }]);
});
test('end message excludes the unmarked tail', () => {
  expect(endMessage(2, 5)).toBe("2 marked. The 3 not marked won't count towards the score.");
});
