// Fetch-level PostgREST stand-in for the lifecycle-safety OTA tests (plan O2,
// docs/superpowers/plans/2026-11-04-lifecycle-safety.md). Real supabase-js runs on top of it
// through the signed-in handle, so the requests are the exact wire shapes the app sends.
//
// It models the server contract AFTER the lifecycle server batch (ADR-0014), which the OTA
// requires (plan D10):
// - RLS INSERT checks per the migration files for the child relationship family, sessions and
//   attendees (`current_user_can_write_for_child` arms: direct, class path, group path);
// - S2: history (attendees, mastery, Battery Runs, assessments) lands when the EA held a grant on
//   the day. All test activity happens on one day, so "held on the day" is "held at any time";
// - S3: `delete_child_if_no_history` never hard-deletes, always returns true, ends only the
//   caller's grants (direct assignment, and memberships in groups the caller holds, or created and
//   nobody else holds, per the corrected server rule of 2026-11-05) and archives the child only
//   when no other EA still holds it;
// - S1: an EA write never clears or moves an end that is already set;
// - `idx_child_group_memberships_active_by_version` (23505);
// - server-side ends (the Delete child RPC, Head Office) never change `row_version`: only a phone's
//   send-time stamp moves it (contract map "Row versions");
// - the pull: the roster, class and acknowledgment reads the app makes (`get_reconcile_acknowledgments`
//   per 20261023120000, and PostgREST GETs with embeds, `!inner`, eq/is/in filters, order, limit).
//   Every pull query scopes itself to the caller's own grants, so the fake applies the query's
//   filters, not SELECT RLS. It returns each stored column, and null for the nullable lifecycle
//   columns listed in NULL_COLUMNS when unset (PostgREST returns every column, nulls included);
// - Head Office `restore child` (`restoreChild`, work order 5): reopens in place what one removal
//   ended, with the same ids, starts and row_version.
// Every request is recorded in the PostgREST wire shape used by
// docs/bugs/evidence/MA-BUG-20261104-001/repro-client-archive-chain/pg-replay.cjs, so G1 can
// replay a chain into PostgreSQL with the real migrations.

import { childEaAssignmentDomainId } from '../src/db/repositories/domainRepositoryUtils';

// The nullable columns PostgREST returns as null when the fake stores them unset.
const NULL_COLUMNS = {
  children: ['class_id', 'hidden_at', 'archived_at', 'archived_by_user_id', 'archive_reason'],
  classes: ['archived_at', 'archived_by_user_id', 'archive_reason'],
  groups: ['archived_at', 'archived_by_user_id', 'archive_reason'],
  child_ea_assignments: ['unassigned_at', 'handover_reason'],
  class_ea_assignments: ['unassigned_at', 'handover_reason'],
  group_ea_assignments: ['unassigned_at', 'handover_reason'],
  child_programme_enrollments: ['ended_at'],
  child_class_memberships: ['exited_at'],
  child_group_memberships: ['removed_at', 'grouping_version_id'],
  staff_programme_assignments: ['ended_at'],
};
// PostgREST resource embedding along the foreign keys the pull queries use.
const EMBEDS = {
  child_ea_assignments: { children: { one: 'child_id' } },
  child_class_memberships: { classes: { one: 'class_id' }, academic_years: { one: 'academic_year_id' } },
  class_ea_assignments: { classes: { one: 'class_id' } },
  children: { child_ea_assignments: { many: 'child_id' }, child_programme_enrollments: { many: 'child_id' } },
  groups: { group_ea_assignments: { many: 'group_id' } },
  classes: { class_ea_assignments: { many: 'class_id' } },
};

const END_COLUMNS = {
  child_ea_assignments: 'unassigned_at',
  class_ea_assignments: 'unassigned_at',
  group_ea_assignments: 'unassigned_at',
  child_programme_enrollments: 'ended_at',
  child_class_memberships: 'exited_at',
  child_group_memberships: 'removed_at',
  children: 'archived_at',
  classes: 'archived_at',
  groups: 'archived_at',
};
const INSERT_OR_IGNORE = new Set(['child_ea_assignments', 'class_ea_assignments', 'group_ea_assignments', 'sessions']);

const rlsError = (table) => ({
  status: 403,
  body: { code: '42501', details: null, hint: null, message: `new row violates row-level security policy for table "${table}"` },
});
const fkError = (table, parent) => ({
  status: 409,
  body: { code: '23503', details: null, hint: null, message: `insert or update on table "${table}" violates foreign key constraint (${parent})` },
});

