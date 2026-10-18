export const VERSIONED_TABLES = new Set([
  'children',
  'classes',
  'groups',
  'child_ea_assignments',
  'class_ea_assignments',
  'group_ea_assignments',
  'child_programme_enrollments',
  'child_class_memberships',
  'child_group_memberships',
  'grouping_versions',
  'class_grouping_state',
]);

export const IMMUTABLE_ASSIGNMENT_TABLES = new Set([
  'child_ea_assignments',
  'class_ea_assignments',
  'group_ea_assignments',
]);

export const isStampedOperation = (tableName, operation) => (
  VERSIONED_TABLES.has(tableName)
  && ['insert', 'update', 'archive', 'restore'].includes(operation)
  && !(operation === 'insert' && IMMUTABLE_ASSIGNMENT_TABLES.has(tableName))
);
