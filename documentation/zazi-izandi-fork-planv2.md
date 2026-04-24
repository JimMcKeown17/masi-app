# ZZ Mobile App — Fork, FastAPI Backend, and Phased Launch

## Context

Masinyusane runs multiple programmes. The **Masi** mobile app (in field testing since March 2026) is the organization's generalist EA tool. **Zazi iZandi (ZZ)** is a distinct programme with its own partners, pedagogy, and likely organizational separation within 1-2 years. Leadership wants a **separate ZZ mobile app** with a workflow-optimized shape (Today tab, session timer, auto-grouping) and — in Phase 2 — a Python-hosted AI coach ported from the existing Next.js website prompts.

**Why this plan supersedes the earlier fork plan** (`documentation/zazi-izandi-fork-plan.md`):
- The earlier plan was scoped to "launch-a-productized-app-for-tens-of-thousands" (self-signup, Google OAuth, PowerSync consideration). That scale isn't the 12-month reality (<5,000 users), and locking those decisions now would over-invest.
- The earlier plan didn't address AI at all. This one phases it in deliberately.
- Architectural language has also shifted: AI/compute lives in **FastAPI on Render** (user's established ops pattern), not Supabase Edge Functions. Rationale below.

**What already exists and stays untouched during Phases 1-2:**
- Existing TeamPact → Django/Postgres (Render) → Next.js website pipeline — nightly cron `nightly_zz_sync_2026` runs `sync_teampact_sessions_2026`, `compute_group_summaries_2026`, `compute_letter_alignment_2026`, etc. Website `/pm/*` dashboard reads from Django with ISR (5-min revalidation).
- Masi mobile app and its Supabase project (unrelated programme, continues in parallel).

---

## End-State Architecture (Phase 2 complete)

```
┌────────────────────────────┐        ┌─────────────────────────────────┐
│ ZZ Mobile (Expo fork)      │        │ FastAPI Service (Render)        │
│  - offline-first CRUD      │────────│ /ea/brief       (SSE stream)    │
│  - Today tab (AI + timer)  │◀───SSE─│ /ea/chat        (SSE stream)    │
│  - assessments + trackers  │        │ /ea/snapshot    (AI data)       │
│  - auto-grouping (client)  │        │ /ea/tools/*     (tool endpoints)│
└──────────────┬─────────────┘        │                                 │
               │ Supabase JS SDK      │ JWT validation (Supabase JWKS)  │
               ▼                      │ Rate limits (SELECT FOR UPDATE) │
┌─────────────────────────────────────│ APScheduler cron (nightly)      │
│ Supabase Postgres (ZZ project)      │   - compute_group_summaries     │
│  • children, staff_children, groups │   - compute_letter_alignment    │
│  • sessions (+ timer fields)        │   - writes flag_summaries       │
│  • assessments, letter_mastery      └─────────────────────────────────┘
│  • classes, schools                                 │
│  • chat_messages, daily_briefs      ◀───writes──────┘
│  • flag_summaries (nightly compute)
└─────────────────────────────────────┘

── Website stays on its current stack during Phases 1-2 ──────────────
┌──────────────┐   ┌───────────────────┐   ┌─────────────────────┐
│ TeamPact API │──▶│ Django + Postgres │──▶│ Next.js PM dash     │
│ (legacy EA   │   │ (Render)          │   │ (zazi-izandi.co.za) │
│  data entry) │   │ nightly_zz_sync   │   │ ISR 5-min           │
└──────────────┘   └───────────────────┘   └─────────────────────┘
Phase 3 only: swap Next.js data source from Django API to Supabase (or FastAPI).
```

**Three independent stacks, bound by shared Python compute logic:**
1. **Mobile** — Expo/React Native/Supabase. Self-contained.
2. **FastAPI service** — Python. Reads/writes Supabase. Hosts AI endpoints + cron compute.
3. **Website** — Django/Next.js. Untouched in Phases 1-2. Phase 3 migrates to Supabase.

Compute logic (`compute_group_summaries_2026.py`, `compute_letter_alignment_2026.py`) is **extracted** to framework-neutral functions and called from both Django management commands (website-side) and FastAPI cron (mobile-side). One source of truth, two deployment paths.

---

## Architecture Decisions (final)

| Decision | Choice | Rationale |
|---|---|---|
| Mobile fork strategy | **Fork Masi + diverge** (new repo, new Supabase) | 80%+ feature overlap at launch; ZZ diverges on Today tab, timer, grouping, AI; organizational separation plausible; solo maintainer + AI-assisted dev absorbs double-maintenance tax. |
| Local storage + sync | **Keep Supabase + AsyncStorage**, port `services/offlineSync.js` as-is | <5,000 users in 12 months; AsyncStorage handles that fine; revisit PowerSync at Phase 3 scale review. |
| Mobile auth | **Supabase Auth**, admin-added users only at launch | Matches Masi pattern; hardened through two weeks of field testing; self-signup deferred. |
| AI backend | **FastAPI on Render** (not Supabase Edge Functions) | User's Python fluency; Python ecosystem advantage for agentic/tool-heavy work (sandboxing, MCP servers, Pydantic AI, DSPy, pandas-in-tools); no runtime CPU cap; existing Render ops muscle; shared compute code with Django via pure-core pattern. |
| Compute strategy | **Pure compute core (no ORM/session) + per-runtime record adapters.** Django side: ORM→records adapter. FastAPI side: asyncpg→records adapter. Core functions take typed records in, return typed records out. | Avoids cross-ORM bridging (which would be its own project). Acknowledges that adapters are a real (but thin) write per runtime. |
| Canonical staff identity | **`user_id` = `auth.uid()` (UUID)** is the one required key for all mobile/FastAPI joins, tool signatures, AI persistence. Supplementary `staff_identity_links` table holds optional `teampact_user_id`, `airtable_record_id`, plus profile metadata. No column renames on EA-owned tables. | See "Canonical Identity Contract" section — all endpoints, tables, and tool calls honor this one key. |
| Authorization model | **Service-role Postgres credentials in FastAPI; strict service-layer authorization**. Every query applies `WHERE user_id = :current_user_id` via a shared FastAPI dependency. Per-endpoint authz test matrix is a merge gate. | RLS is bypassed when using service role — acknowledged and mitigated with code discipline + tests. Simpler than PostgREST/RPC routing for a Python service doing custom compute. |
| Rate limiting | **Dedicated `ai_usage_counters(user_id, day, briefs_today, chat_messages_today)` table** with unique `(user_id, day)` and row-level locks. Atomic `SELECT ... FOR UPDATE` on the counter row, increment, compare to cap. | Avoids aggregate `COUNT(*)` under lock; mirrors the Django `AiUsageCounter` pattern used today. |
| AI freshness gate | **Block `/ea/brief` and `/ea/chat` with `503 ai_blocked_compute_stale` when required compute jobs (`compute_group_summaries`, `compute_letter_alignment`) have not succeeded in the last 36 hours.** | Pedagogy advice built on stale alignment/flag data is worse than no advice; explicit failure is more recoverable than subtly-wrong guidance. 36h gives a 1.5-cycle buffer for delayed nightly runs. |
| AI streaming | SSE via FastAPI `StreamingResponse` + Anthropic Python SDK streaming, **with client-generated idempotency key on brief requests and partial-save semantics on stream abort** | Mobile networks drop. Need resilience. |
| JWT validation | PyJWT + JWKS fetch from `{project}.supabase.co/auth/v1/.well-known/jwks.json`, cached in-process with 1h TTL + force-refresh on validation failure | Standard pattern; ~30 LOC including force-refresh. |
| Production scheduler | **Render cron service only** (separate Render service pointing at same repo). APScheduler for local/dev only (or dropped). | One scheduler in production → no double-run risk from multi-instance deploys. |
| Dual-truth policy during Phases 1-2 | **Mobile AI reads from Supabase (authoritative for EAs using ZZ mobile); website dashboard reads from Django (authoritative for TeamPact-era data).** Expected divergence window documented; reconciliation is Phase 3 work. | See "Dual-Truth Policy" section. Accepting this is cheaper than dual-writing during a 6-month transition. |
| Website migration | **Deferred 6-12 months** (Phase 3) | User explicit: "This app needs to be field tested for 3-6 months first." |
| Two Supabase projects (Masi + ZZ) | Separate | Data isolation, independent RLS, independent auth config. |
| Supabase plan | **Pro** (PgBouncer pooling) for ZZ project | FastAPI + mobile both hit the DB; pooling prevents connection exhaustion even under modest load. |

---

## Canonical Identity Contract

ZZ uses **Supabase `auth.users.id` (UUID)** as the canonical staff identity key for all new mobile and API work. No column renames on EA-owned tables — `user_id` remains the ownership column (FK to `auth.users(id)`).

A supplementary `staff_identity_links` table provides:
- Optional bridge IDs (TeamPact, Airtable) for transitional reconciliation.
- Optional profile metadata (display_name, role, school_id) used by the AI and mobile UI.

```sql
CREATE TABLE staff_identity_links (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Optional transitional links
  teampact_user_id BIGINT UNIQUE,
  airtable_record_id TEXT UNIQUE,
  -- Optional metadata (used by AI prompts + UI)
  display_name TEXT,
  role TEXT DEFAULT 'ea',
  school_id UUID REFERENCES schools(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_staff_identity_links_school ON staff_identity_links(school_id);
```

**Rules:**
- `user_id` (equal to `auth.uid()` / JWT `sub`) is the only required identity key for ZZ mobile/FastAPI.
- Every EA-owned table uses `user_id UUID NOT NULL REFERENCES auth.users(id)`. No rename from Masi's convention.
- All FastAPI endpoint dependencies resolve JWT → `user_id`. Tool signatures (`getGroupDetail`, etc.) take `user_id` and apply it as an ownership filter.
- All AI persistence (`daily_briefs`, `chat_messages`, `ai_usage_counters`) is keyed on `user_id`.
- All compute output records (`flag_summaries`) reference groups owned (transitively via `staff_children`) by the requesting `user_id`.
- `teampact_user_id` / `airtable_record_id` are **optional bridge fields only** — FastAPI never joins on them or uses them for authorization.
- First time a new authenticated user hits the API, a `staff_identity_links` row is created with `display_name` pulled from `auth.users.raw_user_meta_data` (or left null; mobile ProfileScreen lets EA set it).

**Implication for AI snapshot:** The Python port of `getAiSnapshot` takes `user_id` and walks `staff_children → children → groups` to find the EA's groups. Display name for brief-greeting comes from `staff_identity_links.display_name` (with a fallback if null).

---

## Dual-Truth Policy (Phases 1-2)

During Phases 1-2, **two compute pipelines run in parallel on different data**:

| Surface | Data source | Authoritative for | Who computes |
|---|---|---|---|
| Website `/pm/*` dashboard | Django Postgres (TeamPact ETL) | Programme managers viewing historical + TeamPact-entered data | Existing `nightly_zz_sync_2026` cron on Render (unchanged) |
| Mobile AI (Today tab) | Supabase (mobile-entered) | EAs using the ZZ mobile app | New FastAPI nightly cron on Render |

**Expected divergence:** For any EA who is transitioning from TeamPact to mobile, the two stacks will show different flags and counts during the transition window. This is acknowledged, not hidden.

**Policy:**
1. **EA rollout discipline.** When an EA adopts ZZ mobile, they stop logging via TeamPact on the same day. No dual-entry. This collapses the divergence window to ~the nightly cron gap.
2. **Stakeholder messaging.** PMs are told up-front: website dashboard reflects TeamPact-sourced history; mobile AI reflects mobile-sourced present. Full reconciliation is Phase 3.
3. **Operational guardrail.** Differences between the two surfaces are only treated as **incidents** when they indicate pipeline breakage (compute failure, bad joins, obviously incorrect flags) — not when they reflect normal source-of-truth divergence. Normal divergence is expected and documented.
4. **Reconciliation checks (Phase 2.5, optional).** If divergence causes confusion, add a weekly reconciliation job that compares group-level counts between stacks and flags unexpected mismatches. Not required at Phase 2 launch.
5. **No cross-writes.** The FastAPI cron does **not** write to Django's DB, and vice versa. Each pipeline owns its own tables.

Phase 3 collapses this when the website migrates to Supabase reads.

---

## Phase 1 — Mobile Fork + Launch (weeks 0-5)

Ship a ZZ-branded, working mobile app. **No AI, no FastAPI required yet.**

### 1.1 Repo + build setup
- New GitHub repo `zazi-izandi-app`. Clone Masi, `rm -rf .git`, init fresh, push.
- `npx expo start` — verify parity with Masi.
- `eas init` for a new EAS project ID.
- Update `package.json` name `"zazi-izandi-app"`.

### 1.2 Rebrand

**`app.json`:**
- `name` → "Zazi iZandi"
- `slug` → "zazi-izandi-app"
- `scheme` → "zz-app" (deep links, password reset)
- `bundleIdentifier` (iOS) / `package` (Android) → e.g. `org.masinyusane.zz` (confirm with ZZ branding)
- `icon`, `splash` → new placeholder assets (derive from website favicon/logo)
- `extra.supabaseUrl` + `extra.supabaseAnonKey` → **new ZZ Supabase project** values
- `eas.projectId`, `updates.url` → new EAS values

**Source text replacements** (same list as the earlier fork plan):
- `src/constants/colors.js` — ZZ palette (extract tokens from Next.js Tailwind config at `/Users/jimmckeown/Development/Zazi_iZandi_Website_2026/zazi-izandi-nextjs/tailwind.config.*`)
- `src/context/AuthContext.js` — `'masi-app://reset-password'` → `'zz-app://reset-password'`
- `src/screens/auth/LoginScreen.js` — logo, copy, gradient
- `src/screens/main/ProfileScreen.js` — support text, terms URLs
- `src/utils/debugExport.js` — filenames `masi-` → `zazi-izandi-`
- `App.js` — rebrand comments, ErrorBoundary hardcoded hex
- `src/constants/literacyConstants.js` — comments

Verification: `grep -ri "masi\|masinyusane" src/ app.json eas.json package.json` returns zero results.

### 1.3 Simplify job titles + single-school UX
- `src/constants/jobTitles.js` → `export const JOB_TITLE = 'EA'` (or similar ZZ-specific)
- `src/screens/sessions/SessionFormScreen.js` — drop `job_title` conditional; always render `<LiteracySessionForm />`
- `src/screens/main/HomeScreen.js` — drop `profile?.job_title` from subtitle
- `src/screens/main/ProfileScreen.js` — drop Job Title row; change support text
- Hide multi-school switching affordances in class screens (schools remain data-driven in DB; just the UX assumes one-school-per-EA)

### 1.4 New ZZ Supabase project (data layer only — no AI tables yet)
- Create project at supabase.com; Pro plan.
- Run consolidated migration — same as Masi's final state **plus**:
  - **`staff_identity_links` table** per the Canonical Identity Contract (bridge IDs + profile metadata). Replaces Masi's heavier `users` profile table.
  - EA-owned tables keep their existing `user_id` / `created_by` columns (FK to `auth.users(id)`) — no rename.
  - `sessions` — add nullable `started_at`, `ended_at`, `duration_seconds` (session timer).
  - Pre-populate `schools` with ZZ programme schools.
  - `BTREE` index on `schools.name` for search filtering.
  - RLS policies filter on `user_id = auth.uid()` (same as Masi's conventions).
- Enable email/password auth (default). No Google OAuth at launch.
- Admin-added user creation flow: on first authenticated request from a new user, a `staff_identity_links` row is created with `display_name` pulled from `auth.users.raw_user_meta_data` (or left null and set later via ProfileScreen).
- Wire `app.json → extra` with new URL + anon key.
- Create first admin user + `staff_identity_links` row manually via Supabase dashboard.

### 1.5 New features at launch

**Today tab (shell, no AI yet):**
- Replaces Masi's Sessions tab in bottom nav.
- Hosts the session logging form + session timer.
- Renders two placeholders: "Daily plan (coming soon)" and "Chatbot (coming soon)".
- No LLM calls at launch. Placeholders lock the nav shape so Phase 2 adds content, not structure.

**Session timer:**
- Start/stop control wraps the session form.
- On save, writes `started_at`, `ended_at`, `duration_seconds` to the `sessions` row.
- Works offline (same `synced: false` pattern as existing entities).

**Auto-grouping after assessment (client-side):**
- Port the existing Python grouping logic from ZZ's current tooling (user to provide reference file).
- After 3+ children are assessed, Today tab offers a suggested grouping as an **editable preview**.
- EA can reassign children between groups; groups persist to `groups` + `children_groups` only on Accept.
- New child mid-term: after first assessment, app suggests placement into an existing group (doesn't re-group the whole class).
- Re-assessment does NOT auto-rebalance; EA manually regroups if desired.

**Letter Tracker quick-access:**
- New button on child-card in `My Children` list → opens Letter Tracker for that child.
- Existing access paths (Letter icon on Class Details, Letter Mastery card on Home) preserved.

**Groups view:**
- Basic in-app stats: sessions this week, current letter, progress %, children count. Full flag parity comes in Phase 2 when FastAPI lands.
- Placement TBD (under My Children tab, or standalone screen — decide during implementation).

### 1.6 Bottom tab structure at launch
```
Home         → time tracking + dashboard (unchanged from Masi)
My Children  → list + Groups view + letter tracker quick-access
Today        → session form + timer + AI placeholders
Assessments  → EGRA Letter/Words (unchanged from Masi)
```
Profile accessed via gear icon on Home.

### 1.7 Phase 1 verification
- `eas build --profile preview --platform ios` + Android both succeed.
- `grep -ri "masi\|masinyusane"` across entire codebase → zero results.
- New user sign-in creates a `staff_identity_links` row automatically; subsequent sessions/assessments carry the correct `user_id`.
- RLS isolation: EA A cannot SELECT EA B's children, sessions, assessments, or letter_mastery (explicit test with two accounts).
- Airplane-mode test: create session + assessment offline → reconnect → both sync to new ZZ Supabase with correct RLS and `user_id`.
- Session timer: start/stop writes `started_at`, `ended_at`, `duration_seconds` correctly; offline + sync works.
- Auto-grouping: 3+ assessments → preview shown → Accept persists groups.
- Today tab: session form works; placeholders render; **no network calls to any AI endpoint**.
- Letter Tracker quick-access from child card works.
- EAS env vars: Supabase URL + anon key present in BOTH `.env.local` AND `app.json → extra` (per established `supabaseClient.js` fallback pattern).

---

## Phase 2 — FastAPI AI Service (weeks 5-11, post-launch)

Stand up the Python backend. Hook Today tab into it.

### 2.1 New FastAPI repo

**Recommendation:** new repo `zazi-izandi-api` on Render (not bolted into existing Django repo). Clean boundary, independent deploy, easy to migrate Django's dashboard API into it later in Phase 3.

**Stack:**
- FastAPI + Uvicorn
- **asyncpg** for Supabase Postgres (raw SQL, connection pooling via PgBouncer)
- **SQLAlchemy 2.0** (async) if ORM needed for complex reads
- **PyJWT + cryptography** for Supabase JWKS validation
- **httpx** for any external HTTP
- **Anthropic Python SDK** (primary for tool use + prompt caching; OpenAI SDK optional if sticking to `gpt-5.4-mini` for parity with website)
- **Pydantic v2** for request/response models + structured LLM outputs
- **APScheduler** for cron (alternative: separate Render cron service)
- Testing: pytest + pytest-asyncio + respx

**Repo layout (proposed):**
```
zazi-izandi-api/
  app/
    main.py                  # FastAPI app factory
    auth/
      jwt.py                 # Supabase JWKS validation + FastAPI dependency
    db/
      session.py             # asyncpg pool
    ai/
      prompts.py             # Ported from system-prompt.ts
      snapshot.py            # Builds EaAiSnapshot from Supabase
      tools.py               # getGroupDetail etc.
      brief.py               # streaming brief endpoint logic
      chat.py                # streaming chat endpoint logic
      pricing.py             # token → USD cents
      rate_limit.py          # SELECT FOR UPDATE counter logic
    compute/
      core/
        group_summaries.py   # Framework-neutral pure functions
        letter_alignment.py  # Framework-neutral pure functions
      runners/
        nightly.py           # APScheduler entry points
    routers/
      ea.py                  # /ea/brief, /ea/chat, /ea/snapshot, /ea/tools/*
      health.py
  tests/
  pyproject.toml
  render.yaml                # Web service + cron job definitions
```

### 2.2 Compute extraction (pure-core + per-runtime record adapters)

The existing `/Users/jimmckeown/Development/Zazi_iZandi_Website_2025/api/management/commands/compute_group_summaries_2026.py` (558 LOC) and `compute_letter_alignment_2026.py` (290 LOC) mix three concerns:
1. Django management command plumbing (arg parsing, transaction wrappers)
2. ORM queries (Django models)
3. Pure compute (aggregations, flag logic, math)

**Architecture: pure compute core + per-runtime record adapters.** No cross-ORM bridging; no shared DB session type.

```
┌──────────────────────────────────────────────────────────────────────┐
│ zz_compute  (Python package, framework-neutral)                      │
│                                                                      │
│   group_summaries.compute(                                           │
│     sessions: list[SessionRecord],                                   │
│     assessments: list[AssessmentRecord],                             │
│     groups: list[GroupRecord],                                       │
│     children_groups: list[ChildGroupRecord],                         │
│     children: list[ChildRecord],                                     │
│     ...                                                              │
│   ) -> list[GroupSummaryRecord]                                      │
│                                                                      │
│   letter_alignment.compute(...) -> list[ChildAlignmentRecord]        │
│                                                                      │
│   • Typed records (Pydantic v2 or dataclasses)                       │
│   • Pure functions: no I/O, no ORM, no session type                  │
│   • Easy unit tests with fixtures (JSON/parquet)                     │
└──────────────────────────────────────────────────────────────────────┘
          ▲                                            ▲
          │                                            │
┌─────────┴────────────┐                  ┌────────────┴────────────┐
│ Django adapter        │                  │ FastAPI adapter         │
│ (website cron)        │                  │ (mobile cron)           │
│                       │                  │                         │
│ • ORM queryset        │                  │ • asyncpg SELECT        │
│   → SessionRecord etc │                  │   → SessionRecord etc   │
│ • call compute()      │                  │ • call compute()        │
│ • write results via   │                  │ • write results via     │
│   Django ORM          │                  │   asyncpg INSERT        │
└───────────────────────┘                  └─────────────────────────┘
```

**`zz_compute` package layout:**
```
zz_compute/
  models.py                   # Pydantic records: SessionRecord, AssessmentRecord,
                              # GroupRecord, GroupSummaryRecord, ChildAlignmentRecord, ...
  group_summaries.py          # compute(...) -> list[GroupSummaryRecord]
  letter_alignment.py         # compute(...) -> list[ChildAlignmentRecord]
  letter_constants.py         # ported from /Zazi_iZandi_Website_2025/api/letter_constants.py
  tests/
    fixtures/                 # golden-input JSON, golden-output JSON
    test_group_summaries.py   # round-trip tests
```

**Distribution:** internal Python package, installed via git URL in both `pyproject.toml` files (Django repo + FastAPI repo). Versioned; upgrade in lockstep. No PyPI publishing needed.

**Adapter responsibilities (thin):**
- **Django adapter** (lives in existing website repo, replaces the current management-command body):
  ```python
  def handle(self, *args, **options):
      sessions = [SessionRecord(**s) for s in Session.objects.values(...)]
      assessments = [AssessmentRecord(**a) for a in Assessment.objects.values(...)]
      # ... load other entities ...
      summaries = group_summaries.compute(sessions, assessments, ...)
      for s in summaries:
          GroupSummary2026.objects.update_or_create(**s.dict())
  ```
- **FastAPI adapter** (new, in `zz-api` repo):
  ```python
  async def run_group_summaries(pool: asyncpg.Pool) -> None:
      async with pool.acquire() as conn:
          sessions = [SessionRecord(**row) for row in await conn.fetch("SELECT ... FROM sessions")]
          # ... load other entities ...
          summaries = group_summaries.compute(sessions, assessments, ...)
          await conn.executemany("INSERT INTO flag_summaries ...", [s.dict() for s in summaries])
  ```

**Acknowledgment:** the adapters **are** a rewrite — roughly 150-300 LOC per side. But they're the *only* rewrite. The math, the flag logic, the letter-sequence handling, and all the edge cases stay verbatim in pure core. That's the honest trade vs. the original "no rewrite" claim.

**Migration order:**
1. Extract pure compute + records from existing Django files → `zz_compute` package. Add golden-output tests using captured real inputs/outputs from the running cron.
2. Refactor Django management commands to be thin adapter-only wrappers calling `zz_compute`. **Verify website cron output byte-identical to pre-refactor for 1-2 nights.** This is the regression-safety gate.
3. Write FastAPI adapter + asyncpg loaders against the new Supabase schema. Run against mobile data.

### 2.3 New Supabase tables (Phase 2 migration)

All AI/compute tables key on `user_id UUID` (the canonical identity — see Identity Contract section). A dedicated `ai_usage_counters` table backs atomic rate-limiting; a `compute_runs` table records job success/failure for the freshness gate.

```sql
-- atomic per-user daily usage counters (SELECT ... FOR UPDATE caps)
CREATE TABLE ai_usage_counters (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day DATE NOT NULL,
  briefs_today INT NOT NULL DEFAULT 0,
  chat_messages_today INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, day)
);
-- usage: INSERT ON CONFLICT UPDATE with SELECT ... FOR UPDATE wrapping the row

-- persisted briefs (row may be reserved before stream finishes)
CREATE TABLE daily_briefs (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day DATE NOT NULL,
  generation_index INT NOT NULL,
  idempotency_key TEXT,              -- client-generated; dedupes retries
  model TEXT NOT NULL,
  prompt_json JSONB,
  content TEXT,                      -- accumulated text; may be partial on abort
  partial BOOLEAN NOT NULL DEFAULT TRUE,
  prompt_tokens INT,
  completion_tokens INT,
  cost_usd_cents INT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  UNIQUE (user_id, day, generation_index)
);
CREATE INDEX idx_daily_briefs_user_day ON daily_briefs(user_id, day);
CREATE UNIQUE INDEX idx_daily_briefs_idempotency
  ON daily_briefs(user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- chat turns
CREATE TABLE chat_messages (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user','assistant')),
  content TEXT NOT NULL,
  partial BOOLEAN NOT NULL DEFAULT FALSE,     -- true if assistant stream aborted
  model TEXT,
  prompt_tokens INT,
  completion_tokens INT,
  cost_usd_cents INT,
  prompt_json JSONB,
  tool_calls JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_chat_messages_user_created
  ON chat_messages(user_id, created_at DESC);

-- compute run bookkeeping (freshness gate input + dead-letter log)
CREATE TABLE compute_runs (
  id BIGSERIAL PRIMARY KEY,
  job_name TEXT NOT NULL,            -- e.g. 'compute_group_summaries', 'compute_letter_alignment'
  status TEXT NOT NULL CHECK (status IN ('started', 'success', 'failed')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  error_text TEXT,
  rows_processed INT,
  rows_written INT
);
CREATE INDEX idx_compute_runs_job_completed
  ON compute_runs(job_name, completed_at DESC);

-- nightly compute output
CREATE TABLE flag_summaries (
  id BIGSERIAL PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  computed_day DATE GENERATED ALWAYS AS ((computed_at AT TIME ZONE 'UTC')::DATE) STORED,
  current_letter TEXT,
  letters_skipped JSONB,
  letters_still_needed JSONB,
  letters_needed_next_3 JSONB,
  avg_alignment_score NUMERIC,
  alignment_band TEXT,
  active_flags JSONB,
  days_since_last_session INT,
  -- extend with additional fields mirroring Django's GroupSummary2026 as needed
  UNIQUE (group_id, computed_day)
);
CREATE INDEX idx_flag_summaries_group ON flag_summaries(group_id, computed_at DESC);
```

**RLS policies (defense-in-depth for direct mobile-client reads):**
- `daily_briefs`, `chat_messages`: SELECT/INSERT where `user_id = auth.uid()`.
- `ai_usage_counters`: REVOKE from `authenticated`; FastAPI service-role only.
- `compute_runs`: REVOKE from `authenticated`; FastAPI service-role only.
- `flag_summaries`: SELECT allowed where `group_id` belongs to a group the EA owns (via `staff_children` → `children_groups` → `groups`).

**Service-role caveat:** FastAPI connects with the Postgres service-role connection string → RLS is bypassed. Every query must apply `WHERE user_id = :current_user_id` manually. See Authorization Model in §2.4.

### 2.4 AI endpoints (FastAPI)

Port from existing Next.js routes (`/Users/jimmckeown/Development/Zazi_iZandi_Website_2026/zazi-izandi-nextjs/app/api/ea/{brief,chat}/route.ts`, 270 LOC total) and `system-prompt.ts` (119 LOC).

**Endpoints:**
- `POST /ea/brief` — accepts `X-Idempotency-Key` header; if a `daily_briefs` row already exists for `(user_id, idempotency_key)`, returns that row instead of generating again. Otherwise: compute freshness gate check (503 if stale — see §2.4.1), atomic rate check via `ai_usage_counters` row lock (429 if over cap), inserts `daily_briefs` row with `partial = true`, streams LLM response via SSE, persists `content` + tokens + `partial = false` on completion. On stream abort, whatever text was received is saved and `partial` stays `true`.
- `POST /ea/chat` — freshness gate check, atomic rate check via counter row lock, inserts user `chat_messages` row, streams assistant response with `getGroupDetail` tool. On completion: inserts assistant row with full content. On abort: inserts assistant row with whatever was streamed + `partial = true`. Rolling history window (last N pairs).
- `GET /ea/brief/latest` — non-stream fallback: returns the latest brief for today, partial or complete. Used when mobile stream was interrupted and the app wants to recover the content without re-billing. Not gated on freshness (it reads existing rows).
- `GET /ea/snapshot` — returns `EaAiSnapshot` (debug + mobile cache).
- `POST /ea/tools/group-detail` — per-group drill-down (called by LLM via tool use). Validates that `group_id` is owned by `current_user_id`.

**Authorization model (service-role DB, strict service-layer authz):**

FastAPI uses Postgres service-role credentials (bypasses RLS). Every query must apply an ownership filter. Enforced by:

1. **JWT → user dependency** (single source of `current_user_id`):
   ```python
   # app/auth/jwt.py
   async def current_user(token: str = Depends(bearer_scheme)) -> AuthUser:
       claims = await verify_supabase_jwt(token)       # JWKS cached 1h, force-refresh on 401
       user_id = UUID(claims["sub"])
       link = await staff_identity_links_repo.get_or_create(user_id)
       return AuthUser(id=user_id, display_name=link.display_name, role=link.role)
   ```

2. **Ownership helpers** — every repo function that reads EA-owned data takes `user_id` and applies the filter:
   ```python
   async def list_groups_for_user(conn, user_id: UUID) -> list[GroupRecord]: ...
   async def get_group_detail(conn, user_id: UUID, group_id: UUID) -> GroupDetail | None:
       # Returns None if group_id is not owned by user_id (do NOT leak 404 vs 403)
       ...
   ```

3. **Authorization test matrix (merge gate):** every endpoint has paired pytest cases:
   - **Positive:** EA A requests their own group → 200.
   - **Negative:** EA A requests EA B's group → 403 (or 404 for existence-leak prevention). Same pattern for `daily_briefs` / `chat_messages` reads.
   - **Unauthenticated:** no/invalid JWT → 401.
   - **Rate-capped:** 4th brief same day → 429 with `cap` and `current`.
   - **Stale-compute:** required compute jobs stale >36h → 503 with `ai_blocked_compute_stale`.
   - **Tool authz:** LLM-invoked `getGroupDetail` with out-of-scope `group_id` → tool returns an empty/error record, prompt told to not leak.

   The matrix is a checklist in CI; no route merges without its row filled in.

**Prompt composition:** port `system-prompt.ts` verbatim to a Python module `app/ai/prompts.py`. Strings are trivially portable; the structure (ROLE / PROGRAMME_RULES / FLAG_TRANSLATIONS / GUARDRAILS / MISSING_CONTEXT_GATING / SNAPSHOT) ports line-for-line.

**Model choice:** default to **Anthropic Claude Sonnet 4.6** for tool use + prompt caching (system prompt is ~2,500 tokens — caching saves materially on every chat turn). Keep OpenAI `gpt-5.4-mini` as an optional fallback for parity with website. Model selection via env var, resolved per-request.

**SSE reliability defaults:**
- Idempotency key required on brief POSTs (mobile generates UUID; includes it in retries).
- Partial-save on stream abort (capture buffer + mark `partial = true`).
- Non-stream recovery endpoint (`GET /ea/brief/latest`).
- Client-side: on SSE error, fall back to recovery endpoint rather than re-POSTing (which would bill again if idempotency header was dropped).

### 2.4.1 AI freshness gate and failure behavior

AI endpoints are gated on compute freshness to avoid coaching from stale flags / alignment data.

- **Required successful jobs:** `compute_group_summaries` and `compute_letter_alignment`.
- **Freshness SLA:** latest successful run for each required job must be within **36 hours** (queried via `compute_runs` table: `SELECT MAX(completed_at) FROM compute_runs WHERE job_name = :name AND status = 'success'`).
- **If either job is stale or failed, block both** `POST /ea/brief` and `POST /ea/chat`.

**Blocked response contract:**
- HTTP `503 Service Unavailable`
- JSON body:
  ```json
  {
    "error": "ai_blocked_compute_stale",
    "jobs": {
      "compute_group_summaries": { "last_success": "2026-04-19T02:35:00Z", "stale": true },
      "compute_letter_alignment": { "last_success": "2026-04-21T02:36:00Z", "stale": false }
    }
  }
  ```
- Mobile renders: "AI coach is briefly unavailable. We're refreshing data overnight; please check back tomorrow." Plus a "Show last available brief" link pointing at `GET /ea/brief/latest`.

**Recovery:** once compute jobs succeed again, `/ea/brief` and `/ea/chat` unblock automatically. No redeploy. No manual intervention.

**Rationale:** 36 hours is a 1.5-cycle buffer for delayed nightly runs while still preventing AI decisions on stale pedagogy signals. Coaching EAs from stale alignment data (e.g., recommending letters they already mastered) erodes trust faster than explicit unavailability.

### 2.5 Nightly cron (Render cron service)

**Production scheduler = Render cron service only.** APScheduler is used only for local/dev (if at all). This avoids double-runs under multi-instance deploys and keeps the operational story "one place where cron is configured."

Add a Render cron service (separate Render service, same codebase) at ~02:30 UTC (after the existing `nightly_zz_sync_2026` Django cron finishes):

```yaml
# render.yaml (excerpt)
services:
  - type: web
    name: zazi-izandi-api
    env: python
    plan: standard
    buildCommand: pip install -r requirements.txt
    startCommand: uvicorn app.main:app --host 0.0.0.0 --port $PORT
  - type: cron
    name: zazi-izandi-nightly-compute
    env: python
    schedule: "30 2 * * *"
    buildCommand: pip install -r requirements.txt
    startCommand: python -m app.compute.runners.nightly
```

Nightly runner steps (mirrors `nightly_zz_sync_2026` shape, minus TeamPact sync). Each step inserts a `compute_runs` row with `status='started'`, runs, then updates to `status='success'` or `status='failed'`:

1. `run_group_summaries` — asyncpg adapter loads records from Supabase → `zz_compute.group_summaries.compute(...)` → upsert `flag_summaries`.
2. `run_letter_alignment` — asyncpg adapter loads records → `zz_compute.letter_alignment.compute(...)` → write per-child alignment data.
3. Any additional computes (school summaries, mentor visit summaries) added as Phase 2 scope allows.

**Run bookkeeping:**
- Every step writes a `compute_runs(job_name, status, started_at, completed_at, rows_processed, rows_written)` row.
- `status='failed'` rows carry `error_text` with the stack trace snippet.
- The freshness gate (§2.4.1) reads this table to decide whether to block AI endpoints.

**Failure handling:**
- On per-step failure: log with full stack trace + run id, write `compute_runs` row with `status='failed'`, skip the failing step, continue other steps, exit non-zero to trigger Render cron failure alert.
- **AI behavior on stale compute:** handled by the freshness gate in §2.4.1 (block with `503 ai_blocked_compute_stale`). No silent degradation.

**What stays in Django's cron** (website-side, unchanged): TeamPact ETL, parquet backups, mentor visit sync, and the Django-side computes for the website's dashboard. Those keep running until Phase 3.

### 2.6 Mobile wiring (Today tab activation)

Remove placeholders. Add:
- **Daily Brief** section on Today tab top — renders markdown from `/ea/brief` stream. Request includes a client-generated `X-Idempotency-Key` (UUID per regenerate-tap). "Regenerate" button (subject to 3/day cap).
- **Chat** section — full-screen modal or in-tab. `useChat`-style streaming UI. Persists via API (server-side, not AsyncStorage).
- **Offline handling:**
  - Brief: if offline, show last cached brief (stored in AsyncStorage on successful fetch). "You're offline — showing yesterday's plan."
  - Chat: disabled offline with clear messaging. Chat requires live LLM.
- **Stream-interruption handling:** on SSE error mid-stream, fall back to `GET /ea/brief/latest` to recover whatever was persisted (partial or complete). Do **not** re-POST (the idempotency key protects this but the client-side rule is "never blindly retry a brief POST").
- Rate-limit errors (429) render with current/cap count.

**New mobile env var:** `EXPO_PUBLIC_API_BASE_URL` → FastAPI base URL. Same `app.json → extra` fallback pattern.

### 2.7 Historical data backfill (decision point at Phase 2 kickoff)

At Phase 2 activation, Supabase holds only data generated by mobile since Phase 1 launch (~5 weeks of sessions/assessments). AI quality depends on historical assessment data (baseline scores, letters_skipped trajectories).

**Two options, decide at Phase 2 kickoff based on actual data volume:**

- **Option A — One-time TeamPact→Supabase backfill.** Adapt the existing `sync_teampact_sessions_2026` / `sync_assessments_2026` commands to target Supabase instead of Django Postgres. Run once to load historical ZZ data for children who are still enrolled. **Complexity:** writing the children identity-mapping (TeamPact `participant_id` ↔ Supabase `children.id`) is the hard part; the rest is straightforward ETL.
- **Option B — Accept ramp-up.** AI Day 1 is thin. "AI quality improves over the first 4 weeks as EAs log sessions and assessments." Document to stakeholders.

Recommendation: **lean Option A** if TeamPact has meaningful ZZ history (>4 weeks of assessments). Otherwise Option B is fine. Final call deferred to Phase 2 kickoff.

### 2.8 Observability & runbook (minimum production telemetry)

Three-stack operation (mobile → FastAPI → Postgres + cron) needs baseline observability. Nothing fancy; just the minimum to debug production incidents without guesswork.

**Required at Phase 2 launch:**
- **Request ID propagation** — mobile generates `X-Request-ID` per API call; FastAPI logs it on every DB query; request ID appears in mobile client logs too. Enables cross-tier trace.
- **Structured JSON logging** — FastAPI uses `structlog` or stdlib + `python-json-logger`. Every log line includes `request_id`, `user_id` (if auth'd), `route`, `latency_ms`.
- **Sentry** (or equivalent) — FastAPI + mobile both report to Sentry. Release tagging on each EAS build + Render deploy.
- **Rate-limit telemetry** — every 429 emits a metric event (`user_id`, `which_cap`, `current`, `cap`) so PMs see usage patterns.
- **Freshness-gate telemetry** — every 503 `ai_blocked_compute_stale` emits a metric event (which jobs are stale, for how long). Alerts if gate trips for >12 hours.
- **SSE abort metrics** — track stream start, stream complete, stream abort separately. Abort rate > 10% is an alert threshold.
- **Cron metrics** — `compute_runs` table feeds both the freshness gate and the observability story. Morning alert if any required job has status='failed' or is missing for the prior night.
- **Health endpoint** — `GET /health` checks DB connectivity, JWKS reachability, model-provider reachability (optional).

**Deferred (Phase 2.5 or later):** OpenTelemetry tracing, custom dashboards, PagerDuty integration.

### 2.9 Phase 2 verification

**Identity & authorization:**
- `staff_identity_links` row created on first authenticated request. No orphaned EA-owned rows.
- Authorization test matrix passes: positive (own data → 200), negative (other EA's data → 403/404), unauthenticated → 401, tool authz returns empty on out-of-scope `group_id`.
- Every FastAPI repo function accepts `user_id` and includes ownership filter — enforced by lint rule or code review checklist.
- Identity contract check: all AI writes (`daily_briefs`, `chat_messages`, `ai_usage_counters`) are keyed by Supabase `user_id` UUID; no hard dependency on `teampact_user_id`.

**Rate limiting:**
- 4th brief attempt same day → 429 with `cap=3, current=3`; response shape matches website's existing client expectations.
- 21st chat message same day → 429 with `cap=20, current=20`.
- Concurrent-request race test: 10 simultaneous brief POSTs → at most 3 succeed; `ai_usage_counters.briefs_today = 3` (atomic caps hold under concurrency).
- Idempotency: repeat brief POST with same `X-Idempotency-Key` returns existing row, does not increment counter.

**SSE reliability:**
- Abort stream mid-response → `daily_briefs` row has partial content, `partial = true`, counter did NOT increment on the retry via `GET /ea/brief/latest`.
- `GET /ea/brief/latest` returns latest brief (partial or complete) without billing.
- `flag_summaries` uniqueness: one row per `(group_id, computed_day)`; double-insert same day upserts cleanly.

**Freshness gate:**
- Simulate `compute_group_summaries` >36h stale (insert fake `compute_runs` row with old `completed_at`) → `POST /ea/brief` returns `503 ai_blocked_compute_stale` with per-job status metadata.
- Same condition → `POST /ea/chat` returns 503.
- Recovery path: insert a fresh `status='success'` `compute_runs` row → next `/ea/brief` request succeeds without redeploy.
- Mobile UI: renders the "AI coach is briefly unavailable" message with "Show last available brief" link pointing at `GET /ea/brief/latest`.

**Infra:**
- FastAPI deployed on Render; `/health` reachable.
- JWT validation: valid Supabase token → 200; invalid/expired → 401; missing → 401. JWKS cache refreshes on 1-hour TTL and on key-rotation signal.
- Service-role credentials scoped (env var) and never logged.

**Compute:**
- `zz_compute` package tests pass (golden-input → golden-output) in both Django and FastAPI runtimes.
- Django management command output byte-identical pre/post extraction refactor (regression gate).
- FastAPI nightly cron runs against Supabase, writes `flag_summaries` with correct uniqueness on `(group_id, computed_day)`.
- Each run writes `compute_runs` rows (`started` → `success` or `failed`). Failure path: killing the process mid-run → `failed` row with `error_text`, non-zero exit, Render alert fires.

**AI end-to-end:**
- `/ea/brief`: streams SSE, `daily_briefs` row ends with `content`, `prompt_tokens`, `completion_tokens`, `cost_usd_cents` populated, `partial = false`.
- `/ea/chat`: streams SSE, `getGroupDetail` tool fires and returns real group data from Supabase, user + assistant `chat_messages` rows persist.
- Rolling history: 7th user message → older-than-N-pairs trimmed before model call.

**Mobile:**
- Today tab: brief renders markdown; chat streams; offline shows cached brief; 429 surfaces current/cap; 503 surfaces freshness-block UI.
- SSE interruption: mobile falls back to `GET /ea/brief/latest` and displays partial content.

**Observability:**
- Request ID from mobile appears in FastAPI logs and in Sentry events.
- Sentry receives errors from both FastAPI and mobile.
- Cron metrics visible via `compute_runs` queries (duration, rows processed, rows written).

**Dual-truth:**
- Compare flag output for one overlapping group between Django nightly cron and FastAPI nightly cron (same group, same source records staged identically). Expected: identical or explained-difference. Variance from different input data is expected, not a failure.

---

## Phase 3 — Website migration (deferred 6-12 months post-launch)

**Trigger:** ZZ mobile is the primary data-entry surface (TeamPact deprecated for ZZ); website dashboard needs to read mobile-entered data.

**Scope (sketch, not committed):**
- Next.js `/pm/*` data sources swap from Django API → either FastAPI (adding read endpoints) or Supabase direct (via `@supabase/ssr`).
- Django repo retired for ZZ purposes (may stay for other Masinyusane programmes).
- TeamPact ETL retired for ZZ (mobile is the source of truth).
- `zz_compute` package continues unchanged — it's already pointing at Supabase.

Do not start Phase 3 work until:
1. ZZ mobile has been in field use for ≥3 months with stable sync.
2. Data volume + shape in Supabase matches what the website expects.
3. TeamPact deprecation plan for ZZ is concrete.

---

## Critical files & references

**Masi (fork source):**
- `/Users/jimmckeown/Development/masi-app/src/services/offlineSync.js` — sync engine (port as-is)
- `/Users/jimmckeown/Development/masi-app/src/services/supabaseClient.js` — EAS env fallback pattern (keep)
- `/Users/jimmckeown/Development/masi-app/src/context/{Auth,Children,Classes,Offline}Context.js`
- `/Users/jimmckeown/Development/masi-app/src/screens/assessments/*.js` (already parameterized — no programme coupling)
- `/Users/jimmckeown/Development/masi-app/src/components/assessment/*.js`
- `/Users/jimmckeown/Development/masi-app/app.json` (rebrand template)
- `/Users/jimmckeown/Development/masi-app/supabase/migrations/*.sql` (port all 7)

**Website (Phase 2 AI logic source — port Python):**
- `/Users/jimmckeown/Development/Zazi_iZandi_Website_2026/zazi-izandi-nextjs/lib/ea/ai/system-prompt.ts` → `app/ai/prompts.py`
- `/Users/jimmckeown/Development/Zazi_iZandi_Website_2026/zazi-izandi-nextjs/lib/ea/ai/pricing.ts` → `app/ai/pricing.py`
- `/Users/jimmckeown/Development/Zazi_iZandi_Website_2026/zazi-izandi-nextjs/app/api/ea/chat/route.ts` → `app/ai/chat.py` + `app/routers/ea.py`
- `/Users/jimmckeown/Development/Zazi_iZandi_Website_2026/zazi-izandi-nextjs/app/api/ea/brief/route.ts` → `app/ai/brief.py` + `app/routers/ea.py`
- `/Users/jimmckeown/Development/Zazi_iZandi_Website_2026/zazi-izandi-nextjs/lib/ea/ai/django-client.ts` — reference for rate-limit semantics (port to FastAPI `SELECT FOR UPDATE`)
- `/Users/jimmckeown/Development/Zazi_iZandi_Website_2026/zazi-izandi-nextjs/documentation/pm-dashboard-architecture.md` — dashboard shape reference (for Phase 3)

**Django (Phase 2 compute extraction source):**
- `/Users/jimmckeown/Development/Zazi_iZandi_Website_2025/api/management/commands/compute_group_summaries_2026.py` (558 LOC) → extract core to `zz_compute.group_summaries`
- `/Users/jimmckeown/Development/Zazi_iZandi_Website_2025/api/management/commands/compute_letter_alignment_2026.py` (290 LOC) → extract core to `zz_compute.letter_alignment`
- `/Users/jimmckeown/Development/Zazi_iZandi_Website_2025/api/letter_constants.py` — letter sequences (port verbatim or install as part of `zz_compute`)
- Existing Render cron `nightly_zz_sync_2026` — keep running unchanged

---

## Risk register

1. **Supabase Pro connection limits under FastAPI + mobile load.** Mitigation: PgBouncer (included with Pro), asyncpg pool sized sanely (start at 10 connections), monitor in Supabase dashboard.
2. **JWKS cache staleness on key rotation.** Mitigation: 1-hour TTL; on 401 from downstream, force-refresh JWKS once before returning 401 to client.
3. **`zz_compute` drift between Django and FastAPI adapters.** Mitigation: shared package, versioned in lockstep; CI runs golden-input/golden-output tests against fixture data.
4. **Authorization leak via service-role DB access.** Mitigation: authz test matrix as merge gate (positive + negative + unauthenticated + out-of-scope tool call) for every EA-scoped route; ownership filter in shared repo layer; code review checklist.
5. **Identity drift (`user_id` mismatched with data).** Mitigation: `staff_identity_links` row created on first authenticated request; `user_id` comes directly from JWT `sub`; FK constraints to `auth.users(id)` ensure no orphans.
6. **Rate-limit race conditions.** Mitigation: dedicated `ai_usage_counters` table with unique `(user_id, day)` and `SELECT ... FOR UPDATE` wrapping the increment. Concurrent-POST test in verification.
7. **Streaming SSE through Render's proxy.** Render supports long-lived connections but documented SSE patterns should be tested early. Mitigation: smoke-test `/ea/brief` streaming on Render preview before wiring mobile. Fallback: `GET /ea/brief/latest` recovers partial content without re-billing.
8. **Auto-grouping Python → JS port accuracy.** Mitigation: keep Python reference and JS implementation side-by-side; write golden-output tests against the same input.
9. **PGRST204 column compatibility** (existing Masi gotcha) — same discipline applies: nullable new columns first, drops only after full rollout.
10. **Scale sneak-up (>5K users sooner than expected).** Mitigation: AsyncStorage + hand-rolled sync has a known ceiling; schedule a Phase 2.5 review at 2,500 active users to decide if PowerSync / SQLite migration is worth starting.
11. **Dual-truth divergence undermines stakeholder trust.** Mitigation: dual-truth policy documented up-front (see section above); EA rollout discipline (mobile replaces TeamPact the same day, no dual-entry); optional weekly reconciliation check in Phase 2.5.
12. **Phase 2 AI thin on Day 1 due to sparse Supabase history.** Mitigation: Phase 2.7 backfill decision (adapt TeamPact ETL to Supabase) OR accept ramp-up and document to stakeholders.
13. **Extended compute outage blocks AI entirely.** Acknowledged and accepted: the freshness gate will `503` AI endpoints if required compute jobs are stale >36h. Mitigation: 36h buffer = 1.5 nightly cycles; compute is framework-neutral Python so failures are debuggable locally with captured fixtures; on-call recovery path is "rerun the nightly job" which unblocks automatically. The trade (temporary unavailability vs. subtly-wrong pedagogy advice) is deliberate.

---

## Decisions locked (answers to the Codex review's open questions)

1. **Canonical staff identity key in Supabase for all AI and compute joins?** → `user_id UUID = auth.users.id`. Supplementary `staff_identity_links` table holds optional bridge IDs (`teampact_user_id`, `airtable_record_id`) + profile metadata. No column renames on EA-owned tables. No other key used for authorization or joins.
2. **Parity between website PM flags and mobile AI flags during Phases 1-2?** → **Controlled differences acceptable**, documented in Dual-Truth Policy section. Website reflects TeamPact-era truth; mobile AI reflects mobile-era truth. Differences treated as incidents only if they indicate pipeline breakage. Collapsed in Phase 3.
3. **Committing to Render cron only for production scheduling?** → **Yes.** APScheduler only for local/dev (or dropped entirely).
4. **FastAPI credentials + authorization model?** → Service-role Postgres credentials + strict service-layer authorization. Every repo function takes `user_id`; authz test matrix is a merge gate per route. RLS kept on tables as defense-in-depth for direct-mobile-client reads, but FastAPI code does not rely on RLS.
5. **Historical backfill from TeamPact/Django into Supabase at Phase 2 start?** → **Decide at Phase 2 kickoff.** Default lean: Option A (one-time TeamPact→Supabase backfill) if TeamPact has >4 weeks of useful ZZ history. Otherwise Option B (accept ramp-up, document).
6. **Incident policy if nightly compute fails?** → **Block AI with `503 ai_blocked_compute_stale` when required jobs are stale >36h.** Freshness gate (§2.4.1) enforces this. Rationale: coaching EAs from stale alignment data (recommending letters already mastered) erodes trust faster than explicit unavailability. 36h = 1.5 cycles of buffer for delayed runs. Recovery is automatic once compute succeeds.

---

## Open items to confirm during implementation

- ZZ bundle ID final value (`org.masinyusane.zz` vs a ZZ-specific domain).
- ZZ brand palette + typography — extract from Next.js Tailwind config or request fresh tokens.
- Auto-grouping Python reference — user to share file path during implementation.
- AI model choice at Phase 2 kickoff: Claude Sonnet 4.6 (tool use + prompt caching) vs OpenAI `gpt-5.4-mini` (parity with website). Recommend Claude for prompt-caching savings on the ~2,500-token system prompt.
- Rate-limit defaults: 3 briefs/day, 20 chat turns/day (matching website). Revisit after 4 weeks of Phase 2 usage data.
- Whether the mobile `/ea/snapshot` call should be cached in AsyncStorage on success (for "graceful offline" on Today tab).
- Whether a Phase 2.5 reconciliation job is needed (depends on whether PM team reports dashboard/AI divergence as confusing).

---

## Verification: end-to-end story at Phase 2 complete

1. EA opens ZZ app in the morning. Today tab top shows yesterday's cached brief if offline, or fetches fresh brief if online.
2. Fresh brief: mobile calls `POST /ea/brief` with Supabase JWT → FastAPI validates → loads snapshot from Supabase → streams LLM response → persists to `daily_briefs` → mobile renders markdown.
3. EA asks chatbot "Which letters should Group 3 do today?" → mobile streams from `/ea/chat` → LLM calls `getGroupDetail` tool → FastAPI returns real group data from Supabase → LLM composes answer → `chat_messages` rows persisted.
4. EA starts a session with the timer, logs it → offline-first write to AsyncStorage → syncs to Supabase on reconnect.
5. EA does an EGRA assessment on 3 children → auto-grouping preview appears → EA accepts → `groups` + `children_groups` persist.
6. Overnight: FastAPI cron runs `compute_group_summaries` + `compute_letter_alignment` against Supabase → `flag_summaries` updated.
7. Next morning: brief reflects updated alignment scores and flags. Loop continues.

Meanwhile, the website's nightly cron and dashboard keep running untouched against TeamPact → Django → Next.js. No user-facing website changes in Phases 1-2.
