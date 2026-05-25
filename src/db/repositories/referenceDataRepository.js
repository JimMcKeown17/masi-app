import { resolveDatabase, runRepositoryTransaction } from './repositoryRuntime';
import {
  mapRowFromSqlite,
  quoteIdentifier,
  upsertRecord,
} from './sqliteRepositoryUtils';

const REFERENCE_TABLES = {
  schools: {
    columns: [
      'id',
      'school_uid',
      'school_number',
      'name',
      'school_type',
      'suburb',
      'coord_east',
      'coord_south',
      'google_maps_link',
      'is_active',
      'created_at',
      'updated_at',
      'sync_status',
      'last_sync_error',
      'server_updated_at',
    ],
    booleanColumns: ['is_active'],
    requiredColumns: ['id', 'name'],
    retargetOnConflictColumns: ['school_uid', 'name'],
    foreignKeyRetargets: [
      { tableName: 'staff_programme_assignments', column: 'school_id' },
      { tableName: 'teachers', column: 'school_id' },
      { tableName: 'classes', column: 'school_id' },
    ],
    orderBy: 'name',
  },
  job_titles: {
    columns: [
      'id',
      'code',
      'name',
      'sort_order',
      'is_active',
      'created_at',
      'updated_at',
      'sync_status',
      'last_sync_error',
      'server_updated_at',
    ],
    booleanColumns: ['is_active'],
    requiredColumns: ['id', 'code', 'name'],
    retargetOnConflictColumns: ['code', 'name'],
    orderBy: 'sort_order, name',
  },
  programmes: {
    columns: [
      'id',
      'code',
      'name',
      'sort_order',
      'is_active',
      'created_at',
      'updated_at',
      'sync_status',
      'last_sync_error',
      'server_updated_at',
    ],
    booleanColumns: ['is_active'],
    requiredColumns: ['id', 'code', 'name'],
    retargetOnConflictColumns: ['code', 'name'],
    foreignKeyRetargets: [
      { tableName: 'staff_programme_assignments', column: 'programme_id' },
      { tableName: 'assessment_tools', column: 'programme_id' },
      { tableName: 'child_programme_enrollments', column: 'programme_id' },
      { tableName: 'class_ea_assignments', column: 'programme_id' },
      { tableName: 'groups', column: 'programme_id' },
      { tableName: 'group_ea_assignments', column: 'programme_id' },
      { tableName: 'sessions', column: 'programme_id' },
      { tableName: 'assessments', column: 'programme_id' },
      { tableName: 'letter_mastery', column: 'programme_id' },
    ],
    orderBy: 'sort_order, name',
  },
  staff_programme_assignments: {
    columns: [
      'id',
      'user_id',
      'programme_id',
      'school_id',
      'assigned_at',
      'ended_at',
      'created_by',
      'created_at',
      'updated_at',
      'sync_status',
      'last_sync_error',
      'server_updated_at',
    ],
    requiredColumns: ['id', 'user_id', 'programme_id'],
    orderBy: 'assigned_at',
    replaceScopeColumn: 'user_id',
  },
  assessment_tools: {
    columns: [
      'id',
      'programme_id',
      'code',
      'name',
      'subject',
      'language',
      'version',
      'config',
      'is_active',
      'created_at',
      'updated_at',
      'sync_status',
      'last_sync_error',
      'server_updated_at',
    ],
    booleanColumns: ['is_active'],
    jsonColumns: ['config'],
    requiredColumns: ['id', 'programme_id', 'code', 'name'],
    retargetOnConflictColumns: ['code'],
    foreignKeyRetargets: [
      { tableName: 'assessments', column: 'assessment_tool_id' },
    ],
    orderBy: 'name',
  },
  academic_years: {
    columns: [
      'id',
      'label',
      'starts_on',
      'ends_on',
      'is_active',
      'created_at',
      'updated_at',
      'sync_status',
      'last_sync_error',
      'server_updated_at',
    ],
    booleanColumns: ['is_active'],
    requiredColumns: ['id', 'label', 'starts_on', 'ends_on'],
    retargetOnConflictColumns: ['label'],
    foreignKeyRetargets: [
      { tableName: 'assessment_windows', column: 'academic_year_id' },
      { tableName: 'classes', column: 'academic_year_id' },
      { tableName: 'grouping_versions', column: 'academic_year_id' },
      { tableName: 'class_grouping_state', column: 'academic_year_id' },
      { tableName: 'child_class_memberships', column: 'academic_year_id' },
    ],
    orderBy: 'starts_on',
  },
  assessment_windows: {
    columns: [
      'id',
      'academic_year_id',
      'label',
      'window_type',
      'starts_on',
      'ends_on',
      'is_required',
      'created_at',
      'updated_at',
      'sync_status',
      'last_sync_error',
      'server_updated_at',
    ],
    booleanColumns: ['is_required'],
    requiredColumns: ['id', 'academic_year_id', 'label', 'window_type', 'starts_on', 'ends_on'],
    conflictColumns: ['academic_year_id', 'window_type'],
    updatePrimaryKeyOnConflict: true,
    orderBy: 'starts_on',
  },
  teachers: {
    columns: [
      'id',
      'first_name',
      'last_name',
      'display_name',
      'school_id',
      'archived_at',
      'archived_by_user_id',
      'archive_reason',
      'created_at',
      'updated_at',
      'sync_status',
      'last_sync_error',
      'server_updated_at',
    ],
    requiredColumns: ['id', 'first_name', 'last_name'],
    orderBy: 'last_name, first_name',
  },
};

