import registry from '../constants/contracts/letter-orders-v1.json';
import { PACK_LANGUAGE_BY_CODE } from '../lessonPlan/engine/constants';

function deepFreeze(value) {
  if (value !== null && typeof value === 'object') {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

export const LETTER_ORDER_REGISTRY = deepFreeze(registry);
export const MASI_LETTER_ORDER_EDITIONS = Object.freeze(['2026-10-23']);
export const NEW_CLASS_LETTER_ORDER_EDITION = '2026-10-23';
export const UPDATE_APP_LETTERS_MESSAGE = "Update the app to teach this class's letters.";

export class LetterOrderError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'LetterOrderError';
    this.code = code;
  }
}

export function createLetterOrderResolver(registry) {
  deepFreeze(registry);
  const cache = new Map();

  function getLetterOrder(orderId) {
    if (typeof orderId !== 'string') return null;
    return registry.orders.find(order => order.id === orderId) ?? null;
  }

  function resolveTeachingOrder(edition, languageCode) {
    if (typeof languageCode !== 'string'
      || !Object.prototype.hasOwnProperty.call(PACK_LANGUAGE_BY_CODE, languageCode)) return null;

    const language = PACK_LANGUAGE_BY_CODE[languageCode];
    const entry = registry.editions.find(entry => entry.id === edition);
    if (!entry) {
      throw new LetterOrderError('UNKNOWN_EDITION', `Unknown letter order edition: ${edition}`);
    }

    const cached = cache.get(edition)?.get(languageCode);
    if (cached) return cached;

    const order = getLetterOrder(entry.orders[language]);
    if (!order) {
      throw new LetterOrderError('MISSING_ORDER', `Missing letter order for ${edition}: ${languageCode}`);
    }

    const result = Object.freeze({ id: order.id, letters: Object.freeze(order.letter_steps.flat()) });
    if (!cache.has(edition)) cache.set(edition, new Map());
    cache.get(edition).set(languageCode, result);
    return result;
  }

  return { getLetterOrder, resolveTeachingOrder };
}

export const { getLetterOrder, resolveTeachingOrder } = createLetterOrderResolver(LETTER_ORDER_REGISTRY);

export function getTeachingOrder(classRow, languageCode) {
  if (classRow == null) return { kind: 'none' };
  if (typeof classRow.letter_order_edition !== 'string') {
    throw new TypeError('A class must have a letter order edition.');
  }

  try {
    const order = resolveTeachingOrder(classRow.letter_order_edition, languageCode);
    return order ? { kind: 'order', ...order } : { kind: 'none' };
  } catch (error) {
    if (error instanceof LetterOrderError && error.code === 'UNKNOWN_EDITION') {
      return { kind: 'update' };
    }
    throw error;
  }
}

export function sortLettersByOrder(letters, orderLetters) {
  if (!Array.isArray(orderLetters)) return [...letters];
  const positions = new Map(orderLetters.map((letter, index) => [letter, index]));
  return [...letters].sort((a, b) => (positions.get(a) ?? orderLetters.length)
    - (positions.get(b) ?? orderLetters.length));
}
