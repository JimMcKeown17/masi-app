describe('normalizeProfile', () => {
  const loadNormalizer = () => require('../src/utils/profileNormalizer');

  test('normalizes a legacy string-only profile', () => {
    expect(loadNormalizer).not.toThrow();
    const { normalizeProfile } = loadNormalizer();

    const result = normalizeProfile({
      id: 'user-1',
      first_name: 'A',
      assigned_school: 'Masi Primary',
      job_title: 'Literacy Coach',
    });

    expect(result.schoolName).toBe('Masi Primary');
    expect(result.schoolId).toBeNull();
    expect(result.jobTitleName).toBe('Literacy Coach');
    expect(result.jobTitleId).toBeNull();
    expect(result.jobTitleCode).toBe('literacy_coach');
  });

  test('prefers joined lookup values over legacy strings', () => {
    const { normalizeProfile } = loadNormalizer();

    const result = normalizeProfile({
      assigned_school: 'Old School',
      job_title: 'Old Role',
      school_lookup: { id: 'school-1', name: 'Canonical School' },
      job_title_lookup: { id: 'job-1', name: 'Numeracy Coach', code: 'numeracy_coach' },
    });

    expect(result.schoolName).toBe('Canonical School');
    expect(result.schoolId).toBe('school-1');
    expect(result.jobTitleName).toBe('Numeracy Coach');
    expect(result.jobTitleId).toBe('job-1');
    expect(result.jobTitleCode).toBe('numeracy_coach');
  });

  test('preserves already-normalized cached fields when lookup objects are absent', () => {
    const { normalizeProfile } = loadNormalizer();

    const result = normalizeProfile({
      id: 'user-1',
      schoolName: 'Cached School',
      schoolId: 'school-2',
      jobTitleName: 'Yeboneer',
      jobTitleId: 'job-4',
      jobTitleCode: 'yeboneer',
    });

    expect(result.schoolName).toBe('Cached School');
    expect(result.schoolId).toBe('school-2');
    expect(result.jobTitleName).toBe('Yeboneer');
    expect(result.jobTitleId).toBe('job-4');
    expect(result.jobTitleCode).toBe('yeboneer');
  });

  test('normalizes a final FK-only profile without erasing IDs', () => {
    const { normalizeProfile } = loadNormalizer();

    const result = normalizeProfile({
      id: 'user-1',
      school_id: 'school-final',
      job_title_id: 'job-final',
      school_lookup: { id: 'school-final', name: 'Final School' },
      job_title_lookup: { id: 'job-final', name: '1000 Stories', code: 'one_thousand_stories' },
    });

    expect(result.schoolName).toBe('Final School');
    expect(result.schoolId).toBe('school-final');
    expect(result.jobTitleName).toBe('1000 Stories');
    expect(result.jobTitleId).toBe('job-final');
    expect(result.jobTitleCode).toBe('one_thousand_stories');
  });
});
