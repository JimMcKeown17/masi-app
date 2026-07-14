# EGRA Letter Sets

**Standing data reference.** The shipped values live in `src/constants/egraConstants.js`, which cites
this file as its source. **If the two disagree, the code is truth** — this file is the human-readable
record, not the runtime.

> Corrected 2026-07-13: line 2 of the isiXhosa array had a broken quote (`"M,"e",`), and the isiXhosa
> set was recorded in mixed case while the code has always shipped it lowercase. Both fixed below to
> match `egraConstants.js`.

## The 60-letter EGRA assessment sets

**English** — mixed case, with digraphs in the final row. Display as-is; do **not** force uppercase.

```
"I","a","m","E","p","n","L","s","o","e",
"Y","i","K","N","d","H","f","U","h","v",
"Z","b","G","r","J","T","c","F","q","W",
"w","D","x","A","j","B","g","P","Q","y",
"z","C","O","t","S","V","l","k","M","R",
"X","u","X","d","ch","sh","th","wh","oo","ee"
```

**isiXhosa** — all lowercase, no digraphs. (Letters repeat by design; EGRA sets are sampled with
replacement, so a duplicate is not a data error.)

```
"l","a","m","e","s","n","l","s","m","e",
"y","i","k","n","d","h","f","u","h","v",
"f","y","c","i","t","k","d","z","f","d",
"t","z","o","j","p","r","c","w","p","o",
"w","a","e","x","q","l","g","o","u","z",
"x","r","v","b","j","b","q","u","r","g"
```

Both sets render 20 per page, 5 columns.

## Pedagogical letter orders (26 unique letters)

Used by the Letter Tracker. These are **not** the EGRA assessment order — they are the sequence in
which letters are typically taught.

- **English:** A, M, S, T, N, I, P, C, F, D, H, O, R, B, L, K, E, G, W, V, U, J, Y, Z, Q, X
- **isiXhosa:** a, e, i, o, u, b, l, m, k, p, s, h, z, n, d, y, f, w, v, x, g, t, q, r, c, j

All comparisons are case-insensitive; the tracker stores and displays lowercase. The digraphs
(ch, sh, th, wh, oo, ee) from the English 60-letter set are excluded from the 26-letter tracker.

## Open work

**The word-reading lists are placeholders.** `egraConstants.js` marks its word-reading sets
*"Placeholder word lists — replace with real EGRA word lists when available."* Real EGRA word lists
have never been supplied. This is why the Words tab on `AssessmentRankingScreen` has no benchmark
(see also the unset `word_reading` score bands in `documentation/assessment-score-bands-config.md`).
Sourcing the real lists unblocks both.
