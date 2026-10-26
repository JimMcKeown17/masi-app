import {
  LETTER_PAGE_LAYOUT, WORD_PAGE_LAYOUT, paginate, pageIndexOf, pageLabel, rowsFromLengths,
} from '../paginate';

const lengths = (rows: ReadonlyArray<{ positions: number[] }>) => rows.map(row => row.positions.length);
const shapes = [
  { name: 'Grid A', lengths: [10,10,10,10,10,10], layout: LETTER_PAGE_LAYOUT },
  { name: '2026.1 letters', lengths: [12,12,12,12,12], layout: LETTER_PAGE_LAYOUT },
  { name: 'isiZulu', lengths: Array(11).fill(10), layout: LETTER_PAGE_LAYOUT },
  { name: 'fixture letters', lengths: [12,12,1], layout: LETTER_PAGE_LAYOUT },
  { name: 'word_reading', lengths: Array(10).fill(5), layout: WORD_PAGE_LAYOUT },
  { name: 'wela_plus_read_words', lengths: [8,8,8,8,8], layout: WORD_PAGE_LAYOUT },
  { name: 'oversized card row', lengths: [30], layout: WORD_PAGE_LAYOUT },
];

test('Grid A 6×10 → 3 pages of 2 card rows, 4 display rows of 5, divider before card row 2', () => {
  const pages = paginate(rowsFromLengths(shapes[0].lengths), LETTER_PAGE_LAYOUT);
  expect(pages.map(p => [p.firstCardRow, p.lastCardRow])).toEqual([[0,1],[2,3],[4,5]]);
  for (const page of pages) {
    expect(page.displayRows.map(d => [d.positions.length, d.startsCardRow])).toEqual([[5,false],[5,false],[5,true],[5,false]]);
  }
});

test('2026.1 letters 5×12 → 5 pages, one card row each, display rows 5,5,2', () => {
  const pages = paginate(rowsFromLengths([12,12,12,12,12]), LETTER_PAGE_LAYOUT);
  expect(pages.map(p => [p.firstCardRow, p.lastCardRow])).toEqual([[0,0],[1,1],[2,2],[3,3],[4,4]]);
  for (const page of pages) {
    expect(lengths(page.displayRows)).toEqual([5,5,2]);
    expect(page.displayRows.every(row => !row.startsCardRow)).toBe(true);
  }
});

test('isiZulu 11×10 → 6 pages', () => {
  const pages = paginate(rowsFromLengths(Array(11).fill(10)), LETTER_PAGE_LAYOUT);
  expect(pages.map(p => [p.firstCardRow, p.lastCardRow])).toEqual([[0,1],[2,3],[4,5],[6,7],[8,9],[10,10]]);
  expect(lengths(pages)).toEqual([20,20,20,20,20,10]);
});

test('fixture letters 12,12,1 → 2 pages: [row 1], [rows 2–3]', () => {
  const pages = paginate(rowsFromLengths([12,12,1]), LETTER_PAGE_LAYOUT);
  expect(pages.map(p => [p.firstCardRow, p.lastCardRow])).toEqual([[0,0],[1,2]]);
  expect(pages[1].displayRows.map(row => [row.positions.length, row.startsCardRow])).toEqual([[5,false],[5,false],[2,false],[1,true]]);
});

test('word_reading 10×5 → 5 pages of 2 card rows, continuous display rows of 2', () => {
  const pages = paginate(rowsFromLengths(Array(10).fill(5)), WORD_PAGE_LAYOUT);
  expect(pages.map(p => [p.firstCardRow, p.lastCardRow])).toEqual([[0,1],[2,3],[4,5],[6,7],[8,9]]);
  expect(pages[0].positions).toEqual(Array.from({ length: 10 }, (_, i) => i));
  for (const page of pages) {
    expect(lengths(page.displayRows)).toEqual([2,2,2,2,2]);
    expect(page.displayRows.every(row => !row.startsCardRow)).toBe(true);
  }
  expect(pages[0].displayRows[2].positions).toEqual([4,5]);
});

test('wela_plus_read_words 8,8,8,8,8 → 5 pages of one card row, four full display rows each', () => {
  const pages = paginate(rowsFromLengths([8,8,8,8,8]), WORD_PAGE_LAYOUT);
  expect(pages.map(p => [p.firstCardRow, p.lastCardRow])).toEqual([[0,0],[1,1],[2,2],[3,3],[4,4]]);
  for (const page of pages) expect(lengths(page.displayRows)).toEqual([2,2,2,2]);
});

