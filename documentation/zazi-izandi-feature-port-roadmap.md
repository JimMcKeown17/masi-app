# Zazi iZandi -> Masi Feature Port Roadmap

**Updated:** 2026-05-26
**Source audited:** `/Users/jimmckeown/Development/zazi-izandi-app`
**Target audited:** `/Users/jimmckeown/Development/masi-app`
**Target branch observed:** `plan-5/context-screen-migration`

---

## Purpose

This is the working checklist for deciding which Zazi iZandi UX, design, and reliability features should be ported into Masi. It compares the current Zazi app screen-by-screen against the current Masi checkout and separates:

- **Already shipped / verify only**: Zazi-derived work already present in this Masi checkout.
- **Small UX ports**: low-risk polish and clarity changes.
- **Navigation decisions**: choices that affect tab structure and common entry paths.
- **Groups workflow**: larger class/group/session workflow ports.
- **Session reliability**: lifecycle, resume, timer, and partial-save behavior.
- **Motivation layer**: progress rings, completion screens, haptics, and animation.
- **Brand polish**: reusable visual patterns that must be reskinned for Masi.
- **Deferred systems**: push, notification transport, and seed/QA tooling.

Use valid Markdown checkboxes only:

- `[ ]` not started / undecided
- `[x]` yes, shipped or selected
- `[ ] 🟡 Modify` port the pattern, but adapt before implementation
- `[ ] ❌ Skip` do not port
- `[ ] ⏸ Defer` good idea, but not during the current UI tranche

---

## Current Context

The SQLite backend is now the forward path for Masi. The preview build passed user iPhone validation after the final RLS/sync fixes, and future UX work should branch from the merged SQLite baseline.

This document started as an audit of the observed checkout on 2026-05-25. After the SQLite merge, use it as the working UI backlog and update checkboxes as items are implemented.

Items already shipped in the current checkout:

- Soft clock-in warning before session launch.
- Gender chips on Add/Edit Child.
- Visible release/backend identity.
- SQLite WAL and `busy_timeout` connection pragmas.
- Assessment-item sync batching/fallback and Supabase request queueing.
- Local-first navigation cleanup after form saves.
- Domain text input no-suggestion hardening.
- Edit Child/Edit Class form reinitialization race fix.

Validation notes carried forward:

- Keep testing future UI work on the SQLite backend.
- Prefer at least one low-end Android smoke pass before broad field distribution.
- Clock-in/out GPS should remain part of physical-device smoke because emulator current location was unavailable.

---

## Recommended Work Order

### 0. Already Shipped / Verify Only

- [x] Clock-in session launch guard shipped as a **soft warning**.
  - Masi evidence: `src/hooks/useSessionLaunchGuard.js`, `src/components/sessions/ClockInBeforeSessionDialog.js`, `src/screens/main/HomeScreen.js`, `src/screens/main/SessionsScreen.js`
  - Remaining follow-up: test on physical devices with actual GPS clock-in/out.

- [x] Gender chips shipped as **Male/Female only**.
  - Masi evidence: `src/components/forms/ChipSelector.js`, `src/screens/children/AddChildScreen.js`, `src/screens/children/EditChildScreen.js`
  - Remaining follow-up: decide whether pressing a selected chip should clear it.

- [x] Visible release/backend identity shipped.
  - Masi evidence: `src/constants/releaseMetadata.json`, `src/utils/releaseMetadata.js`, `src/screens/main/ProfileScreen.js`, `src/db/debugDump.js`, `src/utils/debugExport.js`
  - Remaining follow-up: inject a real git commit/build hash instead of `"unknown"`.

- [x] SQLite connection hardening shipped.
  - Masi evidence: `src/db/client.js`
  - Notes: pragmas now run through the shared connection helper: `foreign_keys`, `journal_mode = WAL`, and `busy_timeout = 5000`.

- [x] Sync hardening shipped for the highest-risk cutover path.
  - Masi evidence: `src/services/offlineSync.js`, `src/services/supabaseRequestQueue.js`, `src/context/OfflineContext.js`
  - Remaining follow-up: later expand batching beyond `assessment_items` to `session_attendees` and `child_group_memberships`.

- [x] Local-first post-save navigation cleanup shipped.
  - Masi evidence: `__tests__/screenTimerAudit.test.js`
  - Remaining follow-up: keep the audit test when future forms are added.

- [x] Domain input no-suggestion hardening shipped.
  - Masi evidence: `src/constants/textInputProps.js`, child/class forms, search bars, child selector, session notes.

- [x] Edit form reset race fix shipped.
  - Masi evidence: `src/screens/children/EditChildScreen.js`, `src/screens/children/EditClassScreen.js`
  - Remaining follow-up: add a defensive loading guard for Edit Child if `ChildrenContext` has not hydrated yet.

