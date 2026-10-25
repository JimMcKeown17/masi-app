export function markingSentence(noun: 'letter' | 'word' | 'question'): string {
  return `Mark each ${noun} Correct or Incorrect. The black ring shows which ${noun} you're on.`;
}
