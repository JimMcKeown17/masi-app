# 2026-04-23 Preset Numbered Groups Review

## Findings

### High: Missing sort comparator update in `EditChildScreen` creates inconsistent behavior
- The spec/plan updates sorting in `GroupPickerBottomSheet` and `ClassDetailScreen`, but `src/screens/children/EditChildScreen.js` also sorts groups with `localeCompare` before computing `groupIndex` for `getGroupColor`.
- Result: users can see different ordering/color mapping between screens after rollout.
- Recommendation: include `EditChildScreen` in scope, import `compareGroups`, and replace its `localeCompare` sort.

### High: "Impossible to deviate from Group N" is not true during mixed-version rollout
- The spec goal states format drift is impossible in new UI paths, but the project currently has multiple app versions deployed concurrently.
- Older versions still allow free-text create/rename and can continue writing non-`Group N` names.
- Recommendation: reword the goal to "enforced in updated clients," and add a rollout note describing expected temporary drift until client update adoption is high.

### Medium: Proposed duplicate-name guard regresses from current case-insensitive behavior
- Current create/rename logic blocks duplicates case-insensitively.
- Proposed `handleSelectVirtual` guard checks only exact match (`g.name === name`), which allows near-duplicates such as `group 1`, `Group 1`, or trailing-space variants.
- Recommendation: use normalized comparison (`trim().toLowerCase()`) before create.

### Medium: One-group-per-user invariant is not fully guarded in new create flow
- Proposed create path removes existing membership and then adds new membership, but does not check `removeChildFromGroup` success before continuing.
- If remove fails and add succeeds, a child can end up in two groups.
- Recommendation: require success check on remove result and abort/create error state if remove fails.

### Medium: Automated test coverage is too narrow for UI regressions
- Planned tests only cover `nextGroupNumber` and `compareGroups`.
- There are no automated tests for: virtual-row rendering, `+ Add Group N` visibility rules, rename absence, and create/assign behavior.
- Recommendation: add React Native Testing Library tests for `GroupPickerBottomSheet` state-driven UI and action handlers.

### Low: Spec file accounting is internally inconsistent
- Spec says "No new files," while the verification section requires adding a new test file.
- Plan also explicitly creates `__tests__/groupHelpers.test.js`.
- Recommendation: update the spec's file section to include the test file.

### Low: Committing intentionally failing tests can keep branch/CI red between tasks
- Plan Step 1 includes committing a known failing test suite before implementation.
- This is valid for strict TDD, but can disrupt branch health if CI runs per commit or developers push incrementally.
- Recommendation: either keep failing test commit local until implementation lands, or note that this commit should not be pushed alone.

## Open Questions / Assumptions

- Assumption: `EditChildScreen` should follow the same numbered-group ordering and color logic as `ClassDetailScreen`.
- Question: Is there any policy requiring green CI at every pushed commit on this branch?
- Question: Should non-conforming legacy names that look like numbered groups (for example `group 3`) be treated as numbered or strictly as legacy text?
