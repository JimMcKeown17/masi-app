# Masi App — Project Summary

**Last Updated**: 2026-03-26

## Overview

A React Native (Expo) mobile app for Masi, a South African nonprofit. Field staff use it to manage their work with children, track time, record educational sessions, and assess literacy via EGRA letter assessments. Designed to work offline-first in low-connectivity environments.

## Current Status

**Launched**: Early March 2026, in field testing across iOS and Android devices.

| Phase | Status |
|-------|--------|
| 0. Project Setup | Complete |
| 1. Authentication & Foundation | Complete |
| 2. Time Tracking with Geolocation | Complete |
| 3. Children & Groups Management | Complete |
| 4. Session Recording (Literacy Coach) | Complete |
| 5. Additional Session Forms | In Progress (requirements TBD) |
| 6. Offline Sync Refinement | Complete |
| 7. Polish & Production Prep | Partially Complete |
| 8. EGRA Letter Sound Assessment | Complete |

## Tech Stack

- **Framework**: React Native with Expo
- **Language**: JavaScript (no TypeScript)
- **UI Library**: React Native Paper (Material Design)
- **Backend**: Supabase (Authentication + PostgreSQL)
- **Offline Storage**: AsyncStorage
- **Navigation**: React Navigation (Bottom Tabs + Stack)
- **Location**: expo-location

## App Structure

**Bottom Tabs**: Home | My Children | Sessions | Assessments

### Key Features

1. **Home Screen** — Brand gradient header, sign in/out with GPS, session count, sync status banner
2. **Children Management** — Add/edit children, groups (many-to-many), schools & classes
3. **Session Recording** — Job-title-based forms (Literacy Coach complete; others TBD)
4. **Time Tracking** — GPS-verified sign in/out with offline sync
5. **EGRA Letter Assessment** — Timed 60s letter recognition assessment:
   - English and isiXhosa letter sets (60 letters each)
   - Tap-to-mark-correct grid, paginated 20/page
   - Post-assessment "Last Letter Attempted" prompt for accurate counting
   - Results screen with accuracy ring, stats, and color-coded letter grid
   - Assessment history with tappable detail cards
   - Auto-detects language from child's class assignment
   - Assessment icon on Class Details for quick access
6. **Offline Sync** — Queue-based with exponential backoff, last-write-wins, sync status screen

### Project Structure

```
src/
  components/
    common/           # SyncIndicator, LocationPermissionPrompt
    session-forms/    # LiteracySessionForm (+ future forms)
    children/         # GroupPickerBottomSheet, ChildSelector
    assessment/       # EgraLetterGrid, AssessmentTimer, LastAttemptedBottomSheet, AssessmentDetailGrid
  screens/
    auth/             # Login, ForgotPassword
    main/             # Home, TimeTracking, ChildrenList, SessionForm, SessionHistory, Profile, SyncStatus, Assessments
    assessments/      # AssessmentChildSelect, LetterAssessment, AssessmentResults, AssessmentHistory, AssessmentDetail
    children/         # ClassDetail, EditChild, CreateClass, EditClass
  context/            # Auth, Offline, Children, Classes
  services/           # supabaseClient, offlineSync, locationService
  utils/              # storage, logger, debugExport
  constants/          # colors, jobTitles, literacyConstants, egraConstants
  navigation/         # AppNavigator (auth routing + main stack + bottom tabs)
```

### Database Tables (Supabase)

`users`, `children`, `staff_children`, `groups`, `children_groups`, `time_entries`, `sessions`, `schools`, `classes`, `assessments`

## Documentation

| File | Purpose |
|------|---------|
| **PRD.md** | Full product requirements, tech stack, DB schema, feature specs, development phases |
| **PROGRESS.md** | Development progress tracker with activity log |
| **LEARNING.md** | Educational narrative of architectural decisions |
| **DATABASE_SCHEMA_GUIDE.md** | Detailed schema reference |
| **CLAUDE.md** | AI assistant context and coding conventions |
| **This file** | High-level project overview |

## Remaining Work

- **Phase 5**: Numeracy Coach, ZZ Coach, Yeboneer session forms
- **Phase 7 (remaining)**: Security review, Android/iOS device testing, performance optimisation, production deployment
- **Future**: Letter tracker (per-child mastery grid), coach alerts, OTA updates, dark mode
