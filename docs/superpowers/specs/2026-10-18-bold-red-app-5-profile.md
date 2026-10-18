# Bold Red app, part 5: Profile

**Status:** draft for Jim's review, 2026-10-18. Part of the Bold Red app spec; read the overview first:
[`2026-10-18-bold-red-app-design.md`](./2026-10-18-bold-red-app-design.md). Where this part and the overview's
"System decisions" disagree on a component name, path, token, type role or cross-screen rule, the overview wins.

## Profile

**Boards (target):** `red-profile-p1-compact` (page, drawn at its scroll end; content starts 20dp
under the header, as in `red-profile-final`), `red-profile-p1-support-open` (Support tools open),
`red-profile-p2-password-sheet` (Change password sheet, keyboard up). States applied **inside the
sheet**: `red-profile-s-password-error`, `-s-password-verify`, `-s-password-loading`. Other states:
`red-profile-s-export-database`, `red-profile-s-exporting-toast`. Sign-out sheets: restyle only, to
the language of `red-profile-p3-signout-unsynced` / `red-profile-p4-signout-confirm`. Visual
fallback where the compact boards are silent: `red-profile-final`, `-final-2`,
`red-profile-components`, `red-flow-11-profile` (identical to `-final`). Not built:
`red-profile-v-illustrated`, components-board variants B/C, the key/value colophon option.

**Code:** `src/screens/main/ProfileScreen.js` (583 lines, one file), `src/components/profile/SignOutSheets.js`,
`src/hooks/useSignOutFlow.js` (unchanged), `src/components/common/BottomSheet.js`,
`changePassword` in `src/context/AuthContext.js:231` (unchanged), `src/utils/debugExport.js`,
`src/services/observability.js`, `src/utils/releaseMetadata.js`, `src/utils/runtimeDiagnostics.js`,
`src/services/deviceSettings.js` (capture mode). Header options: `src/navigation/AppNavigator.js:173`.

**No new data. No schema, RLS, payload or outbox change.** Every value on the boards already exists:
name, job title and school from `profile` (`SignedInEAContext` → `normalizeProfile`), email from
`user`, release facts from `getReleaseMetadata()` / `getRuntimeDiagnostics()`, capture mode from
`deviceSettings`. `documentation/rls-sync-contract-map.md` is not touched.

### Function map: nothing is lost

| Today (card → control) | Compact layout | Behaviour |
|---|---|---|
| Profile Information → Name | Identity block heading | unchanged source (`first_name last_name`) |
| Profile Information → Job Title | Identity block sub-line | unchanged source (`jobTitleName`) |
| Profile Information → Email | **Profile info** group, row 1 | unchanged |
| Profile Information → Assigned School (only if `schoolName`) | **Profile info** group, row 2 (only if `schoolName`) | unchanged |
| "Profile information is managed by administrators" | footnote under Profile info | unchanged copy |
| Assessment capture → Grid / Step-by-Step | **Assessment capture** segmented control | unchanged: optimistic set, revert on save failure, reload on focus (`CaptureModeFocusLoader`) |
| Debug & Support → Share Logs | **Account & support** → Support tools → Share logs | unchanged handler and messages |
| Debug & Support → Share Database (Contains Sensitive Data) | Support tools → Share database + "Sensitive" badge | `Alert.alert` confirm becomes the Export database sheet; export unchanged |
| Debug & Support → Test Crash Reporting | Support tools → Test crash reporting | unchanged |
| Change Password card (3 fields, Show/Hide, button) | **Account & support** → Change password row → sheet | validation and `changePassword` unchanged; errors move from Snackbar to inline (approved via the state boards) |
| Legal → Terms & Conditions, Privacy Policy | **Legal** group, 2 rows | unchanged URLs and messages |
| Version / Backend / Project / Device / Update (5 lines) | App release info, 3 centred lines, same 5 facts | unchanged sources |
| Sign Out button | Sign out button | `signOutFlow.start`, unchanged |
| `SignOutSheets` (clocked-in, unsent) | same two sheets, restyled | `useSignOutFlow` unchanged |
| Snackbar (all messages) | Toast (shared) | same strings, same 4 s |

### Visual spec

All measurements are dp at 390 wide; layout is flow-based. Colours are tokens (map below).
Side gutter 24 (`spacing.lg`). The page scrolls under a fixed header.

#### Header (shared look)
- Uses the app-wide Bold Red stack header from the shared-look PR: canvas (`background`) fill,
  44×44 white back circle with a 1.5dp `text + '33'` edge and a 22dp ink chevron, title in the
  display font 28/32 ls −0.56, ink, left-aligned, 12 gap, and a 1dp `text + '1F'` hairline at the
  bottom. Header height = top safe inset + 56.
