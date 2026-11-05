#!/usr/bin/env node

// Head Office lifecycle operator script (lifecycle-safety plan step H1, ADR-0014).
// handover (child | class | group), end-delivery, reopen, and restore child (undo an EA's
// mistaken Delete child). Dry run by default; --apply
// changes the masi-app-sqlite database in one transaction per command, as postgres, then
// confirms through a separate read-back. Runbook: documentation/ea-access-runbook.md.

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync: spawnProcess } = require('node:child_process');
const { parseEnvContent } = require('./sqlite-staging.cjs');
const { PROJECT_REF, buildConnectionString, resolvePsql } = require('./ea-access.cjs');

const DEFAULT_HOST = 'aws-1-eu-west-2.pooler.supabase.com';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const EMAIL = /^[^\s@]+@[^\s@]+$/;
const PROGRAMME_CODE = /^[a-z][a-z0-9_]{0,62}$/;
const MAX_CHILDREN = 100;

// Mirrors src/db/domainId.js deterministicDomainId (contract map Item 11): UUIDv5, this
// namespace, parts joined by U+001F. __tests__/hoLifecycleScript.test.js pins parity.
const MASI_DOMAIN_ID_NAMESPACE = '09dcf4b2-6c53-4c46-917f-33bc7f2df4d2';
const deterministicId = (...parts) => {
  const name = parts.map(part => String(part ?? '')).join('\u001f');
  const hash = crypto.createHash('sha1')
    .update(Buffer.from(MASI_DOMAIN_ID_NAMESPACE.replaceAll('-', ''), 'hex'))
    .update(Buffer.from(name, 'utf8')).digest();
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const hex = hash.subarray(0, 16).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};
const DETERMINISTIC_KEYS = {
  child_ea_assignments: action => [action.ea_user_id, action.child_id],
  class_ea_assignments: action => [action.class_id, action.ea_user_id, action.programme_id],
};

const SHAPES = {
  'handover child': ['--from', '--to', '--children'],
  'handover class': ['--from', '--to', '--class', '--programme', '--delivery'],
  'handover group': ['--from', '--to', '--group'],
  'end-delivery child': ['--ea', '--children'],
  'reopen child': ['--ea', '--children'],
  'reopen class': ['--ea', '--class', '--programme'],
  'restore child': ['--ea', '--children'],
};
const USAGE = `Usage (dry run unless --apply; reason and operator are always required):
  handover child --from <email> --to <email> --children <uuid[,uuid...]>
  handover class --from <email> --to <email> --class <uuid> --programme <code> --delivery move|stay
  handover group --from <email> --to <email> --group <uuid>
  end-delivery   --ea <email> --children <uuid[,uuid...]>
  reopen child   --ea <email> --children <uuid[,uuid...]>
  reopen class   --ea <email> --class <uuid> --programme <code>
  restore child  --ea <email> --children <uuid[,uuid...]>   (undo that EA's Delete child)
  ... --reason <text> --operator <name> [--apply]`;

const uuidValue = (flag, value) => {
  const id = value.toLowerCase();
  if (!UUID.test(id)) throw new Error(`${flag} requires a UUID.`);
  return id;
};

const parseArgs = (argv) => {
  const [command, maybeScope, ...rest] = argv;
  let scope = maybeScope;
  let flags = rest;
  if (command === 'end-delivery') {
    scope = 'child';
    flags = argv.slice(1);
  }
  const allowed = SHAPES[`${command} ${scope}`];
  if (!allowed) throw new Error(`Unknown command.\n${USAGE}`);
  const options = { command, scope, apply: false };
  const seen = new Set();
  for (let index = 0; index < flags.length; index += 1) {
    const flag = flags[index];
    if (![...allowed, '--reason', '--operator', '--apply'].includes(flag) || seen.has(flag)) {
      throw new Error(`Unknown or duplicate flag ${flag}.\n${USAGE}`);
    }
    seen.add(flag);
    if (flag === '--apply') { options.apply = true; continue; }
    const value = flags[++index];
    if (!value || value.startsWith('--') || value.includes('\0') || !value.trim()) {
      throw new Error(`${flag} requires a nonempty value.`);
    }
    options[flag.slice(2)] = value.trim();
  }
  for (const flag of allowed) {
    if (!seen.has(flag)) throw new Error(`${flag} is required.\n${USAGE}`);
  }
  for (const key of ['from', 'to', 'ea']) {
    if (options[key] !== undefined && !EMAIL.test(options[key])) throw new Error(`--${key} requires an exact email address.`);
  }
  if (options.from && options.from.toLowerCase() === options.to.toLowerCase()) {
    throw new Error('--from and --to must be different EAs.');
  }
  if (options.children !== undefined) {
    const ids = options.children.split(',').map(value => uuidValue('--children', value.trim()));
    if (new Set(ids).size !== ids.length || ids.length > MAX_CHILDREN) {
      throw new Error(`--children takes 1-${MAX_CHILDREN} distinct UUIDs.`);
    }
    options.children = ids.sort();
  }
  for (const key of ['class', 'group']) {
    if (options[key] !== undefined) options[key] = uuidValue(`--${key}`, options[key]);
  }
  if (options.programme !== undefined && !PROGRAMME_CODE.test(options.programme)) {
    throw new Error('--programme requires a programme code, for example literacy.');
  }
  if (options.delivery !== undefined && !['move', 'stay'].includes(options.delivery)) {
    throw new Error('--delivery must be move (the successor also takes over delivery) or stay.');
  }
  for (const [key, max] of [['reason', 1000], ['operator', 200]]) {
    if (!options[key] || [...options[key]].length > max) {
      throw new Error(`--${key} must contain 1-${max} characters.`);
    }
  }
  return options;
};

// Every program reads its inputs from one JSON psql variable, so values are never
// interpolated into SQL text.
const RESOLVE_SQL = `BEGIN READ ONLY;
SET LOCAL statement_timeout = '30s';
SELECT pg_catalog.jsonb_build_object(
  'read_only', pg_catalog.current_setting('transaction_read_only'),
  'users', coalesce((SELECT pg_catalog.jsonb_object_agg(e.key, (
      SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', a.id, 'email', a.email, 'has_profile', u.id IS NOT NULL,
        'suspended', coalesce(a.banned_until > pg_catalog.now(), false)) ORDER BY a.id), '[]'::jsonb)
      FROM auth.users a LEFT JOIN public.users u ON u.id = a.id
      WHERE lower(a.email) = lower(e.value)))
    FROM pg_catalog.jsonb_each_text((:'args')::jsonb -> 'emails') e), '{}'::jsonb),
  'programmes', (SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id', p.id, 'code', p.code, 'name', p.name)), '[]'::jsonb)
    FROM public.programmes p WHERE p.code = (:'args')::jsonb ->> 'programme_code'),
  -- Display names only, so the operator can check each id in the preview before --apply.
  'entities', (SELECT coalesce(pg_catalog.jsonb_agg(x.entity ORDER BY x.entity ->> 'id'), '[]'::jsonb) FROM (
      SELECT pg_catalog.jsonb_build_object('kind', 'child', 'id', c.id, 'name', concat_ws(' ', c.first_name, c.last_name),
        'archived', c.archived_at IS NOT NULL) AS entity
      FROM public.children c WHERE c.id::text IN (SELECT pg_catalog.jsonb_array_elements_text((:'args')::jsonb -> 'ids'))
      UNION ALL
      SELECT pg_catalog.jsonb_build_object('kind', 'class', 'id', cl.id, 'name', cl.name, 'grade', cl.grade,
        'archived', cl.archived_at IS NOT NULL)
      FROM public.classes cl WHERE cl.id::text IN (SELECT pg_catalog.jsonb_array_elements_text((:'args')::jsonb -> 'ids'))
      UNION ALL
      SELECT pg_catalog.jsonb_build_object('kind', 'group', 'id', g.id, 'name', g.name, 'class_id', g.class_id,
        'archived', g.archived_at IS NOT NULL)
      FROM public.groups g WHERE g.id::text IN (SELECT pg_catalog.jsonb_array_elements_text((:'args')::jsonb -> 'ids'))) x));
ROLLBACK;`;

