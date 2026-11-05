BEGIN;
SELECT harness.q('fk inventory', $dml$
    SELECT c.confrelid::regclass::text AS parent, c.conrelid::regclass::text AS child_table,
      (SELECT string_agg(a.attname, ',') FROM unnest(c.conkey) k JOIN pg_catalog.pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k) AS fk_columns,
      CASE c.confdeltype WHEN 'a' THEN 'NO ACTION' WHEN 'r' THEN 'RESTRICT' WHEN 'c' THEN 'CASCADE' WHEN 'n' THEN 'SET NULL' WHEN 'd' THEN 'SET DEFAULT' END AS on_delete,
      c.conname
    FROM pg_catalog.pg_constraint c
    WHERE c.contype = 'f' AND c.confrelid IN ('auth.users'::regclass, 'public.users'::regclass, 'public.children'::regclass,
      'public.classes'::regclass, 'public.groups'::regclass, 'public.sessions'::regclass, 'public.assessments'::regclass,
      'public.battery_runs'::regclass, 'public.grouping_versions'::regclass)
    ORDER BY 1, 2, 3$dml$);
SELECT harness.q('authenticated DELETE grants', $dml$SELECT table_name FROM information_schema.role_table_grants WHERE grantee = 'authenticated' AND table_schema = 'public' AND privilege_type = 'DELETE' ORDER BY 1$dml$);
SELECT harness.q('DELETE policies', $dml$SELECT tablename, policyname, qual FROM pg_catalog.pg_policies WHERE schemaname = 'public' AND cmd IN ('DELETE', 'ALL') ORDER BY 1, 2$dml$);
ROLLBACK;
