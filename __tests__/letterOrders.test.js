const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const {
  createLetterOrderResolver,
  resolveTeachingOrder,
  MASI_LETTER_ORDER_EDITIONS,
  getTeachingOrder,
} = require('../src/utils/letterOrders');

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

test('the vendored registry is the books file, byte for byte', () => {
  const bytes = fs.readFileSync(path.join(__dirname, '../src/constants/contracts/letter-orders-v1.json'));
  // books 9cd66f8 (last registry change 94e662f)
  expect(sha256(bytes)).toBe('33af38be2ceeb45051660ff790774e5aa55299fce8091c60ed055e166cfd2490');
});
test.each([
  ['xh', 'isixhosa-order-2026-10-23', ['o', 'm', 'l', 'a']],
  ['en', 'english-order-2026-10-23', ['s', 'a', 'n', 'd']],
  ['af', 'afrikaans-order-2026-10-23', ['a', 'e', 'k', 'n']],
])('2026-10-23 %s starts %s', (code, id, first) => {
  const order = resolveTeachingOrder('2026-10-23', code);
  expect(order.id).toBe(id);
  expect(order.letters.slice(0, 4)).toEqual(first);
  expect([...order.letters].sort()).toEqual([...'abcdefghijklmnopqrstuvwxyz']);
  expect(Object.isFrozen(order.letters)).toBe(true);
});
test.each([null, undefined, 'zu', 'fr', 'isixhosa'])('language %p has no order', code => {
  expect(resolveTeachingOrder('2026-10-23', code)).toBeNull();
});
test('an unknown edition throws UNKNOWN_EDITION', () => {
  expect(() => resolveTeachingOrder('2099-01-01', 'xh')).toThrow(expect.objectContaining({ code: 'UNKNOWN_EDITION' }));
});
test('a known edition without the language throws MISSING_ORDER', () => {
  const { resolveTeachingOrder: resolve } = createLetterOrderResolver({ orders: [], editions: [{ id: 'e', orders: {} }] });
  expect(() => resolve('e', 'xh')).toThrow(expect.objectContaining({ code: 'MISSING_ORDER' }));
});
test('every Masi edition resolves for xh, en and af', () => {
  for (const edition of MASI_LETTER_ORDER_EDITIONS) for (const code of ['xh', 'en', 'af']) {
    expect(resolveTeachingOrder(edition, code)).not.toBeNull();
  }
});
test('getTeachingOrder: order, none and update', () => {
  const row = { letter_order_edition: '2026-10-23' };
  expect(getTeachingOrder(row, 'en')).toEqual({ kind: 'order', id: 'english-order-2026-10-23', letters: expect.any(Array) });
  expect(getTeachingOrder(null, 'en')).toEqual({ kind: 'none' });
  expect(getTeachingOrder(row, 'zu')).toEqual({ kind: 'none' });
  expect(getTeachingOrder({ letter_order_edition: '2099-01-01' }, 'en')).toEqual({ kind: 'update' });
  expect(() => getTeachingOrder({}, 'en')).toThrow(TypeError); // a class object without its edition is a bug
});
test('a language edit keeps the edition and follows the language', () => {
  const row = { letter_order_edition: '2026-10-23' };
  expect(getTeachingOrder(row, 'xh').id).toBe('isixhosa-order-2026-10-23');
  expect(getTeachingOrder(row, 'af').id).toBe('afrikaans-order-2026-10-23');
});
