# repro-client-archive-chain: how to rerun

Run from a masi-app checkout at 8b79eae5 (or a worktree of it). Nothing here is committed.

1. Copy the test into the checkout and generate the C5 probe engine:
   cp reproClientArchiveChain.test.js <checkout>/__tests__/
   node make-c5-probe.cjs <checkout>
2. Run (Node 20 for better-sqlite3):
   PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest -c jest.integration.config.js \
     --testMatch '<rootDir>/__tests__/reproClientArchiveChain.test.js' --runInBand --verbose
   Writes observations.json and wire-*.json into this folder (override with REPRO_REPORT_DIR).
3. Replay the recorded wire requests against real PostgreSQL with every canonical migration:
   docker run -d --name repro-client-archive-chain-pg -e POSTGRES_PASSWORD=postgres -p 127.0.0.1:0:5432 postgres:17-alpine
   PORT=$(docker port repro-client-archive-chain-pg 5432 | cut -d: -f2)
   HISTORY_RLS_ADMIN_DATABASE_URL=postgres://postgres:<password>@127.0.0.1:$PORT/postgres \
   HISTORY_RLS_DATABASE_NAME=masi_history_rls_archive_chain \
   HISTORY_RLS_DISPOSABLE_CONFIRM=I_UNDERSTAND_THIS_IS_DISPOSABLE MASI_REPO=<checkout> \
     node pg-replay.cjs wire-C1.json wire-C2.json wire-C3a.json wire-C3b.json wire-C3c.json wire-C5b.json
   (NO_RETURNING=1 replays upserts without RETURNING, ruling out SELECT-policy refusals.)
   docker rm -f repro-client-archive-chain-pg
4. Clean up: rm <checkout>/__tests__/reproClientArchiveChain.test.js; node make-c5-probe.cjs <checkout> --remove
