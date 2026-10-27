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

The file's `language` is the shared catalogue name: `isixhosa`, `english` or `afrikaans`.
`PACK_LANGUAGE_CODES` maps those names to the Masi codes `xh`, `en` and `af`. New packs carry
`letter_order` immediately after `channel`, naming an order in the unchanged vendored registry
`src/constants/contracts/letter-orders-v1.json`.

`lintMasiPack` runs the shared checker first and appends the Masi checks. The letter order must
exist (`pack_letter_order`), belong to the pack's language (`pack_letter_order_language`), and
have exactly the same letter steps (`pack_letter_order_letters`). Steps are compared in numeric
step order without mutating the pack. Non-empty sound steps, sorted by step and flattened, must
match the order's sounds (`pack_letter_order_sounds`); empty sound steps are valid for a
letters-only pack.

`CURRENT_PACK_IDS` explicitly chooses the release and preview pack for each **order id**. It
never chooses the highest version. `getPackForOrder(orderId, options)` reads these mappings, and
registry construction refuses a current pack whose resolved letter order differs from its key.
The current edition is `2026-10-23`:

| Code | Letter order | Current release | Current preview |
|---|---|---|---|
| `xh` | `isixhosa-order-2026-10-23` | `isixhosa-interim-letters-v2` | `isixhosa-candidates-preview-v2` |
| `en` | `english-order-2026-10-23` | `english-interim-letters-v2` | `english-candidates-preview-v1` |
| `af` | `afrikaans-order-2026-10-23` | `afrikaans-interim-letters-v2` | `afrikaans-candidates-preview-v1` |

Each v2 release uses the v1 JSON format and key order with `letter_order` added after `channel`.
It has the alphabetical 26-letter sound inventory and 12 letter steps from the named order:
four letters in step 1, then pairs. Every step has empty blends, words and readers, with no
`size_exception`. Sound steps, word bank, readers and reader details are empty.

The three v1 releases and `isixhosa-candidates-preview-v1` keep their original bytes and remain
bundled for saved drafts and sessions. These files predate the `letter_order` field, so the frozen
`LEGACY_PACK_LETTER_ORDERS` table resolves their order:

| Retained pack id | Letter order |
|---|---|
| `isixhosa-interim-letters-v1` | `isixhosa-order-2026-10-18` |
| `isixhosa-candidates-preview-v1` | `isixhosa-order-2026-10-18` |
| `english-interim-letters-v1` | `english-order-legacy` |
| `afrikaans-interim-letters-v1` | `afrikaans-order-legacy` |

`packLetterOrderId(pack)` uses the pack's explicit field when present, otherwise its entry in
that table, otherwise `null`. A retained pack's availability by id does not make its order current;
for example, `getPackForOrder('english-order-legacy')` returns `null`.

Lessons choose a pack by the class's teaching order, never by language. `lessonOrderAndPack`
(`src/lessonPlan/inputs/lessonInputs.js`) resolves the class's edition and language to an order,
then takes `getPackForOrder(order.id, options)` for a new lesson or `getPackById(draft.pack_id,
options)` for a resumed one. It keeps the pack only when `packLetterOrderId(pack)` equals the
order, so a 2026-10-23 class is never taught from a v1 pack. Diagnostics report the current
edition's packs through `getPackForOrder`.

The registry imports JSON files statically. `BUNDLED_PACKS` is a frozen array, every pack is
deep-frozen once at module load, and lookup functions return those same objects. Every bundled
pack must pass `lintMasiPack` in Jest. Released packs are append-only: never edit or remove one.
Their file bytes are SHA-256-pinned in `RELEASE_PACK_SHA256` in
`__tests__/lessonPlanPacks.test.js`.

All lookup functions return `null` for unknown or missing keys and check own mapping properties.
`getPackById` resolves retained versions as well as current packs. Preview packs are hidden on
both order and id lookups unless `{ allowPreview: true }` is passed; other values do not opt in.
The order lookup falls back to its release when no preview is mapped. Options may be omitted or
`null`.

## Release and preview

Preview content may contain unreviewed candidate words, so it is off by default. Only the literal environment value `MASI_PREVIEW_CONTENT=1` enables the setting; `app.config.js` exposes the result as the boolean `extra.previewContent`. Never set `MASI_PREVIEW_CONTENT` in an EAS environment. Use a local developer shell or the dedicated `preview-content` build profile instead.

Two checks enforce lesson-plan C12. At build time, `resolvePreviewContentBuildConfig` refuses the setting when `EAS_BUILD_PROFILE` is `pilot` or `production`. At runtime, `isPreviewContentEnabled()` requires `Constants.expoConfig.extra.previewContent === true` and rejects native `Updates.channel` values `preview` and `production`. It returns `false` if reading runtime configuration fails. Callers pass `{ allowPreview: isPreviewContentEnabled() }` to `getPackForOrder` and `getPackById`.

Both checks are needed because an OTA evaluates app config without the build server's `EAS_BUILD_PROFILE`. An OTA published from a shell with the setting could therefore carry `extra.previewContent: true`. The runtime check still rejects it on field-channel phones: `Updates.channel` comes from the native build, and an OTA cannot change it. In particular, pilot builds use the `preview` channel and must keep release content only. A missing, null or empty channel does not opt in by itself; the boolean setting must also be true.