---

## 1. Small UX Ports

These are the best first UI items because they are narrow, visible, and unlikely to disturb storage or sync.

### 1.1 Assessment Complete Main Stat

- [ ] Port from Zazi: show **number correct** as the hero stat, not percentage.

| | |
|---|---|
| **Why** | Field staff can understand "correct responses" faster after a timed EGRA flow; percentage still remains supporting context. |
| **Zazi source** | `src/screens/assessments/AssessmentResultsScreen.js` |
| **Masi current gap** | `src/screens/assessments/AssessmentResultsScreen.js` still renders `assessment.accuracy}%` in the hero ring. |
| **Masi change** | Make the ring number `assessment.correct_responses`; add a small supporting line for `{assessment.accuracy}% correct`. |
| **Effort** | XS |
| **Tests** | Add/update `__tests__/AssessmentResultsScreen.test.js` if present; otherwise create a focused render test. |

### 1.2 Grade-Aware Assessment Score Colors

- [ ] Port from Zazi: grade-aware color thresholds based on letters correct.

| | |
|---|---|
| **Why** | A percent-derived ranking can misrepresent actual EGRA skill levels when attempted counts differ. |
| **Zazi source** | `src/utils/assessmentScoreColors.js`, `src/screens/insights/AssessmentRankingScreen.js` |
| **Masi current gap** | `src/screens/insights/AssessmentRankingScreen.js` uses percent-derived `getBarColor`. |
| **Masi change** | Add a Masi-specific `assessmentScoreColors` helper, then use it in `AssessmentRankingScreen`. |
| **Effort** | XS-S |
| **Design decision** | Confirm thresholds for Masi grades/programmes before coding. Do not blindly copy ZZ Grade R thresholds if Masi uses different baselines. |

### 1.3 Home Monthly Stats Footnote

- [ ] Port from Zazi: add a small footnote under Home hero stats that clarifies the stat window.

| | |
|---|---|
| **Why** | Masi Home shows days worked, sessions, and children; "monthly stats" removes ambiguity for support and field staff. |
| **Zazi source** | `src/screens/main/HomeScreen.js` |
| **Masi current gap** | `src/screens/main/HomeScreen.js` shows the stat strip without an explicit scope label. |
| **Effort** | XS |

### 1.4 Release Metadata Depth

- [ ] 🟡 Modify: upgrade Masi release metadata toward Zazi's `appRelease` detail, but keep Masi backend identity fields.

| | |
|---|---|
| **Zazi source** | `src/utils/appRelease.js`, `src/constants/releaseMetadata.json`, `src/screens/main/ProfileScreen.js` |
| **Masi current state** | Shows app version, build number, backend target, and Supabase project id. Git commit remains `"unknown"`. |
| **Masi change** | Add Expo Updates fields where available: channel, runtime version, OTA/update id, embedded-vs-OTA launch source, published timestamp, and real git commit/build hash. |
| **Effort** | S |
| **Risk** | Low. Mostly support diagnostics. |

### 1.5 Inline Sync Affordance Polish

- [ ] Verify Masi's sync badges and failed-item retry UX match the useful parts of Zazi.

| | |
|---|---|
| **Zazi sources** | `src/components/common/SyncIndicator.js`, `src/screens/main/SyncStatusScreen.js`, `src/screens/sessions/SessionHistoryScreen.js`, `src/screens/assessments/AssessmentHistoryScreen.js`, child/class cards |
| **Masi current state** | Sync indicator, pending badges, and Sync Status screen exist. |
| **Masi checklist** | Confirm failed outbox rows show enough table/id/error detail; confirm retry works; confirm offline/pending/syncing colors are consistent across Home, history screens, and class cards. |
| **Effort** | S review + small fixes if needed |

### 1.6 Reference-Data Empty/Retry States

- [ ] Add/verify offline-aware empty and retry states for school/class reference data.

| | |
|---|---|
| **Zazi sources** | `src/screens/children/CreateClassScreen.js`, `src/screens/children/EditClassScreen.js` |
| **Masi target** | `src/screens/children/CreateClassScreen.js`, `src/screens/children/EditClassScreen.js`, `src/context/ClassesContext.js` |
| **Why** | Low-end Android/offline field use needs clear recovery when reference data fails to preload. |
| **Effort** | S |

---

## 2. Navigation Decisions

These need product decisions before code because they change common muscle memory.

### 2.1 Today Tab vs Sessions Tab

- [ ] 🟡 Modify: decide whether to keep Masi's `Sessions` tab or move toward Zazi's `Today` tab.

