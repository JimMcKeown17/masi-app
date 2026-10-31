SET lock_timeout = '10s';
SET statement_timeout = '60s';

-- 2026-10-31 maths spec §7.1: numeracy EAs get the draft Maths assessment; preserve any Head Office choice.
update public.programmes set default_battery_code = 'masi_maths', default_battery_version = '2026.1-draft' where code = 'numeracy' and default_battery_code is null;

RESET statement_timeout;
RESET lock_timeout;
