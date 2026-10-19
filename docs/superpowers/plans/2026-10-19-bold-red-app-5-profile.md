# Bold Red Profile Implementation Plan (PR 5)

> **For agentic workers:** this repo builds through Codex (`AGENTS.md` "When Building"; skill `codex-first`). Codex implements one task at a time through the codex companion; Claude reviews each task's diff and runs its tests before the next starts, then runs `/codex:adversarial-review` on the finished branch. Codex usually cannot `git commit` in its sandbox, so each task's last step names the exact files to stage and the commit message, and the orchestrator runs it. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild Profile as the approved compact Bold Red page, move Change password into a bottom sheet with inline errors, replace the Export database `Alert.alert` with a sheet, restyle the sign-out sheets without touching their behaviour, and land the `BottomSheet` Android keyboard fix (C11) if PR 1 did not.

**Architecture:** `ProfileScreen` becomes a thin composition of shared primitives (`ListGroup`/`ListRow`, `SectionHeader`, `SegmentedControl`, `BrandButton`, `useToast`) and four Profile-only components in `src/components/profile/`. The password rules move out of the screen into pure functions (`src/utils/passwordChange.js`) that the new `ChangePasswordSheet` calls; the sheet owns the form state and reports a late outcome as a toast. Every existing Profile function keeps a home (part 5 "Function map"). No schema, RLS, payload or outbox change; `changePassword`, `useSignOutFlow`, the exports and the capture-mode store are called exactly as today.

**Tech Stack:** React Native 0.81.5 / React 19.1 / Expo SDK 54, react-native-paper 5 (Portal only), `@expo/vector-icons` Ionicons, Jest 29 + @testing-library/react-native 13, better-sqlite3 integration tests.