export const createLifecycleServer = ({ actor, now = () => new Date().toISOString() }) => {
  const rows = {};
  const t = (name) => { if (!rows[name]) rows[name] = new Map(); return rows[name]; };
  const all = (name) => [...t(name).values()];
  const log = [];
  const receipts = new Map();
  const state = { down: false, refuse: null };

  const directActive = (childId, userId) => all('child_ea_assignments')
    .some(r => r.child_id === childId && r.user_id === userId && r.unassigned_at == null);
  const classPathActive = (childId, userId) => all('class_ea_assignments').some(cls => (
    cls.ea_user_id === userId && cls.unassigned_at == null
    && all('child_class_memberships').some(m => m.class_id === cls.class_id && m.child_id === childId && m.exited_at == null)
  ));
  const groupPathActive = (childId, userId) => all('group_ea_assignments').some(g => (
    g.ea_user_id === userId && g.unassigned_at == null
    && all('child_group_memberships').some(m => m.group_id === g.group_id && m.child_id === childId && m.removed_at == null)
  ));
  const writeForChild = (childId, userId = actor) => (
    directActive(childId, userId) || classPathActive(childId, userId) || groupPathActive(childId, userId)
  );
  // S2 (one-day approximation of private.user_held_grant_on): a grant row ever existed.
  const heldEver = (childId, userId = actor) => (
    all('child_ea_assignments').some(r => r.child_id === childId && r.user_id === userId)
    || all('class_ea_assignments').some(cls => cls.ea_user_id === userId
      && all('child_class_memberships').some(m => m.class_id === cls.class_id && m.child_id === childId))
    || all('group_ea_assignments').some(g => g.ea_user_id === userId
      && all('child_group_memberships').some(m => m.group_id === g.group_id && m.child_id === childId))
  );
  const heldDirectEver = (childId) => all('child_ea_assignments').some(r => r.child_id === childId && r.user_id === actor);
  const writeForGroup = (groupId) => t('groups').get(groupId)?.created_by === actor
    || all('group_ea_assignments').some(r => r.group_id === groupId && r.ea_user_id === actor && r.unassigned_at == null);
  const accessClass = (classId) => {
    const cls = t('classes').get(classId);
    if (!cls) return false;
    return cls.created_by === actor
      || all('staff_programme_assignments').some(s => s.user_id === actor && s.school_id === cls.school_id && s.ended_at == null)
      || all('class_ea_assignments').some(r => r.class_id === classId && r.ea_user_id === actor);
  };
  const heldGroup = (groupId) => all('group_ea_assignments').some(r => r.group_id === groupId && r.ea_user_id === actor);
  const openProgramme = (programmeId) => all('staff_programme_assignments')
    .some(s => s.user_id === actor && s.programme_id === programmeId && s.ended_at == null);
  const holders = () => new Set([
    ...all('child_ea_assignments').map(r => r.user_id),
    ...all('class_ea_assignments').map(r => r.ea_user_id),
    ...all('group_ea_assignments').map(r => r.ea_user_id),
  ]);
  const otherActiveHolder = (childId) => [...holders()].some(user => user !== actor && writeForChild(childId, user));

  // INSERT WITH CHECK (RLS first, as PostgreSQL checks the policy before deferred FK checks).
  const insertCheck = (table, row) => {
    switch (table) {
      case 'children':
        if (row.created_by !== actor) return rlsError(table);
        if (row.class_id && !t('classes').has(row.class_id)) return fkError(table, 'classes');
        return null;
      case 'child_ea_assignments':
        if (row.user_id !== actor || row.created_by !== actor || t('children').get(row.child_id)?.created_by !== actor) return rlsError(table);
        return null;
      case 'child_programme_enrollments':
        return row.created_by === actor && writeForChild(row.child_id) ? null : rlsError(table);
      case 'child_class_memberships':
        return row.created_by === actor && writeForChild(row.child_id) && accessClass(row.class_id) ? null : rlsError(table);
      case 'child_group_memberships': {
        if (row.created_by !== actor || !writeForChild(row.child_id) || !writeForGroup(row.group_id)) return rlsError(table);
        const duplicate = row.removed_at == null && row.grouping_version_id != null && all(table).some(other => (
          other.id !== row.id && other.child_id === row.child_id
          && other.grouping_version_id === row.grouping_version_id && other.removed_at == null
        ));
        if (duplicate) {
          return { status: 409, body: { code: '23505', details: null, hint: null,
            message: 'duplicate key value violates unique constraint "idx_child_group_memberships_active_by_version"' } };
        }
        return null;
      }
      case 'class_ea_assignments':
      case 'group_ea_assignments':
        return row.ea_user_id === actor ? null : rlsError(table);
      case 'groups':
        return row.created_by === actor ? null : rlsError(table);
      case 'sessions':
        if (row.user_id !== actor || !openProgramme(row.programme_id)) return rlsError(table);
        if (row.group_id != null && !heldGroup(row.group_id)) return rlsError(table);
        return null;
      case 'session_attendees': {
        const session = t('sessions').get(row.session_id);
        if (!session || session.user_id !== actor) return rlsError(table);
        if (!writeForChild(row.child_id) && !heldEver(row.child_id)) return rlsError(table);
        if (row.group_id != null && !heldGroup(row.group_id)) return rlsError(table);
        return null;
      }
      default:
        return { status: 500, body: { code: 'NOT_MODELLED', message: `insert into ${table} not modelled` } };
    }
  };

  const updatePolicy = (table, row) => {
    switch (table) {
      case 'children': return row.created_by === actor || writeForChild(row.id);
      case 'child_programme_enrollments': return writeForChild(row.child_id);
      case 'child_class_memberships': return writeForChild(row.child_id) && accessClass(row.class_id);
      case 'child_group_memberships': return writeForChild(row.child_id) && writeForGroup(row.group_id);
      case 'child_ea_assignments': return row.user_id === actor;
      case 'class_ea_assignments':
      case 'group_ea_assignments': return row.ea_user_id === actor;
      case 'groups': return writeForGroup(row.id);
      case 'classes': return t('classes').get(row.id)?.created_by === actor
        || all('class_ea_assignments').some(r => r.class_id === row.id && r.ea_user_id === actor && r.unassigned_at == null);
      default: return null;
    }
  };

  // S1: an EA write never clears or moves an end that is already set.
  const keepEnd = (table, before, next) => {
    const column = END_COLUMNS[table];
    if (column && before?.[column] != null) next[column] = before[column];
    return next;
  };

  const upsert = (table, body, prefer) => {
    const proposed = Array.isArray(body) ? body : [body];
    const ignore = prefer.includes('resolution=ignore-duplicates') || INSERT_OR_IGNORE.has(table);
    for (const row of proposed) {
      const error = insertCheck(table, row);
      if (error) return { ...error, rowsAffected: 0 };
      const existing = t(table).get(row.id);
      if (existing && !ignore && !updatePolicy(table, existing)) return { ...rlsError(table), rowsAffected: 0 };
    }
    for (const row of proposed) {
      const existing = t(table).get(row.id);
      if (existing && ignore) continue;
      t(table).set(row.id, keepEnd(table, existing, { row_version: 1, ...existing, ...row }));
    }
    return { status: 201, body: undefined, rowsAffected: proposed.length };
  };

  const patch = (table, body, params) => {
    const id = (params.get('id') || '').replace(/^eq\./, '');
    const row = t(table).get(id);
    const using = row ? updatePolicy(table, row) : false;
    if (using === null) return { status: 500, body: { code: 'NOT_MODELLED', message: `update ${table} not modelled` } };
    if (!row || !using) return { status: 200, body: [], rowsAffected: 0 };
    const next = keepEnd(table, row, { ...row, ...body });
    t(table).set(id, next);
    return { status: 200, body: [{ id }], rowsAffected: 1 };
  };

  // A server-side end (SECURITY DEFINER) leaves row_version alone, as 20261105120300 does.
  const endRow = (table, row, at) => {
    const column = END_COLUMNS[table];
    if (row[column] == null) t(table).set(row.id, { ...row, [column]: at });
  };

  // S3: actor-scoped Delete child. Never a hard delete; always true when authorized.
  const deleteChild = (childId) => {
    const child = t('children').get(childId);
    if (!child) return { status: 200, body: true };
    const holdsNow = writeForChild(childId);
    if (!holdsNow && child.created_by !== actor) {
      if (heldDirectEver(childId) || child.archived_at != null) return { status: 200, body: true };
      return { status: 403, body: { code: '42501', details: null, hint: null, message: 'Child not in your delivery scope' } };
    }
    const at = now();
    for (const row of all('child_ea_assignments')) {
      if (row.child_id === childId && row.user_id === actor) endRow('child_ea_assignments', row, at);
    }
    // Memberships in groups the caller holds, or created and nobody else holds. A group the EA
    // created offline is ended even when the RPC lands before the EA's own assignment INSERT.
    const holdsGroup = (groupId) => all('group_ea_assignments')
      .some(r => r.group_id === groupId && r.ea_user_id === actor && r.unassigned_at == null);
    const othersHoldGroup = (groupId) => all('group_ea_assignments')
      .some(r => r.group_id === groupId && r.ea_user_id !== actor && r.unassigned_at == null);
    const endsMembership = (groupId) => holdsGroup(groupId)
      || (t('groups').get(groupId)?.created_by === actor && !othersHoldGroup(groupId));
    for (const row of all('child_group_memberships')) {
      if (row.child_id === childId && endsMembership(row.group_id)) endRow('child_group_memberships', row, at);
    }
    if (!otherActiveHolder(childId)) {
      for (const row of all('child_programme_enrollments')) if (row.child_id === childId) endRow('child_programme_enrollments', row, at);
      for (const row of all('child_class_memberships')) if (row.child_id === childId) endRow('child_class_memberships', row, at);
      if (child.archived_at == null) {
        t('children').set(childId, {
          ...t('children').get(childId), archived_at: at, archived_by_user_id: actor, archive_reason: 'removed_by_ea',
        });
      }
    }
    return { status: 200, body: true };
  };

  const rpc = (fn, args) => {
    if (fn === 'set_letter_mastery' || fn === 'set_skill_mastery') {
      if (!receipts.has(args.p_correction_id)) {
        if (!t('children').has(args.p_child_id) || !(directActive(args.p_child_id, actor) || heldDirectEver(args.p_child_id))) {
          return { status: 403, body: { code: '42501', details: null, hint: null, message: 'Active child delivery assignment required' } };
        }
        receipts.set(args.p_correction_id, { ...args, fn });
        const table = fn === 'set_letter_mastery' ? 'letter_mastery' : 'skill_mastery';
        const key = fn === 'set_letter_mastery' ? `${args.p_child_id}:${args.p_letter}:${args.p_language}` : `${args.p_child_id}:${args.p_step_key}`;
        t(table).set(key, { id: key, child_id: args.p_child_id, confirmed: args.p_confirmed, changed_at: args.p_changed_at,
          correction_id: args.p_correction_id, changed_by: actor });
      }
      const receipt = receipts.get(args.p_correction_id);
      return { status: 200, body: [{ outcome: 'applied', confirmed: receipt.p_confirmed, changed_at: receipt.p_changed_at,
        correction_id: receipt.p_correction_id, changed_by: actor }] };
    }
    if (fn === 'save_battery_run') {
      const run = args.p_run;
      if (t('battery_runs').has(run.id)) {
        t('battery_runs').set(run.id, { ...t('battery_runs').get(run.id), ...run });
        return { status: 200, body: 'updated' };
      }
      const classOk = run.class_id == null || all('child_class_memberships')
        .some(m => m.child_id === run.child_id && m.class_id === run.class_id);
      if (run.user_id !== actor || !t('children').has(run.child_id) || !openProgramme(run.programme_id)
        || !(writeForChild(run.child_id) || heldEver(run.child_id)) || !classOk) {
        return { status: 403, body: { code: '42501', details: null, hint: null, message: 'Battery Run not authorized' } };
      }
      t('battery_runs').set(run.id, { ...run });
      return { status: 200, body: 'inserted' };
    }
    if (fn === 'submit_assessment') {
      const assessment = args.p_assessment;
      if (t('assessments').has(assessment.id)) return { status: 200, body: 'already_present' };
      if (!t('children').has(assessment.child_id) || !(writeForChild(assessment.child_id) || heldEver(assessment.child_id))) {
        return { status: 403, body: { code: '42501', details: null, hint: null, message: 'Assessment not authorized' } };
      }
      if (assessment.battery_run_id && !t('battery_runs').has(assessment.battery_run_id)) return fkError('assessments', 'battery_runs');
      t('assessments').set(assessment.id, { ...assessment, items: args.p_items.length });
      return { status: 200, body: 'inserted' };
    }
    if (fn === 'delete_child_if_no_history') return deleteChild(args.p_child_id);
    if (fn === 'get_reconcile_acknowledgments') return { status: 200, body: reconcileAcknowledgments() };
    if (fn === 'report_mobile_support_incident_v2' || fn === 'report_mobile_support_incident') {
      t('mobile_support_incidents').set(String(t('mobile_support_incidents').size + 1), { ...args });
      return { status: 200, body: { status: 'inserted' } };
    }
    return { status: 404, body: { code: 'PGRST202', message: `rpc ${fn} not modelled` } };
  };

  // private.get_reconcile_acknowledgments (20261023120000): one snapshot of the caller's grants.
  const reconcileAcknowledgments = () => {
    const programme = all('staff_programme_assignments')
      .filter(s => s.user_id === actor && s.ended_at == null)
      .sort((a, b) => String(b.assigned_at).localeCompare(String(a.assigned_at)) || String(b.id).localeCompare(String(a.id)))[0];
    const programmeId = programme?.programme_id ?? null;
    const sorted = values => [...new Set(values)].sort();
    const childAssignments = all('child_ea_assignments').filter(r => r.user_id === actor && r.unassigned_at == null);
    const assignedChildIds = new Set(childAssignments.map(r => r.child_id));
    const openEnrollments = all('child_programme_enrollments')
      .filter(r => r.programme_id === programmeId && r.ended_at == null && assignedChildIds.has(r.child_id));
    const visibleChildIds = new Set(openEnrollments.map(r => r.child_id));
    const classAssignments = all('class_ea_assignments')
      .filter(r => r.ea_user_id === actor && r.programme_id === programmeId && r.unassigned_at == null);
    const classIds = new Set(classAssignments.map(r => r.class_id));
    const groupAssignments = all('group_ea_assignments').filter(r => r.ea_user_id === actor
      && r.programme_id === programmeId && r.unassigned_at == null && t('groups').get(r.group_id)?.programme_id === programmeId);
    const groupIds = new Set(groupAssignments.map(r => r.group_id));
    const openClassMemberships = all('child_class_memberships').filter(r => r.exited_at == null);
    return {
      schema_version: 1, complete: true, user_id: actor, generated_at: now(), active_programme_id: programmeId,
      child_ea_assignment_ids: sorted(childAssignments.map(r => r.id)),
      assigned_child_ids: sorted(assignedChildIds),
      visible_child_ids: sorted(visibleChildIds),
      child_programme_enrollment_ids: sorted(openEnrollments.map(r => r.id)),
      child_class_membership_ids: sorted(openClassMemberships.filter(r => visibleChildIds.has(r.child_id)).map(r => r.id)),
      class_ea_assignment_ids: sorted(classAssignments.map(r => r.id)),
      class_ids: sorted(classIds),
      roster_class_ids: sorted(classIds),
      roster_membership_ids: sorted(openClassMemberships.filter(r => classIds.has(r.class_id)).map(r => r.id)),
      group_ea_assignment_ids: sorted(groupAssignments.map(r => r.id)),
      group_ids: sorted(groupIds),
      child_group_membership_ids: sorted(all('child_group_memberships')
        .filter(r => r.removed_at == null && groupIds.has(r.group_id)).map(r => r.id)),
    };
  };

  // A PostgREST GET: `select` with one level of embeds (`name(*)`, `name!inner(cols)`), eq / is.null /
  // in filters on the table or an embed (`embed.column`), order and limit. Anything else is a 500,
  // so an unmodelled query fails loudly instead of returning a plausible empty result.
  const splitTopLevel = (text) => {
    const parts = [];
    let depth = 0;
    let current = '';
    for (const char of text) {
      if (char === '(') depth += 1;
      if (char === ')') depth -= 1;
      if (char === ',' && depth === 0) { parts.push(current); current = ''; } else current += char;
    }
    if (current) parts.push(current);
    return parts;
  };
  const fullRow = (table, row) => ({
    ...Object.fromEntries((NULL_COLUMNS[table] || []).map(column => [column, null])), ...row,
  });
  const project = (table, row, columns) => (columns.includes('*') ? fullRow(table, row)
    : Object.fromEntries(columns.map(column => [column, row[column] ?? null])));
  const matches = (row, filter) => {
    if (filter === 'is.null') return row != null && row.value == null;
    const value = row?.value;
    if (filter.startsWith('eq.')) return value != null && String(value) === filter.slice(3);
    if (filter.startsWith('in.(') && filter.endsWith(')')) {
      return filter.slice(4, -1).split(',').map(item => item.replace(/^"|"$/g, '')).includes(String(value));
    }
    throw new Error(`filter ${filter} not modelled`);
  };
  const select = (table, params) => {
    try {
      const items = splitTopLevel(params.get('select') || '*');
      const columns = items.filter(item => !item.includes('('));
      const embeds = items.filter(item => item.includes('(')).map((item) => {
        const [, name, inner, cols] = item.match(/^([a-z_]+)(!inner)?\((.*)\)$/) || [];
        const relation = EMBEDS[table]?.[name];
        if (!relation) throw new Error(`embed ${item} on ${table} not modelled`);
        return { name, inner: Boolean(inner), columns: cols.split(','), relation, filters: [] };
      });
      const filters = [];
      for (const [key, filter] of params.entries()) {
        if (['select', 'limit', 'order', 'offset'].includes(key)) continue;
        const [first, rest] = key.includes('.') ? key.split('.') : [null, key];
        const embed = first ? embeds.find(item => item.name === first) : null;
        if (first && !embed) throw new Error(`filter ${key} not modelled`);
        (embed ? embed.filters : filters).push([rest, filter]);
      }
      const passes = (row, list) => list.every(([column, filter]) => matches({ value: row[column] }, filter));
      let result = [];
      for (const row of all(table)) {
        if (!passes(row, filters)) continue;
        const out = project(table, row, columns.length ? columns : ['*']);
        let keep = true;
        for (const embed of embeds) {
          if (embed.relation.one) {
            const parent = t(embed.name).get(row[embed.relation.one]);
            const value = parent && passes(parent, embed.filters) ? project(embed.name, parent, embed.columns) : null;
            if (embed.inner && !value) keep = false;
            out[embed.name] = value;
          } else {
            const related = all(embed.name).filter(other => other[embed.relation.many] === row.id && passes(other, embed.filters))
              .map(other => project(embed.name, other, embed.columns));
            if (embed.inner && related.length === 0) keep = false;
            out[embed.name] = related;
          }
        }
        if (keep) result.push(out);
      }
      const order = params.get('order');
      if (order) {
        const [column, direction] = order.split('.');
        result.sort((a, b) => String(a[column] ?? '').localeCompare(String(b[column] ?? '')) * (direction === 'desc' ? -1 : 1));
      }
      const limit = Number(params.get('limit'));
      if (limit > 0) result = result.slice(0, limit);
      return { status: 200, body: result };
    } catch (error) {
      return { status: 500, body: { code: 'NOT_MODELLED', message: error.message } };
    }
  };

  // Head Office `restore child` (work order 5, RESTORE_BODY in `scripts/ho-lifecycle.cjs` on the HO
  // branch): undoes one EA's Delete child in place, with the command's checks in its order and its
  // refusal codes (thrown, as the applying command raises and changes nothing). T is the removal
  // instant: the child's archived_at, otherwise the end of the EA's latest ended direct assignment.
  // The EA's delivery row is the open one, else the app's deterministic row, else the latest ended;
  // it is reopened (only its end cleared), with every enrollment, class and group membership of the
  // child that ended at exactly T (skipping a membership whose class or group is archived now), and a
  // child archived by this EA's removal is un-archived. Ids, starts, row_version and handover_reason
  // stay as they are; updated_at moves (the server trigger). Not modelled: the command's
  // `active_row_conflict` refusal (an open row already holds the reopened row's unique key) and its
  // notes (near-miss ends, an assignment ended at another time), which change nothing.
  const restoreChild = ({ eaUserId, childId }) => {
    const child = t('children').get(childId);
    if (!child) throw new Error('child_not_found');
    const detId = childEaAssignmentDomainId({ userId: eaUserId, childId });
    const own = all('child_ea_assignments').filter(r => r.child_id === childId && r.user_id === eaUserId);
    const [assignment] = [...own]
      .sort((a, b) => (Number(a.unassigned_at != null) - Number(b.unassigned_at != null))
        || (Number(a.id !== detId) - Number(b.id !== detId))
        || String(b.unassigned_at ?? '').localeCompare(String(a.unassigned_at ?? ''))
        || a.id.localeCompare(b.id));
    if (!assignment) throw new Error('ea_never_held_child');
    const archived = child.archived_at != null;
    if (archived && (child.archived_by_user_id ?? null) !== eaUserId
      && !(child.archived_by_user_id == null && own.some(r => r.unassigned_at === child.archived_at))) {
      throw new Error('archived_by_another_ea');
    }
    if (assignment.unassigned_at == null) {
      // Archived while the EA still holds it: the phone has not finished sending the removal.
      if (archived) throw new Error('removal_not_finished');
      return { outcome: 'already_active' };
    }
    const removedAt = archived ? child.archived_at : own.map(r => r.unassigned_at).sort().pop();
    const at = now();
    const reopen = (table, row) => t(table).set(row.id, { ...row, [END_COLUMNS[table]]: null, updated_at: at });
    reopen('child_ea_assignments', assignment);
    const skipped = [];
    const parentArchived = { child_class_memberships: ['classes', 'class_id'], child_group_memberships: ['groups', 'group_id'] };
    for (const table of ['child_programme_enrollments', 'child_class_memberships', 'child_group_memberships']) {
      for (const row of all(table)) {
        if (row.child_id !== childId || row[END_COLUMNS[table]] !== removedAt) continue;
        const [parentTable, parentColumn] = parentArchived[table] || [];
        if (parentTable && t(parentTable).get(row[parentColumn])?.archived_at != null) { skipped.push(row.id); continue; }
        reopen(table, row);
      }
    }
    if (child.archived_at != null) {
      t('children').set(childId, { ...child, archived_at: null, archived_by_user_id: null, archive_reason: null, updated_at: at });
    }
    return { outcome: 'restored', removedAt, skipped };
  };

  const fetchImpl = async (input, init = {}) => {
    if (state.down) throw new TypeError('Network request failed');
    const url = new URL(typeof input === 'string' ? input : input.url);
    const method = String(init.method || 'GET').toUpperCase();
    const headers = new Headers(init.headers);
    const prefer = headers.get('prefer') || '';
    const body = init.body ? JSON.parse(init.body) : undefined;
    const target = url.pathname.replace(/^\/rest\/v1\//, '');
    const entry = { seq: log.length + 1, method, target, prefer, onConflict: url.searchParams.get('on_conflict'),
      query: url.search, body };
    const refused = state.refuse?.({ method, target, body, params: url.searchParams });
    let result;
    if (refused) {
      result = { status: refused.status || 403, body: { code: refused.code, details: null, hint: null, message: refused.message || refused.code } };
    } else if (target.startsWith('rpc/')) {
      result = rpc(target.slice(4), body);
    } else if (method === 'POST') {
      result = upsert(target, body, prefer);
    } else if (method === 'PATCH') {
      result = patch(target, body, url.searchParams);
    } else if (method === 'GET') {
      result = select(target, url.searchParams);
    } else {
      result = { status: 405, body: { code: 'NOT_MODELLED', message: `${method} not modelled` } };
    }
    entry.fake = {
      status: result.status,
      outcome: result.status < 300 ? 'ok' : result.body?.code,
      ...(result.rowsAffected != null ? { rowsAffected: result.rowsAffected } : {}),
      ...(result.status >= 300 ? { message: result.body?.message } : {}),
    };
    log.push(entry);
    return new Response(result.body === undefined ? null : JSON.stringify(result.body), {
      status: result.status, headers: { 'content-type': 'application/json' },
    });
  };

  const seed = (table, row) => t(table).set(row.id, { row_version: 1, ...row });
  const snapshot = () => JSON.parse(JSON.stringify(Object.fromEntries(
    Object.entries(rows).map(([name, map]) => [name, [...map.values()]])
  )));
  // A compact, order-preserving view of the recorded wire for assertions.
  const summary = (from = 0) => log.slice(from).map(({ method, target, body, fake }) => {
    const what = target.startsWith('rpc/')
      ? `${target}${body?.p_child_id ? `:${body.p_child_id}` : ''}`
      : `${method} ${target}${Array.isArray(body) ? `[${body.length}]` : body?.id ? `:${body.id}` : ''}`;
    return `${what} -> ${fake.outcome}`;
  });

  return {
    fetchImpl, rows, t, all, log, seed, snapshot, summary, state,
    writeForChild, heldEver, otherActiveHolder, restoreChild,
  };
};
