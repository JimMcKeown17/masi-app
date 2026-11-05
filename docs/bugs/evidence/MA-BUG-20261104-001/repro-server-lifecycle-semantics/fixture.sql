
CREATE SCHEMA harness;
-- Runs one DML statement as the CURRENT role (SECURITY INVOKER) inside a subtransaction and
-- reports exactly what the client would see: rows returned or the SQLSTATE/message/constraint.
CREATE FUNCTION harness.try_dml(p_step TEXT, p_sql TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER AS $fn$
DECLARE
  v_rows JSONB; v_count BIGINT; v_state TEXT; v_msg TEXT; v_detail TEXT; v_constraint TEXT; v_table TEXT;
  v_who JSONB := jsonb_build_object('role', current_user, 'jwt_sub', NULLIF(current_setting('request.jwt.claim.sub', TRUE), ''));
BEGIN
  BEGIN
    EXECUTE format('WITH r AS (%s) SELECT COALESCE(jsonb_agg(to_jsonb(r)), ''[]''::jsonb), count(*) FROM r', p_sql)
      INTO v_rows, v_count;
    RETURN jsonb_build_object('step', p_step, 'as', v_who, 'ok', TRUE, 'rows_affected', v_count, 'returned', v_rows);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT, v_detail = PG_EXCEPTION_DETAIL,
      v_constraint = CONSTRAINT_NAME, v_table = TABLE_NAME;
    RETURN jsonb_build_object('step', p_step, 'as', v_who, 'ok', FALSE, 'sqlstate', v_state, 'message', v_msg,
      'detail', NULLIF(v_detail, ''), 'constraint', NULLIF(v_constraint, ''), 'table', NULLIF(v_table, ''));
  END;
END;
$fn$;
-- Reads a row bypassing RLS (SECURITY DEFINER, owned by the superuser) so state is reported truthfully.
CREATE FUNCTION harness.peek(p_step TEXT, p_table REGCLASS, p_id UUID, p_cols TEXT[])
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE v_row JSONB; v_out JSONB := '{}'::jsonb; c TEXT;
BEGIN
  EXECUTE format('SELECT to_jsonb(t) FROM %s t WHERE t.id = $1', p_table) INTO v_row USING p_id;
  IF v_row IS NULL THEN
    RETURN jsonb_build_object('step', p_step, 'table', p_table::text, 'id', p_id, 'row', NULL);
  END IF;
  FOREACH c IN ARRAY p_cols LOOP v_out := v_out || jsonb_build_object(c, v_row -> c); END LOOP;
  RETURN jsonb_build_object('step', p_step, 'table', p_table::text, 'id', p_id, 'row', v_out);
END;
$fn$;
CREATE FUNCTION harness.q(p_step TEXT, p_sql TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE v JSONB;
BEGIN
  EXECUTE format('SELECT COALESCE(jsonb_agg(to_jsonb(r)), ''[]''::jsonb) FROM (%s) r', p_sql) INTO v;
  RETURN jsonb_build_object('step', p_step, 'result', v);
END;
$fn$;
GRANT USAGE ON SCHEMA harness TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA harness TO authenticated;


INSERT INTO auth.users (id) VALUES ('1a000000-0000-0000-0000-000000000001'), ('1a000000-0000-0000-0000-000000000002'), ('1a000000-0000-0000-0000-000000000003'), ('1a000000-0000-0000-0000-000000000004');
INSERT INTO public.schools (id, name) VALUES ('2a000000-0000-0000-0000-000000000001', 'Lifecycle repro school');
INSERT INTO public.users (id, first_name, last_name, school_id, organization_id) VALUES
  ('1a000000-0000-0000-0000-000000000001', 'Head', 'Office', '2a000000-0000-0000-0000-000000000001', 'a111879f-d066-47c9-95a1-bed2a400319a'),
  ('1a000000-0000-0000-0000-000000000002', 'EA', 'A', '2a000000-0000-0000-0000-000000000001', 'a111879f-d066-47c9-95a1-bed2a400319a'),
  ('1a000000-0000-0000-0000-000000000003', 'EA', 'B', '2a000000-0000-0000-0000-000000000001', 'a111879f-d066-47c9-95a1-bed2a400319a'),
  ('1a000000-0000-0000-0000-000000000004', 'EA', 'Doomed', '2a000000-0000-0000-0000-000000000001', 'a111879f-d066-47c9-95a1-bed2a400319a');
INSERT INTO public.staff_programme_assignments (id, user_id, programme_id, school_id, created_by) VALUES
  ('3a000000-0000-0000-0000-000000000001', '1a000000-0000-0000-0000-000000000002', (SELECT id FROM public.programmes WHERE code = 'literacy'), '2a000000-0000-0000-0000-000000000001', '1a000000-0000-0000-0000-000000000001'),
  ('3a000000-0000-0000-0000-000000000002', '1a000000-0000-0000-0000-000000000003', (SELECT id FROM public.programmes WHERE code = 'literacy'), '2a000000-0000-0000-0000-000000000001', '1a000000-0000-0000-0000-000000000001'),
  ('3a000000-0000-0000-0000-000000000003', '1a000000-0000-0000-0000-000000000004', (SELECT id FROM public.programmes WHERE code = 'literacy'), '2a000000-0000-0000-0000-000000000001', '1a000000-0000-0000-0000-000000000001');
INSERT INTO public.classes (id, school_id, name, grade, academic_year_id, created_by) VALUES
  ('4a000000-0000-0000-0000-000000000001', '2a000000-0000-0000-0000-000000000001', 'HO class K', '1', (SELECT id FROM public.academic_years WHERE is_active), '1a000000-0000-0000-0000-000000000001'),
  ('4a000000-0000-0000-0000-000000000002', '2a000000-0000-0000-0000-000000000001', 'EA_A class KA', '1', (SELECT id FROM public.academic_years WHERE is_active), '1a000000-0000-0000-0000-000000000002'),
  ('4a000000-0000-0000-0000-000000000003', '2a000000-0000-0000-0000-000000000001', 'HO class K2', '2', (SELECT id FROM public.academic_years WHERE is_active), '1a000000-0000-0000-0000-000000000001');
INSERT INTO public.children (id, first_name, last_name, class_id, created_by) VALUES
  ('5a000000-0000-0000-0000-000000000001', 'Child', 'Direct', '4a000000-0000-0000-0000-000000000001', '1a000000-0000-0000-0000-000000000001'),
  ('5a000000-0000-0000-0000-000000000002', 'Child', 'ClassOnly', '4a000000-0000-0000-0000-000000000001', '1a000000-0000-0000-0000-000000000001'),
  ('5a000000-0000-0000-0000-000000000003', 'Child', 'GroupOnly', NULL, '1a000000-0000-0000-0000-000000000001'),
  ('5a000000-0000-0000-0000-000000000004', 'Child', 'EaCreated', '4a000000-0000-0000-0000-000000000002', '1a000000-0000-0000-0000-000000000002'),
  ('5a000000-0000-0000-0000-000000000005', 'Child', 'Free', NULL, '1a000000-0000-0000-0000-000000000001'),
  ('5a000000-0000-0000-0000-000000000006', 'Child', 'EaCreated2', NULL, '1a000000-0000-0000-0000-000000000002'),
  ('5a000000-0000-0000-0000-000000000007', 'Child', 'EaCreatedL7', NULL, '1a000000-0000-0000-0000-000000000002');
INSERT INTO public.child_ea_assignments (id, user_id, child_id, assigned_at, created_by) VALUES
  ('0988d63d-a3ce-5ea8-9f06-6a21d0a828e5', '1a000000-0000-0000-0000-000000000002', '5a000000-0000-0000-0000-000000000001', TIMESTAMPTZ '2026-02-01 08:00:00+02', '1a000000-0000-0000-0000-000000000001'),
  ('72da7ecf-0b86-52c2-9b00-a7eafbeec2b9', '1a000000-0000-0000-0000-000000000002', '5a000000-0000-0000-0000-000000000005', TIMESTAMPTZ '2026-02-01 08:00:00+02', '1a000000-0000-0000-0000-000000000001'),
  ('b20d56d9-e39a-56bf-9d92-5afc2cc1d9ad', '1a000000-0000-0000-0000-000000000002', '5a000000-0000-0000-0000-000000000004', TIMESTAMPTZ '2026-02-01 08:00:00+02', '1a000000-0000-0000-0000-000000000002');
INSERT INTO public.child_programme_enrollments (id, child_id, programme_id, enrolled_at, created_by) VALUES
  ('a346575c-8206-5f67-97fa-8bd426dfee99', '5a000000-0000-0000-0000-000000000001', (SELECT id FROM public.programmes WHERE code = 'literacy'), TIMESTAMPTZ '2026-02-01 08:00:00+02', '1a000000-0000-0000-0000-000000000001'),
  ('e960924b-4786-577a-8df0-12f787c9cb02', '5a000000-0000-0000-0000-000000000002', (SELECT id FROM public.programmes WHERE code = 'literacy'), TIMESTAMPTZ '2026-02-01 08:00:00+02', '1a000000-0000-0000-0000-000000000001'),
  ('40b17c12-b710-5723-b990-edb3e414c20f', '5a000000-0000-0000-0000-000000000003', (SELECT id FROM public.programmes WHERE code = 'literacy'), TIMESTAMPTZ '2026-02-01 08:00:00+02', '1a000000-0000-0000-0000-000000000001');
INSERT INTO public.class_ea_assignments (id, class_id, ea_user_id, programme_id, assigned_at, created_by) VALUES
  ('b593ffec-8582-5ad8-bec1-d586fdbe10a0', '4a000000-0000-0000-0000-000000000001', '1a000000-0000-0000-0000-000000000002', (SELECT id FROM public.programmes WHERE code = 'literacy'), TIMESTAMPTZ '2026-02-01 08:00:00+02', '1a000000-0000-0000-0000-000000000001'),
  ('72337903-fac1-5804-b901-a37df11604f3', '4a000000-0000-0000-0000-000000000003', '1a000000-0000-0000-0000-000000000002', (SELECT id FROM public.programmes WHERE code = 'literacy'), TIMESTAMPTZ '2026-02-01 08:00:00+02', '1a000000-0000-0000-0000-000000000001');
INSERT INTO public.child_class_memberships (id, child_id, class_id, academic_year_id, enrolled_at, created_by) VALUES
  ('9a000000-0000-0000-0000-000000000001', '5a000000-0000-0000-0000-000000000001', '4a000000-0000-0000-0000-000000000001', (SELECT id FROM public.academic_years WHERE is_active), TIMESTAMPTZ '2026-02-01 08:00:00+02', '1a000000-0000-0000-0000-000000000001'),
  ('9a000000-0000-0000-0000-000000000002', '5a000000-0000-0000-0000-000000000002', '4a000000-0000-0000-0000-000000000001', (SELECT id FROM public.academic_years WHERE is_active), TIMESTAMPTZ '2026-02-01 08:00:00+02', '1a000000-0000-0000-0000-000000000001');
INSERT INTO public.grouping_versions (id, class_id, academic_year_id, version_number, status, created_by) VALUES
  ('6a000000-0000-0000-0000-000000000001', '4a000000-0000-0000-0000-000000000001', (SELECT id FROM public.academic_years WHERE is_active), 1, 'active', '1a000000-0000-0000-0000-000000000001');
INSERT INTO public.groups (id, name, programme_id, class_id, grouping_version_id, display_number, created_by) VALUES
  ('7a000000-0000-0000-0000-000000000001', 'HO group G', (SELECT id FROM public.programmes WHERE code = 'literacy'), '4a000000-0000-0000-0000-000000000001', NULL, NULL, '1a000000-0000-0000-0000-000000000001'),
  ('7a000000-0000-0000-0000-000000000002', 'Seeded group 1', (SELECT id FROM public.programmes WHERE code = 'literacy'), '4a000000-0000-0000-0000-000000000001', '6a000000-0000-0000-0000-000000000001', 1, '1a000000-0000-0000-0000-000000000001'),
  ('7a000000-0000-0000-0000-000000000003', 'Seeded group 2', (SELECT id FROM public.programmes WHERE code = 'literacy'), '4a000000-0000-0000-0000-000000000001', '6a000000-0000-0000-0000-000000000001', 2, '1a000000-0000-0000-0000-000000000001');
INSERT INTO public.group_ea_assignments (id, group_id, ea_user_id, programme_id, assigned_at, created_by) VALUES
  ('c189a976-3679-542d-966d-c9e28c04112e', '7a000000-0000-0000-0000-000000000001', '1a000000-0000-0000-0000-000000000002', (SELECT id FROM public.programmes WHERE code = 'literacy'), TIMESTAMPTZ '2026-02-01 08:00:00+02', '1a000000-0000-0000-0000-000000000001'),
  ('6a4bd5e1-97cf-55c9-ae14-05ad17a7b024', '7a000000-0000-0000-0000-000000000002', '1a000000-0000-0000-0000-000000000002', (SELECT id FROM public.programmes WHERE code = 'literacy'), TIMESTAMPTZ '2026-02-01 08:00:00+02', '1a000000-0000-0000-0000-000000000001'),
  ('824a4944-9701-5966-94c5-a4ee43634cd5', '7a000000-0000-0000-0000-000000000003', '1a000000-0000-0000-0000-000000000002', (SELECT id FROM public.programmes WHERE code = 'literacy'), TIMESTAMPTZ '2026-02-01 08:00:00+02', '1a000000-0000-0000-0000-000000000001');
INSERT INTO public.child_group_memberships (id, child_id, group_id, grouping_version_id, joined_at, created_by) VALUES
  ('9b000000-0000-0000-0000-000000000001', '5a000000-0000-0000-0000-000000000001', '7a000000-0000-0000-0000-000000000001', NULL, TIMESTAMPTZ '2026-02-01 08:00:00+02', '1a000000-0000-0000-0000-000000000001'),
  ('9b000000-0000-0000-0000-000000000002', '5a000000-0000-0000-0000-000000000003', '7a000000-0000-0000-0000-000000000001', NULL, TIMESTAMPTZ '2026-02-01 08:00:00+02', '1a000000-0000-0000-0000-000000000001'),
  ('9b000000-0000-0000-0000-000000000003', '5a000000-0000-0000-0000-000000000001', '7a000000-0000-0000-0000-000000000002', '6a000000-0000-0000-0000-000000000001', TIMESTAMPTZ '2026-02-01 08:00:00+02', '1a000000-0000-0000-0000-000000000001');
