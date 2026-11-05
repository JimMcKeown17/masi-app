BEGIN;
RESET ROLE;
SET LOCAL request.jwt.claim.sub = '';
INSERT INTO public.sessions (id, user_id, programme_id, session_date) VALUES ('86a00000-0000-0000-0000-000000000004', '1a000000-0000-0000-0000-000000000002', (SELECT id FROM public.programmes WHERE code = 'literacy'), DATE '2026-10-20');
INSERT INTO public.session_attendees (id, session_id, child_id) VALUES ('96a00000-0000-0000-0000-000000000004', '86a00000-0000-0000-0000-000000000004', '5a000000-0000-0000-0000-000000000001');
SELECT harness.try_dml('HO DELETE children C_DIRECT', $dml$DELETE FROM public.children WHERE id = '5a000000-0000-0000-0000-000000000001' RETURNING id$dml$);
SELECT harness.peek('attendee after', 'public.session_attendees', '96a00000-0000-0000-0000-000000000004', ARRAY['id']);
SELECT harness.peek('session after', 'public.sessions', '86a00000-0000-0000-0000-000000000004', ARRAY['id']);
ROLLBACK;
