const fs = require('node:fs');
const path = require('node:path');
const { CURRENT_PACK_IDS } = require('../src/lessonPlan/packs');
const { LETTER_ORDER_REGISTRY } = require('../src/utils/letterOrders');

const sourceFiles = directory => fs.readdirSync(directory, { withFileTypes: true })
  .flatMap(entry => {
    const filename = path.join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(filename) : /\.(js|ts|tsx)$/.test(entry.name) ? [filename] : [];
  }).sort();

test.each([
  ['pedagogical order constants', /PEDAGOGICAL_ORDER/],
  ['the receipt letter order constant', /\bLETTER_ORDER\b/],
  ['language-based pack lookup', /getPack\(/],
])('source has no leftover %s', (name, pattern) => {
  const root = path.join(__dirname, '../src');
  const leftovers = sourceFiles(root).flatMap(filename => fs.readFileSync(filename, 'utf8').split('\n')
    .flatMap((line, index) => pattern.test(line) ? [`${path.relative(root, filename)}:${index + 1}: ${line.trim()}`] : []));
  expect(leftovers).toEqual([]);
});

test('current packs are keyed only by registered letter order ids', () => {
  const orderIds = new Set(LETTER_ORDER_REGISTRY.orders.map(order => order.id));
  expect(Object.keys(CURRENT_PACK_IDS).sort()).toEqual(['preview', 'release']);
  for (const ids of Object.values(CURRENT_PACK_IDS)) {
    expect(Object.keys(ids).length).toBeGreaterThan(0);
    expect(Object.keys(ids).filter(id => !orderIds.has(id))).toEqual([]);
  }
});