// The plan and the change are one anonymous PL/pgSQL block: nothing is stored in the
// database. The dry-run program contains no lock and no write statement at all, and runs
// in a READ ONLY transaction, so the server would refuse a write even if one were added.
// The apply program first takes row locks in the global lifecycle order (children ->
// classes -> groups, ids ascending; plan finding 4), recomputes the same plan from the
// locked state, stops on any refusal, and only then changes rows. Ends and reopens never
// write row_version, identity columns or the start (assigned_at).
const DELIVERY_IN_CLASS = `ARRAY(SELECT DISTINCT cea.child_id FROM public.child_ea_assignments cea
      JOIN public.child_class_memberships ccm ON ccm.child_id = cea.child_id
        AND ccm.class_id = v_class AND ccm.exited_at IS NULL
      WHERE cea.user_id = v_from AND cea.unassigned_at IS NULL ORDER BY 1)`;

const PLAN_HEAD = `DO $ho$
DECLARE
  a constant jsonb := pg_catalog.current_setting('masi_ho.args')::jsonb;
  v_command constant text := a ->> 'command';
  v_scope constant text := a ->> 'scope';
  v_move constant boolean := a ->> 'command' = 'handover' AND a ->> 'scope' = 'class' AND a ->> 'delivery' = 'move';
  v_reason constant text := a ->> 'reason';
  v_from constant uuid := (a ->> 'from_id')::uuid;
  v_to constant uuid := (a ->> 'to_id')::uuid;
  v_ea constant uuid := (a ->> 'ea_id')::uuid;
  v_class constant uuid := (a ->> 'class_id')::uuid;
  v_programme constant uuid := (a ->> 'programme_id')::uuid;
  v_group constant uuid := (a ->> 'group_id')::uuid;
  v_fresh constant uuid := (a ->> 'fresh_id')::uuid;
  v_ns constant uuid := '09dcf4b2-6c53-4c46-917f-33bc7f2df4d2';
  v_opener constant uuid := CASE WHEN a ->> 'command' = 'handover' THEN (a ->> 'to_id')::uuid ELSE (a ->> 'ea_id')::uuid END;
  v_children constant uuid[] := ARRAY(SELECT DISTINCT x::uuid
    FROM pg_catalog.jsonb_array_elements_text(coalesce(a -> 'child_ids', '[]'::jsonb)) x ORDER BY 1);
  v_moving uuid[] := '{}';
  v_moving_locked uuid[];
  v_opening uuid[];
  v_lock_classes uuid[];
  v_lock_groups uuid[];
  v_staying uuid[];
  v_end jsonb := '[]';
  v_open jsonb := '[]';
  v_actions jsonb := '[]';
  v_notes jsonb := '[]';
  v_refusals jsonb := '[]';
  v_intent jsonb;
  v_action jsonb;
  v_row jsonb;
  v_child uuid;
  v_det uuid;
  v_found boolean;
  v_archived timestamptz;
  v_held_programme uuid;
  v_group_programme uuid;
  v_n integer;
BEGIN
  IF v_move THEN
    v_moving := ${DELIVERY_IN_CLASS};
  END IF;
`;

// The classes and groups whose holders a command can change. The server's archive decisions
// (private.other_active_holder) read the holders of a class's children and groups without
// locking them, and rely on every Head Office grant locking that class row first: the named
// class, the group's class, and the classes and groups of every child whose delivery this
// command opens (v_opening). Taken children -> classes -> groups, ids ascending.
const GRANT_CLASSES = `ARRAY(SELECT DISTINCT s.id FROM (
      SELECT v_class AS id
      UNION ALL SELECT g.class_id FROM public.groups g WHERE g.id = v_group
      UNION ALL SELECT m.class_id FROM public.child_class_memberships m
        WHERE m.child_id = ANY (v_opening) AND m.exited_at IS NULL) s
    WHERE s.id IS NOT NULL ORDER BY 1)`;
const GRANT_GROUPS = `ARRAY(SELECT DISTINCT s.id FROM (
      SELECT v_group AS id
      UNION ALL SELECT m.group_id FROM public.child_group_memberships m
        WHERE m.child_id = ANY (v_opening) AND m.removed_at IS NULL) s
    WHERE s.id IS NOT NULL ORDER BY 1)`;

const PLAN_LOCKS = `
  PERFORM 1 FROM public.children WHERE id = ANY (v_children || v_moving) ORDER BY id FOR UPDATE;
  v_opening := CASE WHEN v_scope = 'child' AND v_command IN ('handover', 'reopen') THEN v_children ELSE v_moving END;
  v_lock_classes := ${GRANT_CLASSES};
  PERFORM 1 FROM public.classes WHERE id = ANY (v_lock_classes) ORDER BY id FOR UPDATE;
  v_lock_groups := ${GRANT_GROUPS};
  PERFORM 1 FROM public.groups WHERE id = ANY (v_lock_groups) ORDER BY id FOR UPDATE;
  IF v_move THEN
    v_moving_locked := v_moving;
    v_moving := ${DELIVERY_IN_CLASS};
    IF NOT (v_moving <@ v_moving_locked) THEN
      RAISE EXCEPTION 'ho_lifecycle_retry: the class delivery roster changed while locking; run the command again'
        USING ERRCODE = '40001';
    END IF;
  END IF;
  IF NOT (${GRANT_CLASSES} <@ v_lock_classes AND ${GRANT_GROUPS} <@ v_lock_groups) THEN
    RAISE EXCEPTION 'ho_lifecycle_retry: the classes or groups of these children changed while locking; run the command again'
      USING ERRCODE = '40001';
  END IF;
`;

