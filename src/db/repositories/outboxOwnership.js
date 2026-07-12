import { quoteIdentifier } from './sqliteRepositoryUtils';

// Owner-candidate resolution per synced table. `row` is the local domain row
// (null for hard-deletes whose row is gone); `payload` the outbox snapshot.
// created_by is the schema-true owner on created tables; staff_id/legacy keys
// exist ONLY as payload input fallbacks (repositories normalize them away).
export const directOwner = (...columns) => async ({ row, payload }) => (
  columns.map((column) => row?.[column] ?? payload?.[column]).filter(Boolean)
);

export const viaParentOwner = (parentTable, foreignKey, parentOwnerColumn) => async ({ db, row, payload }) => {
  const parentId = row?.[foreignKey] ?? payload?.[foreignKey];
  if (!parentId) return [];
  const parent = await db.getFirstAsync(
    `select * from ${quoteIdentifier(parentTable)} where id = ?`,
    parentId
  );
  if (!parent) return [];
  return [parent[parentOwnerColumn]].filter(Boolean);
};

export const combineOwners = (...resolvers) => async (context) => {
  const owners = [];
  for (const resolver of resolvers) {
    owners.push(...await resolver(context));
  }
  return owners;
};

export const OWNER_RESOLVERS = {
  time_entries: directOwner('user_id'),
  classes: directOwner('created_by', 'staff_id'),
  children: directOwner('created_by'),
  child_ea_assignments: directOwner('user_id', 'created_by'),
  child_programme_enrollments: directOwner('created_by'),
  child_class_memberships: directOwner('created_by'),
  class_ea_assignments: directOwner('ea_user_id', 'created_by'),
  grouping_versions: directOwner('created_by', 'accepted_by_user_id', 'archived_by_user_id'),
  class_grouping_state: combineOwners(
    directOwner('class_list_completed_by_user_id', 'class_list_reopened_by_user_id'),
    viaParentOwner('classes', 'class_id', 'created_by'),
  ),
  groups: directOwner('created_by', 'staff_id'),
  group_ea_assignments: directOwner('ea_user_id', 'created_by'),
  child_group_memberships: directOwner('created_by'),
  sessions: directOwner('user_id'),
  session_attendees: viaParentOwner('sessions', 'session_id', 'user_id'),
  assessments: directOwner('user_id'),
  assessment_items: viaParentOwner('assessments', 'assessment_id', 'user_id'),
  letter_mastery: directOwner('user_id'),
};

export const genericOwnerResolver = directOwner('user_id', 'created_by', 'staff_id', 'ea_user_id');

export const resolveRecordOwners = async ({ db, tableName, row, payload }) => {
  const resolver = OWNER_RESOLVERS[tableName] || genericOwnerResolver;
  return resolver({ db, row, payload });
};

export const resolvePrimaryOwner = async (context) => (
  (await resolveRecordOwners(context))[0] || null
);
