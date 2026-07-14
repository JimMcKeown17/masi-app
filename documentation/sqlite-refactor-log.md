# SQLite Refactor Log — MOVED

> ## This log was merged into [`documentation/build-log.md`](./build-log.md) on 2026-07-13.
>
> **Nothing was lost.** Every register moved across intact, in order:
>
> | What you are looking for | Where it is now |
> |---|---|
> | Verification Register (dated commands, results, gate counts, device checks) | `build-log.md` section 1 — and that is now **the live append target** |
> | Decision Register (decision, rationale, revisit trigger) | `build-log.md` section 2 |
> | Bug and Gap Register | `build-log.md` section 3 |
> | Current Phase Checklist, Plan 5 caller enumeration | `build-log.md` section 5 (Archive) |
>
> **Why:** two logs were competing for the same job. This file held the real history while
> `build-log.md` claimed to be the master and had gone stale, so agents wrote to one and readers
> looked in the other. One log, one name that is easy to remember.
>
> **If you are an agent:** append new work to `documentation/build-log.md`, not here. This file is
> kept only so that the ~40 dated plans, specs, and reviews that cite it by name still resolve.
> Those are historical records and are not rewritten (see the anti-drift rule in `AGENTS.md`).