const PLAN_BODY = `
  -- Intents. Entities must exist, and nobody is granted access to an archived one.
  IF v_scope = 'child' THEN
    FOREACH v_child IN ARRAY v_children LOOP
      SELECT archived_at INTO v_archived FROM public.children WHERE id = v_child;
      IF NOT FOUND THEN
        v_refusals := v_refusals || jsonb_build_array(jsonb_build_object('code', 'child_not_found', 'child_id', v_child));
      ELSIF v_archived IS NOT NULL AND v_command <> 'end-delivery' THEN
        v_refusals := v_refusals || jsonb_build_array(jsonb_build_object('code', 'child_archived', 'child_id', v_child));
      END IF;
      IF v_command IN ('handover', 'end-delivery') THEN
        v_end := v_end || jsonb_build_array(jsonb_build_object('table', 'child_ea_assignments',
          'ea', coalesce(v_from, v_ea), 'child_id', v_child, 'pair', v_child));
      END IF;
      IF v_command IN ('handover', 'reopen') THEN
        v_open := v_open || jsonb_build_array(jsonb_build_object('table', 'child_ea_assignments',
          'ea', v_opener, 'child_id', v_child, 'pair', v_child,
          'mode', CASE WHEN v_command = 'reopen' THEN 'reopen_only' ELSE 'reopen_or_insert' END));
      END IF;
    END LOOP;
  ELSIF v_scope = 'class' THEN
    SELECT archived_at INTO v_archived FROM public.classes WHERE id = v_class;
    IF NOT FOUND THEN
      v_refusals := v_refusals || jsonb_build_array(jsonb_build_object('code', 'class_not_found', 'class_id', v_class));
    ELSIF v_archived IS NOT NULL THEN
      v_refusals := v_refusals || jsonb_build_array(jsonb_build_object('code', 'class_archived', 'class_id', v_class));
    END IF;
    IF v_command = 'handover' THEN
      v_end := v_end || jsonb_build_array(jsonb_build_object('table', 'class_ea_assignments',
        'ea', v_from, 'class_id', v_class, 'programme_id', v_programme, 'pair', v_class));
      FOREACH v_child IN ARRAY v_moving LOOP
        IF EXISTS (SELECT 1 FROM public.children WHERE id = v_child AND archived_at IS NOT NULL) THEN
          v_refusals := v_refusals || jsonb_build_array(jsonb_build_object('code', 'child_archived', 'child_id', v_child,
            'hint', 'end this delivery first with end-delivery'));
        END IF;
        v_end := v_end || jsonb_build_array(jsonb_build_object('table', 'child_ea_assignments',
          'ea', v_from, 'child_id', v_child, 'pair', v_child));
        v_open := v_open || jsonb_build_array(jsonb_build_object('table', 'child_ea_assignments',
          'ea', v_to, 'child_id', v_child, 'pair', v_child, 'mode', 'reopen_or_insert'));
      END LOOP;
      IF NOT v_move THEN
        v_staying := ${DELIVERY_IN_CLASS};
        IF cardinality(v_staying) > 0 THEN
          v_notes := v_notes || jsonb_build_array(jsonb_build_object('code', 'delivery_stays_with_predecessor',
            'child_ids', to_jsonb(v_staying)));
        END IF;
      END IF;
      v_notes := v_notes || coalesce((SELECT jsonb_build_array(jsonb_build_object('code', 'groups_not_moved',
          'group_ids', jsonb_agg(gea.group_id ORDER BY gea.group_id), 'hint', 'hand each group over with handover group'))
        FROM public.group_ea_assignments gea JOIN public.groups g ON g.id = gea.group_id
        WHERE g.class_id = v_class AND g.archived_at IS NULL AND gea.ea_user_id = v_from AND gea.unassigned_at IS NULL
        HAVING count(*) > 0), '[]'::jsonb);
    END IF;
    v_open := v_open || jsonb_build_array(jsonb_build_object('table', 'class_ea_assignments',
      'ea', v_opener, 'class_id', v_class, 'programme_id', v_programme, 'pair', v_class,
      'mode', CASE WHEN v_command = 'reopen' THEN 'reopen_only' ELSE 'reopen_or_insert' END));
  ELSE
    SELECT archived_at, programme_id INTO v_archived, v_group_programme FROM public.groups WHERE id = v_group;
    IF NOT FOUND THEN
      v_refusals := v_refusals || jsonb_build_array(jsonb_build_object('code', 'group_not_found', 'group_id', v_group));
    ELSIF v_archived IS NOT NULL THEN
      v_refusals := v_refusals || jsonb_build_array(jsonb_build_object('code', 'group_archived', 'group_id', v_group));
    END IF;
    v_end := v_end || jsonb_build_array(jsonb_build_object('table', 'group_ea_assignments',
      'ea', v_from, 'group_id', v_group, 'pair', v_group));
    v_open := v_open || jsonb_build_array(jsonb_build_object('table', 'group_ea_assignments',
      'ea', v_to, 'group_id', v_group, 'programme_id', v_group_programme, 'pair', v_group, 'mode', 'insert_fresh'));
  END IF;

  -- A class or group grant is useless to an EA outside its programme: their lessons would be refused.
  IF v_scope IN ('class', 'group') THEN
    SELECT programme_id INTO v_held_programme FROM public.staff_programme_assignments
      WHERE user_id = v_opener AND ended_at IS NULL;
    IF v_held_programme IS DISTINCT FROM coalesce(v_programme, v_group_programme) THEN
      v_refusals := v_refusals || jsonb_build_array(jsonb_build_object('code', 'ea_not_in_programme',
        'ea_user_id', v_opener, 'programme_id', coalesce(v_programme, v_group_programme),
        'held_programme_id', v_held_programme));
    END IF;
  END IF;

  -- Ends: every active row the EA holds for the pair, deterministic id or not.
  FOR v_intent IN SELECT value FROM pg_catalog.jsonb_array_elements(v_end) LOOP
    v_found := false;
    FOR v_row IN
      SELECT to_jsonb(r) FROM (
        SELECT id, user_id AS ea_user_id, child_id, NULL::uuid AS class_id, NULL::uuid AS group_id,
          NULL::uuid AS programme_id, assigned_at, unassigned_at, row_version
        FROM public.child_ea_assignments
        WHERE v_intent ->> 'table' = 'child_ea_assignments' AND user_id = (v_intent ->> 'ea')::uuid
          AND child_id = (v_intent ->> 'child_id')::uuid AND unassigned_at IS NULL
        UNION ALL
        SELECT id, ea_user_id, NULL, class_id, NULL, programme_id, assigned_at, unassigned_at, row_version
        FROM public.class_ea_assignments
        WHERE v_intent ->> 'table' = 'class_ea_assignments' AND ea_user_id = (v_intent ->> 'ea')::uuid
          AND class_id = (v_intent ->> 'class_id')::uuid AND programme_id = (v_intent ->> 'programme_id')::uuid
          AND unassigned_at IS NULL
        UNION ALL
        SELECT id, ea_user_id, NULL, NULL, group_id, programme_id, assigned_at, unassigned_at, row_version
        FROM public.group_ea_assignments
        WHERE v_intent ->> 'table' = 'group_ea_assignments' AND ea_user_id = (v_intent ->> 'ea')::uuid
          AND group_id = (v_intent ->> 'group_id')::uuid AND unassigned_at IS NULL
        ORDER BY id) r
    LOOP
      v_actions := v_actions || jsonb_build_array(jsonb_strip_nulls(v_row) || jsonb_build_object(
        'action', 'end', 'table', v_intent ->> 'table', 'unassigned_at', NULL, 'pair', v_intent -> 'pair',
        'end_at', greatest(pg_catalog.now(), (v_row ->> 'assigned_at')::timestamptz)));
      v_found := true;
    END LOOP;
    IF NOT v_found THEN
      v_actions := v_actions || jsonb_build_array((v_intent - 'ea') || jsonb_build_object(
        'action', 'not_active', 'ea_user_id', v_intent -> 'ea'));
    END IF;
  END LOOP;

  -- Opens: keep an active row; else reopen the deterministic row in place (identity and start
  -- kept, the gap reported); else insert it. A group successor always gets a fresh id,
  -- because the group's deterministic id is keyed on group_id alone and ea_user_id is immutable.
  FOR v_intent IN SELECT value FROM pg_catalog.jsonb_array_elements(v_open) LOOP
    v_det := CASE v_intent ->> 'table'
      WHEN 'child_ea_assignments' THEN extensions.uuid_generate_v5(v_ns, pg_catalog.concat_ws(pg_catalog.chr(31),
        'child_ea_assignments', v_intent ->> 'ea', v_intent ->> 'child_id'))
      WHEN 'class_ea_assignments' THEN extensions.uuid_generate_v5(v_ns, pg_catalog.concat_ws(pg_catalog.chr(31),
        'class_ea_assignments', v_intent ->> 'class_id', v_intent ->> 'ea', v_intent ->> 'programme_id'))
    END;
    SELECT to_jsonb(r) INTO v_row FROM (
      SELECT id, user_id AS ea_user_id, child_id, NULL::uuid AS class_id, NULL::uuid AS group_id,
        NULL::uuid AS programme_id, assigned_at, unassigned_at, row_version
      FROM public.child_ea_assignments
      WHERE v_intent ->> 'table' = 'child_ea_assignments'
        AND ((user_id = (v_intent ->> 'ea')::uuid AND child_id = (v_intent ->> 'child_id')::uuid
          AND unassigned_at IS NULL) OR id = v_det)
      UNION ALL
      SELECT id, ea_user_id, NULL, class_id, NULL, programme_id, assigned_at, unassigned_at, row_version
      FROM public.class_ea_assignments
      WHERE v_intent ->> 'table' = 'class_ea_assignments'
        AND ((ea_user_id = (v_intent ->> 'ea')::uuid AND class_id = (v_intent ->> 'class_id')::uuid
          AND programme_id = (v_intent ->> 'programme_id')::uuid AND unassigned_at IS NULL) OR id = v_det)
      UNION ALL
      SELECT id, ea_user_id, NULL, NULL, group_id, programme_id, assigned_at, unassigned_at, row_version
      FROM public.group_ea_assignments
      WHERE v_intent ->> 'table' = 'group_ea_assignments' AND ea_user_id = (v_intent ->> 'ea')::uuid
        AND group_id = (v_intent ->> 'group_id')::uuid AND unassigned_at IS NULL
      -- An active row wins over the ended deterministic row.
      ORDER BY unassigned_at NULLS FIRST, id LIMIT 1) r;

    IF v_row IS NOT NULL AND v_row ->> 'unassigned_at' IS NULL THEN
      v_actions := v_actions || jsonb_build_array(jsonb_strip_nulls(v_row) || jsonb_build_object(
        'action', 'already_active', 'table', v_intent ->> 'table', 'unassigned_at', NULL, 'pair', v_intent -> 'pair'));
    ELSIF v_row IS NOT NULL THEN
      IF NOT v_row @> ((v_intent - 'ea' - 'mode' - 'pair' - 'table') || jsonb_build_object('ea_user_id', v_intent -> 'ea')) THEN
        v_refusals := v_refusals || jsonb_build_array(jsonb_build_object('code', 'deterministic_id_conflict',
          'table', v_intent ->> 'table', 'id', v_det));
      ELSE
        v_actions := v_actions || jsonb_build_array(jsonb_strip_nulls(v_row) || jsonb_build_object(
          'action', 'reopen', 'table', v_intent ->> 'table', 'pair', v_intent -> 'pair',
          'gap', jsonb_build_object('from', v_row -> 'unassigned_at', 'to', pg_catalog.now(),
            'hours', round((extract(epoch FROM pg_catalog.now() - (v_row ->> 'unassigned_at')::timestamptz) / 3600)::numeric, 1))));
      END IF;
    ELSIF v_intent ->> 'mode' = 'reopen_only' THEN
      v_refusals := v_refusals || jsonb_build_array(jsonb_build_object('code', 'no_row_to_reopen',
        'table', v_intent ->> 'table', 'ea_user_id', v_intent -> 'ea', 'pair', v_intent -> 'pair'));
    ELSE
      v_actions := v_actions || jsonb_build_array((v_intent - 'ea' - 'mode') || jsonb_build_object('action', 'insert',
        'id', CASE WHEN v_intent ->> 'mode' = 'insert_fresh' THEN v_fresh ELSE v_det END,
        'ea_user_id', v_intent -> 'ea', 'assigned_at', pg_catalog.now()));
      IF v_intent ->> 'mode' = 'insert_fresh' AND v_fresh IS NULL THEN
        v_notes := v_notes || jsonb_build_array(jsonb_build_object('code', 'fresh_id_generated_at_apply',
          'table', v_intent ->> 'table'));
      END IF;
    END IF;
  END LOOP;

  -- A handover needs the predecessor to hold the pair, unless the successor already does
  -- (the rerun after a lost response).
  IF v_command = 'handover' THEN
    v_refusals := v_refusals || coalesce((SELECT jsonb_agg(jsonb_build_object('code', 'predecessor_not_holding', 'pair', p.pair))
      FROM (SELECT x -> 'pair' AS pair FROM pg_catalog.jsonb_array_elements(v_actions) x
            GROUP BY x -> 'pair' HAVING NOT bool_or(x ->> 'action' IN ('end', 'already_active'))) p), '[]'::jsonb);
  END IF;
`;

