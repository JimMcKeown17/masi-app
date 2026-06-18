# Masi App — Build Log

> **Purpose:** one chronological record of what was built and in what order — the durable
> "what was done, when, and why" history. This is the **master** log going forward; earlier
> per-slice logs will be folded in here over time (see *Logs to merge*).

## How this log works

- **Chronological, append-only.** Newest entries at the bottom of *Timeline*. Don't rewrite
  history — correct with a follow-up entry.
- Each task entry records: **date**, **item/task**, **what changed**, **tests** (command + result),
  **reviews** (Claude spec + Claude code-quality + Codex `/codex:adversarial-review` — two-LLM
  cross-review), how findings were engaged, and **commit SHA(s)**.
- **Build method this tranche:** Codex builds via `/codex:rescue` (TDD red→green→refactor),
  Claude orchestrates + reviews, Codex adversarially reviews. One branch + PR per item.

## Current tranche — Top 10 Improvements, Items 3–9

Source: [`documentation/top-10-improvements-2026-06.md`](./top-10-improvements-2026-06.md).
Items 1–2 (sync reliability) already shipped; Item 10 (push notifications) deferred to its own tranche.

| Item | Title | Theme | Status |
|------|-------|-------|--------|
| 3 | Design-token system (colour ramp, type scale, guard test) | Design system | ⏳ in progress |
| 4 | Step-by-Step capture + extracted capture spine | Workflow + arch | ☐ queued |
| 5 | Child Results workflow (row-tap → results, edit behind pencil) | Workflow | ☐ queued |
| 6 | Performance pass for low-end Android | Performance | ☐ queued |
| 7 | Motivation loop (onboarding, ring payoff, motion tiers) | Workflow + design | ☐ queued |
| 8 | Test the field-critical paths currently uncovered | Testing | ☐ queued |
| 9 | Architecture seams (storage facade, time-tracking, dates) | Architecture | ☐ queued |
| 10 | Head-office → field push/inbox | Capability | ⏸ deferred (own tranche) |

**Build order** (the guide's sequencing + the dependency graph): 3 → 4 → 8 → 5 → 7 → 6, with
Item 9 folded in continuously as each context/seam is touched.

## Logs to merge (pre-history)

Earlier logs that predate this master log; fold in chronologically when convenient:
- `documentation/sync-reliability-build-log.md` — Items 1–2 (sync reliability), 12 TDD tasks, device-verified 2026-06-17.
- `documentation/sqlite-refactor-log.md` — the clean-slate SQLite refactor history.
- (fork) `zazi-izandi-app/documentation/*build-log*.md` — companion-app history referenced by the ports.

---

## Timeline

### 2026-06-17 — Tranche kickoff (Items 3–9)

- Confirmed Items 1–2 (write-storm / sync reliability) complete, device-verified by Jim, merged to `main`.
- Verified the companion fork (`/Users/jimmckeown/Development/zazi-izandi-app`, `main`,
  tip `c183d3e`) and confirmed **all** portable assets the guide references exist
  (colours, capture spine, device-tier, contexts, full notification stack).
- Locked the execution model (see *How this log works*): Codex builds via `/codex:rescue`;
  Claude orchestrates + spec/quality reviews; Codex `/codex:adversarial-review` as the second
  reviewer; port the fork's field-tested design choices with Jim's sign-off; branch + PR per item.
- **Revised execution model (Jim, 2026-06-17):** build Items 3–9 **one item per session**,
  handing over to a fresh-context agent between items (via the `handoff` skill). This build-log
  + the Top-10 guide are the cross-session backbone, so context resets lose no knowledge.
  Confirmed: **keep Masi's blue brand — no orange.** The fork supplies token *architecture*, never *hue*.
- **Next:** Item 3 — design-token system (Masi-blue tint ramp derived from `#294A99`). Grounding the plan against fork + Masi `colors.js`.

### 2026-06-17 — Item 3: brand direction LOCKED (red-dominant, light Zazi canvas)

- **Decision (Jim):** red-dominant on a **light Zazi canvas**. Rationale: matches Masi's existing
  red-heavy web brand (solid red Donate CTA, red footer band, red section rules, red-tinted icon chips);
  blue read as generic/cold; red is a proven primary (Netflix/YouTube/Pinterest/Airbnb/Target). The
  field-tool canvas stays **light** (sunlight legibility) rather than the website's dark canvas; an
  optional **dark hero band** echoes the web drama.
- **Palette approach:** brand red derived from the existing `#E72D4D`; full 50–900 ramp; a
  **differentiated error red** (deeper/cooler + alert icon) to avoid brand-vs-error semantic collision;
  green stays semantic success (`#3FA535`) + success-surface trio; yellow minimised out of chrome;
  **no gradients** (solid fills); warm-light canvas + white cards + soft shadows; Zazi type hierarchy.
- **Next:** palette + mock Home screen rendered for Jim's visual sign-off → then write the Item 3 TDD
  plan → then orchestrate Codex builds with Claude + Codex dual review.

### 2026-06-17 — Item 3: palette SIGNED OFF (Jim) → plan written

- Rendered a visual mock (`documentation/design/item3-red-palette-preview.html` / `.png`) — red ramp,
  full token set, brand-vs-error separation, and a mock Home screen. **Jim approved as-is** ("looks so
  much better than I expected — I love it"). The five sign-off points (canvas warmth, red ramp, error
  separation, yellow retired, dark hero band) are all accepted.
- **Locked token values:**
  - Red ramp: `red50 #FDECEF · red100 #FBD5DC · red200 #F4A9B6 · red300 #EE7D90 · red400 #EC5470 ·
    red500 #E72D4D (brand) · red600 #C81F3E (primary fill/pressed, AA) · red700 #A4182F · red800 #7C1223 · red900 #530B17`
  - Canvas `#F8F5F4` · card `#FFFFFF` · ink `#221A1B` · muted `#76696B` · line `#ECE5E4`
  - primary `#E72D4D` · primaryDark `#C81F3E` · tabActive `#C81F3E`
  - error `#B3261E` · errorBg `#FCEAE8` · warning (deep amber, semantic only) `#B26A00`
  - success `#3FA535` · successBg `#E7F3E5` · successText `#2E7D27` · successBorder `#CDE8C9`
  - hero dark `#1C1517` · on-dark muted `#C9BFC0`
- Plan written: `docs/superpowers/plans/2026-06-17-item3-design-tokens.md` (6 TDD tasks).
- **Next:** dispatch Codex (TDD) for Task 1 (token foundation) → Claude spec + code-quality review →
  Codex `/codex:adversarial-review` → engage → commit.

<!-- append new entries below -->
