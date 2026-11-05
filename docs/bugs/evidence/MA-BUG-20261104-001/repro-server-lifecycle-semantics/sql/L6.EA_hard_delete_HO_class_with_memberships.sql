BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '1a000000-0000-0000-0000-000000000002';
SELECT harness.try_dml('EA_A DELETE classes K', $dml$DELETE FROM public.classes WHERE id = '4a000000-0000-0000-0000-000000000001' RETURNING id$dml$);
ROLLBACK;
