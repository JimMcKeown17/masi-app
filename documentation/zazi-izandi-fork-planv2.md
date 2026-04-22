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
| AI backend | **FastAPI on Render** (not Supabase Edge Functions) | User's Python fluency; Python ecosystem advantage for agentic/tool-heavy work (sandboxing, MCP servers, Pydantic AI, DSPy, pandas-in-tools); no runtime CPU cap; existing Render ops muscle; shared compute code with Django (no duplication). |
| Compute strategy | **Extract core compute to framework-neutral functions**; Django management commands AND FastAPI cron both call the same core | No port, no rewrite, no logic duplication. Extract once, wrap twice. |
| Rate limiting | Postgres `SELECT ... FOR UPDATE` on counters (same pattern as existing Django `reserveBriefSlot` / `appendChatMessage`) | Atomic per-EA-per-day caps; pattern already proven. |
| AI streaming | SSE via FastAPI `StreamingResponse` + Anthropic Python SDK streaming | Trivial setup; no runtime limits. |
| JWT validation | PyJWT + JWKS fetch from `{project}.supabase.co/auth/v1/.well-known/jwks.json`, cached in-process | Standard pattern; ~20 LOC. |
| Website migration | **Deferred 6-12 months** (Phase 3) | User explicit: "This app needs to be field tested for 3-6 months first." |
| Two Supabase projects (Masi + ZZ) | Separate | Data isolation, independent RLS, independent auth config. |
| Supabase plan | **Pro** (PgBouncer pooling) for ZZ project | Even <5K users benefits from pooling once FastAPI + mobile both hit the DB. |

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
  - `sessions` — add nullable `started_at`, `ended_at`, `duration_seconds` (session timer)
  - Pre-populate `schools` with ZZ programme schools
  - `BTREE` index on `schools.name` for search filtering
- Enable email/password auth (default). No Google OAuth at launch.
- Wire `app.json → extra` with new URL + anon key.
- Create first admin user manually via Supabase dashboard.

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
- Airplane-mode test: create session + assessment offline → reconnect → both sync to new ZZ Supabase with correct RLS.
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

### 2.2 Compute extraction (from Django to shared core)

The existing `/Users/jimmckeown/Development/Zazi_iZandi_Website_2025/api/management/commands/compute_group_summaries_2026.py` (558 LOC) and `compute_letter_alignment_2026.py` (290 LOC) mix three concerns:
1. Django management command plumbing (arg parsing, transaction wrappers)
2. ORM queries (Django models)
3. Pure compute (aggregations, flag logic, math)

**Extract (3) into framework-neutral modules** in a shared location. Two options:

- **Option A (recommended):** publish the shared compute as a thin internal Python package `zz_compute` (installable from a local path or a private PyPI index). Both Django and FastAPI depend on it. Single version bumps, clear boundary.
- **Option B:** duplicate the extracted core into both repos initially, reconcile later. Faster to start; risks drift.

Go with A. Create `zz_compute/` package containing:
- `zz_compute.group_summaries.compute(session: AsyncSession, cohort_filter: CohortFilter) -> list[GroupSummary]`
- `zz_compute.letter_alignment.compute(session, cohort_filter) -> list[ChildAlignment]`
- Pure pandas/SQL. No Django imports. Accepts a DB session (SQLAlchemy or asyncpg).

Then:
- Django management command becomes a **thin wrapper** that opens a Django DB connection, adapts it to a SQLAlchemy session, calls `zz_compute.group_summaries.compute(...)`, and writes results back via Django ORM.
- FastAPI cron is the same wrapper pattern against Supabase.

This is the cleanest way to keep the website cron working while the new FastAPI service runs the same math on a different database.

### 2.3 New Supabase tables (Phase 2 migration)
```sql
-- rate-limited AI usage
CREATE TABLE daily_briefs (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  day DATE NOT NULL,
  generation_index INT NOT NULL,
  model TEXT NOT NULL,
  prompt_json JSONB,
  content TEXT,
  prompt_tokens INT,
  completion_tokens INT,
  cost_usd_cents INT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  UNIQUE(user_id, day, generation_index)
);
CREATE INDEX idx_daily_briefs_user_day ON daily_briefs(user_id, day);

CREATE TABLE chat_messages (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user','assistant')),
  content TEXT NOT NULL,
  model TEXT,
  prompt_tokens INT,
  completion_tokens INT,
  cost_usd_cents INT,
  prompt_json JSONB,
  tool_calls JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_chat_messages_user_created ON chat_messages(user_id, created_at DESC);

-- nightly compute output
CREATE TABLE flag_summaries (
  id BIGSERIAL PRIMARY KEY,
  group_id UUID REFERENCES groups(id) NOT NULL,
  computed_at TIMESTAMPTZ DEFAULT NOW(),
  -- mirror structure of Django's current GroupSummary2026 model
  current_letter TEXT,
  letters_skipped JSONB,
  letters_still_needed JSONB,
  letters_needed_next_3 JSONB,
  avg_alignment_score NUMERIC,
  alignment_band TEXT,
  active_flags JSONB,
  days_since_last_session INT,
  -- etc.
  UNIQUE(group_id, computed_at::DATE)
);
CREATE INDEX idx_flag_summaries_group ON flag_summaries(group_id, computed_at DESC);
```

RLS: EAs can SELECT `daily_briefs` / `chat_messages` where `user_id = auth.uid()`. `flag_summaries` readable by EAs for their own groups (via `staff_children` join).

### 2.4 AI endpoints (FastAPI)

Port from existing Next.js routes (`/Users/jimmckeown/Development/Zazi_iZandi_Website_2026/zazi-izandi-nextjs/app/api/ea/{brief,chat}/route.ts`, 270 LOC total) and `system-prompt.ts` (119 LOC).

