import React from 'react';
import { act, render, fireEvent, within } from '@testing-library/react-native';
import { ScrollView } from 'react-native';
import { WELA_PLUS_LETTER_WRITING_EN } from '../../../itemsets/wela_plus_letter_writing.en';
import { WELA_PLUS_LETTER_WRITING_XH } from '../../../itemsets/wela_plus_letter_writing.xh';
import { ContentText, PagedGrid } from '../../../ui';
import { LetterWritingFromPicturesQuestion } from '..';
import { FIXTURE_LETTER_WRITING_EN } from '../../../testFixtures';
import { WELA_PLUS_FULL_2024_1 } from '../../../battery/wela_plus_full';

const mark = (r: ReturnType<typeof render>, label = 'Correct', count = 1) => {
  for (let i = 0; i < count; i += 1) fireEvent.press(r.getByText(label));
};
const end = (r: ReturnType<typeof render>) => {
  fireEvent.press(r.getByTestId('letter-writing-end'));
  fireEvent.press(within(r.getByTestId('end-confirmation')).getByText('End question'));
};
const tile = (r: ReturnType<typeof render>, position: number) => within(r.getByTestId('picture-grid')).getByTestId(`tile-${position}`);

describe('LetterWritingFromPicturesQuestion — intro & first page', () => {
  test('Start renders 8 cells on page 1 with picture alt + expected letter', () => {
    const { getByText } = render(
      <LetterWritingFromPicturesQuestion
        language="en"
        itemSet={FIXTURE_LETTER_WRITING_EN}
        instructions="."
        onComplete={jest.fn()}
      />,
    );
    fireEvent.press(getByText('Start'));
    // First 8 alts: apple, ball, cat, dog, egg, frog, goat, hat
    expect(getByText('apple')).toBeTruthy();
    expect(getByText('hat')).toBeTruthy();
    // Expected-letter labels for the EA's recall: 'a' next to apple etc.
    expect(getByText('a')).toBeTruthy();
  });
});

describe('LetterWritingFromPicturesQuestion — pagination', () => {
  test('marking the first page advances to page 2', () => {
    const { getByText, getByLabelText } = render(
      <LetterWritingFromPicturesQuestion
        language="en"
        itemSet={FIXTURE_LETTER_WRITING_EN}
        instructions="."
        onComplete={jest.fn()}
      />,
    );
    fireEvent.press(getByText('Start'));
    for (let i = 0; i < 8; i += 1) fireEvent.press(getByText('Correct'));
    // Page 2: ink, jug, kite, log, mug, nut, orange, pig
    expect(getByText('ink')).toBeTruthy();
    expect(getByText('pig')).toBeTruthy();
  });

  test('Back across the page boundary returns to page 1', () => {
    const { getByText, getByLabelText, queryByText } = render(
      <LetterWritingFromPicturesQuestion
        language="en"
        itemSet={FIXTURE_LETTER_WRITING_EN}
        instructions="."
        onComplete={jest.fn()}
      />,
    );
    fireEvent.press(getByText('Start'));
    for (let i = 0; i < 8; i += 1) fireEvent.press(getByText('Correct'));
    fireEvent.press(getByText('Back'));
    expect(getByText('apple')).toBeTruthy();
    expect(queryByText('ink')).toBeNull();
  });
});

