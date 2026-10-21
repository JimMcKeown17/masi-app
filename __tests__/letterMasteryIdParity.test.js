import fs from 'fs';
import path from 'path';
import {
  MASI_DOMAIN_ID_NAMESPACE, deterministicDomainId, letterMasteryDomainId,
} from '../src/db/domainId';

const directory = path.join(__dirname, '..', 'supabase', 'migrations');
const filename = fs.readdirSync(directory).find((name) => name.endsWith('_letter_mastery_current_state.sql'));
const sql = fs.readFileSync(path.join(directory, filename), 'utf8');

test('the server and phone share the UUID v5 namespace and name expression', () => {
  expect(sql.match(/uuid_generate_v5\(\s*'([^']+)'::uuid/)[1]).toBe(MASI_DOMAIN_ID_NAMESPACE);
  expect(sql).toMatch(/concat_ws\(pg_catalog\.chr\(31\), 'letter_mastery', p_child_id::text, p_letter, p_language\)/);
  expect(sql).not.toMatch(/set local/i);
  expect(letterMasteryDomainId({ childId: 'ABC', letter: 'k', language: 'xh' }))
    .toBe(letterMasteryDomainId({ childId: 'abc', letter: 'k', language: 'xh' }));
  expect(letterMasteryDomainId({ childId: 'ABC', letter: 'k', language: 'xh' }))
    .toBe(deterministicDomainId('letter_mastery', 'abc', 'k', 'xh'));
});

test('set_letter_mastery pins default-safe column resolution and named conflict constraints', () => {
  const body = sql.slice(sql.search(/create or replace function public\.set_letter_mastery\(/i));
  expect(body).toMatch(/\bas \$\$\s*\n\s*#variable_conflict use_column\s*\n\s*declare\b/i);
  expect(body).toMatch(/on conflict on constraint letter_mastery_corrections_pkey do nothing/i);
  expect(body).toMatch(/on conflict on constraint letter_mastery_child_letter_language_key do update/i);
  expect(sql).not.toMatch(/on conflict\s*\(/i);
  expect(sql).toMatch(/constraint letter_mastery_corrections_pkey primary key \(correction_id\)/i);
  expect(sql).toMatch(/add constraint letter_mastery_child_letter_language_key unique \(child_id, letter, language\)/i);
});
