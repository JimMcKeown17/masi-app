BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '1a000000-0000-0000-0000-000000000002';
SELECT harness.try_dml('M1 removal', $dml$UPDATE public.child_group_memberships SET removed_at = now(), row_version = '2' WHERE id = '9b000000-0000-0000-0000-000000000003' RETURNING id$dml$);
SELECT harness.try_dml('M2 insert', $dml$INSERT INTO public.child_group_memberships (id, child_id, group_id, grouping_version_id, joined_at, created_by, row_version) VALUES ('9b000000-0000-0000-0000-000000000004', '5a000000-0000-0000-0000-000000000001', '7a000000-0000-0000-0000-000000000002', '6a000000-0000-0000-0000-000000000001', now(), '1a000000-0000-0000-0000-000000000002', '2') ON CONFLICT (id) DO UPDATE SET child_id = EXCLUDED.child_id, group_id = EXCLUDED.group_id, grouping_version_id = EXCLUDED.grouping_version_id, joined_at = EXCLUDED.joined_at, created_by = EXCLUDED.created_by, row_version = EXCLUDED.row_version RETURNING id$dml$);
ROLLBACK;
