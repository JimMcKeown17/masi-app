// Codes are structured evidence. Human messages never participate in classification.
export const normalizeErrorCode = (raw) => {
  const code = typeof raw === 'string' ? raw.toUpperCase() : '';
  return /^[A-Z0-9_]{1,40}$/.test(code) ? code : 'OTHER';
};
