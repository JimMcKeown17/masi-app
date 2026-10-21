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
