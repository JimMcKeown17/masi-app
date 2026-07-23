# National Scale Readiness: 250,000 Users

**Assessment date:** 2026-07-15
**Status:** Dated architecture and scale-readiness assessment, not a current progress ledger
**Scope:** Masi React Native app, offline-first SQLite client, and Supabase backend

> **Status update, 2026-07-23:** preserve the cost model, POPIA analysis, target architecture,
> staffing model, staged-scale recommendations, and government wording. Several pilot findings below
> have since closed: the reconcile acknowledgment RPC is deployed and live-probed; Sentry capture was
> privacy-hardened; the unsafe generic loader was disabled and replaced by a narrow exact-project
> pilot provisioner; and several device gates passed. Every still-open implementation and operations
> item from this assessment is consolidated in [`ROADMAP.md`](./ROADMAP.md) section 9. Do not use the
> dated "next two weeks" checklist below as current status.

## Executive summary

Yes, this can be realistic. Supabase itself is not the reason to panic.

But there are four very different claims hiding inside "250,000 users":

| Government means | Assessment |
|---|---|
| 250,000 learners represented in the database | Very realistic. This may correspond to only 6,000 to 21,000 authenticated EAs, depending on caseload. |
| 250,000 registered staff accounts, with perhaps 25,000 to 75,000 active daily | Technically realistic, but requires serious preparation, a larger team, load testing, operational maturity, and staged rollout. |
| 250,000 staff active every day | Possible, but this becomes a national-scale platform programme. It is no longer "make the current app a little bigger." |
| 250,000 simultaneously connected or syncing | Not something to promise on the current architecture. That would require a much more substantial distributed-systems design. |

The most important next question for government is:

> Do they mean 250,000 authenticated people using the app, or 250,000 learners managed through the app?

That distinction changes the workload by at least an order of magnitude.

### Blunt verdict

- Going from 50 to 300 field users in two weeks is realistic.
- Supporting 250,000 learner records within six months is realistic.
- Supporting 250,000 monthly active EAs or teachers within six months is possible but very aggressive.
- Do not promise a single-date national launch.
- Promise a staged scale-readiness programme with measurable gates.
- There is no current reason to abandon Supabase.
- A real engineering and operations team is required.
- The biggest risks are sync storms, privacy and security, account provisioning, field support, and operational blindness. Raw Supabase hosting cost is probably not the biggest problem.

The useful mental model is:

> Average traffic is rarely what kills a system. Correlated traffic, retry storms, full-data refreshes, and operational mistakes kill it.

A school-day application is particularly prone to correlated traffic. Thousands of people open it around the same time, reconnect after the same network outage, submit at the end of the same session period, and retry after the same backend incident.

## What is already good in this architecture

The current design is much better suited to scale than a basic always-online mobile app.

### 1. Field work is local-first

The user-facing write is saved to SQLite first, and the domain record plus durable outbox entry are written transactionally. That means a Supabase outage should not prevent an EA from recording work. This is the right architecture for unreliable school connectivity.

At national scale, the ability to keep working during an outage is more important than keeping every screen perfectly current.

### 2. Synchronization is already bounded and ordered

The current sync engine:

- partitions outbox work by authenticated owner;
- preserves dependency order;
- batches supported tables up to 100 rows;
- caps failed-batch diagnostic fallback at 25 rows per pass;
- caps fallback concurrency at five requests;
- quarantines repeated deterministic errors;
- checks for authentication changes during a pass.