| | |
|---|---|
| **Zazi behavior** | Bottom tabs are `Home`, `Children`, `Today`, `Assessments`. `TodayScreen` has Start Session, View Session History, and Daily Plan / AI Coach placeholders. |
| **Zazi sources** | `src/navigation/AppNavigator.js`, `src/screens/main/TodayScreen.js` |
| **Masi current behavior** | Bottom tabs are `Home`, `Children`, `Sessions`, `Assessments`; `SessionsScreen` has stats, not-seen-this-week callout, Record New Session, View History. |
| **Options** | Keep `Sessions` and selectively port the cleaner action layout; rename to `Today`; or create a richer Sessions screen without speculative AI placeholder copy. |
| **Recommendation** | Keep `Sessions` for now. Port the actionable layout pieces only after cutover; avoid placeholder AI copy until Masi has an actual daily-plan backend. |

### 2.2 Children Tab Auto-Route

- [ ] 🟡 Modify: decide whether My Children should auto-open the first class detail.

| | |
|---|---|
| **Zazi behavior** | If the EA has a class, tapping `Children` routes straight to `ClassDetail`; a `Manage classes` link returns to the root class list. |
| **Zazi sources** | `src/navigation/AppNavigator.js`, `src/screens/main/ChildrenListScreen.js`, `src/screens/children/ClassDetailScreen.js` |
| **Masi current behavior** | `Children` opens `ChildrenListScreen` normally. |
| **Recommendation** | Do not auto-route until user testing confirms most Masi staff have exactly one primary class. If ported, include the `Manage classes` escape hatch in the same task. |
| **Effort** | S |

### 2.3 Bottom Tab Active Indicator

- [ ] 🟡 Modify: port the active tab dot pattern, reskinned to Masi.

| | |
|---|---|
| **Zazi source** | `src/components/common/BottomTabIcon.js` |
| **Masi current gap** | Tab icons are inline in `src/navigation/AppNavigator.js`; no active dot. |
| **Masi change** | Extract a Masi `BottomTabIcon` component and keep route/icon mapping in one place. |
| **Effort** | XS-S |

---

## 3. Groups Workflow

This is a feature family, not a single polish pass. Do not bundle it with Sessions Today or login polish.

### 3.1 Class Detail Children / Groups Switcher

- [ ] Port the segmented `Children` / `Groups` switch inside Class Detail.

| | |
|---|---|
| **Zazi source** | `src/screens/children/ClassDetailScreen.js`, `src/screens/groups/GroupsScreen.js` |
| **Masi current state** | `ClassDetailScreen` shows child cards with group chips, but no separate Groups view. |
| **Masi change** | Add class-scoped switcher; `Children` stays current list; `Groups` routes to or renders group cards for that class. |
| **Effort** | M |
| **Dependency** | Needs stable group/query shape after SQLite cutover. |

### 3.2 Group Cards With Useful Stats

- [ ] Port/adapt group cards with child count, sessions this week, current letter/focus, and progress.

| | |
|---|---|
| **Zazi sources** | `src/components/groups/GroupCard.js`, `src/utils/groupStats.js`, `src/hooks/useCurrentGroupingGroups.js` |
| **Masi current gap** | Group assignment chips exist, but no group overview card surface. |
| **Masi adaptation** | Recompute stats from Masi's normalized SQLite tables, not Zazi's assumptions. |
| **Effort** | M |

### 3.3 Group Detail Screen

- [ ] Port/adapt a group detail screen.

| | |
|---|---|
| **Zazi source** | `src/screens/groups/GroupDetailScreen.js` |
| **What to port** | Roster, group-level/status badge if applicable, and group session history. |
| **What to modify** | Zazi's `Letters` / `Blending` programme-level badge is literacy-specific; Masi needs its own programme/session type semantics. |
| **Effort** | M |

### 3.4 Group Picker Before Sessions

- [ ] 🟡 Modify: decide whether sessions should start group-first.

| | |
|---|---|
| **Zazi behavior** | `GroupPickerScreen` auto-selects one group, shows cards for multiple groups, blocks if not clocked in, and has empty-state CTA. |
| **Zazi source** | `src/screens/groups/GroupPickerScreen.js`, `src/utils/groupPickerPresentation.js` |
| **Masi current state** | Masi session form lets the user select children directly; `group_ids` are currently left empty in `LiteracySessionForm`. |
| **Recommendation** | Do not port this until Masi decides that sessions should store group context. If yes, do it before the completion screen. |
| **Effort** | M-L |

### 3.5 Auto-Grouping CTAs and Preview

- [ ] ⏸ Defer: treat Zazi auto-grouping as a separate product feature, not a simple UI port.

