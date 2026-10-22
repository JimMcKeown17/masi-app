# Assessment capture style mockups (2026-10-21)

Approved by Jim on 2026-10-21 in the brainstorm for
`docs/superpowers/specs/2026-10-21-assessment-capture-style-design.md`.

| File | What it shows | Jim's decision |
|---|---|---|
| `1-colour-options.png` | Letter and word test in three colour treatments at 360 dp | **C** (Masi palette, ink accent): "C is perfect" |
| `2-card-vs-page.png` | How a phone page maps to the printed card for letters and words | Approved: "The visuals you showed me are correct… Let's stick with it." |

The `.html` files are fragments written for the brainstorming companion's frame. Open the PNGs for
the reference picture. Where the spec and a mockup differ, the spec wins and names the difference.

Build interpretation (2026-10-22): the mockup's “End Assessment” is **End test** in step-by-step
capture, preserving the pinned Masi copy. **Skip question** is a link in the wrapping navigation
row when offered, rather than a filled button. Q6/Q8 retain **End** as the ink primary in their
toggle bar (`src/assessment-questions/ui/ActionBar.tsx:7`,
`src/assessment-questions/ui/ActionBar.tsx:24`,
`src/assessment-questions/questions/ReadWordsQuestion/index.tsx:320`,
`src/assessment-questions/questions/ReadPassageQuestion/index.tsx:322`). Native visual acceptance
is still Task 17; these mockups are the reference, not evidence that a device pass occurred.
