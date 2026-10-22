const { assertSubmitShape } = require('../src/services/assessmentFamilyPayload');
const { v5 } = require('uuid');
const {
  buildProbeFamilies, validateProbePage, buildVolumeFixture, validateProbeEnv, parseArgs, formatProbeFailure,
} = require('../scripts/assessment-history-http-probe.cjs');

const userId = '18000000-0000-0000-0000-000000000001';
const coEaUserId = '18000000-0000-0000-0000-000000000002';
const childId = '58000000-0000-0000-0000-000000000001';
const programmeId = '38000000-0000-0000-0000-000000000001';
const academicYearId = '28000000-0000-0000-0000-000000000001';
const input = { userId, childId, programmeId, assessmentDate: '2026-06-01' };
const validEnv = {
  SUPABASE_PROJECT_URL_SQLITE: 'https://segygjzpujphwvrubusm.supabase.co',
  SUPABASE_PROJECT_ID_SQLITE: 'segygjzpujphwvrubusm',
  SUPABASE_PUBLISHABLE_KEY_SQLITE: 'test-publishable-value',
  SUPABASE_SECRET_KEY_SQLITE: 'test-secret-value',
};
const pageOf = ({ assessments, items }) => assessments.map(a => ({
  ...a, items: items.filter(i => i.assessment_id === a.id),
}));