- **Title copy changes from "My Profile" to "Profile"** (board). Back label "Back".
- This replaces the native header and its "Back" text button, which also closes the Android
  "BackMy Profile" item in ROADMAP §0.

#### Identity block (not tappable)
- 20 below the header hairline. Row, `alignItems: center`, gap 16.
- Avatar 64×64, radius 32, `red50` fill, initials `red700`, Figtree 800 (`fontFamilies.textHeavy`)
  22/28, ls 0.44, `maxFontSizeMultiplier={1.2}`. Initials = first letter of `first_name` +
  first letter of `last_name`, upper-cased; one name gives one letter. Decorative
  (`accessibilityElementsHidden`, `importantForAccessibility="no-hide-descendants"`).
- Name: display 24/28 ls −0.48, ink, wraps (never truncates); a two-line name keeps the avatar
  vertically centred on the text block. `accessibilityRole="header"`.
- Job title: Figtree 500 15/22, `textSecondary`, 2 below the name. Omitted if `jobTitleName` is null.
- **Profile not loaded yet** (`profile === null`: first sign-in offline with no cached profile, or the
  moment before the cache read resolves): the heading shows `user.email`, the avatar shows a 28dp
  `person-outline` glyph in `red700`, and the job-title line is omitted. Today this state renders a
  blank name; nothing else on the page depends on `profile`.

#### Section rhythm and groups (shared pieces)
- Sections are 32 apart; the first section is 32 below the identity block.
- **Section label:** Figtree 800 12/16, ls 0.96, upper-case, `textSecondary`,
  `accessibilityRole="header"`. Group starts 12 below (a helper line, when present, sits 4 below the
  label and the group 12 below the helper).
- **Group:** `surface`, 1dp `text + '1F'` border, radius 18 (`borderRadius.lg`), `overflow: hidden`.
  No shadow.
- **Row:** min height 64, padding 10 vertical / 16 horizontal, gap 12. Lead: `IconTile` 40×40,
  radius 14 (`borderRadius.md`), `background` fill, ink icon 20. Hairline between rows: 1dp `border`,
  inset 68 from the left, flush right, not under the last row. Pressed: `text + '0F'` fill (no
  scale inside a group).
  - Action row: title Figtree 700 16/22 ink, wraps; optional sub-line `textCaption` (13/18)
    `textSecondary`, 2 below; trailing 20dp glyph.
  - Read-only row: caps label (`textLabel` 11/14, `textSecondary`) over the value (Figtree 700
    16/22 ink, 2 below; long emails wrap). No trailing glyph; not pressable; one accessible element
    "{label}, {value}".
- **Trailing glyph rule** (components board §03): chevron-forward only for something that opens
  inside the app; chevron-down/up for the disclosure; share for the OS share sheet; send for the
  crash test; open-external for the browser. Glyphs `textSecondary`, except the open disclosure's
  chevron-up, which is ink.

#### Profile info
- Section label "Profile info". Rows: "Email" (mail icon) → `user.email`; "Assigned school"
  (school icon) → `profile.schoolName`, only when present (as today).
- Footnote 10 below the group: 16dp lock glyph `textSecondary` (1dp top offset), gap 6, then
  `textCaption` `textSecondary` "Profile information is managed by administrators". Not italic
  (today it is italic).

#### Assessment capture
- Section label "Assessment capture"; helper `textCaption` `textSecondary` "How you mark each item
  during an EGRA assessment." 4 below; control 12 below the helper.
- **`SegmentedControl` (new, shared with Record's Children | Groups):** height 44 (min, grows with
  text), radius 999, `surface` track with a 1.5dp `text + '33'` inner edge. Each segment is a full
  half-width button. Selected: ink thumb inset 4.5 on all sides, radius 999, label white Figtree 800
  15/20. Unselected: label ink Figtree 700 15/20 (`textBodyStrong`). Segments: "Grid" |
  "Step-by-step" (copy change: was "Step-by-Step").
- A11y: container `accessibilityRole="radiogroup"`, label "Assessment capture"; segments
  `accessibilityRole="radio"`, `accessibilityState={{ checked }}`. Replaces Paper
  `SegmentedButtons` (which is purple-themed and uses Muted-on-Line, 4.22:1).

#### Account & support
Section label "Account & support". One group, two rows:

1. **Change password**: lock tile, title "Change password", chevron-forward. Opens the Change
   password sheet. `accessibilityRole="button"`, label "Change password".