| | |
|---|---|
| **Zazi sources** | `src/screens/groups/AutoGroupingPreviewScreen.js`, `src/services/groupingService.js`, `src/utils/autoGrouping.js`, `src/components/groups/PreviewGroupPickerSheet.js`, `src/screens/children/ClassDetailScreen.js` |
| **What exists in Zazi** | Class-list completion CTA, refresh setup data, suggest groups, add newly assessed children to groups, redo all groups, preview cards, coverage warnings, orphan list, move child between draft groups, sticky accept/cancel footer. |
| **Masi risk** | High if copied blindly. Grouping rules and thresholds are domain-specific. |
| **Recommendation** | First port the display/read-only group workflow. Auto-grouping should get its own spec if wanted. |

### 3.6 Class/Child Management Escape Hatches

- [ ] Review and port useful class/child escape hatches.

| | |
|---|---|
| **Zazi sources** | `src/screens/main/ChildrenListScreen.js`, `src/screens/children/ClassDetailScreen.js`, `src/screens/children/AddChildScreen.js`, `src/screens/children/EditChildScreen.js` |
| **Checklist** | Manage classes link, unassigned children section, class picker bottom sheet, destructive delete confirmations, inline syncing labels. |
| **Masi current state** | Some pieces already exist; verify screen by screen before implementing. |
| **Effort** | S-M |

---

## 4. Session Reliability

These should be reviewed before adding the session completion celebration, because they define what happens when a session is interrupted.

### 4.1 Active Session State Machine

- [ ] Port/adapt Zazi's explicit session draft state machine.

| | |
|---|---|
| **Zazi sources** | `src/screens/sessions/NewSessionScreen.js`, `src/utils/activeSessionState.js`, `src/utils/sessionCaptureValidator.js` |
| **What it does** | Group-selected -> running -> stopped -> submitted states; attendance; level snapshot; validation; tracker changes; submit result; no arbitrary save delay. |
| **Masi current state** | `LiteracySessionForm` is a simpler long form with direct submit and `navigation.goBack()`. |
| **Effort** | L |
| **Risk** | High unless done after SQLite cutover and tested with real SQLite. |

### 4.2 Persistent Resume Banner

- [ ] Port/adapt the global "Session in progress" resume banner.

| | |
|---|---|
| **Zazi sources** | `src/components/session/ResumeBanner.js`, `src/hooks/useActiveSessionState.js`, `src/navigation/navigationRef.js`, `src/navigation/AppNavigator.js` |
| **Why** | If field staff leave a running session, the app should make it obvious and easy to return. |
| **Masi requirement** | Only makes sense if Masi session capture supports a running/stopped draft and persists active-session context. |
| **Effort** | M after 4.1 |

### 4.3 Partial-Save / Discard Prompt

- [ ] Port/adapt leave protection for in-progress sessions.

| | |
|---|---|
| **Zazi source** | `src/screens/sessions/NewSessionScreen.js` |
| **What to port** | `beforeRemove` guard and destructive discard confirmation when a session is running or stopped. |
| **Masi adaptation** | Must not trap users in a broken form; include a tested discard path. |
| **Effort** | M |

### 4.4 Timer and Attendance Model

- [ ] Decide whether Masi sessions need Zazi's explicit timer and attendance toggles.

| | |
|---|---|
| **Zazi source** | `src/screens/sessions/NewSessionScreen.js`, `src/utils/activeSessionState.js` |
| **What it does** | Start/stop timer, live duration, present/absent toggles, automatically stops on submit if still running. |
| **Masi current state** | Session date, children, letters, reading level, comments, per-child progress updates. |
| **Recommendation** | Validate field workflow first. Timer may be useful, but it is not a pure visual port. |

### 4.5 Backfill / Log Past Session

- [ ] Evaluate Zazi's backfill mode for Masi.

| | |
|---|---|
| **Zazi sources** | `src/screens/sessions/SessionHistoryScreen.js`, `src/screens/groups/GroupPickerScreen.js`, `src/screens/sessions/NewSessionScreen.js` |
| **What it does** | Session History has `Log past session`; backfill uses a date field, skips active timer, and returns to group picker. |
| **Masi decision** | Is backfill allowed for field staff? If yes, define validation and audit expectations. |
| **Effort** | M |

### 4.6 UTC-Explicit Timestamps and Non-Overlapping Session Slices

- [ ] Audit whether the Zazi timestamp/session-slice fixes are still relevant to Masi.

| | |
|---|---|
| **Zazi source** | `src/screens/sessions/NewSessionScreen.js`, `src/utils/activeSessionState.js` |
| **Masi target** | `src/services/literacySessionPersistence.js`, `src/screens/sessions/LiteracySessionForm.js`, session repositories. |
| **Effort** | S audit, M if fixes needed |

---

## 5. Motivation Layer

