export function buildPassage(paragraphs: string[]) {
  const words: { item_key: string; word: string }[] = [];
  const paragraph_starts: number[] = [];
  for (const p of paragraphs) {
    paragraph_starts.push(words.length);
    for (const word of p.trim().split(/\s+/)) {
      words.push({ item_key: word.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '').toLowerCase(), word });
    }
  }
  return { words, paragraph_starts };
}