Candidate-word cloud test builds use `--profile preview-content`. This profile uses the `preview` environment, internal distribution, automatic build-number increments and an Android APK. Its environment variables equal the regular `preview` profile's variables plus `MASI_PREVIEW_CONTENT=1`, and it has no update channel. For example:

```bash
npx eas-cli@latest build -p android --profile preview-content
```

## Preview exports

The three current previews are copied unchanged from the books repository's
`exports/app-preview/` at commit `6cd5e64`. Their bytes are pinned by `PREVIEW_PACK_SHA256` in
`__tests__/lessonPlanPacks.test.js`; `generated_from` describes the export's source inputs, while
this commit and the SHA-256 pins identify the adopted export files. Do not edit them in Masi.

These exports contain candidate word banks and sound steps for the `2026-10-23` orders. They
have no readers, so developer builds show no book (**Molo, Lolo!** is gone) until books adds
readers. The retained isiXhosa preview v1 still holds that reader for saved drafts and sessions.

To adopt another export, add a new version, copy it unchanged, verify its hash, bundle it, and
update the appropriate order mapping and provenance pin. Retain versions referenced by saved
sessions and drafts.

## Retained isiXhosa preview generator

`isixhosa-candidates-preview-v1.json` is a preview-only test pack (lesson-plan J17), not a reviewed books release. It was generated from `early-reader-books` commit `1c301cfddcee061d5d5f915e991d7470a4ba7f37`. Its 3,328 word-bank entries are all candidates; it has 12 letter steps, 11 sound steps and one draft reader, `xh-int-v1-r01`. Decodability checks are not native-speaker review or approval for field use.

The generator only reproduces the retained `2026-10-18` preview v1 and refuses other letter orders. It reads `languages/xh/pack.yaml`, `languages/xh/wordbank.csv`, `cast/cast.yaml` and every `books/*/book.yaml` with `series: isixhosa-integrated`. YAML is parsed with YAML 1.2 (`yaml@2.8.2`), keeping `y` and `n` as letters. CSV uses the existing shared parser. To regenerate from a clean books checkout:

```bash
PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" npm run content:xh-test-pack -- \
  --books-repo /Users/jimmckeown/Development/early-reader-books \
  --out src/lessonPlan/packs/isixhosa-candidates-preview-v1.json --version 1
```

The script records the books HEAD in `generated_from` and refuses uncommitted changes under `languages/xh`, `books` or `cast` before reading source files. The CLI requires all three flags, rejects unknown or duplicate flags, and requires a positive integer version. Its pure builder applies these rules:

- Refuse a language code other than `xh` or a letter order different from the retained interim isiXhosa pack's `2026-10-18` order. Copy the letter steps, including `sizeException` as `size_exception`; append the sound steps in step order to the tracker-letter inventory.
- Keep every word-bank row except `status: rejected`. Compute its first decodable step with the vendored checker; refuse with a list of all words whose step is missing or disagrees with the CSV. Sort by step, then text in code-unit order. Store missing or blank syllables as `null`.
- For each letter step, generate known consonant + vowel blends with at least one newly taught letter. Consonants are the outer loop and vowels the inner loop, both in teaching order. Step 1 is `mo, ma, lo, la`; step 2 is `mu, lu, ko, ka, ku`.
- For every letter or sound step, take up to 12 words first decodable at that step with at least three letters, ranked by descending `corpus_2024_count`, then code-unit text order. Use syllables with their hyphens, falling back to the word's text.
- Convert every integrated-series book, including drafts, into a reader at its declared step; sort reader ids within each step. Join each page's lines with a newline and retain the original speaker/text lines in `reader_details`, with `retired: false`. Resolve speaker names from the cast's `names.xh.name`, refusing missing cast entries; use red for `voices.a`, blue for `voices.b`, grey otherwise.

The CLI writes deterministic two-space JSON with a final newline only after the entire pack passes `lintMasiPack`. Source or validation failures leave an existing output unchanged.

The preview JSON is statically bundled in every binary, but lookup resolves it only with `{ allowPreview: true }` (decision 8). Normal lookup still returns the interim release pack; callers must use the C12 developer-build gate described above to opt in. Bundling is not permission to display candidate content to field users.

The generator does not produce the current books exports. Keep the retained preview v1 bytes and id so saved drafts continue to resolve; the legacy order table lets that unchanged output pass the order lint.

## Adopting a books release

To adopt a release, copy `integrated-sequence-<name>-v<N>.json` unchanged into `src/lessonPlan/packs/`. Add its static import to `index.js` and include the imported pack in the list used to build `BUNDLED_PACKS`. Point `CURRENT_PACK_IDS.release[orderId]` at its in-file id, keeping older release packs bundled. Compute the new file's SHA-256 and append its id and hash to `RELEASE_PACK_SHA256` in `__tests__/lessonPlanPacks.test.js`.

Run `__tests__/lessonPlanPacks.test.js`, `__tests__/lintMasiPack.test.js` and `__tests__/decodability.test.js` under Jest. A failing lint sends the file back to the books project for correction and a new release; the file is never fixed in the Masi app. The shared contract is lesson-plan spec §4.1 in `docs/superpowers/specs/2026-10-20-lesson-plan-design.md`.