const PLAN_CHANGES = `
  IF jsonb_array_length(v_refusals) > 0 THEN
    RAISE EXCEPTION 'ho_lifecycle_refused' USING DETAIL = v_refusals::text;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.jsonb_array_elements(v_actions) x WHERE x ->> 'action' = 'insert' AND x ->> 'id' IS NULL) THEN
    RAISE EXCEPTION 'ho_lifecycle_refused: an insert has no id';
  END IF;
  FOR v_action IN SELECT value FROM pg_catalog.jsonb_array_elements(v_actions) WHERE value ->> 'action' = 'end' LOOP
    IF v_action ->> 'table' = 'child_ea_assignments' THEN
      UPDATE public.child_ea_assignments SET unassigned_at = greatest(pg_catalog.now(), assigned_at)
        WHERE id = (v_action ->> 'id')::uuid AND unassigned_at IS NULL;
    ELSIF v_action ->> 'table' = 'class_ea_assignments' THEN
      UPDATE public.class_ea_assignments SET unassigned_at = greatest(pg_catalog.now(), assigned_at), handover_reason = v_reason
        WHERE id = (v_action ->> 'id')::uuid AND unassigned_at IS NULL;
    ELSE
      UPDATE public.group_ea_assignments SET unassigned_at = greatest(pg_catalog.now(), assigned_at), handover_reason = v_reason
        WHERE id = (v_action ->> 'id')::uuid AND unassigned_at IS NULL;
    END IF;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'ho_lifecycle_retry: % % changed while applying; run the command again',
        v_action ->> 'table', v_action ->> 'id' USING ERRCODE = '40001';
    END IF;
  END LOOP;
  FOR v_action IN SELECT value FROM pg_catalog.jsonb_array_elements(v_actions) WHERE value ->> 'action' = 'reopen' LOOP
    IF v_action ->> 'table' = 'child_ea_assignments' THEN
      UPDATE public.child_ea_assignments SET unassigned_at = NULL
        WHERE id = (v_action ->> 'id')::uuid AND unassigned_at IS NOT NULL;
    ELSE
      UPDATE public.class_ea_assignments SET unassigned_at = NULL, handover_reason = NULL
        WHERE id = (v_action ->> 'id')::uuid AND unassigned_at IS NOT NULL;
    END IF;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'ho_lifecycle_retry: % % changed while applying; run the command again',
        v_action ->> 'table', v_action ->> 'id' USING ERRCODE = '40001';
    END IF;
  END LOOP;
  FOR v_action IN SELECT value FROM pg_catalog.jsonb_array_elements(v_actions) WHERE value ->> 'action' = 'insert' LOOP
    IF v_action ->> 'table' = 'child_ea_assignments' THEN
      INSERT INTO public.child_ea_assignments (id, user_id, child_id, assigned_at)
      VALUES ((v_action ->> 'id')::uuid, (v_action ->> 'ea_user_id')::uuid, (v_action ->> 'child_id')::uuid, pg_catalog.now());
    ELSIF v_action ->> 'table' = 'class_ea_assignments' THEN
      INSERT INTO public.class_ea_assignments (id, class_id, ea_user_id, programme_id, assigned_at)
      VALUES ((v_action ->> 'id')::uuid, (v_action ->> 'class_id')::uuid, (v_action ->> 'ea_user_id')::uuid,
        (v_action ->> 'programme_id')::uuid, pg_catalog.now());
    ELSE
      INSERT INTO public.group_ea_assignments (id, group_id, ea_user_id, programme_id, assigned_at)
      VALUES ((v_action ->> 'id')::uuid, (v_action ->> 'group_id')::uuid, (v_action ->> 'ea_user_id')::uuid,
        (v_action ->> 'programme_id')::uuid, pg_catalog.now());
    END IF;
  END LOOP;
`;

const PLAN_TAIL = `
  PERFORM pg_catalog.set_config('masi_ho.result', jsonb_build_object(
    'server_now', pg_catalog.now(), 'read_only', pg_catalog.current_setting('transaction_read_only'),
    'actions', v_actions, 'notes', v_notes, 'refusals', v_refusals)::text, true);
END
$ho$;`;

const READBACK_SQL = `BEGIN READ ONLY;
SET LOCAL statement_timeout = '30s';
WITH ids AS (SELECT x::uuid AS id FROM pg_catalog.jsonb_array_elements_text((:'args')::jsonb -> 'ids') x)
SELECT pg_catalog.jsonb_build_object(
  'read_only', pg_catalog.current_setting('transaction_read_only'),
  'rows', coalesce((SELECT pg_catalog.jsonb_agg(r ORDER BY r.id) FROM (
    SELECT 'child_ea_assignments' AS "table", id, user_id AS ea_user_id, assigned_at, unassigned_at, row_version
      FROM public.child_ea_assignments WHERE id IN (SELECT id FROM ids)
    UNION ALL
    SELECT 'class_ea_assignments', id, ea_user_id, assigned_at, unassigned_at, row_version
      FROM public.class_ea_assignments WHERE id IN (SELECT id FROM ids)
    UNION ALL
    SELECT 'group_ea_assignments', id, ea_user_id, assigned_at, unassigned_at, row_version
      FROM public.group_ea_assignments WHERE id IN (SELECT id FROM ids)) r), '[]'::jsonb));
ROLLBACK;`;