describe('LetterWritingFromPicturesQuestion — sequential marking', () => {
  test('a marked cell flips without moving the current ring', () => {
    const r = render(<LetterWritingFromPicturesQuestion language="en" itemSet={FIXTURE_LETTER_WRITING_EN} onComplete={jest.fn()} />);
    fireEvent.press(r.getByText('Start'));
    expect(tile(r, 0).props.accessibilityLabel).toBe('apple → a, current');
    expect(within(r.getByTestId('picture-grid')).queryAllByRole('button')).toHaveLength(0);
    mark(r);
    expect(tile(r, 0).props.accessibilityLabel).toBe('apple → a, correct. Double-tap to change to incorrect');
    fireEvent.press(tile(r, 0));
    expect(tile(r, 0).props.accessibilityLabel).toBe('apple → a, incorrect. Double-tap to change to correct');
    expect(tile(r, 1).props.accessibilityLabel).toBe('ball → b, current');
    expect(r.getByText('Letter 1 changed to Incorrect')).toBeTruthy();
  });

  test('ending early saves reached marks and excludes the unmarked tail from the score', () => {
    const onComplete = jest.fn();
    const r = render(<LetterWritingFromPicturesQuestion language="en" itemSet={FIXTURE_LETTER_WRITING_EN} onComplete={onComplete} />);
    fireEvent.press(r.getByText('Start'));
    mark(r, 'Correct', 3);
    mark(r, 'Incorrect');
    expect(r.queryByText('Finish')).toBeNull();
    end(r);
    expect(onComplete).toHaveBeenCalledTimes(1);
    const result = onComplete.mock.calls[0][0];
    expect(result).toMatchObject({ question_code: 'wela_plus_letter_writing', stopped_reason: 'ea_ended',
      derived: { total_correct: 3, total_attempted: 4, percent: 75, last_attempted_position: 3,
        was_timed: false, tracks_progress: true, capture_mode: 'sequential', correction_count: 0, max_consecutive_wrong: 1 } });
    expect(result.items).toHaveLength(26);
    expect(result.items.map((item: any) => item.metadata)).toEqual(Array.from({ length: 26 }, (_, position) => ({ reached: position < 4 })));
    expect(result.items.slice(4).every((item: any) => item.is_correct === false)).toBe(true);
  });
});

describe('LetterWritingFromPicturesQuestion — Skip flow', () => {
  test('Skip picker emits Result', () => {
    const onComplete = jest.fn();
    const { getByText } = render(
      <LetterWritingFromPicturesQuestion
        language="en"
        itemSet={FIXTURE_LETTER_WRITING_EN}
        instructions="."
        onComplete={onComplete}
      />,
    );
    fireEvent.press(getByText('Start'));
    fireEvent.press(getByText('Skip question'));
    fireEvent.press(getByText('Child refused'));
    expect(onComplete.mock.calls[0][0].stopped_reason).toBe('skipped_child_refused');
  });

  test('skipped_* reason emits items=[] (no bogus failed rows for skip)', () => {
    // Adversarial review finding: skipped Questions must not persist as if
    // every item was answered wrong. Components emit no per-item data on
    // skip; the host's persistence layer is responsible for translating
    // items=[] + stopped_reason=skipped_* into NULL score / zero items.
    const onComplete = jest.fn();
    const { getByText } = render(
      <LetterWritingFromPicturesQuestion
        language="en"
        itemSet={FIXTURE_LETTER_WRITING_EN}
        instructions="."
        onComplete={onComplete}
      />,
    );
    fireEvent.press(getByText('Start'));
    fireEvent.press(getByText('Skip question'));
    fireEvent.press(getByText('Child is tired'));
    const r = onComplete.mock.calls[0][0];
    expect(r.stopped_reason).toBe('skipped_tired');
    expect(r.items).toEqual([]);
    expect(r.derived.total_correct).toBe(0);
    expect(r.derived.total_attempted).toBe(0);
    expect(r.derived.percent).toBe(0);
  });
});

describe('LetterWritingFromPicturesQuestion — fixture alphabet integrity', () => {
  test('every fixture item_key maps to expected_letter at alphabet position', () => {
    // Codex caught: a fixture with two B-leading entries and zero X-leading
    // entries would silently mis-score an X cell in any pre-#34 run.
    const { getByText, getByLabelText, getByTestId } = render(
      <LetterWritingFromPicturesQuestion
        language="en"
        itemSet={FIXTURE_LETTER_WRITING_EN}
        instructions="."
        onComplete={jest.fn()}
      />,
    );
    fireEvent.press(getByText('Start'));
    // The fixture has 8 per page; ordered marks expose the third page.
    for (let i = 0; i < 16; i += 1) fireEvent.press(getByText('Correct'));
    expect(within(getByTestId('picture-grid')).getByTestId('tile-23').props.accessibilityLabel).toMatch(
      /^xylophone → x,/,
    );
  });
});

describe('LetterWritingFromPicturesQuestion — itemSet override', () => {
  test('falls back to bundled default when override missing item_set_id', () => {
    const { getByText, queryByText } = render(
      <LetterWritingFromPicturesQuestion
        language="en"
        instructions="."
        itemSet={{
          prompts: [
            {
              item_key: 'invalid',
              picture: { source: null, alt: 'fixture-only-invalid-picture' },
              expected_letter: 'x',
            },
          ],
        }}
        onComplete={jest.fn()}
      />,
    );
    fireEvent.press(getByText('Start'));
    expect(queryByText('fixture-only-invalid-picture')).toBeNull();
  });
});


