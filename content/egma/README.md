# English maths content pack (draft)

This portable UTF-8 JSON catalog contains Masi's nine early number Questions and eight Core EGMA Questions: 17 Questions and 161 scored items. It is English only and bundles offline without dependencies. Loading it does not register a Battery or activate an assessment.

## Draft id and freeze rule

The only form is `masi-egma-en-2026-1-draft`; catalog `contentVersion` is `2026-10-31.1-draft`. The associated implementation targets `masi_maths@2026.1-draft`. Draft results must not be used as frozen assessment evidence.

The draft may change in place while awaiting the partner approval, English copy check, curriculum mapping confirmation and device check in spec §10. Freezing is a deliberate later commit, never a side effect of reaching a test track. That commit adds the frozen form `masi-egma-en-2026-1` and Battery `masi_maths@2026.1`, preserves the draft identity for unfinished assessments, and registers supersession. The programme default changes separately. This task creates only the draft content pack.

**Never edit a frozen form in place.** Once frozen, changed items require a new form id; changed gates require a new Battery version. Preserve historical content so saved results remain interpretable.

## Loading helper

```js
const { egmaCatalog, listEgmaAssessments, getEgmaAssessment } = require('./content/egma');
const forms = listEgmaAssessments({ languageCode: 'en' });
const form = getEgmaAssessment('masi-egma-en-2026-1-draft');
```

Use the helper rather than importing raw JSON. It deeply freezes the catalog and returned list arrays. Filters match exactly; unknown languages return `[]`, and unknown ids return `null`. There is no language or form fallback. `index.d.ts` supplies readonly TypeScript declarations.

## Data contract

- `formatVersion: 1` identifies the structure; `contentVersion` identifies this snapshot.
- The catalog includes a title, description, toolkit source reference and one English form. Every form has ordered `questions` and `sourceNotes`.
- Each Question has its exact `questionCode` and title from spec §4.2, one English `instructions` string, scored `items`, unscored `practiceItems`, `timeLimitSeconds`, and `numberCardPage`. Absent timing and pages are explicitly `null`.
- Item ids are strings `1` through `n` within each Question. Persist the form, Question and item identities together. Repeated values are intentional; do not shuffle or deduplicate them.
- Every item has `kind`, `answer`, `skill`, `band`, and `source`. Kinds are `number`, `pair`, `sequence`, `equation`, `counters`, `checkpoint`, `fingers`, `count_out`, `neighbour`, and `word_problem`. Sequences have four slots and exactly one `null`.
- Finger flash uses `fingers` with `mode: 'flash'`; Make 5 and make 10 uses `mode: 'make'` and `total`. `count_out` is its own kind, as in the plan's public type contract.
- Word problems store phrase segments without pause tokens; join with ` (pause) ` for the read-aloud script. `problemType` uses descriptive snake-case keys. Their spelling is a pack decision; wording and answers come from Appendix A.
- Practice examples are instruction strings, never scored items. Word-problem practice includes the assessor answer `(2)`.
- The three timed Questions have a 60-second limit: Number Identification, Addition 1 and Subtraction 1. Number Card pages 1–9 each appear once. Stop rules, gates, strategy capture and result persistence belong to the adapter and engine, outside this pack.

## Band rule

`band` is the smallest of `5 | 10 | 20 | 50 | 100 | 1000` at or above the largest number in the item. Count operands, shown numbers, the answer, and the total for Make 5 and make 10. Checkpoints use `upTo`. Word problems count quantities in their phrases, including written-out number words, as well as the answer: sharing twelve sweets has band 20 even though the answer is 3.

Skill keys follow spec §8.1. They deliberately describe finer skills than curriculum tracker cells; curriculum mapping is a separate workstream.

## Provenance

The source is RTI's *Early Grade Mathematics Assessment (EGMA) Toolkit*, March 2014, from the supplied `EGMA Toolkit_March2014.pdf`. `sources[0].sha256` hashes that exact PDF. Consumers do not need the PDF at runtime.

`rti-2014-printed` marks Number Identification, Number Discrimination, Missing Number, Addition and Subtraction 1 items 1–5, and all Addition and Subtraction 2 items. `masi-2026` marks the nine early number Questions, Addition and Subtraction 1 items 6–20, and all six word problems. It denotes Masi authorship, not a second source PDF. The instructions and all Masi-authored items are drafts awaiting approval.

Missing Number practice `1 2 _ 4` comes from toolkit prose. The Bigger number and Word problems practice examples are Masi drafts. Item values and scripts are specified in [Appendix A](../../docs/superpowers/specs/2026-10-31-egma-maths-assessment-design.md#appendix-a-items-drafts-are-marked).

## Discrepancies and administration decisions

These are also recorded in the form's `sourceNotes`:

- The toolkit says six word problems at L936 and five at L1311. This form uses six, one for each type, with local wording.
- The toolkit prints five Addition and Subtraction 1 samples; Masi authored items 6–20. Subtraction uses the sum minus either addend in the printed samples and minus the second addend in the authored items.
- The clock starts on Start rather than the child's first utterance.
- Timed Core tasks stop at four consecutive wrong answers, while the toolkit has no timed stop rule. Jim accepted this for now. Core gates also depart from universal administration. Comparisons with published EGMA must footnote these decisions.
- The counter take-away instructions include covering the first group, as explicitly required by §6.3, alongside Appendix A's take-away script. All instruction copy remains draft.

## Verification

With Node 20, run from the repository root:

```sh
PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npm run test:content
```

The JSON SHA-256 is `91667d89d6927e9b6c523ff5d667e027d2af6d4f8cdcd078028075f64493c350`. Pin it only after finalizing and reviewing the transcription. The verifier checks the hash, counts, ids, bands, answers, either-addend inverse rule, exact Appendix A content, Question contracts, immutable reads and no-fallback lookup. Deliberately wrong band and inverse examples prove those checks reject invalid content. The same command retains the EGRA hash check. These are content and API checks; device administration, printed card layout, scoring integration and curriculum approval remain later gates.
