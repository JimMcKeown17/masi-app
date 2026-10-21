/**
 * Normalize a token for decodability checks.
 * @param {string} raw
 * @returns {string}
 */
export function normalizeToken(raw) {
  return raw.normalize('NFC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}

/**
 * Split text on whitespace and return its nonempty normalized tokens.
 * @param {string} text
 * @returns {string[]}
 */
export function tokenizeText(text) {
  return text.split(/\s+/u).map(normalizeToken).filter(token => token !== '');
}