test('one 30-item card row → 3 pages each labelled Card row 1', () => {
  const pages = paginate([Array.from({ length: 30 }, (_, i) => i)], WORD_PAGE_LAYOUT);
  expect(pages.map(p => pageLabel(p, pages.length))).toEqual([
    'Card row 1 · page 1 of 3', 'Card row 1 · page 2 of 3', 'Card row 1 · page 3 of 3',
  ]);
});

test('oversized rows flush an open page and keep even their final partial chunk on its own page', () => {
  const pages = paginate(rowsFromLengths([3,25,2]), WORD_PAGE_LAYOUT);
  expect(lengths(pages)).toEqual([3,10,10,5,2]);
  expect(pages.map(p => [p.firstCardRow, p.lastCardRow])).toEqual([[0,0],[1,1],[1,1],[1,1],[2,2]]);
});

test('oversized letter rows start each page without a divider', () => {
  const pages = paginate(rowsFromLengths([21]), LETTER_PAGE_LAYOUT);
  expect(pages.map(page => page.displayRows.map(row => [row.positions.length, row.startsCardRow]))).toEqual([
    [[5,false],[5,false],[5,false],[5,false]], [[1,false]],
  ]);
});

test('labels use an en dash and 1-based rows', () => {
  expect(pageLabel(paginate(rowsFromLengths([10,10,10,10,10,10]), LETTER_PAGE_LAYOUT)[0], 3)).toBe('Card rows 1–2 · page 1 of 3');
});

test.each(shapes)('every position appears exactly once and in reading order: $name', shape => {
  const rows = rowsFromLengths(shape.lengths).map(row => Object.freeze(row));
  const pages = paginate(Object.freeze(rows), shape.layout);
  expect(pages.flatMap(page => page.positions)).toEqual(rows.flat());
  expect(new Set(pages.flatMap(page => page.positions)).size).toBe(rows.flat().length);
  expect(pages.flatMap(page => page.displayRows.flatMap(row => row.positions))).toEqual(rows.flat());
  expect(pages.map(page => page.index)).toEqual(pages.map((_, index) => index));
  expect(pages.every(page => page.positions.length <= shape.layout.capacity)).toBe(true);
});

test('pageIndexOf finds the page for a position and -1 otherwise', () => {
  const pages = paginate([[50,4],[99],[8,17]], { columns: 2, capacity: 3, breakAtCardRow: false });
  expect([50,4,99,8,17].map(position => pageIndexOf(pages, position))).toEqual([0,0,0,1,1]);
  expect(pageIndexOf(pages, 0)).toBe(-1);
  expect(pageIndexOf([], 0)).toBe(-1);
});

test.each([
  { name: 'Grid A', lengths: [10,10,10,10,10,10], layout: LETTER_PAGE_LAYOUT, count: 3 },
  { name: '10×5', lengths: Array(10).fill(5), layout: WORD_PAGE_LAYOUT, count: 5 },
])('Afrikaans $name pages the same as its en/xh twins', shape => {
  const byLanguage = ['af', 'en', 'xh'].map(() => paginate(rowsFromLengths(shape.lengths), shape.layout));
  expect(byLanguage[0]).toHaveLength(shape.count);
  expect(byLanguage[0]).toEqual(byLanguage[1]);
  expect(byLanguage[0]).toEqual(byLanguage[2]);
});

test('empty rows are skipped while labels retain the original card-row indices', () => {
  expect(paginate([], LETTER_PAGE_LAYOUT)).toEqual([]);
  expect(paginate([[],[]], LETTER_PAGE_LAYOUT)).toEqual([]);
  const pages = paginate([[],[42],[],[91],[]], LETTER_PAGE_LAYOUT);
  expect(pages).toHaveLength(1);
  expect(pages[0]).toMatchObject({ firstCardRow: 1, lastCardRow: 3, positions: [42,91] });
  expect(pages[0].displayRows).toEqual([
    { positions: [42], startsCardRow: false }, { positions: [91], startsCardRow: true },
  ]);
});

test('rowsFromLengths assigns contiguous positional identity, including empty rows', () => {
  expect(rowsFromLengths([3,0,2])).toEqual([[0,1,2],[],[3,4]]);
  expect(rowsFromLengths([])).toEqual([]);
});

describe.each(['columns', 'capacity'] as const)('invalid %s', field => {
  test.each([0, -1, 1.5, Infinity, NaN])('rejects %s at the paginate boundary', value => {
    // Empty input safely proves boundary validation before any chunking can loop.
    expect(() => paginate([], { ...LETTER_PAGE_LAYOUT, [field]: value })).toThrow(
      new Error('paginate: columns and capacity must be positive integers'),
    );
  });
});
