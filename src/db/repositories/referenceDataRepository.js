import { resolveDatabase } from './repositoryRuntime';
import {
  mapRowFromSqlite,
  quoteIdentifier,
  replaceAllRecords,
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

export const createReferenceDataRepository = ({
  database,
  tableName,
  columns,
  booleanColumns = [],
  jsonColumns = [],
  requiredColumns,
  orderBy = 'id',
}) => {
  const getConfig = () => {
    const tableConfig = REFERENCE_TABLES[tableName] || {};
    return {
      columns: columns || tableConfig.columns,
      booleanColumns: booleanColumns.length > 0 ? booleanColumns : tableConfig.booleanColumns || [],
      jsonColumns: jsonColumns.length > 0 ? jsonColumns : tableConfig.jsonColumns || [],
      requiredColumns: requiredColumns || tableConfig.requiredColumns || ['id'],
      orderBy: orderBy || tableConfig.orderBy || 'id',
    };
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

  const replaceAll = async (records) => {
    const db = await resolveDatabase(database);
    const config = getConfig();
    for (const record of records) {
      for (const column of config.requiredColumns) {
        if (record[column] == null) {
          throw new Error(`${tableName}.${column} must not be null`);
        }
      }
    }
    await replaceAllRecords(db, {
      tableName,
      columns: config.columns,
      records,
      booleanColumns: config.booleanColumns,
      jsonColumns: config.jsonColumns,
    });
    return true;
  };

  const replaceFromServer = async (records) => {
    if (!Array.isArray(records)) {
      return false;
    }

    return replaceAll(records.map((record) => ({
      ...record,
      sync_status: 'synced',
    })));
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
