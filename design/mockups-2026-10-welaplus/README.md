# WelaPLUS Release 1 — Plan 3 screen designs (October 2026)

**What this is:** the EA's path through one WelaPLUS run, drawn against the approved
[Release 1 spec](../../docs/superpowers/specs/2026-10-14-welaplus-release-1-design.md) (§5 flow,
§7.5 history, §9 printouts). This is input for Plan 3 (issue #23), not a decision record until Jim
reviews it.

- `index.html`: eight frames. Open it in a browser.
- `preview.png`: a rendered screenshot.
- `shot.sh`: regenerates `preview.png` with the locally installed Chrome, with no npm
  dependencies. It also fails loudly if any frame clips. It caught a real 47 px overflow on the
  Battery overview during the build.

**Conventions inherited:** every colour is a `colors.js` token via `../mockups-2026-07-c/brand.css`.
The phone frame, charcoal hero, bottom sheets (never Dialogs), and type all follow
`../mockups-2026-07-c/04-locked/`. The tab bar is the **shipped** four-tab bar (Home · Children ·
Insights · Assessments), not the locked-but-unbuilt Record nav. When that nav ships, "Assessments"
becomes "Assess" and nothing else here changes.

## The frames

| # | Screen | Design intent |
|---|---|---|
| 1 | Assessments tab | WelaPLUS leads for Core Literacy R–3 EAs (D3). Unfinished runs sit directly under it, so resuming takes one tap. EGRA moves to "Quick assessments", unchanged. |
| 2 | One unfinished run per child | A bottom sheet, not a silent second run. "Abandon" states its cost in amber, the same pattern as the July clock-in guard. |
| 3 | Battery overview | Driven by `evaluateBatteryState`. Only the next Question has Start. Undecided rows have ⋯ → skip with a reason. Before the first written Question (Q5), an amber callout puts the run code onto the paper. Finalize stays disabled until every Question is decided. |
| 4 | Question intro | The "Hand Lwazi: Reading Card B" block is the loudest element. It is what keeps paper and tablet in sync (§9). The stop rule is amber because it is the EA's judgement call. |
| 5 | Q1 marking, tablet | The grid mirrors Reading Card A row for row (5 × 12). The EA's finger tracks the child's. Green = correct. A blank cell is resolved by the end-of-Question marker. |
| 6 | Last-attempted sheet (timer) | Non-cancellable after a timer. Letters after the pick show as not reached. "Reached the end" and "Nothing attempted" each take one tap. |
| 7 | Summary and finalize | Scores per Question. A required two-item paper checklist, because the run code is Release 1's only paper-to-run link (no photos, D2). |
| 8 | History | One row per run, with status Finalized / Open / Abandoned, opening the read-only summary. EGRA rows are unchanged. |

## Open questions for Jim

1. **WelaPLUS on phones.** A 12-column card-mirroring grid (Q1) cannot meet the 44 dp touch
   floor on a phone; cells come out at about 29 dp. Options:
   - **(a) Recommended: WelaPLUS is tablet-only.** It matches the PRD's field devices (Android
     tablets). On a phone the WelaPLUS card says "Use a tablet for WelaPLUS".
   - (b) Rotate to landscape for Q1, Q6, and Q8 on phones.
   - (c) Wrap rows on phones. This breaks the "rows are a contract with the card" rule (§9.1) and
     makes the EA's tracking harder.
2. **Finalize checklist friction.** Both boxes are required. That is two extra taps per child, but
   it is the only thing that guarantees the run code reaches the paper.
3. **Assessments-tab hierarchy.** WelaPLUS above EGRA for Core Literacy EAs. Is EGRA still used
   alongside WelaPLUS in Core Literacy, or does WelaPLUS replace it for that programme?

## Known gaps in the mockups (deliberate)

- **Not drawn:** the per-Question marking screens other than Q1. They are the merged package
  components (Plan 1) inside this host chrome.
- **Not drawn:** the skip-reason sheet. It is the package's shared `SkipReasonPicker` restyled as
  a bottom sheet.
- **Not drawn:** isiXhosa UI strings. EA-facing copy stays English in Release 1, with
  language-specific practice lines inside the Questions.