**Spec:** `docs/superpowers/specs/2026-10-18-bold-red-app-design.md` (overview; its "System decisions", §6 Jim's answers and §8 review rounds are authoritative) and `docs/superpowers/specs/2026-10-18-bold-red-app-5-profile.md` (this screen). Where part 5 disagrees with the overview on a component, token, type role or path, the overview wins; the conflicts that matter here are resolved in "Spec conflicts resolved" below. Boards (design data): the Profile page of the Design Round 4 canvas, `red-profile-p1-compact`, `-p1-support-open`, `-p2-password-sheet`, `-s-password-error`, `-s-password-verify`, `-s-password-loading`, `-s-export-database`, `-s-exporting-toast`, `-p3-signout-unsynced`, `-p4-signout-confirm`.

## Global Constraints

- Branch `feat/bold-red-profile`, stacked on `feat/bold-red-complete` (PRs 1–4). Commit after every task; never push without Jim.
- Run Jest with Node 20: prefix every test command with `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH`. Unit/screen: `npx jest <file>`. Integration (real SQLite, listed in `jest.integration.config.js` `testMatch`): `npm run test:integration -- <file>`.
- TDD per task: failing test first for behaviour. Pure restyles assert structure, tokens and accessibility through `@testing-library/react-native` (roles, labels, `accessibilityState`, flattened style tokens), never snapshots.
- **Behaviour is frozen** except where the spec approves a change: the compact layout, the password sheet with inline errors, the export confirmation sheet, toasts for messages. `useSignOutFlow.js`, `AuthContext.changePassword`, `debugExport`, `observability`, `deviceSettings`, the Legal URLs and every toast string stay as they are.
- **`__tests__/signOutFlow.test.js` stays byte-for-byte unchanged and green.** It renders `SignOutSheets` inside only `SafeAreaProvider` + `PaperProvider`, so every primitive the sheets use must render without `MotionProvider` / `ToastProvider` (PR 1's contexts must have a safe default; if one throws, fix the default in the context, never the test). It also requires the busy upload button to contain exactly one RN `ActivityIndicator` and to be named "Uploading…".
- No schema, RLS, outbox or `documentation/rls-sync-contract-map.md` change. Stay on npm; no new package.
- Tokens only: `colors.*`, `tints.*`, `typeRoles.*`, `spacing`, `borderRadius`, `shadows`. No raw hex/rgba, no `fontWeight`, no string `fontFamily`, no raw `fontSize`/`lineHeight`/`letterSpacing` (the PR 1 guard `__tests__/designSystemGuard.test.js` enforces this; this PR deletes the `ProfileScreen.js` and `SignOutSheets.js` ratchet lines).
- Copy is verbatim from part 5. New copy uses curly ’; **the sign-out strings stay exactly as today, straight apostrophes included** ("You're still clocked in.", "items haven't uploaded yet.") because `signOutFlow.test.js` pins them.
- Password fields keep platform text assistance (password managers): never spread `NO_TEXT_SUGGESTIONS` in Profile files (`__tests__/domainTextInputAudit.test.js`).
- Every 44/56dp size is a minimum, never a fixed height. Nothing truncates: no `numberOfLines` on names, emails, school names, row titles or release lines.
- Toast durations on Profile: 4000 ms, tone `success` or `error` per message (part 1 §6 table).
- Standing docs ship in this branch (Task 8): `documentation/design-system.md`, `documentation/build-log.md` (append rows), `documentation/ROADMAP.md`, `PRD.md`, and `CONTEXT.md` only if a term changes (none is expected).

## Spec conflicts resolved (read before any task)

| Topic | Part 5 says | Built (why) |
|---|---|---|
| Type roles | `displayTitle` 24/28, `textLead`, `textSection`, `textCaptionStrong` 700; Figtree 600 → 700 | Overview §2.2 names: name and sheet titles `displaySheetTitle`; job title and sheet body `textParagraph`; section labels `textSectionLabel`; notes `textNote` (Figtree **600**, loaded by PR 1, C4) |
| Header height | inset + 56 | PR 1's `ScreenHeader` (inset + 59, overview C2). Profile only sets `title: 'Profile'` |
| Field rest edge | `text + '33'` | `colors.fieldEdge` inside `TextField` (overview §8 R6) |
| Clocked-in warning note | radius 9, 8/12 (sm) | `InlineNote tone="warning" size="md"` (overview §4 S4) |
| Avatar initials tracking | 0.44 | `Avatar` size 64 as PR 2 built it (overview §1.2: 0.03em) |
| `BottomSheet` `maxHeight` | "`maxHeight: '100%'`" | Default stays `'80%'` (overview §7 W10); only the password sheet passes `maxHeight="100%"` |
| Sheet footer bottom padding | 4 with keyboard up, + inset when down | Overview §1.1 keeps `max(insets.bottom, 24)` with the keyboard **down**. With the keyboard **up**, a keyboard-avoiding sheet pads its bottom 4 (`spacing.xs`): the safe-area inset is behind the keyboard, and the 20dp is what keeps one field plus its error visible at 360×640 (part 5 keyboard budget). Applies to every keyboard-avoiding sheet, as part of C11 |
| Upload button spinner | `textSecondary` | `BrandButton`'s own outlined spinner colour (part 1 §4); not worth a variant |
| Toast message weight | Figtree 700 | PR 1's `Toast` (`textBodySemi`, 600) |

## Review Focus

1. **The EA closes the password sheet (or leaves Profile) while the request is still running.** The outcome must still reach her, once, as a toast (success, or the same error string); a reopened sheet starts empty and usable; if she has since signed out or switched account, nothing shows. Pinned in Task 5 (dismiss-then-resolve, dismiss-reopen-resolve, stale handle) and Task 6 (unmount-then-resolve).
2. **A 360×640 phone with the keyboard up at font scale 1.3.** The focused field and its error are fully visible and "Change password" stays above the keyboard. Pinned in Task 2 (keyboard-up bottom padding, Android `padding` behaviour) and Task 3 (`computeScrollTarget` for a block taller than the viewport, above it and below it); the device gate in Task 10 confirms.
3. **A profile that is missing or blank** (`profile === null` on an offline first sign-in, or `profile: {}` with no names, as `task5ActionsBinding.test.js` renders it). The heading falls back to the email, the avatar to the person glyph, no blank header and no crash when the email is missing too. Pinned in Task 4.
4. **A double tap on a destructive or slow action.** Two fast taps on "Export" start one export; two taps on "Change password" during loading call `changePassword` once; the Share database row cannot reopen the sheet while its export runs. Pinned in Task 5 and Task 6.
5. **Long values at large text.** A long email, school name or two-line name wraps (no `numberOfLines`), the avatar stays centred, and the Sensitive badge drops under its title instead of clipping. Pinned in Task 4 (no `numberOfLines`; avatar `alignItems: 'center'`) and Task 1 (`titleAccessory` wraps); the device gate confirms at 360dp.

---

### Preflight (orchestrator, before Task 1; no commit)

PRs 1–4 are written but this plan was drafted before they existed. Confirm the names this plan consumes on `feat/bold-red-complete`, and adjust the task prompts (not the spec) if a name differs:

- [ ] `src/components/common/`: `BrandButton` (props `label, onPress, variant, size, tone, icon, loading, loadingLabel, disabled, accessibilityLabel`; does it forward `testID`? is its loading spinner an RN `ActivityIndicator`? is the spinner colour variant-aware?), `ListGroup`, `ListRow` (variants `action | readOnly | nested`, `busy`; does it have `expanded` and a title accessory slot? which props carry a read-only row's label and value?), `SectionHeader` (`title, hint, action`), `SegmentedControl` (`options` shape), `TextField`, `InlineNote`, `StatusBadge`, `IconTile`, `ConfirmSheet` (from PR 3), `Avatar` (from PR 2), `BottomSheet`.
- [ ] `src/utils/initials.js` exports `getInitials(first, last)` (PR 2).
- [ ] `useToast` in `src/context/ToastContext.js`; `useHeaderHairline` in `src/components/common/ScreenHeader.js`; `useKeyboardHeight` in `src/hooks/useKeyboardHeight.js`; PR 1's shared test render helper (`grep -rn renderWithProviders test-support __tests__`).
- [ ] **C11 status:** does `BottomSheet.js` use `behavior="padding"` on Android, and does `documentation/build-log.md` have a C11 row from PR 1's A03s School-search check? Record the answer; Task 2 depends on it.
- [ ] `__tests__/designSystemGuard.test.js` ratchet list still holds `src/screens/main/ProfileScreen.js` and `src/components/profile/SignOutSheets.js`.
- [ ] Baseline: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest` and `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npm run test:integration` both pass. Record the counts.

---

### Task 1: Additive props on shared primitives (only what is missing)

Profile needs three things the overview's prop lists do not name. Add each only if the preflight found it missing. All are additive; existing callers render identically.

**Files:**
- Modify: `src/components/common/ListRow.js`
- Modify: `src/components/common/BrandButton.js`
- Test: PR 1's existing `__tests__/ListRow.test.js` and `__tests__/BrandButton.test.js` (use the names PR 1 chose)

**Interfaces:**
- Produces: `ListRow` gains `expanded?: boolean` (with `trailing="disclosure"`: `chevron-down` in `colors.textSecondary` when false, `chevron-up` in `colors.text` when true; sets `accessibilityState.expanded`) and `titleAccessory?: ReactNode` (rendered after the title in a `flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center'` line with gap 8, so it drops under a full title). A `busy` row shows a 20dp `ActivityIndicator` (`colors.textSecondary`) in place of its trailing glyph and exposes `accessibilityState={{ busy: true, disabled: true }}` and ignores presses (verify PR 1 already does this; add if not).
- Produces: `BrandButton` forwards `testID` to its `Pressable`; its loading spinner is an RN `ActivityIndicator` coloured with the variant's label colour (white on filled; `colors.error` on `destructiveQuiet`; the existing colour on other outlined variants).

- [ ] **Step 1: Write the failing tests**

  - `ListRow disclosure reflects expanded state`: render `<ListRow title="Support tools" trailing="disclosure" expanded={false} onPress={fn} accessibilityLabel="Support tools" />`; `getByRole('button', { name: 'Support tools' })` has `accessibilityState.expanded === false`; rerender with `expanded`; now `true`.
  - `ListRow titleAccessory renders beside the title and wraps`: render with `titleAccessory={<Text>Sensitive</Text>}`; both texts render; the accessory's parent row has flattened style `flexWrap: 'wrap'`.
  - `ListRow busy row is disabled and shows a spinner`: `busy` → `accessibilityState` `{ busy: true, disabled: true }`, `UNSAFE_getByType(ActivityIndicator)` exists, `fireEvent.press` does not call `onPress`.
  - `BrandButton forwards testID`: `getByTestId('x')` resolves for `<BrandButton testID="x" label="Go" onPress={fn} />`.
  - `BrandButton destructiveQuiet spinner uses the error colour`: `loading` → `UNSAFE_getByType(ActivityIndicator).props.color === colors.error`.

- [ ] **Step 2: Run them and confirm the new ones fail**

  Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/ListRow.test.js __tests__/BrandButton.test.js`
  Expected: FAIL only on the tests for props PR 1 did not build.

- [ ] **Step 3: Implement the missing props** in `ListRow.js` / `BrandButton.js` as described in Interfaces.

- [ ] **Step 4: Run the primitive tests plus Home's** (Home must not change)

  Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/ListRow.test.js __tests__/BrandButton.test.js __tests__/HomeScreen.test.js __tests__/designSystemGuard.test.js`
  Expected: PASS.

- [ ] **Step 5: Commit**

  ```bash
  git add src/components/common/ListRow.js src/components/common/BrandButton.js __tests__/ListRow.test.js __tests__/BrandButton.test.js
  git commit -m "feat(ui): ListRow disclosure state and title accessory; BrandButton testID and variant spinner"
  ```

  If nothing was missing, skip this task and note it in the build log (Task 8).

---

### Task 2: `BottomSheet` keyboard fix (C11) and a footer style hook

Overview C11: if PR 1 already landed the Android fix, do only Step 1's `footerStyle` and keyboard-padding tests and the matching code. Otherwise do all of it.

**Files:**
- Modify: `src/components/common/BottomSheet.js`
- Test: `__tests__/BottomSheet.test.js` (extend; keep every existing test passing)

**Interfaces:**
- Consumes: `useKeyboardHeight()` from `src/hooks/useKeyboardHeight.js` (PR 1): height in dp, 0 when hidden.
- Produces: `BottomSheet` props unchanged plus `footerStyle?: StyleProp<ViewStyle>` (merged last into the footer view, so a caller can drop the rule and change its padding). Behaviour when `keyboardAvoiding` is true:
  - `KeyboardAvoidingView behavior="padding"` on **both** platforms (today `undefined` on Android; the app is edge-to-edge, `app.config.js:52`, so the window no longer resizes).
  - The wrapper fills the overlay: `flex: 1`, `justifyContent: 'flex-end'`, `paddingTop: insets.top + spacing.sm`. The flexbox anchoring stays (no absolute bottom positioning: the 2026-07-22 Portal rule).
  - While the keyboard is up (`useKeyboardHeight() > 0`), the panel's bottom padding is `spacing.xs` (4) instead of `max(insets.bottom, spacing.lg)`.
  - `maxHeight` default stays `'80%'`.
  - Sheets with `keyboardAvoiding={false}` are unchanged.

- [ ] **Step 1: Write the failing tests** (mock the hook: `jest.mock('../src/hooks/useKeyboardHeight', () => ({ useKeyboardHeight: () => mockKeyboardHeight }))`, `let mockKeyboardHeight = 0;`)

  - `avoids the keyboard with padding on Android`: set `Platform.OS = 'android'` for the test (restore after); `UNSAFE_getByType(KeyboardAvoidingView).props.behavior === 'padding'`.
  - `avoids the keyboard with padding on iOS`: same, `'ios'`.
  - `the keyboard wrapper fills the overlay below the top inset`: flattened KAV style has `flex: 1`, `justifyContent: 'flex-end'`, `paddingTop: 0 + spacing.sm` (the file's inset mock is 0).
  - `drops the bottom inset padding while the keyboard is up`: `mockKeyboardHeight = 300` → the panel (found as in the existing `maxHeight === '80%'` test) has `paddingBottom === spacing.xs`; with 0 it is `spacing.lg`.
  - `keeps the bottom padding when keyboard avoidance is off`: `keyboardAvoiding={false}`, `mockKeyboardHeight = 300` → `paddingBottom === spacing.lg`.
  - `footerStyle overrides the footer rule`: `footer={<Text>Footer</Text>} footerStyle={{ borderTopWidth: 0, paddingTop: spacing.md }}` → the footer's parent view flattens to `borderTopWidth: 0, paddingTop: spacing.md`.

- [ ] **Step 2: Run and confirm they fail**

  Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/BottomSheet.test.js`
  Expected: FAIL on the new tests (the Android behaviour tests pass already if PR 1 landed C11).

- [ ] **Step 3: Implement** in `BottomSheet.js` as in Interfaces.

- [ ] **Step 4: Run every sheet test**

  Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/BottomSheet.test.js __tests__/GroupPickerBottomSheet.test.js __tests__/LastAttemptedBottomSheet.test.js __tests__/LetterTrackerBottomSheet.test.js __tests__/LetterTrackerBottomSheet.plan5.test.js __tests__/signOutFlow.test.js`
  plus every test file whose name contains `SelectSheet`, `ConfirmSheet` or `ClockInBeforeSessionSheet`.
  Expected: PASS, `signOutFlow.test.js` unchanged.

- [ ] **Step 5: Commit**

  ```bash
  git add src/components/common/BottomSheet.js __tests__/BottomSheet.test.js
  git commit -m "fix(sheet): avoid the keyboard on Android edge-to-edge and drop the hidden inset padding"
  ```

  The "no double lift" device row (School search in Create class) is in Task 10.

---

### Task 3: Password rules and scroll-into-view as pure functions

**Files:**
- Create: `src/utils/passwordChange.js`
- Create: `src/utils/scrollIntoView.js`
- Test: `__tests__/passwordChange.test.js`, `__tests__/scrollIntoView.test.js`

**Interfaces:**
- Produces (`passwordChange.js`):
  - `PASSWORD_VERIFICATION_FAILED_MESSAGE = 'Could not verify your current password. Check your connection and try again.'`
  - `isInvalidCredentialsError(error) => boolean`: moved **verbatim** from `ProfileScreen.js:23-34`.
  - `validatePasswordChange({ currentPassword, newPassword, confirmPassword }) => null | { field: 'new' | 'confirm' | null, message: string }`. Order and messages are today's (`ProfileScreen.js:196-209`): any empty → `{ field: null, message: 'All password fields are required' }`; `newPassword.length < 8` → `{ field: 'new', message: 'New password must be at least 8 characters' }`; mismatch → `{ field: 'confirm', message: 'New passwords do not match' }`; else `null`.
  - `describePasswordChangeFailure({ error, phase }) => { field: 'current' | null, message: string }`: `phase === 'verification'` and `isInvalidCredentialsError(error)` → `{ field: 'current', message: 'Current password is incorrect' }`; other verification → `{ field: null, message: PASSWORD_VERIFICATION_FAILED_MESSAGE }`; anything else → `{ field: null, message: error?.message || 'Failed to change password' }`.
  - `field: null` means a form-level note; no field turns red.
- Produces (`scrollIntoView.js`): `computeScrollTarget({ blockY, blockHeight, scrollY, viewportHeight }) => number | null`. `null` when the block is already fully inside `[scrollY, scrollY + viewportHeight]`. Otherwise: a block taller than the viewport, or one above it, → `blockY`; a block below it → `blockY + blockHeight - viewportHeight`.

- [ ] **Step 1: Write the failing tests**

  `passwordChange.test.js`:
  - each validation case above, including `'1234567'` (7) failing length and `'12345678'` passing; empty wins over length when both apply; length wins over mismatch.
  - `isInvalidCredentialsError`: `{ code: 'invalid_credentials' }` true; `{ status: 400, message: ' Invalid login credentials ' }` true; `{ status: 0, message: 'Network request failed' }` false; `{ status: 400, message: 'Something else' }` false; `null` false.
  - `describePasswordChangeFailure`: the three branches, and `{ phase: 'update', error: {} }` → `'Failed to change password'`.

  `scrollIntoView.test.js`:
  - visible block → `null`; block below → `blockY + blockHeight - viewportHeight` (e.g. `{ blockY: 140, blockHeight: 102, scrollY: 0, viewportHeight: 108 }` → 134); block above → `blockY`; block taller than the viewport (`blockHeight: 120, viewportHeight: 90`) → `blockY`.

- [ ] **Step 2: Run and confirm they fail** ("Cannot find module")

  Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/passwordChange.test.js __tests__/scrollIntoView.test.js`

- [ ] **Step 3: Implement both modules.** Do not yet delete the copies in `ProfileScreen.js` (Task 6 does).

- [ ] **Step 4: Run again.** Expected: PASS.

- [ ] **Step 5: Commit**

  ```bash
  git add src/utils/passwordChange.js src/utils/scrollIntoView.js __tests__/passwordChange.test.js __tests__/scrollIntoView.test.js
  git commit -m "feat(profile): password-change rules and scroll-into-view as pure functions"
  ```

---

### Task 4: `ProfileIdentity`, `AppReleaseInfo`, `ExportDatabaseSheet`

**Files:**
- Create: `src/components/profile/ProfileIdentity.js`
- Create: `src/components/profile/AppReleaseInfo.js`
- Create: `src/components/profile/ExportDatabaseSheet.js`
- Test: `__tests__/profileComponents.test.js`

**Interfaces:**
- Consumes: `Avatar` (`label, size=64, icon`), `getInitials(first, last)`, `ConfirmSheet` (`visible, title, titleAccessory, body, confirmLabel, confirmVariant, cancelLabel, onConfirm, onCancel`), `StatusBadge` (`label, tone`).
- Produces:
  - `ProfileIdentity({ profile, email })`. Row, `alignItems: 'center'`, gap 16. `Avatar size={64}`: initials `getInitials(profile.first_name, profile.last_name)`; if the trimmed full name is empty (profile `null`, `{}` or blank names) the avatar takes `icon="person-outline"` (28dp, `colors.red700`) and the heading shows `email ?? ''`. Heading `typeRoles.displaySheetTitle` `colors.text`, `accessibilityRole="header"`, no `numberOfLines`. Job title (`profile?.jobTitleName`) `typeRoles.textParagraph` `colors.textSecondary`, `marginTop: 2`, omitted when falsy. The text column is `flex: 1`.
  - `formatReleaseLines({ releaseMetadata, runtimeDiagnostics, platform }) => [string, string, string]` (exported from `AppReleaseInfo.js`; `platform` is `{ OS, Version }`, default `Platform`). Lines (part 5 "App release info", same five facts and fallbacks as `ProfileScreen.js:462-477`):
    1. `Version {application.version} (Build {application.build || '?'}) · Backend {supabaseTarget}`
    2. `Project {supabaseProjectId}`
    3. `Device {device.modelName || 'Unknown'} · {device.osName || OS} {device.osVersion || Version} · Update {update.id || 'Embedded'}`
    Every space **inside** a fact is U+00A0 (non-breaking); only the ` · ` separators keep normal spaces, so lines wrap at separators.
  - `AppReleaseInfo({ releaseMetadata, runtimeDiagnostics })`: three centred `Text`s, `typeRoles.textCaption`, `colors.textSecondary`, `fontVariant: ['tabular-nums']`, `marginTop: 24` above it (owned by the screen, not here).
  - `ExportDatabaseSheet({ visible, onExport, onCancel })`: a thin wrapper rendering `ConfirmSheet` with `title="Export database"`, `titleAccessory={<StatusBadge label="Sensitive" tone="warning" />}`, `body="This will export all local data including sensitive information. Only share with Masi support staff."`, `confirmLabel="Export"`, `confirmVariant="destructive"`, `cancelLabel="Cancel"`, `onConfirm={onExport}`, `onCancel={onCancel}`.

- [ ] **Step 1: Write the failing tests** (render inside PR 1's provider helper, or `SafeAreaProvider` + `PaperProvider`)

  - `ProfileIdentity shows name, job title and initials`: profile `{ first_name: 'Test', last_name: 'User', jobTitleName: 'Education Assistant' }` → `getByRole('header', { name: 'Test User' })`, `getByText('Education Assistant')`, `getByText('TU')`.
  - `ProfileIdentity falls back to the email when the profile is missing`: `profile={null}`, `email="test@masinyusane.org"` → header is the email; no job title text; no initials text; `Avatar` received `icon="person-outline"` (`UNSAFE_getByType(Avatar).props.icon`).
  - `ProfileIdentity treats a blank profile like a missing one`: `profile={{}}` → header is the email; `profile={{}}` with `email={undefined}` renders without throwing.
  - `ProfileIdentity never truncates`: name, job title `numberOfLines` undefined; the row's flattened style has `alignItems: 'center'`.
  - `formatReleaseLines` with the `ProfileScreen.releaseMetadata.test.js` fixtures returns exactly `['Version 1.2.0 (Build 7) · Backend sqlite-staging', 'Project segygjzpujphwvrubusm', 'Device iPhone · iOS 18.0 · Update Embedded']`; with `build: null`, `modelName: null`, `osName: null` the fallbacks `?`, `Unknown` and `platform.OS` appear.
  - `AppReleaseInfo renders three tabular lines`: three texts; each flattened style has `fontVariant: ['tabular-nums']` and `textAlign: 'center'`.
  - `ExportDatabaseSheet`: visible → texts "Export database", "Sensitive", the body; pressing "Export" calls `onExport` once and not `onCancel`; pressing "Cancel" calls `onCancel`; `visible={false}` renders none of them.

- [ ] **Step 2: Run and confirm they fail**

  Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/profileComponents.test.js`

- [ ] **Step 3: Implement the three components.**

- [ ] **Step 4: Run again.** Expected: PASS.

- [ ] **Step 5: Commit**

  ```bash
  git add src/components/profile/ProfileIdentity.js src/components/profile/AppReleaseInfo.js src/components/profile/ExportDatabaseSheet.js __tests__/profileComponents.test.js
  git commit -m "feat(profile): identity block, release info lines and export confirmation sheet"
  ```

---

### Task 5: `ChangePasswordSheet`

**Files:**
- Create: `src/components/profile/ChangePasswordSheet.js`
- Modify: `__tests__/domainTextInputAudit.test.js` (add one line to the "auth and password screens" test)
- Test: `__tests__/ChangePasswordSheet.test.js`

**Interfaces:**
- Consumes: `BottomSheet` (Task 2: `footerStyle`, `maxHeight`, `scrollViewProps`), `TextField`, `InlineNote`, `BrandButton`, `useToast`, Task 3's functions.
- Produces: `ChangePasswordSheet({ visible, onClose, changePassword, handle })`. `changePassword` and `handle` are what `ProfileScreen` already reads from `useAuth()` / `useSignedInEA()`. `onClose()` is called for Cancel, backdrop, Android Back and success; the parent sets `visible` false.

Layout (part 5 "Change password sheet"; overview roles):
- `BottomSheet` with `title="Change password"`, `dismissLabel="Dismiss change password"`, `maxHeight="100%"`, `keyboardAvoiding` (default), `scrollable`, `scrollViewProps={{ ref: scrollRef, keyboardShouldPersistTaps: 'handled', onLayout, onScroll, scrollEventThrottle: 16 }}` (React 19 passes `ref` through the spread).
- `headerExtras`: the toggle, `BrandButton variant="tertiary" tone="accent" size="sm"`, icon `eye-outline` / `eye-off-outline`, label "Show passwords" / "Hide passwords", inside a wrapper with `alignSelf: 'flex-start', marginVertical: -12` so its 44 target adds no height. It stays usable while loading.
- Body: three field blocks 12 apart, each a `View` (`testID` `password-block-current`, `-new`, `-confirm`; the hint + form-error block is `password-block-notes`) whose `onLayout` records `{ y, height }`. `TextField` props (each also gets `onFocus` and `onBlur` for the scroll rule below; if PR 1's `TextField` does not pass them through to its input while keeping its own focus styling, add that as an optional, default-preserving passthrough with a test in `TextField`'s test file, Gap rule): `icon="lock-closed-outline"`, `secureTextEntry={!showPasswords}` (no `onToggleSecure`), `autoCapitalize="none"`, `autoCorrect={false}`, `disabled={loading}`, `error` = the field error for that field, `inputRef`.
  - Current: label "Current password", placeholder "Enter current password", `textContentType="password"`, `autoComplete="current-password"`, `autoFocus`, `returnKeyType="next"` → focus New.
  - New: "New password" / "Enter new password", `textContentType="newPassword"`, `autoComplete="new-password"`, `returnKeyType="next"` → focus Confirm.
  - Confirm: "Confirm new password" / "Re-enter new password", same content type as New, `returnKeyType="done"`, `onSubmitEditing` = submit.
  - Hint 8 below the fields: 16dp `information-circle-outline` `colors.textSecondary` + `typeRoles.textCaption` "Password must be at least 8 characters". Always shown.
  - Form-level error 12 below the hint: `InlineNote tone="error"`.
- `footer` with `footerStyle={{ borderTopWidth: 0, paddingTop: spacing.md }}`: `BrandButton variant="primary"` label "Change password", `testID="change-password-submit"`, `loading={loading}`; 8 gap; `BrandButton variant="tertiary" tone="ink"` "Cancel".

Behaviour (part 5 "States"; today's checks at `ProfileScreen.js:194-243`):
- Submit: return if `!handle.isCurrent()` or already loading. Clear all errors. `validatePasswordChange` → set the field or form error and stop. Else start an attempt (`attemptRef` = a fresh token; `liveAttemptRef` = the same token), `setLoading(true)`, `await changePassword({ currentPassword, newPassword, handle })`.
- Outcome rules, in order: if `!handle.isCurrent()` or `isStaleActorError(error)` → nothing. On `error`: `console.error('Password verification error:', error)` for verification, `console.error('Password change error:', error)` otherwise (also for a thrown rejection, as today), then `describePasswordChangeFailure`. On success: the message is "Password changed successfully".
- **Live attempt** (the sheet still shows this attempt): failure → set the field/form error inline, no toast; success → reset fields, errors and Show passwords, call `onClose()`, `toast.show({ message: 'Password changed successfully', tone: 'success', duration: 4000 })`.
- **Abandoned attempt** (dismissed, or the component unmounted, before it resolved): `toast.show({ message, tone: success ? 'success' : 'error', duration: 4000 })`; no state change.
- `setLoading(false)` only if the attempt is still live and the component is mounted.
- Dismissal (`onDismiss` of the sheet and Cancel): always allowed, including while loading; clears the three fields, all errors, `showPasswords` → false, `loading` → false, `liveAttemptRef` → null (the attempt becomes abandoned), then `onClose()`.
- Error clearing: editing a field clears that field's error and the form error.
- Scroll (part 5 focus-visibility rule). Moving focus between fields that are already laid out does **not** fire `onLayout` (React Native fires it on mount and on geometry change, and `TextField` keeps its border width constant across focus states), so the scroll must not wait for a layout event. Cache measurements and act on focus immediately:
  - Refs: `layoutsRef` (block key → `{ y, height }`, written by each block's `onLayout`), `viewportHeightRef` (ScrollView `onLayout`), `scrollYRef` (ScrollView `onScroll`, `contentOffset.y`), `focusedKeyRef` (the focused field's block, set on focus, cleared on blur), `pendingKeyRef` (a block that still owes a scroll).
  - `ensureVisible(key)`: if `layoutsRef[key]` or `viewportHeightRef` is missing, set `pendingKeyRef = key` and return. Otherwise compute `computeScrollTarget({ blockY, blockHeight, scrollY: scrollYRef, viewportHeight })`; when non-null call `scrollRef.current?.scrollTo({ y: target, animated: true })` and set `scrollYRef` to the target; then clear `pendingKeyRef` if it equals `key`.
  - Call it: on a field's focus, **immediately**, with that field's block (`ensureVisible('new')`); when an error is set, mark its block pending (the field's block, or `notes` for a form error), because the error text changes that block's height and the cached layout is stale until it re-lays out.
  - Retry: a block's `onLayout` stores its layout, then calls `ensureVisible(key)` if `key === pendingKeyRef`. The ScrollView's `onLayout` stores the viewport height, then calls `ensureVisible(pendingKeyRef ?? focusedKeyRef)` (the keyboard rising shrinks the viewport after the focus event has already run).
  - Reset all five refs' focus/pending state (not the layouts) when the sheet is dismissed.

- [ ] **Step 1: Write the failing tests**

  Render `<ChangePasswordSheet visible onClose={onClose} changePassword={changePassword} handle={handle} />` inside PR 1's providers (`ToastProvider` included, so toasts render as text). `handle = { isCurrent: jest.fn(() => true), userId: 'ea-1', epoch: 1 }`. Find inputs with `getByLabelText` on the field label (if `TextField` names the input "{label}, error: …" when invalid, match with a regex). Helper `fill(current, next, confirm)`.

  - `empty fields show the form note and mark no field`: press `change-password-submit` → `getByText('All password fields are required')` with `accessibilityRole="alert"`; none of the three inputs has an "error" accessible name; `changePassword` not called.
  - `a short new password is reported under New`: `fill('a', '1234567', '1234567')` → "New password must be at least 8 characters" renders, and the New input's accessible name contains "error".
  - `a mismatch is reported under Confirm`.
  - `an incorrect current password is reported under Current`: resolve `{ phase: 'verification', error: { code: 'invalid_credentials', message: 'Invalid login credentials', status: 400 } }` → "Current password is incorrect" on Current; no toast text.
  - `a network failure during verification never blames Current`: resolve `{ phase: 'verification', error: { message: 'Network request failed', status: 0 } }` → `PASSWORD_VERIFICATION_FAILED_MESSAGE` renders; `queryByText('Current password is incorrect')` null; Current's name has no "error".
  - `an update error shows its message; no message falls back`: `{ phase: 'update', error: { message: 'Password too weak' } }` → that text; `{ phase: 'update', error: {} }` → "Failed to change password".
  - `loading locks the fields and refuses a second press`: hold `changePassword` on a deferred; after the press each input has `editable === false`; the submit button's `accessibilityState` has `busy: true`; pressing it again leaves `changePassword` at 1 call; "Show passwords" still toggles.
  - `success closes the sheet and toasts`: resolve `{ error: null, phase: 'update' }` → `onClose` called once; "Password changed successfully" renders; rerender `visible={false}` then `visible` → all three inputs have value `''`.
  - `editing a field clears its error and the form error`: produce "New passwords do not match", change Confirm's text → the note is gone; produce the required note, change any field → gone.
  - `Cancel clears the fields and resets Show passwords`: fill, toggle to "Hide passwords", press Cancel → `onClose` called; reopen → empty values, "Show passwords" label, inputs `secureTextEntry === true`.
  - `dismissing during the request reports the outcome as a toast`: hold the deferred, press Cancel, resolve success → "Password changed successfully" renders once; reject path: hold, dismiss via `getByLabelText('Dismiss change password')`, resolve `{ phase: 'verification', error: { code: 'invalid_credentials', status: 400 } }` → toast text "Current password is incorrect", and after reopening no inline note.
  - `a reopened sheet is usable while the abandoned request finishes`: hold, Cancel, reopen → submit button not busy, fields editable; then resolve → the toast appears and the reopened form keeps its (empty) state.
  - `a stale handle shows nothing`: hold, set `handle.isCurrent` to return false, resolve success → no toast, `onClose` not called; same for `error: new StaleActorError()`.
  - `Show passwords toggles all three fields`: initially all `secureTextEntry === true`; press "Show passwords" → all false and the label reads "Hide passwords".
  - `Current password is focused on open`: the Current input's `autoFocus === true`.
  - `focusing an already-measured field scrolls it into view without another layout event` (the Next-key path at 360×640). The ScrollView jest mock's `scrollTo` is a `jest.fn` on its prototype (`node_modules/react-native/jest/mocks/ScrollView.js`): read it from `UNSAFE_getByType(ScrollView).instance.scrollTo` and `mockClear()` it after setup. Fire `layout` once on the ScrollView (height 120) and once on each block (`password-block-current` y 0 h 102, `-new` y 114 h 102, `-confirm` y 228 h 102, `-notes` y 342 h 40). Then, with **no further `layout` events**:
    - `fireEvent(getByLabelText('New password'), 'focus')` → `scrollTo` last called with `{ y: 96, animated: true }` (114 + 102 − 120);
    - fire `scroll` on the ScrollView at `contentOffset.y` 96, then focus Confirm → `{ y: 210, animated: true }`;
    - focus Current → `{ y: 0, animated: true }` (block above);
    - focusing a field that is already fully visible calls `scrollTo` no more times.
  - `a focus before measurement scrolls once the layouts arrive`: focus New before any `layout` → `scrollTo` not called; fire the block and ScrollView `layout` events → called once with the computed target.
  - `the keyboard shrinking the viewport re-checks the focused field`: viewport 400, focus New (visible, no call); fire ScrollView `layout` with height 120 → `{ y: 96, animated: true }`.
  - `an error re-scrolls its block after it grows`: produce "New passwords do not match" (Confirm's block pending); fire `layout` on `password-block-confirm` with height 130 → `scrollTo` called with that block's new target.

  `domainTextInputAudit.test.js`, in "auth and password screens keep platform text assistance available", add:
  ```js
  expect(readSource('src/components/profile/ChangePasswordSheet.js')).not.toContain('NO_TEXT_SUGGESTIONS');
  ```

- [ ] **Step 2: Run and confirm they fail**

  Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/ChangePasswordSheet.test.js __tests__/domainTextInputAudit.test.js`

- [ ] **Step 3: Implement `ChangePasswordSheet.js`** to the layout and behaviour above.

- [ ] **Step 4: Run again.** Expected: PASS.

- [ ] **Step 5: Commit**

  ```bash
  git add src/components/profile/ChangePasswordSheet.js __tests__/ChangePasswordSheet.test.js __tests__/domainTextInputAudit.test.js
  git commit -m "feat(profile): change password in a bottom sheet with inline errors"
  ```

---

### Task 6: Rebuild `ProfileScreen` as the compact page

**Files:**
- Modify: `src/screens/main/ProfileScreen.js` (rewrite)
- Modify: `src/navigation/AppNavigator.js` (Profile `options`: `title: 'Profile'`; drop `headerBackTitle` if PR 1's header ignores it)
- Modify: `__tests__/designSystemGuard.test.js` (delete the `src/screens/main/ProfileScreen.js` ratchet line)
- Rewrite: `__tests__/ProfileScreen.releaseMetadata.test.js`, `__tests__/profileCaptureModeToggle.test.js`
- Create: `__tests__/ProfileScreen.layout.test.js`
- Modify (interaction helpers and render wrapper only, assertions unchanged): `__tests__/task5AuthRaces.test.js` (all five screen-driven password-test definitions, eight cases; inventory in Step 4), `__tests__/task5ActionsBinding.test.js`
- Modify if it asserts Profile's title: PR 1's rewrite of `__tests__/AppNavigator.headers.test.js`

**Interfaces:**
- Consumes: Tasks 1–5, `ListGroup`, `ListRow`, `IconTile`, `SectionHeader`, `SegmentedControl`, `BrandButton`, `useToast`, `useHeaderHairline`, `SignOutSheets` (unchanged props).
- Produces: nothing new for later tasks; `ProfileScreen`'s props stay `{ navigation }`.

Page (part 5 "Visual spec"; measurements in dp):
- No `KeyboardAvoidingView`. A `ScrollView` (`colors.background`) with `contentContainerStyle` `paddingTop: 20, paddingHorizontal: spacing.lg, paddingBottom: 40 + insets.bottom`. Wire the header hairline the way PR 1 wired it on no-board screens, but only when a `NavigationContext` is present (screen and integration tests render without a navigator, as `CaptureModeFocusLoader` already handles).
- `ProfileIdentity profile={profile} email={user?.email}`.
- Sections 32 apart (first 32 below the identity). Each section: `SectionHeader` then its content 12 below.
  1. **"Profile info"**: `ListGroup` with read-only rows "Email" (lead `IconTile icon="mail-outline"`) → `user?.email`, and "Assigned school" (`school-outline`) → `profile.schoolName`, only when truthy. Each read-only row is one accessible element named "{label}, {value}". Footnote 10 below the group: 16dp `lock-closed-outline` `colors.textSecondary` (1dp top offset), gap 6, `typeRoles.textCaption` `colors.textSecondary` "Profile information is managed by administrators" (not italic).
  2. **"Assessment capture"**, `hint="How you mark each item during an EGRA assessment."`: `SegmentedControl role="radio" accessibilityLabel="Assessment capture" options={[{ value: CAPTURE_MODES.GRID, label: 'Grid' }, { value: CAPTURE_MODES.SEQUENTIAL, label: 'Step-by-step' }]} value={captureMode} onChange={handleChangeCaptureMode}`. `CaptureModeFocusLoader`, the optimistic set and revert stay as today.
  3. **"Account & support"**: one `ListGroup`, two children:
     - `ListRow` lead `IconTile icon="lock-closed-outline"`, title "Change password", `trailing="chevron"`, `accessibilityLabel="Change password"`, opens `ChangePasswordSheet`.
     - One child `View` holding the Support tools row and, when open, its panel (so the group draws no divider between them): `ListRow` lead `IconTile icon="help-buoy-outline"`, title "Support tools", `trailing="disclosure"`, `expanded={supportOpen}`, `accessibilityLabel="Support tools"`, subtitle collapsed `'Share logs · Share database · Test crash reporting'`, open "Use when Masi support asks". `supportOpen` starts `false` on every mount. The panel: `colors.background` fill, 1dp `colors.border` top edge, three `ListRow variant="nested"` rows:
       - "Share logs", lead `document-text-outline`, `trailing="share"`, `busy={logsExportLoading}`, `onPress={handleShareLogs}`.
       - "Share database", `titleAccessory={<StatusBadge label="Sensitive" tone="warning" />}`, lead `server-outline`, `trailing="share"`, `busy={databaseExportLoading}`, `accessibilityLabel="Share database, sensitive"`, opens `ExportDatabaseSheet`.
       - "Test crash reporting", lead `bug-outline`, `trailing="send"`, `busy={reportTestLoading}`, `onPress={handleSendObservabilityTest}`.
  4. **"Legal"**: `ListGroup` with "Terms & Conditions" (`document-text-outline` tile) and "Privacy Policy" (`shield-checkmark-outline`), `trailing="external"`, `accessibilityRole="link"`, labels "Terms & Conditions, opens in browser" / "Privacy Policy, opens in browser"; handlers, URLs and messages unchanged.
- `AppReleaseInfo` 24 below the Legal group (`getReleaseMetadata()` and `getRuntimeDiagnostics()` as today).
- Sign out 16 below: `BrandButton variant="destructiveQuiet" size="lg" icon="log-out-outline" label="Sign out" loading={signOutFlow.busy === 'signing_out'} onPress={signOutFlow.start}`.
- `<SignOutSheets {...signOutFlow} isOnline={isOnline} />`, `<ChangePasswordSheet visible={passwordOpen} onClose={() => setPasswordOpen(false)} changePassword={changePassword} handle={handle} />`, `<ExportDatabaseSheet visible={exportOpen} onExport={handleConfirmExport} onCancel={() => setExportOpen(false)} />`.

Behaviour:
- `showMessage(message, type = 'success')` becomes `toast.show({ message, tone: type, duration: 4000 })`. Every existing string and its tone is unchanged (part 5 "Toasts").
- `handleShareDatabase` opens the sheet (no `Alert.alert`) unless an export is running. `handleConfirmExport`: if an export is already running (a ref, so two taps in one frame start one export) return; close the sheet; then run today's body (`exportDatabase({ handle })`, the same three messages, `setDatabaseExportLoading`).
- Remove the password state and `handleChangePassword`, `isInvalidCredentialsError` and `PASSWORD_VERIFICATION_FAILED_MESSAGE` from the screen (they live in Tasks 3 and 5). Remove the Paper `TextInput`, `Button`, `Card`, `Divider`, `Snackbar`, `SegmentedButtons` imports and `Alert`.

- [ ] **Step 1: Write the failing screen tests**

  Shared setup for the three screen files: the mocks already in `ProfileScreen.releaseMetadata.test.js` (keep `expo-constants`, `expo-application`, `expo-device`, `expo-updates`, `debugExport`, `observability`, `useTimeTracking`, `OfflineContext`, `SignedInEAContext` with `handle: { isCurrent: () => true, userId: 'ea-1', epoch: 1 }`), rendered through PR 1's provider helper. Drop the hand-rolled `react-native-paper` mock in `profileCaptureModeToggle.test.js`; keep its `@react-navigation/native` and `deviceSettings` mocks. Release text uses non-breaking spaces, so match with `\s` (`/Version\s1\.2\.0/`).

  `ProfileScreen.releaseMetadata.test.js` (rewrite):
  - `shows app build and backend identity for support screenshots`: `/Version\s1\.2\.0\s\(Build\s7\)/`, `/Backend\ssqlite-staging/`, `/Project\ssegygjzpujphwvrubusm/`, `/Device\siPhone/`, `/Update\sEmbedded/`.
  - `Sign out asks about the shift before reading the signed-in handle unsent count`: today's test with `getByRole('button', { name: 'Sign out' })`; the rest unchanged.
  - `keeps the database export available while logs are exporting` / `… logs export available while the database is exporting`: open Support tools; hold the export on a deferred; the busy row has `accessibilityState` `{ busy: true, disabled: true }`, the other row `busy` falsy; the database path opens the sheet and presses "Export" (no `Alert` spy).
  - `Share database opens the export sheet instead of an alert`: `jest.spyOn(Alert, 'alert')` never called; "Export database" and "Sensitive" visible; Cancel closes it (texts gone) and `exportDatabase` not called.
  - `Export closes the sheet, exports once and toasts`: press "Export" twice in one `act` → `exportDatabase` called once with `{ handle }`; sheet text gone; resolve `{ success: true }` → "Database exported successfully"; `{ success: false }` → "Failed to export database"; a rejection → "Failed to export database".
  - `Share logs and crash test toasts`: logs `{ success: true }` → "Logs exported successfully", `{ success: false, error: 'Disk full' }` → "Disk full"; crash test `{ success: true }` → "Crash reporting test sent", rejection → "Could not send crash reporting test".

  `ProfileScreen.layout.test.js` (new):
  - `identity block shows name, job title and initials`; `Assigned school row appears only with a school` (render once with `schoolName`, once without: `queryByLabelText(/Assigned school/)` null); `the Email row is one element named "Email, test@masinyusane.org"`.
  - `the footnote is plain, not italic`: flattened style of "Profile information is managed by administrators" has no `fontStyle: 'italic'`.
  - `section labels are headers`: `getByRole('header', { name: …})` for "Profile info", "Assessment capture", "Account & support", "Legal" (match the casing `SectionHeader` renders).
  - `Support tools toggles and reveals the three tools`: collapsed → `expanded: false`, subtitle "Share logs · Share database · Test crash reporting" (match with `\s` for NBSP), `queryByText('Share logs')` null; press → `expanded: true`, "Use when Masi support asks", the three rows present, `getByLabelText('Share database, sensitive')`; press again → collapsed.
  - `Change password opens the sheet`: press the row → "Current password" field present; Cancel → gone.
  - `password change succeeds through the screen`: open, fill, `fireEvent.press(getByTestId('change-password-submit'))`, resolve `{ error: null, phase: 'update' }` → "Password changed successfully"; reopen → empty fields.
  - `a password outcome after leaving Profile still arrives as a toast`: hold the deferred, `unmount` the screen, resolve → the toast host (rendered by the helper outside the screen) shows "Password changed successfully". If PR 1's helper mounts the toast host inside what `unmount` removes, render the screen as a child that a state flip removes instead.
  - `Legal rows are links that open the exact URLs`: `getByRole('link', { name: 'Terms & Conditions, opens in browser' })` → `Linking.canOpenURL` / `openURL` called with `'https://masinyusane.org/terms'`; Privacy → `'https://www.masinyusane.org/privacy'`; `canOpenURL` false → "Cannot open URL"; `openURL` rejects → "Failed to open Terms & Conditions" / "Failed to open Privacy Policy".
  - `Sign out is a quiet destructive pill`: the button's label text flattens to `color: colors.error`; with `signOutFlow.busy === 'signing_out'` (mock `useSignOutFlow` for this one test only) its `accessibilityState.busy === true`.
  - `the page has no keyboard avoiding view`: `UNSAFE_queryByType(KeyboardAvoidingView)` null while no sheet is open.

  `profileCaptureModeToggle.test.js` (rewrite, same three cases):
  - `loads and displays the stored grid capture mode`: `getByRole('radio', { name: 'Grid' })` → `accessibilityState.checked === true`; "Step-by-step" `checked === false`; `getByRole('radiogroup', { name: 'Assessment capture' })` exists.
  - `pressing Step-by-step saves the new capture mode`: `setCaptureMode` called with `CAPTURE_MODES.SEQUENTIAL`.
  - `reverts to the previous capture mode when saving fails`: Grid checked again after the rejection.

- [ ] **Step 2: Run and confirm they fail**

  Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/ProfileScreen.releaseMetadata.test.js __tests__/ProfileScreen.layout.test.js __tests__/profileCaptureModeToggle.test.js`

- [ ] **Step 3: Rewrite `ProfileScreen.js`**, set `title: 'Profile'` in `AppNavigator.js`, and delete the `ProfileScreen.js` ratchet line in `designSystemGuard.test.js`.

- [ ] **Step 4: Update the two integration tests' interactions** (no assertion changes):
  - `task5AuthRaces.test.js` has **five** test definitions that drive the inline password form, eight cases in all. Each one fills `UNSAFE_getAllByType(TextInput)` by index before any sheet exists and calls `UNSAFE_getAllByType(Button).find(node => node.props.children === 'Change Password').props.onPress()`, keeping its returned promise as `change` / `verification`. All five must be migrated; once the inline fields and the Paper button are gone, an unmigrated one fails before it reaches its auth barrier, and these are the tests that guard delayed password updates, sign-out persistence, account switching and the request timeout. Line numbers are from `feat/bold-red-app` at plan time; re-find them by name:
    1. `:305–355` `test.each` (3 cases) `delayed password %s and logout 503 cannot restore A after provider remount (%s)`: fill at `:326–327`, press at `:328`, `await change` in the release `act` and the `finally`.
    2. `:357–407` `Profile password change preserves the app session through revoke-others and token refresh`: fill `:394–395`, awaited press `:396`, then `getByText('Password changed successfully')`.
    3. `:409–441` `test.each([B, A])` (2 cases) `late Profile verification cannot replace the new handle for %s or update a password`: fill `:426–427`, press `:428` (as `verification`).
    4. `:577–607` `a late shared password update cannot publish A or show feedback after switching to B`: fill `:587–588`, press `:589`.
    5. `:609–647` `a never-settling password PUT cannot block sign-out then B beyond the request bound`: fill `:623–624`, press `:625`, under the file's fake timers (`AUTH_REQUEST_TIMEOUT_MS`).
  - The same mechanical change in each, with every barrier, transport mock, timer advance, `try/finally` and assertion kept exactly where it is:
    - **Open the sheet:** `fireEvent.press(view.getByRole('button', { name: 'Change password' }))` (only the row has that name before the sheet opens; after it opens, the submit button shares the text, which is why it has a `testID`).
    - **Fill by label:** `fireEvent.changeText(view.getByLabelText('Current password'), …)`, then `'New password'`, then `'Confirm new password'` (exact matches; the values are the test's existing three).
    - **Submit and keep the promise:** `change = fireEvent.press(view.getByTestId('change-password-submit'))`, then `expect(change).toBeInstanceOf(Promise)`. RNTL 13's `fireEvent` returns the handler's return value, so this works when the sheet passes its async `submit` straight to the button's `onPress` and `BrandButton` hands `onPress` to its `Pressable` unchanged (as `BrandButton.js:16` does today). If PR 1's `BrandButton` wraps `onPress` and drops the return value, make the wrapper `return onPress?.(event)` (Task 1, additive, with a `BrandButton.test.js` case). The `toBeInstanceOf` guard matters: `await undefined` would let every "no toast / no PUT after switching" assertion pass without the attempt ever settling. Definition 2's awaited press becomes `const change = fireEvent.press(…); await act(async () => { await change; });`. Everywhere else the existing `await change` / `await verification` lines stay.
    - **Toast host:** Profile's messages are toasts now, and `useToast()` throws outside a `ToastProvider` (`src/context/ToastContext.js`). Use the provider wrapping PR 1 gave `Tree` if it exists; otherwise give `Tree` the production shape from `App.js`: one `ToastProvider` around the whole `Tree` output (above the keyed `SignedInEAProvider`, so it survives the actor switch) and `<ToastActorScope handle={auth.handle}>` inside `SignedInEAProvider`. Placement is what makes the negative checks real: `Tree` unmounts the Profile subtree on sign-out, so a host inside that subtree would hide a stale toast instead of catching it.
    - Remove the now-unused `Button` (Paper) and `TextInput` imports only if no other test in the file uses them.
  - `task5ActionsBinding.test.js` "A saved Export Database confirmation never reads or shares B data" (`:63-80`): open Support tools, press "Share database", press "Export" for the first export (`shareAsync` once). For the saved confirmation, reopen the sheet, capture `view.UNSAFE_getByType(ExportDatabaseSheet).props.onExport` while it is open, then `view.unmount()`, switch to B, and `await act(async () => { await onExport(); })`. The assertions (`getReader` not called on B, `shareAsync` not called) stay.

- [ ] **Step 5: Run the screen, guard, navigator and integration tests**

  Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/ProfileScreen.releaseMetadata.test.js __tests__/ProfileScreen.layout.test.js __tests__/profileCaptureModeToggle.test.js __tests__/ChangePasswordSheet.test.js __tests__/signOutFlow.test.js __tests__/designSystemGuard.test.js __tests__/domainTextInputAudit.test.js __tests__/AppNavigator.headers.test.js`
  Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npm run test:integration -- __tests__/task5AuthRaces.test.js -t "password|Profile verification"`
  Expected: ten cases run and PASS. Eight are the migrated ones: the three `delayed password … after provider remount` cases, `Profile password change preserves the app session…`, the two `late Profile verification…` cases, `a late shared password update…` and `a never-settling password PUT…`. The other two, `sign-in does not wait for a password update…` and `A password response between B storage commit…`, also match the filter; they render `Tree` without Profile and call `auth.changePassword` directly, so they must pass unchanged. Record the case list in the build log.
  Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npm run test:integration -- __tests__/task5AuthRaces.test.js __tests__/task5ActionsBinding.test.js`
  Expected: PASS, the whole files.

- [ ] **Step 6: Commit**

  ```bash
  git add src/screens/main/ProfileScreen.js src/navigation/AppNavigator.js __tests__/designSystemGuard.test.js __tests__/ProfileScreen.releaseMetadata.test.js __tests__/ProfileScreen.layout.test.js __tests__/profileCaptureModeToggle.test.js __tests__/task5AuthRaces.test.js __tests__/task5ActionsBinding.test.js __tests__/AppNavigator.headers.test.js
  git commit -m "feat(profile): compact Bold Red Profile with support tools, export sheet and toasts"
  ```

  (Stage `AppNavigator.headers.test.js` only if it changed.)

---

### Task 7: Restyle the sign-out sheets

**Files:**
- Modify: `src/components/profile/SignOutSheets.js`
- Modify: `__tests__/designSystemGuard.test.js` (delete the `SignOutSheets.js` ratchet line)
- Test: `__tests__/SignOutSheets.style.test.js` (new); `__tests__/signOutFlow.test.js` **unchanged**

**Interfaces:**
- Consumes: `BrandButton`, `InlineNote`, `BottomSheet`.
- Produces: `SignOutSheets` props unchanged (`step, unsentCount, busy, message, isOnline, clockOutNow, stayClockedIn, tryUploadNow, recheck, signOutAnyway, cancel`). Titles, subtitles, `dismissLabel`s, `scrollable={false}`, `keyboardAvoiding={false}`, `maxHeight={520}` and every label computation stay exactly as today.

Restyle (overview §4 S4; part 5 "Sign-out sheets"):
- Body: buttons start 24 below the last text, 12 apart (`gap: spacing.ms`).
- Clocked-in sheet: `message` → `InlineNote tone="warning" size="md"`; "Clock out now" → `BrandButton variant="primary"` with `label={clockOutLabel}`, `accessibilityLabel={clockOutLabel}`, `loading={busy === 'clocking_out'}`, `disabled={isBusy}`; "Stay clocked in and sign out" → `variant="secondary"`, `disabled={isBusy}`; "Cancel" → `variant="tertiary" tone="ink"`.
- Unsent sheet: upload → `variant="secondary" icon="cloud-upload-outline"`, `label={unsentActionLabel}`, `accessibilityLabel={unsentActionLabel}`, `loading={busy === 'uploading'}`, `disabled={uploadDisabled}` (the label already reads "Uploading…"; pass no `loadingLabel`); "Sign out anyway" → `variant="destructive" icon="log-out-outline"`, `disabled={isBusy}`; "Cancel" → `tertiary` `ink`.
- Delete the local `StyleSheet` button and warning styles.

- [ ] **Step 1: Write the failing style test** (render `SignOutSheets` directly with `SafeAreaProvider` + `PaperProvider`, like `signOutFlow.test.js`)

  - `clocked-in sheet uses the primary, secondary and ink buttons`: `step="clocked_in"`, `busy={null}` → "Clock out now"'s button flattens to `backgroundColor: colors.primary`; "Stay clocked in and sign out" has `backgroundColor: colors.surface` and `borderColor: tints.control`; "Cancel"'s label `color: colors.text`.
  - `the clocked-in warning is a warning note`: `message="Couldn't clock out. Try again, or choose another option."` → the text flattens to `color: colors.warningText` and its container to `backgroundColor: colors.warningBg`.
  - `unsent sheet's confirming tap is the filled error button`: `step="unsent"`, `unsentCount={2}` → "Sign out anyway" `backgroundColor: colors.error`, label `color: colors.onDark`.
  - `disabled pills look disabled`: `isOnline={false}` → the "No connection" button has `accessibilityState.disabled === true` and `BrandButton`'s disabled style (part 5 wants a `colors.border` fill with a `colors.disabled` label; if PR 1's disabled `secondary` differs, assert what it applies and record the gap in the build log rather than forking the button).
  - `busy upload shows one spinner and keeps its name`: `busy="uploading"` → `getByRole('button', { name: 'Uploading…' })` disabled, `UNSAFE_getAllByType(ActivityIndicator)` length 1.

  Match style assertions to the token values `BrandButton` actually applies (read them from `BrandButton.js`); the point is that each sheet button is the right variant.

- [ ] **Step 2: Run and confirm the style test fails**

  Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/SignOutSheets.style.test.js`

- [ ] **Step 3: Restyle `SignOutSheets.js`** and delete its ratchet line.

- [ ] **Step 4: Run the style test, the unchanged flow test and the guard**

  Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/SignOutSheets.style.test.js __tests__/signOutFlow.test.js __tests__/ProfileScreen.releaseMetadata.test.js __tests__/designSystemGuard.test.js && git diff --exit-code -- __tests__/signOutFlow.test.js src/hooks/useSignOutFlow.js`
  Expected: PASS and no diff in the two frozen files.

- [ ] **Step 5: Commit**

  ```bash
  git add src/components/profile/SignOutSheets.js __tests__/SignOutSheets.style.test.js __tests__/designSystemGuard.test.js
  git commit -m "style(profile): Bold Red sign-out sheets (behaviour and copy unchanged)"
  ```

---

### Task 8: Standing docs and build log

**Files:**
- Modify: `documentation/design-system.md`, `documentation/build-log.md`, `documentation/ROADMAP.md`, `PRD.md`
- Modify `CONTEXT.md` only if a term changed (none is expected; say so in the build-log row)
- Modify `documentation/LEARNING.md` only if C11 landed in this PR

- [ ] **Step 1: `documentation/design-system.md`**: add, where PR 1 documented the primitives: the settings-list pattern (read-only rows, the disclosure row with `expanded` and its nested panel, the `titleAccessory` Sensitive badge, the trailing-glyph rule from part 5); the password sheet pattern (fixed header and footer, scrolling body, `computeScrollTarget`); and the `BottomSheet` keyboard contract (padding behaviour on both platforms, wrapper fills the overlay, 4dp bottom padding while the keyboard is up, `footerStyle`).
- [ ] **Step 2: `PRD.md`**: in §6.1 replace "Allow password change and explicit sign-out." with "Allow password change (a bottom sheet with inline errors; an outcome after the sheet closes arrives as a message) and explicit sign-out."; in §6.11 change "warn that exports can contain sensitive child/session/assessment data;" to "warn, in a confirmation sheet before export, that exports can contain sensitive child/session/assessment data;".
- [ ] **Step 3: `documentation/ROADMAP.md`**: in §5 "Bold Red for the rest of the app", remove Profile from "Remaining". Leave §0's "BackMy Profile" item for Task 10 to tick once verified on the device.
- [ ] **Step 4: `documentation/build-log.md`**: Verification Register rows for each task's focused tests and the Task 9 full suites (commands and counts); Decision Register rows for (a) an abandoned password attempt reports by toast, including after leaving Profile, (b) the keyboard-up 4dp sheet padding, (c) the `ListRow` / `BrandButton` / `BottomSheet` additive props, (d) whether C11 landed here or in PR 1; a Bug and Gap row for C11 if it was reproduced here.
- [ ] **Step 5: Commit**

  ```bash
  git add documentation/design-system.md documentation/build-log.md documentation/ROADMAP.md PRD.md
  git commit -m "docs(profile): design system, PRD, roadmap and build log for the Bold Red Profile"
  ```

  (Add `CONTEXT.md` / `documentation/LEARNING.md` only if changed.)

---

### Task 9: Final verification and branch review

- [ ] **Step 1: Full unit suite**

  Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest`
  Expected: PASS. Record suites/tests in the build log.

- [ ] **Step 2: Full integration suite**

  Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npm run test:integration`
  Expected: PASS. Record the counts.

- [ ] **Step 3: Guards and frozen files**

  Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/designSystemGuard.test.js __tests__/paperTheme.test.js __tests__/colors.test.js __tests__/contrast.test.js __tests__/typography.test.js __tests__/domainTextInputAudit.test.js`
  Run: `git diff --exit-code feat/bold-red-complete -- __tests__/signOutFlow.test.js src/hooks/useSignOutFlow.js src/context/AuthContext.js src/utils/debugExport.js src/services/deviceSettings.js src/services/observability.js`
  Run: `grep -nE "Alert|Snackbar|SegmentedButtons|KeyboardAvoidingView|fontWeight|#[0-9A-Fa-f]{3,8}\b" src/screens/main/ProfileScreen.js src/components/profile/*.js`
  Expected: guards PASS; no diff; the grep prints nothing.

- [ ] **Step 4:** Run `/codex:adversarial-review --base feat/bold-red-complete`; fix accepted findings (each fix with a test, committed), record dispositions in the build log, and rerun only if the round's catches were material.

- [ ] **Step 5: Commit** the build-log rows from Steps 1–4.

  ```bash
  git add documentation/build-log.md
  git commit -m "docs(build-log): Profile PR verification and review"
  ```

---

### Task 10: Device gate (manual, Jim; EAS preview build of this PR)

Build a cloud EAS preview for iOS and Android (sqlite backend is the default; a new build needs Jim's yes). Check on an iPhone and the Galaxy A03s (360dp via `wm size` / `wm density 320`, plus a 411dp phone):

- [ ] Page top and end against `red-profile-p1-compact` and `red-profile-final` (top); Support tools open against `red-profile-p1-support-open`.
- [ ] Password sheet, keyboard up, against `red-profile-p2-password-sheet` on both platforms; each error state (`-s-password-error`, `-s-password-verify` offline) and loading (`-s-password-loading`) inside the sheet; the success toast.
- [ ] 360×640, keyboard up: "next" through each field (Current → New → Confirm with the keyboard's Next key, no taps); each focused field and its error are fully visible and "Change password" stays above the keyboard; repeat at font scale 1.3.
- [ ] Dismiss the password sheet mid-request (airplane mode to stall it, then reconnect): the outcome arrives as a toast; reopening starts empty.
- [ ] **C11 "no double lift":** Create class → School search sheet on the A03s and the iPhone: the search field sits just above the keyboard, not lifted twice.
- [ ] Export database sheet; the OS share sheet opens after Export; the toast clears the home indicator (iOS), gesture bar and 3-button navigation (Android).
- [ ] Sign-out: clocked-in sheet with and without its warning; unsent online, offline ("No connection" disabled), uploading, and unknown count ("Try again").
- [ ] Largest iOS text and One UI 1.3: nothing truncated; the Sensitive badge wraps under its title at 360dp; segments, pills and rows grow; release lines wrap at the " · " separators.
- [ ] Android Back closes each sheet; TalkBack and VoiceOver read the radio state, Support tools' expanded state, busy rows and error notes.
- [ ] Profile reached from the Home settings button; Back returns to Home; the Android header shows a single back control and "Profile" (closes ROADMAP §0 "BackMy Profile": tick it).
- [ ] Home row: Home is pixel-identical to the previous build.
- [ ] Record results and screenshots in `documentation/build-log.md` and commit (`docs(build-log): Profile device gate`).

---

## Codex plan review (2026-10-19)

Adversarial review of this plan (verdict: needs-attention); both findings accepted and checked against the code.

1. **[medium] Three password-test definitions left unmigrated (Task 6).** Confirmed: `__tests__/task5AuthRaces.test.js` has five definitions (eight cases) that fill `TextInput`s by index and call the Paper `Change Password` button's `onPress`, not two (`:305–355` ×3, `:357–407`, `:409–441` ×2, `:577–607`, `:609–647`). Step 4 now inventories all five, prescribes one mechanical migration (open the sheet by its row, fill by label, `fireEvent.press` the `change-password-submit` button and keep its returned promise, guarded by `toBeInstanceOf(Promise)`), keeps every barrier and assertion, and adds the `ToastProvider` / `ToastActorScope` shape `Tree` needs now that `useToast()` throws without a provider (placed above the keyed subtree so the "no feedback after switching" checks stay meaningful). Step 5's integration gate now runs the password cases by name and records them, then both files whole.
2. **[medium] Focus on an already-measured field did not scroll (Task 5).** The old rule scrolled only from a block's next `onLayout`, which a focus change does not fire. Task 5 now caches block, viewport and scroll measurements and calls `ensureVisible` immediately on focus, keeps a pending block when measurements are missing or an error changes a block's height, and retries on that block's layout or any viewport layout (the keyboard shrinking the sheet). Four component tests pin it: Next-key focus of New and Confirm with no further layout events (exact `scrollTo` targets), focus before measurement, viewport shrink, and an error that grows its block. `TextField` gains an `onFocus`/`onBlur` passthrough if PR 1 lacks one. The Task 10 device row now names the Next-key path.

