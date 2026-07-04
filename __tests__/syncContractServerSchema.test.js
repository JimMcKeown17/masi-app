jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));
jest.mock('../src/services/supabaseClient', () => ({ supabase: {} }));
const { SERVER_COLUMNS, INTENTIONALLY_UNSYNCED } = require('../src/services/offlineSync').__contract;
const fs = require('fs');
const path = require('path');

const migrationsDir = path.join(__dirname, '..', 'supabase', 'migrations');

const readMigrations = () => (
  fs.readdirSync(migrationsDir)
    .filter((filename) => filename.endsWith('.sql'))
    .sort()
    .map((filename) => ({
      filename,
      sql: fs.readFileSync(path.join(migrationsDir, filename), 'utf8'),
    }))
);

const identifier = /(?:"([^"]+)"|([a-z_][a-z0-9_]*))/i;
const tableNamePattern = String.raw`(?:"[^"]+"|[a-z_][a-z0-9_]*)(?:\.(?:"[^"]+"|[a-z_][a-z0-9_]*))?`;

const unquoteIdentifier = (name) => (
  name.startsWith('"') && name.endsWith('"') ? name.slice(1, -1).replace(/""/g, '"') : name
);

const baseTableName = (name) => unquoteIdentifier(name.split('.').pop());

const stripLeadingComments = (statement) => {
  let rest = statement.trimStart();

  while (rest.startsWith('--') || rest.startsWith('/*')) {
    if (rest.startsWith('--')) {
      const newline = rest.indexOf('\n');
      rest = newline === -1 ? '' : rest.slice(newline + 1).trimStart();
      continue;
    }

    const end = rest.indexOf('*/');
    rest = end === -1 ? '' : rest.slice(end + 2).trimStart();
  }

  return rest;
};

const readDollarTag = (sql, index) => {
  const match = sql.slice(index).match(/^\$[a-z_][a-z0-9_]*\$|^\$\$/i);
  return match ? match[0] : null;
};

const splitTopLevel = (text, delimiter) => {
  const parts = [];
  let start = 0;
  let depth = 0;
  let singleQuote = false;
  let doubleQuote = false;
  let lineComment = false;
  let blockComment = false;
  let dollarTag = null;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (lineComment) {
      if (char === '\n') lineComment = false;
      continue;
    }

    if (blockComment) {
      if (char === '*' && next === '/') {
        blockComment = false;
        i += 1;
      }
      continue;
    }

    if (dollarTag) {
      if (text.startsWith(dollarTag, i)) {
        i += dollarTag.length - 1;
        dollarTag = null;
      }
      continue;
    }

    if (singleQuote) {
      if (char === "'" && next === "'") {
        i += 1;
      } else if (char === "'") {
        singleQuote = false;
      }
      continue;
    }

    if (doubleQuote) {
      if (char === '"' && next === '"') {
        i += 1;
      } else if (char === '"') {
        doubleQuote = false;
      }
      continue;
    }

    if (char === '-' && next === '-') {
      lineComment = true;
      i += 1;
      continue;
    }

    if (char === '/' && next === '*') {
      blockComment = true;
      i += 1;
      continue;
    }

    const tag = char === '$' ? readDollarTag(text, i) : null;
    if (tag) {
      dollarTag = tag;
      i += tag.length - 1;
      continue;
    }

    if (char === "'") {
      singleQuote = true;
      continue;
    }

    if (char === '"') {
      doubleQuote = true;
      continue;
    }

    if (char === '(') {
      depth += 1;
      continue;
    }

    if (char === ')' && depth > 0) {
      depth -= 1;
      continue;
    }

    if (char === delimiter && depth === 0) {
      parts.push(text.slice(start, i).trim());
      start = i + 1;
    }
  }

  const last = text.slice(start).trim();
  if (last) parts.push(last);
  return parts.filter(Boolean);
};

const extractParenthesizedBody = (statement) => {
  const start = statement.indexOf('(');
  if (start === -1) return null;

  let depth = 0;
  let singleQuote = false;
  let doubleQuote = false;
  let dollarTag = null;

  for (let i = start; i < statement.length; i += 1) {
    const char = statement[i];
    const next = statement[i + 1];

    if (dollarTag) {
      if (statement.startsWith(dollarTag, i)) {
        i += dollarTag.length - 1;
        dollarTag = null;
      }
      continue;
    }

    if (singleQuote) {
      if (char === "'" && next === "'") {
        i += 1;
      } else if (char === "'") {
        singleQuote = false;
      }
      continue;
    }

    if (doubleQuote) {
      if (char === '"' && next === '"') {
        i += 1;
      } else if (char === '"') {
        doubleQuote = false;
      }
      continue;
    }

    const tag = char === '$' ? readDollarTag(statement, i) : null;
    if (tag) {
      dollarTag = tag;
      i += tag.length - 1;
      continue;
    }

    if (char === "'") {
      singleQuote = true;
      continue;
    }

    if (char === '"') {
      doubleQuote = true;
      continue;
    }

    if (char === '(') {
      depth += 1;
      continue;
    }

    if (char === ')') {
      depth -= 1;
      if (depth === 0) return statement.slice(start + 1, i);
    }
  }

  return null;
};

