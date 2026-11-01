# Masi App

Domain glossary for the Masi field-staff mobile app. Masi runs multiple education programmes delivered by EAs (Education Assistants) in schools, and the app captures their day-to-day work — time, sessions, and assessments — offline-first against a SQLite local store and a Supabase backend.

## Language

### Roles and organisation

**EA** (Education Assistant):
A field worker who delivers Masi programme sessions to children in schools.
_Avoid_: "youth", "field staff", "user" — those are all loose.

**Organisation**:
The employer of a staff member. `users.organization_id` is a required label, set at account
creation. It does not define an access boundary or change the phone's behaviour. A partner
organisation is plausible within a year (Jim, 2026-10-14).
_Avoid_: treating an organisation as a Programme or an authorization scope.

**Head Office**:
The Masi back-office team that marks long-form field assessments and assigns children to groups for the Core Literacy and Numeracy programmes.
_Avoid_: "central", "admin".

### Programmes and delivery

**Programme**:
A distinct Masi education service line with its own pedagogy, grouping rule, assessment style, and EA workflow. Every domain row that is delivery-specific (session, group, child enrollment, EA assignment) is scoped by `programme_id`.
_Avoid_: "course", "track", "subject".

**Known programmes** (with grouping rule and daily session target):

| Programme code (proposed) | Display name | Group rule | Daily target | Notes |
|---|---|---|---|---|
| `core_literacy_r3` | Core Literacy (Grade R–3) | pairs (groups of 2) | 3 sessions (up to 5) | EA pulls 12 children out of the classroom. |
| `core_literacy_ecd` | Core Literacy (ECD) | pairs (groups of 2) | 5 sessions | Same pair structure, different age band. |
| `numeracy` | Numeracy | small groups of 5–7 | 5 sessions | Whole classroom divided up. A future R-3 vs ECD split is anticipated, same shape as Core Literacy. |
| `one_thousand_stories` | 1000 Stories | whole class | no daily target | Per-session `books_read` count captured inside `sessions.activities` JSON. |
| `yebo` (seeded as `yeboneer`) | Yebo | whole class or half class | 1 session per after-school block | Only the **after-school** block is a session. During-school-day Yebo is **attendance-only** (clock-in/out; EAs assist the teacher) — settled, not a session. Half-class A/B groups are **EA-owned/editable** (logistical split, not assessment-derived). |
| `zazi_izandi` | Zazi iZandi | small groups of 5–7 | n/a in Masi app | Delivered through the *separate* Zazi iZandi app; Masi app does not own its sessions today. |

Programme codes above are proposals based on this conversation, not yet in the database. Display names should be the labels EAs and admins recognise.

**Core Literacy session structure (Masi primary schools):** a session is a fixed prescribed template — ~15 min phonics/letters (games/activities, rotated through a set of ~8 sanctioned activities), ~15 min blending (prescribed blending-box practice — *not* an activity choice), ~5 min pair reading, ~20 min reading to the child. ECD Centres run the same shape in ~30-min sessions with no pair-reading block. The phonics and blending blocks are the two that carry pedagogical measurement; pair reading and read-to-child are prescribed but low measurement signal.

**A literacy session has more than one shape.** Once a group masters all letter sounds, the lesson plan transitions to a later template (Shine Literacy **Level 8+**): ~5 min review, ~15 min reading to child, ~15 min child reads, ~15 min have-a-go writing, ~10 min games/activities — **no dedicated phonics or blending block**. Consequence: capture must not assume every literacy session teaches new letters or blends. Forcing letter selection on every session is a bug — a letters-mastered group has none to pick, and the EA fakes a tap. See `documentation/teaching-quality-analytics.md`.

