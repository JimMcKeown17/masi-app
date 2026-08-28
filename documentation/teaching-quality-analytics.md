# Teaching-Quality Analytics

**Status:** Design / idea capture. Standing doc — update as signals are specified, built, or retired.
**Started:** 2026-07-24 (Jim + Claude, grill-with-docs session).

## Purpose

Define the backend analytics that answer the two questions Masi cares about most:

1. **Is the EA teaching each child at the right level?**
2. **Are the children actually learning?**

Everything here is derived from what EAs capture during literacy sessions. This doc is
**analysis-first**: each signal names the *check*, the *data it needs*, and *whether that data
exists today*. A capture field only earns its place on the form if it feeds a check we will run —
otherwise it is pure burden on a low-training EA.

## Core mental model: the taught / known pairing

For any skill, capture two things **separately**:

- **Taught** — what the EA worked on this session.
- **Known** — what the child can actually do.

**The gap between taught and known is the insight.** "Right level" means *taught* tracks slightly
ahead of *known*: not re-drilling mastered content, not leaping past the frontier.

| Skill | Taught (per session) | Known (per child) | Quality today |
|---|---|---|---|
| **Letters** | `activities.letters_focused` | `letter_mastery` rows — per-letter, evidence | **Strong** — both sides granular |
| **Blending** | `activities.session_reading_level` — one rung | `children.reading_level` — one EA-set label | **Weak** — both sides fuzzy labels |

Letters work because both sides are evidence against a canonical curriculum (`LETTER_ORDER`).
Blending is weak because both sides are a single fuzzy label. To reach parity, enrich one or both
sides of blending's pairing. **Destination (decided 2026-07-24): evidence-based blending "known."**

## Signals

### Tier 0 — Ready now, coarse, from existing data (no new capture, no form change)

A pure backend/analytics build on data already captured. **Decoupled** from the group-first session
rebuild and from any form work — the cheapest way to start answering both questions.

- **Check 2 — Blending level match.** Compare `session_reading_level` against each child's entry in
  the same session's `activities.child_reading_levels`. Flag a session pitched far above a child's
  rung.
- **Check 4 — Progression.** Chart each child's `reading_level` across their session snapshots plus
  `letter_mastery` growth over time. Flag stalls and implausible jumps.
- **Check 6 — Prerequisite sanity (coarse).** Cross-reference each child's `reading_level` rung
  against their *count of mastered letters*. Example red flag: "Word Reading rung with only 5 letters
  mastered." Needs **no** word-level capture.

### Tier 1 — Destination: evidence-based blending "known"

Capture, per child, **demonstrated** blending ability instead of an EA-set label.

**Definition (Jim, 2026-07-24):** for the letters a child knows, can they blend arbitrary
combinations at length 2, 3, and 4? e.g. known `{o, m}` → `om`, `mo` (length 2); `omo`, `momo`
(length 3/4). The child's blending frontier is the max combo length they can reliably blend, and the
evidence is tied to their *known letters* so "blends 3-letter combos of their 6 known letters" is
expressible.

- **Mirrors `letter_mastery`** — a per-child evidence primitive, captured via a tracker on the
  session form the same way the existing letter tracker works (`letterTrackerChanges`, keyed by
  `childId`).
