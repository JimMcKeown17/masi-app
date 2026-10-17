import type { ImageSourcePropType } from 'react-native';

export interface LetterWritingPicture {
  /**
   * Optional bundled asset source for the picture thumbnail. Stub itemsets
   * leave this null and rely on `alt` for accessibility + visual fallback;
   * real WelaPLUS content (#34) ships require()-resolved PNGs.
   */
  source: ImageSourcePropType | null;
  /** Required text fallback / accessibility label. */
  alt: string;
}

export interface LetterWritingPrompt {
  item_key: string;
  picture: LetterWritingPicture;
  expected_letter: string;
}

export interface LetterWritingFromPicturesItemSet {
  prompts: LetterWritingPrompt[];
  itemsPerPage: number;
  columns: number;
}
