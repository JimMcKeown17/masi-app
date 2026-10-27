import type { BatteryConfig } from '../types/BatteryConfig';
import { WELA_PLUS_FULL_2024_1 } from './wela_plus_full';
import { WELA_PLUS_FULL_2026_1 } from './wela_plus_full_2026_1';
import { EGRA_BATTERIES } from '../egra';
import { FULL_EGRA_2026_1 } from '../egra/fullEgra';

const BATTERIES = [WELA_PLUS_FULL_2024_1, WELA_PLUS_FULL_2026_1, FULL_EGRA_2026_1, ...EGRA_BATTERIES];
const identities = new Set<string>();
for (const battery of BATTERIES) {
  const key = `${battery.battery_code}@${battery.battery_version}`;
  if (identities.has(key)) throw new TypeError(`Duplicate battery: ${key}`);
  identities.add(key);
}

export function batteryFor(
  code: string | null | undefined,
  version: string | null | undefined,
): BatteryConfig | null {
  return BATTERIES.find(battery =>
    battery.battery_code === code && battery.battery_version === version) ?? null;
}

// New runs use the current instrument; saved runs keep their original identity.
// The 13 old EGRA forms are offered for saved and unfinished assessments only.
const FULL_EGRA = `${FULL_EGRA_2026_1.battery_code}@${FULL_EGRA_2026_1.battery_version}`;
const SUPERSEDED_VERSIONS = new Map<string, string>([
  ['wela_plus_full@2024.1', 'wela_plus_full@2026.1'],
  ...EGRA_BATTERIES.map(battery => [`${battery.battery_code}@${battery.battery_version}`, FULL_EGRA] as [string, string]),
]);

export function batteryForNewRun(
  code: string | null | undefined,
  version: string | null | undefined,
): BatteryConfig | null {
  if (!code || !version) return null;
  let identity = `${code}@${version}`;
  const visited = new Set<string>();
  while (SUPERSEDED_VERSIONS.has(identity)) {
    if (visited.has(identity)) return null;
    visited.add(identity);
    identity = SUPERSEDED_VERSIONS.get(identity)!;
  }
  return BATTERIES.find(battery =>
    `${battery.battery_code}@${battery.battery_version}` === identity) ?? null;
}