These are the celebratory, progress, and animation features the user likely remembers most. They should be implemented after the session lifecycle is stable.

### 5.1 Sessions Today Ring

- [ ] Port/adapt the Sessions Today ring.

| | |
|---|---|
| **Zazi sources** | `src/components/dashboard/SessionsTodayRing.js`, `src/utils/sessionGoal.js`, `docs/superpowers/specs/2026-05-22-sessions-today-ring-design.md` |
| **Masi current gap** | Home has weekly session squares but no daily goal ring. |
| **Dependencies** | Masi currently needs dependency check/install for `react-native-svg` and `expo-haptics`; `expo-linear-gradient` is already present. |
| **Key design decision** | Define Masi's daily session target. Zazi uses grade-aware goals; Masi likely needs role/programme-aware or global goals. |
| **Effort** | S-M |

### 5.2 Session Completion Screen

- [ ] Port/adapt the session completion interstitial.

| | |
|---|---|
| **Zazi sources** | `src/screens/sessions/SessionCompleteScreen.js`, `src/hooks/useDelayedAction.js`, `src/components/dashboard/SessionsTodayRing.js` |
| **Masi current gap** | `LiteracySessionForm` saves then returns with `navigation.goBack()`. No `SessionComplete` route exists. |
| **Dependency** | Do after Sessions Today Ring and after session lifecycle/resume decisions. |
| **Masi adaptation** | Lower animation intensity for low-end Android; tune auto-continue duration for field workflow. |
| **Effort** | M |

### 5.3 Haptics and Animation Device-Tier Gates

- [ ] Port/adapt Zazi's low-end Android/reduce-motion device-tier framework.

| | |
|---|---|
| **Zazi sources** | `src/screens/auth/deviceTier.js`, `src/screens/auth/useDeviceTier.js`, `src/screens/auth/deviceTier.test.js` |
| **Where Masi can use it** | Login motif, Sessions Today ring, Session Complete screen, any future celebratory motion. |
| **Recommendation** | Move to a shared Masi utility path instead of keeping it under `screens/auth`. |
| **Effort** | S |

### 5.4 Home Things To Do

- [ ] 🟡 Modify: port the lightweight "Things to do" nudge pattern if it maps to Masi operations.

| | |
|---|---|
| **Zazi sources** | `src/utils/homeActionItems.js`, `src/screens/main/HomeScreen.js` |
| **What it surfaces** | Complete class list, keep adding children, assess kids, group kids. |
| **Masi adaptation** | Use Masi-specific operational nudges: children missing assessments, sessions not recorded this week, sync failures, missing class/group setup, or role-specific tasks. |
| **Effort** | M |

---

## 6. Brand Polish

Port patterns, not Zazi branding.

### 6.1 Section Header Pattern

- [ ] 🟡 Modify: add a Masi `SectionHeader` component and apply consistently.

| | |
|---|---|
| **Zazi source** | `src/components/common/SectionHeader.js` |
| **Masi current gap** | Section headers are mostly inline text styles. |
| **Masi change** | Create a Masi-styled component and migrate Home, Sessions, Children/Class, Assessments, Profile sections incrementally. |
| **Effort** | S |

### 6.2 Login Redesign Framework

- [ ] 🟡 Modify: use Zazi's structure/device-tier approach, not the letter-rain motif.

| | |
|---|---|
| **Zazi sources** | `src/screens/auth/LoginScreen.js`, `src/screens/auth/LetterRain.js`, `src/screens/auth/deviceTier.js`, `src/screens/auth/useDeviceTier.js` |
| **Masi current state** | Clean static logo, email/password fields, gradient button. |
| **Do not copy** | Letter-rain, Zazi wordmark, "Sounds · Letters · Confidence", Zazi blue/pink/yellow identity. |
| **Possible Masi directions** | Static brand image with better safe-area/keyboard layout; subtle logo halo; Masi-specific background artwork; or no animation for field reliability. |
| **Effort** | M |

### 6.3 Compact Dashboard Components

- [ ] Verify `StatBar`, `RankedBarRow`, and insight cards are consistent across both apps.

| | |
|---|---|
| **Zazi sources** | `src/components/dashboard/StatBar.js`, `src/components/dashboard/RankedBarRow.js`, insight screens |
| **Masi current state** | These components already exist, but differ from Zazi due to SQLite repository changes and Masi styling. |
| **Effort** | S review |

### 6.4 Color Semantics

- [ ] 🟡 Modify: keep Masi brand tokens and avoid importing ZZ yellow semantics literally.

| | |
|---|---|
| **Zazi pattern** | Yellow/accent used only for small structural or celebratory accents, not as a categorical state container. |
| **Masi action** | Audit `src/constants/colors.js` and screen styles before major polish. Use Masi's own primary/accent/error/success semantics. |
| **Effort** | S |