describe('LetterWritingFromPicturesQuestion — picture tiles', () => {
  test('Q5 steps through the sheet in order across pages', () => {
    const r = render(<LetterWritingFromPicturesQuestion language="xh" onComplete={jest.fn()} />);
    fireEvent.press(r.getByText('Start'));
    mark(r, 'Correct', 12);
    expect(r.getByTestId('page-label').props.accessibilityLabel).toBe('Page 2 of 3');
    expect(r.getByLabelText(/^icephe \(spoon\) → c, current/)).toBeTruthy();
    expect(r.getByLabelText('Letter 13 of 26')).toBeTruthy();
    mark(r, 'Correct', 9);
    expect(r.getByLabelText(/^iroboti \(traffic light\) → r, current/)).toBeTruthy();
    expect(r.getByLabelText('Letter 22 of 26')).toBeTruthy();
  });

  test.each(['en', 'xh'])('Q5: shipped sets show 12 pictures per page in three columns (%s)', language => {
    const r = render(<LetterWritingFromPicturesQuestion language={language} onComplete={jest.fn()} />);
    fireEvent.press(r.getByText('Start'));
    const itemSet = language === 'en' ? WELA_PLUS_LETTER_WRITING_EN : WELA_PLUS_LETTER_WRITING_XH;
    for (const [pageIndex, count] of [12, 12, 2].entries()) {
      const grid = r.getByTestId('picture-grid');
      const tiles = within(grid).getAllByTestId(/^tile-\d+$/);
      expect(tiles).toHaveLength(count);
      expect(within(grid).queryAllByRole('button')).toHaveLength(0);
      expect(r.UNSAFE_getByType(PagedGrid).props).toMatchObject({ variant: 'picture', layout: { columns: 3, capacity: 12, breakAtCardRow: false } });
      fireEvent(grid, 'layout', { nativeEvent: { layout: { width: 360, height: 400 } } });
      for (const cell of tiles) expect(cell).toHaveStyle({ width: (328 - 2 * 10) / 3, height: 88 });
      expect(r.getByTestId('page-label').props.accessibilityLabel).toBe(`Page ${pageIndex + 1} of 3`);
      expect(r.UNSAFE_queryByType(ScrollView)).toBeNull();
      const expected = itemSet.prompts.slice(pageIndex * 12, pageIndex * 12 + count);
      expect(tiles.map(cell => cell.props.accessibilityLabel)).toEqual(expected.map((p, i) => `${p.picture.alt} → ${p.expected_letter}, ${i === 0 ? 'current' : 'not reached'}`));
      if (pageIndex < 2) mark(r, 'Correct', count);
    }
    // Page browsing is available only in review.
    expect(r.queryByLabelText('Next page')).toBeNull();
  });

  test('Q5: in review, Previous page browses back and a flip on page 1 is saved', () => {
    const onComplete = jest.fn();
    const r = render(<LetterWritingFromPicturesQuestion language="xh" onComplete={onComplete} />);
    fireEvent.press(r.getByText('Start'));
    mark(r, 'Correct', 26);
    expect(onComplete).not.toHaveBeenCalled();
    expect(r.getByLabelText('All 26 marked · 26 correct. Tap any letter to change it.')).toBeTruthy();
    expect(r.getByTestId('page-label').props.accessibilityLabel).toBe('Page 3 of 3');
    expect(r.getByLabelText('Next page')).toBeDisabled();
    fireEvent.press(r.getByLabelText('Previous page'));
    fireEvent.press(r.getByLabelText('Previous page'));
    expect(r.getByTestId('page-label').props.accessibilityLabel).toBe('Page 1 of 3');
    expect(r.getByLabelText('Previous page')).toBeDisabled();
    fireEvent.press(tile(r, 0));
    expect(r.getByLabelText('All 26 marked · 25 correct. Tap any letter to change it.')).toBeTruthy();
    expect(r.queryByTestId('current-ring')).toBeNull();
    // Both directions browse during review without changing any marks.
    fireEvent.press(r.getByLabelText('Next page'));
    expect(r.getByTestId('page-label').props.accessibilityLabel).toBe('Page 2 of 3');
    mark(r, 'Finish');
    expect(onComplete).toHaveBeenCalledTimes(1);
    const result = onComplete.mock.calls[0][0];
    expect(result).toMatchObject({ stopped_reason: 'completed', derived: {
      total_correct: 25, total_attempted: 26, percent: 96, last_attempted_position: 25,
      capture_mode: 'sequential', correction_count: 1, max_consecutive_wrong: 1 } });
    expect(result.items[0]).toEqual({ position: 0, item_key: 'a', prompt: 'i-apile (apple) → a', is_correct: false, metadata: { reached: true } });
    expect(result.items.slice(1).every((item: any) => item.is_correct && item.metadata.reached)).toBe(true);
  });

  test('Q5: long isiXhosa picture names still wrap to two lines', () => {
    const r = render(<LetterWritingFromPicturesQuestion language="xh" onComplete={jest.fn()} />);
    fireEvent.press(r.getByText('Start'));
    mark(r, 'Correct', 12);
    const caption = r.getByText('iroboti (traffic light)');
    expect(caption.props).toMatchObject({ numberOfLines: 2, maxFontSizeMultiplier: 1.2, ellipsizeMode: 'clip' });
    const cell = r.getByLabelText('iroboti (traffic light) → r, not reached');
    expect(within(cell).UNSAFE_getByType(ContentText).props.size).toBe('tileWord');
  });

  test('end confirmation hides the active view and Keep marking retains its page and marks', () => {
    const onComplete = jest.fn();
    const r = render(<LetterWritingFromPicturesQuestion language="en" onComplete={onComplete} />);
    fireEvent.press(r.getByText('Start'));
    mark(r, 'Incorrect', 12);
    mark(r);
    fireEvent.press(r.getByTestId('letter-writing-end'));
    expect(r.getByTestId('end-confirmation').props.accessibilityViewIsModal).toBe(true);
    expect(r.getByText("13 marked. The 13 not marked won't count towards the score.")).toBeTruthy();
    expect(r.queryByLabelText('cat → c, correct. Double-tap to change to incorrect')).toBeNull();
    const grid = r.getByTestId('picture-grid', { includeHiddenElements: true });
    let active = grid.parent;
    while (active && active.props.importantForAccessibility !== 'no-hide-descendants') active = active.parent;
    expect(active?.props).toMatchObject({ accessibilityElementsHidden: true, pointerEvents: 'none' });
    fireEvent.press(r.getByText('Keep marking'));
    expect(r.getByLabelText('cat → c, correct. Double-tap to change to incorrect')).toBeTruthy();
    expect(r.getByTestId('page-label').props.accessibilityLabel).toBe('Page 2 of 3');
    expect(onComplete).not.toHaveBeenCalled();
    fireEvent.press(r.getByText('Skip question'));
    expect(r.queryByTestId('picture-grid')).toBeNull();
    fireEvent.press(r.getByText('Cancel'));
    expect(r.getByLabelText('cat → c, correct. Double-tap to change to incorrect')).toBeTruthy();
  });

  test('repeated item keys keep independent positional marks and callback identities', () => {
    const onComplete = jest.fn();
    const onItemMarked = jest.fn();
    const prompt = { item_key: 'repeat', picture: { source: null, alt: 'apple' }, expected_letter: 'a' };
    const itemSet = { ...FIXTURE_LETTER_WRITING_EN, prompts: [prompt, { ...prompt, picture: { source: null, alt: 'another apple' } }] };
    const r = render(<LetterWritingFromPicturesQuestion language="en" itemSet={itemSet} onComplete={onComplete} onItemMarked={onItemMarked} />);
    fireEvent.press(r.getByText('Start'));
    mark(r);
    mark(r, 'Incorrect');
    fireEvent.press(tile(r, 1));
    expect(tile(r, 0).props.accessibilityLabel).toBe('apple → a, correct. Double-tap to change to incorrect');
    expect(tile(r, 1).props.accessibilityLabel).toBe('another apple → a, correct. Double-tap to change to incorrect');
    mark(r, 'Back');
    expect(tile(r, 1).props.accessibilityLabel).toBe('another apple → a, current');
    mark(r, 'Incorrect');
    expect(onItemMarked).toHaveBeenCalledTimes(4);
    expect(onItemMarked).toHaveBeenLastCalledWith({ position: 1, item_key: 'repeat', prompt: 'another apple → a', is_correct: false, metadata: { reached: true } });
    mark(r, 'Finish');
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete.mock.calls[0][0].items).toEqual([
      { position: 0, item_key: 'repeat', prompt: 'apple → a', is_correct: true, metadata: { reached: true } },
      { position: 1, item_key: 'repeat', prompt: 'another apple → a', is_correct: false, metadata: { reached: true } },
    ]);
  });

  test('Q5 remains untimed even when a duration is supplied', () => {
    jest.useFakeTimers();
    try {
      const onComplete = jest.fn();
      const r = render(<LetterWritingFromPicturesQuestion language="en" durationSec={60} onComplete={onComplete} />);
      fireEvent.press(r.getByText('Start'));
      act(() => jest.advanceTimersByTime(61000));
      expect(onComplete).not.toHaveBeenCalled();
      mark(r);
      end(r);
      expect(onComplete.mock.calls[0][0]).toMatchObject({ duration_ms: 61000, derived: { was_timed: false } });
    } finally { jest.useRealTimers(); }
  });

  test('Q5 instructions describe marking the finished sheet in order', () => {
    const question = WELA_PLUS_FULL_2024_1.questions.find(q => q.question_code === 'wela_plus_letter_writing')!;
    for (const language of ['en', 'xh']) {
      expect(question.instructions![language]).toBe('Give the child the Writing Sheet. Say: "Look at the apple … \'apple\' starts with /a/. Can you write /a/?" Work left to right. Say the letter SOUND, not the letter name. If the child does not know a letter, say: "Don\'t worry, just leave it blank. Let\'s try another letter." When the child has finished, mark their sheet here, in order. Mark each letter Correct or Incorrect. The black ring shows which letter you\'re on.');
    }
  });
});

