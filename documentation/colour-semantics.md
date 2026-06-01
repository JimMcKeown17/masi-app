# Colour Semantics — Audit & Convention

> Audit completed 2026-05 as part of issue #8 (visual ports). This records what the
> colours mean, what was reconciled, and the rule for keeping them consistent.

## The canonical palette

All semantic colour lives in `src/constants/colors.js`. Use the **token**, never the
raw hex, for anything that carries meaning:

| Token | Hex | Meaning |
|---|---|---|
| `primary` (`tabActive`, `info`) | `#294A99` | Blue — default UI: headers, nav, buttons, links, active states |
| `success` | `#3FA535` | Green — completed / positive / progress |
| `successBg` | `#D1FAE5` | Light green — success / synced / online **badge backgrounds** |
| `emphasis` (`error`) | `#E72D4D` | Red — emphasis, critical callouts, errors |
| `accent` (`warning`) | `#FFDD00` | Yellow — badges, dividers, accents, warnings |
| `textSecondary` (`tabInactive`) | `#6B7280` | Muted text / inactive |
| `disabled` (`placeholder`) | `#9CA3AF` | Disabled / placeholder |
| `background` / `surface` / `cardBackground` | `#F7F7F7` / `#FFF` / `#FAFAFA` | Surfaces |

This is **semantically aligned with the assessment band colours** (ADR-0003 /
`scoreBands.js`): green = good/above-benchmark, yellow = approaching/okay, red =
needs-work, grey = no-benchmark. Status colours app-wide should read the same way.

## Audit finding

The core semantic palette is **already tokenised** — element colours (text, primary,
success, emphasis, neutrals) use `colors.*`, not raw hex. The remaining hardcoded
hexes fall into two groups:

1. **Reconciled:** the success-tint badge background was the hex `#D1FAE5` repeated
   across `syncBadgeSynced` / `badgeOnline` on three screens. Promoted to
   `colors.successBg` (same value — zero visual change, one source of truth).
2. **Intentional one-offs (left as-is):** decorative pastels and brand gradients
   (e.g. the `['#0984E3', '#E72D4D']` header gradient, type-badge tints, info-card
   creams, chart colours). These are **not** an inconsistency to "fix" — they encode
   distinct, deliberate purposes.

## The rule

- **Semantic colour → token.** If a colour means "success / error / warning / primary /
  disabled," use the `colors.*` token so meaning stays consistent and re-tunes in one place.
- **Decorative one-off → hex is fine.** A specific pastel for a type badge, an info-card
  tint, or a gradient stop may stay a local hex. Do **not** mass-merge these into one
  token — e.g. the light yellows `#FEF3C7` (word-type badge), `#FFF8E1` (info card), and
  `#FFF9CC` (accent) look similar but mean different things; collapsing them would be wrong.
- **No new meaning without a token.** If a genuinely new *semantic* status appears (e.g. a
  shared "pending" tint used on multiple screens), add a token rather than a fresh hex.
