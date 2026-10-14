# WelaPLUS Release 1 — Plan 1: Question Package Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. In this repository the implementer for each task is **Codex through the plugin** (gpt-5.6-sol); Claude reviews each task's diff and test output before the next task starts (AGENTS.md, "When Building").

**Goal:** Make the `src/assessment-questions/` package field-correct for WelaPLUS 2024.1:
- real English and isiXhosa content;
- the battery definition and a tested battery-state evaluator;
- one terminal callback per Question;
- an explicit last-attempted marker;
- per-letter Q9 and per-word Q10 marking;
- Q1, Q6, and Q8 layouts that mirror the printed card;
- untimed Q6 and Q8;
- an optional Q11 picture and rubric anchors;
- Masi-aligned package tokens with a raw-hex guard.

**Architecture:** All work is inside the OSS package `src/assessment-questions/`, which must not
import host code. `boundary/findForbiddenImports.ts` and its live-scan test enforce this. Shared
behaviour moves into four small package modules: `theme/tokens.ts`, `skip/`, `progress/`, and
`battery/`. Each Question component then uses them, which removes ten copies of the skip picker.
No host screen, repository, sync, or schema change is made here; those belong to Plans 2 and 3.

**Tech Stack:** React Native 0.81 / Expo 54, TypeScript (strict, `tsconfig.assessment-questions.json`), Jest with `@testing-library/react-native`.

**Spec:** [`docs/superpowers/specs/2026-10-14-welaplus-release-1-design.md`](../specs/2026-10-14-welaplus-release-1-design.md). The sections this plan implements are 4 (content), 5.3 (component changes), and 6 (battery and evaluator), with decisions D1, D4, and D5.

## Global Constraints

- The package must not import from `src/services/`, `src/repositories/`, `src/screens/`,
  `src/db/`, `src/constants/`, `expo-*`, `@supabase/*`, `@react-native-community/*`, or
  `@react-native-async-storage/*`. `npx jest src/assessment-questions/__tests__/boundary.test.ts`
  stays green.
- Content version label: **`2024.1`**. Every bundled item set has
  `question_version: '2024.1'` and `item_set_id: '<question_code>@2024.1.<en|xh>'`.
- `question_code` values are fixed: `wela_plus_letter_sounds`, `wela_plus_listen_and_answer_story`,
  `wela_plus_first_sound`, `wela_plus_phoneme_blend`, `wela_plus_letter_writing`,
  `wela_plus_read_words`, `wela_plus_read_sentences`, `wela_plus_read_passage`,
  `wela_plus_write_cvcs`, `wela_plus_write_sentences_dictation`, `wela_plus_story_writing`.
- Battery: `battery_code: 'wela_plus_full'`, `battery_version: '2024.1'`. `prerequisites: {}`
  (D4: auto-skip off).
- Manual skip reasons, and only these: `skipped_child_refused`, `skipped_tired`,
  `skipped_time`, `skipped_age`, `skipped_other`. `skipped_prerequisite_unmet` is host-only.
- Positions are zero-based. `last_attempted_position = -1` means nothing attempted.
  `total_attempted = last_attempted_position + 1`. `null` only for Questions that do not track
  progress.
- Q10 is scored per word (D5): EN max 15, XH max 9. Q9 is scored per scoring letter: EN 12,
  XH 16.
- No raw hex colour literals outside `src/assessment-questions/theme/tokens.ts`.
- Node 20 for every test command:
  `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH` (the shell default is v22, and
  `better-sqlite3` is built for 20).
- Gates at the end: `npm test`, `npm run test:integration`, `npm run test:types`, all green.

## Review Focus

1. **A Question ended by the timer while the EA is mid-tap.** The timer opens the
   last-attempted sheet. A tap on an item underneath must not change marks after the sheet
   opens, and the Question must emit exactly one `onComplete`. Pinned in Task 5 Step 1
   (timer-then-tap test).
2. **The EA taps End, then backs out of the last-attempted sheet.** Cancel returns to marking
   with every mark intact and no `onComplete`. Pinned in Task 4 Step 1 (sheet cancel test) and
   Task 5 Step 1.
3. **Repeated words or letters** (EN Q6 has "there how" twice; Q1 repeats letters). Marking
   one occurrence must never mark the other. Pinned in Task 6 Step 1 (duplicate-word test).
4. **A double tap on a skip reason, or on Finish.** It must emit exactly one `onComplete`.
   Pinned in Task 3 Step 1 (double-press test across all components).
5. **The isiXhosa item set selected by `language="xh"` without an override.** It must render
   isiXhosa content, not English. Pinned in Task 12 Step 1 (language-resolution test per
   Question).

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `src/assessment-questions/theme/tokens.ts` (create) | The only place colour and size literals live; Masi-aligned values | 1 |
| `src/assessment-questions/__tests__/rawHexGuard.test.ts` (create) | Fails if any package file other than `tokens.ts` has a hex colour literal | 1 |
| `src/assessment-questions/testFixtures/*.ts` (create) | Frozen copies of today's stub item sets, so component tests do not depend on bundled content | 2 |
| `src/assessment-questions/skip/skipReasons.ts` (create) | `MANUAL_SKIP_REASONS`, `ManualSkipReason` | 3 |
| `src/assessment-questions/skip/SkipReasonPicker.tsx` (create) | The one skip-reason picker used by every Question | 3 |
| `src/assessment-questions/types/QuestionProps.ts` (modify) | Remove `onAbandon` | 3 |
| `src/assessment-questions/progress/applyProgress.ts` (create) | Pure: applies a last-attempted position to items and derives `total_attempted` | 4 |
| `src/assessment-questions/progress/LastAttemptedSheet.tsx` (create) | Modal sheet: pick the last attempted item, "Reached the end", "Nothing attempted" | 4 |
| `src/assessment-questions/contractTest/validateResult.ts` (modify) | `tracks_progress` rule | 4 |
| `questions/LetterSoundsQuestion/*` (modify) | Q1: card-mirroring rows, marker | 5 |
| `questions/ReadWordsQuestion/*` (modify) | Q6: `row_lengths`, marker | 6 |
| `questions/ReadPassageQuestion/*` (modify) | Q8: untimed default, `paragraph_starts`, marker | 7 |
| `questions/ReadSentencesQuestion/index.tsx` (modify) | Q7: Finish rule, `tracks_progress` | 7 |
| `questions/WriteCvcsQuestion/*` (modify) | Q9: per-letter marking | 8 |
| `questions/WriteSentencesFromDictationQuestion/*` (modify) | Q10: per-word marking grouped by sentence | 9 |
| `questions/StoryWritingRubricQuestion/*` (modify) | Q11: optional picture, optional anchors | 10 |
| `src/assessment-questions/types/BatteryConfig.ts` (modify) | Materials, per-language instructions, languages | 11 |
| `src/assessment-questions/battery/evaluateBatteryState.ts` (create) | Pure deep module: next Question, auto-skips, finalize eligibility | 11 |
| `src/assessment-questions/battery/wela_plus_full.ts` (create) | `WELA_PLUS_FULL_2024_1` battery definition | 11 |
| `src/assessment-questions/itemsets/*.ts` (modify, 22 files) and `itemsets/buildPassage.ts` (create) | 2024.1 content EN and XH | 12 |
| `src/assessment-questions/itemsets/contentStatus.ts` (create) | Machine-readable list of pedagogy-pending content (spec 4.3) | 12 |
| `src/assessment-questions/__tests__/itemSetIntegrity.test.ts` (create) | Counts, versions, parity, language resolution | 12 |
| `src/assessment-questions/index.ts` (create) | Public barrel: Questions, battery, evaluator, types, tokens | 11 |

---

### Task 0: Worktree and branch

**Files:** none.

- [ ] **Step 1: Create an isolated worktree from current `main`.** Use the
  superpowers:using-git-worktrees skill.

```bash
cd /Users/jimmckeown/Development/masi-app
git fetch origin
git worktree add -b feat/welaplus-plan-1-question-package .claude/worktrees/welaplus-plan-1 origin/main
cd .claude/worktrees/welaplus-plan-1
PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npm ci
```

- [ ] **Step 2: Record the baseline.**

```bash
PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest src/assessment-questions 2>&1 | grep -E '^(Tests|Test Suites):'
PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npm run -s test:types; echo "types exit=$?"
```

Expected: every suite passes, and types exit 0. Note the counts; Task 13 compares against
them.

---

### Task 1: Package tokens and the raw-hex guard

**Files:**
- Create: `src/assessment-questions/theme/tokens.ts`
- Create: `src/assessment-questions/__tests__/rawHexGuard.test.ts`
- Modify: every `src/assessment-questions/questions/*/index.tsx` that contains a hex literal
  (all 11 Question components)

**Interfaces:**
- Produces: `import { tokens } from '../../theme/tokens'`, with `tokens.color.*`,
  `tokens.space.*`, `tokens.radius.*`, and `tokens.font.*` exactly as defined in Step 3.

- [ ] **Step 1: Write the failing guard test**

```ts
// src/assessment-questions/__tests__/rawHexGuard.test.ts
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..');
const ALLOWED = new Set([path.join(ROOT, 'theme', 'tokens.ts')]);
const HEX_IN_STRING = /['"`]#[0-9a-fA-F]{3,8}['"`]/;

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === '__tests__' ? [] : walk(p);
    return /\.(ts|tsx)$/.test(e.name) ? [p] : [];
  });
}

