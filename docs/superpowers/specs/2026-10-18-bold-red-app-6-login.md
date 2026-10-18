# Bold Red app, part 6: Log in and reset password

**Status:** draft for Jim's review, 2026-10-18. Part of the Bold Red app spec; read the overview first:
[`2026-10-18-bold-red-app-design.md`](./2026-10-18-bold-red-app-design.md). Where this part and the overview's
"System decisions" disagree on a component name, path, token, type role or cross-screen rule, the overview wins.

## Log in and Reset password

**Boards built (final):** `red-login-final` (= `red-flow-01-login`, byte-identical apart from the
title), `red-login-s-error`, `red-login-s-error-server`, `red-login-s-loading`,
`red-login-s-keyboard`, `red-login-s-compact` (360x640, rest and keyboard), `red-login-s-forgot`,
`red-login-s-forgot-error`, `red-login-s-forgot-sent`, `red-login-p-offline` (approved),
`red-login-components` (only the options marked RECOMMENDED, plus "C · Both empty").
**Not built:** `red-login-v-yellow`; components-board options B/C (border-only error, pink-filled
error, button-only loading, centred lockup, success-tile and Red 50 sent marks, nowrap email).

**Code:** `src/screens/auth/LoginScreen.js` (156 lines), `src/screens/auth/ForgotPasswordScreen.js`
(178 lines), `AuthNavigator` in `src/navigation/AppNavigator.js:63-77`, `signIn` / `resetPassword`
in `src/context/AuthContext.js:199-292` (unchanged by this work).

**No schema, RLS, payload, outbox or `AuthContext` change.** `rls-sync-contract-map.md` is not
touched. Everything below is presentation plus screen-local state, one pure error-copy function,
and one connectivity hook.

### Where the boards and the canvas notes disagree with the code (read first)

1. **The offline notice cannot use `OfflineContext`.** The board note (n9) says "OfflineContext.isOnline
   already exists, so the cost is small". It does not exist on Login: `OfflineProvider` is mounted
   only inside the signed-in tree (`App.js:141-153`); signed out, `AppRoot` renders
   `<AppNavigator signedIn={false} />` with no provider. Login needs its own NetInfo read (see
   "Offline notice"). Small, but not free.
2. **"Reset password" probably dead-ends today. LOUD.** `resetPassword` sends Supabase's recovery
   email with `redirectTo: 'masi-app://reset-password'` (`AuthContext.js:284`), but nothing in the
   app handles that link: no `linking` config on `NavigationContainer`, `detectSessionInUrl: false`
   (`src/services/supabaseClient.js:23`), no code/token exchange, and `updatePassword`
   (`AuthContext.js:294`) has no caller. An EA who taps the emailed link either opens the app on
   Login with nothing happening or lands on whatever the project's Site URL is. Whether
   `masi-app://reset-password` is even in `masi-app-sqlite`'s redirect allow-list is not visible
   from the repo. The redesign makes this screen look finished, so it must not ship blind: see
   Device check D9 and Question 2. Building a "set a new password" screen is a new feature and is
   **out of scope** here.
3. **Field-error style.** Note n9 describes the field message as "a bare line ... white 600 text".
   The `red-login-s-error` board and components §02 "A · RECOMMENDED" draw the boxed `ErrorNote`
   8dp under the field. **The boards win**; the note is stale.
4. **"Back to Login".** Note n9 says the copy was kept verbatim; every board says
   **"Back to sign in"**. The boards win.
5. **Raw Supabase copy.** Today both screens put `error.message` into a Snackbar, so a suspended EA
   reads "User is banned" (ROADMAP §5, found on build 14). The boards keep one raw string on
   purpose ("Invalid login credentials"); everything else is mapped (see "Error copy").
6. **Splash (adjacent, not on any board).** `app.config.js` splash is `./assets/splash-icon.png` on
   `#ffffff`, and that PNG is Expo's placeholder grid-and-circles template. Cold start shows it
   (held while fonts load), then cuts to a full-red Login. See Question 3.

### Current vs target (summary)

| Element | Today | Target |
|---|---|---|
| Background | `colors.background` canvas | `colors.red600` field, full-bleed behind status and nav bars |
| Brand | 120x120 app icon (`masi-mobile-icon.png`, the rainbow tile) + "Sign in to continue" | Lockup top-left (mark + "MASI / NYUSANE"), charcoal arc + learner cut-out; no subtitle |
| Form | Paper outlined `TextInput`s on canvas | `red700` bottom panel, top radius 22, white boxed `TextField`s with label inside |
| Primary | `BrandButton` "Sign In", radius 8, red500, dims to 60% while loading | White pill 56, `red600` text "Sign in"; loading = spinner + "Signing in…", not dimmed |
| Forgot | Paper text `Button` "Forgot Password?" (theme red) | White underlined `TextLinkButton` "Forgot password?", right-aligned |
| Footnote | none | "This app is for Masinyusane staff only." |
| Errors | Snackbar, 4 s auto-dismiss, "Dismiss" in Paper default colour | Inline `ErrorNote`: field-level under the field, form-level above Sign in; no Snackbar; clears on edit |
| Offline | nothing until a tap fails with "Network request failed" | Caption under the heading when NetInfo says offline; Sign in stays enabled |
| Reset screen | Native stack header "Reset Password", Paper inputs/buttons, Snackbar | In-screen `ScreenHeader` with back circle, `TextField`, red pill, text link, inline errors |
| Sent state | "Check Your Email", italic note, Paper contained button | Mail tile, "Check your email", email on its own bold line, bottom-anchored red pill |

