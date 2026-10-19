import type { ImageSourcePropType } from 'react-native';

export interface StoryWritingRubricAnchor {
  /** Score value within the item set's score_range. */
  score: number;
  /** Anchor description shown on the "View full rubric" sheet. */
  text: string;
}

export interface StoryWritingRubricDimension {
  /** Stable code used to build item_key as `ea:<code>` (load-bearing — ADR-0004). */
  code: string;
  /** Human-readable header rendered on each dimension card. */
  label: string;
  /** Anchor descriptions for any scores that have published guidance. */
  anchors: StoryWritingRubricAnchor[];
  /** Optional one-line gloss shown beneath the chip row. */
  end_anchor_gloss: string;
}

export interface StoryWritingRubricPicture {
  /** Optional bundled asset source. Stub omits and falls back to alt text. */
  source: ImageSourcePropType | null;
  /** Required accessibility text / visual fallback for the picture thumbnail. */
  alt: string;
}

export interface StoryWritingRubricItemSet {
  picture?: StoryWritingRubricPicture;
  /**
   * Inclusive safe-integer score bounds: 0 <= min <= max, at most 11 chips
   * (max - min + 1 <= 11). Invalid ranges use the bundled language default.
   */
  score_range: { min: number; max: number };
  dimensions: StoryWritingRubricDimension[];
}
