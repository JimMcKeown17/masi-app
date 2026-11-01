import fs from 'fs';
import path from 'path';
import {
  MASI_DOMAIN_ID_NAMESPACE, SKILL_MASTERY_ID_NAMESPACE, skillMasteryDomainId,
} from '../src/db/domainId';

const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations',
  '20261101120000_skill_mastery_current_state.sql'), 'utf8');

test('the server and phone share the skill mastery namespace and name expression', () => {
  expect(sql.match(/uuid_generate_v5\(\s*'([^']+)'::uuid/)[1]).toBe(SKILL_MASTERY_ID_NAMESPACE);
  expect(SKILL_MASTERY_ID_NAMESPACE).not.toBe(MASI_DOMAIN_ID_NAMESPACE);
  expect(sql).toMatch(/concat_ws\(pg_catalog\.chr\(31\), 'skill_mastery', p_child_id::text, p_step_key\)/);
  expect(sql).not.toMatch(/set local/i);
  expect(skillMasteryDomainId('ABC', 'add.5')).toBe(skillMasteryDomainId('abc', 'add.5'));
  expect(skillMasteryDomainId('abc', 'add.5')).not.toBe(skillMasteryDomainId('abc', 'add.10'));
});

test('set_skill_mastery pins column resolution and named conflict constraints', () => {
  const body = sql.slice(sql.search(/create or replace function public\.set_skill_mastery\(/i));
  expect(body).toMatch(/\bas \$\$\s*\n\s*#variable_conflict use_column\s*\n\s*declare\b/i);
  expect(body).toMatch(/on conflict on constraint skill_mastery_corrections_pkey do nothing/i);
  expect(body).toMatch(/on conflict on constraint skill_mastery_child_step_key_key do update/i);
  expect(sql).not.toMatch(/on conflict\s*\(/i);
});
