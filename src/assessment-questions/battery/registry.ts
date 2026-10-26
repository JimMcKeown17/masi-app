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
