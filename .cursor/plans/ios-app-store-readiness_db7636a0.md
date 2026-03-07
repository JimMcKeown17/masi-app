---
name: ios-app-store-readiness
overview: Pre-submit readiness plan to reduce Apple rejection risk, align privacy/compliance disclosures, and finish required App Store assets/metadata for an iPhone-only v1 release.
todos:
  - id: scope-iphone-only
    content: Set iOS release scope to iPhone-only and confirm App Store Connect device-family alignment
    status: pending
  - id: align-location-privacy
    content: Align iOS location privacy keys with foreground-only permission usage and add encryption compliance flag if applicable
    status: pending
  - id: reviewer-ux-polish
    content: Remove or harden reviewer-facing incomplete flows and replace placeholder splash asset
    status: pending
  - id: privacy-disclosure-pack
    content: Prepare App Privacy questionnaire answers and review notes, including visible debug-export behavior
    status: pending
  - id: asc-metadata-assets
    content: Complete screenshots and mandatory App Store Connect metadata for iPhone release
    status: pending
  - id: production-smoke-tests
    content: Run physical-device pre-submit smoke tests and close critical/high sync/reliability risks
    status: pending
isProject: false
---

## iOS App Store Readiness Plan

## Objective

Ship an iPhone-only first release that is materially compliant with Apple review expectations, with permissions/privacy disclosures matching actual behavior and no obvious reviewer-facing quality blockers.

## Priority Findings To Address

- `High` — Offline sync review documents unresolved critical/high risks that can impact trust and reviewer confidence (delete sync gap, data integrity/privacy concerns): [offline_sync_review.md](/Users/jimmckeown/Development/masi-app/offline_sync_review.md).
- `High` — Splash asset is still a placeholder graphic and not product branding: [assets/splash-icon.png](/Users/jimmckeown/Development/masi-app/assets/splash-icon.png).
- `Medium` — iOS location declaration is broader than runtime use (`Always` key present, code requests foreground): [app.json](/Users/jimmckeown/Development/masi-app/app.json), [src/services/locationService.js](/Users/jimmckeown/Development/masi-app/src/services/locationService.js).
- `Medium` — Reviewer-visible incomplete features remain in primary navigation/flows (“Coming soon”): [src/screens/main/AssessmentsScreen.js](/Users/jimmckeown/Development/masi-app/src/screens/main/AssessmentsScreen.js), [src/screens/sessions/SessionFormScreen.js](/Users/jimmckeown/Development/masi-app/src/screens/sessions/SessionFormScreen.js).
- `Medium` — Password reset redirect target may not be handled in-app: [src/context/AuthContext.js](/Users/jimmckeown/Development/masi-app/src/context/AuthContext.js), [src/navigation/AppNavigator.js](/Users/jimmckeown/Development/masi-app/src/navigation/AppNavigator.js), [src/services/supabaseClient.js](/Users/jimmckeown/Development/masi-app/src/services/supabaseClient.js).

## Implementation Sequence

1. **Submission scope hardening (iPhone-only)**
  - Update iOS config to disable tablet support and ensure App Store Connect device-family expectations match your chosen release scope.
  - Verify version/build policy for production profile (`version` and iOS `buildNumber`/auto-increment behavior).
2. **Permission/compliance alignment**
  - Align iOS `Info.plist` location keys with actual foreground-only permission behavior.
  - Add export-compliance config (`usesNonExemptEncryption`) if appropriate for your use case.
3. **Reviewer-facing UX quality fixes**
  - Replace splash placeholder with branded launch image.
  - Decide how to present incomplete features (remove from nav for v1, or make them clearly non-broken/non-promissory during review).
  - Confirm password reset end-to-end path works from email link to completed reset.
4. **Privacy and data handling disclosures**
  - Prepare App Privacy answers for data visible in code: precise location, contact info, identifiers, user content, diagnostics.
  - Because you chose to keep debug exports visible, document this behavior in review notes and ensure policy/disclosure language is explicit.
5. **App Store Connect asset + metadata completion**
  - Upload required iPhone screenshots for all required display sizes and complete app metadata (privacy policy/support URLs, age rating, category, reviewer instructions/demo account).
  - Validate app icon/screenshot quality and consistency with in-app branding.
6. **Pre-submit validation pass**
  - Run production build and smoke test critical flows on physical iPhone: login, sign in/out with location grant/deny, child/session flows, sync recovery, password reset.
  - Resolve any remaining critical/high issues from `offline_sync_review.md` before final submission.

## Evidence Anchors (Most Relevant Files)

- Configuration: [app.json](/Users/jimmckeown/Development/masi-app/app.json), [eas.json](/Users/jimmckeown/Development/masi-app/eas.json)
- Permissions/runtime behavior: [src/services/locationService.js](/Users/jimmckeown/Development/masi-app/src/services/locationService.js), [src/hooks/useTimeTracking.js](/Users/jimmckeown/Development/masi-app/src/hooks/useTimeTracking.js)
- Reviewer-visible placeholders: [src/screens/main/AssessmentsScreen.js](/Users/jimmckeown/Development/masi-app/src/screens/main/AssessmentsScreen.js), [src/screens/sessions/SessionFormScreen.js](/Users/jimmckeown/Development/masi-app/src/screens/sessions/SessionFormScreen.js)
- Support exports/privacy implications: [src/screens/main/ProfileScreen.js](/Users/jimmckeown/Development/masi-app/src/screens/main/ProfileScreen.js), [src/utils/debugExport.js](/Users/jimmckeown/Development/masi-app/src/utils/debugExport.js), [src/utils/logger.js](/Users/jimmckeown/Development/masi-app/src/utils/logger.js)
- Reliability risks before release: [offline_sync_review.md](/Users/jimmckeown/Development/masi-app/offline_sync_review.md)