- **Not blocked by the group-first rebuild (#6).** Per-child evidence is orthogonal to the session
  *shell*. The group work changes how attendees/`group_id` are selected, not how per-child mastery is
  recorded. So this investment is durable across that rebuild.
- Feeds an evidence-grade Check 4 (progression is *earned*, not a label the EA nudges) and sharpens
  Check 2.

#### Resolved capture mechanic (2026-07-24): single frontier, pre-filled

Chosen over per-length toggles and item-level combo marking because the claim is a *generalization*
(can blend arbitrary combos at length N), not a per-word result, and the 15-min block forbids a
mini-test.

- **One control per child:** the highest combo length reliably blended today —
  `None · 2 · 3 · 4 · Words`. Maps directly onto the existing `READING_LEVELS` rungs.
- **Pre-filled from the child's last demonstrated frontier**, EA confirms or bumps. Continuity is the
  default; a change is one tap; the usual case is zero taps. This is what makes it survivable per
  session.
- **Known letters shown as context** (from `letter_mastery`): "Known: a e o m s l". Makes the
  judgment concrete and lets the app gate the impossible case (no vowel known yet → blending not yet
  possible; offer only `None`).
- **Stored as per-session evidence**, reusing the existing `activities.child_reading_levels` snapshot
  slot but *reframed* from "set the child's level" to "what the child demonstrated today." Every
  foundational-template session writes a row, even an unchanged confirm — a datapoint at that rung on
  that date is exactly what Check 4 needs.
- **Durable current is derived, not EA-overwritten.** `children.reading_level` becomes "latest
  demonstrated frontier" rather than a free-set opinion. (Pre-fill reads this derived current.)

**Open sub-decisions (refine in the build spec, not blocking):**
- *Derivation policy* for the durable current: latest-demonstrated (honest default, handles a bad
  day as a real regression datapoint) vs highest-sustained (steadier for reporting). Default:
  latest-demonstrated for pre-fill; reporting may prefer highest-sustained.
- *Ladder cap:* the blending frontier tops out at **Word Reading**; `Sentence`/`Paragraph` rungs are
  reading *fluency*, a different axis. Convenient coherence: a child reaching Word Reading is roughly
  where the group graduates to the **Level 8+** template — so the same evidence that measures
  blending also signals the template transition.
- *Adherence still needed in Tier 1:* the frontier is the *known* side; the "blending practiced"
  checkbox remains the *taught-happened* boolean until Tier 2 captures actual blend content.

#### Adjacent leverage: known letters → suggested combos (links to item #5)

The same `letter_mastery` data that ties evidence to known letters can *suggest in-range combos to
blend* (`{o,m,s}` → "try `som`, `mos`"). That turns the app from measuring "right level" into
**helping the EA hit it** — a Zazi-style "what to do next" intelligence feature and the natural
on-ramp to Tier 2 taught-content capture. One dataset, three uses (tie evidence · gate impossible ·
coach next). Jim flagged this as very important (2026-07-24).

#### Hard evidence: the "1-Minute Word Reading" as an Assessment Question

The soft frontier tap is frequent but subjective. A quick word-reading probe gives **hard,
item-level evidence** — and Masi already uses one on paper (monster-names + real-words, ~1 min).

- **Nonsense ("monster") words isolate decoding/blending from sight vocabulary.** A child can't guess
  `fik` or `jush` from memory, so reading them is pure blending. Real words can be read by sight, so
  they measure *applied* word reading. The paper sheet pairs both deliberately.
- The monster list is **already ordered by blend length** (`om/pi/ak` → `del/sub/fik/gon` →
  `jush/rach/prev` = 2→3→4 letters), so how far the child gets *is* the blending frontier — hard
  evidence for the same axis the soft tap estimates.
- **This is an Assessment *Question* in the existing Battery/Run vocabulary**, not a new system. The
  app already carries a Word Reading EGRA stub (ROADMAP §7: placeholder word lists, unconfigured Word
  Reading bands). This sheet is candidate authoritative content; the lift is content + score bands +
  possibly a nonword column, and capture reuses the sequential/grid EGRA component.

**Architecture (recommended): two signals, calibrated — do NOT put a test in every teaching block.**
- *Soft / frequent:* in-session frontier tap (Tier 1). Cheap, every session, trend.
- *Hard / periodic:* 1-Minute Word Reading Question as a progress-check Run (out-of-Window), or inside
  a formal Window. Infrequent, ground-truth.
- *Calibrate:* hard evidence validates/corrects the soft trend — the same EA-vs-HQ calibration shape
  already designed for Q11. Soft frontier "Words" but reads 3 monsters → flag.
- An opt-in, light in-session quick-check is a possible *later* addition; a mandatory in-block test
  violates the no-ceremony constraint and is a non-goal.

**Term to promote to `CONTEXT.md` if it recurs:** *pseudoword / nonsense-word decoding* — reading
made-up words to isolate blending skill from sight-vocabulary memory.

### Tier 2 — Later: taught-side blend content + fine prerequisite check

Capture the **actual blend content** drilled (which combinations / words). Powers the *fine* Check 6
— validating each blend against the child's known letters. Heaviest capture; defer until Tier 0's
coarse Check 6 proves insufficient.

## Interim — blending adherence checkbox

Until blend *content* is captured (Tier 2), add a per-session **"blending practiced"** certification
so the backend knows the prescribed blending block actually happened. **Retire it once content
capture lands** — exactly as capturing `letters_focused` makes an "I taught letters" box
unnecessary. (Adherence for letters is already implicit for this reason.)

## Capture-integrity fixes this analytics work depends on

Garbage in the capture layer silently poisons every signal above.

- **Do not force letter selection.** `LiteracySessionForm` currently requires ≥1 letter
  (`if (selectedLetters.length === 0) errors.letters = ...`). A group that already knows all letter
  sounds has no letters to select, so the EA fakes a tap to clear the blocker — corrupting
  `letters_focused` and every letter-based check. Add an explicit **"children know all letters / no
  letters taught this session"** state.
- **Letters-mastered groups change lesson template.** Once a group masters letter sounds, the Shine
  Literacy plan transitions (Level 8+) away from phonics+blending to Review / Reading-to-child /
  Child-reads / Have-a-Go-Writing / Games. The session model must represent this **later template**,
  not only the foundational phonics+blending one. See `CONTEXT.md` (session structure).

## Open decision

**Ship-simple vs build-properly** — Jim 50/50 as of 2026-07-24.

Working resolution: **not XOR — stage it.**
1. **Now (free + tiny):** Tier 0 coarse signals, blending adherence checkbox, "no letters" escape.
2. **Next:** Tier 1 per-child blending evidence tracker — durable across the group rebuild.
3. **Later:** Tier 2 taught-content capture + fine Check 6.

Record the settled answer in `documentation/open-decisions-backlog.md` and the build log before
implementation.