2. **Support tools** (disclosure): lifebuoy tile, title "Support tools", trailing chevron-down
   (`textSecondary`). Collapsed sub-line: "Share logs · Share database · Test crash reporting",
   with non-breaking spaces inside each name so it wraps only at the separators. Open: sub-line
   becomes "Use when Masi support asks" (new copy, from the board), chevron becomes chevron-up in
   ink. `accessibilityRole="button"`, label "Support tools",
   `accessibilityState={{ expanded }}`. Collapsed on every visit (state not persisted).
   - **Nested panel** (open only): `background` fill, 1dp `border` top edge. Rows min height 56,
     padding 8 top/bottom, 68 left, 16 right, gap 12. Lead: bare 20dp ink icon in a 24-wide column
     (no tile). Title `textBodyStrong` (15/20) ink. Hairline 1dp `border` inset 104, not under the
     last row.
   - "Share logs": document icon, share glyph. Runs `handleShareLogs` unchanged.
   - "Share database" + **Sensitive badge** (height 22, padding 0 8, radius 999, `warningBg` fill,
     `warningText` Figtree 800 12/16; the title row wraps, so the badge drops below the title when
     the line is full, which happens at 360dp even at normal size). Database icon, share glyph.
     Opens the Export database sheet. Label "Share database, sensitive".
   - "Test crash reporting": bug icon, send glyph. Runs `handleSendObservabilityTest` unchanged.
   - **Busy row** (export or crash test running): a 20dp `ActivityIndicator` (`textSecondary`)
     replaces the trailing glyph; the row is disabled with `accessibilityState={{ busy: true,
     disabled: true }}`. The other two rows stay usable (keeps today's independence of the two
     exports). Collapsing the panel during a run is allowed; the result still arrives as a toast.

#### Legal
- Section label "Legal". Rows "Terms & Conditions" (document tile) and "Privacy Policy"
  (shield-check tile), trailing open-external glyph. `accessibilityRole="link"`, labels
  "Terms & Conditions, opens in browser" / "Privacy Policy, opens in browser". Handlers and URLs
  unchanged (`https://masinyusane.org/terms`, `https://www.masinyusane.org/privacy`).

#### App release info (keep; ROADMAP §0)
- 24 below the Legal group. Centred, `textCaption` `textSecondary`, `fontVariant:
  ['tabular-nums']`, three lines, each wrapping:
  1. "Version {version} (Build {build || '?'}) · Backend {supabaseTarget}"
  2. "Project {supabaseProjectId}"
  3. "Device {modelName || 'Unknown'} · {osName || Platform.OS} {osVersion || Platform.Version} · Update {update.id || 'Embedded'}"
- Same five facts and fallbacks as today (`ProfileScreen.js:462-477`). The board writes the device
  as "Galaxy A15 · Android 14"; the code joins OS name and version with a space, which matches.
  Non-breaking spaces inside each fact so lines wrap at " · "; an OTA update UUID may wrap inside
  itself.

#### Sign out button
- 16 below the release info. Full width, height 56 (min), radius 999, `surface` fill, 1.5dp
  `text + '33'` edge, 20dp `log-out-outline` icon + "Sign out" in `error`, Figtree 800 17/20, gap 8.
  Copy change: "Sign Out" → "Sign out". While `signOutFlow.busy === 'signing_out'`: a 20dp
  `error`-coloured spinner replaces the icon, `accessibilityState={{ busy: true }}`.
- Content bottom padding: 40 + bottom safe inset.

#### Change password sheet (approved proposal p2, with the s-password-* states)

Built on the restyled `BottomSheet` (shared look: top radius 22, `surface`, `shadows.sheet`,
handle 36×4 radius 2 `text + '33'` 8 below the top edge, backdrop `heroDark + '7A'` (48%), 24
gutters). A new `ChangePasswordSheet` component owns the form state that lives in `ProfileScreen`
today.

Layout, top to bottom:
- **Title** "Change password", display 24/28 ls −0.48, ink, 10 below the handle area. Wraps at
  large text.
- **Show passwords toggle** directly under the title: 18dp eye icon + "Show passwords" (eye-off +
  "Hide passwords" when shown), `red600` Figtree 800 14/20, gap 6; 44dp touch target via `hitSlop`
  so it takes no extra vertical space. Toggles `secureTextEntry` on all three fields, as today.
  `accessibilityRole="button"`, label = the visible text.
- **Fields** 16 below, 12 apart. `TextField` (the shared field from the Login section): min height
  60, radius 14, `surface`, padding 0 16, gap 12; 22dp lock glyph; caps label (`textLabel`
  `textSecondary`) over the value, gap 2. Value: masked 20/24 ls 2.8 in the system font (Figtree's
  bullet is not used); unmasked or placeholder Figtree 500 17/22 (placeholder `textSecondary`).
  - Labels: "Current password", "New password", "Confirm new password" (copy change: sentence case).
  - Placeholders (empty field): "Enter current password", "Enter new password", "Re-enter new
    password".
  - Rest: 1.5dp `text + '33'` edge. Focused: 2dp ink edge plus a 4dp `text + '0F'` halo.
    Error: 2dp `error` edge, `error` glyph and label.
  - `autoCapitalize="none"`, `autoCorrect={false}`; `textContentType` / `autoComplete`:
    `password`/`current-password` on Current, `newPassword`/`new-password` on New and Confirm.
    Return key "next" moves Current → New → Confirm; "done" on Confirm submits (same path as the
    button).