---

## 7. Assessment and Literacy UX Audit

Many assessment primitives are already in both apps, but these deserve explicit verification because they are small and high-value.

### 7.1 Assessment Child Picker Hints

- [ ] Verify Masi matches Zazi's child-picker refinements.

| | |
|---|---|
| **Zazi source** | `src/screens/assessments/AssessmentChildSelectScreen.js` |
| **Checklist** | Search, unassessed-first sorting, latest score/date hint, class-language auto-detection, fallback language dialog. |
| **Masi state** | Appears mostly present; verify with tests before marking done. |

### 7.2 Last Attempted Bottom Sheet

- [ ] Verify Masi's last-attempted safeguard matches Zazi.

| | |
|---|---|
| **Zazi sources** | `src/components/assessment/LastAttemptedBottomSheet.js`, `src/screens/assessments/LetterAssessmentScreen.js` |
| **Masi state** | Component exists and is used; verify behavior on timed assessments. |

### 7.3 Assessment History Type/Sync Badges

- [ ] Verify Masi's assessment history cards show useful type and sync state.

| | |
|---|---|
| **Zazi source** | `src/screens/assessments/AssessmentHistoryScreen.js` |
| **Masi target** | `src/screens/assessments/AssessmentHistoryScreen.js` |

### 7.4 Child Assessment Summary Shortcuts

- [ ] Verify Masi's child summary has direct run/detail/letter-tracker actions.

| | |
|---|---|
| **Zazi sources** | `src/screens/assessments/ChildAssessmentSummaryScreen.js`, `src/screens/children/ClassDetailScreen.js` |
| **Masi state** | Class Detail has letter tracker and assessment summary icons; verify summary actions. |

---

## 8. Deferred Systems

### 8.1 Push Notifications and Durable Inbox

- [ ] ⏸ Defer until after SQLite cutover and backend authority decision.

| | |
|---|---|
| **Zazi sources** | `src/context/NotificationsContext.js`, `src/components/notifications/InboxCard.js`, `src/services/notifications/*`, push ADRs, Supabase notification tables |
| **Split the work** | Notification **UI pattern** can be studied separately from push transport. Push transport is a backend/mobile/system feature. |
| **Portable UI ideas** | Home inbox card, unread dot, expand-to-read, dismiss, offline routing banner. |
| **Do not copy literally** | PM-message terminology, Zazi URLs, or sender/recipient assumptions. |
| **Effort** | L |

### 8.2 Masi-Specific QA Seed Scenarios

- [ ] ⏸ Defer: use Zazi seed scripts as inspiration only.

| | |
|---|---|
| **Zazi source** | TestFlight seed/dev scenario scripts and docs from the May 15 series. |
| **Masi adaptation** | Create Masi-specific scenarios: blank staff account, one class with children, unsynced session/assessment, failed outbox, low-end Android support export, multiple programme enrollments. |
| **Effort** | M |

### 8.3 App Icon Refresh

- [ ] ❌ Skip as a port.

Masi already has Masi-branded icons. A brand refresh would be a separate design exercise, not a Zazi feature port.

---

## Screen-by-Screen Audit Matrix

This section exists so future work does not rely on memory of "we checked Zazi." Every registered Zazi screen is accounted for.

