import React from 'react';
import { render, fireEvent, within } from '@testing-library/react-native';
import { ScrollView } from 'react-native';
import { WELA_PLUS_LETTER_WRITING_EN } from '../../../itemsets/wela_plus_letter_writing.en';
import { WELA_PLUS_LETTER_WRITING_XH } from '../../../itemsets/wela_plus_letter_writing.xh';
import { ContentText, PagedGrid } from '../../../ui';
import { LetterWritingFromPicturesQuestion } from '..';
import { FIXTURE_LETTER_WRITING_EN } from '../../../testFixtures';

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
  test('Next advances to page 2', () => {
    const { getByText, getByLabelText } = render(
      <LetterWritingFromPicturesQuestion
        language="en"
        itemSet={FIXTURE_LETTER_WRITING_EN}
        instructions="."
        onComplete={jest.fn()}
      />,
    );
    fireEvent.press(getByText('Start'));
    fireEvent.press(getByLabelText('Next page'));
    // Page 2: ink, jug, kite, log, mug, nut, orange, pig
    expect(getByText('ink')).toBeTruthy();
    expect(getByText('pig')).toBeTruthy();
  });

  test('Prev returns to page 1', () => {
    const { getByText, getByLabelText, queryByText } = render(
      <LetterWritingFromPicturesQuestion
        language="en"
        itemSet={FIXTURE_LETTER_WRITING_EN}
        instructions="."
        onComplete={jest.fn()}
      />,
    );
    fireEvent.press(getByText('Start'));
    fireEvent.press(getByLabelText('Next page'));
    fireEvent.press(getByLabelText('Previous page'));
    expect(getByText('apple')).toBeTruthy();
    expect(queryByText('ink')).toBeNull();
  });
});

