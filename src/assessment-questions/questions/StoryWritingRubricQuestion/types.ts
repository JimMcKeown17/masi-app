import type { ImageSourcePropType } from 'react-native';

export interface StoryWritingRubricAnchor {
  /** Score value 0-4. */
  score: number;
  /** Anchor description shown on the "View full rubric" sheet. */
  text: string;
}

export interface StoryWritingRubricDimension {
  /** Stable code used to build item_key as `ea:<code>` (load-bearing — ADR-0004). */
  code: string;
  /** Human-readable header rendered on each dimension card. */
  label: string;
  /** Five anchor descriptions, scores 0-4 inclusive. */
  anchors: StoryWritingRubricAnchor[];
  /** One-line gloss shown beneath the chip row (e.g. "no attempt → partial → sophisticated"). */
  end_anchor_gloss: string;
}

export interface StoryWritingRubricPicture {
  /** Optional bundled asset source. Stub omits and falls back to alt text. */
  source: ImageSourcePropType | null;
  /** Required accessibility text / visual fallback for the picture thumbnail. */
  alt: string;
}

export interface StoryWritingRubricItemSet {
  picture: StoryWritingRubricPicture;
  dimensions: StoryWritingRubricDimension[];
}
