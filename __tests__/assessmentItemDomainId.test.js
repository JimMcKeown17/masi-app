const { assessmentItemDomainId } = require('../src/db/repositories/domainRepositoryUtils');

describe('assessmentItemDomainId — ADR-0004 EA/HQ collision avoidance', () => {
  test('EA and HQ rubric rows for the same dimension+position get DIFFERENT deterministic IDs', () => {
    // ADR-0004 (Q11 calibration column shape): a fully calibrated Q11
    // assessment has 8 distinct assessment_items rows — 4 written by the
    // EA with `item_key='ea:<dimension>'` and 4 written later by HQ with
    // `item_key='hq:<dimension>'`. Position is identical across the
    // scorer pair (the EA's meaning_making row and HQ's meaning_making
    // row both live at position 0).
    const eaId = assessmentItemDomainId({
      assessmentId: 'A1',
      itemKey: 'ea:meaning_making',
      position: 0,
      isCorrect: false,
    });
    const hqId = assessmentItemDomainId({
      assessmentId: 'A1',
      itemKey: 'hq:meaning_making',
      position: 0,
      isCorrect: false,
    });
    expect(eaId).not.toBe(hqId);
  });

  test('4 EA + 4 HQ Q11 rows produce 8 distinct deterministic IDs (codex adversarial recommendation)', () => {
    const dimensions = ['meaning_making', 'spelling', 'length', 'vocabulary'];
    const ids = new Set();
    dimensions.forEach((dim, idx) => {
      ids.add(
        assessmentItemDomainId({
          assessmentId: 'A1',
          itemKey: `ea:${dim}`,
          position: idx,
          isCorrect: false,
        }),
      );
      ids.add(
        assessmentItemDomainId({
          assessmentId: 'A1',
          itemKey: `hq:${dim}`,
          position: idx,
          isCorrect: false,
        }),
      );
    });
    expect(ids.size).toBe(8);
  });
});

describe('assessmentItemDomainId — backwards-compatible cases', () => {
  test('summary-row shape (item_key only, no position, no isCorrect) is preserved', () => {
    // The summary row at SUMMARY_ITEM_KEY uses item_key only — its hash
    // shape is the pre-ADR-0004 3-arg form. Adding position to the hash
    // for THIS case would break every summary row already in SQLite.
    const id = assessmentItemDomainId({
      assessmentId: 'A1',
      itemKey: '__summary__',
    });
    // The function should return a stable UUID v5. We don't pin the exact
    // value (which would couple the test to the implementation hash), but
    // we DO require this call is stable across invocations.
    const idAgain = assessmentItemDomainId({
      assessmentId: 'A1',
      itemKey: '__summary__',
    });
    expect(id).toBe(idAgain);
  });

  test('different item_key values for the same position produce different IDs even with isCorrect=true', () => {
    // Pattern A (LetterSounds) writes one row per letter at a numeric
    // position. If two letters at the same position were hashed identically
    // because position dominates, two letters at the same index in
    // different runs would collide. We need item_key to disambiguate.
    const idA = assessmentItemDomainId({
      assessmentId: 'A1',
      itemKey: 'a',
      position: 0,
      isCorrect: true,
    });
    const idB = assessmentItemDomainId({
      assessmentId: 'A1',
      itemKey: 'b',
      position: 0,
      isCorrect: true,
    });
    expect(idA).not.toBe(idB);
  });

  test('different isCorrect values produce different IDs (existing behavior preserved)', () => {
    const correctId = assessmentItemDomainId({
      assessmentId: 'A1',
      itemKey: 'a',
      position: 0,
      isCorrect: true,
    });
    const incorrectId = assessmentItemDomainId({
      assessmentId: 'A1',
      itemKey: 'a',
      position: 0,
      isCorrect: false,
    });
    expect(correctId).not.toBe(incorrectId);
  });
});
