const fs = require('node:fs');
const path = require('node:path');

// Read the PostgreSQL migration as a contract only; never execute it against SQLite or a server.
test('the numeracy default migration sets only an unset numeracy default', () => {
  const sql = fs.readFileSync(path.join(__dirname,
    '../supabase/migrations/20261031120000_numeracy_maths_draft_default.sql'), 'utf8');
  const statements = sql.replace(/--[^\n]*/g, '').trim().split(';').map(s => s.trim().replace(/\s+/g, ' ')).filter(Boolean);
  expect(statements).toEqual([
    "SET lock_timeout = '10s'",
    "SET statement_timeout = '60s'",
    "update public.programmes set default_battery_code = 'masi_maths', default_battery_version = '2026.1-draft' where code = 'numeracy' and default_battery_code is null",
    'RESET statement_timeout',
    'RESET lock_timeout',
  ]);
});
