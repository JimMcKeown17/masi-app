# Content packs

This document describes the bundled content-pack contract for lesson-plan specification §4.1. Real teaching packs come from the `early-reader-books` project; the Masi app consumes those versioned files rather than inventing words, syllables, or readers.

## Vendored checker

The decodability checker in `src/utils/decodability/` and its shared vector contract in `src/constants/contracts/decodability-v1.json` were copied from `early-reader-books` commit `1c301cf`. The checker itself last changed in commit `3685c49`.

These copies are vendored source and must never be edited in the Masi repository. Checker changes belong in `early-reader-books`, where they are tested and versioned, and Masi then adopts the matching core and vectors together.

To re-vendor at a new books commit, replace `NEW_BOOKS_COMMIT` below and run:

```bash
B=/Users/jimmckeown/Development/early-reader-books
mkdir -p src/utils/decodability src/constants/contracts
for f in index lint normalize sounds; do
  git -C "$B" show NEW_BOOKS_COMMIT:checker/core/$f.js > src/utils/decodability/$f.js
done
git -C "$B" show NEW_BOOKS_COMMIT:checker/vectors/decodability-v1.json \
  > src/constants/contracts/decodability-v1.json
```

Then update the source commit and every `VENDORED_SHA256` value in `__tests__/decodability.test.js`. If the vector version changed, update that test's version assertion at the same time. The provenance test must keep all copied files and their hashes pinned together.

The app's Jest runner ports every canonical shared-vector loop except `the in-memory generator agrees with the committed lint cases`. That test imports the books repository's TypeScript lint-vector generator, which is source-repository tooling rather than portable checker behavior; it remains covered in `early-reader-books` and is deliberately not vendored into the app.

## Bundled packs

Content packs live in `src/lessonPlan/packs/`. App-made packs use an id of `<name>-<kind>-v<N>` and a matching `<id>.json` filename. Books releases keep their original `integrated-sequence-<name>-v<N>.json` filename. The registry keys every pack by its in-file `id`.

The file's `language` is the shared catalogue name: `isixhosa`, `english` or `afrikaans`. `PACK_LANGUAGE_CODES` maps those names to the Masi codes `xh`, `en` and `af`. Callers use codes with `getPack(languageCode)`; names are not accepted as lookup keys.

`CURRENT_PACK_IDS` explicitly chooses the current id for each code in its `release` and `preview` maps. Current means the named id, rather than the highest version number: interim and integrated packs are different families. The release map currently names these three interim letters-only packs; the preview map is empty:

| Code | Current release id | Source of the letter order |
|---|---|---|
| `xh` | `isixhosa-interim-letters-v1` | Books order from lesson-plan J1 |
| `en` | `english-interim-letters-v1` | Masi's `ENGLISH_PEDAGOGICAL_ORDER` in `src/constants/egraConstants.js` |
| `af` | `afrikaans-interim-letters-v1` | Zazi's provisional `AFRIKAANS_PEDAGOGICAL_ORDER`, also specified by lesson-plan C10 |

Each interim file has the alphabetical 26-letter sound inventory and 12 letter steps: four letters in step 1, then pairs. Every step's blends, words and readers are empty. There are no sound steps, word-bank entries, readers or reader details. The packs supply letter advice until the books project releases real content for each language. The isiXhosa tracker still uses its existing order until A2 switches it to packs; the pack already carries J1's order. Afrikaans pack lookup works independently of the separate AF assessment-registry change.

The registry imports JSON files statically. `BUNDLED_PACKS` is a frozen array, every pack is deep-frozen once at module load, and lookup functions return those same objects. Every bundled pack must pass `lintMasiPack` in Jest. Released packs are append-only: they are never edited or removed, and their file bytes are SHA-256-pinned in `__tests__/lessonPlanPacks.test.js`. Old release versions stay bundled for drafts and saved sessions that reference them.

`getPack` and `getPackById` return `null` for unknown or missing keys rather than throwing, and they check own properties only. `getPackById` resolves any bundled release version, including one that is no longer current. A preview pack is available only with `{ allowPreview: true }`; other values do not opt in. `getPack` falls back to the current release pack when no preview pack exists for the code. Options may be omitted or `null`.

## Adopting a books release

For track D, copy `integrated-sequence-<name>-v<N>.json` unchanged into `src/lessonPlan/packs/`. Add its static import to `index.js` and include the imported pack in the list used to build `BUNDLED_PACKS`. Point `CURRENT_PACK_IDS.release[code]` at its in-file id, keeping older release packs bundled. Compute the new file's SHA-256 and append its id and hash to `RELEASE_PACK_SHA256` in `__tests__/lessonPlanPacks.test.js`.

Run `__tests__/lessonPlanPacks.test.js`, `__tests__/lintMasiPack.test.js` and `__tests__/decodability.test.js` under Jest. A failing lint sends the file back to the books project for correction and a new release; the file is never fixed in the Masi app. The shared contract is lesson-plan spec §4.1 in `docs/superpowers/specs/2026-10-20-lesson-plan-design.md`.
