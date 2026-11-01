# Numeracy curriculum

## What this is

The bundled numeracy curriculum supplies the Number tracker and lesson activities offline.
The current edition, `2026.1-draft`, has ten skills and 37 steps. This pack belongs to
Masi and is not shared with other repositories, unlike `content/egra/`.

The JSON is the source of truth. The EGMA-to-step mapping lives in code, not in this
content file, as specified in the numeracy design §7.2.

## Loading

```js
const {
  CURRENT_EDITION,
  getCurriculum,
  getStep,
  listStepKeys,
} = require('./content/numeracy-curriculum');

const curriculum = getCurriculum();
const step = getStep(curriculum, 'add.10');
const keys = listStepKeys(curriculum);
```

Adjust the relative path for the caller. `getCurriculum()` always returns the same
deep-frozen object. `getStep(curriculum, stepKey)` matches keys exactly and returns
`null` for unknown, retired or non-string keys. It never changes case, trims spaces,
or falls back to another step. `listStepKeys(curriculum)` returns a frozen array in
curriculum order: skills in file order, with steps in size order.

Readonly TypeScript declarations are provided in `index.d.ts`.

## Editions

The `-draft` suffix means the content is awaiting partner sign-off. Draft content
can be revised during review. The first frozen edition will be `2026.1`.

Frozen editions are never edited in place. A wording fix gets a new edition; a
changed step meaning gets a new step key. Step keys carry meaning independently of
the edition's wording.

Changing `CURRENT_EDITION` in `index.js` also requires changing its literal JSON
`require`. That static path lets Metro bundle the chosen edition for offline use.

## What verify checks

Run `npm run test:content` to check all three content packs, or
`node --test content/numeracy-curriculum/verify.cjs` to check this pack alone.
Use Node 20 for both commands.

The verifier checks every bundled edition. It reports each problem as
`<owner> <field path>: <problem>`, using the step key, skill key or `curriculum`
as the owner. Whole-object problems omit the field path. Malformed content
produces messages instead of crashing.

- Objects have exactly the expected fields at every level: curriculum, skill,
  step, activity and tick check. Missing fields, extra fields and wrong types
  are reported.
- The ten skills follow curriculum order, with the prescribed group and slot.
  Every step names its containing skill.
- Step keys are unique and match `<skill>.<size>` and
  `^[a-z_]+\.[0-9a-z]+$`. Skip count uses `skip_count.2s`,
  `skip_count.5s` and `skip_count.10s`, with sizes 20, 50 and 100.
  Sizes are positive integers and strictly increase within each skill.
  A string such as `"5"` is a wrong type; it is never converted to a number.
- Every step has two or three activities, with unique names within that step.
  Minutes are whole numbers from 4 to 8. Warm-up steps have at least one
  activity lasting 5 minutes or less. Instructions are a non-empty array of
  strings, and the source is `partner`, `adapted` or `new`.
- Every tick check has exactly three questions and three expected answers.
  Its rule is exactly `All 3 right? Tick it.`.
- String fields are non-empty and have no leading or trailing whitespace,
  including partner notes and source references.
- `comes_after` is an array of strings. Order rules and tick arithmetic are
  added in Task 3.
- Editions match `YYYY.number`, optionally ending in `-draft`. Each JSON
  file's name matches its edition. Frozen editions have SHA-256 pins, pinned
  bytes cannot change, and every pin has a corresponding file.

The plain-words scan covers only these EA-facing fields: Skill `label` and
`hint`; Step `label` and `goal`; Activity `name`, every `how[]` instruction
and `needs`; TickWhen `setup`, every `ask[]` and `expected[]` item, and
`rule`. It excludes partner notes, source references, keys, edition and other
metadata.

The banned words are “counting on” / “count on”, “counting all” / “count all”,
“subitise” / “subitize” and their endings, “number bond(s)”, “rung(s)”,
“ladder(s)”, “band(s)”, and “strategy” and its endings (including “strategies”).
Matching ignores case and respects word boundaries, so ordinary words such as
“husband”, “abandon” and “bandage” are allowed. “Rubber band” in `needs` would
be rejected: write “elastic”. Partner notes may still use these terms.

To freeze an edition after sign-off:

1. Copy the draft to `curriculum-<edition>.json`, dropping `-draft` from the
   new edition.
2. Set the copied JSON's `edition` to match its file name.
3. Point both `CURRENT_EDITION` and the literal `require` in `index.js` at
   that edition.
4. Calculate the new file's SHA-256 and add its edition and hash to
   `FROZEN_EDITIONS` in `verify.cjs` in the same commit.
5. Run the content checks before committing. Future wording changes get a
   new edition; changed step meanings also get new step keys.