// ---------------------------------------------------------------- restore child
// Undo an EA's mistaken Delete child by reopening, in place, exactly the rows that removal
// ended. Both removal paths end every row at one instant T: the server's Delete child
// (private.delete_child_if_no_history) writes its now() in one transaction, and the 1.5.0
// phone's archiveChild chain stamps one phone time that the end guard keeps (least(T, now())).
// The removal window [t_from, t_to] is that instant: the child's archive when it is archived
// (the archive must be this EA's), else the end of the EA's most recent ended delivery row.
// Every removal this command undoes ended the EA's own delivery row inside the window; one that
// did not (a creator's Delete child after Head Office moved or ended their delivery) is refused.
// Restore reopens that delivery row, every enrolment and class or group membership of the child
// ended inside the window, and the child when it is archived. It never touches a row ended at
// another time or another EA's assignment, and never writes row_version, an identity column or a
// start.
const RESTORE_INSTANTS = `SELECT c.id AS child_id, w.t AS t_from, w.t AS t_to
      FROM public.children c CROSS JOIN LATERAL (SELECT coalesce(c.archived_at, (
        SELECT max(e.unassigned_at) FROM public.child_ea_assignments e
        WHERE e.child_id = c.id AND e.user_id = v_ea AND NOT EXISTS (
          SELECT 1 FROM public.child_ea_assignments o
          WHERE o.child_id = c.id AND o.user_id = v_ea AND o.unassigned_at IS NULL))) AS t) w
      WHERE c.id = ANY (v_children)`;

// The classes and groups whose holders a restore can change (the same reason as GRANT_CLASSES):
// those of the child's open memberships, those of the memberships ended inside the removal
// window (the ones it reopens), and the class of each such group, because a reopened group membership makes the
// group's holder a holder of the group's class (private.other_active_holder('classes')).
const RESTORE_CLASSES = `ARRAY(SELECT DISTINCT s.id FROM (
      SELECT m.class_id AS id FROM public.child_class_memberships m
        JOIN (${RESTORE_INSTANTS}) r ON r.child_id = m.child_id
        WHERE m.exited_at IS NULL OR m.exited_at BETWEEN r.t_from AND r.t_to
      UNION ALL SELECT g.class_id FROM public.child_group_memberships m
        JOIN (${RESTORE_INSTANTS}) r ON r.child_id = m.child_id
        JOIN public.groups g ON g.id = m.group_id
        WHERE m.removed_at IS NULL OR m.removed_at BETWEEN r.t_from AND r.t_to) s
    WHERE s.id IS NOT NULL ORDER BY 1)`;
const RESTORE_GROUPS = `ARRAY(SELECT DISTINCT m.group_id FROM public.child_group_memberships m
      JOIN (${RESTORE_INSTANTS}) r ON r.child_id = m.child_id
      WHERE m.removed_at IS NULL OR m.removed_at BETWEEN r.t_from AND r.t_to ORDER BY 1)`;

const RESTORE_HEAD = `DO $ho$
DECLARE
  a constant jsonb := pg_catalog.current_setting('masi_ho.args')::jsonb;
  v_ea constant uuid := (a ->> 'ea_id')::uuid;
  v_ns constant uuid := '09dcf4b2-6c53-4c46-917f-33bc7f2df4d2';
  v_children constant uuid[] := ARRAY(SELECT DISTINCT x::uuid
    FROM pg_catalog.jsonb_array_elements_text(coalesce(a -> 'child_ids', '[]'::jsonb)) x ORDER BY 1);
  v_lock_classes uuid[];
  v_lock_groups uuid[];
  v_removals jsonb := '[]';
  v_actions jsonb := '[]';
  v_notes jsonb := '[]';
  v_refusals jsonb := '[]';
  v_planned jsonb;
  v_action jsonb;
  v_row jsonb;
  v_near jsonb;
  v_later jsonb;
  v_child uuid;
  v_c public.children%ROWTYPE;
  v_from timestamptz;
  v_to timestamptz;
  v_det uuid;
  v_conflict uuid;
  v_key text;
  v_n integer;
BEGIN
`;

const RESTORE_LOCKS = `
  PERFORM 1 FROM public.children WHERE id = ANY (v_children) ORDER BY id FOR UPDATE;
  v_lock_classes := ${RESTORE_CLASSES};
  PERFORM 1 FROM public.classes WHERE id = ANY (v_lock_classes) ORDER BY id FOR UPDATE;
  v_lock_groups := ${RESTORE_GROUPS};
  PERFORM 1 FROM public.groups WHERE id = ANY (v_lock_groups) ORDER BY id FOR UPDATE;
  IF NOT (${RESTORE_CLASSES} <@ v_lock_classes AND ${RESTORE_GROUPS} <@ v_lock_groups) THEN
    RAISE EXCEPTION 'ho_lifecycle_retry: the classes or groups of these children changed while locking; run the command again'
      USING ERRCODE = '40001';
  END IF;
`;

// A reopened row must not make two open rows where only one may be: the active-row unique
// indexes (one open delivery row per (EA, child), always true here because there is none; one open
// enrolment per (child, programme); one open class membership per (child, academic year); one open
// group membership per (child, grouping version)), and one open membership per (child, group),
// which no index enforces (groups made in the app have no grouping version) but the daily check
// reports as duplicate_active_group_membership. v_planned catches two rows of the plan with the
// same key.
const restoreConflict = (table, keyName, keyExpr, otherSql, rule) => `
      v_key := '${table}:${keyName}:' || (${keyExpr});
      v_conflict := NULL;
      IF (${keyExpr}) IS NOT NULL THEN
        SELECT o.id INTO v_conflict FROM public.${table} o WHERE ${otherSql} ORDER BY o.id LIMIT 1;
        v_conflict := coalesce(v_conflict, (v_planned ->> v_key)::uuid);
      END IF;
      IF v_conflict IS NOT NULL THEN
        v_refusals := v_refusals || jsonb_build_array(jsonb_build_object('code', 'active_row_conflict', 'child_id', v_child,
          'table', '${table}', 'id', v_row -> 'id', 'conflicting_id', v_conflict, 'rule', '${rule}'));
        CONTINUE;
      END IF;
      IF v_key IS NOT NULL THEN
        v_planned := v_planned || jsonb_build_object(v_key, v_row -> 'id');
      END IF;`;

