export function markingSentence(noun: 'letter' | 'word' | 'question' | 'number' | 'pair' | 'problem' | 'item'): string {
  return `Mark each ${noun} Correct or Incorrect. The black ring shows which ${noun} you're on.`;
}
