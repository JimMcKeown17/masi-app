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
