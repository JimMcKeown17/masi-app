const IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

export const timestamp = () => new Date().toISOString();

export const quoteIdentifier = (identifier) => {
  if (!IDENTIFIER_PATTERN.test(identifier)) {
    throw new Error(`Unsafe SQLite identifier: ${identifier}`);
  }

  return `"${identifier}"`;
};

export const toBoolean = (value) => {
  if (value == null) return value;
  return value === true || value === 1;
};

export const toSyncedFlag = (syncStatus) => syncStatus === 'synced';

export const syncStatusFromSynced = (synced) => (synced === false ? 'pending' : 'synced');

export const encodeJson = (value, fallback = null) => {
  if (value === undefined) return fallback == null ? null : JSON.stringify(fallback);
  return JSON.stringify(value);
};

export const decodeJson = (value, fallback = null) => {
  if (value == null || value === '') return fallback;

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

export const filterRecordColumns = ({
  record,
  columns,
  booleanColumns = [],
  jsonColumns = [],
}) => {
  const columnSet = new Set(columns);
  const booleanSet = new Set(booleanColumns);
  const jsonSet = new Set(jsonColumns);
  const filtered = {};

  for (const [key, value] of Object.entries(record || {})) {
    if (!columnSet.has(key) || value === undefined) continue;

    if (booleanSet.has(key)) {
      filtered[key] = value ? 1 : 0;
    } else if (jsonSet.has(key)) {
      filtered[key] = encodeJson(value);
    } else {
      filtered[key] = value;
    }
  }

  return filtered;
};

export const mapRowFromSqlite = ({
  row,
  booleanColumns = [],
  jsonColumns = [],
  syncedAlias = true,
}) => {
  if (!row) return null;

  const booleanSet = new Set(booleanColumns);
  const jsonSet = new Set(jsonColumns);
  const mapped = { ...row };

  for (const column of booleanSet) {
    if (column in mapped) {
      mapped[column] = toBoolean(mapped[column]);
    }
  }

  for (const column of jsonSet) {
    if (column in mapped) {
      mapped[column] = decodeJson(mapped[column], null);
    }
  }

  if (syncedAlias && 'sync_status' in mapped) {
    mapped.synced = toSyncedFlag(mapped.sync_status);
  }

  return mapped;
};

export const runWithTransaction = async (db, task) => {
  if (typeof db.withExclusiveTransactionAsync === 'function') {
    return db.withExclusiveTransactionAsync(task);
  }

  if (typeof db.withTransactionAsync === 'function') {
    return db.withTransactionAsync(task);
  }

  return task(db);
};

export const upsertRecord = async (db, {
  tableName,
  columns,
  record,
  primaryKey = 'id',
  booleanColumns = [],
  jsonColumns = [],
}) => {
  const filtered = filterRecordColumns({
    record,
    columns,
    booleanColumns,
    jsonColumns,
  });
  const insertColumns = columns.filter((column) => Object.prototype.hasOwnProperty.call(filtered, column));

  if (insertColumns.length === 0) {
    throw new Error(`No allowlisted columns supplied for ${tableName}`);
  }

  if (!Object.prototype.hasOwnProperty.call(filtered, primaryKey)) {
    throw new Error(`${tableName} upsert requires primary key ${primaryKey}`);
  }

  const quotedTable = quoteIdentifier(tableName);
  const quotedColumns = insertColumns.map(quoteIdentifier);
  const placeholders = insertColumns.map(() => '?').join(', ');
  const values = insertColumns.map((column) => filtered[column]);
  const updateColumns = insertColumns.filter((column) => column !== primaryKey);
  const updateClause = updateColumns.length > 0
    ? `do update set ${updateColumns
      .map((column) => `${quoteIdentifier(column)} = excluded.${quoteIdentifier(column)}`)
      .join(', ')}`
    : 'do nothing';

  return db.runAsync(
    `insert into ${quotedTable} (${quotedColumns.join(', ')})
     values (${placeholders})
     on conflict(${quoteIdentifier(primaryKey)}) ${updateClause}`,
    values
  );
};

export const replaceAllRecords = async (db, {
  tableName,
  columns,
  records,
  primaryKey = 'id',
  requiredColumns = [primaryKey],
  booleanColumns = [],
  jsonColumns = [],
}) => runWithTransaction(db, async (txn) => {
  for (const record of records) {
    for (const column of requiredColumns) {
      if (record[column] == null) {
        throw new Error(`${tableName}.${column} must not be null`);
      }
    }
  }

  await txn.runAsync(`delete from ${quoteIdentifier(tableName)}`);

  for (const record of records) {
    await upsertRecord(txn, {
      tableName,
      columns,
      record,
      primaryKey,
      booleanColumns,
      jsonColumns,
    });
  }
});

export const setRecordSyncStatus = async (db, tableName, id, syncStatus) => db.runAsync(
  `update ${quoteIdentifier(tableName)}
   set sync_status = ?, updated_at = ?
   where id = ?`,
  syncStatus,
  timestamp(),
  id
);

export const setRecordLastSyncError = async (db, tableName, id, errorMessage) => db.runAsync(
  `update ${quoteIdentifier(tableName)}
   set last_sync_error = ?, updated_at = ?
   where id = ?`,
  errorMessage,
  timestamp(),
  id
);

export const insertOutboxRecord = async (db, {
  id,
  tableName,
  recordId,
  operation,
  payload = null,
  status = 'pending',
  createdAt = timestamp(),
}) => upsertRecord(db, {
  tableName: 'sync_outbox',
  columns: [
    'id',
    'table_name',
    'record_id',
    'operation',
    'payload',
    'status',
    'created_at',
    'updated_at',
  ],
  record: {
    id,
    table_name: tableName,
    record_id: recordId,
    operation,
    payload,
    status,
    created_at: createdAt,
    updated_at: createdAt,
  },
  jsonColumns: ['payload'],
});