- **Field-level error** (only these three, one at a time, in check order), 8 below the field it
  names: `ErrorNote` (radius 9, padding 8/12, `errorBg`, 16dp `warning-outline` `error` glyph, gap 8,
  Figtree 700 13/18 `error`):
  - New: "New password must be at least 8 characters" (length < 8)
  - Confirm: "New passwords do not match"
  - Current: "Current password is incorrect" (verification phase, `isInvalidCredentialsError`)
- **Hint** 8 below the fields: 16dp info glyph + `textCaption` `textSecondary` "Password must be at
  least 8 characters". Always shown.
- **Form-level error** 12 below the hint (above the pinned footer), same `ErrorNote`, no field
  turned red:
  - "All password fields are required" (any field empty)
  - "Could not verify your current password. Check your connection and try again." (verification
    phase, not invalid credentials; must never paint Current as wrong)
  - update phase: `error.message || 'Failed to change password'`
- **Pinned footer** (outside the scroll area): padding 16 top, 24 sides, 4 bottom (+ bottom safe
  inset when the keyboard is down). "Change password" 56dp pill, `red600` fill, white Figtree 800
  17/20, `shadows.primaryButton`; 8 gap; "Cancel" 44dp text button, ink Figtree 800 16/20.

States:
- **Validation order and checks are today's** (`ProfileScreen.js:194-243`): required → length →
  match → verify → update, with every `handle.isCurrent()` / `isStaleActorError` guard kept. A stale
  result shows nothing.
- **Loading** (`passwordLoading`): fields `editable={false}`, `border` fill, transparent edge,
  `disabled` glyph and value, label stays `textSecondary`. Button keeps `red600`, shows an 18dp white
  spinner beside "Change password", `accessibilityState={{ busy: true, disabled: true }}`, ignores
  taps. The Show passwords toggle stays usable.
- **Errors clear:** a field-level error clears when its field is edited; the form-level error
  clears when any field is edited; all errors clear on the next submit.
- **Success:** the sheet closes, fields and errors reset, toast "Password changed successfully"
  (success). Today's "fields clear on success" holds.
- **Dismissal** (Cancel, backdrop, Android Back) is always allowed, including during loading (the
  request has no timeout, so blocking dismissal could trap the EA). Dismissing clears all three
  fields, all errors and resets Show passwords to hidden; reopening starts empty. If the request was
  still running, its outcome is reported as a toast instead (success, or the same error string as
  an error toast); a stale outcome shows nothing.
- **Opening:** Current password is focused on open (the board shows the keyboard up).
- **Offline:** no pre-check (unchanged). Verification fails and shows the form-level
  "Could not verify…" message (`-s-password-verify`).

**Keyboard and small phones.**
- Today `BottomSheet` only avoids the keyboard on iOS (`behavior` is `undefined` on Android), and
  the app runs **edge-to-edge on Android** (`app.config.js:52`), so the window no longer resizes for
  the keyboard. A text-entry sheet would sit under the keyboard on Android. **Fix at the root in
  `BottomSheet`:** `behavior="padding"` on both platforms, and the keyboard-avoiding wrapper fills
  the overlay (`flex: 1`, `justifyContent: 'flex-end'`, top padding = top safe inset + 8) so the
  sheet's `maxHeight: '100%'` resolves against the space actually left above the keyboard. Flexbox
  anchoring stays (the 2026-07-22 Portal rule). Device-check the existing School search sheet for a
  double lift.
- Header (handle, title, toggle) and footer (button, Cancel) are fixed; only the fields, hint and
  form error scroll (`keyboardShouldPersistTaps="handled"`). On focus, and when an error appears,
  the body scrolls so the focused field plus its error (or the form error) is fully visible.
- 390×844, keyboard 336: everything fits without scrolling (board p2).
- 360×800, keyboard ~300: everything fits.
- 360×640, keyboard ~290: about 326dp remain; header ~90 + footer ~128 leaves ~108dp of body, so one
  field plus its error is visible at a time and the body scrolls. The submit button stays visible
  above the keyboard. At font scale 1.3 the body shrinks to ~90dp, still one full field.

#### Export database sheet (`-s-export-database`; replaces `Alert.alert`)
- `BottomSheet`, not scrollable, no keyboard. Title row (20 below the handle area, wraps, gap 10):
  "Export database" display 24/28 + the Sensitive badge. Body 6 below: Figtree 500 15/22
  `textSecondary` "This will export all local data including sensitive information. Only share with
  Masi support staff." (today's Alert message, verbatim).
