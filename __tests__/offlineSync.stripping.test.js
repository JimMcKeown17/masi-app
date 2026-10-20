jest.mock('../src/services/supabaseClient', () => ({
  ...require('../test-support/supabaseTestConfig'),
  supabase: {
    from: jest.fn(),
  },
}));

describe('offline sync payload stripping', () => {
  const { validate: uuidValidate } = require('uuid');
  const assessmentFamily = () => ({
    id: '00000000-0000-4000-8000-000000000001',
    child_id: '00000000-0000-4000-8000-000000000002',
    user_id: '00000000-0000-4000-8000-000000000003',
    programme_id: '00000000-0000-4000-8000-000000000004',
    assessment_type: 'letter_sounds',
    assessment_date: '2026-05-21',
    assessment_purpose: 'progress_check',
    question_code: 'letter_sounds',
    question_version: '2026.1',
    item_set_id: 'letter_sounds@2026.1.en',
    language: 'en',
    stopped_reason: 'completed',
    duration_ms: 1000,
    derived: { total_correct: 1 },
    battery_run_id: null,
    score: 1,
    total_items: 1,
    items: [{
      id: '00000000-0000-4000-8000-000000000005',
      assessment_id: '00000000-0000-4000-8000-000000000001',
      item_key: 'a', position: 0, prompt: 'a', response: 'a',
      is_correct: true, metadata: {},
    }],
  });

  test('keeps required class teacher while removing local-only fields', () => {
    const { _testBuildSyncPayload } = require('../src/services/offlineSync');

    const payload = _testBuildSyncPayload('classes', {
      id: 'class-1',
      name: '1A',
      teacher: 'Ms Smith',
      synced: false,
      _deleted: false,
      _pendingJobTitleResolve: true,
      pendingSessionTypeCode: 'literacy_coach',
      pendingSessionTypeName: 'Literacy Coach',
    });

    expect(payload).toEqual({
      id: 'class-1',
      name: '1A',
      teacher: 'Ms Smith',
    });
  });

  test('strips legacy children text fields before sync', () => {
    const { _testBuildSyncPayload } = require('../src/services/offlineSync');

    const payload = _testBuildSyncPayload('children', {
      id: 'child-1',
      first_name: 'A',
      last_name: 'B',
      teacher: 'Legacy Teacher',
      class: 'Legacy Class',
      school: 'Legacy School',
      class_id: 'class-1',
      synced: false,
    });

    expect(payload).toEqual({
      id: 'child-1',
      first_name: 'A',
      last_name: 'B',
      class_id: 'class-1',
    });
  });

  test('keeps the durable current reading level in children sync payloads', () => {
    const { _testBuildSyncPayload } = require('../src/services/offlineSync');

    expect(_testBuildSyncPayload('children', {
      id: 'child-1',
      first_name: 'Amahle',
      last_name: 'Dlamini',
      reading_level: 'Word Reading',
      sync_status: 'pending',
    })).toEqual({
      id: 'child-1',
      first_name: 'Amahle',
      last_name: 'Dlamini',
      reading_level: 'Word Reading',
    });
  });

  test('strips local pending-session markers, legacy Build B session_type, and view-model arrays', () => {
    const { _testBuildSyncPayload } = require('../src/services/offlineSync');

    const payload = _testBuildSyncPayload('sessions', {
      id: 'session-1',
      session_type: 'Literacy Coach',
      session_type_id: 'job-1',
      programme_id: 'programme-1',
      children_ids: ['child-1'],
      group_ids: ['group-1'],
      _pendingJobTitleResolve: true,
      pendingSessionTypeCode: 'literacy_coach',
      pendingSessionTypeName: 'Literacy Coach',
      synced: false,
    });

    expect(payload).toEqual({
      id: 'session-1',
      programme_id: 'programme-1',
    });
  });

  test('allows only normalized assessment family columns through the RPC arguments', () => {
    const { _testBuildSyncPayload } = require('../src/services/offlineSync');

    const family = assessmentFamily();
    const payload = _testBuildSyncPayload('assessments', {
      ...family,
      correct_letters: [{ letter: 'a' }],
      incorrect_letters: [{ letter: 'm' }],
      attempt_number: 1,
      items_tested: ['a'],
      updated_at: '2026-05-21T08:00:00.000Z',
      items: family.items.map(item => ({
        ...item, sync_status: 'pending', updated_at: '2026-05-21T08:00:00.000Z', view_label: 'A',
      })),
      synced: false,
    });

    const { items, ...parent } = family;
    expect(payload).toEqual({
      p_assessment: parent,
      p_items: items,
    });
  });

  test('converts legacy composite session attendee ids before pushing to UUID server columns', () => {
    const { _testBuildSyncPayload } = require('../src/services/offlineSync');

    const payload = _testBuildSyncPayload('session_attendees', {
      id: 'session-1:child-1',
      session_id: 'session-1',
      child_id: 'child-1',
      attendance_status: 'present',
      synced: false,
    });

    expect(uuidValidate(payload.id)).toBe(true);
    expect(payload.id).not.toBe('session-1:child-1');
    expect(payload).toEqual(expect.objectContaining({
      session_id: 'session-1',
      child_id: 'child-1',
      attendance_status: 'present',
    }));
  });

  test('converts legacy composite assessment item ids before pushing to UUID server columns', () => {
    const { _testBuildSyncPayload } = require('../src/services/offlineSync');
    const { assessmentItemDomainId } = require('../src/db/repositories/domainRepositoryUtils');

    const payload = _testBuildSyncPayload('assessment_items', {
      id: 'assessment-1:__summary__',
      assessment_id: 'assessment-1',
      item_key: '__summary__',
      metadata: { letters_attempted: 4 },
      synced: false,
    });

    expect(uuidValidate(payload.id)).toBe(true);
    expect(payload.id).toBe(assessmentItemDomainId({
      assessmentId: 'assessment-1',
      itemKey: '__summary__',
    }));
    expect(payload.id).not.toBe('assessment-1:__summary__');
    expect(payload).toEqual(expect.objectContaining({
      assessment_id: 'assessment-1',
      item_key: '__summary__',
      metadata: { letters_attempted: 4 },
    }));
  });

  test('preserves stored assessment item UUIDs inside the family RPC payload', () => {
    const { _testBuildSyncPayload } = require('../src/services/offlineSync');

    const family = assessmentFamily();
    const { p_items: items } = _testBuildSyncPayload('assessments', family);
    expect(uuidValidate(items[0].id)).toBe(true);
    expect(items[0].id).toBe(family.items[0].id);
    expect(items).toEqual(family.items);
  });

});
