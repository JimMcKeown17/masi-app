import type { BatteryConfig } from '../types/BatteryConfig';
import { WELA_PLUS_FULL_2024_1 } from './wela_plus_full';

const BATTERIES = [WELA_PLUS_FULL_2024_1];

export function batteryFor(
  code: string | null | undefined,
  version: string | null | undefined,
): BatteryConfig | null {
  return BATTERIES.find(battery =>
    battery.battery_code === code && battery.battery_version === version) ?? null;
}
