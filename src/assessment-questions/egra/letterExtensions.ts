/**
 * Masi letter-card extensions for EGRA forms (Jim, 2026-10-23).
 *
 * Masi letter cards are never shorter than 60 letters, because letter results are ranked on raw
 * score and a short card caps a fast reader. The DBE Grade 1 forms print 40 letters, so Masi
 * appends two rows of 10. The pack itself stays untouched; an extended card gets its own version
 * (`<form id>-masi60`), and positions 0–39 remain the DBE letters.
 *
 * How the 20 letters were chosen (deterministic; the result is fixed here, not recomputed):
 * - 20 different letters, least-used on the 40-letter card first. Ties go to the letter the same
 *   language's Grade 2 card uses most, then alphabetical.
 * - A letter DBE leaves off both its Grade 1 and Grade 2 cards in that language and variant is
 *   treated as a deliberate omission and not added (Afrikaans c and q; English HL q).
 * - 10 capitals and 10 lowercase, like Masi's Grid A card. Capitals go first to letters whose
 *   capital looks different from the lowercase letter.
 * - Order is a seeded shuffle with no repeated or easily confused neighbours (b/d, p/q, m/w, n/u,
 *   b/p, d/q) and no three of the same case in a row, including at the join with row 4.
 */
export const EGRA_MIN_LETTERS = 60;

export const EGRA_LETTER_EXTENSIONS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  'dbe-egra-xh-hl-1-v1': Object.freeze([
    'i', 'A', 'q', 'T', 'h', 'c', 'F', 'M', 'u', 'G',
    'Y', 'o', 'N', 's', 'p', 'E', 'v', 'x', 'B', 'J',
  ]),
  'dbe-egra-en-hl-1-v1': Object.freeze([
    'R', 'p', 'M', 'u', 's', 'N', 'c', 'w', 'L', 'B',
    'z', 'F', 'x', 'Y', 'G', 'k', 'J', 'd', 'v', 'H',
  ]),
  'dbe-egra-en-fal-1-v1': Object.freeze([
    'Y', 'x', 'Q', 'B', 'v', 'w', 'N', 'R', 'z', 'i',
    'T', 'f', 's', 'J', 'D', 'c', 'G', 'p', 'u', 'A',
  ]),
  'dbe-egra-af-hl-1-v1': Object.freeze([
    'L', 'u', 'B', 'e', 'Y', 's', 'M', 'G', 'k', 'd',
    'J', 'x', 'N', 'w', 'R', 'F', 'z', 'p', 'H', 'v',
  ]),
});
