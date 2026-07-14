# Home & navigation redesign — decisions and handoff (July 2026)

**Read this first if you are picking up the main-screen redesign in a new session.**
It is the standing record of what was decided, why, and what is deliberately still open.
The mockups referenced live under `design/mockups-2026-07-b/` and `design/mockups-2026-07-c/`.

Author of the exploration: design pass with Jim, 2026-07-13 to 07-14. Jim is the decision-maker;
every "DECIDED" line below is his call.

---

## The decisions (locked)

| # | Decision | Why |
|---|----------|-----|
| D1 | **Palette: charcoal + Masi red. No rebrand.** | `heroDark #1C1517` and `primary #E72D4D` already exist in `src/constants/colors.js` and already pass the fail-closed guard `__tests__/colors.test.js`. The earlier warm palettes (round-two `mockups-2026-07-b`) were dropped precisely because they would have required a token migration and a brand decision. This costs neither. |
| D2 | **Progress widget: R3, the half gauge.** | Same legibility as a full ring, ~40% less vertical height. Height is the scarcest resource in the header where it lives. It draws "2 of 3 sessions today" (target 3, ceiling 5 — real values from `sessionGoal.js`). Alternatives compared in `mockups-2026-07-c/01-progress-options/`. |
| D3 | **Nav model: N3. The centre button RECORDS.** | The big centre FAB does the primary action (record a session) from anywhere, not navigate Home. An EA records 3–5 sessions/day and reads Insights ~weekly; the one-tap path belongs to the action. Jim's original sketch put Home in the centre (N2); he agreed N3 is right. |
| D4 | **Home layout: C1. Hero is pure status; body answers "who next".** | Because the nav records, the hero needs no CTA and becomes status only (greeting, clock state, half gauge). The body leads with **who to see next** — the `notSeenThisWeek` figure `dashboardStats.js:354` already computes but today only shows on the Sessions tab. |
| D5 | **Insights is promoted to the 5th tab** (Jim's three-bar chart icon). | The three "performance" rows come off the home page. Only the Settings gear stays as a header icon. |
| D6 | **The fifth slot is now spent, so Groups shares a tab: Option B, one "Learners" tab.** | Home · Learners · **[+ Record]** · Insights · Assess = five. "Learners" holds a Groups / Children toggle. Chosen over Option A (Groups *replaces* Children) because Jim's domain rules require deliberate whole-class access, and B does not force EAs to relearn where a child lives on the same release that changes the nav. |
| D7 | **Record is never disabled when clocked out.** | `useSessionLaunchGuard.js:30-58` does not block today — it offers "Clock In Now" / "Continue Anyway". That escape hatch is load-bearing: GPS fails in the field, and an EA who genuinely ran a session must still record it. A disabled button silently deletes that path and pushes toward *not recording real work*. |
| D8 | **The clock-in guard is a bottom sheet, not a Dialog** (standing project preference), and its escape hatch **states its cost**: "Record without clocking in" carries an amber warning — *"your hours for this session will not be counted. Only do this if your GPS will not lock."* | The cost stays on screen at the moment of the tap. |

### The staging plan for D5/D6

Ship the nav **now** as: Home · Children · **[+ Record]** · Insights · Assess (Sessions is *not* a tab;
recording is the FAB and history lives under Home as "Recent → View all"). When the group-centric
rebuild lands, Children becomes the "Learners" tab (Groups/Children toggle). The FAB and everything
above it are unaffected, so the nav is never re-decided twice.

---

## The canonical mockup

**`design/mockups-2026-07-c/04-locked/index.html`** is the source of truth for the locked design.
Its `preview.png` shows: Home clocked-in, Home not-clocked-in (FAB live), the clock-in bottom sheet,
and the "fifth slot" nav comparison with Option B marked DECIDED.

Supporting exploration (context, not spec):
- `mockups-2026-07-c/01-progress-options/` — six ways to draw the progress widget; R3 won.
- `mockups-2026-07-c/02-bottom-nav/` — the nav trade-off (N1/N2/N3); N3 won.
- `mockups-2026-07-c/03-red-charcoal-home/` — the home under both nav models.
- `mockups-2026-07-c/brand.css` — every token copied verbatim from `src/constants/colors.js`, with the source line noted. Use this, not a fresh palette.
- `mockups-2026-07-b/` — round two (warm palettes, de-bookified Ithemba). **Superseded by the charcoal+red decision (D1)**, kept for history and because its shared-markup/CSS-skin structure is reusable.

To regenerate any PNG: see the "regenerate" note in `mockups-2026-07-b/README.md`. Playwright is
deliberately kept out of the project's `package.json`.

---

## What the design assumes about the code (verify before building)

These are the real behaviours the mockups are built on. A build should confirm each still holds:

- **Record-from-anywhere already half-exists.** `HomeScreen.js:211` has a "Record Session" button today; `useSessionLaunchGuard.js:30` guards it. N3 makes that guard the FAB's behaviour.
- **The daily target is real but mislocated.** `sessionGoal.js:11` knows literacy target 3 / ceiling 5. `SessionsTodayRing` currently renders only on the Sessions tab. D2 moves it (as the half gauge) to Home.
- **"Who to see next" is computed but hidden.** `dashboardStats.js:354` = `notSeenThisWeek`, Sessions-tab only today.
- **The ring-stage colour tokens are dead.** `ringNeutral` / `ringStart` in `colors.js:78-79` have **zero importers** — they were defined for exactly this widget. Wire them (roadmap item 14c).

---

## Open questions this redesign hands to the group-centric rebuild

These are **not** design-undecided; they are dependencies the rebuild owns. Captured so they aren't lost.

1. **`sessions.group_id` is discarded on the server.** The client writes it locally (`sessionsRepository.js:233`); the server RLS strips it to NULL (`offlineSync.js:67`). Capturing group context on the home screen is pointless while the server drops it. **Fix this as part of the rebuild.** (Now recorded in `documentation/open-work.md` §4.)
2. **`GRANT_SUBJECTS` does not model membership-mediated grants** — a live tripwire that "must be extended before group-centric (whole-class) access ships" (`rls-sync-contract-map.md`, and `open-work.md` §6). Whole-class access is the rebuild.
3. **The "Learners" toggle needs a data answer:** one roster query filtered two ways, or two queries? Decide alongside the rebuild's repository work.
4. **Zero-class / zero-group onboarding** (`open-work.md` §2, 14a) is go-live blocking and interacts with this home screen: on a fresh backend every EA is the empty-state EA on day one. The C1 home needs an explicit empty state, not yet drawn.

---

## Suggested next steps (for the fresh session)

1. **Write the locked home as a spec** (`superpowers:brainstorming` is already done — the decisions above *are* the brainstorm output; go to `writing-plans`), then hand implementation to Codex via `codex-first`. Scope it to Home + the nav shell + the bottom-sheet guard. Leave the "Learners" tab as today's Children until the rebuild.
2. **Or** tackle the `sessions.group_id` server discard first (open question 1), since it blocks the value of group context everywhere downstream.
3. Draw the **zero-class empty state** for the C1 home before building — it is go-live blocking and currently unmocked.

Jim's stated go-live target is **1–2 weeks from 2026-07-14**, which makes the device-gate backlog
(`open-work.md` §0, 46 gates / 0 executed) and the seed script (`open-work.md` §0c) the true critical
path — the redesign should not crowd them out.
