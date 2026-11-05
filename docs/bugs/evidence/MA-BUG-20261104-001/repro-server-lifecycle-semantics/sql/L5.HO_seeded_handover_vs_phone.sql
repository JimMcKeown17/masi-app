BEGIN;
RESET ROLE;
SET LOCAL request.jwt.claim.sub = '';
SELECT harness.try_dml('HO inserts new membership in GV_G2 first', $dml$INSERT INTO public.child_group_memberships (id, child_id, group_id, grouping_version_id, created_by) VALUES ('9b000000-0000-0000-0000-000000000030', '5a000000-0000-0000-0000-000000000001', '7a000000-0000-0000-0000-000000000003', '6a000000-0000-0000-0000-000000000001', '1a000000-0000-0000-0000-000000000001') RETURNING id$dml$);
ROLLBACK;
