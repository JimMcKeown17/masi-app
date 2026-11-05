repro-client-lifecycle-edges (masi-app main @ 8b79eae5) — throwaway, never committed.

Files
- reproLifecycleEdges.integration.test.js      jest, real better-sqlite3 + real repositories + real outbox engine
                                                + real pullPreloadedChildData/persistPreloadedChildData/pullClassData;
                                                only the Supabase transport is a stateful fake with modelled RLS.
- reproLifecycleEdgesE2Context.integration.test.js  E2 through the real ChildrenContext pull (copy of
                                                ChildrenContextPendingDelete; pending vs terminal hard_delete).
- repro-lifecycle-pg-harness.cjs               real PostgreSQL 17, all 41 canonical migrations; proves the server
                                                answers the fake gives (rows affected / SQLSTATE).
- observations.jsonl                            one JSON line per recorded step (jest output, machine-readable)
- jest-run-main.txt, jest-run-e2ctx.txt         raw jest output
- pg-run.txt, pg-results.json                   raw PG harness output (14/14 matched)

Rerun (jest): copy both test files into <masi-app>/__tests__/, then from the repo root:
  REPRO_OUT=$PWD/obs.jsonl PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH \
    npx jest -c jest.integration.config.js --testMatch '<rootDir>/__tests__/reproLifecycleEdges.integration.test.js'
  (same with reproLifecycleEdgesE2Context.integration.test.js). Delete the files afterwards.

Rerun (PG):
  docker run -d --name <unique> -e POSTGRES_PASSWORD=postgres -p 127.0.0.1:0:5432 postgres:17-alpine
  docker port <unique> 5432            # -> 127.0.0.1:<port>
  HISTORY_RLS_ADMIN_DATABASE_URL=postgres://postgres:<password>@127.0.0.1:<port>/postgres \
  HISTORY_RLS_DATABASE_NAME=masi_history_rls_lifecycle_edges \
  HISTORY_RLS_DISPOSABLE_CONFIRM=I_UNDERSTAND_THIS_IS_DISPOSABLE \
  REPRO_MIGRATIONS_DIR=<masi-app>/supabase/migrations \
  node repro-lifecycle-pg-harness.cjs
  docker rm -f <unique>