| Area | Zazi screen/source | Masi equivalent | Port status / action |
|---|---|---|---|
| Navigation | `src/navigation/AppNavigator.js` | `src/navigation/AppNavigator.js` | Masi lacks `Today`, `Groups`, `GroupDetail`, `GroupPicker`, `AutoGroupingPreview`, `SessionComplete`, `ResumeBanner`, `BottomTabIcon`, `navigationRef`. Decide selectively. |
| Auth | `src/screens/auth/LoginScreen.js` | `src/screens/auth/LoginScreen.js` | Modify only: better layout/device-tier framework possible; skip letter-rain motif. |
| Auth | `src/screens/auth/ForgotPasswordScreen.js` | `src/screens/auth/ForgotPasswordScreen.js` | No major port candidate; verify copy/URLs only if login is redesigned. |
| Home | `src/screens/main/HomeScreen.js` | `src/screens/main/HomeScreen.js` | Port candidates: stats footnote, Things to do, Sessions Today ring, notification inbox UI later. Clock card already strong in Masi. |
| Today | `src/screens/main/TodayScreen.js` | `src/screens/main/SessionsScreen.js` | Product decision: keep Sessions tab or rename/rebuild as Today. Do not port placeholder AI copy now. |
| Children root | `src/screens/main/ChildrenListScreen.js` | `src/screens/main/ChildrenListScreen.js` | Search exists in Masi. Consider auto-open first class + Manage classes only after user decision. |
| Class detail | `src/screens/children/ClassDetailScreen.js` | `src/screens/children/ClassDetailScreen.js` | Masi has group chips; missing Children/Groups switcher and auto-group CTA states. |
| Add child | `src/screens/children/AddChildScreen.js` | `src/screens/children/AddChildScreen.js` | Gender chips/no-suggestion inputs shipped. Verify class context and group picker details. |
| Edit child | `src/screens/children/EditChildScreen.js` | `src/screens/children/EditChildScreen.js` | Gender chips/no-suggestion inputs shipped. Add defensive context-loading guard later. |
| Create class | `src/screens/children/CreateClassScreen.js` | `src/screens/children/CreateClassScreen.js` | Verify offline/reference-data retry state. |
| Edit class | `src/screens/children/EditClassScreen.js` | `src/screens/children/EditClassScreen.js` | Verify delete warnings and offline/reference-data behavior. |
| Groups list | `src/screens/groups/GroupsScreen.js` | None | Port after cutover if group workflow is approved. |
| Group detail | `src/screens/groups/GroupDetailScreen.js` | None | Port after group list/cards. Modify programme-level badge semantics. |
| Group picker | `src/screens/groups/GroupPickerScreen.js` | None | Do not port until session `group_ids` semantics are decided. |
| Auto-group preview | `src/screens/groups/AutoGroupingPreviewScreen.js` | None | Defer as its own feature/spec. |
| Sessions history | `src/screens/sessions/SessionHistoryScreen.js` | `src/screens/sessions/SessionHistoryScreen.js` | Masi has history; evaluate backfill/log-past-session separately. |
| New session | `src/screens/sessions/NewSessionScreen.js` | `src/screens/sessions/LiteracySessionForm.js` | Large gap: state machine, timer, attendance, group context, discard prompt, completion route. |
| Session complete | `src/screens/sessions/SessionCompleteScreen.js` | None | Depends on Sessions Today ring and session lifecycle work. |
| Assessments tab | `src/screens/main/AssessmentsScreen.js` | `src/screens/main/AssessmentsScreen.js` | Mostly aligned; verify stats/history buttons. |
| Assessment child select | `src/screens/assessments/AssessmentChildSelectScreen.js` | Same path | Mostly aligned; verify unassessed sorting, latest hints, language fallback. |
| Letter assessment | `src/screens/assessments/LetterAssessmentScreen.js` | Same path | Mostly aligned; verify active assessment guard and low-end layout. |
| Assessment results | `src/screens/assessments/AssessmentResultsScreen.js` | Same path | Small port: hero stat should be correct count, not percent. |
| Assessment history | `src/screens/assessments/AssessmentHistoryScreen.js` | Same path | Verify type badges, sync badges, cache-first behavior. |
| Assessment detail | `src/screens/assessments/AssessmentDetailScreen.js` | Same path | Mostly aligned; verify result grid and feedback copy. |
| Letter tracker | `src/screens/assessments/LetterTrackerScreen.js` | Same path | Mostly aligned; verify assessment+taught legend and SQLite write path. |
| Child assessment summary | `src/screens/assessments/ChildAssessmentSummaryScreen.js` | Same path | Mostly aligned; verify direct shortcuts and latest score display. |
| Insights | `src/screens/insights/*RankingScreen.js` | Same paths | Small port: assessment ranking color thresholds. Verify StatBar/RankedBarRow consistency. |
| Profile | `src/screens/main/ProfileScreen.js` | Same path | Masi has release/backend identity and debug exports; upgrade OTA/git metadata later. Notifications deferred. |
| Sync status | `src/screens/main/SyncStatusScreen.js` | Same path | Verify failed-item retry and per-table breakdown. |
| Time entries | `src/screens/main/TimeEntriesListScreen.js` | Same path | Mostly aligned; verify grouped work history and unsynced chips. |
| Time tracking | `src/screens/main/TimeTrackingScreen.js` | Same path | Zazi full screen exists but is not registered; Masi still registers TimeTracking for clock-in flow. |
| Notifications | `src/context/NotificationsContext.js`, `src/components/notifications/InboxCard.js` | None | Defer push transport; consider Home inbox UI only in a later notification feature. |

---

## Source Components and Utilities Worth Reusing