- Buttons 24 below, 12 apart: "Export" 56dp pill, `error` fill, white Figtree 800 17/20 (the code
  marks this action destructive); "Cancel" 44dp text button, ink.
- Export: closes the sheet, then runs today's export (`exportDatabase({ handle })`); the Share
  database row shows busy; results arrive as toasts with today's strings ("Database exported
  successfully", `result.error || 'Failed to export database'`, "Failed to export database").
  Cancel / backdrop / Back: closes, no export.
- Title copy change: "Export Database" → "Export database".

#### Toasts (shared; replaces the screen-local Snackbar, ROADMAP §5 `SnackbarContext`)
- Ink (`text`) surface, radius 18, min height 56, padding 8 top/bottom, 16 left, 4 right, gap 12,
  `shadows.toast`. Inset 24 left/right, bottom = bottom safe inset + 8.
- Status disc 24, radius 12: success = `success` fill + white 14dp check; error = `errorBg` fill +
  14dp `error` glyph. Message Figtree 700 15/20 white, wraps. "Dismiss": 44dp high, 12 horizontal
  padding, white Figtree 800 14/20, underlined.
- Error toasts announce assertively, success politely. 4000 ms, as today.
- Profile's strings, all unchanged: "Logs exported successfully", `result.error || 'Failed to export
  logs'`, "Failed to export logs", "Database exported successfully", "Failed to export database",
  "Crash reporting test sent", `result.error` (crash test failure), "Could not send crash reporting
  test", "Cannot open URL", "Failed to open Terms & Conditions", "Failed to open Privacy Policy",
  "Password changed successfully". Password **errors** no longer use a toast (inline in the sheet),
  except an outcome that arrives after the sheet was dismissed.

#### Sign-out sheets (restyle only; `useSignOutFlow` and every string unchanged)
Copy stays as today (ROADMAP §0 marks it provisional pending a wording pass with Jim; see Questions).
Both sheets pick up the restyled `BottomSheet` (display title 24/28 ink; subtitle Figtree 500 15/22
`textSecondary` 6 below; 24 gutters; buttons start 24 below the last text, 12 apart).

- **Clocked-in sheet** ("You're still clocked in."):
  - Warning message (when set): radius 9, padding 8/12, `warningBg`, 16dp `warning-outline`
    `warningText` glyph, Figtree 700 13/18 `warningText` (today 12/18, raw 600).
  - "Clock out now" / "Clocking out…": 56dp pill, `red600` fill, white Figtree 800 17/20 (today
    `primary` fill: white on `#E72D4D` is 4.30:1 and fails; `red600` is 5.64:1).
  - "Stay clocked in and sign out": 56dp pill, `surface`, 1.5dp `text + '33'` edge, ink Figtree 800
    17/20 (today: amber outline, `warningText` 13).
  - "Cancel": 44dp ink text button.
- **Unsent sheet** ("{n} items haven't uploaded yet." / unknown-count message):
  - Upload action ("Try uploading now" / "Uploading…" / "No connection" / "Try again"): 56dp pill,
    `surface`, 1.5dp `text + '33'` edge, 20dp `cloud-upload-outline` + ink label; `textSecondary`
    spinner while uploading; disabled offline.
  - "Sign out anyway": 56dp pill, `error` fill, white label + 20dp `log-out-outline`. This is the
    components board's rule: the confirming tap inside a risky sheet is the filled error button.
  - "Cancel": 44dp ink text button.
- Disabled pills: `border` fill, no edge, `disabled` label. Busy pills: `accessibilityState={{
  busy: true }}`, as today.
- Not built (behaviour or copy changes): p4's plain "Sign out?" confirm, p4's account block and
  "You will need an internet connection to sign in again.", p3's "Sign out?" title, status row and
  "Sync now" link.

### Colour map (every board hex → token)

