const loadResolver = () => require('../src/utils/sessionTypeResolver');

describe('sessionTypeResolver', () => {
  test('uses normalized profile jobTitleId first for Build B session writes', () => {
    expect(loadResolver).not.toThrow();
    const { buildSessionTypeFields } = loadResolver();

    expect(buildSessionTypeFields({
      profile: {
        jobTitleId: 'job-profile',
        jobTitleCode: 'literacy_coach',
        jobTitleName: 'Literacy Coach',
      },
      jobTitlesCache: [],
    })).toEqual({
      session_type_id: 'job-profile',
    });
  });

  test('resolves from cached job titles by code before display name', () => {
    const { buildSessionTypeFields } = loadResolver();

    expect(buildSessionTypeFields({
      profile: {
        jobTitleCode: 'literacy_coach',
        jobTitleName: 'Literacy Coach',
      },
      jobTitlesCache: [
        { id: 'job-name-only', name: 'Literacy Coach' },
        { id: 'job-code', code: 'literacy_coach', name: 'Literacy Coach' },
      ],
    })).toEqual({
      session_type_id: 'job-code',
    });
  });

  test('marks the local session pending without writing legacy session_type when no ID can be resolved', () => {
    const { buildSessionTypeFields } = loadResolver();

    expect(buildSessionTypeFields({
      profile: {
        jobTitleCode: 'literacy_coach',
        jobTitleName: 'Literacy Coach',
      },
      jobTitlesCache: [],
    })).toEqual({
      _pendingJobTitleResolve: true,
      pendingSessionTypeCode: 'literacy_coach',
      pendingSessionTypeName: 'Literacy Coach',
    });
  });
});
