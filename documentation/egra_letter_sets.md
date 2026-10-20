# Letter and word item sets

The runtime source is [src/assessment-questions/itemsets/](../src/assessment-questions/itemsets/),
not a duplicated list in this document or the old capture constants.
[The item-set registry](../src/assessment-questions/itemsets/index.ts) exports bundled versions and
`CURRENT_ITEM_SETS`; `assessmentRegistry.js` selects the test and language without copying prompts.
A saved result retains its `item_set_id` and item prompts so later content changes cannot reinterpret it.
There is no English fallback for an unknown language or a missing set.

Current standalone **Letter Sounds** and **WelaPLUS Q1** share `letter_sounds@2026.2.en` and
`letter_sounds@2026.2.xh`. Both use the same Zazi iZandi Grid A card: 60 mixed-case letters in six
printed rows of ten, with a stop at ten consecutive wrong marks. One frozen rows constant supplies
both languages, so the two cards cannot drift. The old English digraph card is not the current test.
Card layout must come from item-set data, not a hard-coded column count.

The interim `letter_sounds@2026.1.en` and `letter_sounds@2026.1.xh` sets remain bundled for
historical reference and old practice results. Changing the current alias does not reinterpret a
saved result: each result retains its item-set id and stored prompts.

Standalone **Word Reading** uses `word_reading@2026.1.en` / `word_reading@2026.1.xh`, with
`row_lengths` carried by the set. Neither standalone word set configures a stop rule. These lists
remain placeholders; they are not the WelaPLUS Q6 sets.

See [contentStatus.ts](../src/assessment-questions/itemsets/contentStatus.ts) for the maintained
content-status entries. Grid A is supplied; the app still needs a typeface that makes capital I and
lowercase l distinguishable (the printed card uses a serifed capital I), and a designer will
recreate the printed card from the bundled rows. Masi still needs real standalone word lists. The
file also tracks pending WelaPLUS pictures, story-writing rubric anchors and isiXhosa language
review. Do not treat passing code tests as typography, print or pedagogy approval. Word score bands
remain unset; see
[the score-band configuration](./assessment-score-bands-config.md).

## Pedagogical letter orders (26 unique letters)

Used by the Letter Tracker. These are **not** the EGRA assessment order — they are the sequence in
which letters are typically taught.

- **English:** A, M, S, T, N, I, P, C, F, D, H, O, R, B, L, K, E, G, W, V, U, J, Y, Z, Q, X
- **isiXhosa:** a, e, i, o, u, b, l, m, k, p, s, h, z, n, d, y, f, w, v, x, g, t, q, r, c, j

All comparisons are case-insensitive; the tracker stores and displays lowercase. Mastery uses
stored item prompts and these pedagogical orders, not positions in an assessment list.