**Letters and blending are taught simultaneously in Masi, sequentially in Zazi iZandi.** In Masi Core Literacy, letter knowledge and blending are parallel skills worked in the same session from the start. In Zazi iZandi (the separate app/programme) blending is introduced only after letter mastery is achieved. Consequence: a "is this blend built on letter sounds the child already knows?" prerequisite check is meaningful for Masi (parallel teaching can outrun a child's letter knowledge) but is structurally guaranteed in Zazi. Do not conflate the two programmes' pedagogy in analysis or design.

**How groups are formed differs by programme, but the common thread is *teach at the right level*.** Score-based programmes — Core Literacy and Zazi iZandi (Numeracy: confirm) — **rank-order children by overall assessment score and pair/band children at similar levels**; grouping is therefore *not* a simple headcount split. Core Literacy additionally works only a **delivery subset of ~12 children** carved from the class (the pairs), keeping last-year children, removing those who have *graduated out* (learned to read / scored high enough), and backfilling with new children if short of the target pair count. Whole-class programmes (1000 Stories; whole/half-class Yebo) do not band at all — the whole class (or half) is the unit. **Group size is not fixed** — pairs of 2 are the literacy norm, but Masi is experimenting with other sizes (e.g. 4). The eventual home for all of this is a **per-programme grouping configuration matrix** (mode: band / partition / whole-class · size · rule). This grouping/auto-grouping logic is deferred; go-live groups are seeded and static.

**Groups are mildly fluid in delivery.** On a given day an EA may pull one child at a time (absent partner) or temporarily swap a child in. This is a session **attendance** difference (the attendee snapshot), NOT a change to durable group membership — later membership edits must never rewrite who attended an earlier session.

**Delivery mode** (proposed term, not yet schema):
Whether a programme works in small groups, pairs, or full-class. All current programmes are group-based — even 1-on-1 child work is recorded against a group of size 1.
_Avoid_: "group-based vs individual" (misleading — there is no truly individual programme).

**Class**:
A school classroom that an EA is assigned to. One school has many classes; a class is the population from which a programme's groups are drawn (or the whole group itself, for 1000 Stories and Yebo). A class carries the **grade** and the **academic year** — those are the canonical source for a child's grade history, not the child row.

**Grade**:
Lives on `classes.grade`, never directly on a child. A child's grade in any given year is derived by joining `children → child_class_memberships → classes`, scoped by `academic_year_id`. Mid-year class moves are modelled by ending the old membership (`exited_at`) and starting a new one. To recover the grade a child was in *at the time of an assessment or session*, look up the membership whose window covers the row's date — do not read the child's current class.

**Group**:
A roster of children an EA works with as a unit within a single programme. Every child in every programme is labeled with a group, even if the group is the whole class or a single child. Group composition rules differ per programme. A group always has exactly one `programme_id` and may optionally have a `class_id`.
_Avoid_: "cohort", "team".

**Class assignment** (`class_ea_assignments`):
The durable grant that makes an EA **responsible for a whole class** within one programme. It is the **primary access grant** and defines the EA's **assessment scope**: every child in the class is visible and assessable, including control-group children the EA never delivers to. Multiple EAs may hold an active class assignment for the same class (the active-unique index is keyed on `(class_id, ea_user_id, programme_id)`, not `(class_id, programme_id)`), which is how two EAs share 1A/1B/1C. A class assignment is durable across delivery churn — it does not end when the EA's last delivery child in the class leaves — and turnover is modelled by ending one EA's row (`unassigned_at`, `handover_reason`) and inserting the successor's.
_Avoid_: treating class assignment as "the class I currently deliver in" — it is broader than delivery and outlives it.

**Delivery assignment** (`child_ea_assignments`):
The grant naming the **subset of children an EA runs the intervention with** (e.g. the 12 Core Literacy children in 6 pairs). It defines the EA's **delivery scope** and drives "My Children," session attendee pickers, and daily session targets. Delivery scope is a subset of assessment scope: an EA delivers to some of the children in a class they assess.
_Avoid_: using the delivery roster ("My Children") as if it were the class roster — the class is wider.

**Control child**:
A child with an open membership in a class the EA holds an active class assignment for, whom
that EA does not deliver to. The child is assessable through class scope, without a delivery
assignment or Programme enrollment. Control is relative to the EA: another EA may deliver to
that child. Control children never appear in that EA's delivery surfaces: My Children,
ClassDetail, session/attendee pickers, groups, daily session targets, or delivery rankings.
Assessing a control child does not create a delivery assignment.

**History reference child**:
A child record a phone holds only because the child attended a session, or has an assessment, Battery Run, letter mastery or skill mastery record, the EA may read; it carries identity and display name and nothing else.
_Avoid_: treating a history reference child as roster, enrollment, assessment scope, or write authority; "phantom child", "stub child", "ghost row".

**Assessment scope vs delivery scope** (the two-tier access model):
An EA holds **one class assignment per class** and, within it, a **delivery assignment over a subset**. Assessment/replacement access is class-scoped; delivery access is subset-scoped. When two or more EAs share a class and split the assessing between them ("each does half a class"), that split is **soft coordination the app permits but never enforces** — both EAs are authorized over the whole shared class, and the app must not encode the labour split as a permission boundary. See ADR-0005.

**Grouping** (the activity):
The act of assigning children to groups. Currently done in two ways:
- **Office grouping** — for Core Literacy and Numeracy: EAs run long-form assessments in the field, send results to Head Office, Head Office marks them and assigns groups, then sends group assignments back to EAs.
- **In-app auto-grouping** — currently only Zazi iZandi does this (in the separate app), using short assessment results to compute groups on-device.

There is an open product question (not a current commitment) about how much of the Core Literacy / Numeracy assessment can move into the app so that auto-grouping replaces office grouping for those programmes too.

### Work capture

**Clock-in / clock-out**:
The start/end of an EA's shift, recorded independently of location availability. A manual
clock action attempts approximate location for at most 10 seconds after permission recovery,
then saves either a complete coordinate pair or no coordinates, plus the outcome (`fix`,
`timeout`, `denied`, `services_off`, or `unavailable`). NULL outcome means not recorded by an
older build or automatic clock-out. Opening Settings hands control back to the EA and saves
nothing until they return and tap again or choose Continue Without Location.
A clock-out after ten hours uses the automatic close at `sign_in_time + 10 h`, with no sign-out
location and a Home notice. It skips location capture if already overdue and checks again after
capture; a manual close at or before ten hours keeps its actual time and location outcome.

**Session**:
A single block of work an EA does with one group of children under one programme. The settled rule is **one session = one group-block of work**; EAs never work with two groups in one session. Always scoped to one `programme_id` (NOT NULL); new literacy lessons also store their fixed `group_id` and `class_id` (`src/lessonPlan/lessonRecord.js:33`). Group id remains nullable for older records. The server references `groups.id`; the phone retains a historical group id even without its roster row (SQLite v18). Since groups carry `grouping_version_id`, session group identity retains the grouping context rather than following later regrouping. Programme-specific attributes (e.g., `books_read` for 1000 Stories) live inside the existing `sessions.activities` JSON, not new schema columns.

**Lesson**:
One group's teaching block, from choosing the group through teaching to saving one session.
Advice comes from the children present; the saved record belongs to the group. Attendance changes
for today do not change group membership. Only the children present are saved; who was absent is
worked out from the group's membership on that date, never stored (ADR-0010).

**Lesson screen**:
The screen kept open while teaching: Who's here, letters, blending and (outside ECD) pair reading.
The first letter, blend or book tick fixes the plan. Attendance can refresh an unfrozen plan only
on its own day. **Wrap up →** opens a separate screen for recording what children know.

**Wrap up**:
The screen for confirming independent letter knowledge, changed reading levels, date and notes,
then **Save session**. Teaching a letter today does not count as knowing it without help.
Back returns to the Lesson screen; Back waits while Save is in flight.

**Lesson in progress**:
The EA's one unsaved lesson draft. Opening a Lesson screen writes nothing; the first change,
or entering Wrap up, creates the draft. An untouched screen takes its date from its first change.
The persisted draft keeps its class, language code, content pack, lesson date and session id
across resume. It lives in local `lesson_drafts` in that EA's database. Home's first attention
card offers **Resume**, without a clock-in check or dismiss button. Leaving asks first and keeps
the draft; **Discard lesson** is a separate confirmed action.
_Avoid_: "session in progress" (`sessions.state` is unused for drafts).

Source: `src/lessonPlan/lessonDraftState.js:5`, `src/hooks/useLessonDraft.js:15`,
`src/hooks/useLessonDraft.js:99`, `src/screens/lessons/LessonScreen.js:52`,
`src/screens/lessons/LessonWrapUpScreen.js:78`, `src/utils/homeAttention.js:21`.

**Current reading level**:
The EA's current working classification for a child in the literacy programme. It is nullable durable child state on `children.reading_level`, so the next session and the child screens show the latest saved value. A literacy session also stores `activities.child_reading_levels`, a historical snapshot for the children who actually attended that session. The snapshot must not be used as the current value because later progress must not rewrite history. `activities.session_reading_level` is different again: it describes the level targeted by the session as a whole.

The `READING_LEVELS` ladder in `src/constants/literacyConstants.js` (Cannot blend → 2/3/4 Letter Blends → Word → Sentence → Paragraph Reading) **is the blending progression**, so **"blending level" is a synonym for "reading level"** — use "reading level". Today the value is a single EA-set label; the agreed destination is to make this *known* side **evidence-based** — demonstrated blending of combinations of the child's known letters at length 2/3/4 (see `documentation/teaching-quality-analytics.md`).

**Maths skill**:
One of the ten things the tracker follows (§4.1).

**Step**:
One number size within a skill. Steps include the ones below them: "up to 10" also covers 1–5.

**Step key**:
The stable id of a step, `<skill>.<size>`, for example `add.10` or `skip_count.5s`. A key's meaning never changes; a changed meaning gets a new key.

These meanings come from the numeracy design §3; §4.1 there lists the ten skills.
See **Band** below for EGMA's assessment item term; the words are not interchangeable.
_Avoid_: "band" for a step (it is EGMA's word). Use skill and step in EA copy.

**What the child knows**:
The EA's current statement of where each child is: **Letter mastery**, **Skill mastery (tick)** and **Current reading level**. This is the app's central output. It is how Head Office learns what every child knows and what level they are at. It is current child state, not history: a later update replaces the earlier statement, while sessions and assessments keep the historical record.

**Letter mastery**:
The letters an EA is sure a child has mastered. A letter is mastered if **either** source says so (settled 2026-09-23). **Assessment evidence**: each letter takes its status from the newest non-skipped Letter result **from the current academic year** in the selected language that reached that letter, whether standalone, WelaPLUS Q1 or Full EGRA, and whoever recorded it. A letter the chart does not ask, or the child does not reach in time, keeps its earlier evidence (Jim, 2026-10-27; DBE English HL 3 never asks q, v, x or z). The active year's start and end dates are inclusive; with no active year there is no assessment evidence, while EA confirmations still count (lesson-plan C23, Assessment Results Plan 3 Task 10). Read the stored item prompts, correctness and `metadata.reached`; case-fold both prompts and the language's 26 tracker letters. In that result, a letter in that set is mastered when every reached occurrence is correct. This evidence is computed when shown, never stored as a confirmation, and an EA cannot un-mark it; a new result is how it changes. **EA confirmation**: an EA taps that they are sure the child has mastered the letter, stored in `letter_mastery`. Letter mastery is part of **What the child knows**, so it is current state, not academic-year history. The stored confirmation is **one current record per child, letter and language code**, with the last writer in `changed_by`; `letter_mastery.language` holds `en`/`xh`/`af`/`zu`. Any current deliverer's confirmation counts, whoever recorded it and in any Programme. A refused (terminal) correction never counts. Built in Assessment Results Plan 2; hosted application and device checks remain Task 7. A confirmation made in the session tracker keeps the language of the tracker it was tapped in; saving never re-derives it. The tracker and the Letter mastery ranking both take the language from the child's active class membership, preferring the active academic year; a child with no active class shows 0/26 in the ranking and the row cannot open the tracker. An unknown class language supplies no assessment evidence or English fallback; the tracker shows “No letter set for this class language.”
_Avoid_: "taught letters", "coach-taught", "ticks". The retired `letter_mastery.source = 'taught'` value and some older docs use "taught", which is misleading: teaching is recorded as **Letters focused**, not as mastery.

**Skill mastery (tick)**:
An EA's tick is one current record per child and step key in `skill_mastery`.
It counts from any current deliverer and any Programme. The last writer is kept in
`changed_by`. The most recently made correction wins. A refused correction never counts.
The server accepts any well-formed step key, including keys outside the phone's bundled
curriculum. The phone checks its curriculum when an EA writes a tick. This is current
child state, with no academic-year bound. Hosted application remains Task 7.

**Known step**:
A step that EGMA shows, that an EA ticked, or that sits below a known step in the same maths
skill. Higher steps include lower ones: knowing Add up to 10 implies Add up to 5. Implied
steps are worked out when needed and never written as ticks. Removing the higher tick
returns each lower step to its own evidence and tick state. EGMA evidence wins over a tick;
an EA cannot remove that evidence by unticking. EGMA evidence uses the active academic year
and Programme; ticks count across both.

**Letters focused**:
The letters an EA worked on in one literacy session (`sessions.activities.letters_focused`). A record of teaching in that session, not a claim about what the child knows.
_Avoid_: treating letters focused as mastery evidence, or as "taught letters" in the mastery sense.

**Lesson plan**:
The advice for one session with one group. It is computed from the children present and gives
letters (two, or every unknown step-1 letter on a first session), blends at a blend tier, and
one early reader. It is advice, not a record: what was taught is still recorded as letters
focused, blends done and books read. Saved as `activities.lesson.plan`, it belongs to the day
it was made (C14).
_Avoid_: calling the session record itself a "lesson plan".

**Up next**:
The group suggested first when the EA starts a session. It is the group whose current members
were seen least recently (never-seen groups first), skipping groups seen today; ties go to the
fewest sessions this week, then the lower group number. The EA may choose any group.

**Last seen**:
The most recent day this school year, in this programme, that any of a group's current children
had a lesson, with any group and any EA. A child added to another group's lesson for the day
counts toward their own group's last seen.
_Avoid_: last taught (a group can be "seen" through one child's lesson elsewhere)

**Blend tier**:
The length of blending items a child practises, from their reading level. Cannot blend and
Not set give 2-letter; 3 and 4 Letter Blends give 3- and 4-letter; Word, Sentence and Paragraph
Reading give words. Labels are the ladder's own (`2 Letter Blends`, `3 Letter Blends`,
`4 Letter Blends`, `Word Reading`). A lesson defaults to the lowest present child's tier.

**Letter order**:
A language's teaching sequence, arranged in steps and defined in the letter order registry.
It determines which letters come next, not which letters a child has mastered.

**Letter order edition**:
A set of letter orders, one per language. Each class records one edition, set by the server and
never changed. The class's edition and language together identify its teaching order.

**Content pack**:
The immutable teaching content for one language at one version, produced by the early reader
books project (the same file Zazi reads) and bundled in the app: letter steps, per-step syllables
(blends) and headline words, the word bank, and early readers. A pack names its `letter_order`
and is chosen by the class's letter order. A **release** pack holds only reviewed content and is
the only kind a field build loads; a **preview** pack holds unreviewed candidates and is available
only in developer builds. An **interim letters-only pack** supplies the letter steps until a
reviewed pack with blends and readers is available.
_Avoid_: "curriculum" or "sequence file" for the whole pack; confusing it with an **Item set**
(assessment content); editing a pack in place (a change is a new version).

**Submitted assessment**:
An assessment is submitted when the EA finishes it and the app saves it. Today that save is the only persistence point. Before submission the EA may change any mark freely. After submission the assessment and its answers are locked: EAs may add assessments and answers but never change or delete them. A child who needs re-assessing gets a new attempt, and the latest attempt is canonical.
_Avoid_: "edit an assessment" for anything after submission. That is a new attempt.

**Assessment Question**:
A single, self-contained subtest with its own item shape, capture mechanics (timed grid, multiple-choice answers, per-word marking, rubric, etc.), scoring rule, and React component. Examples: "Letter Sounds", "WelaPLUS Listening Comprehension", "WelaPLUS Story Writing". A Question is the OSS unit — one component per Question, replaceable independently of any other Question. Matches the WelaPLUS PDF's own naming convention ("Question 1: Letter Sounds", "Question 2: Listening Comprehension", etc.).
_Avoid_: "subtest" in user-facing copy (use "Question"); "Tool" (deprecated; was used in earlier drafts before alignment with WelaPLUS PDF naming); lowercase "question" for individual prompts within a Question (use "item" — a Question contains many items).

**Letter result**:
A saved Question result whose `question_code` is `letter_sounds`. Standalone Letter Sounds, WelaPLUS Q1 and the letter section of every **EGRA form** use the same shape (EGRA forms bring their own item sets; Jim, 2026-10-23: “that letter sounds question is actually just the first part of the EGRA”); `battery_run_id` says where it was taken, not what it measures. Readers select by Question code, not by `assessment_type` or Battery. Assessment evidence can come from any recorder in the active Programme. Skipped results provide no mastery or assessed-count evidence.
_Avoid_: treating a Battery Question as a separate kind of letter evidence.

**Item set**:
The versioned data used by a Question: its `question_code`, `question_version`, language, prompts and layout (including rows where supplied), plus a stop rule where applicable. The id is `${question_code}@${question_version}.${language}` and is stored on the result. Bundled sets live in `src/assessment-questions/itemsets/`; current aliases choose new tests, while readers use stored prompts and the stored set id. Languages use `en`, `xh`, `af` and `zu`. The **shared reading sets** (`question_version` `2026.3`, built at load from `content/egra/` in `src/assessment-questions/egra/sharedReading.ts`) give `letter_sounds`, `word_reading`, `oral_reading` and `reading_comprehension` in all four languages, each recording its `source_form_id`; WelaPLUS 2026.1, Full EGRA 2026.1 and the quick tests all use them (2026-10-26 spec). Shared sets resolve only for version `2026.3`; older versions resolve only their own sets. WelaPLUS runs in `en` and `xh`. **EGRA form** item sets are built at load from `content/egra/` (all four languages); their `question_version` is the pack's assessment id, so `letter_sounds@dbe-egra-en-fal-2-v1.en` names the form, the section and the language, and an item's `position + 1` is the pack's one-based item id. The exception is a **Masi-extended letter card** (below), whose version is `<form id>-masi60`. A missing language or set means ask/show no set, never substitute English.
_Avoid_: treating positions in a current constant array as the meaning of saved items.

**Card row**:
One row on the child's printed card, in the item set's reading order. It stays the content
reference even when the phone re-flows its items into several display rows; saved sequential
items retain the card-row index (`src/assessment-questions/progress/SequentialCapture.tsx:19`,
`src/assessment-questions/progress/SequentialCapture.tsx:143`).
_Avoid_: using “row” interchangeably for a printed card row and a phone display row.

**Page**:
A display grouping of whole card rows, never the unit of meaning. A single card row larger
than the page capacity spans consecutive pages labelled with that card row. Capacity and
columns belong to the Question layout, while item positions and card-row identity remain
stable (`src/assessment-questions/ui/paginate.ts:1`,
`src/assessment-questions/ui/paginate.ts:49`, `src/assessment-questions/ui/paginate.ts:70`).
_Avoid_: using a page number as saved item identity, a scoring boundary, or a content version.

**Stop rule**:
**First row all wrong** for letters and words, everywhere: `{ kind: 'first_row_all_wrong', first_row_length }`, a stop when every item in the first printed row is marked wrong (Jim, 2026-10-23 for EGRA; 2026-10-25 for all hosts). The shared 2026.3 sets use it in WelaPLUS 2026.1, Full EGRA 2026.1 and the quick tests (first row: 10 letters; 8 words, 5 for isiZulu). The timer stops and the card says the test has stopped, with **Save result** and **Undo last mark**. There is no warning stage, switch-off or resume action. Undo removes the last mark and reopens capture; saving records `stopped_reason = 'stop_rule'`. Unreached items are not mastery evidence. Older versions keep their own rules: `letter_sounds@2026.2` (WelaPLUS 2024.1 Q1) stops at ten consecutive incorrect marks (`{ kind: 'consecutive_wrong', stop_at: 10 }`), and `word_reading@2026.1` and WelaPLUS 2024.1 Q6 have none. Stories have no stop rule because the pack has no printed line breaks.
_Avoid_: calling this a soft warning that the EA can override.

**Assessment Battery**:
A named, ordered set of Assessment Questions that are administered together as one body of work on one child. Examples: "WelaPLUS Full", "EGRA Letters-only", "EGRA Full". A Battery is what a programme administrator picks; the Questions inside it are the implementation. The same Question may appear in many Batteries.
_Avoid_: "assessment" when you mean Battery (it's ambiguous with the per-Question result row).

**EGRA form**:
One of the 13 source-transcribed forms in the shared content pack `content/egra/` (isiXhosa HL 1–3, English HL 1–3, English FAL 1–3, Afrikaans HL 1–3, isiZulu SMRS 1), run as one Battery of four Questions: `letter_sounds`, `word_reading` (familiar words), `oral_reading` (the passage) and `reading_comprehension` (five questions marked Correct / Incorrect step by step; unasked questions are the not-reached tail and do not count towards the score; the answer key is a guide, never matched). Battery code `egra`, battery version = the pack's assessment id. Its language is fixed by the form, not the class: English FAL is English even in an isiXhosa class. The number is the source form, not a school grade. **Since 2026-10-26 the 13 forms are no longer offered for new assessments**: Full EGRA 2026.1 replaced the form picker. They stay registered so saved and unfinished assessments still open and read correctly. The four Grade 1 forms carry a **Masi-extended letter card** (the 40 DBE letters, then 20 Masi letters from `src/assessment-questions/egra/letterExtensions.ts`, version `<form id>-masi60`) from the earlier rule that Masi letter cards are never shorter than 60 letters; Jim replaced that rule on 2026-10-25 with the 100-letter DBE charts (110 for isiZulu), so the extension now matters only for finishing an unfinished old Grade 1 assessment (saved results keep their own letter prompts and read without it). **Story comprehension auto-skips** (`skipped_prerequisite_unmet`, shown as “No story words read” beside the Skipped chip) when the story scored 0 or was skipped (Jim, 2026-10-23); the old forms' Q4 is now titled Story comprehension too.
_Avoid_: “EGRA” alone for a form (say which form), merging English HL and FAL, or treating a form's printed heading count as its item count.

**Full EGRA**:
The four-part EGRA assessment: Letter sounds, Familiar words, Reading a story and Story
comprehension, on the shared reading sets. One Battery, `egra@2026.1`, in isiXhosa, English (Home
Language), Afrikaans or isiZulu, opening in the child's class language (the language sheet offers
the four when the class has none; any other class language shows “Not available in … yet”).
English First Additional Language classes get the Home Language content. It is offered alongside
the programme default to every literacy EA with an active programme (Jim, 2026-10-25); numeracy
EAs never see it (Jim, 2026-10-31). It has no first-row skip rule; only Story comprehension
auto-skips.

**Reading Card 2026.3**:
The one printed reading card per language that WelaPLUS 2026.1, Full EGRA 2026.1 and the quick
tests share: side A letters, side B words, side C story, and (English and isiXhosa only) side D
for the WelaPLUS sentences. Footers read `Reading Card 2026.3 · XH · side A`. Its printed first
rows are load-bearing, because the first-row stop and the skip rule read them. Brief:
`documentation/welaplus-printout-pack.md`.

**Maths Battery**:
The numeracy programme's one assessment, `masi_maths`, titled "Maths assessment": 17 Questions in
English, nine **early number Questions** first, then the eight **Core EGMA Questions** they gate.
It is built from the EGMA content pack (`content/egma/`, one form per language) by
`src/assessment-questions/egma/adapter.ts`. The draft identity `masi_maths@2026.1-draft` (form
`masi-egma-en-2026-1-draft`) is used until the freeze; the freeze then adds
`masi_maths@2026.1` and supersedes the draft. It is English only for now and uses `fixedLanguage`,
so children in any class can take it. Spec:
`docs/superpowers/specs/2026-10-31-egma-maths-assessment-design.md`; ADR 0012.
_Avoid_: "EGMA" for the whole Battery (EGMA is only the eight Core Questions), "maths test".

**Early number Question**:
One of the nine Masi-authored maths Questions that come before Core EGMA and match the partner's
Weeks 1–4 skills: Count aloud, Finger flash, Count out counters, Read numbers to 20, Which is
more?, Before and after, Add with counters, Take away with counters, Make 5 and make 10. Codes
start `maths_`. They stop after 3 wrong in a row (Count aloud stops at the first mistake). The two
counters Questions record how the child got each correct answer (`metadata.strategy`).
_Avoid_: "pre-EGMA", "floor tasks", "subitising" (EA copy says Finger flash).

**Core EGMA Question**:
One of the eight toolkit Questions (RTI EGMA, 2014): Read big numbers, Bigger number, Missing
number, Addition 1 and 2, Subtraction 1 and 2, and Word problems. Codes start `egma_`. Each is
gated by an early number Question (or its level 1) and shows "Not ready yet" when skipped that
way. They stop after 4 wrong in a row, including the three 60-second Questions (a deviation from
the toolkit, accepted for now by Jim on 2026-10-31). Addition, Subtraction and Word problems end
with a **strategy observation**.
_Avoid_: "EGMA subtask" in EA copy; numbering them ("Task 6").

**Number Card**:
The printed card for the Maths Battery, nine A4 pages of numerals only, generated from the pack by
`scripts/number-card.cjs` (`design/number-card/`). Each Question that needs it names its page
("Number Card 2026.1 · EN · page 6"). It carries no answers and no words.
_Avoid_: "reading card" for maths, "stimulus sheet".

**Band**:
The number range a maths item works in: the smallest of 5, 10, 20, 50, 100 and 1000 at or above
the largest number in the item. Every maths item is saved with `metadata.skill` and
`metadata.band`, so one result is evidence for a `{skill, band}` cell in the numeracy tracker.
_Avoid_: "level" or "rung" (levels are Core EGMA's 1 and 2; "rung" is not EA language).

**Strategy observation**:
How a child worked out answers. Per item on the two counters Questions ("Counted from 1",
"Started from the first number", "Just knew", saved as `count_all | count_on | known`), and once at
the end of each Core arithmetic Question ("In their head", "Fingers", "Counters", "Paper",
"Couldn't tell", saved as `derived.strategies`). It is not asked when nothing was correct. EA copy
never says "counting on".
_Avoid_: "method", "strategy score".

**Skip rule**:
A Battery's automatic skip of later Questions when a trigger Question's saved first row is all
reached and all wrong (read from the marks, not the stop reason). WelaPLUS 2026.1: a wrong first
row in Letter sounds (Q1) or Letter writing (Q5) skips Q6–Q12; in Reading words (Q6), Q7–Q12.
Q2–Q5 always run. The earliest trigger owns the skips. Skips save as
`skipped_prerequisite_unmet`, the EA cannot undo them, and their rows say why beside a **Skipped**
chip (“Letters first row wrong”); a one-off **skip card** explains them to the EA. Ending a Question
before its first row is fully marked, a manual skip, or an unmarked first-row item never triggers
(early endings are to be revisited, ROADMAP §8). Older Batteries have no skip
rule. A per-EA switch with a Head Office lock is deferred (ROADMAP §8).
_Avoid_: “prerequisite” for the first-row rule; a prerequisite is one Question's minimum score
on another.

**Battery Run**:
One EA administering one Battery to one child on one date. Materialised as N `assessment` rows — one per Question in the Battery — all sharing a `battery_run_id`. Partial completion is per-Question: an EA can finish Letter Sounds and pause before Story Writing, and the Run remains open until all Questions are marked complete or explicitly abandoned. Multiple Runs of the same Battery on the same child are allowed; the most-recent Run is canonical for reporting, all prior Runs are retained for audit.
User-facing copy calls a Battery Run an "assessment" (Jim, 2026-10-25: field staff never say "run"); "Run" and "Battery Run" stay the internal, code and documentation terms.
_Avoid_: "assessment session" — sessions are programme delivery work, not assessment work; "run" in user-facing copy.

**Run code**:
The six-character paper label for a Battery Run, displayed as `XXX-XXX` and copied with the
child's name onto the Writing Sheet. It is derived from the first 30 bits of the Run's UUID
using Crockford base 32 (`0123456789ABCDEFGHJKMNPQRSTVWXYZ`). Head Office uses it with the
child's name to match the paper to the exact Run, including when a child has multiple Runs
on the same day. The full UUID remains the stored Run identifier; the short code is not a
separate identifier or a guarantee of global uniqueness. Shown to EAs and printed on the Writing Sheet as "Assessment code".
_Avoid_: "assessment number", treating a Run code as a child identifier, using it as a database key, or "run" in user-facing copy.

**Assessment Window**:
A calendar period during which a wave of formal assessment is collected — typically `baseline`, `midline`, `endline` per programme per academic year. A Window exists so that "the 2026 Midline average for Grade 1 Core Literacy" is a comparable number: every Run inside that Window was captured during the same defined period. Windows are configured by Masi admin (not by EAs).
_Avoid_: "assessment period" — too vague; "term" — overlaps with the school calendar.

**Progress check** (a Run with no Window):
A Battery Run captured *between* the canonical Windows for ad-hoc check-ins on a child's progress. Stored with `assessment_window_id = NULL`. Visible to the EA, but excluded from windowed roll-ups so it does not pollute baseline/midline/endline reporting.

**Marking mode** (per-Question attribute, not glossary-critical):
Either `ea_marks_live` (EA scores on the device while the child responds), `ea_marks_from_paper` (child writes on paper, EA marks each item on the device as the child works), or `head_office_marks` (paper-only, no in-app capture — fully retired path, kept only for Questions we cannot move into the app). The first two are both "in-app" from a sync/data perspective; the distinction is only about *what the EA looks at while scoring*.

**Capture mode** (per-`assessment`, stamped at creation — `assessments.capture_mode`):
Which capture *mechanic* the EA used to record a Question's items. **Step-by-step (`sequential`) is the mechanic for every Question in WelaPLUS and Full EGRA except the Story Writing rubric, and for the standalone letter and word tests.** They share `SequentialCapture`: Correct / Incorrect / Back, tap-to-flip and review before Finish. Every converted Question emits `capture_mode: 'sequential'`; the host persists it when saving. `capture_mode` null marks results saved by the old toggle and last-word paths. The nullable database column also retains historical `grid` values; current settings never reinterpret a saved result. This is orthogonal to marking mode (who scores and from what).
_Avoid_: conflating **capture mode** (which UI mechanic) with **marking mode** (who marks) — different axes.

> The legacy terms **Field Assessment** (long-form, HQ-marked) and **In-App Assessment** (short, app-marked) are retired in favor of the Question / Battery / Run / marking-mode vocabulary above. They described a workflow distinction that no longer holds once WelaPLUS Questions are EA-marked in the app: a Battery can mix marking modes per Question.

### Devices and sync

**Signed-in EA handle**:
The single object that represents who is working on this phone right now: the EA's id, an epoch, that EA's own local database file (`masi-<userId>.db`), a data client and a request queue. It is the only way production code reaches local data or the server. Signing out revokes it at once; work begun under it and resumed later is **stale** and is refused rather than landing in the next EA's file or account.
_Avoid_: "the database" or "the current user" as ambient globals — every consumer is handed a handle.

**Unsent**:
An outbox row whose status is `pending`, `failed`, `in_flight`, or `terminal`. `terminal` counts because the server does not have that work, even though the app will not retry it on its own.

**Left-behind work**:
Unsent rows in one EA's file while a different EA is signed in on the same phone. They stay in that EA's file, untouched, until that EA signs in again; another EA never uploads them.

**Incident** (support incident):
The phone's durable record that it observed a reportable condition, held in its
EA's `support_incident_queue`. It does not upload left-behind domain work.

**Condition**:
What an incident is about: `(reporter, kind, condition key)`. Multiple receipts
can report the same condition; it is not itself a diagnosed causal bug.

**Receipt**:
One immutable server row in `mobile_support_incidents`: one report of one
condition. Daily kinds can re-report a persisting condition about once a day;
Plan 3 episode kinds use once cadence while retained locally. A receipt is a
lead, not proof of data loss, current impact, backend convergence or recovery.

**Diagnostic bundle**:
A JSON file uploaded to private Storage with a support export, bounded log tail
and device state at capture time. The field-month J4 contract permits raw ids,
payloads, error text/stacks, EA identity and full device detail including name.
Receipt/bundle API reading is service-role only; authorized operator psql reads
are a separate path. Only safe excerpts enter Git.

**EA report**:
An EA's own description from Profile → Report a problem (`ea_report`), with an
optional screenshot. Human intake routes to `/bug-user` and `field_report_ids`.

**Bug record**:
One causal problem in `docs/bugs/records/`, shared across human reports, phone
observations and Sentry evidence. Recorded does not mean diagnosed or fixed.

**Upload disposition**:
The `error_class` of an unsent outbox row: `retryable`, `needs_parent`,
`needs_reauth` or `terminal`. It records the upload decision already taken;
it does not introduce another retry policy.

**Install id**:
A random UUID kept in device-level AsyncStorage. It identifies an app installation, stays the same
across sign-out and account switches, and is shared by all EAs using that installation. It is not
an EA id or a hardware identifier.

**Mutation owner**:
The EA who made a change, stamped on its outbox row from the signed-in EA handle. Never derived from the record's content (`created_by` is provenance, not ownership): an EA's edit of a Head Office-created child is that EA's to upload.

## Relationships

- An **EA** has at most one *active* **Staff Programme Assignment** at a time (enforced by a unique index on `staff_programme_assignments(user_id) WHERE ended_at IS NULL`).
- A **Programme** has many **Groups**; every **Group** belongs to exactly one **Programme**.
- A **Class** has many **Groups** (across one or more programmes); a **Group** may also be class-less.
- A **Child** has many **Programme Enrollments** (a child may be in Core Literacy *and* Numeracy at once).
- A **Session** belongs to exactly one **Programme** and optionally one **Class**.
- A **Session** records its **Group** as history. A phone may hold a session whose group it does not have (after a handover or a deleted group); that reference grants no roster, edit or assignment access.
- An **EA** holds a **Class assignment** (assessment scope) and, within it, a **Delivery assignment** over a subset of that class (delivery scope). A **Class** may have several active **Class assignments** — one per co-EA sharing it.
- A **Session**, **Assessment**, **Battery Run**, **Letter mastery** or **Skill mastery** (`skill_mastery`) record hydrated onto a phone may carry a **History reference child** outside the EA's scopes; the reference grants neither **Delivery** nor **Assessment scope** and is never uploaded.

## Example dialogue

> **Dev:** "When an EA starts a **Session** in Core Literacy, do they pick a **Group** first?"
> **Domain expert:** "In real life, yes — every child in Core Literacy is in a pair, so the EA brings a specific pair out of the classroom. In the app today they pick children directly, but that is a gap we want to close."
>
> **Dev:** "And for **1000 Stories**?"
> **Domain expert:** "The whole class is the group. There is still a group row, but it always covers the entire class, and the EA never picks individuals."

## Settled product decisions

- **One active programme per EA, always.** Every EA has exactly one active **Staff Programme Assignment** at a time. The schema already enforces this with a partial unique index. EAs do not switch programmes during a workday or in the app; programme changes are an HR/admin operation that ends the old assignment and starts a new one outside the app.
- **No in-app programme switcher.** Every capture screen (Sessions, In-App Assessments, group/class UI) is implicitly filtered to the EA's one active programme. Read-only screens may still show cross-programme awareness for a child (e.g., "also enrolled in Numeracy") where it adds value.
- **One session = one group-block of work.** EAs never combine two groups into one session. This rule is programme-agnostic.
- **Literacy capture is group-first.** After the programme and clock-in gates, "+ Record" opens **Who are you teaching?**, then the Lesson screen and Wrap up. An existing draft resumes instead of starting another group. The picker offers **Up next**, **Other groups**, **+ Make a group** and **Put in a group**. `sessions.group_id` and the lesson's fixed `class_id` retain the context. Picker ranking and the Lesson header share the recency helpers behind `groupLastSeenOn`; recency comes from the current-year, active-Programme sessions attended by the group's children, including other EAs' sessions. Source: `src/screens/lessons/LessonPickerScreen.js:48`, `src/lessonPlan/inputs/lessonInputs.js:12`, `src/lessonPlan/engine/groups.js:29`.
- **Core Literacy is two programmes, not one.** `core_literacy_r3` (target 3, ceiling 5) and `core_literacy_ecd` (target 5) are distinct programme rows. A similar split is anticipated for Numeracy. Yebo and 1000 Stories will not split.
- **Daily session target is a per-programme number** (or null for 1000 Stories). The leading place to store it is a new column on `programmes` (e.g., `daily_session_target_min`, `daily_session_target_max`); not yet committed.
- **Grade is per-class, longitudinal via memberships.** Grade lives on `classes`, not `children`. A child's grade in any given year is derived by joining through `child_class_memberships` with the relevant `academic_year_id`. To recover grade at the time of an assessment or session, look up the membership active on the row's date — never the child's current class.
- **EAs can always edit group composition (except 1000 Stories).** For every programme where groups carry real composition — Core Literacy R-3, Core Literacy ECD, Numeracy, **and Yebo half-class A/B groups** — an EA must be able to **add a child to a group, remove a child from a group, and move a child between their groups**, even when Head Office is the original seeder. This is non-negotiable because field reality (children leaving, new arrivals, ad-hoc skill regroupings) cannot wait for the office round-trip. Yebo's A/B split is logistical room-management, not assessment-derived banding, so the EA owns it like any other group — keeping the editing rule universal and avoiding a second read-only special case the EA would have to understand. The sole exception is **1000 Stories**, whose synthetic whole-class group is read-only plumbing maintained by enrollment (see ADR-0002). This editing capability is the deferred next-year group editor; go-live groups are seeded and static.
- **Algorithmic auto-grouping is deferred and unbundled.** The Zazi-style "auto-grouping with score-based bands" is not part of the current UX tranche. It is split into three separate decisions: (a) manual group editor — wanted now; (b) trivial day-1 random partition for ECD — wanted soon, low effort, closes the Head-Office gap entirely for ECD; (c) score-based auto-grouping for R-3 and Numeracy older grades — depends on in-app assessment expansion, future product spec, no commitment.
- **The "in-app long-form assessment" direction is the long-term plan.** Masi wants to move most Core Literacy and Numeracy field assessment into the app, with paper as a supplement, so that in-app auto-grouping can replace office grouping for older grades. This is a future direction, not a commitment for the current UI tranche.
- **Grouping is versioned, but versions are *rare events*, not routine state.** The `grouping_versions` / `class_grouping_state` schema is the intended reconciliation model and reflects design intent, not speculation. Day-to-day edits (add a child, remove a child, move a child between pairs) stay **inside the active version** — they do not create new versions. A new version (v2) is only created for a deliberate re-grouping event: "we messed up v1," a Head Office regrouping push, or a programme-driven full regroup. In practice most classes will have exactly one version per academic year.
- **The class-list-status lifecycle is a soft nudge, not a friction layer.** `class_list_status` (`building` / `complete` / `reopened`) was designed to encourage the workflow *add all children → assess all → group all*, not to gate every edit behind an unlock step. Adding a new child mid-term must feel like a simple add, not a "reopen the class, edit, relock" multi-step ceremony. The UX must hide the status transitions or make them implicit.
- **Head Office does not touch Supabase directly.** Head Office uses a separate NextJS website (yet to be built) that writes to Supabase on their behalf. Group regrouping by HO flows through a **staging surface**, not directly into the EA's active grouping. EAs accept new groupings via an explicit in-app gate; HO regrouping never silently overwrites EA-visible groups.
- **The staging surface is a `staged` status on `grouping_versions`, not a separate table.** A Head Office regrouping is written as a new `grouping_versions` row with `status = 'staged'` (the CHECK is widened from `('active','archived')` to add `'staged'`); EA acceptance flips it to `'active'` and stamps the existing `accepted_at` / `accepted_by_user_id` columns. Rejected the separate `proposed_groupings` table because it would fork the membership model (proposed memberships cannot reference a not-yet-real version) and force a copy-on-accept dual-write — the pattern the offline outbox handles worst. **Load-bearing invariant:** a staged version carries its own `grouping_version_id`, so its `child_group_memberships` rows are invisible to EA-facing reads *as long as those reads are scoped to `class_grouping_state.active_grouping_version_id`* (the same version-scoping ADR-0001 already requires for historical accuracy). Acceptance is the act of pointing `active_grouping_version_id` at the new version. See ADR-0001.
- **Group membership provenance is a `last_written_by_role` column on `child_group_memberships`, not an audit-log table.** Each membership row records whether its last writer was an EA or Head Office (`'ea' | 'head_office'`). This is exactly what the itemized-merge gate reads — *who last placed this child* — to decide which children get a per-child "keep mine / use office's" choice. Rejected the audit-log table because the gate needs the row's *current* provenance, not full history; the log would cost a write per change and add a table to outbox ordering, while `grouping_versions` already records version-level who/when. The column is **primary state** (last-writer role has no other source of truth), so it does not repeat the denormalized-`class_id` source-of-truth hazard. The column lives on memberships only — placement provenance, not group identity; add it to `groups` only if a concrete need appears, never speculatively. See ADR-0001.
- **Acceptance gate is itemized-merge (Option B).** When Head Office stages a new grouping version, the EA sees a banner on next sync. Tapping it opens a review screen that surfaces a per-child decision **only for children whose current grouping row was last written by the EA** — for office-only rows, the office's new placement is applied with the bulk accept. For EA-edited children, the EA picks "Keep my edit" or "Use office's placement" per child. An EA who has made no edits sees a one-tap "Accept all" path. No deadline, no auto-apply: staged versions wait indefinitely until the EA decides. The EA can decline a staged version; declined staged versions remain in `staged` status until HO replaces them with a newer one. There is no preview-of-staging: the staged version is the first thing the EA hears about a regrouping.
- **1000 Stories uses a synthetic one-row-per-class group.** The schema's "every child has a group, every session has a group" invariant is preserved by giving each 1000-Stories class exactly one `groups` row, named `"{class_name} (Whole class)"`. The group is **plumbing**, not an EA-facing entity: the future group editor hides 1000 Stories (or renders it read-only with the roster); to add or remove a child from 1000 Stories the EA uses the **enrollment** UI (`child_programme_enrollments`), never the group editor. Membership in the synthetic group is maintained by a database trigger on `child_programme_enrollments` insert (programme = `one_thousand_stories`), so new mid-term children automatically gain membership. The trigger must exist in both SQLite (for EA-side local enrollments) and Postgres (for the future HO NextJS dashboard). See `docs/adr/0002-thousand-stories-synthetic-whole-class-group.md` for the trade-off and considered alternatives.
- **ECD pair persistence.** Core Literacy (ECD) pairs **persist across sessions in the real world** — EAs work with the same pair repeatedly, not random children per day. For the May 2026 go-live the seed source contains real office-assigned pair data because the cohort is mid-year and pairs have been in use for months. The seed loads those pairs verbatim. A broader "random partition at start of a new academic year for fresh ECD intakes" feature is a separate post-go-live consideration, scoped to genuinely new ECD cohorts with no prior pair data.
- **One canonical Battery per Programme, set by Masi admin.** Each Programme has at most one Assessment Battery configured against it (e.g., `core_literacy_r3` → `wela_plus_full`); when an EA starts a Run, the app derives the Battery from the EA's one active Programme. EAs do not see a Battery picker today. The schema must keep this forward-compatible with a future multi-Battery-per-Programme world (e.g., a `programme_batteries` join table), but the v1 UI exposes only the default. **2026-10-23:** EGRA forms are the first additional Batteries. They are offered next to the default through an EGRA form picker (planned after WelaPLUS Plan 3), and the default Battery itself is unchanged. **2026-10-26:** the picker is gone; the one additional Battery is Full EGRA 2026.1 in four languages, and the literacy default moves to WelaPLUS 2026.1 by migration (`20261026120000_welaplus_2026_1_default.sql`). **2026-10-31:** the numeracy programme's default becomes the Maths Battery (`masi_maths@2026.1-draft`, migration `20261031120000_numeracy_maths_draft_default.sql`, which keeps any Head Office choice); numeracy EAs are not offered Full EGRA.
- **Numeracy EAs see only numeracy screens (Jim, 2026-10-31).** The subject comes from the EA's active programme code through `src/utils/programmeSubject.js` (`numeracy` → maths, anything else → reading); no other file compares programme codes. For maths, the app hides the Assessments stats, Full EGRA and the quick tests, Home's "children to assess" and any retained literacy lesson draft (kept, not deleted), the Children Unassessed stat, the class row's letter tracker and results tap, Edit Child's reading level (saved unchanged), Insights' Letter mastery and Assessment scores, and Record's lesson flow ("Session forms for Numeracy are coming soon."). Literacy-only pieces stay hidden until the screen's own programme read confirms reading. Only a known maths subject is cached across screens (hiding literacy is always safe); a cached "reading" is never reused, because it could open a literacy route after Head Office moves the EA to numeracy. A failed read keeps what was known and never turns a maths EA back to literacy; a first-ever failed read falls back to literacy behaviour so literacy EAs are never locked out.
- **Multiple Battery Runs per child are allowed; latest-in-Window is canonical.** The app does not block re-running a Battery on the same child in the same Window. All Runs are kept for audit. Roll-up reporting (leaderboards, programme dashboards) uses the most-recent Run inside the relevant Window for each child. Out-of-Window Runs are **progress checks** and are excluded from windowed reporting.
- **Story Writing (WelaPLUS 2024.1 Q11; Q12 in 2026.1) ships with both EA-rubric scoring in-app *and* HQ rubric scoring on paper, for calibration.** The Masi-flavored 4-dimension rubric UX (Meaning Making / Spelling / Length / Vocab) is the v1 experiment: HQ continues to score the paper artifact, and Masi product retains the option to compare EA-vs-HQ deltas to decide whether holistic-rubric Questions are safe to move into the app long-term. The `assessments` row carries both `ea_rubric_total` and an optional `hq_rubric_total` (both /16, both NULL for every other Question) for Story Writing specifically. See ADR-0004 for the full calibration column shape.
- **Letter Sounds stops when the whole first row is wrong (since 2026-10-26).** The standalone quick test, WelaPLUS 2026.1 Q1 and Full EGRA share the 2026.3 item-set rule (`first_row_all_wrong`, the first 10 letters) and the stop card described under **Stop rule**. The hard stop at ten consecutive wrong marks belongs to the older `letter_sounds@2026.2` sets (WelaPLUS 2024.1 Q1 and earlier quick tests) and still governs runs saved or resumed on them. The old whole-row warning stays superseded by the [Assessment Results design](docs/superpowers/specs/2026-10-19-assessment-results-and-letter-test-design.md); other Questions keep their own declared mechanics.
- **Mid-Question resume is not supported.** If an EA force-quits during a Question, the Question restarts from scratch on re-entry. Between Questions, the Battery Run stays open and resumable — Questions that are already complete are not lost. This boundary keeps timed Questions (Letter Sounds 60-sec) statistically valid without resume gymnastics.
- **OSS Question contract: a Question is a pure capture component.** Question components are React Native components that receive `language`, `itemSet` (optional override), `instructions` (host-supplied EA-facing copy, including any stop-rule reminder text), optional `durationSec`, optional `childName` display text, and callbacks (`onItemMarked`, `onComplete`, `onAbandon`). They do **not** receive `child_id`, `user_id`, `programme_id`, `battery_run_id`, or any storage client. The host app wires identity, persistence, photo capture, and sync; the Question just emits results. Each Question declares a `question_code` and `question_version`; each result row stores both, plus the `item_set_id` that was used. Letter Sounds enforces its item-set stop rule in the shared reducer and emits the stopped result through `onComplete`; the host owns saving and the unsaved-result leave guard. A leave decision and persistence are mutually exclusive: a completion during the leave sheet is retained without writing until Keep result; Discard writes nothing. Back during an in-flight save remains prevented without opening leave until the save settles. Questions are intended to be open-sourced as standalone packages.
- **Run flow is linear by default, designed to be picker-capable later.** Inside a Run, the EA proceeds through Questions in the Battery's declared order; the next un-started Question is the only one tappable as "Start next." The data model and UI components must not hardcode strict linearity — a future change to a Battery-overview picker should require config, not refactor. Linearity in v1 also keeps prerequisite gates (below) sound.
- **Skipping a Question requires a reason; reasons are queryable.** EAs can skip any Question mid-Run via an explicit "Skip" action that captures a reason from the canonical 10-value `stopped_reason` enum (settled 2026-05-29 Codex review): `completed`, `timer`, `ea_ended`, `stop_rule`, `skipped_child_refused`, `skipped_tired`, `skipped_time`, `skipped_age`, `skipped_prerequisite_unmet`, `skipped_other`. (`skipped_prerequisite_unmet` is auto; the others are EA-chosen.) The Question's result row is written with `stopped_reason` set accordingly and zero `assessment_items` rows. The Run can complete with any number of skipped Questions.
- **Battery definitions can declare prerequisite gates between Questions.** A Battery may say "Question B requires `min_score: N` on Question A," meaning if the child scored below the threshold on Question A, Question B is auto-marked `skipped_prerequisite_unmet` and never presented. This protects children from demoralising "tests" they can't possibly do (a child who can't read letters being asked to read paragraphs). Prerequisites live in the **Battery** config, not inside the Question component — Questions remain context-free and reusable across Batteries with different gating rules. For the WelaPLUS Full Battery the initial gating is: Questions 6 (Word Reading), 7 (Sentence Reading), and 8 (Oral Reading Fluency) all require a minimum score on Question 1 (Letter Sounds); the exact threshold is pedagogy-team input and is TBD. **2026-10-26 (Jim):** settled as the **skip rule** (above) in WelaPLUS 2026.1 rather than a score threshold: a whole first row wrong in Q1 or Q5 skips Q6–Q12, in Q6 skips Q7–Q12; Story comprehension also has a prerequisite on the story. WelaPLUS 2024.1 keeps no automatic gates.
- **Paper-marked Questions have mixed marking cadence and one step-by-step mechanic.** For Pattern D Questions (Letter Writing from Pictures, CVC Writing and Sentence Writing from Dictation: Q5, Q9 and Q10 in WelaPLUS 2024.1; Q5, Q10 and Q11 in 2026.1), the cadence matches the paper task. Letter Writing = **batch** marking: the child fills the 26-item paper sheet at their own pace, then the EA marks it on the device in sheet order. CVC and Sentence Writing = **live** marking: the EA dictates, the child writes, the EA marks, then dictates next. All three use `SequentialCapture`; the toggle hook is removed. Letter Writing keeps its paginated picture grid; CVC Writing keeps word cards with letter tiles; Sentence Writing keeps sentence cards with word tiles. The ring follows the current letter (Letter and CVC Writing) or word (Sentence Writing), paging or scrolling as needed. Correct / Incorrect / Back, tap-to-flip, review and early ending follow the shared engine.
- **Photos for paper-marked Questions are captured end-of-Run, one per Question, with a soft missing-photo warning.** Photos are not taken during the Run. After the EA finishes marking the last Question, the Run-completion screen drives a single capture flow per paper-marked Question. Default unit is one photo per Question (`battery_run_artifacts.question_code` NOT NULL); an "Add another" affordance handles multi-page paper. If photos are missing at finalize-time, the EA sees a soft warning listing the gaps but can finalize without — the Run-status enum stays at three values (`in_progress`, `completed`, `abandoned`), never introducing a "completed-but-missing-photos" substate.
- **Photo capture mechanism is `expo-image-picker` camera-only; raw images are compressed at capture and never persisted full-resolution.** The OS native camera UI hands the EA a familiar preview/retake flow; the returned image is resized to ~1080px longest edge and re-encoded at ~70% JPEG quality (target ~150–250KB per photo) via `expo-image-manipulator` before any further processing. The raw camera image is discarded immediately. A WelaPLUS Run with 4 paper-marked Questions produces ~1MB of photo data total. Compression is a hard requirement, not a setting — uncompressed photos would consume 25× more EA data per Run.
- **Photo sync is eventually consistent — `battery_run_artifacts` row first, photo file lazy on a separate low-priority lane.** The row goes through the main sync outbox alongside other small Postgres-row writes (assessment scores, items). The photo file uploads via a **separate low-priority sync lane** with its own retry cadence, drained when the row is already in Postgres. Effect: small assessment-score data never queues behind large photo uploads on weak connections. HQ briefly sees a row pointing at a not-yet-uploaded file; the HQ dashboard handles that gracefully with a "photo uploading…" placeholder.
- **Photo upload defaults to wifi only, with a Masi-controlled remote override during Assessment Windows.** Connection-type detection via `@react-native-community/netinfo` (already a Masi-app dependency). The remote feature flag `photo_upload_over_cellular` flips uploads to "any connection" for the duration of an open Window, so audit artifacts reach HQ in time for the Window's roll-up reporting without permanently changing EA data behaviour. EAs also have an explicit "Upload now over cellular" affordance on a sync screen for one-off override. Local photo files are deleted from `documentDirectory` after confirmed Storage upload to keep device storage bounded. The local file path lives on a single source — the local-only `photo_upload_queue.local_path` column (Masi app's SQLite schema) — never on the synced `battery_run_artifacts` row.
- **Pattern F (Q2 Listen-and-Answer Story) shares the step-by-step story-questions screen with Full EGRA.** `<ListenAndAnswerStoryQuestion>` renders the bundled story on its intro screen; “I've finished reading” starts marking. `StoryQuestionsCapture` shows all question cards in one scrollable column, with the black ring on the current question, faded not-reached cards and the acceptable-answer guide beneath each prompt. It uses `SequentialCapture` for Correct / Incorrect / Back, tap-to-flip, review and early ending. A persistent **Re-read story** button above the cards opens a non-destructive full-screen story sheet; dismissing preserves marks and the current question. EGRA uses **Show story** on the same screen. Both save `metadata.asked` from reached items and `derived.questions_asked` as the reached count, so unasked questions are the not-reached tail. Re-read count is not logged. Item-set shape remains `{ story: { en, xh }, questions: [{ prompt: { en, xh }, acceptable_answers: { en: string[], xh: string[] } }] }`; the question count comes from `questions.length`. **No artifact / photo capture for Q2 in v1** because the response is verbal; `battery_run_artifacts.question_code` permits a future Battery variant opting Q2 in. Audio recording remains out of scope.
- **Pattern E (Story Writing rubric; 2024.1 Q11, 2026.1 Q12) uses segmented chips per dimension with an end-anchored gloss + per-dimension full-rubric sheet, and inlines the picture prompt at the top of the scoring screen.** A single `<StoryWritingRubricQuestion>` renders four dimension cards stacked vertically (Meaning Making, Spelling, Length, Vocabulary). Each card carries a row of five tappable chips (0–4) — tap-once-to-commit; re-score by tapping a different chip (no "tap to clear" because 0 is a valid score). Beneath each chip row, an end-anchored gloss line shows the 0 / middle / 4 anchors (e.g. "no attempt → partial → sophisticated") for at-a-glance scale awareness. A per-dimension "View full rubric" button opens a non-destructive sheet listing all five anchor descriptions — the inter-rater reliability lever EAs reach for when uncertain between adjacent scores. The picture the child wrote about renders as a small inline thumbnail at the top of the scoring screen with tap-to-enlarge, bundled by default in the OSS package and overridable via `itemSet.picture`; one picture per Run, Battery config picks which. **Pattern E is the only Pattern whose marking convention diverges from the shared step-by-step engine used by A/B/C/D/F**: the EA picks a rubric score per dimension rather than Correct / Incorrect for a current item. Story Writing also opts into Pattern D's end-of-Run photo capture queue via Battery config (`photo_eligible_questions` includes `wela_plus_story_writing`) using Pattern D's standard ~1080px/~70%/~200KB compression; if field testing shows HQ cannot rubric-score from standard-quality photos, a `photoQualityPreset` prop is a non-breaking v2 addition.
- **Q11 (Story Writing) EA-vs-HQ calibration column shape is hybrid-normalized: totals on `assessments`, per-dimension scores on `assessment_items` tagged with `metadata.scorer`.** (“Q11” here and in ADR-0004 names Story Writing by its WelaPLUS 2024.1 number; it is Q12 in 2026.1, where Q11 is Sentence Writing.) The `assessments` row carries two new Q11-specific nullable columns: `ea_rubric_total INTEGER NULL` (set when the EA finishes Q11, /16) and `hq_rubric_total INTEGER NULL` (set later when HQ marks the paper via the future NextJS dashboard, /16). Both NULL for every non-Q11 row. The four per-dimension scores live as `assessment_items` rows with **scorer-prefixed `item_key`** — EA rows use `item_key ∈ {'ea:meaning_making', 'ea:spelling', 'ea:length', 'ea:vocabulary'}` and HQ rows use `item_key ∈ {'hq:meaning_making', 'hq:spelling', 'hq:length', 'hq:vocabulary'}`, `is_correct = false` on every Q11 row (not the carrier here), and `metadata = { score: 0–4, scorer: 'ea' | 'hq' }`. The `ea:` / `hq:` prefix is load-bearing — it prevents the existing `deterministicItemId` helper from collapsing EA and HQ rows for the same dimension into one row. See `docs/adr/0004-q11-calibration-column-shape.md`. The EA writes 4 rows on Run completion; HQ writes **4 additional** rows later (not updates to the EA rows) so a fully-calibrated Q11 result has 8 `assessment_items` rows. EA-vs-HQ delta is computed at query time (`hq_rubric_total - ea_rubric_total` for totals, equivalent joins through `assessment_items` for per-dimension drift) — not stored. Rationale: (a) the architecture doc explicitly names `assessment_items.metadata` as the home for rubric dimensions; (b) the totals on `assessments` make "did EA and HQ agree?" a one-column subtraction; (c) HQ inserts new rows rather than racing with the EA's already-synced data; (d) only 2 new columns on `assessments` for this Q11-specific feature, all other rows NULL — minimal table bloat. This shape is **load-bearing for the future HQ NextJS dashboard**, which is the write source for the HQ rows. See `docs/adr/0004-q11-calibration-column-shape.md` for the full decision record including considered alternatives.
- **Seed-time orphan policy is uniform across programmes.** If the seed source contains a child enrolled in a programme but missing from any group of that programme (an "orphan"), the seed script inserts them into a programme-specific holding group named `"{programme.name} — Unassigned"` and logs the orphan's id, name, class, and programme to the seed output. Orphans are not expected for go-live; the policy exists so the seed remains transactional, surfaces data-quality issues to operations rather than failing the run, and makes no algorithmic choices about pedagogy. For 1000 Stories the orphan case cannot occur because the trigger on `child_programme_enrollments` insert maintains synthetic-group membership automatically (see ADR-0002).
- **Literacy capture follows a durable lesson, without a timer.** The EA chooses a group, teaches on Lesson and saves from Wrap up. A local draft holds unfinished work; only a completed session enters the outbox. This supersedes the original submit-and-go and session-state-machine direction for literacy (`src/services/lessonSave.js:32`).
- **Schema forward-prep for the eventual state machine: one column now.** Add `sessions.state TEXT NOT NULL DEFAULT 'completed'` with a permissive CHECK constraint (initial values `'completed'`, `'in_progress'`, `'paused'`, `'discarded'`; widenable later via `ALTER TABLE`). Submit-and-go writes the default automatically, so older field builds keep working without a coordinated rollout when the state-machine build later widens usage. Do NOT add other speculative state-machine columns (`paused_at`, `discarded_at`, `session_drafts` table) — they are YAGNI bets that can land additively with the state machine. `sessions.started_at` and `sessions.ended_at` already exist as nullable timestamps and stay NULL during submit-and-go (faking them with form-open/submit-time would capture form-fill duration, not session duration, producing misleading data).
- **Lesson persistence has one owner.** Lesson and Wrap up share one handle-owned controller and the local `lesson_drafts` row; neither screen owns a separate form copy or store. Mid-Question assessment drafts remain out of scope (`src/session/handleServices.js:99`).
- **2026-10-22 clarification — literacy lesson draft lifecycle (lesson-plan spec §7.2).** This supersedes the preceding session-state-machine direction for literacy drafts. C2–C3 now wires C1 storage to the Lesson screen, Wrap up and Home resume; the old `LiteracySessionForm` is retired. One controller per signed-in EA owns draft writes; Save drains the queue, then commits the completed session, attendees, changed-only reading levels, tracker corrections, outbox work and draft deletion in one transaction. No timer is recorded. `sessions.state` stays `'completed'`; Battery Runs keep their separate lifecycle. Physical durability and native navigation acceptance remain device gates V1–V8. Source: `src/session/handleServices.js:99`, `src/services/lessonDraftController.js:151`, `src/services/lessonSave.js:32`. Mid-Question assessment drafts remain out of scope.
- **Past sessions use Wrap up's Date picker.** Future dates are disabled; there is no separate backfill mode or date-range cap. A date different from advice `made_on` keeps the taught record but saves `plan: null` with `plan_reason: 'past_date'`. Reports can compare `created_at` with `session_date` to identify late capture (`src/screens/lessons/LessonWrapUpScreen.js:219`, `src/lessonPlan/lessonRecord.js:10`).
- **The old Sessions-tab decision was superseded by the locked July 2026 navigation.** The five visual slots are Home, Children, a centre Record command, Insights, and Assess. Record is a global action, not a selected destination. Session history remains stack navigation; there is no Today or Sessions destination in the bottom bar.
- **The Children tab uses count-aware auto-route.** When the EA has children in **exactly one class**, tapping "My Children" lands directly in that `ClassDetail`; with **two or more classes** it shows the class list as today. The rule keys off the EA's actual class count, not their programme — but the two correlate because of *one active programme per EA*: ECD, Numeracy, and Yebo EAs almost always have one class (auto-routed), while Core Literacy R-3 EAs typically hold a subset of two classes (6 from 1A + 6 from 1B) and keep the chooser, where a blanket auto-route would mis-guess. Counting (not a programme lookup) is the chosen mechanism because it is the real fact and self-corrects on unusual assignments. A persistent **"Manage classes"** affordance back to the full list ships in the same task, so single-class EAs can still reach add-class / a second class. 1000 Stories EAs (multi-class, whole-class model) fall through to the list, which is acceptable until that screen is reworked. ClassDetail shows delivery children in that class; the assessment picker supplies whole-class assessment access separately.
- **ClassDetail remains a delivery surface; assessment selection uses the wider class roster.**
  `childrenRepository.getMyChildren` and `ClassesContext.getChildrenInClass` retain the EA's
  delivery population. Assessment pickers use `getAssessableChildren` / `useAssessableChildren`:
  the same delivery children plus full control-child records reached through open memberships
  in the EA's active-Programme assigned classes. No child Programme enrollment is required for
  that class arm. The picker shows **"Your children"** then **"Rest of the class"**; search
  filters both, and language/grade come from the chosen membership's class. Assessment coverage,
  unassessed counts and assessment ranking use this wider population. Session pickers, groups,
  onboarding, child editing, daily targets and delivery rankings retain delivery scope. Seeing
  the wider replacement pool does not implement a group-composition editor; group authority
  remains a separate contract (ADR-0005).
- **No active programme assignment is a hard gate, never a soft default.** When an EA has no active `staff_programme_assignments` row, capture is blocked — the app never assumes a programme (e.g. "default to Core Literacy"). Soft-defaulting would silently misattribute a Numeracy/Yebo EA's work to the wrong programme, corrupting `programme_id`-scoped sessions/assessments and polluting dashboards; a blocked EA is strictly cheaper to recover from. This ratifies behaviour the data layer already enforces — `resolveProgrammeId` throws `No active programme assignment found` rather than writing an unattributed row. The `allowLegacyFallback` / `LEGACY_PROGRAMME_ID` hook must stay off for production capture. The gate is **front-loaded to screen entry**, not deferred to submit: opening Sessions or Assessments without an active programme shows an actionable empty-state immediately ("You don't have a programme assigned yet — contact your supervisor"), so a low-training EA is never allowed to fill an entire form only to fail at save. The gate is scoped narrowly to programme-dependent capture — clock in/out, viewing children, and profile stay usable. Because go-live capture still routes by `profile.jobTitleCode` and every EA is seeded with both a job title and a programme assignment, the no-assignment state is an anomaly path; the gate is cheap insurance against an incomplete seed. (Aligning capture to read the programme assignment instead of `jobTitleCode` is the separately-tracked forward intent, not part of this decision.)
- **During-school-day Yebo stays attendance-only; only the after-school block is a session.** A Yeboneer's in-school time (assisting the classroom teacher) is captured by clock-in/out, not as a session. Making it a session would add a second capture burden for untrained EAs (against the global UX constraint) to record presence the time-clock already has, and the `sessions` table has no during-day-vs-after-school distinction to hang it on anyway. Only the after-school Yebo block — the EA's own structured work with a whole or half class — is a session, against `programme_id = yeboneer`. Revisit only if Masi later needs to measure *what* the EA delivers during the day (not just that they were present), which would require a structured during-day capture and a way to distinguish it from the after-school session.
- **Assessment score colours band on raw score, keyed per (Question, grade, language).** The result-ranking colour is a function of the **raw score on the Question's own scale**, not accuracy percent. Percent (`correct/attempted`) rewards low-attempt children and distorts proficiency. Bands are keyed by `(tool_code/Question, grade, language)` and the child's grade is taken **at assessment date** through the `child_class_memberships` window. Language may be a wildcard `*` for language-independent benchmarks. The host lookup is `getScoreBand({ toolCode, grade, language, rawScore }) -> 'great' | 'good' | 'okay' | 'needs_work' | 'unknown'`. Current Letter Sounds cuts are bundled in `src/utils/scoreBands.js`: Grades R/ECD use 20/15/10 and Grades 1-3 use 40/30/20. Missing or incomplete rows return `unknown` and neutral grey. Threshold changes currently require updating runtime code and shipping an app release; promotion to a synced reference table is only a future path. See `docs/adr/0003-assessment-score-bands.md` and `documentation/assessment-score-bands-config.md`.

- **Wider-scope visibility is split by activity type: assessment history follows assessment (class) scope; session history follows delivery scope.** When the class assignment makes a child visible, the following travels with them (see ADR-0005):
  - **Child identity / current roster** — granted by **class** assignment. This is the replacement pool: an EA must see the whole class roster to pick a replacement for a child who leaves a delivery group.
  - **Assessment history, current academic year only** — granted by **class** assignment. Serves EA turnover (an incoming EA sees the baseline the previous EA captured) and control-group comparison, and lets co-EAs sharing a class coordinate the assessment divvy (each sees the other's assessments so nobody double-assesses). Bounded to the current academic year through the `child_class_memberships.academic_year_id` window so multi-year prior history is not exposed. **Mid-year moves (settled 2026-09-21):** an EA with an active class assignment sees a child's current-year assessments if the child was a member of that class at *any* point in the current academic year. After a move, both the old-class and the new-class EA see that year's assessments. The rule does not use only the child's current class, and it does not use the class the child was in on the assessment date.
  - **Session / delivery history** — granted by **delivery** assignment only, and is **capturer-agnostic**: an EA who holds (or held) a delivery assignment on a child reads every session that child attended, including sessions the previous EA captured. A pure-assessor (class scope, no delivery) does not read the delivering EA's session diary; being a control child for that assessor does not imply that nobody else delivers to the child. **The session is one complete delivery-history aggregate:** owning the session or qualifying through any attendee grants the complete parent plus every attendee row, including coattendee attendance, grade snapshot, notes, and child-keyed facts already stored in the parent activities JSON. A child-sliced attendee list would falsely imply privacy while the parent still carries all-child facts. Future genuinely restricted per-child facts must live behind a separate authorization contract rather than being added to this aggregate. **Implementation status:** the predicate and positively authorized keyset page RPC are applied to hosted `masi-app-sqlite` and passed the rollback-only six-actor PostgreSQL matrix plus authenticated/anonymous PostgREST probes on 2026-09-04. The mobile session-history pull uses this delivery-history boundary; verification and remaining native gates are recorded in `documentation/build-log.md`.
  - **Letter mastery** — **not** assessment history. It is current state (**What the child knows**), so it follows the *current* relationship. It is visible to the last writer (`changed_by`) and to every EA who **currently** delivers to the child (an active delivery assignment). There is no academic-year bound, because a letter mastered last year is still known. Former deliverers and class-only assessors who are not the last writer do not see it. A child's current delivering EA may **add or remove an EA confirmation** whoever recorded it. The record notes who changed it last. When two corrections conflict, the **most recently made** one wins: the server keeps whichever has the later correction time and treats a correction time in the future as the server's current time, so a phone that was offline cannot undo a newer correction made elsewhere (Jim, 2026-10-08; this replaces the 2026-09-23 "latest server write wins"). Assessment-evidence letters stay locked until the next assessment (settled 2026-09-21/23). Built in Assessment Results Plan 2: `set_letter_mastery` fixes each correction's effective time when the server first receives it, so a retry cannot move it. This supersedes ADR-0005's grouping of `letter_mastery` with assessment reads; see ADR-0005's 2026-09-21 follow-up.
- **Skill mastery has the same visibility as Letter mastery.** The last writer and every current direct deliverer can read it, across Programmes and years. Former deliverers and class-only assessors who are not the last writer cannot. A current deliverer may add or remove an EA tick whoever recorded it. The most recently made correction wins; the server clamps future times on first receipt, and retries keep that effective time. EGMA evidence remains locked. Hosted application is pending at Task 7.
- **Submitted assessments are immutable (settled 2026-09-21).** Correcting an answer is an edit only until the assessment is submitted, and it is locked after. EAs may add assessments and answers but may not change or delete them; a later correction is a new attempt. Head Office's Q11 calibration marks remain additional rows, never edits of the EA's rows (ADR-0004).
- **An EA may assess a child in their class without holding a delivery assignment on that child, and without creating one.** Assessment write is authorized by **class** scope (`current_user_can_write_for_child` grants via the class-assignment branch). This is deliberate: control-group children must be assessable without being delivered to, and creating a delivery assignment just to assess would pollute "My Children", session pickers, and delivery-count reporting with children the EA does not actually run the intervention with. Assessing never implies delivering.
- **Replacement / group-composition edits are authorized by *group* scope, a third tier below class scope.** Seeing the replacement pool (the class roster) is **class**-scoped; editing a specific delivery group's membership requires **group** scope — an active `group_ea_assignments` row on that group, or having created it (`current_user_can_write_for_group`). So a co-EA who merely shares the classroom can see and assess your children but **cannot** reach into your delivery groups. In the shared-class divvy (two EAs across 1A/1B/1C), each EA owns their own groups, so group scope cleanly separates edit authority. Head Office edits groups through the future dashboard. See ADR-0005.
- **A child leaving a delivery group requires a structured removal reason, retained for Head Office.** `child_group_memberships` gains additive `removal_reason` (a short enum — proposed `left_school`, `graduated_out`, `reshuffled`, `stopped_attending`, `replaced_other`) and `removed_by` columns (today only `removed_at` timestamp and `created_by` exist). This is **distinct from the child-level `archive_reason`**: a child can leave a *delivery group* while staying enrolled in the class (they become a control child), which is a membership event, not a child archive. **Load-bearing consequence:** the child-archive cascade already auto-ends `child_group_memberships` (`childrenRepository.archiveChild`), so that automated path must stamp `removal_reason` too (e.g. `left_school` derived from the archive) — otherwise "reason required" is silently violated by the archive path. The manual removal captures the reason via a bottom-sheet chip set (per the low-training-EA UX conventions), added additively with the next-year group editor. See ADR-0005.
- **Handover transfers delivery assignments, not just the class assignment, whenever the incoming EA takes over the intervention.** This is load-bearing: the incoming EA sees the previous EA's *sessions* for inherited children **only because** they now hold the delivery assignments (the session policy is capturer-agnostic). If a handover moved the class assignment but left delivery rows dangling on the departed EA, the incoming EA would get assessments-but-no-sessions. A pure-assessor takeover deliberately moves class scope only and does not gain session visibility. See ADR-0005.

## Global UX constraints

- **Field EAs are young, mostly first-time workers, with low training.** Every screen and workflow must be designed for a user who has not used a workplace app before. Concrete implications: avoid multi-step ceremonies for routine actions; prefer obvious primary actions over discoverable ones; bottom sheets over dialogs; chips over multi-select dropdowns; never require an EA to know about workflow states (`class_list_status` etc.) explicitly. This constraint outranks technical elegance when they conflict.

## Go-live scope (May 2026 season)

- **Current-cohort setup has two first-class paths.** Roughly half of EAs receive classes, children, and groups from Head Office; roughly half create their class and children locally. A seeded EA must never be diverted into onboarding. A settled zero-class EA enters a guided class -> children flow. At least one child is mandatory before finishing; the app continues to warn below 10 children but permits finishing after the first. Child creation loops so the EA can keep adding. Group creation is not part of the current onboarding version and may be added later. The Airtable/Postgres import path is deferred until its source model is inspected with Jim.
- **The complex group reconciliation workflow is deferred to the next academic year cycle.** Manual group editor for EAs (add/remove/move children inside the active version), the NextJS Head Office dashboard, the staging surface (`grouping_versions.status = 'staged'`), the acceptance gate (Option B itemized merge), and the `last_written_by_role` provenance column are all settled in design (see ADR-0001) but **do not ship this season**. The schema is ready and dormant; code will be written next year before the first real regrouping push.
- **In-scope schema migrations for go-live**: additive nullable columns `programmes.daily_session_target` (int), `programmes.daily_session_ceiling` (int), `sessions.group_id` (text references `groups.id`), and `sessions.state` (text NOT NULL DEFAULT `'completed'` with permissive CHECK; forward-prep for the next-tranche state machine). All are forward-compatible with older app builds in the field.
- **In-scope UX for go-live**: Sessions Today ring with per-programme behaviour, session completion screen, count-aware Children-tab auto-route with a "Manage classes" affordance, the front-loaded no-active-programme capture gate (screen-entry empty-state on Sessions/Assessments), the small visual ports (SectionHeader, BottomTabIcon, monthly-stats footnote, color-semantics audit), and the dual Head Office/local class setup path above. The source importer remains deferred.

## Open decisions

Open and deferred decisions live in `documentation/open-decisions-backlog.md` (moved out 2026-05-29 to keep this file a glossary). None block the May 2026 go-live. When one resolves, record it here as a settled decision and/or an ADR, and remove it from the backlog.

## Flagged ambiguities

- "session type" was historically a free-text column; it has been superseded by `programme_id`. Any new UX that wants to vary by programme should read `programme_id`, not legacy `session_type` strings.
- "group" was overloaded in early Masi conversation to mean both "a pair in Core Literacy" and "the whole class in 1000 Stories" — both are valid; **Group** is whatever roster the EA treats as one unit within one programme.
- "assessment" was historically overloaded between **Field Assessment** (office-marked, long form) and **In-App Assessment** (locally marked, short form). That overload is resolved: the canonical vocabulary is **Assessment Question** (one subtest), **Assessment Battery** (named ordered set of Questions), and **Battery Run** (one EA running one Battery on one child). The roadmap's "Assessment Complete Main Stat" item refers to completed Battery Runs.
