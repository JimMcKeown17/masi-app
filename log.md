# Masi App — Rollout Log

Living document tracking where we are on each platform in the external-testing → production journey. Update as status changes. Paired with `DEPLOYMENT.md` (the how) — this file is the where.

Last updated: 2026-04-21

---

## Current Phase

Field testing round 2: expanding from internal staff to **~15 external testers** in the field.
Internal testing (2 weeks) complete — went well, 9 bug fixes and feature requests addressed in commit `4e189d6`.

---

## iOS — TestFlight

### Account & App
- Bundle ID: `org.masinyusane.masi`
- App Store Connect: Masi (masinyusane account)
- Current marketing version: **1.1.0**

### Builds (from App Store Connect, as of 2026-04-21)

| Build | Status | Date | Invites | Installs | Sessions |
|---|---|---|---|---|---|
| 1.1.0 (5) | **Testing** | Mar 27, 2026 | 12 | 11 | 113 |
| 1.1.0 (4) | Ready to Submit | Mar 27, 2026 | 8 | 1 | 7 |
| 1.0.0 (1) | Complete | Mar 6, 2026 | — | — | — |

### Tester Groups (verified 2026-04-21 from build 1.1.0 (5) detail page)
- **Internal**
  - `masi_staff_testers` — 8 testers — staff running field tests
  - `Team (Expo)` — 1 tester — dev team
- **External**
  - `masi_staff_app_testers` — **7 testers already enrolled**

### External Testing Approval — ✅ APPROVED
- Build 1.1.0 (5) has `masi_staff_app_testers` (External) attached with status "Testing". On TestFlight, an External group can only receive a build after Beta App Review approval — so review has already passed for this build.
- Adding more testers to `masi_staff_app_testers` takes effect immediately; no further review needed for this build.
- Future builds submitted to the external group will trigger a fresh Beta App Review (usually a few hours to 1 day).