| Board | Token | Use |
|---|---|---|
| `#F8F5F4` | `background` | page, header, icon tiles, nested panel |
| `#FFFFFF` | `surface` | groups, fields, sheet, Sign out pill, segmented track |
| `#221A1B` | `text` | titles, values, icons, segmented thumb, toast |
| `#76696B` | `textSecondary` | labels, captions, trailing glyphs, release info |
| `#ECE5E4` | `border` | row hairlines, nested panel edge, disabled field / pill fill |
| `rgba(34,26,27,.12)` | `text + '1F'` | group edge, header hairline (Home's convention) |
| `rgba(34,26,27,.20)` | `text + '33'` | field, segmented, pill and back-button edges; sheet handle |
| `rgba(34,26,27,.06)` | `text + '0F'` | focus halo, pressed row fill |
| `rgba(28,21,23,.48)` | `heroDark + '7A'` | sheet backdrop (today raw `rgba(0,0,0,0.5)`) |
| `#FDECEF` / `#A4182F` | `red50` / `red700` | avatar |
| `#C81F3E` | `red600` | Show passwords, sheet primary button, Clock out now |
| `#B3261E` / `#FCEAE8` | `error` / `errorBg` | Sign out text, Export / Sign out anyway fill, error notes and field error, error toast disc |
| `#FFF8E1` / `#8A4B00` | `warningBg` / `warningText` | Sensitive badge, clocked-in warning |
| `#B3A8A8` | `disabled` | disabled field glyph and value, disabled pill label |
| `#3FA535` | `success` | success toast disc |
| `rgba(58,36,36,.10)`, 0 −8, blur 24 | **new `shadows.sheet`** | sheet |
| `rgba(34,26,27,.24)`, 0 12, blur 28 | **new `shadows.toast`** | toast |
| `rgba(200,31,62,.22)`, 0 10, blur 22 | **new `shadows.primaryButton`** | filled red600 pill |

No new colour token. The three shadows are new and update `__tests__/colors.test.js` (it pins
`shadows` exactly); they belong to the shared-look PR.

### Type roles

Existing `typeRoles`: `textLabel` (row caps labels, field labels), `textBodyStrong` (nested row
titles, unselected segment), `textCaption` (captions, helper, hint, release info), `textButton`
(selected segment, Figtree 800 15/20). New roles needed (names are proposals for reconciliation):

| Proposed role | Spec | Profile use |
|---|---|---|
| `displayL` | Bricolage 800 28/32, ls −0.56 | header title (shared look) |
| `displayTitle` | Bricolage 800 24/28, ls −0.48 | identity name, sheet titles |
| `textLead` | Figtree 500 15/22 | job title, sheet subtitles |
| `textRowTitle` | Figtree 700 16/22 | group row titles and read-only values |
| `textSection` | Figtree 800 12/16, ls 0.96, upper-case | section labels |
| `textInput` | Figtree 500 17/22 | field value (unmasked) and placeholder |
| `textButtonL` | Figtree 800 17/20 | 56dp pills |
| `textButtonM` | Figtree 800 16/20 | Cancel |
| `textLink` | Figtree 800 14/20 | Show passwords, toast Dismiss |
| `textBadge` | Figtree 800 12/16 | Sensitive |
| `textCaptionStrong` | Figtree 700 13/18 | error and warning notes |

The boards use Figtree **600** for error notes and the toast message; only 500/700/800 are loaded,
so those map to 700 (not adding a fourth weight). No role sets `fontWeight`.

### Icons (Ionicons, already in the app)
`chevron-back`, `mail-outline`, `school-outline`, `lock-closed-outline`, `help-buoy-outline`,
`chevron-forward`, `chevron-down`, `chevron-up`, `document-text-outline`, `server-outline`
(database), `bug-outline`, `share-outline`, `send-outline`, `shield-checkmark-outline`,
`open-outline`, `log-out-outline`, `eye-outline` / `eye-off-outline`, `information-circle-outline`,
`warning-outline`, `checkmark`, `close`, `cloud-upload-outline`, `person-outline`. Sizes as drawn:
20 in tiles and trailing, 22 in fields, 18 toggle, 16 notes and captions, 14 toast discs.

### States summary

| State | Page | Sheet |
|---|---|---|
| Profile not loaded | email as heading, person glyph, no job title, no school row | — |
| Capture mode loading | shows `SEQUENTIAL` until the stored mode loads (today) | — |
| Export / crash test running | row spinner, row disabled | — |
| Offline | page fully usable; exports work (local); crash test and links fail with today's toasts | password: verify message |
| Keyboard | page has no inputs (screen-level `KeyboardAvoidingView` removed) | see keyboard rules |
| 360×640 / 360×800 | page scrolls; Sensitive badge wraps under the title at 360 | as above |
| Font scale 1.3 | rows, segments, pills, release lines grow and wrap; avatar initials cap at 1.2 | sheet body scrolls |
| Sign-out busy | Sign out pill spinner | sign-out sheets as today |

### Accessibility
- Targets: rows ≥ 56, segments 44, back 44, pills 56, Cancel 44, Show passwords and Dismiss 44 via
  height or `hitSlop`.
- Roles: section labels and the name are headers; segmented is radiogroup/radio with `checked`;
  Support tools has `expanded`; Legal rows are links; busy rows and buttons set `busy`.
- Error notes: `accessibilityRole="alert"` with `accessibilityLiveRegion="polite"`; the field it
  names carries the message in its `accessibilityHint`, so it is read again on focus.
- Contrast (computed): ink on white 17.05; ink on canvas 15.72; Muted on white 5.25; Muted on canvas
  4.84; `red600` on white 5.64; white on `red600` 5.64; `error` on white 6.54; white on `error`
  6.54; `error` on `errorBg` 5.63; `warningText` on `warningBg` 6.40; `red700` on `red50` 6.70;
  white on ink 17.05; `success` disc on ink 5.40. All pass 4.5:1.
- **Flags:**
  1. Loading-state field label: Muted on Line = **4.22:1**. Disabled controls are exempt from
     WCAG 1.4.3 and the state lasts seconds; kept as drawn.
  2. Field and pill edges `text + '33'` on white or canvas are **~1.5:1**, below the 3:1 non-text
     contrast guideline (1.4.11) for an input's boundary. The fields carry a visible label and icon,
     and this is the shared Login field, so the decision belongs to the shared-look and Login
     sections, not Profile alone.
  3. `primary` (`#E72D4D`) with white text is 4.30:1. Every filled red pill here uses `red600`.

### Board vs code contradictions and data
- p4 shows a plain "Sign out?" confirmation; **today there is none** when the EA is not clocked in
  and nothing is unsent (`useSignOutFlow.js:46` signs out at once). Building it is a behaviour
  change; not built (see Questions).
- p3's copy ("Sign out?", "Some of your work has not reached Masi yet…", "2 items waiting to sync",
  "Sync now") differs from the shipped, provisional copy. The p3 sentence drops "on this phone",
  which matters with one database per EA. Not adopted here.
