SET lock_timeout = '10s';
SET statement_timeout = '60s';

-- 2026-10-26 spec §7: EAs receive the new cards and app together; preserve any Head Office choice beyond 2024.1.
update public.programmes set default_battery_code = 'wela_plus_full', default_battery_version = '2026.1' where code = 'literacy' and default_battery_code = 'wela_plus_full' and default_battery_version = '2024.1';

RESET statement_timeout;
RESET lock_timeout;