### Login: layout at 390x844, keyboard down (`red-login-final`)

The screen is a `red600` field. Two layers: the **hero art** (arc + learner, decorative) and the
**content** (lockup at the top, panel at the bottom). The panel is content-sized and
bottom-anchored; everything else positions from the panel's top and the safe-area insets.

**Status bar.** Focus-scoped `<StatusBar style="light" />` (same pattern as Home,
`HomeScreen.js:160`), so it joins React Native's status-bar stack and the root `style="auto"`
returns on blur. Android is edge-to-edge (`app.config.js` `edgeToEdgeEnabled: true`), so the red
field already sits behind both system bars.

**Lockup.** Absolute, `left: 24`, `top: max(insets.top + 10, 40)` (56 on the 844 board with a 47dp
iOS inset; 40 on the 640 board with a 24dp Android inset). Row, gap 10:
- Mark image 48x41, decorative.
- Two stacked lines, white (`colors.onDark`): "MASI" Bricolage 800 26/24, letter spacing +0.26
  (0.01em); "NYUSANE" Bricolage **700** 12/15, letter spacing +1.56 (0.13em), 2dp below.
  Only Bricolage 800 is loaded. See "Assets" for the preferred route (one lockup image); if
  typeset, both lines use `fontFamilies.display` (800) and `maxFontSizeMultiplier={1}`, because
  this is a logo, not reading text.
- The whole lockup is one accessible element: `accessibilityRole="image"`,
  `accessibilityLabel="Masinyusane"`.

**Hero art** (new `LoginHeroArt`, decorative: `accessibilityElementsHidden` +
`importantForAccessibility="no-hide-descendants"`, `pointerEvents="none"`). One group, drawn in a
390x844 design space and transformed as a unit (scale `s`, offset `x`, `y`):
- Arc (react-native-svg, already a dependency): circle centre (486, 412), radius 400, stroke
  `colors.heroDark`, width 54, no fill; keyline circle, same centre, radius 436, stroke
  `colors.surface + 'B8'` (white 72%), width 2. (The board draws centre (486, 446) inside a group
  shifted up 34; (486, 412) is the same thing.) Clipped by the screen.
- Learner cut-out image: `left 74, top 110, 296x430`, `resizeMode="contain"`, above the arc.
- **Scale and position rule** (reproduces both drawn frames and fixes tall phones):
  - `s = clamp(0.74 + (windowHeight - 640) * 0.26 / 204, 0.74, 1)` (1 at 844, 0.74 at 640).
  - `x = windowWidth - 390 * s` (right-anchored; the 640 board is within 2dp of this).
  - `y = max(-43.8 * (1 - s), panelTop - 446 * s)`. At 844 this is 0 (the board). At 640 it is
    -11.4 (the board). On a taller phone (e.g. 430x932) the second term wins, so the learner's
    bottom stays tucked 94·s dp behind the panel instead of floating above it.
  - When the panel grows (error note, offline caption, large text), the art does **not** move up
    (n9: "the crop never changes"); the panel simply covers more of it.
- **Hide rule:** the art is not rendered when the keyboard is visible, or when less than 120dp of
  the learner would show above the panel (`panelTop - (y + 110 * s) < 120`, e.g. large text on a
  short phone), so a lone head never peeks over the panel. Instant, no animation (so there is no
  motion for Reduce Motion to cut).

**Panel.** Full width, `colors.red700`, top-left/right radius 22 (`borderRadius.xl`), no shadow.
Padding: 24 top, 24 sides, bottom `max(insets.bottom, 24)` (34 on the iPhone board, 24 on the
Android board). Content top to bottom (dp at 390x844):

| Element | Spacing | Spec |
|---|---|---|
| Heading "Sign in" | first | `displayHero` (new: Bricolage 800 38/42, letter spacing -1.14), `colors.onDark`, `accessibilityRole="header"`, `maxFontSizeMultiplier={1.2}` |
| Offline notice (when shown) | 10 below heading | see "Offline notice" |
| Email `TextField` (tone `onRed`) | 18 below heading (rest); 10 when any error note shows; 16 below the offline notice | icon `mail-outline` |
| Password `TextField` (tone `onRed`, secure) | 12 below Email | icon `lock-closed-outline`; trailing eye button |
| Forgot row | 4 below Password (0 in compact) | right-aligned `TextLinkButton` tone `onRed`, height 44 |
| Form-level `ErrorNote` (when shown) | directly below the Forgot row | server, network, both-empty messages |
| Sign in `PillButton` tone `onRed` | 8 below (0 when a field-level note is showing) | full width, height 56 |
| Footnote | 16 below the button | "This app is for Masinyusane staff only.", `textCaption` (13/18 Figtree 500), `colors.red50`, centred. Shown in every state |