### Next Steps — iOS
- [ ] Click into `masi_staff_app_testers` in App Store Connect and record who the 7 existing testers are (so we know who's already covered vs. who still needs an invite out of the 15 target)
- [ ] Add any of the 15 target testers who are not already in the group
- [ ] Replace the placeholder "Updated build." in Test Information → What to Test with 2–4 concrete things to try (login, sync, offline, Shake-to-Report, etc.) — external testers need more guidance than internal staff
- [ ] (Optional) Enable and share the TestFlight public link for easier onboarding

---

## Android — Google Play

### Account & App
- Package name: `org.masinyusane.masi`
- Console: Google Play Console (masinyusane account)
- Current marketing version: **1.1.0**

### Android Developer Verification
- **Status: Registered** (email confirmation received 2026-04-21)
- This is **not** testing-track approval — it's the upcoming Android Developer Verification program (full rollout Sept 2026) where package name + signing keys get tied to verified developer identity so the app remains installable on certified Android devices.
- Action item carried forward from email: if we ever sign/distribute this app outside of Play (e.g., sideloaded APK), register those additional keys on the Android developer verification page.

### Current Tracks (verified 2026-04-21 from Play Console)
- **Internal testing:** ✅ Active — latest release **3 (1.1.0)**; 100-tester cap; no review required
- **Closed testing:** ❌ Never set up
- **Open testing:** ❌ Never set up
- **Production:** ❌ Never published — app status is **"Draft"**, "Not yet sent for review"
- **Last updated on Play Console:** Mar 27, 2026

### Internal Testing — Tester Lists
- **Masi Staff - Internal Testers** — 16 users — attached to Internal track (existing)
- **Masi Field Testers - External** — TO CREATE — will hold the 15 external field testers

### Android Temporary App Name
Because the app has never been through Play Store review, testers currently see the app as **`org.masinyusane.masi (unreviewed)`** in Play Store. Cosmetic only — resolves when we eventually promote to Closed testing or Production and pass review.

### Strategy Decision (2026-04-21)
Stay on the **Internal testing** track for the 15 external testers. Rationale:
- 15 fits well within the 100-tester cap
- No review wait; no store-listing work required yet
- "Internal" is just a track name — anyone with a Google account can be added as a tester
- Closed testing work (store listing, privacy policy, content rating, data safety form, feature graphic, etc.) becomes a separate project when we're ready to move toward public production release

### Next Steps — Android
- [ ] Check whether any of the 15 target testers are already in `Masi Staff - Internal Testers` to avoid duplicates
- [ ] On Play Console → Testing → Internal testing → Testers tab, click **Create email list**
- [ ] Create list named `Masi Field Testers - External` and paste the 15 emails
- [ ] Check the new list's checkbox so it's attached to the Internal testing track
- [ ] Under "How testers join your test → Join on the web", click **Copy link** and save the opt-in URL here in the log
- [ ] Email the 15 testers with: (a) opt-in URL, (b) instructions to click on their Android phone signed into the right Google account, (c) tap "Become a tester", (d) open Play Store and install Masi
- [ ] Confirm installs land — note anyone who hits errors in the tester table

### Critical Reminder
Unlike TestFlight, Google Play Internal testing does **not** auto-email testers. Adding an email to the list is step 1 of 2 — testers will NOT receive any notification. You must share the opt-in URL out-of-band (email, WhatsApp, etc.) for them to join.

### Future — Path to Production (separate project, not blocking field testing)
- [ ] Complete Play Store listing (icon, feature graphic, screenshots, short/full description)
- [ ] Privacy policy URL
- [ ] Content rating questionnaire
- [ ] Data safety form
- [ ] Target audience declaration
- [ ] Set up Closed testing track (triggers first Play Store review)
- [ ] Verify current status of the 20-tester / 14-day closed-testing-before-production rule for organization accounts

---

## External Testers

- Target count: **14** (corrected from 15 on 2026-04-21)
- Platform strategy: **adding to both iOS and Android** (see decision 2026-04-21 below)
- **Android status:** 10/14 added successfully; 4 rejected — 1 iCloud (expected, needs Google account), 3 Gmail (under investigation — likely typos, hidden whitespace, or duplicates). Opt-in link sent to all.
- **iOS status:** invites sent via TestFlight `masi_staff_app_testers` group (2026-04-21).

| # | Name | Email | iOS invited | Android invited | Installed? | Notes |
|---|---|---|---|---|---|---|
| 1 |  |  |  |  |  |  |
| 2 |  |  |  |  |  |  |
| 3 |  |  |  |  |  |  |
| 4 |  |  |  |  |  |  |
| 5 |  |  |  |  |  |  |
| 6 |  |  |  |  |  |  |
| 7 |  |  |  |  |  |  |
| 8 |  |  |  |  |  |  |
| 9 |  |  |  |  |  |  |
| 10 |  |  |  |  |  |  |
| 11 |  |  |  |  |  |  |
| 12 |  |  |  |  |  |  |
| 13 |  |  |  |  |  |  |
| 14 |  |  |  |  |  |  |
| 15 |  |  |  |  |  |  |

---

## Decisions Log

- **2026-04-21 — Invite all 15 testers on both platforms without surveying.** Rationale: TestFlight external cap is 10,000, Play Console closed-testing default is 100 — 15 × 2 is trivial. Surveying 15 people costs more coordination than sending unused invites. Testers just ignore the invite on whichever platform they don't own.

---

## Open Questions / Risks

- Who are the 7 testers already in `masi_staff_app_testers`? Need to cross-check against the 14-person target list to avoid duplicate invites or missed people.
- **4 Android tester rejections to diagnose** (2026-04-21):
  - 1 iCloud user — confirm whether they're iPhone (covered via TestFlight) or Android (need a Google account email)
  - 3 Gmail users rejected — likely typos, hidden whitespace from copy-paste, or duplicates. If they're iPhone users on TestFlight, Android coverage is optional.
- **Auth mismatch watch-list:** any tester who opts in but reports "You aren't a tester" on Play Store probably signed into their Android phone with a different Google account than the one we have listed. Fix by updating their email on the list.
- The Google developer-verification email mentions apps distributed **outside** Play. We don't distribute outside Play today, so no action, but flag if that changes.

---

## References

- `DEPLOYMENT.md` — build/submit commands and OTA update workflow
- `CLAUDE.md` — project conventions, EAS env-var gotcha, backwards-compatibility rules
- `PRD.md` — product requirements, development progress checklist
