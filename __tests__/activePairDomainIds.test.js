const {
  childEaAssignmentDomainId,
  childProgrammeEnrollmentDomainId,
  classEaAssignmentDomainId,
  groupEaAssignmentDomainId,
  deterministicDomainId,
} = require('../src/db/repositories/domainRepositoryUtils');

describe('active-pair deterministic ids (#47)', () => {
  test('each is keyed exactly on its server index columns and is table-namespaced', () => {
    expect(childEaAssignmentDomainId({ userId: 'u1', childId: 'c1' }))
      .toBe(deterministicDomainId('child_ea_assignments', 'u1', 'c1'));
    expect(childProgrammeEnrollmentDomainId({ childId: 'c1', programmeId: 'p1' }))
      .toBe(deterministicDomainId('child_programme_enrollments', 'c1', 'p1'));
    expect(classEaAssignmentDomainId({ classId: 'cl1', eaUserId: 'u1', programmeId: 'p1' }))
      .toBe(deterministicDomainId('class_ea_assignments', 'cl1', 'u1', 'p1'));
    expect(groupEaAssignmentDomainId({ groupId: 'g1' }))
      .toBe(deterministicDomainId('group_ea_assignments', 'g1'));
  });

  test('group_ea id depends on group_id ALONE (matches the server index)', () => {
    // two different EAs on the same group derive the SAME id, so the second push is an
    // id-match (ignoreDuplicates no-op), never a partial-index 23505.
    expect(groupEaAssignmentDomainId({ groupId: 'g1' }))
      .toBe(groupEaAssignmentDomainId({ groupId: 'g1' }));
  });

  test('same pair -> same id across calls (idempotent)', () => {
    expect(childEaAssignmentDomainId({ userId: 'u1', childId: 'c1' }))
      .toBe(childEaAssignmentDomainId({ userId: 'u1', childId: 'c1' }));
  });
});