const RESTORE_BODY = `
  FOREACH v_child IN ARRAY v_children LOOP
    SELECT * INTO v_c FROM public.children WHERE id = v_child;
    IF NOT FOUND THEN
      v_refusals := v_refusals || jsonb_build_array(jsonb_build_object('code', 'child_not_found', 'child_id', v_child));
      CONTINUE;
    END IF;
    SELECT r.t_from, r.t_to INTO v_from, v_to FROM (${RESTORE_INSTANTS}) r WHERE r.child_id = v_child;
    v_removals := v_removals || jsonb_build_array(jsonb_build_object('child_id', v_child,
      'name', concat_ws(' ', v_c.first_name, v_c.last_name), 'removed_at', v_from, 'removed_until', v_to,
      'archived', v_c.archived_at IS NOT NULL, 'archived_by_user_id', v_c.archived_by_user_id,
      'archive_reason', v_c.archive_reason));

    -- The EA's delivery row: the open one (at most one), else the one that ended last inside the
    -- removal window, else the most recently ended one (refused below); the app's deterministic
    -- row first on a tie.
    v_det := extensions.uuid_generate_v5(v_ns, pg_catalog.concat_ws(pg_catalog.chr(31),
      'child_ea_assignments', v_ea::text, v_child::text));
    SELECT to_jsonb(r) INTO v_row FROM (
      SELECT id, user_id AS ea_user_id, child_id, assigned_at AS started_at, unassigned_at AS ended_at, row_version
      FROM public.child_ea_assignments WHERE user_id = v_ea AND child_id = v_child
      ORDER BY unassigned_at IS NOT NULL, (unassigned_at BETWEEN v_from AND v_to) IS NOT TRUE,
        unassigned_at DESC, id <> v_det, id LIMIT 1) r;
    IF v_row IS NULL THEN
      v_refusals := v_refusals || jsonb_build_array(jsonb_build_object('code', 'ea_never_held_child',
        'child_id', v_child, 'ea_user_id', v_ea));
      CONTINUE;
    END IF;

    -- An archive is undone only for the EA whose removal made it: archived_by_user_id is that
    -- EA, or (data from before the server batch) it is unset and that EA's delivery row ended
    -- at exactly the archive instant.
    IF v_c.archived_at IS NOT NULL AND v_c.archived_by_user_id IS DISTINCT FROM v_ea
      AND NOT (v_c.archived_by_user_id IS NULL AND EXISTS (SELECT 1 FROM public.child_ea_assignments e
        WHERE e.child_id = v_child AND e.user_id = v_ea AND e.unassigned_at = v_c.archived_at)) THEN
      v_refusals := v_refusals || jsonb_build_array(jsonb_build_object('code', 'archived_by_another_ea',
        'child_id', v_child, 'archived_at', v_c.archived_at, 'archived_by_user_id', v_c.archived_by_user_id,
        'hint', CASE WHEN v_c.archived_by_user_id IS NULL
          THEN 'this archive is not this EA''s removal; record an MA-BUG and ask Jim'
          ELSE 'that EA''s Delete child archived it: restore that EA first, then this one' END));
      CONTINUE;
    END IF;

    IF v_row ->> 'ended_at' IS NULL THEN
      IF v_c.archived_at IS NOT NULL THEN
        -- Archived while the EA still holds it: the phone has not finished sending the removal.
        v_refusals := v_refusals || jsonb_build_array(jsonb_build_object('code', 'removal_not_finished',
          'child_id', v_child, 'archived_at', v_c.archived_at,
          'hint', 'wait until the EA''s phone has synced the removal, then run the dry run again'));
      ELSE
        -- Nothing to undo (or a rerun after a lost response).
        v_actions := v_actions || jsonb_build_array(v_row || jsonb_build_object('action', 'already_active',
          'table', 'child_ea_assignments', 'det_id', v_det));
      END IF;
      CONTINUE;
    END IF;

    -- Every removal restore undoes ended the EA's own delivery row inside its window. When the
    -- archive (or, for a live child, a later end of a group membership of a group the EA held or
    -- created and nobody else held) is not matched by that end, the EA's delivery had already
    -- ended (a Head Office handover or end-delivery) and the removal was the app's creator Delete
    -- child: restore cannot tell which rows are the removal's, and reopening the delivery row
    -- would undo Head Office's change. Refuse.
    v_later := NULL;
    IF v_c.archived_at IS NULL THEN
      SELECT jsonb_build_object('id', m.id, 'ended_at', m.removed_at) INTO v_later
      FROM public.child_group_memberships m JOIN public.groups g ON g.id = m.group_id
      WHERE m.child_id = v_child AND m.removed_at > v_to
        AND (EXISTS (SELECT 1 FROM public.group_ea_assignments ga
              WHERE ga.group_id = m.group_id AND ga.ea_user_id = v_ea AND ga.assigned_at <= m.removed_at
                AND (ga.unassigned_at IS NULL OR ga.unassigned_at >= m.removed_at))
          OR (g.created_by = v_ea AND NOT EXISTS (SELECT 1 FROM public.group_ea_assignments ga
              WHERE ga.group_id = m.group_id AND ga.ea_user_id <> v_ea AND ga.assigned_at <= m.removed_at
                AND (ga.unassigned_at IS NULL OR ga.unassigned_at >= m.removed_at))))
      ORDER BY m.removed_at DESC, m.id LIMIT 1;
    END IF;
    IF v_later IS NOT NULL OR (v_row ->> 'ended_at')::timestamptz NOT BETWEEN v_from AND v_to THEN
      v_refusals := v_refusals || jsonb_build_array(jsonb_build_object('code', 'delivery_not_part_of_removal',
        'child_id', v_child, 'id', v_row -> 'id', 'delivery_ended_at', v_row -> 'ended_at',
        'removed_at', coalesce(v_later -> 'ended_at', to_jsonb(v_from)), 'membership_id', v_later -> 'id',
        'hint', 'this EA''s removal did not end their delivery of the child, which had already ended at delivery_ended_at (for example a Head Office handover or end-delivery); record an MA-BUG with this output and ask Jim'));
      CONTINUE;
    END IF;

    v_actions := v_actions || jsonb_build_array(v_row || jsonb_build_object('action', 'reopen',
      'table', 'child_ea_assignments', 'det_id', v_det,
      'gap', jsonb_build_object('from', v_row -> 'ended_at', 'to', pg_catalog.now(),
        'hours', round((extract(epoch FROM pg_catalog.now() - (v_row ->> 'ended_at')::timestamptz) / 3600)::numeric, 1))));
    IF v_c.archived_at IS NOT NULL THEN
      v_actions := v_actions || jsonb_build_array(jsonb_build_object('action', 'unarchive', 'table', 'children',
        'id', v_child, 'child_id', v_child, 'archived_at', v_c.archived_at,
        'archived_by_user_id', v_c.archived_by_user_id, 'archive_reason', v_c.archive_reason, 'row_version', v_c.row_version));
    END IF;

    -- Every enrolment and class or group membership of the child ended inside the removal window.
    v_planned := '{}';
    FOR v_row IN
      SELECT jsonb_build_object('action', 'reopen', 'table', 'child_programme_enrollments', 'id', e.id,
        'child_id', e.child_id, 'programme_id', e.programme_id, 'programme_code', p.code,
        'started_at', e.enrolled_at, 'ended_at', e.ended_at, 'row_version', e.row_version)
      FROM public.child_programme_enrollments e JOIN public.programmes p ON p.id = e.programme_id
      WHERE e.child_id = v_child AND e.ended_at BETWEEN v_from AND v_to ORDER BY e.id
    LOOP${restoreConflict('child_programme_enrollments', 'programme', "v_row ->> 'programme_id'",
    "o.child_id = v_child AND o.programme_id = (v_row ->> 'programme_id')::uuid AND o.ended_at IS NULL",
    'unique index idx_child_programme_enrollments_active_unique')}
      v_actions := v_actions || jsonb_build_array(v_row);
    END LOOP;
    FOR v_row IN
      SELECT jsonb_build_object('action', 'reopen', 'table', 'child_class_memberships', 'id', m.id,
        'child_id', m.child_id, 'class_id', m.class_id, 'class_name', cl.name, 'academic_year_id', m.academic_year_id,
        'started_at', m.enrolled_at, 'ended_at', m.exited_at, 'row_version', m.row_version,
        'archived', cl.archived_at IS NOT NULL)
      FROM public.child_class_memberships m JOIN public.classes cl ON cl.id = m.class_id
      WHERE m.child_id = v_child AND m.exited_at BETWEEN v_from AND v_to ORDER BY m.id
    LOOP
      IF (v_row ->> 'archived')::boolean THEN
        v_notes := v_notes || jsonb_build_array(jsonb_build_object('code', 'class_archived_skipped', 'child_id', v_child,
          'table', 'child_class_memberships', 'id', v_row -> 'id', 'class_id', v_row -> 'class_id',
          'class_name', v_row -> 'class_name'));
        CONTINUE;
      END IF;${restoreConflict('child_class_memberships', 'year', "v_row ->> 'academic_year_id'",
    "o.child_id = v_child AND o.academic_year_id = (v_row ->> 'academic_year_id')::uuid AND o.exited_at IS NULL",
    'unique index idx_child_class_memberships_active_unique')}
      v_actions := v_actions || jsonb_build_array(v_row - 'archived');
    END LOOP;
    FOR v_row IN
      SELECT jsonb_build_object('action', 'reopen', 'table', 'child_group_memberships', 'id', m.id,
        'child_id', m.child_id, 'group_id', m.group_id, 'group_name', g.name, 'grouping_version_id', m.grouping_version_id,
        'started_at', m.joined_at, 'ended_at', m.removed_at, 'row_version', m.row_version,
        'archived', g.archived_at IS NOT NULL)
      FROM public.child_group_memberships m JOIN public.groups g ON g.id = m.group_id
      WHERE m.child_id = v_child AND m.removed_at BETWEEN v_from AND v_to ORDER BY m.id
    LOOP
      IF (v_row ->> 'archived')::boolean THEN
        v_notes := v_notes || jsonb_build_array(jsonb_build_object('code', 'group_archived_skipped', 'child_id', v_child,
          'table', 'child_group_memberships', 'id', v_row -> 'id', 'group_id', v_row -> 'group_id',
          'group_name', v_row -> 'group_name'));
        CONTINUE;
      END IF;${restoreConflict('child_group_memberships', 'version', "v_row ->> 'grouping_version_id'",
    "o.child_id = v_child AND o.grouping_version_id = (v_row ->> 'grouping_version_id')::uuid AND o.removed_at IS NULL",
    'unique index idx_child_group_memberships_active_by_version')}${restoreConflict('child_group_memberships', 'group',
    "v_row ->> 'group_id'", "o.child_id = v_child AND o.group_id = (v_row ->> 'group_id')::uuid AND o.removed_at IS NULL",
    'one open membership per child and group (daily check duplicate_active_group_membership)')}
      v_actions := v_actions || jsonb_build_array(v_row - 'archived');
    END LOOP;

    -- Rows ended within an hour of the removal window but outside it: a phone with a wrong clock
    -- (the guard clamps each of its ends to the server's now as it lands) or a separate change.
    -- Listed, never reopened. seconds_from_t is measured from the nearer edge of the window.
    SELECT coalesce(jsonb_agg(jsonb_build_object('table', n.tbl, 'id', n.id, 'ended_at', n.ended_at,
        'seconds_from_t', round(extract(epoch FROM n.ended_at - CASE WHEN n.ended_at < v_from THEN v_from ELSE v_to END)::numeric, 1))
        ORDER BY n.ended_at, n.id), '[]'::jsonb)
      INTO v_near
      FROM (
        SELECT 'child_programme_enrollments' AS tbl, e.id, e.ended_at FROM public.child_programme_enrollments e
          WHERE e.child_id = v_child AND e.ended_at NOT BETWEEN v_from AND v_to
            AND e.ended_at BETWEEN v_from - interval '1 hour' AND v_to + interval '1 hour'
        UNION ALL SELECT 'child_class_memberships', m.id, m.exited_at FROM public.child_class_memberships m
          WHERE m.child_id = v_child AND m.exited_at NOT BETWEEN v_from AND v_to
            AND m.exited_at BETWEEN v_from - interval '1 hour' AND v_to + interval '1 hour'
        UNION ALL SELECT 'child_group_memberships', m.id, m.removed_at FROM public.child_group_memberships m
          WHERE m.child_id = v_child AND m.removed_at NOT BETWEEN v_from AND v_to
            AND m.removed_at BETWEEN v_from - interval '1 hour' AND v_to + interval '1 hour') n;
    IF jsonb_array_length(v_near) > 0 THEN
      v_notes := v_notes || jsonb_build_array(jsonb_build_object('code', 'near_miss_not_reopened', 'child_id', v_child,
        'removed_at', v_from, 'rows', v_near,
        'hint', 'ended within an hour of the removal but not at the same instant; check each one, restore does not reopen them'));
    END IF;
  END LOOP;
`;

