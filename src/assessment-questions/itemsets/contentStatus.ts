/** Content awaiting Masi pedagogy (spec 4.3). The host shows this before field release. */
export const CONTENT_PENDING: ReadonlyArray<{ item_set_id: string; field: string; note: string }> = [
  { item_set_id: 'wela_plus_letter_writing@2024.1.en', field: 'prompts.x,q', note: 'Confirm the x (figure behind a sign) and q (crowned figure) cells.' },
  { item_set_id: 'wela_plus_letter_writing@2024.1.xh', field: 'prompts.picture.alt', note: 'Supply isiXhosa picture names; decide whether the x cell (no picture) is scored.' },
  { item_set_id: 'wela_plus_write_cvcs@2024.1.xh', field: 'words.letters', note: 'Confirm prefix-excluded scoring letters (m a l i, d o l o) giving /16.' },
  { item_set_id: 'wela_plus_story_writing@2024.1.en', field: 'dimensions.anchors', note: 'Five anchor descriptions (0–4) per dimension.' },
  { item_set_id: 'wela_plus_story_writing@2024.1.xh', field: 'dimensions.anchors', note: 'Five anchor descriptions (0–4) per dimension, and isiXhosa labels.' },
  { item_set_id: 'wela_plus_read_words@2024.1.en', field: 'durationSec', note: 'Confirm Q6 untimed (paper has no timer).' },
  { item_set_id: 'wela_plus_read_passage@2024.1.en', field: 'durationSec', note: 'Confirm Q8 untimed (paper has no timer).' },
  { item_set_id: 'all@2024.1.xh', field: 'strings', note: 'First-language review of every isiXhosa string.' },
];
