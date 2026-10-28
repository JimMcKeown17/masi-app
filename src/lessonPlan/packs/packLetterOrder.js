export const LEGACY_PACK_LETTER_ORDERS = Object.freeze({
  'isixhosa-interim-letters-v1': 'isixhosa-order-2026-10-18',
  'isixhosa-candidates-preview-v1': 'isixhosa-order-2026-10-18',
  'english-interim-letters-v1': 'english-order-legacy',
  'afrikaans-interim-letters-v1': 'afrikaans-order-legacy',
});

export function packLetterOrderId(pack) {
  if (pack === null || typeof pack !== 'object') return null;
  if (Object.prototype.hasOwnProperty.call(pack, 'letter_order')) {
    return typeof pack.letter_order === 'string' ? pack.letter_order : null;
  }
  return Object.prototype.hasOwnProperty.call(LEGACY_PACK_LETTER_ORDERS, pack.id)
    ? LEGACY_PACK_LETTER_ORDERS[pack.id] : null;
}