**Compact rest (window height < 700, `red-login-s-compact` left frame):** same panel; Email
`marginTop` 16 instead of 18; Forgot row `marginTop` 0; lockup at the inset rule above; art at
`s` from the rule. Every control keeps its 390 size.

### `TextField` (new, shared; Profile's change-password sheet uses it too)

One input style everywhere (RedSystemSheet "One input"). Replaces Paper `TextInput` on these two
screens.

- Box: `colors.surface`, radius 14 (`borderRadius.md`), **min** height 60 (grows with large text),
  row with `alignItems: 'center'`, gap 12, padding left 16, right 16 (right 4 when a trailing
  44dp button is present).
- Leading icon: Ionicons outline 22dp. Colour: `colors.text` when the field has a value or focus;
  `colors.textSecondary` when empty and unfocused; `colors.error` when invalid.
- Label inside, above the value, gap 2: `textLabel` (Figtree 800 11/14, +1.1, upper-case),
  `colors.textSecondary`; `colors.error` when invalid. The visible label is
  `importantForAccessibility="no"`; the `TextInput` carries `accessibilityLabel`.
- Value: `textInput` (new: Figtree 500 17/22), `colors.text`. Placeholder in the same face,
  `placeholderTextColor={colors.textSecondary}` (5.25:1). Do **not** use `colors.placeholder`
  (`#B3A8A8`, about 2.2:1 on white). The board's placeholder weight 400 is not loaded; 500 is
  the nearest loaded face.
- Masked value (secure, non-empty, hidden): 20/24 with letter spacing 2.8, matching
  `red-login-s-error`/`-s-loading`; revealed or empty: back to `textInput`. The bullet glyph is
  the platform's.
- Tapping anywhere on the box focuses the input (the box is a `Pressable` that calls
  `inputRef.focus()`).
- **States** (border width is always 2 so nothing shifts; halos are an absolutely positioned
  sibling at inset -4 behind the box, so they take no layout space):

| State | Tone `onRed` (Login panel) | Tone `onCanvas` (Reset, Profile) |
|---|---|---|
| Rest | border transparent | border `colors.text + '33'` (ink 20%) |
| Focused | border `colors.text`; halo 4dp `colors.surface + '52'` (white 32%) | border `colors.text`; halo 4dp `colors.text + '0F'` (ink 6%) |
| Invalid | border `colors.error`; halo 4dp `colors.errorBg`; icon + label `colors.error` | border `colors.error`, no halo (board `-s-forgot-error`); icon + label `colors.error` |
| Disabled (loading) | value opacity 0.7; icon, label, trailing button opacity 0.5; `editable={false}` | same |

