# South African EGRA content pack

One portable UTF-8 JSON catalog for both the Masi and Zazi iZandi apps. It contains actual source assessment content, not generated questions. There are no package dependencies or network requirements to load it.

This directory is a byte-identical content pack copied into the two mobile apps and the two Next.js websites. It is additive: no existing active or historical EGRA form, registry, route, scoring rule, or saved result has been replaced. Integration into assessment screens is a separate task.

## Loading helper

Use `index.js` rather than importing the raw JSON when reading from application code. The helper deeply freezes the shared catalog to protect ordered content from accidental mutation. It has no network, database, filesystem, activation or registration side effects. `index.d.ts` supplies readonly TypeScript types.

```js
// From src/utils/example.js in either mobile app:
const {
  egraCatalog,
  listEgraAssessments,
  getEgraAssessment,
} = require('../../content/egra');

const forms = listEgraAssessments({ languageCode: 'xh' });
const englishFal = listEgraAssessments({ languageCode: 'en', variant: 'fal' });
const assessment = getEgraAssessment('dbe-egra-xh-hl-1-v1');
// Unknown IDs return null; unknown filters return an empty array. No fallback.
if (!assessment) throw new Error('Unknown EGRA form');
const letterTiles = assessment.letters.items;
const wordTiles = assessment.words.items;
const passageText = assessment.passage.text;
const questions = assessment.comprehension.questions;
```

ES/TypeScript callers may use named imports from the same relative module path. Match the relative path to the importing file; the Next.js projects have different `@/` alias roots. This directory is not in `public/`, and adding it does not publish an HTTP endpoint.

## Verification and copy discipline

From any of the four repository roots:

```sh
node --test content/egra/verify.cjs
```

The five tests cover the exact JSON hash, language/variant filtering, explicit-ID lookup, duplicate positions, immutable reads, source references and content completeness. The JSON SHA-256 is `ce3f99d782bfc681110d1d8ca43d237d13d04cdca5f43298fe2134a7f1e14e3b`.

Maintain this pack as one versioned artifact: make an approved content change once, assign new assessment IDs where ordered content changes, and distribute the same files to all four repositories. Do not maintain app-specific edits to the JSON. For this initial handoff, the original transcription artifact is retained in the Codex deliverables folder; the copied JSON is byte-identical to it. No external folder is required at app runtime.

## Included content

| IDs | Assessments |
| --- | --- |
| `dbe-egra-xh-hl-1-v1` through `dbe-egra-xh-hl-3-v1` | isiXhosa EGRA 1–3 |
| `dbe-egra-en-hl-1-v1` through `dbe-egra-en-hl-3-v1` | English HL EGRA 1–3 |
| `dbe-egra-en-fal-1-v1` through `dbe-egra-en-fal-3-v1` | English FAL EGRA 1–3 |
| `dbe-egra-af-hl-1-v1` through `dbe-egra-af-hl-3-v1` | Afrikaans EGRA 1–3 |
| `smrs-egra-zu-1-v1` | Jim's supplied isiZulu SMRS EGRA |

Assessment numbers identify source forms, not school grades. All 13 assessments contain letters, familiar words, a passage, and five comprehension questions with source answer keys (65 questions in total).

## Data contract

- `formatVersion` describes the JSON structure; `contentVersion` identifies this catalog snapshot.
- Each assessment has a stable `id`, a display `title`, an ISO 639-1 `languageCode`, a `variant` (`hl`, `fal` or the supplied `smrs` instrument), and the source `assessmentNumber`.
- `letters.items` and `words.items` are flat arrays in printed row order. `columns` records the source grid width. `practiceItems` are separate, unscored examples and must not be included in results.
- Item `id` is a **one-based position within its section**. Persist `(assessment.id, section, item.id)` together. If adapting to an existing zero-based array API, convert explicitly with `Number(item.id) - 1`.
- Repeated letters/words and original case are intentional. Never deduplicate, shuffle, or lowercase the canonical arrays. Never use prompt text as a response's unique identity.
- `passage.text` is the canonical display text, with `\n\n` for paragraph breaks. PDF layout wraps have been joined. No precomputed passage-token IDs are imposed on either app's scoring model.
- `comprehension.questions` contains `id`, `text`, `answerText`, and `maxScore`. Answers are **human assessor rubrics**, not exact-match machine-scoring strings. Some source answers explicitly accept any reasonable answer or alternative wording.
- `source` contains a source ID and **one-based PDF page numbers**, which may differ from printed page numbers. For isiXhosa comprehension, `questionSource` identifies the learner-chart question and `source` identifies its teacher-guide answer key.
- `sources` records direct public URLs where available and SHA-256 hashes of the exact PDFs used. The isiZulu source is the user-supplied PDF and has no inferred public URL.
- `sourceReportedItemCount` is the printed heading count; `null` means the selected chart does not print one. Array length is the number of transcribed items. Do not use a heading's count to truncate the array.
- `whitespaceTokenCount` is a diagnostic count only. It is **not** an approved oral-reading scoring denominator. Punctuation and hyphen spacing can affect tokenization.

Once responses refer to an assessment ID, keep its content unchanged. A corrected or adapted form should receive a new ID. The catalog is small enough to bundle as one JSON file; neither a database migration nor an npm package is necessary just to share the content.

## Source discrepancies preserved for review

These are recorded on the affected assessments in `sourceNotes`:

- Afrikaans assessment 2: the letter chart says **60**, but prints **70** letters (seven rows of ten). All 70 are included.
- English FAL assessment 2: the word chart says **80**, but prints **60** words (ten rows of six). All 60 are included.
- isiXhosa assessment 2: the passage reports **68** words; its transcribed whitespace count is **67**.
- English HL assessment 2: the passage reports **122** words; its transcribed whitespace count is **123**.
- English FAL assessment 3: the passage reports **95** words; its transcribed whitespace count is **98**, including the source's separately spaced full stop in `Lebo .`.
- The isiXhosa guide's introductory counts do not match its actual charts. Learner charts are used for items/questions, and the guide for answer keys. Minor question wording differences between these files remain traceable.
- isiXhosa assessment 1 has missing punctuation between `nguSidumo` and `Wabona`; the teacher-guide answer to question 4 has an unmatched closing quote. These are retained.
- isiXhosa assessment 3 prints `uNomehlo- mancinane` with a space, retained in the passage.
- The English HL assessment 1 and EFAL assessment 1 worked-example answer keys differ slightly from their assessment-page keys. This pack uses the assessment-page keys and documents the alternatives.
- Afrikaans assessment 3 prints `he` without the circumflex. It is retained.
- The supplied isiZulu question 4 names `Umama`, while the corresponding passage sentence names `Usisi`. Both are retained.

This is a source transcription, not a newly standardized instrument. It includes the one-minute task durations, but does not encode the complete administration instructions, stop rules, grade benchmarks or automatic scoring algorithms. Use the linked source manuals when selecting an operational protocol. The source notes should be resolved deliberately before adopting a form for field use.

## Verification

The catalog was parsed and checked for all 13 assessments, 920 letter positions, 990 word positions, 13 passages and 65 question/answer pairs. Section IDs are unique and sequential, and source references resolve. Extracted grid order and case were retained, with visual checks of the ambiguous source count discrepancies. This does not establish native UI behavior or scoring integration in either app.