describe('LetterWritingFromPicturesQuestion — invalid page dimensions', () => {
  test.each(['itemsPerPage', 'columns'] as const)('Q5: %s rejects 0, -1, 1.5 and NaN without starting', field => {
    const onComplete = jest.fn();
    const onStart = jest.fn();
    for (const value of [0, -1, 1.5, NaN]) {
      const r = render(<LetterWritingFromPicturesQuestion language="en" itemSet={{ ...FIXTURE_LETTER_WRITING_EN, [field]: value }} onComplete={onComplete} onStart={onStart} />);
      expect(r.getByTestId('missing-item-set-en')).toBeTruthy();
      expect(r.queryByText('Start')).toBeNull();
      r.unmount();
    }
    expect(onComplete).not.toHaveBeenCalled();
    expect(onStart).not.toHaveBeenCalled();
  });
});


describe('LetterWritingFromPicturesQuestion — cross-page Result regression', () => {
  test.each([
    { language: 'en', expectedItems: [
      { position: 0, item_key: 'a', prompt: 'apple → a', is_correct: true },
      { position: 1, item_key: 'f', prompt: 'fish → f', is_correct: false },
      { position: 2, item_key: 'k', prompt: 'key → k', is_correct: false },
      { position: 3, item_key: 'o', prompt: 'orange → o', is_correct: false },
      { position: 4, item_key: 's', prompt: 'sun → s', is_correct: false },
      { position: 5, item_key: 'w', prompt: 'whale → w', is_correct: false },
      { position: 6, item_key: 'b', prompt: 'bed → b', is_correct: false },
      { position: 7, item_key: 'g', prompt: 'gate → g', is_correct: false },
      { position: 8, item_key: 'l', prompt: 'leaf → l', is_correct: false },
      { position: 9, item_key: 'p', prompt: 'pot → p', is_correct: false },
      { position: 10, item_key: 't', prompt: 'table → t', is_correct: false },
      { position: 11, item_key: 'x', prompt: 'x-ray → x', is_correct: false },
      { position: 12, item_key: 'c', prompt: 'cat → c', is_correct: true },
      { position: 13, item_key: 'h', prompt: 'hat → h', is_correct: false },
      { position: 14, item_key: 'm', prompt: 'moon → m', is_correct: false },
      { position: 15, item_key: 'q', prompt: 'queen → q', is_correct: false },
      { position: 16, item_key: 'u', prompt: 'umbrella → u', is_correct: false },
      { position: 17, item_key: 'y', prompt: 'yo-yo → y', is_correct: false },
      { position: 18, item_key: 'd', prompt: 'dog → d', is_correct: false },
      { position: 19, item_key: 'i', prompt: 'insect → i', is_correct: false },
      { position: 20, item_key: 'n', prompt: 'net → n', is_correct: false },
      { position: 21, item_key: 'r', prompt: 'ring → r', is_correct: false },
      { position: 22, item_key: 'v', prompt: 'van → v', is_correct: false },
      { position: 23, item_key: 'z', prompt: 'zebra → z', is_correct: false },
      { position: 24, item_key: 'e', prompt: 'elephant → e', is_correct: false },
      { position: 25, item_key: 'j', prompt: 'jacket → j', is_correct: false },
    ] },
    { language: 'xh', expectedItems: [
      { position: 0, item_key: 'a', prompt: 'i-apile (apple) → a', is_correct: true },
      { position: 1, item_key: 'f', prompt: 'ufudo (tortoise) → f', is_correct: false },
      { position: 2, item_key: 'k', prompt: 'ikati (cat) → k', is_correct: false },
      { position: 3, item_key: 'o', prompt: 'i-orenji (orange) → o', is_correct: false },
      { position: 4, item_key: 's', prompt: 'isonka (bread) → s', is_correct: false },
      { position: 5, item_key: 'w', prompt: 'iwatchi (watch) → w', is_correct: false },
      { position: 6, item_key: 'b', prompt: 'ubisi (milk) → b', is_correct: false },
      { position: 7, item_key: 'g', prompt: 'drum → g', is_correct: false },
      { position: 8, item_key: 'l', prompt: 'ilanga (sun) → l', is_correct: false },
      { position: 9, item_key: 'p', prompt: 'i-pere (pear) → p', is_correct: false },
      { position: 10, item_key: 't', prompt: 'itafile (table) → t', is_correct: false },
      { position: 11, item_key: 'x', prompt: 'ixesha (clock) → x', is_correct: false },
      { position: 12, item_key: 'c', prompt: 'icephe (spoon) → c', is_correct: true },
      { position: 13, item_key: 'h', prompt: 'ihagu (pig) → h', is_correct: false },
      { position: 14, item_key: 'm', prompt: 'imoto (car) → m', is_correct: false },
      { position: 15, item_key: 'q', prompt: 'iqanda (egg) → q', is_correct: false },
      { position: 16, item_key: 'u', prompt: 'umthi (tree) → u', is_correct: false },
      { position: 17, item_key: 'y', prompt: 'iyeza (medicine) → y', is_correct: false },
      { position: 18, item_key: 'd', prompt: 'idada (duck) → d', is_correct: false },
      { position: 19, item_key: 'i', prompt: 'inja (dog) → i', is_correct: false },
      { position: 20, item_key: 'n', prompt: 'nest → n', is_correct: false },
      { position: 21, item_key: 'r', prompt: 'iroboti (traffic light) → r', is_correct: false },
      { position: 22, item_key: 'v', prompt: 'ivani (van) → v', is_correct: false },
      { position: 23, item_key: 'z', prompt: 'axe → z', is_correct: false },
      { position: 24, item_key: 'e', prompt: 'i-emele (bucket) → e', is_correct: false },
      { position: 25, item_key: 'j', prompt: 'ijug (jug) → j', is_correct: false },
    ] },
  ])('$language preserves exact items and derived values after marking across pages and clearing a mark', ({ language, expectedItems }) => {
    const onComplete = jest.fn();
    const onItemMarked = jest.fn();
    const r = render(<LetterWritingFromPicturesQuestion language={language} onComplete={onComplete} onItemMarked={onItemMarked} />);
    fireEvent.press(r.getByText('Start'));
    mark(r);
    mark(r, 'Incorrect', 11);
    mark(r, 'Correct', 2);
    fireEvent.press(tile(r, 13));
    expect(onComplete).not.toHaveBeenCalled();
    end(r);
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onItemMarked).toHaveBeenCalledTimes(15);
    const result = onComplete.mock.calls[0][0];
    expect(result.items).toEqual(expectedItems.map(item => ({ ...item, metadata: { reached: item.position < 14 } })));
    expect(result.derived).toEqual({
      total_correct: 2,
      total_attempted: 14,
      percent: 14,
      last_attempted_position: 13,
      was_timed: false,
      tracks_progress: true,
      capture_mode: 'sequential',
      correction_count: 1,
      max_consecutive_wrong: 11,
    });
  });
});
