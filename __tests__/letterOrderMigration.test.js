const fs = require('node:fs');
const path = require('node:path');
const {
  MASI_LETTER_ORDER_EDITIONS,
  NEW_CLASS_LETTER_ORDER_EDITION,
} = require('../src/utils/letterOrders');

const sql = fs.readFileSync(path.join(
  __dirname,
  '../supabase/migrations/20261027120000_class_letter_order_edition.sql',
), 'utf8').replace(/--[^\n]*/g, '');

test('the class edition check allows exactly the Masi editions', () => {
  const check = sql.match(/add\s+constraint\s+classes_letter_order_edition_known\s+check\s*\(\s*letter_order_edition\s+in\s*\(([^)]*)\)\s*\)/i);
  expect(check).not.toBeNull();
  const editions = [...check[1].matchAll(/'([^']*)'/g)].map(match => match[1]);
  expect(editions).toEqual(MASI_LETTER_ORDER_EDITIONS);
});

test('every literal edition matches the new class edition', () => {
  const editions = [...sql.matchAll(/'(\d{4}-\d{2}-\d{2}|legacy)'/g)].map(match => match[1]);
  expect(editions.length).toBeGreaterThan(0);
  for (const edition of editions) expect(edition).toBe(NEW_CLASS_LETTER_ORDER_EDITION);
});

test('the class edition default is dropped after the column is added', () => {
  const addColumn = sql.search(/alter\s+table\s+public\.classes\s+add\s+column\s+if\s+not\s+exists\s+letter_order_edition/i);
  const dropDefault = sql.search(/alter\s+table\s+public\.classes\s+alter\s+column\s+letter_order_edition\s+drop\s+default/i);
  expect(addColumn).toBeGreaterThanOrEqual(0);
  expect(dropDefault).toBeGreaterThan(addColumn);
});

test('existing classes are backfilled without an update statement', () => {
  expect(sql).not.toMatch(/\bupdate\s+public\.classes\b/i);
});

test('the class edition has no schedule', () => {
  expect(sql).not.toMatch(/\bnew_class_edition\b/i);
});