const RESTORE_CHANGES = `
  IF jsonb_array_length(v_refusals) > 0 THEN
    RAISE EXCEPTION 'ho_lifecycle_refused' USING DETAIL = v_refusals::text;
  END IF;
  FOR v_action IN SELECT value FROM pg_catalog.jsonb_array_elements(v_actions) WHERE value ->> 'action' = 'unarchive' LOOP
    UPDATE public.children SET archived_at = NULL, archived_by_user_id = NULL, archive_reason = NULL
      WHERE id = (v_action ->> 'id')::uuid AND archived_at = (v_action ->> 'archived_at')::timestamptz;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'ho_lifecycle_retry: children % changed while applying; run the command again',
        v_action ->> 'id' USING ERRCODE = '40001';
    END IF;
  END LOOP;
  FOR v_action IN SELECT value FROM pg_catalog.jsonb_array_elements(v_actions) WHERE value ->> 'action' = 'reopen' LOOP
    IF v_action ->> 'table' = 'child_ea_assignments' THEN
      UPDATE public.child_ea_assignments SET unassigned_at = NULL
        WHERE id = (v_action ->> 'id')::uuid AND unassigned_at = (v_action ->> 'ended_at')::timestamptz;
    ELSIF v_action ->> 'table' = 'child_programme_enrollments' THEN
      UPDATE public.child_programme_enrollments SET ended_at = NULL
        WHERE id = (v_action ->> 'id')::uuid AND ended_at = (v_action ->> 'ended_at')::timestamptz;
    ELSIF v_action ->> 'table' = 'child_class_memberships' THEN
      UPDATE public.child_class_memberships SET exited_at = NULL
        WHERE id = (v_action ->> 'id')::uuid AND exited_at = (v_action ->> 'ended_at')::timestamptz;
    ELSE
      UPDATE public.child_group_memberships SET removed_at = NULL
        WHERE id = (v_action ->> 'id')::uuid AND removed_at = (v_action ->> 'ended_at')::timestamptz;
    END IF;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'ho_lifecycle_retry: % % changed while applying; run the command again',
        v_action ->> 'table', v_action ->> 'id' USING ERRCODE = '40001';
    END IF;
  END LOOP;
`;

const RESTORE_TAIL = `
  PERFORM pg_catalog.set_config('masi_ho.result', jsonb_build_object(
    'server_now', pg_catalog.now(), 'read_only', pg_catalog.current_setting('transaction_read_only'),
    'removals', v_removals, 'actions', v_actions, 'notes', v_notes, 'refusals', v_refusals)::text, true);
END
$ho$;`;

const RESTORE_READBACK_SQL = `BEGIN READ ONLY;
SET LOCAL statement_timeout = '30s';
WITH ids AS (SELECT x::uuid AS id FROM pg_catalog.jsonb_array_elements_text((:'args')::jsonb -> 'ids') x)
SELECT pg_catalog.jsonb_build_object(
  'read_only', pg_catalog.current_setting('transaction_read_only'),
  'rows', coalesce((SELECT pg_catalog.jsonb_agg(r ORDER BY r."table", r.id) FROM (
    SELECT 'children' AS "table", id, NULL::timestamptz AS started_at, archived_at AS ended_at,
      archived_by_user_id, archive_reason, row_version
      FROM public.children WHERE id IN (SELECT id FROM ids)
    UNION ALL
    SELECT 'child_ea_assignments', id, assigned_at, unassigned_at, NULL::uuid, NULL::text, row_version
      FROM public.child_ea_assignments WHERE id IN (SELECT id FROM ids)
    UNION ALL
    SELECT 'child_programme_enrollments', id, enrolled_at, ended_at, NULL::uuid, NULL::text, row_version
      FROM public.child_programme_enrollments WHERE id IN (SELECT id FROM ids)
    UNION ALL
    SELECT 'child_class_memberships', id, enrolled_at, exited_at, NULL::uuid, NULL::text, row_version
      FROM public.child_class_memberships WHERE id IN (SELECT id FROM ids)
    UNION ALL
    SELECT 'child_group_memberships', id, joined_at, removed_at, NULL::uuid, NULL::text, row_version
      FROM public.child_group_memberships WHERE id IN (SELECT id FROM ids)) r), '[]'::jsonb));
ROLLBACK;`;

const buildProgram = (kind, { apply = false } = {}) => {
  if (kind === 'resolve') return RESOLVE_SQL;
  if (kind === 'readback') return READBACK_SQL;
  if (kind === 'restore_readback') return RESTORE_READBACK_SQL;
  const parts = {
    plan: [PLAN_HEAD, apply ? PLAN_LOCKS : '', PLAN_BODY, apply ? PLAN_CHANGES : '', PLAN_TAIL],
    restore: [RESTORE_HEAD, apply ? RESTORE_LOCKS : '', RESTORE_BODY, apply ? RESTORE_CHANGES : '', RESTORE_TAIL],
  }[kind];
  if (!parts) throw new Error(`Unknown program ${kind}.`);
  return [
    apply ? 'BEGIN;' : 'BEGIN READ ONLY;',
    ...(apply ? ["SET LOCAL lock_timeout = '10s';"] : []),
    "SET LOCAL statement_timeout = '30s';",
    "SET LOCAL masi_ho.args = :'args';",
    parts.join(''),
    "SELECT pg_catalog.current_setting('masi_ho.result');",
    apply ? 'COMMIT;' : 'ROLLBACK;',
  ].join('\n');
};

const single = (matches, label) => {
  if (!Array.isArray(matches) || matches.length !== 1) {
    throw new Error(matches?.length > 1
      ? `Ambiguous email for ${label}: more than one Auth user matches.`
      : `No Auth user matches the ${label} email.`);
  }
  const [user] = matches;
  if (!UUID.test(user.id) || user.has_profile !== true) throw new Error(`The ${label} has no valid EA profile.`);
  return user;
};

