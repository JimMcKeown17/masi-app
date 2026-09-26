// __tests__/sessionHistoryFamilyDeltaMigration.test.js
const fs = require('fs');
const path = require('path');

const MIGRATION = path.join(
  __dirname, '..', 'supabase', 'migrations', '20260925120000_session_history_family_delta.sql'
);
const normalize = (sql) => sql.replace(/--.*$/gm, '').replace(/\s+/g, ' ').trim();

describe('CAP-004 session history family delta migration', () => {
  const sql = normalize(fs.readFileSync(MIGRATION, 'utf8'));

  test('the server stamps updated_at on insert and update for both family tables', () => {
    expect(sql).toMatch(/create trigger sessions_set_updated_at before insert or update on public\.sessions for each row execute function private\.set_updated_at\(\)/i);
    expect(sql).toMatch(/create trigger session_attendees_set_updated_at before insert or update on public\.session_attendees for each row execute function private\.set_updated_at\(\)/i);
  });

  test('attendee writes touch the parent through a definer trigger with an empty search path', () => {
    expect(sql).toMatch(/create or replace function private\.touch_session_family\(\) returns trigger language plpgsql security definer set search_path = ''/i);
    expect(sql).toMatch(/create trigger session_attendees_touch_session_family after insert or update or delete on public\.session_attendees for each row execute function private\.touch_session_family\(\)/i);
  });

  test('both RPCs are definer functions, bounded, and granted only to authenticated', () => {
    for (const [name, args] of [
      ['get_delivery_history_page', 'uuid, date, integer, timestamptz, uuid, integer'],
      ['get_delivery_history_attendee_page', 'uuid\\[\\], integer, uuid, uuid'],
    ]) {
      expect(sql).toMatch(new RegExp(`create or replace function public\\.${name}\\([\\s\\S]+?security definer set search_path = ''`, 'i'));
      expect(sql).toMatch(new RegExp(`revoke execute on function public\\.${name}\\( ?${args} ?\\) from public, anon`, 'i'));
      expect(sql).toMatch(new RegExp(`grant execute on function public\\.${name}\\( ?${args} ?\\) to authenticated`, 'i'));
    }
    expect(sql).toMatch(/p_page_size is null or p_page_size < 1 or p_page_size > 200/i);
    expect(sql).toMatch(/p_overlap_seconds is null or p_overlap_seconds < 0 or p_overlap_seconds > 600/i);
  });

  test('each grant arm is ordered and limited before the merge', () => {
    expect(sql).toMatch(/owner_arm as \( select s\.id from public\.sessions s where s\.user_id = v_actor_id[\s\S]+?order by s\.updated_at, s\.id limit p_page_size \)/i);
    expect(sql).toMatch(/delivery_arm as \( select s\.id from public\.sessions s where[\s\S]+?s\.id in \( select sa\.session_id from public\.child_ea_assignments cea join public\.session_attendees sa on sa\.child_id = cea\.child_id where cea\.user_id = v_actor_id \)[\s\S]+?order by s\.updated_at, s\.id limit p_page_size \)/i);
    expect(sql).not.toMatch(/class_ea_assignments|group_ea_assignments|created_by/i);
  });

  test('the date-ordered RPC and its index are dropped', () => {
    expect(sql).toMatch(/drop function if exists public\.get_delivery_history_session_page\( ?uuid, integer, date, timestamptz, uuid ?\)/i);
    expect(sql).toMatch(/drop index if exists public\.idx_sessions_owner_programme_history_cursor/i);
  });
});