Those are strong foundations. See [offlineSync.js](../src/services/offlineSync.js#L290) and the owner-scoped selection at [offlineSync.js](../src/services/offlineSync.js#L1382).

### 3. Each device serializes Supabase operations

The client currently uses a concurrency-one request queue, visible in [supabaseRequestQueue.js](../src/services/supabaseRequestQueue.js#L1). That protects an individual low-end phone from competing network operations and reduces client-side race conditions.

It does not protect the server when 25,000 devices all enter that queue simultaneously, but it is still a good device-level invariant.

### 4. Reads are scoped to each EA

An EA generally pulls only their programme, assignments, children, classes, groups, and memberships. The national dataset is not downloaded to every phone.

That is extremely important. A database containing ten million children can still be fast if every mobile query touches only 12 to 60 indexed rows.

### 5. RLS is treated as an actual security contract

The schema has explicit row-level security, user-scoped assignments, normalized relationships, and an authoritative reconcile RPC. This is materially better than relying on the client to filter records.

### 6. Supabase can scale vertically and add read replicas

Supabase currently offers compute from 1 GB through 256 GB RAM and up to 64 cores on listed plans, with larger custom sizes available. Read replicas can offload reporting and other read-heavy work, although they are asynchronous and cannot handle writes. [Supabase compute pricing](https://supabase.com/pricing) lists the available sizes, while the [read-replica documentation](https://supabase.com/docs/guides/platform/read-replicas) explains that replicas are read-only and may lag behind the primary.

There is no architectural reason to rewrite everything into Kubernetes or a collection of microservices right now.

## Why the app is not yet ready for 250,000

The current live backlog is unusually honest, which is good. It also makes clear that national-scale readiness has not been demonstrated.

### 1. Sixty-one physical-device gates are still unexecuted

The standing backlog says that 61 real-device gates remain and none has been executed. The highest-risk gates cover force-quit recovery, account handover, low-end Android performance, and GPS timeout behavior. See [ROADMAP.md](ROADMAP.md#L61).

Automated tests are strong evidence, but they do not simulate:

- multiple native SQLite connections;
- low-memory Android process death;
- real GPS behavior;
- app-store upgrade behavior;
- long offline periods;
- battery restrictions;
- broken school Wi-Fi;
- a phone handed from one EA to another.

Before 300 users, this is the highest-return work available.

### 2. The fleet can synchronize its retries

The retry schedule is deterministic: five seconds, then fifteen, then forty-five, eventually capped at fifteen minutes. There is no randomized jitter in the delay calculation at [offlineSync.js](../src/services/offlineSync.js#L413).

At 50 users that is mostly harmless.

At 250,000 users, if 10,000 requests fail at the same moment, those devices can retry at the same five-second mark, then the same fifteen-second mark, then the same forty-five-second mark. That is a classic thundering-herd failure.

The fix is full-jitter exponential backoff plus randomized reconnect scheduling. Instead of every device retrying at exactly fifteen minutes, each might retry randomly within an authorized interval, subject to a sensible lower bound.

### 3. Foreground and reconnect pulls are full-scope, not delta-based

The app considers domain data stale after fifteen minutes and can request a full user-scoped pull on foreground or reconnect. See [OfflineContext.js](../src/context/OfflineContext.js#L11) and [OfflineContext.js](../src/context/OfflineContext.js#L224).

The child-data pull performs roughly eight or more server operations, including the reconcile RPC, programme assignment, child assignments, children, memberships, classes, groups, and group memberships. See [preloadedChildData.js](../src/services/preloadedChildData.js#L216).

If 10% of 250,000 devices reconnect after a regional mobile-network interruption, 25,000 devices could collectively produce more than 200,000 API operations over a short period.

The fact that each device serializes its requests helps the phone, but the fleet is still synchronized.

The backlog already correctly says delta-pull indexes should be designed alongside the actual delta queries, rather than adding speculative updated-at indexes everywhere. See [ROADMAP.md](ROADMAP.md#L207).

Versioned delta pulls, randomized scheduling, and a server-configurable minimum pull interval should be mandatory before tens of thousands of daily-active users.

### 4. Some pull scopes hard-stop at 1,000 rows

The client marks a scope incomplete when it reaches the PostgREST limit of 1,000 rows. See [preloadedChildData.js](../src/services/preloadedChildData.js#L4).

This is currently a sensible fail-closed safety mechanism. A normal EA should not have 1,000 active children or groups.

Before national rollout, there should be explicit product-enforced maximums and pagination for legitimate larger scopes. Otherwise an anomalous Head Office assignment can make one EA's data stop reconciling.

### 5. The server-authoritative reconcile change is not yet live-verified

The migration and client code exist, but the standing backlog says the migration still needs to be applied to the current SQLite backend and the live RLS probe must pass. See [ROADMAP.md](ROADMAP.md#L246).

That is a national-scale data-integrity gate, not a cosmetic cleanup.

### 6. Sentry's planned configuration is too permissive for children's data

The current Sentry configuration enables:

- default PII;
- screenshots;
- view hierarchy attachments;
- unmasked text;
- unmasked images;
- unmasked vectors;
- error-session replays.

See [observability.js](../src/services/observability.js#L73).

If an error occurs while a child roster, assessment result, school, or email is visible, that information may be copied to a third-party telemetry system.

The Information Regulator's guidance says children's personal information requires appropriate safeguards, regular verification, and continual updating of those safeguards. See the [official Information Regulator guidance](https://www.inforegulator.org.za/wp-content/uploads/2020/07/GuidanceNote-Processing-PersonalInformation-Children-20210628-1.pdf).

Before activating Sentry:

- disable default PII;
- mask all text and images by default;
- disable screenshots and view hierarchy until specifically justified;
- add before-send scrubbing;
- hash or pseudonymize user identifiers;
- never send child IDs, names, assessment responses, schools, coordinates, tokens, or outbox payloads;
- complete a DPA and data-location review with Sentry;
- document retention and deletion;
- test actual captured events in a dedicated privacy QA environment.

The current approach should change from "activate Sentry" to "activate privacy-safe observability."

### 7. Current account provisioning is pilot tooling, not national tooling

The bulk-user script currently:

- defaults every new account to the same test password;
- prints the password to stdout;
- creates accounts sequentially;
- searches all Auth users page by page when a duplicate is encountered;
- creates a profile after creating the Auth user, leaving a partial-failure boundary between those operations.

See [loadTestUsers.js](../scripts/loadTestUsers.js#L58) and [loadTestUsers.js](../scripts/loadTestUsers.js#L215).

For 300 carefully controlled testers, the script is salvageable with unique credentials and operator discipline.

For 250,000 people, this must become an audited provisioning service or government identity integration with:

- unique one-time activation;
- no shared default password;
- resumable and idempotent imports;
- explicit per-row status;
- rate-limited concurrency;
- retry with jitter;
- account deactivation and staff-transfer workflows;
- duplicate identity resolution;
- audit logs;
- support-agent tooling;
- reconciliation between Auth and public user profiles;
- possibly government SSO, OIDC, or SAML.

Supabase's built-in email service is deliberately low-capacity. Its production checklist says the hosted email limit is two emails per hour unless custom SMTP is configured, and custom SMTP has its own configurable limits. See the [Supabase production checklist](https://supabase.com/docs/guides/deployment/going-into-prod).

Custom SMTP is required before 300 users if password resets or invitations will be used.

### 8. Write amplification can become enormous

The app models sessions relationally, which is correct, but one human action can create many rows.

The current EGRA path can save:

- one assessments row;
- one summary assessment-item row;
- up to sixty item rows;
- corresponding outbox entries.

See [assessmentsRepository.js](../src/db/repositories/assessmentsRepository.js#L215).

#### If government means 250,000 learners

Three 61-row assessments per learner per year would produce approximately:

    250,000 learners
    x 3 assessments
    x 61 item rows
    = 45,750,000 assessment-item rows/year

That is substantial but within normal serious-Postgres territory with proper indexing, retention, monitoring, and possibly partitioning.

#### If government means 250,000 EAs

The domain says a Core Literacy EA may work with approximately 12 children and record three to five sessions per day. See [CONTEXT.md](../CONTEXT.md#L27).

At the low end:

    250,000 EAs x 12 learners = 3,000,000 learners
    3,000,000 learners x 3 assessments x 61 items
    = 549,000,000 assessment-item rows/year

Daily delivery could produce:

    250,000 EAs x 3 to 5 sessions
    = 750,000 to 1,250,000 session rows/day

Then add attendee rows, assessments, time entries, memberships, indexes, WAL, backups, and reporting.

That workload can still be engineered, but it crosses into partitioning, retention, analytics isolation, and deliberate capacity planning. Supabase's Postgres guidance recommends considering partitioning when append-heavy tables reach roughly 100 million rows.

### 9. A single primary remains the write bottleneck

Read replicas can offload Head Office dashboards, reports, and analytical queries. They do not accept inserts, updates, or deletes. See the [Supabase read-replica documentation](https://supabase.com/docs/guides/platform/read-replicas).

The mobile write workload therefore converges on one primary Postgres instance.

This is not automatically a problem. PostgreSQL on suitable hardware can process a very large number of well-indexed batched writes. The danger is synchronized peaks and expensive RLS policy execution, not annual row count alone.

Measure:

- writes per second at the primary;
- API requests per second;
- query latency p50, p95, and p99;
- CPU;
- memory;
- active connections;
- disk IOPS;
- WAL generation;
- dead tuples and autovacuum lag;
- lock waits;
- PostgREST response sizes;
- RLS policy query plans;
- sync backlog age;
- terminal and retrying outbox counts;
- reconciliation duration;
- per-device data transfer.

Supabase exposes database, Auth, API, connection, CPU, memory, and IOPS reports, and its Metrics API exposes roughly 200 Prometheus-compatible series. See [Supabase reports](https://supabase.com/docs/guides/telemetry/reports) and the [Supabase Metrics API](https://supabase.com/docs/guides/telemetry/metrics).

### 10. Reporting must not share the mobile write path indefinitely

Government will want national dashboards, district comparisons, exports, school reports, monitoring, and ad hoc queries. Those queries can be far more expensive than the mobile application.

Do not allow a large dashboard query to compete directly with 50,000 devices uploading sessions.

The eventual design should be:

    Mobile devices
        |
        | user-scoped RLS reads and batched writes
        v
    Supabase primary Postgres
        |
        +--> read replica for operational Head Office reads
        |
        +--> ETL/replication to analytics warehouse
             for national dashboards and longitudinal analysis

The primary should remain optimized for current operational state and synchronization. Historical analytics should move to a read replica or warehouse such as BigQuery, Snowflake, Redshift, ClickHouse, or a separately managed Postgres analytical store.

## Supabase cost

These are current public list prices as checked on 2026-07-15. Enterprise pricing remains custom.

### Base Supabase pricing

- Pro: $25/month.
- Team: $599/month.
- Enterprise: custom.
- Pro and Team include 100,000 monthly active users.
- Additional MAU: $0.00325 each.
- Database disk: 8 GB included, then $0.125/GB.
- Uncached egress: 250 GB included, then $0.09/GB.
- Team includes SOC 2 and ISO 27001 availability, project-scoped access, platform audit logs, longer log retention, and priority support.
- Enterprise adds contractual uptime SLA options, 24/7 support, a designated support manager, security questionnaires, and BYO Cloud options.

See [Supabase pricing](https://supabase.com/pricing).

Supabase counts a user once in a billing cycle if they sign in or refresh a token. Multiple sign-ins do not multiply the MAU charge. See the [Supabase MAU documentation](https://supabase.com/docs/guides/platform/manage-your-usage/monthly-active-users).

At 250,000 Supabase Auth MAU:

    100,000 included
    150,000 overage x $0.00325
    = $487.50/month MAU overage

That is surprisingly inexpensive.

### Compute

Current monthly list prices are approximately:

| Size | CPU | RAM | Monthly |
|---|---:|---:|---:|
| Large | 2 cores | 8 GB | $110 |
| XL | 4 cores | 16 GB | $210 |
| 2XL | 8 cores | 32 GB | $410 |
| 4XL | 16 cores | 64 GB | $960 |
| 8XL | 32 cores | 128 GB | $1,870 |
| 16XL | 64 cores | 256 GB | $3,730 |

The correct size cannot be inferred from user count. It must be selected from load-test measurements.

### Recovery and replicas

Point-in-time recovery currently costs approximately:

- seven days: $100/month;
- fourteen days: $200/month;
- twenty-eight days: $400/month.

PITR matters because daily backups can lose up to a day of server-side data. See the [Supabase backup and PITR documentation](https://supabase.com/docs/guides/platform/backups).

A read replica inherits the primary's compute size, so an 8XL primary plus an 8XL replica means roughly two 8XL compute charges.

### Illustrative Supabase-only totals

These are examples, not forecasts.

A Team plan with:

- 250,000 MAU;
- one 2XL primary;
- one 2XL replica;
- seven-day PITR;

would have a base around:

    Team                         $599.00
    MAU overage                  $487.50
    2XL primary                  $410.00
    2XL replica                  $410.00
    7-day PITR                   $100.00
    Compute credit               -$10.00
                                 --------
    Approximately              $1,996.50/month

That excludes egress, extra disk, IOPS, logs, Sentry, SMTP, analytics, and Enterprise support.

A heavier 8XL primary plus 8XL replica and twenty-eight-day PITR would be approximately $5,216.50/month before those extras.

Even a much larger configuration may still be cheaper than one senior engineer.

### SSO can cost more than ordinary Auth

If government requires SAML SSO, current list pricing includes fifty SSO MAUs and charges approximately $0.015 per additional SSO MAU.

For 250,000 SSO-active users, that would be roughly:

    249,950 x $0.015 = $3,749.25/month

At that size, negotiate Enterprise pricing rather than accepting public list pricing.

### Other costs requiring budget lines

The complete budget should include:

- Supabase Team or Enterprise plan;
- primary database compute;
- read replicas;
- PITR;
- high-performance disk and IOPS;
- egress;
- log drains;
- Sentry or another crash/performance platform;
- custom SMTP and email delivery;
- analytical warehouse and ETL;
- load-testing infrastructure;
- security penetration testing;
- privacy counsel, POPIA assessment, contracts, and DPA review;
- device lab with representative low-end Android phones;
- staging, production, and disaster-recovery environments;
- support/help-desk software;
- field training and training materials;
- government data migration and cleaning;
- account provisioning and staff-turnover operations;
- mobile data costs, if Masi or government subsidizes connectivity;
- cyber insurance;
- incident-response retainers;
- salaries and on-call compensation.

People and rollout operations will almost certainly cost more than Supabase.

## POPIA and government requirements

This should become a first-class workstream immediately.

The system stores children's names, schools, programme participation, assessments, attendance, and possibly location-linked staff activity. That is not ordinary anonymous product telemetry.

At minimum, establish:

- who is the POPIA responsible party;
- whether Masi, government, or both determine processing purposes;
- who is the operator;
- the lawful basis for processing children's information;
- whether Information Regulator authorization is required;
- retention and deletion policies;
- data-subject access and correction processes;
- breach-notification procedures;
- role-based access for Masi and government staff;
- auditability of Head Office changes;
- encryption and key-management expectations;
- subprocessor review;
- data residency;
- cross-border transfer basis;
- incident ownership.

POPIA section 72 restricts transferring personal information outside South Africa unless the receiving arrangement meets specified protections or another permitted basis applies. See the [official POPIA text](https://www.justice.gov.za/legislation/acts/2013-004.pdf).

Supabase says project data remains in the chosen project region and that selecting the correct region is the customer's responsibility. See [Supabase SOC 2 and residency guidance](https://supabase.com/docs/guides/security/soc-2-compliance). A Supabase project is infrastructure-bound to its region, and moving regions requires creating and migrating to a new project. See [Supabase region migration guidance](https://supabase.com/docs/guides/troubleshooting/change-project-region-eWJo5Z).

Verify the current project region now. Do not discover after onboarding 100,000 people that government requires a different geography.

This is not legal advice. A South African privacy professional or information officer should be part of the programme.

## Team recommendation

A national platform does not require a giant engineering department, but one or two people cannot responsibly operate a child-data platform for 250,000 active field users.

Recommended minimum core:

| Role | Approximate need | Responsibility |
|---|---:|---|
| Technical lead/platform architect | 1 | Architecture, prioritization, capacity plan, incident ownership |
| React Native/offline engineers | 2 | Sync behavior, low-end device reliability, releases, upgrades |
| Backend/Postgres engineers | 2 | Schema, RLS, query performance, batching, migrations, load testing |
| SRE/platform engineer | 1 | Metrics, alerts, backups, restore drills, load tests, incident response |
| QA/release engineer | 1 | Device lab, regression automation, staged releases, upgrade matrices |
| Security/privacy specialist | 0.5 to 1 | Threat model, POPIA, telemetry review, pen-test remediation |
| Product/implementation lead | 1 | Government requirements, rollout cohorts, training and support workflow |

That is approximately seven to nine core technical/product people. Some can initially be contractors, but the system needs clear permanent ownership by national rollout.

Separately, field implementation and support are required. At 250,000 daily active users:

- a 0.1% daily support-contact rate means 250 contacts/day;
- a 1% rate means 2,500 contacts/day.

A layered support model is needed:

    EA or teacher
        -> district/school champion
        -> government or Masi help desk
        -> technical support
        -> engineering on-call

Engineering should not be the first-line password-reset department.

A real on-call rotation is required before national launch. One engineer being permanently reachable is not an on-call system.

## The next two weeks for the 300-user pilot

Treat 300 as a controlled scale-validation cohort.

### Must complete before or during that rollout

1. Execute the highest-risk physical-device gates, especially force-quit, offline/reconnect, account handover, low-end Android performance, and GPS timeout.

2. Apply and verify the outstanding reconcile migration against the correct Supabase project.

3. Replace shared default passwords with unique one-time credentials or a safer activation mechanism.

4. Configure custom SMTP and test password reset end to end.

5. Activate privacy-safe Sentry, with masking and PII scrubbing.

6. Enable PITR and conduct an actual restore rehearsal. A backup that has never been restored is an untested hypothesis.

7. Confirm:

   - current Supabase plan;
   - compute size;
   - project region;
   - database size;
   - current CPU and memory;
   - peak API requests;
   - current Auth MAU;
   - RLS and performance advisor findings;
   - disk IOPS;
   - backup status;
   - spend-cap behavior.

8. Establish a daily pilot dashboard containing:

   - active users;
   - successful sessions recorded;
   - sync success rate;
   - records waiting over one hour;
   - terminal outbox rows;
   - p95 sync duration;
   - crash-free sessions;
   - startup failure rate;
   - password-reset requests;
   - support contacts by category;
   - database CPU, memory, connections, and IOPS.

9. Roll out 50 to 100 to 200 to 300, not 50 directly to 300 on one morning.

10. Write a one-page incident runbook:

   - who declares an incident;
   - who contacts Supabase;
   - who pauses rollout;
   - how to disable or roll back an OTA update;
   - what users are told;
   - how to export device logs;
   - how to inspect failed outbox rows;
   - when to restore;
   - who owns POPIA breach reporting.

Supabase asks Team or Enterprise customers to give at least two weeks' notice before heavy load tests or major high-load launches. See the [Supabase production checklist](https://supabase.com/docs/guides/deployment/going-into-prod). Contact Supabase now.

## Six-month roadmap

### Month 1: define and observe

- Resolve whether 250,000 means people, learners, MAU, DAU, or concurrency.
- Establish SLOs such as 99.9% API availability and 99% of locally saved work reaching the server within a defined interval after connectivity returns.
- Define RTO and RPO.
- Complete physical-device gates.
- Make observability privacy-safe.
- Configure PITR, restore drills, custom SMTP, staging and production separation.
- Engage Supabase Enterprise.
- Capture real 300-user traffic and payload measurements.

### Month 2: remove fleet-amplification risks

- Add full-jitter retry backoff.
- Add randomized reconnect and foreground-pull delays.
- Add remote-configured pull intervals and a sync kill switch.
- Implement delta pulls with watermarks or change versions.
- Paginate legitimate large scopes.
- Finish batching and collision contracts for remaining membership tables.
- Add server-side limits for abnormal roster size.
- Build an audited account-provisioning pipeline.

### Month 3: capacity and data lifecycle

- Model rows and bytes per EA per school day.
- Load-test real RLS policies and realistic payloads.
- Test synchronized reconnect storms, not only steady traffic.
- Use pg-stat-statements to identify expensive RLS and pull queries.
- Add only proven indexes.
- Decide when append-heavy tables will be partitioned.
- Establish retention, archival, and data deletion.
- Isolate analytics from the primary.
- Add a read replica or warehouse pipeline.

### Month 4: security and failure engineering

- Independent penetration test.
- POPIA/DPIA and government security review.
- Backup restore drill.
- Regional-outage and Supabase-outage tabletop exercise.
- Key and secret rotation rehearsal.
- Test expired sessions, password-reset spikes, and account handovers.
- Test upgrades from multiple app versions.
- Close the still-open OTA rollback schema guard in [ROADMAP.md](ROADMAP.md#L127).

### Month 5: staged scale

Roll out in measurable cohorts such as:

    300
    1,000
    5,000
    15,000
    50,000
    100,000

Each cohort advances only when:

- sync success remains above target;
- terminal failures remain below target;
- p95 latency is stable;
- primary CPU and IOPS retain headroom;
- no privacy or data-integrity incident is open;
- support volume remains manageable;
- restore and rollback paths remain available.

### Month 6: national readiness, not blind national launch

- Run a production-sized load test with Supabase support watching.
- Validate peak school-start and school-end synchronization.
- Confirm staffing and on-call coverage.
- Confirm contractual SLA and escalation.
- Confirm government help-desk readiness.
- Increase by region or district.
- Retain the ability to stop at any cohort without harming existing users.

## Target architecture

Keep Supabase. Add the missing operational layers:

    React Native app
      - SQLite local source of truth
      - durable outbox
      - delta pull
      - jittered retries
      - remote kill switches
              |
              v
    Supabase Data API + Auth
              |
              v
    Primary Postgres
      - normalized operational data
      - RLS
      - short transactional writes
      - partitioned high-volume history when justified
              |
              +--> Read replica for Head Office operations
              |
              +--> Analytics/warehouse pipeline
              |
              +--> Thin control-plane service
                   - account provisioning
                   - bulk imports
                   - district administration
                   - audit-sensitive operations
                   - jobs and notifications

The thin control plane is important. It does not replace the direct, RLS-protected mobile sync path. It handles operations that should not be distributed across 250,000 untrusted clients, such as provisioning, bulk assignment, imports, government integration, privileged administration, and rate-limited jobs.

## Suggested wording for government

Do not say:

> Yes, it supports 250,000 users.

Say:

> The platform's offline-first architecture and managed Postgres backend are suitable for national scale. We are currently validating it with 300 field users. Scaling to 250,000 is feasible, subject to confirming whether that number means authenticated staff or managed learners, and subject to staged capacity, security, privacy, device, and operational gates. We propose a six-month scale-readiness programme with district-by-district rollout rather than a single national cutover.

That is confident, technically defensible, and does not create a reckless promise.

## Verification scope and limitations

This assessment inspected the checkout on branch perf/sync-query-indexes. That may not be the exact binary installed on all current field devices.

The repository's safe, read-only Supabase advisor command was attempted against project segygjzpujphwvrubusm. It correctly identified the SQLite target, but the Supabase CLI rejected documentation-style lines in .env.local as malformed environment variables. Therefore, this assessment did not verify the current live project's:

- plan;
- region;
- compute size;
- usage;
- advisor findings;
- database size;
- applied migration set;
- query latency.

Those are the first measurements to collect before producing a formal 250,000-user capacity commitment.

The architecture is not impossible. This is the point where a successful field application has to become an operated platform. That is a known engineering transition, and the foundations here are much better than average.
