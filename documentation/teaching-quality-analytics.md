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
| **Blending** | `activities.lesson.blends_done` — actual item texts; `activities.session_reading_level` — highest ticked tier, or null | `children.reading_level` — one EA-set label | Taught items are granular; the known side remains an EA-set level |

Letters use the language's pedagogical order (`PEDAGOGICAL_ORDERS`; pack teaching order for lesson
advice, with A2 tracker alignment still separate). C2–C3 captures actual blend items; the known
side remains a label. **Destination (decided 2026-07-24): evidence-based blending "known."**

### Current capture evidence (C2–C3, 2026-10-22)

`buildLessonRecord` (`src/lessonPlan/lessonRecord.js:4`) writes the existing `letters_focused`
(allowed empty), nullable `session_reading_level`, save-time `child_reading_levels` snapshot and
`comments`, plus this nested `lesson` object. It adds no synced table:

| Key | Meaning |
|---|---|
| `version`, `pack_id`, `language` | `1`, pinned content pack id (nullable), lesson language code |
| `plan` | Dated advice: engine version, `made_on`, reason, history/mastery completeness, present child ids, known/suggested/review/unlocked letters, blend tier and suggestions, suggested book, Up-next group id |
| `plan_reason` | Only present as `'past_date'` when lesson date differs from plan `made_on`; `plan` is then null |
| `blend_tier_shown` | Displayed tier selection, falling back to the draft plan tier; distinct from the measured ticked level |
| `blends_done` | Ticked pack texts, including lower-tier top-ups at their own length |
| `books_read` | `{ id, how: 'printed' }` entries; separate from 1000 Stories' top-level count |
| `tracker_check` | `'marked'` if any present child has changes; else `'none'` if all present children have No one new yet; else null |

No blends ticked means **no measured blending level**, not inability. Save changes durable child
levels only for explicitly edited present children, while snapshotting every present child's
current/edited level. That snapshot is not demonstrated frontier evidence. Source:
`src/services/lessonSave.js:49`, `src/lessonPlan/lessonRecord.js:15`.
Release packs are letters-only; blend/book capture currently needs isiXhosa `preview-content`.

## Signals

### Tier 0 — Ready now, coarse, from existing data (no new capture, no form change)

A pure backend/analytics build on data already captured. **Decoupled** from the group-first session
rebuild and from any form work — the cheapest way to start answering both questions.

- **Check 2 — Blending level match.** Compare `session_reading_level` against each child's entry in
  the same session's `activities.child_reading_levels`. Flag a session pitched far above a child's
  rung. **Skip a null `session_reading_level`**: no blending was recorded, so there is no level
  to compare. Do not substitute `blend_tier_shown` or the suggestion tier.
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

### Tier 2 — Taught content captured; fine prerequisite analytics remain later

C2–C3 records the **actual blend content** ticked in `lesson.blends_done`. The fine Check 6 —
validating each blend against the child's known letters — is still analytics work. Capturing the
data does not establish that the check or an evidence-based known frontier is built.

## Interim — blending adherence checkbox

Superseded for lesson capture on 2026-10-22: ticked `lesson.blends_done` supplies the taught-content
record. Do not add a second **"blending practiced"** certification.

## Capture-integrity fixes this analytics work depends on

Garbage in the capture layer silently poisons every signal above.

- **Empty letters are supported.** C2–C3 retires `LiteracySessionForm` and permits
  `letters_focused: []`. An entirely empty lesson asks **Save without letters, blends or a book?**;
  at least one child remains mandatory (`src/screens/lessons/LessonWrapUpScreen.js:183`).
- **Letters-mastered groups change lesson template.** Once a group masters letter sounds, the Shine
  Literacy plan transitions (Level 8+) away from phonics+blending to Review / Reading-to-child /
  Child-reads / Have-a-Go-Writing / Games. The session model must represent this **later template**,
  not only the foundational phonics+blending one. See `CONTEXT.md` (session structure).

## Open decision

The staged proposal from 2026-07-24 is partly superseded by C2–C3: taught blend content and empty
letters are implemented. Tier 0 analytics, Tier 1 demonstrated-frontier capture, the later lesson
template and fine prerequisite checks remain separate work; the current reading-level selector
does not implement them.
