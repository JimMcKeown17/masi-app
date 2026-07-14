import { assessmentItemDomainId } from '../src/db/repositories/domainRepositoryUtils';

/**
 * ROW-IDENTITY CONTRACT — assessment_items
 *
 * `assessmentItemDomainId` derives the PRIMARY KEY of every `assessment_items`
 * row, locally and on the server (it is used by `assessmentsRepository` on write
 * and by `offlineSync` on push). Changing it is a DATA MIGRATION, not a refactor:
 * existing rows keep their old ids, new writes land under new ids, and the outbox
 * upserts by id — so a silent change produces DUPLICATE rows server-side and
 * double-counted aggregations, with no crash and no failing build.
 *
 * This test pins the LITERAL output for known inputs. It is deliberately NOT
 * written as `expect(id).toBe(assessmentItemDomainId(...))` — that recomputes the
 * expectation with the function under test, asserts f(x) == f(x), and can never
 * fail. (An earlier guard in `offlineSync.stripping.test.js` had exactly that
 * shape, which is why a rewrite of this function once merged clean with a fully
 * green suite.)
 *
 * If you are changing the id derivation ON PURPOSE, this test SHOULD fail. Do not
 * "fix" it by recomputing the constants. Instead:
 *   1. update `documentation/rls-sync-contract-map.md` (row identity is a sync contract),
 *   2. wipe/migrate existing `assessment_items` rows on `masi-app-sqlite`,
 *   3. record the decision in `documentation/build-log.md`,
 *   4. then update these constants.
 */
describe('assessment_items row-identity contract (pinned literals)', () => {
  const ASSESSMENT_ID = '11111111-1111-4111-8111-111111111111';

  it('pins the id for a positioned, correct item', () => {
    expect(assessmentItemDomainId({
      assessmentId: ASSESSMENT_ID, itemKey: 'a', position: 0, isCorrect: true,
    })).toBe('dbc7b547-5d0c-52a1-a80d-bde67ce1bcd1');
  });

  it('pins the id for a positioned, incorrect item (distinct from correct)', () => {
    expect(assessmentItemDomainId({
      assessmentId: ASSESSMENT_ID, itemKey: 'a', position: 0, isCorrect: false,
    })).toBe('a06cfcc3-6bcf-52d7-bbfd-72306f79e2c9');
  });

  it('pins the id for a positioned, unscored item', () => {
    expect(assessmentItemDomainId({
      assessmentId: ASSESSMENT_ID, itemKey: 'a', position: 5,
    })).toBe('e5bc5429-5333-5b85-b87a-7c3d3d946aca');
  });

  it('pins the id for a summary row (no position)', () => {
    expect(assessmentItemDomainId({
      assessmentId: ASSESSMENT_ID, itemKey: '__summary__',
    })).toBe('098b2803-7600-5526-a4f8-bb0c20b8e43e');
  });

  /**
   * KNOWN LATENT COLLISION — characterised deliberately, not endorsed.
   *
   * When `position` is present the current implementation uses `position ?? itemKey`,
   * so `itemKey` is DROPPED. Two rows sharing an (assessment, position, isCorrect)
   * triple collapse to one id even if their item_key differs.
   *
   * This is UNREACHABLE for EGRA: within one assessment a position holds exactly one
   * letter, so item_key never varies at a fixed position.
   *
   * It becomes REACHABLE the moment WelaPLUS Q11 (StoryWritingRubricQuestion) ships:
   * it writes an EA rubric row (`item_key='ea:<dimension>'`) and a later HQ row
   * (`item_key='hq:<dimension>'`) at the SAME position — they would collide. See
   * ADR-0004 and `documentation/open-work.md` §7.
   *
   * FIXING THIS IS A PREREQUISITE OF WIRING WelaPLUS, and must ship as its own PR
   * with a staging data migration. When it does, this test flips to `not.toBe`.
   */
  it('CHARACTERISES the known itemKey-dropped-when-positioned collision (fix before WelaPLUS Q11 ships)', () => {
    const letterA = assessmentItemDomainId({
      assessmentId: ASSESSMENT_ID, itemKey: 'a', position: 0, isCorrect: true,
    });
    const letterZ = assessmentItemDomainId({
      assessmentId: ASSESSMENT_ID, itemKey: 'z', position: 0, isCorrect: true,
    });
    expect(letterA).toBe(letterZ);
  });
});
