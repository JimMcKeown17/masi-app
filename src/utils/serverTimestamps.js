const SAFE = BigInt(Number.MAX_SAFE_INTEGER);

// Parse whole seconds separately from the fractional digits. A Date round-trip of the
// fractional timestamp would discard the microseconds that order accepted server states.
export const serverTimestampMicros = (value) => {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|([+-])(\d{2}):(\d{2}))$/.exec(value);
  if (!match) return null;
  const [, y, m, d, h, min, s, fraction = '', zone, sign, offsetH = '0', offsetM = '0'] = match;
  const year = Number(y), month = Number(m), day = Number(d);
  const hour = Number(h), minute = Number(min), second = Number(s);
  if (hour > 24 || minute > 59 || second > 59 || Number(offsetH) > 23 || Number(offsetM) > 59
    || (hour === 24 && (minute !== 0 || second !== 0 || /[1-9]/.test(fraction)))) return null;
  const whole = new Date(0);
  whole.setUTCFullYear(year, month - 1, day);
  if (whole.getUTCFullYear() !== year || whole.getUTCMonth() !== month - 1 || whole.getUTCDate() !== day) return null;
  whole.setUTCHours(hour, minute, second, 0);
  const offset = zone === 'Z' ? 0 : (sign === '+' ? 1 : -1) * (Number(offsetH) * 60 + Number(offsetM));
  const micros = BigInt(whole.getTime() - offset * 60_000) * 1000n + BigInt(fraction.padEnd(6, '0'));
  return micros < -SAFE || micros > SAFE ? null : Number(micros);
};

export const compareServerTimestamps = (a, b) => {
  const atA = serverTimestampMicros(a), atB = serverTimestampMicros(b);
  if (atA === null || atB === null) return null;
  return atA < atB ? -1 : atA > atB ? 1 : 0;
};

export const compareServerTuples = ([atA, idA], [atB, idB]) => {
  const time = compareServerTimestamps(atA, atB);
  if (time !== 0) return time;
  if (typeof idA !== 'string' || typeof idB !== 'string') return null;
  const a = idA.toLowerCase(), b = idB.toLowerCase();
  return a < b ? -1 : a > b ? 1 : 0;
};
