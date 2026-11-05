BEGIN;
RESET ROLE;
SET LOCAL request.jwt.claim.sub = '';
INSERT INTO public.sessions (id, user_id, programme_id, group_id, session_date) VALUES ('86a00000-0000-0000-0000-000000000003', '1a000000-0000-0000-0000-000000000002', (SELECT id FROM public.programmes WHERE code = 'literacy'), '7a000000-0000-0000-0000-000000000001', DATE '2026-10-20');
SELECT harness.try_dml('HO DELETE groups G', $dml$DELETE FROM public.groups WHERE id = '7a000000-0000-0000-0000-000000000001' RETURNING id$dml$);
ROLLBACK;
