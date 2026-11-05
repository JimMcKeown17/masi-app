BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '1a000000-0000-0000-0000-000000000002';
SELECT harness.try_dml('second active membership same child+group', $dml$INSERT INTO public.child_group_memberships (id, child_id, group_id, joined_at, created_by, row_version) VALUES ('9b000000-0000-0000-0000-000000000004', '5a000000-0000-0000-0000-000000000001', '7a000000-0000-0000-0000-000000000001', now(), '1a000000-0000-0000-0000-000000000002', '2') ON CONFLICT (id) DO UPDATE SET child_id = EXCLUDED.child_id, group_id = EXCLUDED.group_id, joined_at = EXCLUDED.joined_at, created_by = EXCLUDED.created_by, row_version = EXCLUDED.row_version RETURNING id$dml$);
RESET ROLE;
SET LOCAL request.jwt.claim.sub = '';
SELECT harness.q('active memberships for C_DIRECT in G', $dml$SELECT id, removed_at FROM public.child_group_memberships WHERE child_id = '5a000000-0000-0000-0000-000000000001' AND group_id = '7a000000-0000-0000-0000-000000000001' AND removed_at IS NULL ORDER BY id$dml$);
ROLLBACK;
