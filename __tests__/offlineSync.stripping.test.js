jest.mock('../src/services/supabaseClient', () => ({
  supabase: {
    from: jest.fn(),
  },
}));

describe('offline sync payload stripping', () => {
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

  test('strips local pending-session markers and legacy Build B session_type', () => {
    const { _testBuildSyncPayload } = require('../src/services/offlineSync');

    const payload = _testBuildSyncPayload('sessions', {
      id: 'session-1',
      session_type: 'Literacy Coach',
      session_type_id: 'job-1',
      _pendingJobTitleResolve: true,
      pendingSessionTypeCode: 'literacy_coach',
      pendingSessionTypeName: 'Literacy Coach',
      synced: false,
    });

    expect(payload).toEqual({
      id: 'session-1',
      session_type_id: 'job-1',
    });
  });
});