describe('LetterWritingFromPicturesQuestion — batch marking', () => {
  test('Tap a cell marks it correct; tap again clears (batch marking semantic)', () => {
    const { getByText, getByTestId } = render(
      <LetterWritingFromPicturesQuestion
        language="en"
        itemSet={FIXTURE_LETTER_WRITING_EN}
        instructions="."
        onComplete={jest.fn()}
      />,
    );
    fireEvent.press(getByText('Start'));
    const cell = getByTestId('cell-q5.item_1');
    expect(cell.props.accessibilityLabel).toBe('apple → a, idle');
    fireEvent.press(cell);
    const cellAfter = getByTestId('cell-q5.item_1');
    expect(cellAfter.props.accessibilityLabel).toBe('apple → a, correct');
  });

  test('Finish emits Result with derived.total_correct based on tapped cells', () => {
    const onComplete = jest.fn();
    const { getByText, getByTestId } = render(
      <LetterWritingFromPicturesQuestion
        language="en"
        itemSet={FIXTURE_LETTER_WRITING_EN}
        instructions="."
        onComplete={onComplete}
      />,
    );
    fireEvent.press(getByText('Start'));
    // Mark 3 cells on page 1
    fireEvent.press(getByTestId('cell-q5.item_1'));
    fireEvent.press(getByTestId('cell-q5.item_2'));
    fireEvent.press(getByTestId('cell-q5.item_3'));
    fireEvent.press(getByText('Finish'));
    // Confirmation should appear because 23 of 26 are unmarked
    fireEvent.press(getByText('Yes, finish'));

    const r = onComplete.mock.calls[0][0];
    expect(r.question_code).toBe('wela_plus_letter_writing');
    expect(r.stopped_reason).toBe('completed');
    expect(r.derived.total_correct).toBe(3);
    expect(r.derived.total_attempted).toBe(26);
    expect(r.derived.was_timed).toBe(false);
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
    // 26 items / 8 per page → 4 pages. item_24 is index 23 → page 2 (items 16-23).
    fireEvent.press(getByLabelText('Next page')); // → page 1
    fireEvent.press(getByLabelText('Next page')); // → page 2
    expect(getByTestId('cell-q5.item_24').props.accessibilityLabel).toMatch(
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
  test.each(['en', 'xh'])('shipped sets show 12 pictures per page in three columns (%s)', language => {
    const r = render(<LetterWritingFromPicturesQuestion language={language} onComplete={jest.fn()} />);
    fireEvent.press(r.getByText('Start'));
    const itemSet = language === 'en' ? WELA_PLUS_LETTER_WRITING_EN : WELA_PLUS_LETTER_WRITING_XH;
    for (const [pageIndex, count] of [12, 12, 2].entries()) {
      const grid = r.getByTestId('picture-grid');
      expect(within(grid).getAllByRole('button')).toHaveLength(count);
      expect(r.UNSAFE_getByType(PagedGrid).props).toMatchObject({ variant: 'picture', layout: { columns: 3, capacity: 12, breakAtCardRow: false } });
      fireEvent(grid, 'layout', { nativeEvent: { layout: { width: 360, height: 400 } } });
      for (const tile of within(grid).getAllByRole('button')) {
        expect(tile).toHaveStyle({ width: (328 - 2 * 10) / 3, height: 88 });
      }
      expect(r.getByTestId('page-label').props.accessibilityLabel).toBe(`Card row 1 · page ${pageIndex + 1} of 3`);
      expect(r.UNSAFE_queryByType(ScrollView)).toBeNull();
      const expected = itemSet.prompts.slice(pageIndex * 12, pageIndex * 12 + count);
      expect(within(grid).getAllByRole('button').map(tile => tile.props.accessibilityLabel)).toEqual(expected.map(p => `${p.picture.alt} → ${p.expected_letter}, idle`));
      if (pageIndex < 2) fireEvent.press(r.getByLabelText('Next page'));
    }
    expect(r.getByLabelText('Next page')).toBeDisabled();
  });

  test('long isiXhosa picture names wrap to two lines inside the tile', () => {
    const r = render(<LetterWritingFromPicturesQuestion language="xh" onComplete={jest.fn()} />);
    fireEvent.press(r.getByText('Start'));
    fireEvent.press(r.getByLabelText('Next page'));
    const caption = r.getByText('iroboti (traffic light)');
    expect(caption.props).toMatchObject({ numberOfLines: 2, maxFontSizeMultiplier: 1.2, ellipsizeMode: 'clip' });
    const tile = r.getByLabelText('iroboti (traffic light) → r, idle');
    expect(within(tile).UNSAFE_getByType(ContentText).props.size).toBe('tileWord');
  });

  test('confirmation hides the active view and cancel keeps its page and marks', () => {
    const onComplete = jest.fn();
    const r = render(<LetterWritingFromPicturesQuestion language="en" onComplete={onComplete} />);
    fireEvent.press(r.getByText('Start'));
    fireEvent.press(r.getByLabelText('Next page'));
    fireEvent.press(r.getByLabelText('cat → c, idle'));
    fireEvent.press(r.getByText('Finish'));
    expect(r.getByTestId('confirm-finish').props.accessibilityViewIsModal).toBe(true);
    expect(r.getByText('25 items unmarked — finish anyway?')).toBeTruthy();
    expect(r.queryByLabelText('cat → c, correct')).toBeNull();
    const grid = r.getByTestId('picture-grid', { includeHiddenElements: true });
    let active = grid.parent;
    while (active && active.props.importantForAccessibility !== 'no-hide-descendants') active = active.parent;
    expect(active?.props).toMatchObject({ accessibilityElementsHidden: true, pointerEvents: 'none' });
    fireEvent.press(r.getByText('Cancel'));
    expect(r.getByLabelText('cat → c, correct')).toBeTruthy();
    expect(r.getByTestId('page-label').props.accessibilityLabel).toContain('page 2 of 3');
    expect(onComplete).not.toHaveBeenCalled();
    fireEvent.press(r.getByText('Skip question'));
    expect(r.queryByTestId('picture-grid')).toBeNull();
    fireEvent.press(r.getByText('Cancel'));
    expect(r.getByLabelText('cat → c, correct')).toBeTruthy();
  });

  test('repeated item keys keep independent positional marks and callback identities', () => {
    const onComplete = jest.fn();
    const onItemMarked = jest.fn();
    const prompt = { item_key: 'repeat', picture: { source: null, alt: 'apple' }, expected_letter: 'a' };
    const itemSet = { ...FIXTURE_LETTER_WRITING_EN, prompts: [prompt, { ...prompt, picture: { source: null, alt: 'another apple' } }] };
    const r = render(<LetterWritingFromPicturesQuestion language="en" itemSet={itemSet} onComplete={onComplete} onItemMarked={onItemMarked} />);
    fireEvent.press(r.getByText('Start'));
    fireEvent.press(r.getByLabelText('another apple → a, idle'));
    expect(r.getByLabelText('apple → a, idle')).toBeTruthy();
    expect(r.getByLabelText('another apple → a, correct')).toBeTruthy();
    expect(onItemMarked).toHaveBeenCalledTimes(1);
    expect(onItemMarked).toHaveBeenLastCalledWith({ position: 1, item_key: 'repeat', prompt: 'another apple → a', is_correct: true });
    fireEvent.press(r.getByText('Finish'));
    fireEvent.press(r.getByText('Yes, finish'));
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete.mock.calls[0][0].items).toEqual([
      { position: 0, item_key: 'repeat', prompt: 'apple → a', is_correct: false },
      { position: 1, item_key: 'repeat', prompt: 'another apple → a', is_correct: true },
    ]);
  });
});

describe('LetterWritingFromPicturesQuestion — invalid page dimensions', () => {
  test.each(['itemsPerPage', 'columns'] as const)('%s rejects 0, -1, 1.5 and NaN without starting or completing', field => {
    const onComplete = jest.fn();
    for (const value of [0, -1, 1.5, NaN]) {
      const r = render(<LetterWritingFromPicturesQuestion language="en" itemSet={{ ...FIXTURE_LETTER_WRITING_EN, [field]: value }} onComplete={onComplete} />);
      expect(r.getByTestId('missing-item-set-en')).toBeTruthy();
      expect(r.queryByText('Start')).toBeNull();
      r.unmount();
    }
    expect(onComplete).not.toHaveBeenCalled();
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
    fireEvent.press(r.getByTestId('cell-a'));
    fireEvent.press(r.getByLabelText('Next page'));
    fireEvent.press(r.getByTestId('cell-c'));
    fireEvent.press(r.getByTestId('cell-h'));
    fireEvent.press(r.getByTestId('cell-h'));
    fireEvent.press(r.getByText('Finish'));
    expect(r.getByText('24 items unmarked — finish anyway?')).toBeTruthy();
    expect(onComplete).not.toHaveBeenCalled();
    fireEvent.press(r.getByText('Yes, finish'));
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onItemMarked).toHaveBeenCalledTimes(4);
    const result = onComplete.mock.calls[0][0];
    expect(result.items).toEqual(expectedItems);
    expect(result.derived).toEqual({
      total_correct: 2,
      total_attempted: 26,
      percent: 8,
      last_attempted_position: null,
      was_timed: false,
    });
  });
});