- Field-level error: an `ErrorNote` 8dp below the box (inside the field's own column). The
  `TextInput` gets `accessibilityHint` = the error text while invalid (RN has no `aria-invalid`).
- Trailing eye button (secure fields): 44x44, `eye-outline` 22dp `colors.text` when hidden with
  label "Show password"; `eye-off-outline` with label "Hide password" when shown. Toggles
  `secureTextEntry`.
- Must not spread `NO_TEXT_SUGGESTIONS` by default (`__tests__/domainTextInputAudit.test.js`
  requires auth screens to keep platform text assistance).

### `ErrorNote` (new, shared)

Row, gap 8, padding 8 vertical / 12 horizontal, radius 9 (`borderRadius.sm`), fill
`colors.errorBg`; glyph `warning-outline` 16dp `colors.error`, 1dp from the top; text
`textCaptionStrong` (new: Figtree 700 13/18; the board's 600 is not loaded), `colors.error`
(5.63:1 on `errorBg`). Wraps; never truncates. `accessibilityRole="alert"`,
`accessibilityLiveRegion="polite"`; on iOS, when a note appears (not on re-render), call
`AccessibilityInfo.announceForAccessibility(text)`.

### Buttons

- **Sign in** = `PillButton` tone `onRed`: height 56, radius 999, full width, fill
  `colors.surface`, label `textButtonL` (new: Figtree 800 17/20) `colors.red600` (5.64:1),
  shadow **new `shadows.onRedButton`** (`shadowColor: colors.red900`, offset 0/8, opacity 0.22,
  radius 10, elevation 6; from `0 8px 20px rgba(83,11,23,.22)`). Pressed: fill `colors.red50`,
  label `colors.red700`, scale 0.98. Loading: 18dp `ActivityIndicator` `colors.red600` + "Signing
  in…", gap 10, same fill (not dimmed), `accessibilityState={{ busy: true, disabled: true }}`.
  Login never draws the disabled-on-red style (the button is never disabled for empty fields;
  validation runs on tap, as today).
- **Send reset link / Back to sign in (sent)** = `PillButton` primary on canvas: fill
  `colors.red600`, label white (5.64:1), shadow `shadows.primaryButton` (Profile section's name:
  `red600`, 0/10, 0.22, radius 11). Pressed `colors.red700`, scale 0.98.
- **Forgot password?** = `TextLinkButton` tone `onRed`: height 44, padding 0 2, `textButton`
  (Figtree 800 15/20), white, underlined (`textDecorationLine: 'underline'`; RN cannot set the
  board's 1.5 thickness / 4 offset; accept the platform underline). Disabled while signing in:
  opacity 0.5.
- **Back to sign in (Reset form)** = tertiary on canvas: height 44, full width, centred,
  `textButtonM` (new: Figtree 800 16/20), `colors.text`.

### Validation, errors and how they clear

Validation logic is unchanged; only presentation and clearing change. Screen state replaces the
single `error` string with `{ kind: 'empty', email: bool, password: bool } | { kind: 'format' } |
{ kind: 'server', message } | null`.

| Trigger (today's rule, unchanged) | Copy | Where | Clears |
|---|---|---|---|
| `!email \|\| !password` on tap | "Please enter both email and password" | each **empty** field invalid + form-level note above Sign in (components "C") | each field's ring clears when that field gets a value; the note clears when no ringed field remains |
| email fails `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` | "Please enter a valid email address" | Email invalid + note under Email (`-s-error`) | when Email is edited |
| `signIn` returns an error | mapped copy (below) | form-level note above Sign in (`-s-error-server`), no field ring | on any edit to either field, and when Sign in is tapped again (`handleLogin` already clears first) |

The Snackbar and its "Dismiss" are removed from both screens (two of the 14 screen-local
Snackbar hosts in ROADMAP §5 go away).

### Error copy (new pure function `describeAuthError(error, action)`)

New `src/utils/authErrorCopy.js`; `action` is `'sign_in'` or `'reset'`. It reads `error.code`
(auth-js 2.100.1 `ErrorCode`) and `isAuthRetryableFetchError(error)` (exported by
`@supabase/supabase-js`). The raw error still goes to `console.error` (already done in
`AuthContext.signIn`/`resetPassword`), so Profile → Export Logs keeps it for support.

| Condition | Sign in copy | Reset copy |
|---|---|---|
| `code === 'user_banned'` | "Your access is paused. Please contact your supervisor." | (not returned for reset) |
| `code === 'invalid_credentials'` | "Invalid login credentials" (board copy, verbatim) | n/a |
| `isAuthRetryableFetchError` and `status === 0` (no connection; RN's "Network request failed") | "Couldn’t reach Masi. Check your internet connection and try again." | same |
| `isAuthRetryableFetchError` and `status >= 500` | "Masi isn’t responding right now. Please try again in a few minutes." | same |
| `code === 'over_request_rate_limit'` | "Too many attempts. Please wait a few minutes and try again." | same |
| `code === 'over_email_send_rate_limit'` | n/a | "Too many reset emails were requested. Please wait a while and try again." |
| anything else | "Couldn’t sign in. Please try again." | "Couldn’t send the reset link. Please try again." |

`ProfileScreen.js:23` has its own `isInvalidCredentialsError`; leave it (Profile section owns
that screen), but the reconciliation step may point it at this module.

### Offline notice (approved `red-login-p-offline`)

- **Source:** new hook `useNetworkOffline()` (`src/hooks/useNetworkOffline.js`) that subscribes
  with `NetInfo.addEventListener` (v11 delivers the current state on subscribe) and returns
  `true` only when the state is **definitely** offline:
  `state.isConnected === false || state.isInternetReachable === false`. `null` (unknown, e.g.
  the first moments after launch) counts as not offline, so the notice never flashes on a
  connected phone. This is the same predicate `OfflineContext.js:281` and
  `SignedInEAContext.js:66` use, minus treating `null` as offline. It is read-only: no sync, no
  provider, works signed out.
- **Copy:** "You’re offline. Sign in needs the internet."
- **Look:** row, gap 8, `alignItems: 'flex-start'`; `cloud-offline-outline` 18dp `colors.onDark`;
  text `textCaption` (13/18 Figtree 500) `colors.red50` (6.7:1 on `red700`). Plain caption, not
  the sync component and not an `ErrorNote`.
- **Placement:** 10 below the heading; Email then sits 16 below it. Panel grows about 26dp; art
  does not move.
- **Behaviour:** Sign in stays enabled (NetInfo can report false negatives, e.g. captive or
  filtered networks). If the EA taps anyway and the request fails, the network `ErrorNote` shows
  above Sign in as well; the caption stays. The caption hides as soon as NetInfo reports
  connectivity. `accessibilityLiveRegion="polite"`; iOS announces it once when it appears.
- Not on the Reset screen (no board; a failed send shows the network note there).

### Signing in (`red-login-s-loading`)

While `signIn` is in flight (unchanged `loading` flag): both fields `editable={false}` with the
disabled look, eye button disabled, Forgot link disabled at 50%, Sign in shows the loading
content and ignores taps (no double submit). On success nothing changes here: `AppRoot` swaps to
`LoadingScreen`/the app, as today.

### Keyboard (`red-login-s-keyboard`, `red-login-s-compact` right frame)

Keyboard height comes from a new shared hook `useKeyboardHeight()` (`keyboardWillShow/Hide` on
iOS, `keyboardDidShow/Hide` on Android; returns `endCoordinates.height`, 0 when hidden). The
Record section's sticky submit bar needs the same hook.

- **Keyboard up, standard:** art hidden. Lockup stays exactly where it was (no jump). Panel stops
  being bottom-anchored: it starts 74dp below the lockup's top (130 at 844) and extends down to
  the keyboard's top edge. Content unchanged; the focused field shows the focus state with the
  caret.
- **Keyboard up, compact** (used when `lockupTop + 74 + panelContentHeight > windowHeight -
  keyboardHeight`, which is the case at 360x640 with a 280dp keyboard): art **and** lockup hidden;
  panel top = `insets.top`; panel padding top 16; heading steps down to `displayTitle` (Profile
  section's role: Bricolage 800 24/28, -0.48); Email 12 below the heading; footnote 12 below the
  button.
- **Overflow fallback:** the content stays in a `ScrollView` with
  `keyboardShouldPersistTaps="handled"`. With 3-button navigation, large text, or smaller screens,
  it scrolls: the footnote leaves first and the focused field stays visible. Keep
  `KeyboardAvoidingView` only on iOS (`behavior="padding"`); on Android rely on the window resize
  and verify on device under edge-to-edge (D5).
- Keyboard keys: Email `returnKeyType="next"` focuses Password; Password `returnKeyType="go"` runs
  `handleLogin` (my call, see below). Email keeps `keyboardType="email-address"`,
  `autoCapitalize="none"`.

### Large text

Heading caps at 1.2; lockup text (if typeset) does not scale; everything else scales freely.
`TextField` heights are minimums; labels and values wrap inside their box; the panel grows; the
art hide rule removes the learner if it would only peek; the page scrolls. At font scale 1.3 on
360x640 nothing is truncated and every control is still individually tappable.

### Reset password (`red-login-s-forgot`, `-s-forgot-error`, `-s-forgot-sent`)

Navigator: `ForgotPassword` becomes `headerShown: false` (the screen draws its own header). Root
status bar style stays (the app is `userInterfaceStyle: 'light'`, so "auto" is dark content on the
canvas). Background `colors.background`.

**Header** (`ScreenHeader` from the shared-look PR, as named in the Children section): padding top
`max(insets.top + 9, 34)` (56 on the board), sides 24, bottom 6; row gap 12.
- `IconCircleButton` back: 44x44, radius 22, `colors.surface`, 1.5 border `colors.text + '33'`,
  `chevron-back` 22dp `colors.text`, label "Back", calls `navigation.goBack()`.
- Title "Reset password": `displayL` (Bricolage 800 28/32, -0.56), `colors.text`,
  `accessibilityRole="header"`, one line with ellipsis at normal size; wraps when text is enlarged.

**Form** (padding top 10, sides 24):
- Paragraph "Enter your email address and we’ll send you instructions to reset your password."
  `textLead` (Figtree 500 15/22), `colors.textSecondary` (4.84:1 on canvas), max width 330.
- `TextField` tone `onCanvas`, label "Email", icon `mail-outline`, no placeholder, `autoFocus` (as
  today, so it opens focused with the keyboard up, which is what the board draws). 20 below.
- `PillButton` primary "Send reset link", 20 below the field (or its note). Loading: white spinner
  + "Sending…"; field disabled look.
- Tertiary "Back to sign in", 8 below, calls `navigation.goBack()`.
- Invalid email (today's rule unchanged: `!email || !email.includes('@')`): field invalid, note
  "Please enter a valid email address" 8 below the field; clears when Email is edited.
- `resetPassword` error: form-level `ErrorNote` 12 above "Send reset link" with the reset copy
  from the table; clears on edit or the next tap. (No board; this mirrors Login's server note.)
- In a `ScrollView` with `keyboardShouldPersistTaps="handled"`; on 360x640 with the keyboard up it
  scrolls rather than clips.

**Sent** (same screen, `success` state, as today):
- Header with the back circle only (no title, so there is one heading on screen).
- Centred block between the header and the bottom button, `paddingBottom` 48 (optical lift):
  - Tile 80x80, radius 22, `colors.surface`, 1dp border `colors.text + '1F'`, `mail-outline`
    40dp `colors.text`; decorative.
  - "Check your email": `displayL`, `colors.text`, 28 below the tile, `accessibilityRole="header"`.
  - 12 below, centred, `textLead` 15/22 `colors.text`: "If an account exists with" newline, the
    email in Figtree 800 (`fontFamilies.textHeavy`, nested `Text`) followed by ",", newline, "you
    will receive a password reset link shortly." The address is on its own line and wraps inside
    the column (RN breaks long unbroken strings by character; check with a 42-character address).
  - 14 below, `textLead` `colors.textSecondary`, max width 300: "Please check your email and
    follow the instructions to reset your password." (no longer italic).
- Bottom: `PillButton` primary "Back to sign in", 24 from the sides, bottom
  `max(insets.bottom, 24)` (34 on the board); `navigation.popTo('Login')` (overview §8 R5: `navigate('Login')`
  pushes a second Login and Back would reopen the finished reset screen).

### Copy changes (exact)

| Today | New |
|---|---|
| "Sign in to continue" | removed |
| "Sign In" (button) | "Sign in"; loading "Signing in…" |
| "Forgot Password?" | "Forgot password?" |
| (none) | heading "Sign in"; placeholders "you@masinyusane.org", "Your password"; footnote "This app is for Masinyusane staff only."; offline "You’re offline. Sign in needs the internet." |
| Snackbar `error.message` / "Failed to sign in" | inline notes, copy per the tables above |
| Header "Reset Password" | "Reset password" |
| "Enter your email address and we'll send…" | same words, curly apostrophe "we’ll" |
| "Send Reset Link" | "Send reset link"; loading "Sending…" |
| "Back to Login" (both places) | "Back to sign in" |
| "Check Your Email" | "Check your email" |
| "Failed to send reset email" | mapped reset copy |

### Colour map (every board value → token)

No new colour token.

| Board value | Token | Where |
|---|---|---|
| `#C81F3E` | `colors.red600` | screen field; Sign in label; spinner on white; reset primary fill |
| `#A4182F` | `colors.red700` | panel; pressed label on red |
| `#1C1517` | `colors.heroDark` | arc |
| `#fff` @72% stroke | `colors.surface + 'B8'` | arc keyline |
| `#FFFFFF` / `#fff` | `colors.surface` (boxes, pill) / `colors.onDark` (text, icons on red) | |
| `#FDECEF` | `colors.red50` | footnote, offline caption, pressed fill on red |
| `#221A1B` | `colors.text` | values, icons, focus border, titles |
| `#76696B` | `colors.textSecondary` | labels, empty-field icon, placeholder, paragraph |
| `#B3261E` | `colors.error` | invalid border/label/icon, note text |
| `#FCEAE8` | `colors.errorBg` | note fill, invalid halo on red |
| `#F8F5F4` | `colors.background` | reset canvas |
| `rgba(255,255,255,.32)` | `colors.surface + '52'` | focus halo on red |
| `rgba(34,26,27,.06)` | `colors.text + '0F'` | focus halo on canvas |
| `rgba(34,26,27,.20)` | `colors.text + '33'` | rest field border on canvas, back circle border |
| `rgba(34,26,27,.12)` | `colors.text + '1F'` | sent tile edge |
| `0 8px 20px rgba(83,11,23,.22)` | **new `shadows.onRedButton`** (`red900`) | Sign in |
| `0 10px 22px rgba(200,31,62,.22)` | **new `shadows.primaryButton`** (`red600`; same name as Profile) | reset primary |

Both shadows update `__tests__/colors.test.js` (it pins `shadows` exactly) and belong in the
shared-look PR.

### Type roles

Existing: `textLabel` (field labels), `textCaption` (footnote, offline caption), `textButton`
(Forgot link). New (names aligned with the Profile section; reconciliation picks final names):
`displayHero` Bricolage 800 38/42 -1.14 (**only Login needs it**), `displayL` 28/32 -0.56,
`displayTitle` 24/28 -0.48, `textLead` Figtree 500 15/22, `textInput` Figtree 500 17/22,
`textButtonL` Figtree 800 17/20, `textButtonM` Figtree 800 16/20, `textCaptionStrong` Figtree
700 13/18. None sets `fontWeight` (`__tests__/typography.test.js`). The lockup's 26/24 and 12/15
are logo styles, not roles.

### Assets

The repo has: `assets/masi-mobile-icon.png` (1024², the rainbow app-icon tile; used on Login
today), `icon.png`, `icon-ios.png`, `adaptive-icon.png`, `favicon.png`, `masi-app-icons/`
(store icon sets), and `splash-icon.png` (Expo's placeholder template). **None of them is the
board's mark, wordmark or learner photo.** The boards reference two canvas blobs that are not in
the repo:

| Board image | Board size | Needed in repo |
|---|---|---|
| Mark (`_blob/e01d118a…`), white, alt "" | 48x41 | `assets/brand/masi-lockup-white.png` @2x/@3x: preferably the **whole lockup** (mark + MASI/NYUSANE) from Masi's brand files, transparent, so the wordmark is the real logotype and no Bricolage 700 face is needed. Fallback: mark only (`masi-mark-white.png`, 96x82 and 144x123 px) + typeset text |
| Learner cut-out (`_blob/ad116e9a…`), alt "A smiling Foundation Phase learner holding up her artwork" | 296x430 | `assets/login/learner-artwork.png` @2x (592x860) and @3x (888x1290), transparent background, compressed (target under 400 KB each). Rendered with React Native `Image` (no new dependency) |

The photo shows a real child: confirm consent before it ships (Question 1).

### Accessibility and contrast

- Targets: fields ≥60 tall; eye 44x44; Forgot 44 tall; Sign in 56; back circle 44; reset tertiary
  44. All pass 44.
- Order (screen reader): lockup "Masinyusane", heading "Sign in", offline caption (if any), Email,
  its note (if any), Password, Show password, Forgot password?, form note (if any), Sign in,
  footnote. Art is hidden.
- Contrast, computed: white on `red700` 7.64; `red50` on `red700` 6.7; `red600` on white 5.64;
  white on `red600` 5.64; ink on white 17.05; muted on white 5.25; error on white 6.54; error on
  `errorBg` 5.63; muted on canvas 4.84; ink on canvas 15.72; loading value (ink at 70% on white)
  6.28. **All text passes 4.5:1.**
- Non-text, flagged:
  - Error border on `red700` is **1.17:1** (fails 3:1). Mitigated as the board intends: the
    `errorBg` halo is 6.57:1 against the panel, and the label and icon turn `error` (6.54:1 on
    white).
  - Rest border on canvas (ink 20%) is **1.52:1** against white/canvas (fails WCAG 1.4.11 3:1).
    On Reset the field opens focused (2px ink, 17:1), so the rest state only shows after blur.
    This is the shared input style; the shared-look PR should decide whether to raise it (ink at
    about 50% gives about 3.4:1). Flagged, not changed here.
  - White 32% focus halo on `red700` is 1.91:1; it is decoration. The focus indicator is the 2px
    ink border against the white box (17:1).
  - Loading-state labels/icons (muted at 50%, 2.04:1) and the disabled Forgot link (2.89:1) are
    disabled controls, exempt.
  - Arc `heroDark` on `red600` 3.18:1, decorative.

### Components

| Component | Source | Notes |
|---|---|---|
| `TextField` | **New, shared** (Login defines it; Profile reuses) | tones `onRed`/`onCanvas`; states above; trailing secure toggle; `inputRef` passthrough |
| `ErrorNote` | **New, shared** | error tone here; Profile adds a warning tone |
| `PillButton` | **New, shared-look PR** (Children calls the primary `PrimaryButton`; Profile `PillButton`) | variants used here: `onRed` (white), primary (`red600`); loading label prop |
| `TextLinkButton` | **New, shared-look PR** (Children's name) | needs an `onRed` tone (white, underlined) and an ink tertiary |
| `ScreenHeader` + `IconCircleButton` | **New, shared-look PR** (Children's names) | Reset header; title optional (sent state) |
| `LoginHeroArt` | **New, this PR**, `src/components/auth/` | arc + learner, scale rule, hide rule. Home's arc is inline in `HomeScreen.js` with different geometry; no shared abstraction (two uses, different shapes) |
| `BrandLockup` | **New, this PR**, `src/components/auth/` | image (or mark + text) |
| `useNetworkOffline` | **New hook**, `src/hooks/` | definitely-offline predicate |
| `useKeyboardHeight` | **New shared hook**, `src/hooks/` | also for Record's sticky submit bar |
| `describeAuthError` | **New pure function**, `src/utils/authErrorCopy.js` | mapping table |
| From Home | `typeRoles`, fonts, focus-scoped `<StatusBar>` pattern | no Home component is reused directly |

After this PR `BrandButton` has two callers left (`App.js` `ErrorBoundary`,
`src/components/bootstrap/HandleOpenError.js`); the shared-look PR restyles or replaces it.

### Data

No new data. Nothing on these boards needs anything the app does not have. No schema, RLS or
outbox change.

### Tests (behaviour-level, through the screen; `@testing-library/react-native`)

New `__tests__/LoginScreen.test.js` (mock `useAuth` `signIn` and NetInfo's listener; mock
`useWindowDimensions` and `Keyboard` events where needed):
1. Renders heading "Sign in", fields labelled "Email" and "Password", "Forgot password?",
   "Sign in", and the footnote; no "Sign in to continue".
2. Both empty, tap Sign in: note "Please enter both email and password", both fields carry the
   error hint, `signIn` not called. Type an email: Email's hint clears, Password's stays, note
   stays. Type a password: note gone.
3. Only password empty: only Password is marked; same note.
4. "asanda.mbeki@masinyusane", tap: note "Please enter a valid email address" under Email;
   `signIn` not called; editing Email clears it.
5. `signIn` resolves `{ error: { code: 'invalid_credentials' } }`: note "Invalid login
   credentials"; editing Password clears it; tapping Sign in again clears it before the call.
6. `{ code: 'user_banned', message: 'User is banned', status: 400 }`: "Your access is paused.
   Please contact your supervisor." and the text "User is banned" is absent.
7. A retryable fetch error with status 0: the connection copy.
8. Unknown error: "Couldn’t sign in. Please try again."
9. While `signIn` is pending: button reads "Signing in…" with busy state; inputs not editable;
   Forgot disabled; a second tap does not call `signIn` again.
10. Offline: listener emits `{ isConnected: false }` → "You’re offline. Sign in needs the
    internet." shows and Sign in still calls `signIn`; emits `{ isConnected: true,
    isInternetReachable: true }` → hidden; `{ isConnected: true, isInternetReachable: false }` →
    shown; `{ isConnected: null, isInternetReachable: null }` → not shown.
11. Eye button: label "Show password" toggles to "Hide password" and the input's
    `secureTextEntry` flips.
12. Email submit focuses Password; Password submit signs in.
13. Keyboard shown: art (testID) not rendered, lockup rendered. Window 360x640 + 280 keyboard:
    lockup not rendered too.
14. "Forgot password?" navigates to `ForgotPassword`.
15. No Snackbar is rendered in any state.

New `__tests__/authErrorCopy.test.js`: every row of the table, both actions.

New `__tests__/ForgotPasswordScreen.test.js`:
1. "asanda.mbeki" → note under Email; `resetPassword` not called; editing clears it.
2. Success → "Check your email", the address in the body, "Back to sign in" returns to (rendered
   inside the real `AuthNavigator` stack: afterwards exactly one `Login` route exists and Back does
   not reopen Reset; overview §8 R5)
   `Login`; header "Back" calls `goBack`.
3. `resetPassword` error (`over_email_send_rate_limit`, retryable status 0) → mapped note above
   the button; no Snackbar.
4. Pending → "Sending…", field not editable.

New `__tests__/useNetworkOffline.test.js` if the predicate is not fully covered by Login test 10.
Keep `domainTextInputAudit.test.js` green. `typography.test.js` and `colors.test.js` change only
for the new roles/shadows (shared-look PR). `AuthContext` tests unchanged.

### Device checks (Login PR's EAS preview build; iOS and Android)

- D1 Rest at 390-class iPhone and a 360x800 Android, compared with `red-login-final`: arc legs
  leave through the sides; the learner clears the lockup; nothing of her bottom edge shows.
- D2 360x640 budget Android (or `wm size 720x1280` + `wm density 320` on the A03s) rest and
  keyboard, against `red-login-s-compact`: art at 74%, compact keyboard layout, all fields and the
  button visible above a 280dp keyboard with gesture nav; with 3-button nav it scrolls and the
  focused field stays visible.
- D3 A tall phone (≥ 900dp high): the learner stays tucked behind the panel.
- D4 Errors: both-empty, format, wrong password, and a **suspended EA** (`ea:suspend` on a test
  account on `masi-app-sqlite`, then `ea:restore`) showing the paused copy.
- D5 Keyboard on Android edge-to-edge: no double resize or gap; focus moves Email → Password;
  "go" signs in.
- D6 Airplane mode (A03s gotcha: use `cmd wifi` + the watchdog): caption appears within a few
  seconds; tap Sign in shows the connection note; reconnect hides the caption.
- D7 Largest system font (One UI 1.3 and iOS largest non-accessibility size) at 360dp: all text
  complete, every control tappable on its own, page scrolls.
- D8 TalkBack and VoiceOver: reading order, labels, error announcements, the offline caption.
- D9 **Reset end to end:** request a reset for a test account, open the email on the phone, tap
  the link. Record exactly what happens in the build log. If it does not end with a way to set a
  new password, follow Question 2's answer.
- D10 Reset screen at 360x640 with keyboard (scrolls, does not clip); sent state with a
  42-character address wraps inside the column.

### Documentation updates in the build branch

`PRD.md` (sign-in section, if it lists the screen contents), `documentation/design-system.md`
(`TextField`, `ErrorNote`, the error-placement rule, the input contrast note),
`documentation/build-log.md`, and `documentation/ROADMAP.md` (close "Suspended sign-in copy";
record the reset-link finding as its own item if D9 fails).

### Out of scope

- A "set a new password" recovery screen and deep-link handling (see finding 2).
- Changing validation rules (Login's regex and Reset's `includes('@')` stay as they are).
- Any `AuthContext` change, including timeouts on `signInWithPassword`.
- An offline notice on Reset.
- `LoadingScreen` ("Preparing your offline data") gets the shared look only.

### Builder's calls

- **My call:** suspended copy says "supervisor", not ROADMAP's example "coordinator", because the
  app already says "Contact your supervisor" (`NoActiveProgrammeNotice`, CONTEXT.md).
- **My call:** the connection, server, rate-limit and fallback strings above are new wording (no
  board draws them).
- **My call:** keep the board's "Invalid login credentials" verbatim rather than rewording it.
- **My call:** `useNetworkOffline` treats an unknown state as online so the caption never flashes
  at launch.
- **My call:** the error note uses Figtree 700 (600 is not loaded) and placeholders use 500
  (400 is not loaded).
- **My call:** add `returnKeyType` next/go and submit-on-go. Platform hygiene, no visible change
  to the boards.
- **My call:** hide the art (instantly) when the keyboard is up or when under 120dp of the
  learner would show; no fade, so there is no motion to reduce.
- **Superseded (overview §8, builder gap 3):** the learner photo is decorative
  (`accessible={false}`), as the hero-art spec says.
- **My call:** "Sending…" as the Reset loading label (the system sheet's loading pattern; no
  Reset loading board).
- **My call:** the Reset server error sits above the primary button, mirroring Login.
- **My call:** the input rest-border contrast (1.52:1 on canvas) is flagged for the shared-look
  PR, not changed here.

### Questions for Jim

1. **Assets and consent.** Can you supply the white Masi lockup (or at least the mark) from the
   brand files, and the learner cut-out at full resolution, and confirm Masi has consent to show
   that child in the app? Without the files the screen cannot match the board; without consent we
   need a different photo.
2. **Reset link.** The reset email points at `masi-app://reset-password`, which the app does not
   handle (no deep-link setup, `updatePassword` unused). If the device check confirms it dead-ends,
   do we (a) ship the redesigned Forgot screen anyway and file the recovery screen as its own
   issue, or (b) hide "Forgot password?" until recovery works, so EAs are told to ask Head Office
   instead?
3. **Splash.** The cold-start splash is Expo's placeholder grid on white, followed by a full-red
   Login. Should the Login PR also set the splash to `red600` with the white mark (one config line
   plus the mark asset; needs the native build that PR gets anyway)?
