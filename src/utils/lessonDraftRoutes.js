/** @param {{ kind?: string } | null} draft
 * @returns {'Lesson' | 'NumeracyLesson'}
 */
export const lessonRouteForDraft = (draft) => (
  draft?.kind === 'numeracy' ? 'NumeracyLesson' : 'Lesson'
);
