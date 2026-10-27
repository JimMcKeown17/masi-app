# Letter and word item sets

The runtime source is [src/assessment-questions/itemsets/](../src/assessment-questions/itemsets/),
not a duplicated list in this document or the old capture constants.
[The item-set registry](../src/assessment-questions/itemsets/index.ts) exports bundled versions and
`CURRENT_ITEM_SETS`; `assessmentRegistry.js` selects the test and language without copying prompts.
A saved result retains its `item_set_id` and item prompts so later content changes cannot reinterpret it.
There is no English fallback for an unknown language or a missing set.

**Since 2026-10-26** ([spec](../docs/superpowers/specs/2026-10-26-egra-content-and-skip-rules-design.md)),
`CURRENT_ITEM_SETS` points both quick tests at the **shared reading sets** (`question_version`
`2026.3`, built from `content/egra/` in
[sharedReading.ts](../src/assessment-questions/egra/sharedReading.ts)) in `xh`, `en`, `af` and
`zu`: the 100-letter DBE Assessment 3 charts (English uses the **First Additional Language** chart,
because Home Language 3 never asks q, v, x or z; Jim, 2026-10-27; isiZulu: SMRS 1's 110 letters,
which have no `r`) and the DBE Assessment 1 words (80, rows of 8; isiZulu 50, rows of 5), both with
the first-row stop. A test checks that every chart asks all 26 letters except isiZulu `r`.
WelaPLUS 2026.1 and Full EGRA 2026.1 use the same sets. The paragraphs below describe the sets
that were current before; they stay bundled for saved results.

Before 2026-10-26, standalone **Letter Sounds** used `letter_sounds@2026.2.en`, `letter_sounds@2026.2.xh`
and `letter_sounds@2026.2.af`. All three share one frozen Grid A rows constant: 60 mixed-case
letters in six printed rows of ten, with a stop at ten consecutive wrong marks. Those 60 letters
equal Zazi's `afrikaans_60_v2`, the one card Zazi printed for all three languages in January and
June 2026. Zazi's older `afrikaans_60` is not used. **WelaPLUS Q1** stays `en`/`xh` and shares those
two current letter item sets. The old English digraph card is not the current test.
Card layout must come from item-set data, not a hard-coded column count.

The interim `letter_sounds@2026.1.en` and `letter_sounds@2026.1.xh` sets remain bundled for
historical reference and old practice results. Changing the current alias does not reinterpret a
saved result: each result retains its item-set id and stored prompts.

Before 2026-10-26, standalone **Word Reading** used `word_reading@2026.1.en`, `word_reading@2026.1.xh` and
`word_reading@2026.1.af`, with `row_lengths` carried by each set. No standalone word set configures
a stop rule. The Afrikaans set is Zazi's provisional, diacritic-free, unreviewed `afrikaans_words_50`,
copied from commit `f0c9ee49`. Those lists were placeholders and are no longer offered; the quick
tests now use the DBE Assessment 1 words above.

See [contentStatus.ts](../src/assessment-questions/itemsets/contentStatus.ts) for the maintained
content-status entries (its word-list placeholders describe the retired 2026.1 sets). Printed
cards now come from the [printout pack](./welaplus-printout-pack.md), set in Andika so capital I and
lowercase l stay distinguishable. The file also tracks pending WelaPLUS pictures, story-writing
rubric anchors and isiXhosa language review. Do not treat passing code tests as typography, print or pedagogy approval. Word score bands
remain unset; see
[the score-band configuration](./assessment-score-bands-config.md).

## Pedagogical letter orders (26 unique letters)

Used by the Letter Tracker. These are **not** the EGRA assessment order — they are the sequence in
which letters are typically taught.

- **English:** A, M, S, T, N, I, P, C, F, D, H, O, R, B, L, K, E, G, W, V, U, J, Y, Z, Q, X
- **isiXhosa:** a, e, i, o, u, b, l, m, k, p, s, h, z, n, d, y, f, w, v, x, g, t, q, r, c, j
- **Afrikaans (provisional, Zazi's order pending the official Afrikaans sequence):** a, s, m, e, k, i, r, o, n, t, d, l, p, u, b, g, h, v, w, y, f, j, c, z, x, q

The lesson plan's interim Afrikaans pack uses the same order (lesson-plan spec C10).

All comparisons are case-insensitive; the tracker stores and displays lowercase. Mastery uses
stored item prompts and these pedagogical orders, not positions in an assessment list.