**Endpoints:**
- `POST /ea/brief` — reserves a `daily_briefs` row atomically (SELECT FOR UPDATE on today's count; 429 if over cap), builds prompt, streams LLM response via SSE, persists content + token counts on finish.
- `POST /ea/chat` — appends user message (atomic rate check), streams assistant response with `getGroupDetail` tool, persists on finish. Rolling history window (last N pairs).
- `GET /ea/snapshot` — returns `EaAiSnapshot` (mirrors current Django endpoint) for debugging / mobile cache.
- `POST /ea/tools/group-detail` — per-group drill-down (called by LLM via tool use).

**Auth dependency:**
```python
# app/auth/jwt.py
async def require_ea_user(token: str = Depends(bearer_scheme)) -> EaUser:
    claims = await verify_supabase_jwt(token)   # JWKS cached 1h
    return EaUser(id=claims["sub"], email=claims["email"])
```

**Prompt composition:** port `system-prompt.ts` verbatim to a Python module `app/ai/prompts.py`. Strings are trivially portable; the structure (ROLE / PROGRAMME_RULES / FLAG_TRANSLATIONS / GUARDRAILS / MISSING_CONTEXT_GATING / SNAPSHOT) ports line-for-line.

**Model choice:** default to **Anthropic Claude** for tool use + prompt caching (system prompt is ~2,500 tokens — caching saves materially on every chat turn). Keep OpenAI as an optional fallback for parity with website. Model selection via env var, resolved per-request.

### 2.5 Nightly cron (FastAPI service)

Add a Render cron job (separate Render service, same codebase) that runs daily at ~02:30 UTC (after the existing `nightly_zz_sync_2026` Django cron finishes):

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

Nightly runner steps (mirrors `nightly_zz_sync_2026` shape, minus TeamPact sync):
1. `compute_group_summaries` — against Supabase; write `flag_summaries`
2. `compute_letter_alignment` — against Supabase; write per-child alignment data
3. Any additional computes ported from Django as needed

**What stays in Django's cron** (website-side, unchanged): TeamPact ETL, parquet backups, mentor visit sync, and the Django-side computes for the website's dashboard. Those keep running until Phase 3.

### 2.6 Mobile wiring (Today tab activation)

Remove placeholders. Add:
- **Daily Brief** section on Today tab top — renders markdown from `/ea/brief` stream. "Regenerate" button (subject to 3/day cap).
- **Chat** section — full-screen modal or in-tab. `useChat`-style streaming UI. Persists via API (server-side, not AsyncStorage).
- **Offline handling:**
  - Brief: if offline, show last cached brief (stored in AsyncStorage on successful fetch). "You're offline — showing yesterday's plan."
  - Chat: disabled offline with clear messaging. Chat requires live LLM.
- Rate-limit errors (429) render with current/cap count.

**New mobile env var:** `EXPO_PUBLIC_API_BASE_URL` → FastAPI base URL. Same `app.json → extra` fallback pattern.

### 2.7 Phase 2 verification
- FastAPI deployed on Render; `/health` reachable.
- JWT validation: valid Supabase token → 200; invalid/expired → 401; missing → 401. JWKS cache refreshes on 1-hour TTL and on key rotation.
- `compute_group_summaries` FastAPI cron runs against Supabase, writes `flag_summaries`. Row counts match expectations.
- Rate limit: 4th brief attempt in a day → 429 with `cap=3, current=3`.
- `/ea/brief`: streams SSE, `daily_briefs` row ends with `content`, `prompt_tokens`, `completion_tokens`, `cost_usd_cents` populated.
- `/ea/chat`: streams SSE, `getGroupDetail` tool fires and returns real group data from Supabase, user + assistant `chat_messages` rows persist.
- Rolling history: 7th user message → older-than-N-pairs trimmed before model call.
- Mobile Today tab: brief renders markdown; chat streams; offline shows cached brief; 429 surfaces current/cap.
- Shared `zz_compute` package: running Django management command locally still works against Django DB (no regression for website cron).

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
3. **`zz_compute` drift between Django and FastAPI.** Mitigation: shared package, versioned; CI runs compute tests against fixture data in both contexts.
4. **Streaming SSE through Render's proxy.** Render supports long-lived connections but documented SSE patterns should be tested early. Mitigation: smoke-test `/ea/brief` streaming on Render preview before wiring mobile.
5. **Auto-grouping Python → JS port accuracy.** Mitigation: keep Python reference and JS implementation side-by-side; write golden-output tests against the same input.
6. **PGRST204 column compatibility** (existing Masi gotcha) — same discipline applies: nullable new columns first, drops only after full rollout.
7. **Scale sneak-up (>5K users sooner than expected).** Mitigation: AsyncStorage + hand-rolled sync has a known ceiling; schedule a Phase 2.5 review at 2,500 active users to decide if PowerSync / SQLite migration is worth starting.

---

## Open items to confirm during implementation

- ZZ bundle ID final value (`org.masinyusane.zz` vs a ZZ-specific domain).
- ZZ brand palette + typography — extract from Next.js Tailwind config or request fresh tokens.
- Auto-grouping Python reference — user to share file path during implementation.
- AI model choice at Phase 2 kickoff: Claude Sonnet 4.6 (tool use + prompt caching) vs OpenAI `gpt-5.4-mini` (parity with website). Recommend Claude for prompt-caching savings on the ~2,500-token system prompt.
- Rate-limit defaults: 3 briefs/day, 20 chat turns/day (matching website). Revisit after 4 weeks of Phase 2 usage data.
- Whether the mobile `/ea/snapshot` call should be cached in AsyncStorage on success (for "graceful offline" on Today tab).

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