| Zazi source | Why it matters | Masi action |
|---|---|---|
| `src/components/common/BottomTabIcon.js` | Central tab icon mapping + active dot. | Port/reskin if tab polish is approved. |
| `src/components/common/SectionHeader.js` | Consistent compact section headers. | Port/reskin as a small polish task. |
| `src/components/dashboard/SessionsTodayRing.js` | Main daily-goal visual. | Port after goal rule and deps are decided. |
| `src/utils/sessionGoal.js` | Pure goal/ring state helper. | Rewrite for Masi roles/programmes. |
| `src/screens/auth/deviceTier.js` | Testable device-tier gating. | Move into shared Masi utility if using animations. |
| `src/hooks/useDelayedAction.js` | Clean delayed reveal/auto-continue helper. | Reuse for completion screen only. |
| `src/utils/homeActionItems.js` | Prioritized action nudge pattern. | Adapt to Masi-specific operations. |
| `src/components/groups/GroupCard.js` | Readable group overview card. | Port after group workflow decision. |
| `src/utils/groupStats.js` | Pure group stats calculation. | Rewrite against Masi SQLite tables. |
| `src/utils/groupPickerPresentation.js` | Simple auto-select/no-picker helper. | Reuse if group-first sessions are approved. |
| `src/utils/activeSessionState.js` | Testable session lifecycle core. | Use as inspiration for a Masi-specific state machine. |
| `src/hooks/useActiveSessionState.js` | Active session persistence and resume. | Use after session state machine exists. |
| `src/components/session/ResumeBanner.js` | Lightweight global recovery affordance. | Use after active-session state exists. |
| `src/utils/assessmentScoreColors.js` | Grade-aware score color helper. | Port/adapt thresholds soon. |
| `src/components/notifications/InboxCard.js` | Useful inbox card UI independent of push transport. | Defer until notification UX is scoped. |

---

## Do Not Port Literally

- Letter-rain animation, Zazi wordmark, Zazi tagline, or literacy-specific letters.
- Zazi colors, especially yellow accent usage, without reskinning to Masi tokens.
- Zazi grouping thresholds/rules without a Masi grouping spec.
- Zazi `Letters` / `Blending` programme-level labels unless Masi uses the same pedagogy model.
- Zazi legal URLs, support copy, PM-message terminology, and push notification sender assumptions.
- Zazi TestFlight seed data or isiXhosa fixtures as direct Masi data.
- Speculative Daily Plan / AI Coach placeholder copy before Masi has a real backend plan.

---

## Open Product Decisions

1. **Daily session goal:** What is Masi's target rule for the Sessions Today ring: global, role-based, programme-based, or user-configured?
2. **Session group context:** Should Masi sessions be group-first and store `group_ids`, or remain child-first?
3. **Today vs Sessions tab:** Keep current `Sessions` label, rename to `Today`, or create a hybrid?
4. **Children auto-route:** Should staff land directly in their first class, or is the class list still the right root?
5. **Session timer:** Does Masi need start/stop timing inside session capture, separate from clock-in/out?
6. **Backfill:** Should field staff be allowed to log past sessions?
7. **Login motif:** What Masi-specific visual should replace Zazi letter-rain if login gets redesigned?
8. **Notification UX:** Is a Home inbox useful before push transport exists, or should notifications wait as one larger feature?

---

## Suggested First Implementation Bundle

After SQLite cutover validation is closed, the safest high-value bundle is:

1. Assessment Complete correct-count hero.
2. Grade-aware assessment ranking colors.
3. Home monthly stats footnote.
4. Release metadata git/OTA depth.
5. SectionHeader and BottomTabIcon polish.

Then decide the larger workflow direction:

1. Session lifecycle/resume work.
2. Sessions Today ring.
3. Session completion screen.
4. Group overview/detail workflow.
5. Group-first session picker.
6. Auto-grouping feature spec, only if still wanted.

---

## Reference Docs in Zazi

- `documentation/feature-change-requests-2026-05-15.md`
- `documentation/next-level-feature-ideas-2026-05-15.md`
- `documentation/next-level-feature-difficulty-order-2026-05-18.md`
- `docs/superpowers/specs/2026-05-22-sessions-today-ring-design.md`
- `docs/superpowers/plans/2026-05-23-push-notification-infrastructure.md`
- `docs/adr/0001` through `docs/adr/0004`
- `documentation/sqlite-refactor-log.md`

---

## Reference Files in Masi

- `src/navigation/AppNavigator.js`
- `src/screens/main/HomeScreen.js`
- `src/screens/main/SessionsScreen.js`
- `src/screens/main/ChildrenListScreen.js`
- `src/screens/children/ClassDetailScreen.js`
- `src/screens/sessions/LiteracySessionForm.js`
- `src/screens/assessments/AssessmentResultsScreen.js`
- `src/screens/insights/AssessmentRankingScreen.js`
- `src/screens/main/ProfileScreen.js`
- `documentation/sqlite-refactor-log.md`

---

*This document is ready to triage with the user. Once decisions are made, create focused implementation plans under `docs/superpowers/plans/`, one feature family at a time.*