describe('assessment history HTTP probe pure helpers', () => {
  test('buildProbeFamilies defaults give 20 families and 1,220 items, every family passing assertSubmitShape', () => {
    const built = buildProbeFamilies(input);
    expect(built.assessments).toHaveLength(20);
    expect(built.items).toHaveLength(1220);
    for (const family of pageOf(built)) {
      expect(() => assertSubmitShape(family)).not.toThrow();
      expect(family.user_id).toBe(userId);
      expect(family.child_id).toBe(childId);
      expect(family.programme_id).toBe(programmeId);
      expect(family.assessment_date).toBe('2026-06-01');
    }
    expect(new Set([...built.assessments, ...built.items].map(r => r.id)).size).toBe(1240);
    const again = buildProbeFamilies(input);
    expect(built.assessments.some(a => again.assessments.some(b => a.id === b.id))).toBe(false);
  });

  test('validateProbePage rejects a page with one 60-item family and accepts the full page', () => {
    const page = pageOf(buildProbeFamilies(input));
    const options = { families: 20, itemsPerFamily: 61 };
    expect(validateProbePage(page, options)).toEqual({ ok: true, errors: [] });
    const short = page.map((row, n) => n ? row : { ...row, items: row.items.slice(0, 60) });
    expect(validateProbePage(short, options).ok).toBe(false);
    expect(validateProbePage(short, options).errors.length).toBeGreaterThan(0);
  });

  test('buildVolumeFixture defaults give exactly 140 families, 8,540 items and 780 mastery rows', () => {
    const { tables } = buildVolumeFixture({ eaUserId: userId, coEaUserId, programmeId, academicYearId });
    expect(tables.classes).toHaveLength(2);
    expect(tables.children).toHaveLength(70);
    expect(tables.assessments).toHaveLength(140);
    expect(tables.assessment_items).toHaveLength(8540);
    expect(tables.letter_mastery).toHaveLength(780);
    expect(tables.class_ea_assignments).toHaveLength(2);
    expect(tables.child_ea_assignments).toHaveLength(30);
    expect(tables.class_ea_assignments.every(a => a.ea_user_id === userId)).toBe(true);
    expect(tables.child_ea_assignments.every(a => a.user_id === userId)).toBe(true);
    expect(tables.assessments.every(a => a.user_id === coEaUserId)).toBe(true);
    expect(tables.child_class_memberships.every(m => m.academic_year_id === academicYearId)).toBe(true);
    for (const family of pageOf({ assessments: tables.assessments, items: tables.assessment_items })) {
      expect(() => assertSubmitShape(family)).not.toThrow();
    }
    for (const row of tables.letter_mastery) {
      expect(row.id).toBe(v5(['letter_mastery', row.child_id, row.letter, row.language].join('\x1f'),
        '09dcf4b2-6c53-4c46-917f-33bc7f2df4d2'));
      expect(row).not.toHaveProperty('user_id');
      expect(row.changed_by).toBe(coEaUserId);
    }
  });

  test('validateProbeEnv refuses jcqrlwetutnpuchjoyyd', () => {
    expect(() => validateProbeEnv({
      ...validEnv,
      SUPABASE_PROJECT_ID_SQLITE: 'jcqrlwetutnpuchjoyyd',
      SUPABASE_PROJECT_URL_SQLITE: 'https://jcqrlwetutnpuchjoyyd.supabase.co',
    })).toThrow(/segygjzpujphwvrubusm/);
  });

  test.each([
    'https://segygjzpujphwvrubusm.supabase.co.attacker.invalid',
    'https://attacker.invalid/segygjzpujphwvrubusm',
    'https://segygjzpujphwvrubusm.supabase.co@attacker.invalid',
    'http://segygjzpujphwvrubusm.supabase.co',
    'https://segygjzpujphwvrubusm.supabase.co:444',
    'https://segygjzpujphwvrubusm.supabase.co/?redirect=elsewhere',
  ])('refuses a URL that is not exactly the allowed project endpoint: %s', url => {
    expect(() => validateProbeEnv({ ...validEnv, SUPABASE_PROJECT_URL_SQLITE: url })).toThrow();
  });

  test('accepts only the four sqlite env values with the allowed project', () => {
    expect(validateProbeEnv(validEnv)).toEqual(validEnv);
    for (const key of Object.keys(validEnv)) {
      expect(() => validateProbeEnv({ ...validEnv, [key]: '' })).toThrow();
    }
  });

  test('page validation rejects truncation, out-of-order positions, duplicate parents and a sub-cap control', () => {
    const page = pageOf(buildProbeFamilies(input));
    const options = { families: 20, itemsPerFamily: 61 };
    expect(validateProbePage(page.slice(1), options).ok).toBe(false);
    expect(validateProbePage([{ ...page[0], total_items: 60 }, ...page.slice(1)], options).ok).toBe(false);
    expect(validateProbePage([{ ...page[0], items: [...page[0].items].reverse() }, ...page.slice(1)], options).ok).toBe(false);
    expect(validateProbePage([page[1], ...page.slice(1)], options).ok).toBe(false);
    expect(validateProbePage(page.slice(0, 1), { families: 1, itemsPerFamily: 61 }).ok).toBe(false);
    expect(validateProbePage(null, options).ok).toBe(false);
    expect(validateProbePage([{ ...page[0], items: null }, ...page.slice(1)], options).ok).toBe(false);
  });

  test('volume fixture overrides preserve child, class, enrollment and delivery references', () => {
    const { tables } = buildVolumeFixture({ eaUserId: userId, coEaUserId, programmeId, academicYearId,
      classes: 1, childrenPerClass: 2, resultsPerChild: 1, deliveryChildren: 1, confirmationsPerChild: 3 });
    expect(tables.assessments).toHaveLength(2);
    expect(tables.assessment_items).toHaveLength(122);
    expect(tables.letter_mastery).toHaveLength(3);
    expect(tables.child_programme_enrollments).toHaveLength(2);
    expect(tables.children.every(c => c.class_id === tables.classes[0].id)).toBe(true);
    expect(tables.child_class_memberships.map(m => m.child_id).sort())
      .toEqual(tables.children.map(c => c.id).sort());
    expect(tables.letter_mastery.every(m => m.child_id === tables.child_ea_assignments[0].child_id)).toBe(true);
  });

  test('volume relationship ids match the mobile active-pair contract', () => {
    const { tables } = buildVolumeFixture({ eaUserId: userId, coEaUserId, programmeId, academicYearId });
    const expectedId = (...parts) => v5(parts.join('\x1f'), '09dcf4b2-6c53-4c46-917f-33bc7f2df4d2');
    for (const row of tables.child_ea_assignments) {
      expect(row.id).toBe(expectedId('child_ea_assignments', row.user_id, row.child_id));
    }
    for (const row of tables.class_ea_assignments) {
      expect(row.id).toBe(expectedId('class_ea_assignments', row.class_id, row.ea_user_id, row.programme_id));
    }
    for (const row of tables.child_programme_enrollments) {
      expect(row.id).toBe(expectedId('child_programme_enrollments', row.child_id, row.programme_id));
    }
  });

  test('mode parsing requires an explicit valid namespace for cleanup', () => {
    expect(parseArgs([])).toMatchObject({ mode: 'probe' });
    expect(parseArgs(['seed-volume'])).toMatchObject({ mode: 'seed-volume' });
    expect(parseArgs(['cleanup-volume', '--namespace', userId])).toEqual({ mode: 'cleanup-volume', namespace: userId });
    for (const args of [['cleanup-volume'], ['cleanup-volume', '--namespace', 'bad'], ['probe', 'extra'], ['secret-input']]) {
      expect(() => parseArgs(args)).toThrow();
    }
  });

  test('failure output never prints arbitrary error or credential values', () => {
    for (const error of [new Error('password=private service-key=private'), 'access-token=private', { message: 'private' }]) {
      expect(formatProbeFailure(error)).toBe('FAIL assessment history probe: configuration or execution failed\n');
    }
    try { validateProbeEnv({ ...validEnv, SUPABASE_PROJECT_URL_SQLITE: `https://${validEnv.SUPABASE_SECRET_KEY_SQLITE}@attacker.invalid` }); }
    catch (error) { expect(formatProbeFailure(error)).not.toContain(validEnv.SUPABASE_SECRET_KEY_SQLITE); }
  });
});