const assertDeterministicIds = (plan) => {
  for (const action of plan.actions) {
    const keys = DETERMINISTIC_KEYS[action.table];
    if (!keys) continue;
    const expected = deterministicId(action.table, ...keys(action));
    // restore child reports the id its SQL derived (det_id) and prefers that row; it may reopen
    // an older row with its own id when the app's row never existed.
    const derived = action.det_id !== undefined ? action.det_id
      : (['insert', 'reopen'].includes(action.action) ? action.id : expected);
    if (derived !== expected) {
      throw new Error(`deterministic_id_mismatch: ${action.table} ${derived} is not the app's id for this pair; nothing was applied by this check.`);
    }
  }
};

const CHANGE_ACTIONS = ['end', 'reopen', 'insert', 'already_active'];
const isConfirmed = (actions, rows) => actions.filter(action => CHANGE_ACTIONS.includes(action.action)).every((action) => {
  const row = rows.find(candidate => candidate.table === action.table && candidate.id === action.id);
  if (!row) return false;
  if (action.action === 'end') return row.unassigned_at !== null && row.row_version === action.row_version;
  if (action.action === 'reopen') {
    return row.unassigned_at === null && row.row_version === action.row_version && row.assigned_at === action.assigned_at;
  }
  if (action.action === 'insert') return row.unassigned_at === null && row.row_version === 1;
  return row.unassigned_at === null;
});

// restore child: every reopened row is open with its start and row_version unchanged, and an
// unarchived child has no archive left.
const RESTORE_CHANGE_ACTIONS = ['reopen', 'unarchive', 'already_active'];
const isRestoreConfirmed = (actions, rows) => actions.filter(action => RESTORE_CHANGE_ACTIONS.includes(action.action)).every((action) => {
  const row = rows.find(candidate => candidate.table === action.table && candidate.id === action.id);
  if (!row || row.ended_at !== null) return false;
  if (action.action === 'already_active') return true;
  if (row.row_version !== action.row_version) return false;
  if (action.action === 'unarchive') return row.archived_by_user_id === null && row.archive_reason === null;
  return row.started_at === action.started_at;
});

const runCli = (argv, {
  cwd = process.cwd(), env = process.env, spawnSync = spawnProcess, log = console.log,
  psql, randomUUID = crypto.randomUUID,
} = {}) => {
  const options = parseArgs(argv);
  const connection = buildConnectionString({ host: env.MASI_DB_POOLER_HOST || DEFAULT_HOST });
  const filePath = path.join(cwd, '.env.local');
  if (!fs.existsSync(filePath)) throw new Error('.env.local with SUPABASE_DB_PASSWORD_SQLITE is required.');
  const fileEnv = parseEnvContent(fs.readFileSync(filePath, 'utf8'), { filename: '.env.local' });
  const password = fileEnv.SUPABASE_DB_PASSWORD_SQLITE;
  if (!password || password.includes('\0')) throw new Error('SUPABASE_DB_PASSWORD_SQLITE is required in .env.local.');
  const redact = value => [password, JSON.stringify(password).slice(1, -1)]
    .reduce((text, secret) => text.split(secret).join('[redacted]'), String(value));
  const print = value => log(redact(JSON.stringify(value)));
  try {
    const command = psql || resolvePsql(env);
    // Discard inherited libpq routing/service/options variables and all Supabase credentials.
    const childEnv = Object.fromEntries(['PATH', 'HOME', 'USER', 'LOGNAME', 'LANG', 'LC_ALL', 'TMPDIR']
      .filter(key => env[key] !== undefined).map(key => [key, env[key]]));
    Object.assign(childEnv, { PGPASSWORD: password, PGCONNECT_TIMEOUT: '10', PGAPPNAME: 'masi-ho-lifecycle' });
    const query = (sql, args, { readOnly = true } = {}) => {
      // psql expands :'args' in stdin scripts, not SQL passed with -c.
      const result = spawnSync(command, ['-X', '-w', '-v', 'ON_ERROR_STOP=1', '-Atq', '--dbname', connection,
        '-v', `args=${JSON.stringify(args)}`, '-f', '-'], {
        input: sql, encoding: 'utf8', env: childEnv, timeout: 120_000, maxBuffer: 8 * 1024 * 1024,
      });
      if (result.error || result.status !== 0) {
        throw new Error(`psql failed: ${result.stderr || result.error?.message || 'non-zero exit'}`);
      }
      let value;
      try { value = JSON.parse(result.stdout.trim()); }
      catch { throw new Error('psql returned an unexpected result; no confirmation available.'); }
      if (value?.read_only !== (readOnly ? 'on' : 'off')) {
        throw new Error(readOnly ? 'The database did not confirm a read-only transaction.' : 'The apply transaction was read-only.');
      }
      return value;
    };

    const label = options.command === 'end-delivery' ? 'end-delivery' : `${options.command} ${options.scope}`;
    print({ project_ref: PROJECT_REF, command: label, mode: options.apply ? 'apply' : 'dry_run' });

    const emails = options.command === 'handover' ? { from: options.from, to: options.to } : { ea: options.ea };
    const entityIds = [...(options.children ?? []), options.class, options.group].filter(Boolean);
    const resolved = query(RESOLVE_SQL, { emails, programme_code: options.programme ?? null, ids: entityIds });
    const users = Object.fromEntries(Object.keys(emails).map(key => [key, single(resolved.users?.[key], key)]));
    if (users.from && users.from.id === users.to.id) throw new Error('--from and --to resolve to the same EA.');
    const restore = options.command === 'restore';
    const program = restore ? 'restore' : 'plan';
    const opener = options.command === 'handover' ? users.to : (['reopen', 'restore'].includes(options.command) ? users.ea : null);
    if (opener?.suspended) throw new Error(`${opener.email} is suspended; restore them before granting access.`);
    let programme = null;
    if (options.programme) {
      if (!Array.isArray(resolved.programmes) || resolved.programmes.length !== 1) {
        throw new Error(`No programme has the code ${options.programme}.`);
      }
      [programme] = resolved.programmes;
    }
    const entities = Array.isArray(resolved.entities) ? resolved.entities : [];
    print({ targets: { ...users, ...(programme ? { programme } : {}),
      entities: entityIds.map(entityId => entities.find(entity => entity.id === entityId) ?? { id: entityId, found: false }),
      ...(options.delivery ? { delivery: options.delivery } : {}), reason: options.reason, operator: options.operator } });

    const args = {
      command: options.command, scope: options.scope, reason: options.reason, operator: options.operator,
      from_id: users.from?.id, to_id: users.to?.id, ea_id: users.ea?.id, child_ids: options.children,
      class_id: options.class, programme_id: programme?.id, group_id: options.group, delivery: options.delivery,
    };
    const plan = query(buildProgram(program, { apply: false }), args);
    assertDeterministicIds(plan);
    print({ plan });
    if (plan.refusals.length) {
      throw new Error(`refused: ${plan.refusals.map(refusal => refusal.code).join(', ')}; nothing was changed.`);
    }
    if (!options.apply) return 0;

    const applied = query(buildProgram(program, { apply: true }), {
      ...args, ...(options.scope === 'group' ? { fresh_id: randomUUID() } : {}),
    }, { readOnly: false });
    print({ applied });
    assertDeterministicIds(applied);
    const changes = restore ? RESTORE_CHANGE_ACTIONS : CHANGE_ACTIONS;
    const ids = applied.actions.filter(action => changes.includes(action.action)).map(action => action.id);
    const after = query(restore ? RESTORE_READBACK_SQL : READBACK_SQL, { ids });
    print({ after: after.rows });
    if (applied.refusals.length || !(restore ? isRestoreConfirmed : isConfirmed)(applied.actions, after.rows)) {
      throw new Error('read_back_unconfirmed: rerun this command without --apply and inspect the plan; the transaction may have committed.');
    }
    print({ confirmed: true });
    return 0;
  } catch (error) {
    throw new Error(redact(error.message));
  }
};

if (require.main === module) {
  try { process.exitCode = runCli(process.argv.slice(2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}

module.exports = { PROJECT_REF, USAGE, parseArgs, deterministicId, buildProgram, runCli };