const safeOrderBy = (orderBy) => orderBy
  .split(',')
  .map((part) => part.trim())
  .filter(Boolean)
  .map((part) => {
    const [column, direction] = part.split(/\s+/);
    const quoted = quoteIdentifier(column);
    return direction ? `${quoted} ${direction}` : quoted;
  })
  .join(', ');

const parseOutboxPayload = (payload) => {
  if (!payload) return null;
  try {
    const parsed = JSON.parse(payload);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

export const createReferenceDataRepository = ({
  database,
  tableName,
  columns,
  booleanColumns = [],
  jsonColumns = [],
  requiredColumns,
  conflictColumns,
  updatePrimaryKeyOnConflict = false,
  orderBy = 'id',
  replaceScopeColumn,
  retargetOnConflictColumns = [],
  foreignKeyRetargets = [],
}) => {
  const getConfig = () => {
    const tableConfig = REFERENCE_TABLES[tableName] || {};
    return {
      columns: columns || tableConfig.columns,
      booleanColumns: booleanColumns.length > 0 ? booleanColumns : tableConfig.booleanColumns || [],
      jsonColumns: jsonColumns.length > 0 ? jsonColumns : tableConfig.jsonColumns || [],
      requiredColumns: requiredColumns || tableConfig.requiredColumns || ['id'],
      conflictColumns: conflictColumns || tableConfig.conflictColumns || ['id'],
      updatePrimaryKeyOnConflict: updatePrimaryKeyOnConflict || tableConfig.updatePrimaryKeyOnConflict || false,
      orderBy: orderBy || tableConfig.orderBy || 'id',
      replaceScopeColumn: replaceScopeColumn || tableConfig.replaceScopeColumn || null,
      retargetOnConflictColumns: retargetOnConflictColumns.length > 0
        ? retargetOnConflictColumns
        : tableConfig.retargetOnConflictColumns || [],
      foreignKeyRetargets: foreignKeyRetargets.length > 0
        ? foreignKeyRetargets
        : tableConfig.foreignKeyRetargets || [],
    };
  };

  const retargetConflictingRows = async (txn, config, record) => {
    if (!config.retargetOnConflictColumns.length || record.id == null) {
      return;
    }

    let deferringForeignKeys = false;
    for (const column of config.retargetOnConflictColumns) {
      const value = record[column];
      if (value == null) continue;

      const conflicts = await txn.getAllAsync(
        `select id from ${quoteIdentifier(tableName)}
         where ${quoteIdentifier(column)} = ?
           and id <> ?`,
        value,
        record.id
      );

      for (const conflict of conflicts) {
        if (!deferringForeignKeys) {
          await txn.runAsync('PRAGMA defer_foreign_keys = ON');
          deferringForeignKeys = true;
        }

        const targetExists = await txn.getFirstAsync(
          `select id from ${quoteIdentifier(tableName)} where id = ?`,
          record.id
        );

        if (targetExists) {
          for (const reference of config.foreignKeyRetargets) {
            await txn.runAsync(
              `update ${quoteIdentifier(reference.tableName)}
               set ${quoteIdentifier(reference.column)} = ?
               where ${quoteIdentifier(reference.column)} = ?`,
              record.id,
              conflict.id
            );
            await retargetOutboxPayloadReferences(txn, reference, conflict.id, record.id);
          }
          await txn.runAsync(
            `delete from ${quoteIdentifier(tableName)} where id = ?`,
            conflict.id
          );
        } else {
          await txn.runAsync(
            `update ${quoteIdentifier(tableName)}
             set id = ?
             where id = ?`,
            record.id,
            conflict.id
          );
          for (const reference of config.foreignKeyRetargets) {
            await txn.runAsync(
              `update ${quoteIdentifier(reference.tableName)}
               set ${quoteIdentifier(reference.column)} = ?
               where ${quoteIdentifier(reference.column)} = ?`,
              record.id,
              conflict.id
            );
            await retargetOutboxPayloadReferences(txn, reference, conflict.id, record.id);
          }
        }
      }
    }
  };

  const retargetOutboxPayloadReferences = async (txn, reference, fromId, toId) => {
    const rows = await txn.getAllAsync(
      `
      select id, payload
      from sync_outbox
      where table_name = ?
        and payload is not null
    `,
      reference.tableName
    );

    for (const row of rows) {
      const payload = parseOutboxPayload(row.payload);
      if (!payload || payload[reference.column] !== fromId) continue;

      payload[reference.column] = toId;
      await txn.runAsync(
        `
        update sync_outbox
        set payload = ?,
            status = 'pending',
            retry_count = 0,
            last_error = null,
            next_retry_at = null,
            updated_at = ?
        where id = ?
      `,
        JSON.stringify(payload),
        new Date().toISOString(),
        row.id
      );
    }
  };

  const getAll = async () => {
    const db = await resolveDatabase(database);
    const config = getConfig();
    const rows = await db.getAllAsync(
      `select * from ${quoteIdentifier(tableName)} order by ${safeOrderBy(config.orderBy)}`
    );

    return rows.map((row) => mapRowFromSqlite({
      row,
      booleanColumns: config.booleanColumns,
      jsonColumns: config.jsonColumns,
    }));
  };

  const getActive = async () => {
    const db = await resolveDatabase(database);
    const config = getConfig();
    const row = await db.getFirstAsync(
      `select * from ${quoteIdentifier(tableName)} where is_active = 1 limit 1`
    );

    return mapRowFromSqlite({
      row,
      booleanColumns: config.booleanColumns,
      jsonColumns: config.jsonColumns,
    });
  };

  const replaceAll = async (records, { scope = {} } = {}) => {
    const config = getConfig();
    for (const record of records) {
      for (const column of config.requiredColumns) {
        if (record[column] == null) {
          throw new Error(`${tableName}.${column} must not be null`);
        }
      }
    }
    await runRepositoryTransaction(database, async (txn) => {
      if (config.replaceScopeColumn) {
        const scopeValues = scope[config.replaceScopeColumn] == null
          ? [...new Set(records.map(record => record[config.replaceScopeColumn]).filter(value => value != null))]
          : [scope[config.replaceScopeColumn]];
        for (const scopeValue of scopeValues) {
          await txn.runAsync(
            `delete from ${quoteIdentifier(tableName)} where ${quoteIdentifier(config.replaceScopeColumn)} = ?`,
            scopeValue
          );
        }
      }
      for (const record of records) {
        await retargetConflictingRows(txn, config, record);
        await upsertRecord(txn, {
          tableName,
          columns: config.columns,
          record,
          conflictColumns: config.conflictColumns,
          updatePrimaryKeyOnConflict: config.updatePrimaryKeyOnConflict,
          booleanColumns: config.booleanColumns,
          jsonColumns: config.jsonColumns,
        });
      }
    });
    return true;
  };

  const replaceFromServer = async (records, options = {}) => {
    if (!Array.isArray(records)) {
      return false;
    }

    return replaceAll(records.map((record) => ({
      ...record,
      sync_status: 'synced',
    })), options);
  };

  return {
    getAll,
    getActive,
    replaceAll,
    replaceFromServer,
  };
};

export const createSchoolsRepository = (options = {}) => createReferenceDataRepository({
  ...REFERENCE_TABLES.schools,
  ...options,
  tableName: 'schools',
});

export const schoolsRepository = createSchoolsRepository();
export const jobTitlesRepository = createReferenceDataRepository({ tableName: 'job_titles' });
export const programmesRepository = createReferenceDataRepository({ tableName: 'programmes' });
export const staffProgrammeAssignmentsRepository = createReferenceDataRepository({ tableName: 'staff_programme_assignments' });
export const assessmentToolsRepository = createReferenceDataRepository({ tableName: 'assessment_tools' });
export const academicYearsRepository = createReferenceDataRepository({ tableName: 'academic_years' });
export const assessmentWindowsRepository = createReferenceDataRepository({ tableName: 'assessment_windows' });
export const teachersRepository = createReferenceDataRepository({ tableName: 'teachers' });