describe('raw hex guard', () => {
  test('no hex colour literals outside theme/tokens.ts', () => {
    const offenders = walk(ROOT)
      .filter((f) => !ALLOWED.has(f))
      .flatMap((f) =>
        fs.readFileSync(f, 'utf8').split('\n')
          .map((line, i) => (HEX_IN_STRING.test(line) ? `${path.relative(ROOT, f)}:${i + 1}` : null))
          .filter((x): x is string => x !== null),
      );
    expect(offenders).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest src/assessment-questions/__tests__/rawHexGuard.test.ts`
Expected: FAIL, listing offenders such as `questions/ReadWordsQuestion/index.tsx:19`.

- [ ] **Step 3: Create the tokens module.** The values are copied, not imported, from
  `src/constants/colors.js` (the boundary forbids importing it).

```ts
// src/assessment-questions/theme/tokens.ts
/**
 * Package design tokens. The ONLY file in the package allowed to contain colour literals
 * (enforced by __tests__/rawHexGuard.test.ts). Values mirror the Masi host palette in
 * src/constants/colors.js; they are copied because the OSS boundary forbids importing host code.
 */
export const tokens = {
  color: {
    ink: '#221A1B',
    muted: '#76696B',
    line: '#ECE5E4',
    canvas: '#F8F5F4',
    surface: '#FFFFFF',
    primary: '#E72D4D',
    primaryPressed: '#C81F3E',
    onPrimary: '#FFFFFF',
    marked: '#2E7D27',
    onMarked: '#FFFFFF',
    markedSoft: '#E7F3E5',
    notReached: '#B3A8A8',
    scrim: 'rgba(34, 26, 27, 0.45)',
  },
  space: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 },
  radius: { pill: 999, card: 12, cell: 8 },
  font: { markingItem: 28, prompt: 32, body: 16, caption: 13, heading: 20 },
} as const;

export type Tokens = typeof tokens;
```

- [ ] **Step 4: Replace every hex literal in the 11 components with tokens.** Use this mapping
  (old → new):
  - `'#2e7d32'` (MARKED_BG) → `tokens.color.marked`
  - `'#ffffff'` (IDLE_BG, text on marked) → `tokens.color.surface` for backgrounds, and
    `tokens.color.onMarked` for text on a marked background
  - `'#111'` → `tokens.color.ink`
  - `'#999'` (borders) → `tokens.color.line`
  - `'#1f3a5c'` and any other remaining literal → `tokens.color.primary` if it is an accent,
    otherwise `tokens.color.ink`

  Delete the `MARKED_BG` and `IDLE_BG` constants. Add
  `import { tokens } from '../../theme/tokens';` to each file. For example, in
  `ReadWordsQuestion/index.tsx`:

```tsx
// before
style={[styles.pill, { backgroundColor: marked ? MARKED_BG : IDLE_BG }]}
// after
style={[styles.pill, { backgroundColor: marked ? tokens.color.marked : tokens.color.surface }]}
```

- [ ] **Step 5: Run the guard, the package suite, and types**

Run:
```bash
PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest src/assessment-questions
PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npm run -s test:types
```
Expected: all pass. The guard reports `[]`.

- [ ] **Step 6: Commit**

```bash
git add src/assessment-questions
git commit -m "feat(wela): package design tokens and raw-hex guard"
```

---

### Task 2: Decouple component tests from bundled content

The bundled stub item sets are replaced with real content in Task 12. Today's component tests
read stub words such as `cat` and `dog` through the default item set. This task freezes those
stubs as fixtures and passes them explicitly, so Task 12 cannot break behaviour tests.

**Files:**
- Create: `src/assessment-questions/testFixtures/index.ts`, plus one file per Question:
  `letterSounds.ts`, `listenAndAnswerStory.ts`, `firstSound.ts`, `phonemeBlend.ts`,
  `letterWriting.ts`, `readWords.ts`, `readSentences.ts`, `readPassage.ts`, `writeCvcs.ts`,
  `writeSentencesDictation.ts`, `storyWriting.ts`
- Modify: every `questions/*/__tests__/*.test.tsx`
- Modify: `src/assessment-questions/__tests__/boundary.test.ts`, only if it walks
  `testFixtures`; fixtures import nothing forbidden, so normally no change is needed

**Interfaces:**
- Produces: `import { FIXTURE_READ_WORDS_EN } from '../../../testFixtures';` and so on. Each
  fixture is a byte-for-byte copy of the current
  `itemsets/wela_plus_<name>.en.ts` export, with
  `item_set_id: '<question_code>@fixture.en'` and `question_version: 'fixture'`.

- [ ] **Step 1: Create the fixtures.** Copy each current English stub's content into
  `testFixtures/<name>.ts` under the name `FIXTURE_<NAME>_EN`. Re-export them all from
  `testFixtures/index.ts`. Example:

```ts
// src/assessment-questions/testFixtures/readWords.ts
import type { ItemSet } from '../types/ItemSet';
import type { ReadWordsItemSet } from '../questions/ReadWordsQuestion/types';

export const FIXTURE_READ_WORDS_EN: ItemSet<ReadWordsItemSet> = {
  item_set_id: 'wela_plus_read_words@fixture.en',
  question_code: 'wela_plus_read_words',
  question_version: 'fixture',
  language: 'en',
  words: [
    { item_key: 'cat', word: 'cat' }, { item_key: 'dog', word: 'dog' },
    { item_key: 'sun', word: 'sun' }, { item_key: 'run', word: 'run' },
    { item_key: 'big', word: 'big' }, { item_key: 'red', word: 'red' },
    { item_key: 'top', word: 'top' }, { item_key: 'man', word: 'man' },
    { item_key: 'hat', word: 'hat' }, { item_key: 'pig', word: 'pig' },
    { item_key: 'bed', word: 'bed' }, { item_key: 'fox', word: 'fox' },
    { item_key: 'cup', word: 'cup' }, { item_key: 'jug', word: 'jug' },
    { item_key: 'leg', word: 'leg' }, { item_key: 'pen', word: 'pen' },
    { item_key: 'box', word: 'box' }, { item_key: 'web', word: 'web' },
    { item_key: 'mug', word: 'mug' }, { item_key: 'log', word: 'log' },
  ],
};
```

- [ ] **Step 2: Pass fixtures in every component test.** In every `render(<XQuestion .../>)`
  and every `runContractTest(XQuestion, { ... })` that relies on the default English item set,
  add `itemSet={FIXTURE_X_EN}` (or `itemSet: FIXTURE_X_EN`). Tests that explicitly exercise
  `language="xh"` default resolution are moved to Task 12's integrity test and deleted here.

```tsx
// before
render(<ReadWordsQuestion language="en" instructions="." durationSec={60} onComplete={jest.fn()} />);
// after
render(<ReadWordsQuestion language="en" itemSet={FIXTURE_READ_WORDS_EN} instructions="." durationSec={60} onComplete={jest.fn()} />);
```

- [ ] **Step 3: Prove the decoupling.** Temporarily change one word in
  `itemsets/wela_plus_read_words.en.ts` (for example, `cat` → `cot`).

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest src/assessment-questions/questions/ReadWordsQuestion`
Expected: PASS. The tests no longer read bundled content. Revert the temporary edit.

- [ ] **Step 4: Run the package suite.** Expected: the same counts as the Task 0 baseline,
  minus any default-language tests moved to Task 12, all passing.

- [ ] **Step 5: Commit**

```bash
git add src/assessment-questions
git commit -m "test(wela): component tests use frozen fixtures, not bundled content"
```

---

### Task 3: One terminal callback per Question (shared skip picker)

The spec (5.3) requires exactly one `onComplete` per presentation. Today ten components call
`onAbandon(reason)` and then `finish(reason)`, so one skip fires two callbacks. Each component
also offers `Prerequisite unmet`, which is host-only.

**Files:**
- Create: `src/assessment-questions/skip/skipReasons.ts`
- Create: `src/assessment-questions/skip/SkipReasonPicker.tsx`
- Create: `src/assessment-questions/__tests__/oneTerminalCallback.test.tsx`
- Modify: `src/assessment-questions/types/QuestionProps.ts` (remove `onAbandon`)
- Modify: all 10 components with a skip picker: FirstSound, PhonemeBlend, LetterWriting,
  ListenAndAnswerStory, ReadWords, ReadSentences, ReadPassage, WriteCvcs,
  WriteSentencesDictation, and StoryWritingRubric. LetterSounds has no skip UI today; add one
  so all 11 behave the same.
- Modify: component tests that press `Abandon` or assert on `onAbandon`

**Interfaces:**
- Produces:
  - `type ManualSkipReason = 'skipped_child_refused' | 'skipped_tired' | 'skipped_time' | 'skipped_age' | 'skipped_other'`
  - `MANUAL_SKIP_REASONS: ReadonlyArray<{ reason: ManualSkipReason; label: string }>`
  - `<SkipReasonPicker onChoose={(r: ManualSkipReason) => void} onCancel={() => void} />`
  - Every Question shows a button labelled **`Skip question`** (replacing `Abandon`) that opens
    the picker. The picker title is `Why are you skipping this question?`.
  - `QuestionProps` no longer has `onAbandon`.

- [ ] **Step 1: Write the failing cross-component test**

```tsx
// src/assessment-questions/__tests__/oneTerminalCallback.test.tsx
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import * as Q from '../index';
import * as F from '../testFixtures';

const CASES: Array<[string, React.ComponentType<any>, unknown, Record<string, unknown>]> = [
  ['LetterSounds', Q.LetterSoundsQuestion, F.FIXTURE_LETTER_SOUNDS_EN, { durationSec: 60 }],
  ['ListenAndAnswerStory', Q.ListenAndAnswerStoryQuestion, F.FIXTURE_LISTEN_AND_ANSWER_STORY_EN, {}],
  ['FirstSound', Q.ListenFirstSoundQuestion, F.FIXTURE_FIRST_SOUND_EN, {}],
  ['PhonemeBlend', Q.ListenPhonemeBlendQuestion, F.FIXTURE_PHONEME_BLEND_EN, {}],
  ['LetterWriting', Q.LetterWritingFromPicturesQuestion, F.FIXTURE_LETTER_WRITING_EN, {}],
  ['ReadWords', Q.ReadWordsQuestion, F.FIXTURE_READ_WORDS_EN, {}],
  ['ReadSentences', Q.ReadSentencesQuestion, F.FIXTURE_READ_SENTENCES_EN, {}],
  ['ReadPassage', Q.ReadPassageQuestion, F.FIXTURE_READ_PASSAGE_EN, {}],
  ['WriteCvcs', Q.WriteCvcsQuestion, F.FIXTURE_WRITE_CVCS_EN, {}],
  ['WriteSentencesDictation', Q.WriteSentencesFromDictationQuestion, F.FIXTURE_WRITE_SENTENCES_DICTATION_EN, {}],
  ['StoryWriting', Q.StoryWritingRubricQuestion, F.FIXTURE_STORY_WRITING_EN, {}],
];

describe.each(CASES)('%s — one terminal callback', (_name, Component, itemSet, extra) => {
  function start(onComplete: jest.Mock) {
    const r = render(<Component language="en" itemSet={itemSet} instructions="." onComplete={onComplete} {...extra} />);
    // Q2's intro is the story itself, ending in "I've finished reading"; every other Question has Start.
    fireEvent.press(r.queryByText('Start') ?? r.getByText("I've finished reading"));
    return r;
  }

  test('skip emits exactly one onComplete, skipped reason, no items', () => {
    const onComplete = jest.fn();
    const r = start(onComplete);
    fireEvent.press(r.getByText('Skip question'));
    fireEvent.press(r.getByText('Child tired'));
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete.mock.calls[0][0].stopped_reason).toBe('skipped_tired');
    expect(onComplete.mock.calls[0][0].items).toEqual([]);
  });

  test('double-press on a skip reason still emits exactly one onComplete', () => {
    const onComplete = jest.fn();
    const r = start(onComplete);
    fireEvent.press(r.getByText('Skip question'));
    const tired = r.getByText('Child tired');
    fireEvent.press(tired);
    fireEvent.press(tired);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  test('picker never offers Prerequisite unmet', () => {
    const r = start(jest.fn());
    fireEvent.press(r.getByText('Skip question'));
    expect(r.queryByText('Prerequisite unmet')).toBeNull();
  });

  test('cancelling the picker returns to marking without any callback', () => {
    const onComplete = jest.fn();
    const r = start(onComplete);
    fireEvent.press(r.getByText('Skip question'));
    fireEvent.press(r.getByText('Cancel'));
    expect(onComplete).not.toHaveBeenCalled();
    expect(r.getByText('Skip question')).toBeTruthy();
  });
});
```

Also create `src/assessment-questions/index.ts` now, because the test imports from it. Task 11
extends it.

```ts
// src/assessment-questions/index.ts
export { LetterSoundsQuestion } from './questions/LetterSoundsQuestion';
export { ListenAndAnswerStoryQuestion } from './questions/ListenAndAnswerStoryQuestion';
export { ListenFirstSoundQuestion } from './questions/ListenFirstSoundQuestion';
export { ListenPhonemeBlendQuestion } from './questions/ListenPhonemeBlendQuestion';
export { LetterWritingFromPicturesQuestion } from './questions/LetterWritingFromPicturesQuestion';
export { ReadWordsQuestion } from './questions/ReadWordsQuestion';
export { ReadSentencesQuestion } from './questions/ReadSentencesQuestion';
export { ReadPassageQuestion } from './questions/ReadPassageQuestion';
export { WriteCvcsQuestion } from './questions/WriteCvcsQuestion';
export { WriteSentencesFromDictationQuestion } from './questions/WriteSentencesFromDictationQuestion';
export { StoryWritingRubricQuestion } from './questions/StoryWritingRubricQuestion';
export type { QuestionProps } from './types/QuestionProps';
export type { Result, ResultItem, ResultDerived, StoppedReason } from './types/Result';
export { tokens } from './theme/tokens';
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest src/assessment-questions/__tests__/oneTerminalCallback.test.tsx`
Expected: FAIL. `Skip question` is not found, because the button is still labelled `Abandon`.

- [ ] **Step 3: Create the shared skip module**

```ts
// src/assessment-questions/skip/skipReasons.ts
import type { StoppedReason } from '../types/Result';

export type ManualSkipReason = Extract<
  StoppedReason,
  'skipped_child_refused' | 'skipped_tired' | 'skipped_time' | 'skipped_age' | 'skipped_other'
>;

/** EA-selectable skip reasons. skipped_prerequisite_unmet is host-only (battery gates). */
export const MANUAL_SKIP_REASONS: ReadonlyArray<{ reason: ManualSkipReason; label: string }> = [
  { reason: 'skipped_child_refused', label: 'Child refused' },
  { reason: 'skipped_tired', label: 'Child tired' },
  { reason: 'skipped_time', label: 'Out of time' },
  { reason: 'skipped_age', label: 'Age inappropriate' },
  { reason: 'skipped_other', label: 'Other' },
];
```

```tsx
// src/assessment-questions/skip/SkipReasonPicker.tsx
import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { tokens } from '../theme/tokens';
import { MANUAL_SKIP_REASONS, type ManualSkipReason } from './skipReasons';

export function SkipReasonPicker({
  onChoose,
  onCancel,
}: {
  onChoose: (reason: ManualSkipReason) => void;
  onCancel: () => void;
}) {
  return (
    <View style={styles.root}>
      <Text style={styles.title}>Why are you skipping this question?</Text>
      {MANUAL_SKIP_REASONS.map(({ reason, label }) => (
        <Pressable key={reason} accessibilityRole="button" onPress={() => onChoose(reason)} style={styles.option}>
          <Text style={styles.optionText}>{label}</Text>
        </Pressable>
      ))}
      <Pressable accessibilityRole="button" onPress={onCancel} style={styles.cancel}>
        <Text style={styles.cancelText}>Cancel</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { padding: tokens.space.lg, gap: tokens.space.sm },
  title: { fontSize: tokens.font.heading, color: tokens.color.ink, fontWeight: '600', marginBottom: tokens.space.sm },
  option: { paddingVertical: tokens.space.md, paddingHorizontal: tokens.space.lg, borderRadius: tokens.radius.card, borderWidth: 1, borderColor: tokens.color.line, backgroundColor: tokens.color.surface },
  optionText: { fontSize: tokens.font.body, color: tokens.color.ink },
  cancel: { paddingVertical: tokens.space.md, alignItems: 'center' },
  cancelText: { fontSize: tokens.font.body, color: tokens.color.muted },
});
```

- [ ] **Step 4: Remove `onAbandon` from the contract**

```ts
// src/assessment-questions/types/QuestionProps.ts
import type { Result, ResultItem } from './Result';

export interface QuestionProps {
  language: string;
  itemSet?: unknown;
  instructions?: string;
  durationSec?: number;
  onItemMarked?: (item: ResultItem) => void;
  /** Called exactly once per presentation: on completion, timer, End, or a manual skip. */
  onComplete: (result: Result) => void;
}
```

- [ ] **Step 5: Rewire each component.** In each of the 10 components:
  - delete the local `SkipReason` type and the `SKIP_REASONS` array;
  - delete `onAbandon` from the destructured props;
  - replace `handleAbandonChosen` with a handler that only calls `finish(reason)`;
  - rename the phase `'abandon-picker'` to `'skip-picker'`;
  - render `<SkipReasonPicker>` in that phase;
  - rename the `Abandon` button to `Skip question`.

  `finish` already guards re-entry with `hasFinishedRef`, which is what makes the
  double-press test pass. In LetterSoundsQuestion, add the same `'skip-picker'` phase and a
  `Skip question` button beside `End`.

```tsx
// in each component
import { SkipReasonPicker } from '../../skip/SkipReasonPicker';
import type { ManualSkipReason } from '../../skip/skipReasons';

const handleSkipChosen = useCallback((reason: ManualSkipReason) => finish(reason), [finish]);

if (phase === 'skip-picker') {
  return <SkipReasonPicker onChoose={handleSkipChosen} onCancel={() => setPhase('active')} />;
}

// in the active-phase nav, replacing the Abandon button:
<Pressable accessibilityRole="button" onPress={() => setPhase('skip-picker')}>
  <Text>Skip question</Text>
</Pressable>
```

- [ ] **Step 6: Update existing tests.** Replace `getByText('Abandon')` with
  `getByText('Skip question')`. Delete assertions on `onAbandon`. In the contract tests, the
  "Abandon path" cases become "Skip path" cases with the same expectations.

- [ ] **Step 7: Run the package suite and types.** Expected: everything passes, including
  `oneTerminalCallback.test.tsx` (44 tests: 11 components × 4).

- [ ] **Step 8: Commit**

```bash
git add src/assessment-questions
git commit -m "feat(wela): one terminal callback per Question; shared skip picker without prerequisite option"
```

---

### Task 4: Progress primitives (applyProgress, LastAttemptedSheet, validator rule)

**Files:**
- Create: `src/assessment-questions/progress/applyProgress.ts`
- Create: `src/assessment-questions/progress/LastAttemptedSheet.tsx`
- Create: `src/assessment-questions/progress/__tests__/applyProgress.test.ts`
- Create: `src/assessment-questions/progress/__tests__/LastAttemptedSheet.test.tsx`
- Modify: `src/assessment-questions/contractTest/validateResult.ts`
- Modify: `src/assessment-questions/__tests__/validateResult.test.ts`
- Modify: `src/assessment-questions/types/Result.ts` (add `tracks_progress?: boolean` to
  `ResultDerived`)

**Interfaces:**
- Produces:
  - `NO_ATTEMPT = -1`
  - `applyProgress<T extends { position: number; is_correct: boolean; metadata?: Record<string, unknown> }>(items: T[], lastAttempted: number): { items: T[]; totalAttempted: number }`.
    Items with `position > lastAttempted` get `is_correct: false` and
    `metadata: { ...metadata, reached: false }`. `totalAttempted = max(0, lastAttempted + 1)`.
  - `<LastAttemptedSheet labels={string[]} rowLengths?={number[]} defaultIndex={number} onConfirm={(index: number) => void} onCancel?={() => void} />`.
    It renders the title `Last item attempted`, one button per label with accessibility label
    `"<label>, item <n>"` (n is one-based), buttons `Reached the end` and `Nothing attempted`,
    and `Confirm`. Without `onCancel` there is no Cancel; a timer expiry cannot be cancelled.
  - Validator rule: when `derived.tracks_progress === true`, `last_attempted_position` must
    be an integer with `-1 <= p < max(items.length, 1)` (skips have empty items).

- [ ] **Step 1: Write failing tests**

```ts
// src/assessment-questions/progress/__tests__/applyProgress.test.ts
import { applyProgress, NO_ATTEMPT } from '../applyProgress';

const items = (correct: boolean[]) =>
  correct.map((c, i) => ({ position: i, is_correct: c, metadata: { k: i } }));

describe('applyProgress', () => {
  test('nothing attempted: every item not reached, total 0', () => {
    const r = applyProgress(items([true, true, false]), NO_ATTEMPT);
    expect(r.totalAttempted).toBe(0);
    expect(r.items.every((i) => i.is_correct === false && i.metadata?.reached === false)).toBe(true);
  });
  test('first item only', () => {
    const r = applyProgress(items([true, true, false]), 0);
    expect(r.totalAttempted).toBe(1);
    expect(r.items.map((i) => i.is_correct)).toEqual([true, false, false]);
    expect(r.items[0].metadata).toEqual({ k: 0 });
    expect(r.items[1].metadata).toEqual({ k: 1, reached: false });
  });
  test('row boundary (last item of a 12-wide first row)', () => {
    const r = applyProgress(items(Array(24).fill(true)), 11);
    expect(r.totalAttempted).toBe(12);
    expect(r.items.filter((i) => i.is_correct)).toHaveLength(12);
  });
  test('final item: nothing marked not-reached', () => {
    const r = applyProgress(items([true, false, true]), 2);
    expect(r.totalAttempted).toBe(3);
    expect(r.items.some((i) => i.metadata?.reached === false)).toBe(false);
  });
});
```

```tsx
// src/assessment-questions/progress/__tests__/LastAttemptedSheet.test.tsx
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { LastAttemptedSheet } from '../LastAttemptedSheet';

const labels = ['a', 'n', 'i', 't'];

test('pick an item then Confirm reports its index', () => {
  const onConfirm = jest.fn();
  const r = render(<LastAttemptedSheet labels={labels} defaultIndex={0} onConfirm={onConfirm} />);
  fireEvent.press(r.getByLabelText('i, item 3'));
  fireEvent.press(r.getByText('Confirm'));
  expect(onConfirm).toHaveBeenCalledWith(2);
});
test('Reached the end reports the last index', () => {
  const onConfirm = jest.fn();
  const r = render(<LastAttemptedSheet labels={labels} defaultIndex={0} onConfirm={onConfirm} />);
  fireEvent.press(r.getByText('Reached the end'));
  expect(onConfirm).toHaveBeenCalledWith(3);
});
test('Nothing attempted reports -1', () => {
  const onConfirm = jest.fn();
  const r = render(<LastAttemptedSheet labels={labels} defaultIndex={0} onConfirm={onConfirm} />);
  fireEvent.press(r.getByText('Nothing attempted'));
  expect(onConfirm).toHaveBeenCalledWith(-1);
});
test('Cancel appears only when onCancel is given', () => {
  const onCancel = jest.fn();
  const withCancel = render(<LastAttemptedSheet labels={labels} defaultIndex={0} onConfirm={jest.fn()} onCancel={onCancel} />);
  fireEvent.press(withCancel.getByText('Cancel'));
  expect(onCancel).toHaveBeenCalledTimes(1);
  const noCancel = render(<LastAttemptedSheet labels={labels} defaultIndex={0} onConfirm={jest.fn()} />);
  expect(noCancel.queryByText('Cancel')).toBeNull();
});
```

Add to `src/assessment-questions/__tests__/validateResult.test.ts`:

```ts
describe('tracks_progress rule', () => {
  const base = {
    question_code: 'x', question_version: '1', item_set_id: 'x@1.en', language: 'en',
    duration_ms: 1, stopped_reason: 'ea_ended' as const,
    items: [{ position: 0, item_key: 'a', prompt: 'a', is_correct: true }],
  };
  test('null position with tracks_progress is invalid', () => {
    const v = validateResult({ ...base, derived: { total_correct: 1, total_attempted: 1, percent: 100, last_attempted_position: null, tracks_progress: true } });
    expect(v.valid).toBe(false);
  });
  test('-1 with tracks_progress is valid', () => {
    const v = validateResult({ ...base, derived: { total_correct: 0, total_attempted: 0, percent: 0, last_attempted_position: -1, tracks_progress: true } });
    expect(v.valid).toBe(true);
  });
  test('position beyond items is invalid', () => {
    const v = validateResult({ ...base, derived: { total_correct: 1, total_attempted: 6, percent: 17, last_attempted_position: 5, tracks_progress: true } });
    expect(v.valid).toBe(false);
  });
});
```

If `validateResult`'s export name or signature differs, use the signature already used
elsewhere in `validateResult.test.ts`.

- [ ] **Step 2: Run them and confirm they fail**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest src/assessment-questions/progress src/assessment-questions/__tests__/validateResult.test.ts`
Expected: FAIL. The modules do not exist yet, and the rule is not implemented.

- [ ] **Step 3: Implement**

```ts
// src/assessment-questions/progress/applyProgress.ts
export const NO_ATTEMPT = -1;

export function applyProgress<
  T extends { position: number; is_correct: boolean; metadata?: Record<string, unknown> },
>(items: T[], lastAttempted: number): { items: T[]; totalAttempted: number } {
  const out = items.map((it) =>
    it.position > lastAttempted
      ? { ...it, is_correct: false, metadata: { ...(it.metadata ?? {}), reached: false } }
      : it,
  );
  return { items: out, totalAttempted: Math.max(0, lastAttempted + 1) };
}
```

```tsx
// src/assessment-questions/progress/LastAttemptedSheet.tsx
import React, { useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { tokens } from '../theme/tokens';
import { NO_ATTEMPT } from './applyProgress';

export function LastAttemptedSheet({
  labels,
  rowLengths,
  defaultIndex,
  onConfirm,
  onCancel,
}: {
  labels: string[];
  rowLengths?: number[];
  defaultIndex: number;
  onConfirm: (index: number) => void;
  onCancel?: () => void;
}) {
  const [selected, setSelected] = useState(defaultIndex);
  const rows: number[][] = [];
  let cursor = 0;
  for (const len of rowLengths ?? [labels.length]) {
    rows.push(Array.from({ length: len }, (_, i) => cursor + i).filter((i) => i < labels.length));
    cursor += len;
  }
  if (cursor < labels.length) rows.push(Array.from({ length: labels.length - cursor }, (_, i) => cursor + i));

  return (
    <View style={styles.root}>
      <Text style={styles.title}>Last item attempted</Text>
      <Text style={styles.subtitle}>Tap the last item the child attempted.</Text>
      <ScrollView contentContainerStyle={styles.rows}>
        {rows.map((row, r) => (
          <View key={r} style={styles.row}>
            {row.map((i) => (
              <Pressable
                key={i}
                accessibilityRole="button"
                accessibilityLabel={`${labels[i]}, item ${i + 1}`}
                accessibilityState={{ selected: i === selected }}
                onPress={() => setSelected(i)}
                style={[styles.cell, i === selected && styles.cellSelected]}
              >
                <Text style={[styles.cellText, i === selected && styles.cellTextSelected]}>{labels[i]}</Text>
              </Pressable>
            ))}
          </View>
        ))}
      </ScrollView>
      <View style={styles.actions}>
        <Pressable accessibilityRole="button" onPress={() => onConfirm(labels.length - 1)}><Text style={styles.link}>Reached the end</Text></Pressable>
        <Pressable accessibilityRole="button" onPress={() => onConfirm(NO_ATTEMPT)}><Text style={styles.link}>Nothing attempted</Text></Pressable>
        {onCancel ? (
          <Pressable accessibilityRole="button" onPress={onCancel}><Text style={styles.link}>Cancel</Text></Pressable>
        ) : null}
        <Pressable accessibilityRole="button" onPress={() => onConfirm(selected)} style={styles.confirm}>
          <Text style={styles.confirmText}>Confirm</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: tokens.space.lg, backgroundColor: tokens.color.surface },
  title: { fontSize: tokens.font.heading, fontWeight: '600', color: tokens.color.ink },
  subtitle: { fontSize: tokens.font.body, color: tokens.color.muted, marginBottom: tokens.space.md },
  rows: { gap: tokens.space.sm },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: tokens.space.xs },
  cell: { minWidth: 44, minHeight: 44, paddingHorizontal: tokens.space.sm, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: tokens.color.line, borderRadius: tokens.radius.cell },
  cellSelected: { backgroundColor: tokens.color.primary, borderColor: tokens.color.primary },
  cellText: { fontSize: tokens.font.body, color: tokens.color.ink },
  cellTextSelected: { color: tokens.color.onPrimary, fontWeight: '600' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: tokens.space.lg, paddingTop: tokens.space.md },
  link: { fontSize: tokens.font.body, color: tokens.color.primary },
  confirm: { marginLeft: 'auto', backgroundColor: tokens.color.primary, paddingHorizontal: tokens.space.xl, paddingVertical: tokens.space.md, borderRadius: tokens.radius.card },
  confirmText: { color: tokens.color.onPrimary, fontWeight: '600', fontSize: tokens.font.body },
});
```

In `types/Result.ts`, add `tracks_progress?: boolean;` to `ResultDerived`. In
`contractTest/validateResult.ts`, after the existing `was_timed` rule, add:

```ts
if (derivedObj?.tracks_progress === true) {
  const p = derivedObj.last_attempted_position;
  const itemCount = Array.isArray(result.items) ? result.items.length : 0;
  if (typeof p !== 'number' || !Number.isInteger(p) || p < -1 || p >= Math.max(itemCount, 1)) {
    errors.push('last_attempted_position: tracks_progress requires an integer in [-1, items.length)');
  }
}
```

Use the variable names already used in that function for the result and derived objects.

- [ ] **Step 4: Run the tests.** Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/assessment-questions
git commit -m "feat(wela): progress primitives — applyProgress, LastAttemptedSheet, tracks_progress validator rule"
```

---

### Task 5: Q1 Letter Sounds — card rows and the marker

**Files:**
- Modify: `src/assessment-questions/questions/LetterSoundsQuestion/types.ts`
- Modify: `src/assessment-questions/questions/LetterSoundsQuestion/index.tsx`
- Modify: `src/assessment-questions/testFixtures/letterSounds.ts`
- Modify: `src/assessment-questions/itemsets/wela_plus_letter_sounds.{en,xh}.ts` (shape only;
  content arrives in Task 12)
- Test: `questions/LetterSoundsQuestion/__tests__/LetterSoundsQuestion.test.tsx`

**Interfaces:**
- Consumes: `applyProgress`, `NO_ATTEMPT`, `LastAttemptedSheet` (Task 4); `SkipReasonPicker`
  (Task 3); `tokens` (Task 1).
- Produces: `LetterSoundsItemSet = { letters: string[]; columns: number }`. `lettersPerPage`
  is removed. Rows are `columns` wide (12 for WelaPLUS); there is no pagination. The result
  has `derived.tracks_progress = true`.

- [ ] **Step 1: Write the failing tests** (replace the pagination tests)

```tsx
import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import { LetterSoundsQuestion } from '..';

const SET = {
  item_set_id: 'wela_plus_letter_sounds@fixture.en', question_code: 'wela_plus_letter_sounds',
  question_version: 'fixture', language: 'en', columns: 4,
  letters: ['a', 'n', 'i', 't', 'm', 's', 'p', 'e'],
};

function startQ(onComplete = jest.fn(), durationSec?: number) {
  const r = render(<LetterSoundsQuestion language="en" itemSet={SET} instructions="." durationSec={durationSec} onComplete={onComplete} />);
  fireEvent.press(r.getByText('Start'));
  return { r, onComplete };
}

test('renders every letter at once in rows of `columns`, no Next/Prev', () => {
  const { r } = startQ();
  for (const l of SET.letters) expect(r.getAllByText(l).length).toBeGreaterThan(0);
  expect(r.queryByText('Next')).toBeNull();
  expect(r.getAllByTestId(/^letter-row-/)).toHaveLength(2);
});

test('End opens the marker; picking item 5 scores positions 0..4 only', () => {
  const { r, onComplete } = startQ();
  fireEvent.press(r.getByLabelText('a, idle'));
  fireEvent.press(r.getByLabelText('p, idle')); // position 6, beyond the marker
  fireEvent.press(r.getByText('End'));
  fireEvent.press(r.getByLabelText('m, item 5'));
  fireEvent.press(r.getByText('Confirm'));
  const res = onComplete.mock.calls[0][0];
  expect(res.stopped_reason).toBe('ea_ended');
  expect(res.derived.last_attempted_position).toBe(4);
  expect(res.derived.total_attempted).toBe(5);
  expect(res.derived.total_correct).toBe(1);
  expect(res.derived.tracks_progress).toBe(true);
  expect(res.items[6]).toMatchObject({ is_correct: false, metadata: { reached: false } });
});

test('cancel on the End marker returns to marking with marks intact', () => {
  const { r, onComplete } = startQ();
  fireEvent.press(r.getByLabelText('a, idle'));
  fireEvent.press(r.getByText('End'));
  fireEvent.press(r.getByText('Cancel'));
  expect(onComplete).not.toHaveBeenCalled();
  expect(r.getByLabelText('a, correct')).toBeTruthy();
});

test('timer opens a non-cancellable marker; taps underneath are ignored; one onComplete', () => {
  jest.useFakeTimers();
  const { r, onComplete } = startQ(jest.fn(), 1);
  act(() => { jest.advanceTimersByTime(1300); });
  expect(r.queryByText('Cancel')).toBeNull();
  expect(r.queryByLabelText('a, idle')).toBeNull(); // the marking grid is no longer interactive
  fireEvent.press(r.getByText('Reached the end'));
  expect(onComplete).toHaveBeenCalledTimes(1);
  expect(onComplete.mock.calls[0][0].stopped_reason).toBe('timer');
  expect(onComplete.mock.calls[0][0].derived.last_attempted_position).toBe(7);
  jest.useRealTimers();
});

test('Nothing attempted gives -1 and zero attempted', () => {
  const { r, onComplete } = startQ();
  fireEvent.press(r.getByText('End'));
  fireEvent.press(r.getByText('Nothing attempted'));
  const d = onComplete.mock.calls[0][0].derived;
  expect(d.last_attempted_position).toBe(-1);
  expect(d.total_attempted).toBe(0);
  expect(d.percent).toBe(0);
});
```

Update `testFixtures/letterSounds.ts`: drop `lettersPerPage` and set `columns: 12`.

- [ ] **Step 2: Run and confirm failure**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest src/assessment-questions/questions/LetterSoundsQuestion`
Expected: FAIL. `Next` still renders, and there is no `letter-row-*` testID.

- [ ] **Step 3: Implement.**
  - `types.ts`: `export interface LetterSoundsItemSet { letters: string[]; columns: number; }`
  - `isFullItemSet`: drop the `lettersPerPage` check.
  - Phases: `'intro' | 'active' | 'mark-last' | 'skip-picker' | 'finished'`, plus a
    `markReason` state of `'ea_ended' | 'timer'`.
  - Remove `currentPage`, `highestPageVisitedRef`, and Prev/Next.
  - Render rows: `chunk(letters, columns)`. Each row is a
    `<View testID={`letter-row-${r}`} style={styles.row}>`, and each tile sets
    `flexBasis: `${100 / columns}%``.
  - **End** → `setMarkReason('ea_ended'); setPhase('mark-last')`. **Timer expiry** →
    `setMarkReason('timer'); setPhase('mark-last')` and clear the interval. Rendering
    `mark-last` replaces the grid, so taps underneath are impossible.
  - `mark-last` renders
    `<LastAttemptedSheet labels={letters} rowLengths={rowsOf(columns)} defaultIndex={highestMarkedIndex()} onConfirm={(i) => finish(markReason, i)} onCancel={markReason === 'ea_ended' ? () => setPhase('active') : undefined} />`.
    Here `highestMarkedIndex()` is the highest marked position, or `0` if none.
  - `finish(stoppedReason, lastAttempted = NO_ATTEMPT)`:

```tsx
const finish = useCallback((stoppedReason: StoppedReason, lastAttempted: number = NO_ATTEMPT) => {
  if (hasFinishedRef.current) return;
  hasFinishedRef.current = true;
  setPhase('finished');
  const isSkipped = stoppedReason.startsWith('skipped_');
  const raw = isSkipped ? [] : letters.map((letter, idx) => ({
    position: idx, item_key: letter, prompt: letter,
    is_correct: isMarkedRef.current(keyFor(idx, letter)),
  }));
  const { items, totalAttempted } = isSkipped ? { items: [], totalAttempted: 0 } : applyProgress(raw, lastAttempted);
  const totalCorrect = items.filter((i) => i.is_correct).length;
  onComplete({
    question_code: 'wela_plus_letter_sounds',
    question_version: effectiveItemSet.question_version,
    item_set_id: effectiveItemSet.item_set_id,
    language,
    duration_ms: startTimeMsRef.current === null ? 0 : Date.now() - startTimeMsRef.current,
    stopped_reason: stoppedReason,
    items,
    derived: {
      total_correct: totalCorrect,
      total_attempted: totalAttempted,
      percent: totalAttempted > 0 ? Math.round((totalCorrect / totalAttempted) * 100) : 0,
      last_attempted_position: isSkipped ? null : lastAttempted,
      was_timed: durationSec !== undefined,
      tracks_progress: !isSkipped,
    },
  });
}, [effectiveItemSet, language, letters, durationSec, onComplete]);
```

  - Fixed marking font: `fontSize: tokens.font.markingItem`. Remove the
    `useChildReadingFontSize` import from this component (D1).

- [ ] **Step 4: Run the Q1 tests and the Q1 contract test.** Expected: PASS. Update the contract
  test's End path to confirm the marker with `Reached the end`.

- [ ] **Step 5: Commit**

```bash
git add src/assessment-questions
git commit -m "feat(wela): Q1 mirrors the 5x12 card and records the last attempted letter"
```

---

### Task 6: Q6 Read Words — card rows and the marker

**Files:**
- Modify: `questions/ReadWordsQuestion/types.ts`, `questions/ReadWordsQuestion/index.tsx`
- Modify: `testFixtures/readWords.ts`
- Test: `questions/ReadWordsQuestion/__tests__/ReadWordsQuestion.test.tsx` and its contract test

**Interfaces:**
- Consumes: Task 4 primitives.
- Produces: `ReadWordsItemSet = { words: ReadWordsPrompt[]; row_lengths?: number[] }`. Rows
  follow `row_lengths` when present; otherwise the words wrap. Untimed when `durationSec` is
  omitted (unchanged). End → marker (cancellable); timer (if timed) → marker
  (non-cancellable). `derived.tracks_progress = true`.

- [ ] **Step 1: Write failing tests** (replace the tap-tracking `last_attempted` tests)

```tsx
const SET = {
  item_set_id: 'wela_plus_read_words@fixture.en', question_code: 'wela_plus_read_words',
  question_version: 'fixture', language: 'en', row_lengths: [3, 3],
  words: ['there', 'how', 'there', 'how', 'come', 'with'].map((w) => ({ item_key: w, word: w })),
};

test('renders rows from row_lengths', () => {
  const r = render(<ReadWordsQuestion language="en" itemSet={SET} instructions="." onComplete={jest.fn()} />);
  fireEvent.press(r.getByText('Start'));
  expect(r.getAllByTestId(/^word-row-/)).toHaveLength(2);
});

test('duplicate words are marked independently', () => {
  const onComplete = jest.fn();
  const r = render(<ReadWordsQuestion language="en" itemSet={SET} instructions="." onComplete={onComplete} />);
  fireEvent.press(r.getByText('Start'));
  fireEvent.press(r.getAllByLabelText('there, idle')[1]); // the second "there", position 2
  expect(r.getAllByLabelText('there, idle')).toHaveLength(1);
  fireEvent.press(r.getByText('End'));
  fireEvent.press(r.getByText('Reached the end'));
  const items = onComplete.mock.calls[0][0].items;
  expect(items[0].is_correct).toBe(false);
  expect(items[2].is_correct).toBe(true);
});

test('wrong answers after the last correct still count as attempted (marker, not taps)', () => {
  const onComplete = jest.fn();
  const r = render(<ReadWordsQuestion language="en" itemSet={SET} instructions="." onComplete={onComplete} />);
  fireEvent.press(r.getByText('Start'));
  fireEvent.press(r.getAllByLabelText('there, idle')[0]); // correct at 0
  fireEvent.press(r.getByText('End'));
  fireEvent.press(r.getByLabelText('come, item 5'));     // the child stopped after 5 words
  fireEvent.press(r.getByText('Confirm'));
  const d = onComplete.mock.calls[0][0].derived;
  expect(d.total_attempted).toBe(5);
  expect(d.total_correct).toBe(1);
  expect(d.percent).toBe(20);
});
```

- [ ] **Step 2: Run and confirm failure.** Expected: FAIL. There is no `word-row-*` testID,
  and End finishes immediately.

- [ ] **Step 3: Implement.** Mirror Task 5:
  - add `row_lengths?: number[]` to `ReadWordsItemSet` and the `isFullItemSet` check
    (`row_lengths === undefined || array of positive integers summing to words.length`);
  - render `chunk` by `row_lengths`, with `<View testID={`word-row-${r}`}>`;
  - add the `'mark-last'` phase and `markReason`;
  - delete `lastAttemptedPositionRef` and its tap-tracking in `handleToggle`;
  - `finish(stoppedReason, lastAttempted)` uses `applyProgress` exactly as in Task 5 Step 3,
    with `question_code: 'wela_plus_read_words'`, `prompt: w.word`, and
    `item_key: w.item_key`;
  - remove `useChildReadingFontSize` and use `tokens.font.markingItem`;
  - keep `markingPolarity`. With `'tap_wrong'`, `is_correct = !tapped` is computed before
    `applyProgress`, which then forces not-reached items to false.

- [ ] **Step 4: Run the Q6 tests and the contract test.** Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/assessment-questions
git commit -m "feat(wela): Q6 mirrors the card rows; last attempted word comes from the marker"
```

---

### Task 7: Q8 Read Passage untimed and paragraphed; Q7 Finish rule

**Files:**
- Modify: `questions/ReadPassageQuestion/types.ts`, `questions/ReadPassageQuestion/index.tsx`
- Modify: `questions/ReadSentencesQuestion/index.tsx`
- Modify: `testFixtures/readPassage.ts`
- Tests: the Q8 and Q7 test and contract files

**Interfaces:**
- Produces:
  - `ReadPassageItemSet = { words: ReadPassageWord[]; paragraph_starts?: number[] }`.
    `paragraph_starts` lists word indices that begin a paragraph, starting at `0`.
  - Q8 is **untimed when `durationSec` is omitted**. `DEFAULT_DURATION_SEC` is deleted.
    `correct_words_per_minute` is present only when timed. End → marker; timer → marker.
  - Q7: **Finish** (completed) sets `last_attempted_position = totalWords - 1` and
    `tracks_progress = true`. A skip gives `null` and no items.

- [ ] **Step 1: Write failing tests**

```tsx
// ReadPassage
test('untimed by default: no timer fires and no correct_words_per_minute', () => {
  jest.useFakeTimers();
  const onComplete = jest.fn();
  const r = render(<ReadPassageQuestion language="en" itemSet={FIXTURE_READ_PASSAGE_EN} instructions="." onComplete={onComplete} />);
  fireEvent.press(r.getByText('Start'));
  act(() => { jest.advanceTimersByTime(120000); });
  expect(onComplete).not.toHaveBeenCalled();
  fireEvent.press(r.getByText('End'));
  fireEvent.press(r.getByText('Reached the end'));
  const d = onComplete.mock.calls[0][0].derived;
  expect(d.was_timed).toBe(false);
  expect(d.correct_words_per_minute).toBeUndefined();
  jest.useRealTimers();
});

test('paragraph_starts splits the passage into paragraphs', () => {
  const set = { ...FIXTURE_READ_PASSAGE_EN, paragraph_starts: [0, 3] };
  const r = render(<ReadPassageQuestion language="en" itemSet={set} instructions="." onComplete={jest.fn()} />);
  fireEvent.press(r.getByText('Start'));
  expect(r.getAllByTestId(/^paragraph-/)).toHaveLength(2);
});

// ReadSentences
test('Finish reports every word attempted', () => {
  const onComplete = jest.fn();
  const r = render(<ReadSentencesQuestion language="en" itemSet={FIXTURE_READ_SENTENCES_EN} instructions="." onComplete={onComplete} />);
  fireEvent.press(r.getByText('Start'));
  fireEvent.press(r.getByText('Finish'));
  const confirm = r.queryByText('Yes, finish');
  if (confirm) fireEvent.press(confirm);
  const res = onComplete.mock.calls[0][0];
  expect(res.derived.tracks_progress).toBe(true);
  expect(res.derived.last_attempted_position).toBe(res.items.length - 1);
  expect(res.derived.total_attempted).toBe(res.items.length);
});
```

- [ ] **Step 2: Run and confirm failure.** Expected: FAIL. The 60 s default timer fires,
  `paragraph-*` does not exist, and Q7 lacks `tracks_progress`.

- [ ] **Step 3: Implement Q8.**
  - Delete `DEFAULT_DURATION_SEC` and `effectiveDurationSec`; use `durationSec` directly.
  - Add `paragraph_starts` to the type and validation (`undefined`, or a strictly increasing
    integer array starting at 0, every value `< words.length`).
  - Render paragraphs with `<View testID={`paragraph-${p}`} style={styles.paragraph}>`.
  - Add the marker flow exactly as in Task 6.
  - In `derived`, spread `correct_words_per_minute` only when
    `durationSec !== undefined && !isSkipped`:
    `...(wasTimed && !isSkipped ? { correct_words_per_minute: wpm } : {})`.
  - Use `tokens.font.markingItem` and remove `useChildReadingFontSize`.

- [ ] **Step 4: Implement Q7.** In `finish`, for a non-skipped stop, set
  `last_attempted_position: items.length - 1`, `total_attempted: items.length`, and
  `tracks_progress: true`. For a skip, set `last_attempted_position: null`. Keep
  `per_sentence_percent`. Use `tokens.font.markingItem` and remove `useChildReadingFontSize`.

- [ ] **Step 5: Run the Q7 and Q8 tests and contract tests.** Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/assessment-questions
git commit -m "feat(wela): Q8 untimed by default with paragraphs; Q7 Finish records full progress"
```

---

### Task 8: Q9 CVC writing — per-letter marking

**Files:**
- Modify: `questions/WriteCvcsQuestion/types.ts`, `questions/WriteCvcsQuestion/index.tsx`
- Modify: `testFixtures/writeCvcs.ts`
- Tests: the Q9 test and contract files

**Interfaces:**
- Produces:
  - `WriteCvcsWord = { item_key: string; word: string; letters: string[] }`, where `letters`
    are the **scoring units** and may exclude a prefix (spec 4.2).
  - `WriteCvcsItemSet = { words: WriteCvcsWord[] }`.
  - Items are one per scoring letter, in order:
    `position` = flat index,
    `item_key` = `${word.item_key}.l${letterIndex + 1}`,
    `prompt` = the letter,
    `metadata` = `{ word: word.word, word_index, letter_index }`.
  - `derived.per_word` = `[{ word, correct, total }]`; `last_attempted_position: null`;
    `was_timed: false`.

- [ ] **Step 1: Write failing tests**

```tsx
const SET = {
  item_set_id: 'wela_plus_write_cvcs@fixture.xh', question_code: 'wela_plus_write_cvcs',
  question_version: 'fixture', language: 'xh',
  words: [
    { item_key: 'w1', word: 'lala', letters: ['l', 'a', 'l', 'a'] },
    { item_key: 'w3', word: 'imali', letters: ['m', 'a', 'l', 'i'] },
  ],
};

test('one item per scoring letter, prefix excluded, per-word totals', () => {
  const onComplete = jest.fn();
  const r = render(<WriteCvcsQuestion language="xh" itemSet={SET} instructions="." onComplete={onComplete} />);
  fireEvent.press(r.getByText('Start'));
  expect(r.getByText('1. lala')).toBeTruthy();
  fireEvent.press(r.getByLabelText('lala letter 1 l, idle'));
  fireEvent.press(r.getByLabelText('imali letter 4 i, idle'));
  fireEvent.press(r.getByText('Finish'));
  const confirm = r.queryByText('Yes, finish');
  if (confirm) fireEvent.press(confirm);
  const res = onComplete.mock.calls[0][0];
  expect(res.items).toHaveLength(8);
  expect(res.items[7]).toMatchObject({ position: 7, item_key: 'w3.l4', prompt: 'i', is_correct: true, metadata: { word: 'imali', word_index: 1, letter_index: 3 } });
  expect(res.derived.total_correct).toBe(2);
  expect(res.derived.total_attempted).toBe(8);
  expect(res.derived.per_word).toEqual([{ word: 'lala', correct: 1, total: 4 }, { word: 'imali', correct: 1, total: 4 }]);
});
```

- [ ] **Step 2: Run and confirm failure.** Expected: FAIL. The old shape is `prompts` with one
  item per word.

- [ ] **Step 3: Implement.**
  - Replace the types; `isFullItemSet` checks `words[]` with string `item_key` and `word` and
    a non-empty string array `letters`.
  - Render each word as a row: a label `${wordIndex + 1}. ${word.word}` followed by
    letter cells.
  - Each cell is a `Pressable` with `accessibilityLabel` of
    `"<word> letter <n> <letter>, <idle|correct>"`, toggled through `useToggleMark` with the
    key `${word.item_key}.l${n}`.
  - Build the items as specified in Interfaces. `total_attempted` = total letters (Q9 is
    dictated to completion; the confirm-unmarked flow is unchanged).
  - Use `tokens` for all styling.

- [ ] **Step 4: Run the Q9 tests and contract test.** Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/assessment-questions
git commit -m "feat(wela): Q9 marks each scoring letter; scoring units come from content"
```

---

### Task 9: Q10 dictation — per-word marking grouped by sentence

**Files:**
- Modify: `questions/WriteSentencesFromDictationQuestion/types.ts` and `index.tsx`
- Modify: `testFixtures/writeSentencesDictation.ts`
- Tests: the Q10 test and contract files

**Interfaces:**
- Produces:
  - `WriteSentencesFromDictationItemSet = { sentences: { item_key: string; words: { item_key: string; word: string }[] }[] }`.
  - Items are one per word:
    `position` = flat index,
    `item_key` = `${sentence.item_key}.w${n}`,
    `prompt` = the word,
    `metadata` = `{ sentence_index, word_index }`.
  - `derived.per_sentence` = `[{ correct, total }]`; `last_attempted_position: null`.

- [ ] **Step 1: Write the failing test**

```tsx
const SET = {
  item_set_id: 'wela_plus_write_sentences_dictation@fixture.en', question_code: 'wela_plus_write_sentences_dictation',
  question_version: 'fixture', language: 'en',
  sentences: [
    { item_key: 's1', words: ['It', 'drinks', 'milk'].map((w, i) => ({ item_key: `s1.w${i + 1}`, word: w })) },
    { item_key: 's2', words: ['Mom', 'got'].map((w, i) => ({ item_key: `s2.w${i + 1}`, word: w })) },
  ],
};

test('one item per word; per_sentence totals; max is word count', () => {
  const onComplete = jest.fn();
  const r = render(<WriteSentencesFromDictationQuestion language="en" itemSet={SET} instructions="." onComplete={onComplete} />);
  fireEvent.press(r.getByText('Start'));
  fireEvent.press(r.getByLabelText('drinks, idle'));
  fireEvent.press(r.getByLabelText('Mom, idle'));
  fireEvent.press(r.getByText('Finish'));
  const confirm = r.queryByText('Yes, finish');
  if (confirm) fireEvent.press(confirm);
  const res = onComplete.mock.calls[0][0];
  expect(res.items).toHaveLength(5);
  expect(res.items[1]).toMatchObject({ item_key: 's1.w2', prompt: 'drinks', is_correct: true, metadata: { sentence_index: 0, word_index: 1 } });
  expect(res.derived.total_attempted).toBe(5);
  expect(res.derived.per_sentence).toEqual([{ correct: 1, total: 3 }, { correct: 1, total: 2 }]);
});
```

- [ ] **Step 2: Run and confirm failure.**

- [ ] **Step 3: Implement.** Reuse ReadSentences' grouped-pill layout, copying its JSX
  structure, not importing it. Show a numbered sentence label above each group (`1.`, `2.`).
  Use `useToggleMark` keyed by the word `item_key`, and `tokens` for styling.

- [ ] **Step 4: Run the tests.** Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/assessment-questions
git commit -m "feat(wela): Q10 marks each dictated word, grouped by sentence"
```

---

### Task 10: Q11 — optional picture, optional anchors

**Files:**
- Modify: `questions/StoryWritingRubricQuestion/types.ts` and `index.tsx`
- Tests: the Q11 test file

**Interfaces:**
- Produces:
  - `StoryWritingRubricItemSet = { picture?: StoryWritingRubricPicture; dimensions: StoryWritingRubricDimension[] }`.
  - A dimension's `anchors` may be `[]` and `end_anchor_gloss` may be `''`.
  - Chips are always 0–4.
  - With no picture, no thumbnail row renders.
  - With no anchors for a dimension, its "View full rubric" sheet shows
    `Rubric descriptions coming soon`, and each item's `metadata` omits `anchor_text`.

- [ ] **Step 1: Write failing tests**

```tsx
const SET = {
  item_set_id: 'wela_plus_story_writing@fixture.en', question_code: 'wela_plus_story_writing',
  question_version: 'fixture', language: 'en',
  dimensions: ['meaning_making', 'spelling', 'length', 'vocabulary'].map((code) => ({
    code, label: code, anchors: [], end_anchor_gloss: '',
  })),
};

test('no picture: no thumbnail row', () => {
  const r = render(<StoryWritingRubricQuestion language="en" itemSet={SET} instructions="." onComplete={jest.fn()} />);
  fireEvent.press(r.getByText('Start'));
  expect(r.queryByTestId('picture-thumbnail')).toBeNull();
});

test('no anchors: sheet says coming soon; metadata omits anchor_text; chips still score', () => {
  const onComplete = jest.fn();
  const r = render(<StoryWritingRubricQuestion language="en" itemSet={SET} instructions="." onComplete={onComplete} />);
  fireEvent.press(r.getByText('Start'));
  fireEvent.press(r.getAllByText('View full rubric')[0]);
  expect(r.getByText('Rubric descriptions coming soon')).toBeTruthy();
});
```

Continue the second test. Close the sheet (with the sheet's existing dismiss control), then
score through the chip testIDs the component already defines (`chip-<code>-<score>`):

```tsx
  fireEvent.press(r.getByText('Close')); // use the existing rubric-sheet dismiss label if it differs
  fireEvent.press(r.getByTestId('chip-meaning_making-2'));
  fireEvent.press(r.getByTestId('chip-spelling-1'));
  fireEvent.press(r.getByTestId('chip-length-3'));
  fireEvent.press(r.getByTestId('chip-vocabulary-0'));
  fireEvent.press(r.getByText('Finish'));
  const res = onComplete.mock.calls[0][0];
  expect(res.derived.ea_rubric_total).toBe(6);
  expect(res.items.every((i: any) => !('anchor_text' in i.metadata))).toBe(true);
  expect(res.items.map((i: any) => i.item_key)).toEqual(['ea:meaning_making', 'ea:spelling', 'ea:length', 'ea:vocabulary']);
```

- [ ] **Step 2: Run and confirm failure.**

- [ ] **Step 3: Implement.**
  - Make `picture` optional in the type and in `isFullItemSet`.
  - Render the thumbnail row only when `effectiveItemSet.picture`.
  - In the rubric sheet, when `dim.anchors.length === 0`, render
    `<Text>Rubric descriptions coming soon</Text>`.
  - When building items, add `anchor_text` only if an anchor exists:
    `...(anchor ? { anchor_text: anchor.text } : {})`.
  - Hide the gloss line when `end_anchor_gloss === ''`.
  - Use `tokens` for styling.

- [ ] **Step 4: Run the Q11 tests and contract test.** Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/assessment-questions
git commit -m "feat(wela): Q11 works without a picture or rubric anchors"
```

---

### Task 11: Battery definition and evaluator

**Files:**
- Modify: `src/assessment-questions/types/BatteryConfig.ts`
- Create: `src/assessment-questions/battery/evaluateBatteryState.ts`
- Create: `src/assessment-questions/battery/wela_plus_full.ts`
- Create: `src/assessment-questions/battery/__tests__/evaluateBatteryState.test.ts`
- Create: `src/assessment-questions/battery/__tests__/wela_plus_full.test.ts`
- Modify: `src/assessment-questions/index.ts`

**Interfaces:**
- Produces:

```ts
export type MaterialItem = 'reading_card' | 'picture_cards' | 'writing_sheet';
export interface Materials { item: MaterialItem; side?: 'A' | 'B' | 'C' }
export interface BatteryQuestion {
  question_code: string;
  question_version: string;
  durationSec?: number;
  instructions?: Record<string, string>; // keyed by language: 'en' | 'xh'
  materials: Materials | null;           // null = oral, nothing handed over
  paper_marked?: boolean;                // consumed by Release 2 photos
}
export interface PrerequisiteRule { depends_on: string; minScore: number; on_unmet_reason: 'skipped_prerequisite_unmet' }
export interface BatteryConfig {
  battery_code: string;
  battery_version: string;
  languages: string[];
  questions: BatteryQuestion[];
  prerequisites: Record<string, PrerequisiteRule>; // keyed by the gated question_code
}
export interface DecidedResult { question_code: string; stopped_reason: string; score: number | null }
export interface BatteryState {
  nextQuestion: BatteryQuestion | null;
  decided: string[];                      // question_codes with a persisted result or skip
  undecided: string[];                    // in battery order, excluding autoSkips
  autoSkips: Array<{ question_code: string; reason: 'skipped_prerequisite_unmet' }>;
  eligibleToFinalize: boolean;            // every question decided (autoSkips not yet persisted count as undecided)
}
export function evaluateBatteryState(battery: BatteryConfig, decided: DecidedResult[]): BatteryState;
export const WELA_PLUS_FULL_2024_1: BatteryConfig;
```

- [ ] **Step 1: Write failing evaluator tests**

```ts
import { evaluateBatteryState } from '../evaluateBatteryState';
import type { BatteryConfig } from '../../types/BatteryConfig';

const q = (code: string) => ({ question_code: code, question_version: '1', materials: null });
const LINEAR: BatteryConfig = { battery_code: 'b', battery_version: '1', languages: ['en'], questions: [q('q1'), q('q2'), q('q3')], prerequisites: {} };
const GATED: BatteryConfig = { ...LINEAR, prerequisites: { q3: { depends_on: 'q1', minScore: 10, on_unmet_reason: 'skipped_prerequisite_unmet' } } };

test('fresh run: next is the first question; not eligible', () => {
  const s = evaluateBatteryState(LINEAR, []);
  expect(s.nextQuestion?.question_code).toBe('q1');
  expect(s.undecided).toEqual(['q1', 'q2', 'q3']);
  expect(s.eligibleToFinalize).toBe(false);
});
test('skips count as decided', () => {
  const s = evaluateBatteryState(LINEAR, [{ question_code: 'q1', stopped_reason: 'skipped_tired', score: null }]);
  expect(s.decided).toEqual(['q1']);
  expect(s.nextQuestion?.question_code).toBe('q2');
});
test('all decided: eligible, no next', () => {
  const all = ['q1', 'q2', 'q3'].map((c) => ({ question_code: c, stopped_reason: 'completed', score: 5 }));
  const s = evaluateBatteryState(LINEAR, all);
  expect(s.nextQuestion).toBeNull();
  expect(s.eligibleToFinalize).toBe(true);
});
test('decided results not in the battery are ignored', () => {
  const s = evaluateBatteryState(LINEAR, [{ question_code: 'zz', stopped_reason: 'completed', score: 1 }]);
  expect(s.decided).toEqual([]);
});
test('gate: unmet prerequisite produces an autoSkip and next skips past it', () => {
  const s = evaluateBatteryState(GATED, [
    { question_code: 'q1', stopped_reason: 'completed', score: 4 },
    { question_code: 'q2', stopped_reason: 'completed', score: 3 },
  ]);
  expect(s.autoSkips).toEqual([{ question_code: 'q3', reason: 'skipped_prerequisite_unmet' }]);
  expect(s.nextQuestion).toBeNull();
  expect(s.eligibleToFinalize).toBe(false); // the host must persist the auto-skip first
});
test('gate: a skipped prerequisite (null score) is unmet', () => {
  const s = evaluateBatteryState(GATED, [{ question_code: 'q1', stopped_reason: 'skipped_child_refused', score: null }]);
  expect(s.autoSkips.map((a) => a.question_code)).toEqual(['q3']);
});
test('gate: met prerequisite → no autoSkip', () => {
  const s = evaluateBatteryState(GATED, [{ question_code: 'q1', stopped_reason: 'completed', score: 10 }]);
  expect(s.autoSkips).toEqual([]);
});
test('gate: undecided prerequisite → gated question stays undecided, no autoSkip', () => {
  const s = evaluateBatteryState(GATED, []);
  expect(s.autoSkips).toEqual([]);
  expect(s.undecided).toContain('q3');
});
```

```ts
// wela_plus_full.test.ts
import { WELA_PLUS_FULL_2024_1 as B } from '../wela_plus_full';

test('2024.1 battery shape', () => {
  expect(B.battery_code).toBe('wela_plus_full');
  expect(B.battery_version).toBe('2024.1');
  expect(B.languages).toEqual(['en', 'xh']);
  expect(B.prerequisites).toEqual({});
  expect(B.questions.map((q) => q.question_code)).toEqual([
    'wela_plus_letter_sounds', 'wela_plus_listen_and_answer_story', 'wela_plus_first_sound',
    'wela_plus_phoneme_blend', 'wela_plus_letter_writing', 'wela_plus_read_words',
    'wela_plus_read_sentences', 'wela_plus_read_passage', 'wela_plus_write_cvcs',
    'wela_plus_write_sentences_dictation', 'wela_plus_story_writing',
  ]);
  expect(B.questions.every((q) => q.question_version === '2024.1')).toBe(true);
  expect(B.questions.filter((q) => q.paper_marked).map((q) => q.question_code)).toEqual([
    'wela_plus_letter_writing', 'wela_plus_write_cvcs', 'wela_plus_write_sentences_dictation', 'wela_plus_story_writing',
  ]);
  expect(B.questions.filter((q) => q.durationSec !== undefined).map((q) => [q.question_code, q.durationSec])).toEqual([['wela_plus_letter_sounds', 60]]);
});

test('materials per question match the printout pack (spec 9)', () => {
  const m = Object.fromEntries(B.questions.map((q) => [q.question_code, q.materials]));
  expect(m.wela_plus_letter_sounds).toEqual({ item: 'reading_card', side: 'A' });
  expect(m.wela_plus_read_words).toEqual({ item: 'reading_card', side: 'B' });
  expect(m.wela_plus_read_sentences).toEqual({ item: 'reading_card', side: 'B' });
  expect(m.wela_plus_read_passage).toEqual({ item: 'reading_card', side: 'C' });
  expect(m.wela_plus_story_writing).toEqual({ item: 'picture_cards' });
  for (const c of ['wela_plus_letter_writing', 'wela_plus_write_cvcs', 'wela_plus_write_sentences_dictation']) {
    expect(m[c]).toEqual({ item: 'writing_sheet' });
  }
  for (const c of ['wela_plus_listen_and_answer_story', 'wela_plus_first_sound', 'wela_plus_phoneme_blend']) {
    expect(m[c]).toBeNull();
  }
});

test('every question has en and xh instructions', () => {
  for (const q of B.questions) {
    expect(typeof q.instructions?.en).toBe('string');
    expect(typeof q.instructions?.xh).toBe('string');
    expect(q.instructions!.en.length).toBeGreaterThan(20);
  }
});
```

- [ ] **Step 2: Run and confirm failure.**

- [ ] **Step 3: Implement the types (as in Interfaces) and the evaluator**

```ts
// src/assessment-questions/battery/evaluateBatteryState.ts
import type { BatteryConfig, BatteryState, DecidedResult } from '../types/BatteryConfig';

export function evaluateBatteryState(battery: BatteryConfig, decidedResults: DecidedResult[]): BatteryState {
  const order = battery.questions.map((q) => q.question_code);
  const byCode = new Map(decidedResults.filter((d) => order.includes(d.question_code)).map((d) => [d.question_code, d]));
  const decided = order.filter((c) => byCode.has(c));
  const autoSkips: BatteryState['autoSkips'] = [];
  for (const code of order) {
    if (byCode.has(code)) continue;
    const rule = battery.prerequisites[code];
    if (!rule) continue;
    const dep = byCode.get(rule.depends_on);
    if (!dep) continue; // prerequisite not decided yet: no verdict
    if (dep.score === null || dep.score < rule.minScore) {
      autoSkips.push({ question_code: code, reason: rule.on_unmet_reason });
    }
  }
  const skipped = new Set(autoSkips.map((a) => a.question_code));
  const undecided = order.filter((c) => !byCode.has(c) && !skipped.has(c));
  const nextCode = undecided[0] ?? null;
  return {
    nextQuestion: nextCode ? battery.questions.find((q) => q.question_code === nextCode)! : null,
    decided,
    undecided,
    autoSkips,
    eligibleToFinalize: decided.length === order.length,
  };
}
```

- [ ] **Step 4: Write `wela_plus_full.ts`.** EA instructions are copied verbatim from the 2024
  instruction sheet (spec 4.2), English for both languages. Only the Q3 and Q4 practice lines
  differ by language.

```ts
// src/assessment-questions/battery/wela_plus_full.ts
import type { BatteryConfig, BatteryQuestion } from '../types/BatteryConfig';

const V = '2024.1';
const MARK = 'If the child gets an item correct, tap it (it turns green). If they get it wrong, leave it blank.';
const both = (text: string) => ({ en: text, xh: text });

const Q: BatteryQuestion[] = [
  { question_code: 'wela_plus_letter_sounds', question_version: V, durationSec: 60,
    materials: { item: 'reading_card', side: 'A' },
    instructions: both(`Hand the child Reading Card side A. Point to each letter and ask for the letter SOUND, not the name ("ah", not "A"). ${MARK} STOP immediately if the child gets an entire row wrong. Otherwise STOP at 1 minute.`) },
  { question_code: 'wela_plus_listen_and_answer_story', question_version: V, materials: null,
    instructions: both('Say: "I am going to read you a short story aloud ONCE and then ask you some questions. Please listen carefully and answer the questions as best you can. Do you understand what you must do? Ready, let\'s begin." Read the story slowly, about one word per second. You may only read it once.') },
  { question_code: 'wela_plus_first_sound', question_version: V, materials: null,
    instructions: {
      en: `Practise first! Say: "Look, I am sitting. Listen carefully. Can you hear that 'sit' starts with the sound sss?" Then say each word and ask: "What sound does this word start with?" ${MARK}`,
      xh: `Zama ukuqala uziqhelanise! Thetha nomntwana uthi: "Jonga, ndiyasela. Mamela, ndiyasela. Phulaphula ngenyameko. Uyeva ukuba u 'sela' uqala ngesandi u s?" Then say each word and ask which sound it starts with. ${MARK}`,
    } },
  { question_code: 'wela_plus_phoneme_blend', question_version: V, materials: null,
    instructions: {
      en: `Practise first! Say: "Listen carefully to these sounds: /c/ /a/ /t/ … this says 'cat'! /sh/ /o/ /p/ … this says 'shop'!" Then say each word's sounds with a one-second pause between them, and never say the whole word. ${MARK}`,
      xh: `Qala ngokuziqhelanisa! Thetha nomntwana uthi: "Phulaphula ezi zandi ngenyameko: /x/ /a/ … eli gama ngu 'xa'! /Nk/ /o/ … eli gama ngu 'Nko'!" Then say each word's sounds with a one-second pause between them, and never say the whole word. ${MARK}`,
    } },
  { question_code: 'wela_plus_letter_writing', question_version: V, paper_marked: true,
    materials: { item: 'writing_sheet' },
    instructions: both('Give the child the Writing Sheet. Say: "Look at the apple … \'apple\' starts with /a/. Can you write /a/?" Work left to right. Say the letter SOUND, not the letter name. If the child does not know a letter, say: "Don\'t worry, just leave it blank. Let\'s try another letter." When the child has finished, mark each cell here from their sheet.') },
  { question_code: 'wela_plus_read_words', question_version: V,
    materials: { item: 'reading_card', side: 'B' },
    instructions: both(`Hand the child Reading Card side B. Point to each word and ask the child to read it. ${MARK} STOP immediately if the child gets 5 in a row wrong, or clearly does not know any.`) },
  { question_code: 'wela_plus_read_sentences', question_version: V,
    materials: { item: 'reading_card', side: 'B' },
    instructions: both(`Reading Card side B, sentences. Ask the child to read each sentence. Tap each word they read correctly.`) },
  { question_code: 'wela_plus_read_passage', question_version: V,
    materials: { item: 'reading_card', side: 'C' },
    instructions: both('Hand the child Reading Card side C. Ask the child to read the story. Tap each word they read correctly. When they stop, mark the last word they attempted.') },
  { question_code: 'wela_plus_write_cvcs', question_version: V, paper_marked: true,
    materials: { item: 'writing_sheet' },
    instructions: both('Writing Sheet, pictures 1–4. Say the name of each picture TWICE and ask the child to write the word. Tap each letter the child wrote correctly.') },
  { question_code: 'wela_plus_write_sentences_dictation', question_version: V, paper_marked: true,
    materials: { item: 'writing_sheet' },
    instructions: both('Writing Sheet, lines 1–2. Read the first sentence TWICE and let the child write it. Then do the same for the second sentence. Do NOT repeat a sentence while the child is writing. Tap each word the child wrote correctly.') },
  { question_code: 'wela_plus_story_writing', question_version: V, paper_marked: true,
    materials: { item: 'picture_cards' },
    instructions: both('Show the child the Picture Cards and ask: "What can you see in these pictures?" You may ask, for example, "Where are the children?" or "Why is the little girl crying?". Then say: "Can you write a story about the pictures? Don\'t worry if you can\'t spell some words, just do your best." If the child cannot write sentences, encourage a few words. When they finish say: "This is a lovely story. Can you think of anything more to write?" Then score the story here.') },
];

export const WELA_PLUS_FULL_2024_1: BatteryConfig = {
  battery_code: 'wela_plus_full',
  battery_version: V,
  languages: ['en', 'xh'],
  questions: Q,
  prerequisites: {},
};
```

- [ ] **Step 5: Export from the barrel.** Append to `src/assessment-questions/index.ts`:

```ts
export { evaluateBatteryState } from './battery/evaluateBatteryState';
export { WELA_PLUS_FULL_2024_1 } from './battery/wela_plus_full';
export type { BatteryConfig, BatteryQuestion, BatteryState, DecidedResult, Materials, MaterialItem, PrerequisiteRule } from './types/BatteryConfig';
export { MANUAL_SKIP_REASONS } from './skip/skipReasons';
export type { ManualSkipReason } from './skip/skipReasons';
```

- [ ] **Step 6: Run the battery tests, the package suite, and types.** Expected: PASS. Fix any
  existing `BatteryConfig` consumer inside the package that relied on the old optional
  `prerequisites`, or on `instructions` being a string.

- [ ] **Step 7: Commit**

```bash
git add src/assessment-questions
git commit -m "feat(wela): wela_plus_full@2024.1 battery and the battery-state evaluator"
```

---

### Task 12: 2024.1 content (EN and XH) and the integrity test

**Files:**
- Modify: all 22 `src/assessment-questions/itemsets/wela_plus_*.{en,xh}.ts`
- Create: `src/assessment-questions/itemsets/buildPassage.ts`
- Create: `src/assessment-questions/itemsets/contentStatus.ts`
- Create: `src/assessment-questions/__tests__/itemSetIntegrity.test.ts`

**Interfaces:**
- Produces:
  - `buildPassage(paragraphs: string[]): { words: { item_key: string; word: string }[]; paragraph_starts: number[] }`.
    It splits on whitespace and keeps punctuation in `word`. `item_key` is the word lowercased
    with surrounding punctuation stripped.
  - `CONTENT_PENDING: ReadonlyArray<{ item_set_id: string; field: string; note: string }>`
    covers spec 4.3 #1–#5, so the host (Plan 3) can surface pending content.

- [ ] **Step 1: Write the failing integrity test**

```ts
// src/assessment-questions/__tests__/itemSetIntegrity.test.ts
import * as S from '../itemsets/index';
import { CONTENT_PENDING } from '../itemsets/contentStatus';
import { render, fireEvent } from '@testing-library/react-native';
import React from 'react';
import { ReadWordsQuestion } from '../index';

const all = Object.values(S) as Array<Record<string, any>>;

test('every bundled item set is 2024.1 and well-identified', () => {
  expect(all).toHaveLength(22);
  for (const s of all) {
    expect(s.question_version).toBe('2024.1');
    expect(s.item_set_id).toBe(`${s.question_code}@2024.1.${s.language}`);
    expect(['en', 'xh']).toContain(s.language);
  }
});

const count = {
  letters: (s: any) => s.letters.length,
  words: (s: any) => s.words.length,
  sentenceWords: (s: any) => s.sentences.reduce((n: number, x: any) => n + x.words.length, 0),
  cvcLetters: (s: any) => s.words.reduce((n: number, w: any) => n + w.letters.length, 0),
};

test.each([
  ['WELA_PLUS_LETTER_SOUNDS_EN', count.letters, 60], ['WELA_PLUS_LETTER_SOUNDS_XH', count.letters, 60],
  ['WELA_PLUS_READ_WORDS_EN', count.words, 40], ['WELA_PLUS_READ_WORDS_XH', count.words, 40],
  ['WELA_PLUS_READ_SENTENCES_EN', count.sentenceWords, 20], ['WELA_PLUS_READ_SENTENCES_XH', count.sentenceWords, 11],
  ['WELA_PLUS_READ_PASSAGE_EN', count.words, 80], ['WELA_PLUS_READ_PASSAGE_XH', count.words, 45],
  ['WELA_PLUS_WRITE_CVCS_EN', count.cvcLetters, 12], ['WELA_PLUS_WRITE_CVCS_XH', count.cvcLetters, 16],
  ['WELA_PLUS_WRITE_SENTENCES_DICTATION_EN', count.sentenceWords, 15], ['WELA_PLUS_WRITE_SENTENCES_DICTATION_XH', count.sentenceWords, 9],
])('%s max score', (name, fn, expected) => {
  expect(fn((S as any)[name])).toBe(expected);
});

test('fixed-size Questions', () => {
  for (const l of ['EN', 'XH']) {
    expect((S as any)[`WELA_PLUS_FIRST_SOUND_${l}`].prompts).toHaveLength(10);
    expect((S as any)[`WELA_PLUS_PHONEME_BLEND_${l}`].prompts).toHaveLength(8);
    expect((S as any)[`WELA_PLUS_LISTEN_AND_ANSWER_STORY_${l}`].questions).toHaveLength(5);
    expect((S as any)[`WELA_PLUS_STORY_WRITING_${l}`].dimensions.map((d: any) => d.code)).toEqual(['meaning_making', 'spelling', 'length', 'vocabulary']);
    const lw = (S as any)[`WELA_PLUS_LETTER_WRITING_${l}`];
    expect(lw.prompts.map((p: any) => p.expected_letter).join('')).toBe('afkoswbglptxchmquydinrvzej');
    expect(lw.columns).toBe(6);
  }
});

test('card layouts', () => {
  expect(S.WELA_PLUS_LETTER_SOUNDS_EN.columns).toBe(12);
  expect(S.WELA_PLUS_READ_WORDS_EN.row_lengths).toEqual([7, 7, 7, 7, 7, 5]);
  expect(S.WELA_PLUS_READ_WORDS_XH.row_lengths).toEqual([7, 7, 7, 7, 7, 5]);
  expect(S.WELA_PLUS_READ_PASSAGE_EN.paragraph_starts).toEqual([0, 24, 40, 66]);
});

test('EN and XH Q1 rows match the 2024 handouts', () => {
  expect(S.WELA_PLUS_LETTER_SOUNDS_EN.letters.slice(0, 12).join(' ')).toBe('a n i t m s p e b c i u');
  expect(S.WELA_PLUS_LETTER_SOUNDS_XH.letters.slice(48).join(' ')).toBe('u z x r v b j b q u r g');
});

test('language="xh" without an override renders isiXhosa content', () => {
  const r = render(<ReadWordsQuestion language="xh" instructions="." onComplete={jest.fn()} />);
  fireEvent.press(r.getByText('Start'));
  expect(r.getByLabelText('inja, idle')).toBeTruthy();
});

test('pending content is declared', () => {
  const fields = CONTENT_PENDING.map((p) => `${p.item_set_id}#${p.field}`);
  expect(fields).toEqual(expect.arrayContaining([
    'wela_plus_letter_writing@2024.1.en#prompts.x,q',
    'wela_plus_letter_writing@2024.1.xh#prompts.picture.alt',
    'wela_plus_write_cvcs@2024.1.xh#words.letters',
    'wela_plus_story_writing@2024.1.en#dimensions.anchors',
    'wela_plus_story_writing@2024.1.xh#dimensions.anchors',
  ]));
});
```

Create `src/assessment-questions/itemsets/index.ts`, which re-exports all 22 item-set
constants by name.

- [ ] **Step 2: Run and confirm failure.** Expected: FAIL on versions and counts, because the
  stubs are still in place.

- [ ] **Step 3: Write `buildPassage.ts` and `contentStatus.ts`**

```ts
// src/assessment-questions/itemsets/buildPassage.ts
export function buildPassage(paragraphs: string[]) {
  const words: { item_key: string; word: string }[] = [];
  const paragraph_starts: number[] = [];
  for (const p of paragraphs) {
    paragraph_starts.push(words.length);
    for (const word of p.trim().split(/\s+/)) {
      words.push({ item_key: word.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '').toLowerCase(), word });
    }
  }
  return { words, paragraph_starts };
}
```

```ts
// src/assessment-questions/itemsets/contentStatus.ts
/** Content awaiting Masi pedagogy (spec 4.3). The host shows this before field release. */
export const CONTENT_PENDING: ReadonlyArray<{ item_set_id: string; field: string; note: string }> = [
  { item_set_id: 'wela_plus_letter_writing@2024.1.en', field: 'prompts.x,q', note: 'Confirm the x (figure behind a sign) and q (crowned figure) cells.' },
  { item_set_id: 'wela_plus_letter_writing@2024.1.xh', field: 'prompts.picture.alt', note: 'Supply isiXhosa picture names; decide whether the x cell (no picture) is scored.' },
  { item_set_id: 'wela_plus_write_cvcs@2024.1.xh', field: 'words.letters', note: 'Confirm prefix-excluded scoring letters (m a l i, d o l o) giving /16.' },
  { item_set_id: 'wela_plus_story_writing@2024.1.en', field: 'dimensions.anchors', note: 'Five anchor descriptions (0–4) per dimension.' },
  { item_set_id: 'wela_plus_story_writing@2024.1.xh', field: 'dimensions.anchors', note: 'Five anchor descriptions (0–4) per dimension, and isiXhosa labels.' },
  { item_set_id: 'wela_plus_read_words@2024.1.en', field: 'durationSec', note: 'Confirm Q6 untimed (paper has no timer).' },
  { item_set_id: 'wela_plus_read_passage@2024.1.en', field: 'durationSec', note: 'Confirm Q8 untimed (paper has no timer).' },
  { item_set_id: 'all@2024.1.xh', field: 'strings', note: 'First-language review of every isiXhosa string.' },
];
```

- [ ] **Step 4: Write the 22 item sets.** The content is verbatim from spec section 4.2, with
  this exact shape per file. Every header is:

```ts
import type { ItemSet } from '../types/ItemSet';
import type { <Shape> } from '../questions/<Question>/types';

export const WELA_PLUS_<NAME>_<EN|XH>: ItemSet<<Shape>> = {
  item_set_id: '<question_code>@2024.1.<en|xh>',
  question_code: '<question_code>',
  question_version: '2024.1',
  language: '<en|xh>',
  // body
};
```

The bodies:

**Letter sounds**
- EN: `columns: 12`,
  `letters: 'a n i t m s p e b c i u f l d h o k g f r u f s e s i a y u w c z m o f n p q j t v x y a n t n k b m s p e b l d g a d'.split(' ')`.
- XH: `columns: 12`,
  `letters: 'l a m e s n l s m e y i k n d h f u h v f y c i t k d z f d t z o j p r c w p o w a e x q l g o u z x r v b j b q u r g'.split(' ')`.

**Listen and answer story**
- EN: `story` = the EN story in spec 4.2.
  `questions`:
  ```
  [
    { item_key: 'q2.item_1', prompt: 'What did the girl have on her feet?', acceptable_answers: ['running shoes'] },
    { item_key: 'q2.item_2', prompt: 'What did she hear?', acceptable_answers: ['crying'] },
    { item_key: 'q2.item_3', prompt: 'Where do you think she was?', acceptable_answers: ['near trees', 'in a forest', 'park'] },
    { item_key: 'q2.item_4', prompt: 'What happened to the boy?', acceptable_answers: ['he fell from a tree'] },
    { item_key: 'q2.item_5', prompt: 'What do you think the girl felt when she saw the boy?', acceptable_answers: ['she felt sorry for him', 'sad', 'or similar answers'] },
  ]
  ```
- XH: `story` = the XH story in spec 4.2. `questions`:
  ```
  [
    { item_key: 'q2.item_1', prompt: 'Yayinxibe ntoni ezinyaweni intombazana?', acceptable_answers: ['izihlangu zokubaleka'] },
    { item_key: 'q2.item_2', prompt: 'Yeva ntoni?', acceptable_answers: ['umntu okhalayo'] },
    { item_key: 'q2.item_3', prompt: 'Ucinga ukuba yayiphi?', acceptable_answers: ['ngasemithini', 'ehlathini', 'epakhini'] },
    { item_key: 'q2.item_4', prompt: 'Kwakwenzeke ntoni enkwenkweni?', acceptable_answers: ['inkwenkwe yawa emthini'] },
    { item_key: 'q2.item_5', prompt: 'Ucinga yeva njani intombazana xa ibona inkwenkwe?', acceptable_answers: ['yayiselza', 'yakhathazeka', 'okanye nayiphi impendulo efana nezi'] },
  ]
  ```

**First sound**
- EN: `prompts` from `walk read dance paint cut sing jump hug look talk`, with
  `item_key: 'q3.first_sound.item_<n>'`.
- XH: the same, from `hamba funda danisa baleka lala cula sika mamela zoba vuka`.

**Phoneme blend**
- EN: `prompts` from the pairs
  `[['s-u-n','sun'],['b-oo-k','book'],['m-ee','me'],['u-p','up'],['o-n','on'],['s-ee','see'],['f-or-k','fork'],['j-a-m','jam']]`,
  as `{ item_key: 'q4.phoneme_blend.item_<n>', segmented, word }`.
- XH: `[['y-a-m','yam'],['k-u-m','kum'],['l-o','lo'],['y-a','ya'],['ke','ke'],['x-a','xa'],['b-a-m','bam'],['s-a-m','sam']]`.

**Letter writing** (`itemsPerPage: 26`, `columns: 6`)
- Each prompt is `{ item_key: letter, expected_letter: letter, picture: { source: null, alt: name } }`,
  in the order `afkoswbglptxchmquydinrvzej`.
- EN names: apple, fish, key, orange, sun, whale, bed, gate, leaf, pot, table, x (figure behind
  sign), cat, hat, moon, queen, umbrella, yo-yo, dog, insect, net, ring, van, zebra, elephant,
  jacket.
- XH names: i-apile (apple), ufudo (tortoise), ikati (cat), orange, bread, face, milk, drum,
  sun, pear, table, x (no picture), spoon, pig, car, egg, tree, medicine, duck, dog, nest,
  traffic light, van, axe, bucket, jug.

**Read words** (`row_lengths: [7, 7, 7, 7, 7, 5]`, `words` with `item_key = word`)
- EN: the 40 EN words from spec 4.2, in order.
- XH: the 40 XH words, in order.

**Read sentences** (`sentences: [{ item_key: 's<n>', words: [{ item_key: 's<n>.w<m>', word }] }]`)
- EN: `A cat ran` | `The pot was red` | `The car was driving very fast` |
  `Who wants to come with me today?`
- XH: `Usana luyalila` | `Umakhulu upheka ipapa` | `Ndivuka kusasa ndaxukuxa` |
  `Amakhwenkwe adlala ibhola`

**Read passage** (`...buildPassage([...])`)
- EN paragraphs:
  1. `Sam was running down the street with her friends. She fell down and cut her knee. It hurt a lot. She started to cry.`
  2. `Thandi stopped to help her. She picked Sam up and they walked back to her house.`
  3. `Sam's mother gave her a big hug. Then she walked into the kitchen. When she came back out, she was holding two bowls of ice cream.`
  4. `Sam and Thandi sat down to eat some ice cream. Everyone felt much better.`
- XH paragraphs:
  1. `USihle wayethanda kakhulu ukubaleka. Izolo uthe esadlala ebaleni ebaleka, wasuka wakhubeka wawa. Uye walila kakhulu uSihle, waphakama wagoduka eqhwalela.`
  2. `UThando uhambe naye wamgodusa emgonile. Bathe bakufika ekhaya umama wamthuthuzela uSihle.`
  3. `Emva kokuba ethule, umama uye wampha amaqebengwana amnandi. Uye wawavuyela kakhulu amaqebengwana, babelana ngawo noThando.`

**Write CVCs**
- EN: `words: [{ item_key: 'w1', word: 'jam', letters: ['j','a','m'] }, { item_key: 'w2', word: 'hut', letters: ['h','u','t'] }, { item_key: 'w3', word: 'fin', letters: ['f','i','n'] }, { item_key: 'w4', word: 'net', letters: ['n','e','t'] }]`.
- XH: `[{ w1 lala [l,a,l,a] }, { w2 sela [s,e,l,a] }, { w3 imali [m,a,l,i] }, { w4 idolo [d,o,l,o] }]`,
  in the same object shape.

**Write sentences dictation** (`sentences: [{ item_key: 's<n>', words: [{ item_key: 's<n>.w<m>', word }] }]`)
- EN: `Mom got a cat from a pet shop.` | `It drinks milk and sleeps with us.`
- XH: `Ikati yam isela ubisi` | `Ithanda inyama kwaye ihlala elangeni.`

**Story writing**
- No `picture`.
- `dimensions` are the four codes, with labels `Meaning Making`, `Spelling`, `Length`,
  `Vocabulary` (English in both files until XH labels arrive), `anchors: []`, and
  `end_anchor_gloss: ''`.

- [ ] **Step 5: Run the integrity test, the package suite, and types.** Expected: PASS.
  Component tests are unaffected because they use fixtures (Task 2).

- [ ] **Step 6: Commit**

```bash
git add src/assessment-questions
git commit -m "feat(wela): 2024.1 English and isiXhosa content from the paper booklet"
```

---

### Task 13: Full verification and documentation

**Files:**
- Modify: `documentation/build-log.md` (Verification Register row)
- Modify: `docs/agent-context/wela-assessment-component-build.md` (status line)
- Modify: `documentation/ROADMAP.md` §8 (tick the design-conformance item for the package)

- [ ] **Step 1: Run every gate**

```bash
PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npm test 2>&1 | grep -E '^(Tests|Test Suites):'
PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npm run test:integration 2>&1 | grep -E '^(Tests|Test Suites):'
PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npm run -s test:types; echo "types exit=$?"
PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx tsc --noEmit; echo "tsc exit=$?"
```

Expected: all green, and both exits are 0. The unit count exceeds Task 0's baseline.

- [ ] **Step 2: Check the boundary and that no host file was touched**

```bash
git diff --name-only origin/main...HEAD | grep -vE '^(src/assessment-questions/|documentation/|docs/)' || echo "package-only: OK"
```

Expected: `package-only: OK`.

- [ ] **Step 3: Update the docs.**
  - Add a build-log Verification Register row with the gate counts.
  - In ROADMAP §8, replace "Add a source-wide raw-hex guard and complete the warm Masi design
    conformance pass (11 island files still use raw hex as of 2026-10-09)" with "Package
    raw-hex guard and tokens landed (Plan 1, 2026-10-14). The host-side conformance pass
    happens with the Plan 3 screens."
  - Set the agent-context status line to say Plan 1 is complete and Plans 2–3 remain.

- [ ] **Step 4: Commit and open the PR**

```bash
git add documentation docs
git commit -m "docs(wela): record Plan 1 (Question package) verification"
git push -u origin feat/welaplus-plan-1-question-package
gh pr create --title "WelaPLUS Plan 1: Question package 2024.1 (content, battery, component contract)" --body "Implements docs/superpowers/plans/2026-10-14-welaplus-plan-1-question-package.md. Package-only; nothing in the app imports it yet."
```
