import { persistRosterMemberships } from '../db/repositories/rosterMembershipPersist';

const emptyRows = () => ({ classEaAssignments: [], classes: [], children: [], memberships: [] });
const synced = row => ({ ...row, synced: true, sync_status: 'synced' });
const unique = rows => [...new Map(rows.map(row => [row.id, row])).values()];
const chunks = ids => Array.from({ length: Math.ceil(ids.length / 200) }, (_, index) => ids.slice(index * 200, (index + 1) * 200));
const stripMembership = ({ classes, academic_years, ...row }) => synced(row);

export const classRosterDependencyScope = () => ({
  ok: false, complete: false, failureKind: 'dependency', rows: emptyRows(),
});

// queryScope is the caller's existing queuedQueryScope. Each query releases the
// signed-in handle queue before the next dependent query is enqueued.
export async function pullClassRoster({ userId, activeProgrammeId, supabaseClient, queryScope, downloadedChildren = [] }) {
  if (!activeProgrammeId) return classRosterDependencyScope();
  const scope = { ok: true, complete: true, failureKind: null, rows: emptyRows() };
  const read = async task => {
    const result = await queryScope(task);
    if (!result.ok || !result.complete) scope.complete = false;
    if (!result.ok) {
      scope.ok = false;
      scope.failureKind = result.failureKind;
      scope.error = result.error;
    }
    return result.rows;
  };
  const addClasses = rows => {
    scope.rows.classes = unique([...scope.rows.classes, ...rows.flatMap(row => (
      row.classes ? [synced(row.classes)] : []
    ))]);
  };
  const assignments = await read(() => supabaseClient.from('class_ea_assignments')
    .select('*, classes(*)').eq('ea_user_id', userId).eq('programme_id', activeProgrammeId).is('unassigned_at', null));
  addClasses(assignments);
  scope.rows.classEaAssignments = assignments.map(({ classes, ...row }) => synced(row));
  const classIds = [...new Set(assignments.map(row => row.class_id))];
  const roster = [];
  for (const ids of chunks(classIds)) {
    roster.push(...await read(() => supabaseClient.from('child_class_memberships')
      .select('*, classes(*)').in('class_id', ids).is('exited_at', null)));
  }
  addClasses(roster);
  const childIds = [...new Set(roster.map(row => row.child_id))];
  // Reuse full rows downloaded by this pass's delivery scope. Cached identities
  // cannot establish a full roster row, and missing control rows still need a GET.
  const downloadedById = new Map(downloadedChildren.map(row => [row.id, row]));
  scope.rows.children = childIds.filter(id => downloadedById.has(id)).map(id => synced(downloadedById.get(id)));
  for (const ids of chunks(childIds.filter(id => !downloadedById.has(id)))) {
    scope.rows.children.push(...(await read(() => supabaseClient.from('children').select('*').in('id', ids))).map(synced));
  }
  const moveMemberships = [];
  for (const ids of chunks(childIds)) {
    // The reference-table join resolves the active year on the server, so this
    // scope needs no cached class assignments or active-year lookup to start.
    moveMemberships.push(...await read(() => supabaseClient.from('child_class_memberships')
      .select('*, classes(*), academic_years!inner(is_active)')
      .in('child_id', ids).eq('academic_years.is_active', true)));
  }
  addClasses(moveMemberships);
  scope.rows.children = unique(scope.rows.children);
  scope.rows.memberships = unique([...roster, ...moveMemberships].map(stripMembership));
  const returnedClassIds = new Set(scope.rows.classes.map(row => row.id));
  if (scope.rows.memberships.some(row => row.exited_at == null && !returnedClassIds.has(row.class_id))) {
    scope.complete = false;
  }
  return scope;
}

export async function persistClassRoster({ scope, repositories, deletedChildIds = new Set() }) {
  if (!scope || scope.failureKind === 'dependency') return false;
  const rows = scope.rows;
  if (!Array.isArray(rows?.memberships)) return false;
  await repositories.children.withTransaction(async txn => {
    // Parents first: classes, then the assignments and memberships that reference them.
    const knownClasses = new Set(rows.classes.map(row => row.id));
    const hasClass = async id => {
      if (knownClasses.has(id)) return true;
      if (await txn.getFirstAsync('select id from classes where id = ?', id)) {
        knownClasses.add(id);
        return true;
      }
      return false;
    };
    for (const row of rows.classes) await repositories.classes.saveClass(row, { transaction: txn });
    for (const row of rows.classEaAssignments) {
      if (await hasClass(row.class_id)) await repositories.classEaAssignments.save(row, { transaction: txn });
      else scope.complete = false;
    }
    for (const row of rows.children) {
      if (!deletedChildIds.has(row.id)) await repositories.children.saveServerChildRow(row, { transaction: txn });
    }
    const memberships = [];
    for (const row of rows.memberships) {
      if (deletedChildIds.has(row.child_id)) continue;
      if (!await hasClass(row.class_id)) {
        if (row.exited_at == null) scope.complete = false;
        continue; // Unreadable historical parent and nothing local to close.
      }
      if (!await txn.getFirstAsync('select id from children where id = ?', row.child_id)) {
        scope.complete = false;
        continue;
      }
      memberships.push(row);
    }
    rows.memberships = memberships;
    await persistRosterMemberships(txn, memberships, { childrenRepository: repositories.children });
  });
  return true;
}
