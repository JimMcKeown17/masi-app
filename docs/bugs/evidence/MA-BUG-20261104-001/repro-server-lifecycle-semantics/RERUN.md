# repro-server-lifecycle-semantics — rerun

Disposable PostgreSQL 17 only. Never points at hosted Supabase; no dotenv, no Supabase CLI.

    docker run -d --name masi-repro-lifecycle-pg -e POSTGRES_PASSWORD=postgres -p 127.0.0.1:0:5432 postgres:17-alpine
    PORT=$(docker port masi-repro-lifecycle-pg 5432 | cut -d: -f2)
    cd /private/tmp/claude-501/-Users-jimmckeown-Development-masi-app/a4d0c187-1c32-4451-9054-fbfd3426b9d3/scratchpad/repro/repro-server-lifecycle-semantics
    PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH \
    HISTORY_RLS_ADMIN_DATABASE_URL=postgres://postgres:<password>@127.0.0.1:$PORT/postgres \
    HISTORY_RLS_DATABASE_NAME=masi_history_rls_lifecycle_repro \
    HISTORY_RLS_DISPOSABLE_CONFIRM=I_UNDERSTAND_THIS_IS_DISPOSABLE \
    node lifecycle-harness.cjs > console-output.txt
    docker rm -f masi-repro-lifecycle-pg

Files: lifecycle-harness.cjs (scenarios L1-L7), load-db.cjs (bootstrap + all 41 migrations via Masi's
scripts/history-authorization-postgres-harness.cjs), fixture.sql (helpers + base fixture), sql/<case>.sql
(each case, BEGIN..ROLLBACK), results.json (structured per-step results), raw-output.log (psql stdout per case),
console-output.txt (summary).