- The board note's claim that Sign out "calls AuthContext.signOut directly" is stale (the sign-out
  flow shipped after the boards).
- The "final" boards keep Change password inline; the approved compact layout replaces that with a
  row and a sheet.
- `profile` can be `null` (offline first sign-in); the boards always assume a name.
- No stat or field on any Profile board needs new data.

### Components

| Component | Source | Notes |
|---|---|---|
| Bold Red stack header (`ScreenHeader` or header options) | shared look | back circle, display title, hairline |
| `SectionLabel` | new, shared | caps label, header role, optional action slot |
| `SettingsGroup` + `SettingsRow` | new, shared | action, read-only and nested variants; trailing glyph, spinner, badge slot |
| `IconTile` | extract from Home `AttentionArea` (40, radius 14, canvas fill) | used by Home cards and rows |
| `InitialsAvatar` | new, shared (Children likely needs it) | 64 here |
| `SegmentedControl` | new, shared with Record | radiogroup, sunlight-safe |
| `TextField` | from the Login section | label-over-value, secure, error, disabled |
| `ErrorNote` | new, shared (Login's form alert) | error and warning tones |
| `Badge` | new, shared | Sensitive |
| `PillButton` | shared look | primary (`red600`), secondary (white, ink edge), destructive (filled `error`), destructive-quiet (white, `error` text); 56 high |
| `TextButton` | shared look | Cancel, Show passwords |
| `Toast` + `ToastProvider` / `useToast` | shared look (`SnackbarContext`) | success / error |
| `BottomSheet` | existing, restyled in shared look | plus the Android keyboard fix |
| `ProfileIdentity`, `ChangePasswordSheet`, `ExportDatabaseSheet`, `AppReleaseInfo` | new, Profile | split out of `ProfileScreen.js` |
| `SignOutSheets` | existing, restyled | no prop or behaviour change |

### Tests (behaviour, through the screen)
Rewrite `__tests__/ProfileScreen.releaseMetadata.test.js` and `__tests__/profileCaptureModeToggle.test.js`
for the new structure; keep `__tests__/signOutFlow.test.js` passing **unchanged** (it proves the
sign-out copy and behaviour did not move).

- Identity: full name, job title and initials render; `profile === null` shows the email heading and
  no job-title line; the Assigned school row appears only with `schoolName`.
- Function map: every row exists and is reachable. Change password opens the sheet; Support tools
  toggles `expanded` and reveals the three tools; Terms and Privacy call `Linking.openURL` with the
  exact URLs and show today's failure toasts; the release info shows all five facts (version,
  build, backend, project, device, update with "Embedded" fallback); Sign out starts the flow (the
  clocked-in question appears).
- Capture mode: loads the stored mode (the Grid radio is `checked`); pressing "Step-by-step" saves;
  a failed save reverts.
- Share logs: row busy and disabled while running; success and failure toasts; Share database stays
  usable while logs export, and the reverse (existing tests, rewritten for rows).
- Share database: opens the Export database sheet (no `Alert.alert`); Cancel closes without
  exporting; Export closes the sheet, calls `exportDatabase({ handle })`, shows the toast.
