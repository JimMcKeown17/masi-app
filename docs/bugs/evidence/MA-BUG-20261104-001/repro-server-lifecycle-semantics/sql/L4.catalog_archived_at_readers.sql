BEGIN;
SELECT harness.q('functions referencing archived_at or hidden_at', $dml$
    SELECT n.nspname || '.' || p.proname AS fn,
      pg_catalog.pg_get_functiondef(p.oid) ILIKE '%archived_at%' AS reads_archived_at,
      pg_catalog.pg_get_functiondef(p.oid) ILIKE '%hidden_at%' AS reads_hidden_at
    FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname IN ('public', 'private') AND p.prokind = 'f'
      AND (pg_catalog.pg_get_functiondef(p.oid) ILIKE '%archived_at%' OR pg_catalog.pg_get_functiondef(p.oid) ILIKE '%hidden_at%')
    ORDER BY 1$dml$);
SELECT harness.q('policies referencing archived_at or hidden_at', $dml$
    SELECT tablename, policyname, cmd FROM pg_catalog.pg_policies
    WHERE COALESCE(qual, '') || COALESCE(with_check, '') ILIKE '%archived_at%' OR COALESCE(qual, '') || COALESCE(with_check, '') ILIKE '%hidden_at%'$dml$);
ROLLBACK;