const addColumn = (columnsByTable, table, column) => {
  if (!columnsByTable[table]) columnsByTable[table] = new Set();
  columnsByTable[table].add(column);
};

const parseCreateTable = (statement, columnsByTable) => {
  const ddl = stripLeadingComments(statement);
  const match = ddl.match(new RegExp(
    String.raw`^\s*create\s+table\s+(?:if\s+not\s+exists\s+)?(${tableNamePattern})\s*\(`,
    'i'
  ));
  if (!match) return;

  const table = baseTableName(match[1]);
  const body = extractParenthesizedBody(ddl);
  if (!body) return;

  for (const entry of splitTopLevel(body, ',')) {
    const trimmed = entry.trim();
    if (/^(?:primary|foreign|unique|check|constraint)\b/i.test(trimmed)) continue;

    const columnMatch = trimmed.match(new RegExp(String.raw`^\s*${identifier.source}`, 'i'));
    if (columnMatch) addColumn(columnsByTable, table, columnMatch[1] || columnMatch[2]);
  }
};

const parseAlterTable = (statement, filename, columnsByTable) => {
  const ddl = stripLeadingComments(statement);
  const match = ddl.match(new RegExp(
    String.raw`^\s*alter\s+table\s+(?:only\s+)?(${tableNamePattern})\s+([\s\S]*)$`,
    'i'
  ));
  if (!match) return;

  const table = baseTableName(match[1]);
  const clauses = splitTopLevel(match[2], ',');

  for (const clause of clauses) {
    if (!/^\s*add\s+column\b/i.test(clause)) continue;

    const columnMatch = clause.match(new RegExp(
      String.raw`^\s*add\s+column\s+(?:if\s+not\s+exists\s+)?${identifier.source}\b`,
      'i'
    ));
    if (!columnMatch) {
      throw new Error(`Could not parse add-column clause in ${filename}:\n${statement}`);
    }

    addColumn(columnsByTable, table, columnMatch[1] || columnMatch[2]);
  }
};

const parseServerColumns = (migrations) => {
  const columnsByTable = {};

  for (const { filename, sql } of migrations) {
    for (const statement of splitTopLevel(sql, ';')) {
      parseCreateTable(statement, columnsByTable);
      parseAlterTable(statement, filename, columnsByTable);
    }
  }

  return columnsByTable;
};

describe('parseServerColumns', () => {
  test('captures every column from a multi-column ALTER TABLE statement', () => {
    const serverCols = parseServerColumns([{
      filename: 'fixture.sql',
      sql: 'alter table foo add column a int, add column b int;',
    }]);

    expect([...serverCols.foo].sort()).toEqual(['a', 'b']);
  });

  test('ignores DDL inside opaque DO blocks without throwing', () => {
    const serverCols = parseServerColumns([{
      filename: 'fixture.sql',
      sql: `
        do $$
        begin
          alter table foo add constraint foo_bar_check check (bar in ('a', 'b'));
        end $$;
      `,
    }]);

    expect(serverCols.foo).toBeUndefined();
  });

  test('throws when an ADD COLUMN clause has no column name', () => {
    expect(() => parseServerColumns([{
      filename: 'fixture.sql',
      sql: 'alter table foo add column ;',
    }])).toThrow(/Could not parse add-column clause in fixture\.sql/);
  });
});

describe('SERVER_COLUMNS server schema contract', () => {
  const serverCols = parseServerColumns(readMigrations());

  test('includes assessments.capture_mode from the capture-mode migration', () => {
    expect(serverCols.assessments.has('capture_mode')).toBe(true);
  });

  test('every SERVER_COLUMNS column exists in the Supabase migration-built schema', () => {
    expect(INTENTIONALLY_UNSYNCED).toBeDefined();

    for (const [table, cols] of Object.entries(SERVER_COLUMNS)) {
      const missing = cols.filter((col) => !(serverCols[table] && serverCols[table].has(col)));
      expect({ table, missing }).toEqual({ table, missing: [] });
    }
  });
});
