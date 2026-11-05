BEGIN;
RESET ROLE;
SET LOCAL request.jwt.claim.sub = '';

INSERT INTO public.children (id, first_name, last_name, created_by) VALUES ('5d000000-0000-0000-0000-000000000001', 'Doomed', 'Child', '1a000000-0000-0000-0000-000000000004');
INSERT INTO public.child_ea_assignments (id, user_id, child_id, created_by) VALUES ('2955f6b8-d0e1-5e68-a70a-a68210d0a779', '1a000000-0000-0000-0000-000000000004', '5d000000-0000-0000-0000-000000000001', '1a000000-0000-0000-0000-000000000004');
INSERT INTO public.child_ea_assignments (id, user_id, child_id, created_by) VALUES ('147aa0a4-83e0-5c0b-bd20-15e6285725e5', '1a000000-0000-0000-0000-000000000004', '5a000000-0000-0000-0000-000000000001', '1a000000-0000-0000-0000-000000000001');
INSERT INTO public.class_ea_assignments (id, class_id, ea_user_id, programme_id, created_by) VALUES ('4d49e348-c01e-504c-b4d5-3d3a4f565cbf', '4a000000-0000-0000-0000-000000000001', '1a000000-0000-0000-0000-000000000004', (SELECT id FROM public.programmes WHERE code = 'literacy'), '1a000000-0000-0000-0000-000000000001');
INSERT INTO public.group_ea_assignments (id, group_id, ea_user_id, programme_id, created_by, unassigned_at) VALUES ('8d000000-0000-0000-0000-000000000001', '7a000000-0000-0000-0000-000000000001', '1a000000-0000-0000-0000-000000000004', (SELECT id FROM public.programmes WHERE code = 'literacy'), '1a000000-0000-0000-0000-000000000001', now());
INSERT INTO public.sessions (id, user_id, programme_id, class_id, group_id, session_date) VALUES ('86d00000-0000-0000-0000-000000000001', '1a000000-0000-0000-0000-000000000004', (SELECT id FROM public.programmes WHERE code = 'literacy'), '4a000000-0000-0000-0000-000000000001', '7a000000-0000-0000-0000-000000000001', DATE '2026-10-20');
INSERT INTO public.session_attendees (id, session_id, child_id, group_id) VALUES ('96d00000-0000-0000-0000-000000000001', '86d00000-0000-0000-0000-000000000001', '5a000000-0000-0000-0000-000000000001', '7a000000-0000-0000-0000-000000000001');
INSERT INTO public.assessments (id, user_id, child_id, programme_id, assessment_type, assessment_date) VALUES ('a6d00000-0000-0000-0000-000000000001', '1a000000-0000-0000-0000-000000000004', '5a000000-0000-0000-0000-000000000001', (SELECT id FROM public.programmes WHERE code = 'literacy'), 'letter_sounds', DATE '2026-10-20');
INSERT INTO public.assessment_items (id, assessment_id, item_key) VALUES ('a7d00000-0000-0000-0000-000000000001', 'a6d00000-0000-0000-0000-000000000001', 'a');
INSERT INTO public.time_entries (id, user_id, sign_in_time) VALUES ('7ed00000-0000-0000-0000-000000000001', '1a000000-0000-0000-0000-000000000004', now() - interval '1 day');


SELECT harness.q('before', $dml$
  SELECT
    (SELECT count(*) FROM public.users WHERE id = '1a000000-0000-0000-0000-000000000004') AS public_users,
    (SELECT count(*) FROM public.sessions WHERE user_id = '1a000000-0000-0000-0000-000000000004') AS sessions,
    (SELECT count(*) FROM public.session_attendees WHERE session_id = '86d00000-0000-0000-0000-000000000001') AS attendees,
    (SELECT count(*) FROM public.assessments WHERE user_id = '1a000000-0000-0000-0000-000000000004') AS assessments,
    (SELECT count(*) FROM public.assessment_items WHERE assessment_id = 'a6d00000-0000-0000-0000-000000000001') AS assessment_items,
    (SELECT count(*) FROM public.letter_mastery WHERE changed_by = '1a000000-0000-0000-0000-000000000004') AS letter_mastery,
    (SELECT count(*) FROM public.child_ea_assignments WHERE user_id = '1a000000-0000-0000-0000-000000000004') AS child_ea_assignments,
    (SELECT count(*) FROM public.class_ea_assignments WHERE ea_user_id = '1a000000-0000-0000-0000-000000000004') AS class_ea_assignments,
    (SELECT count(*) FROM public.group_ea_assignments WHERE ea_user_id = '1a000000-0000-0000-0000-000000000004') AS group_ea_assignments,
    (SELECT count(*) FROM public.staff_programme_assignments WHERE user_id = '1a000000-0000-0000-0000-000000000004') AS staff_programme_assignments,
    (SELECT count(*) FROM public.time_entries WHERE user_id = '1a000000-0000-0000-0000-000000000004') AS time_entries,
    (SELECT count(*) FROM public.children WHERE id = '5d000000-0000-0000-0000-000000000001') AS ea_created_child,
    (SELECT created_by FROM public.children WHERE id = '5d000000-0000-0000-0000-000000000001') AS ea_created_child_created_by$dml$);
SELECT harness.try_dml('DELETE auth.users', $dml$DELETE FROM auth.users WHERE id = '1a000000-0000-0000-0000-000000000004' RETURNING id$dml$);
SELECT harness.q('after', $dml$
  SELECT
    (SELECT count(*) FROM public.users WHERE id = '1a000000-0000-0000-0000-000000000004') AS public_users,
    (SELECT count(*) FROM public.sessions WHERE user_id = '1a000000-0000-0000-0000-000000000004') AS sessions,
    (SELECT count(*) FROM public.session_attendees WHERE session_id = '86d00000-0000-0000-0000-000000000001') AS attendees,
    (SELECT count(*) FROM public.assessments WHERE user_id = '1a000000-0000-0000-0000-000000000004') AS assessments,
    (SELECT count(*) FROM public.assessment_items WHERE assessment_id = 'a6d00000-0000-0000-0000-000000000001') AS assessment_items,
    (SELECT count(*) FROM public.letter_mastery WHERE changed_by = '1a000000-0000-0000-0000-000000000004') AS letter_mastery,
    (SELECT count(*) FROM public.child_ea_assignments WHERE user_id = '1a000000-0000-0000-0000-000000000004') AS child_ea_assignments,
    (SELECT count(*) FROM public.class_ea_assignments WHERE ea_user_id = '1a000000-0000-0000-0000-000000000004') AS class_ea_assignments,
    (SELECT count(*) FROM public.group_ea_assignments WHERE ea_user_id = '1a000000-0000-0000-0000-000000000004') AS group_ea_assignments,
    (SELECT count(*) FROM public.staff_programme_assignments WHERE user_id = '1a000000-0000-0000-0000-000000000004') AS staff_programme_assignments,
    (SELECT count(*) FROM public.time_entries WHERE user_id = '1a000000-0000-0000-0000-000000000004') AS time_entries,
    (SELECT count(*) FROM public.children WHERE id = '5d000000-0000-0000-0000-000000000001') AS ea_created_child,
    (SELECT created_by FROM public.children WHERE id = '5d000000-0000-0000-0000-000000000001') AS ea_created_child_created_by$dml$);
ROLLBACK;
