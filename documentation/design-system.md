# Design System — Colour, Typography, Spacing

**Standing doc.** Describes the present. If a code change contradicts it, update this file in the
same branch (see the anti-drift rule in `AGENTS.md`).

> Supersedes `BRANDING.md` and `colour-semantics.md` (both archived 2026-07-13). Those two described
> the retired blue-dominant system and, by the end, instructed readers to use two hex values that the
> test suite now actively forbids.

## Source of truth

| Concern | File | Enforced by |
|---|---|---|
| Colour, spacing, radii, shadows | `src/constants/colors.js` | `__tests__/colors.test.js` |
| Typography | `src/constants/typography.js` | (no guard yet — see Open work) |

**`__tests__/colors.test.js` is the authority, not this document.** It is fail-closed in three ways:
it pins every token's exact value, asserts the token key set is *exactly* the expected list (so adding
or dropping a token fails), and rejects any value outside an approved-hex set. If this document and
that test ever disagree, the test is right and this document is a bug.

## The system in one paragraph

Red-dominant on a warm canvas. Red (`primary` = `#E72D4D`) is the default UI colour for headers, nav,
primary buttons, and active states. Neutrals are warm, not grey (`INK #221A1B`, `MUTED #76696B`,
`CANVAS #F8F5F4`) — a cool grey next to brand red reads as dirty. Semantic error is a *different*
red (`#B3261E`) from brand red, deliberately, so "this is our brand" and "this went wrong" never
collide; the guard test asserts `colors.error !== colors.primary`. Amber (`#B26A00`) carries caution.
Green (`#3FA535`) carries success.

## Token groups

- **Red ramp** — `red50` … `red900`. The full scale exists so tints/shades come from the ramp rather
  than from ad-hoc lightening.
- **Brand** — `primary` (red500), `primaryLight` (red400), `primaryDark` (red600), `emphasis` (red500),
  `accent` (amber `#B26A00`, deliberately *not* red so it can sit beside primary).
- **Semantic** — `error` / `errorBg`, `warning` / `warningBg` / `warningText`, `success` / `successBg` /
  `successText` / `successBorder`, `info`.
- **Neutrals** — `background`, `surface`, `cardBackground`, `text`, `textSecondary`, `border`,
  `disabled`, `placeholder`.
- **Component** — `tabActive` (red600), `tabInactive`.
- **Dark hero band** — `heroDark`, `onDark`, `onDarkMuted`.
- **Session ring stages** — `ringNeutral`, `ringStart`.

Spacing `4 / 8 / 16 / 24 / 32 / 48`. Radii `sm 9 / md 14 / lg 18 / xl 22`. Two warm shadows
(`shadows.card`, `shadows.elevated`), both on `#3A2424`.

## Typography

`src/constants/typography.js` defines six roles: `screenTitle`, `cardTitle`, `body`, `caption`,
`statValue`, `sectionLabel`. Each carries size, weight, and colour together, so a role is applied as
one spread rather than reassembled per screen.

## The rule (unchanged, and still correct)

- **Semantic colour → token.** If a colour *means* something ("success", "error", "primary",
  "disabled"), use the `colors.*` token so the meaning stays consistent and re-tunes in one place.
- **Decorative one-off → a local hex is fine.** A specific pastel for a type badge or a gradient stop
  may stay local. Do not mass-merge these into one token: several light ambers look similar but mean
  different things, and collapsing them would destroy information.
- **No new meaning without a token.** A genuinely new *semantic* status (e.g. a shared "pending" tint
  used on more than one screen) gets a token, not a fresh hex. Note the guard test's exact-key-set
  assertion means adding a token is a deliberate act that must update the test.

Status colour is semantically aligned with the assessment score bands (ADR-0003, `src/utils/scoreBands.js`):
green = above benchmark, amber = approaching, red = needs work, grey = no benchmark. Status colour
app-wide should read the same way.

## Retired values

`#294A99` (blue) and `#FFDD00` (yellow) are the pre-June-2026 brand colours. They are listed in
`FORBIDDEN_VALUES` in the guard test and must never reappear in a token. If you are reading an older
document that tells you to use them, that document is stale — this one, and the test, are current.

## Open work

- **Typography has no guard test and effectively no adoption.** `src/constants/typography.js` has
  **one** importer against **82** raw `fontSize:` declarations across `src/`. Roadmap item 15
  (`documentation/improvements-2026-07.md`) calls for the token rollout plus a fail-closed size-floor
  guard test. Until that lands, typography is a token file that nothing uses.
- `ringNeutral` and `ringStart` are defined but have **zero importers** — dead tokens pending the
  staged ring-colour work (roadmap item 14c).