- Test crash reporting: success and failure toasts.
- Change password sheet:
  - empty field → form note "All password fields are required", no field marked invalid;
  - short new password → note under New; mismatch → note under Confirm;
  - invalid credentials → note under Current (existing test, moved into the sheet);
  - verification network failure → form note with the verification message and Current not marked
    (existing test, moved);
  - update error → form note with `error.message`; no message → "Failed to change password";
  - loading: inputs not editable, button busy and a second press does not call `changePassword`
    again;
  - success: sheet closes, success toast, reopening shows empty fields;
  - editing a field clears its error; Cancel clears the fields; dismissing during the request
    reports the outcome as a toast; a stale handle shows nothing;
  - Show passwords toggles `secureTextEntry` on all three fields.
- `BottomSheet`: on Android the keyboard wrapper uses `padding` (extend `__tests__/BottomSheet.test.js`).
- `colors.test.js` updates for the three new shadows; `typography.test.js` covers the new roles
  (shared-look PR).

### Device checks (EAS preview build for the Profile PR; iOS and the Galaxy A03s)
- Page top and end against `red-profile-p1-compact` and `red-profile-final` (top);
  Support tools open against `red-profile-p1-support-open`.
- Password sheet, keyboard up, against `red-profile-p2-password-sheet` on iPhone and Android; each
  error state and loading inside the sheet; success toast.
- 360×640 (A03s via `wm size` / `wm density 320`): keyboard up, focus each field in turn with
  "next"; each focused field and its error are fully visible and Change password stays above the
  keyboard; repeat at font scale 1.3.
- Existing School search sheet (Create class): no double lift after the `BottomSheet` change.
- Export database sheet; OS share sheet opens after Export; toast sits clear of the home indicator
  (iOS), gesture bar and 3-button navigation (Android).
- Sign-out: clocked-in sheet with and without its warning; unsent online, offline ("No connection"
  disabled), uploading, and unknown count ("Try again").
- Largest system font (iOS) and One UI 1.3: nothing truncated; the Sensitive badge wraps; segments,
  pills and rows grow; release lines wrap at separators.
- Android Back closes each sheet; TalkBack and VoiceOver: radio state, expanded state, busy rows and
  error announcements.
- Profile reached from the Home settings button; Back returns to Home.

### Documentation updates in the build branch
- `PRD.md`: Profile section to the compact layout, the sheet and the export confirmation.
- `documentation/design-system.md`: settings group and row, segmented control, sheet and toast
  shadows, new type roles (if not already added by the shared-look PR).
- `documentation/build-log.md`: work, review findings, verification, device checks.
- `documentation/ROADMAP.md`: tick the Android "BackMy Profile" header item when verified.

### Out of scope
- p4's plain sign-out confirmation and p3's copy and status row (pending Jim and the sign-out
  wording pass).
- The legacy `masi.db` export gap (ROADMAP §0, Step 4 support tooling).
- Changing sign-out, password, export, capture-mode or link behaviour beyond what is listed above.
- The illustrated variant, the illustrated capture cards, the key/value release info option.

### Builder's calls
- **My call:** header title "Profile" (board) instead of "My Profile".
- **My call:** a profile that has not loaded shows the email as the heading with a person glyph.
- **My call:** Support tools starts collapsed on every visit; its open state is not stored.
- **My call:** the release info stays three lines as drawn, with non-breaking spaces inside each
  fact; a UUID update id may wrap inside itself.
- **My call:** password-sheet dismissal stays possible during the request; a late outcome becomes a
  toast. Dismissal clears the fields.
- **My call:** Current password is focused when the sheet opens; "next" chains the fields and
  "done" on Confirm submits.
- **My call:** loading keeps the sheet's button `red600` with a white spinner (the inline board drew
  a white secondary button, which does not apply inside the sheet).
- **My call:** Figtree 600 on the boards maps to 700; no new font weight is loaded.
- **My call:** the Android keyboard fix goes into `BottomSheet` (root cause), not a Profile-only
  workaround.
- **My call:** the sign-out sheets keep their current button set; "Clock out now" is filled
  `red600`, the unsent sheet's "Sign out anyway" is filled `error` (board rule), and the other
  choices are white secondary pills.
- **My call:** Ionicons stand in for the boards' hand-drawn SVG glyphs at the drawn sizes.
- **My call:** Legal rows use the link role and say "opens in browser".

### Questions for Jim
1. **Add p4's plain "Sign out?" confirmation?** Today, an EA who is not clocked in and has nothing
   unsent is signed out the moment she taps Sign out. Offline, an accidental tap locks her out
   until she has signal. Adding the confirmation step changes behaviour, so it is not in this spec
   unless you say yes.
2. **Sign-out sheet copy:** adopt p3's wording and layout ("Sign out?", a status row with
   "{n} items waiting to sync" and "Sync now") in this PR, or keep today's provisional wording
   until the separate sign-out wording pass? This spec keeps today's wording. p3's sentence also
   drops "on this phone", which matters now that each EA has their own database.
