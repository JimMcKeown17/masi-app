export interface PageLayout { columns: number; capacity: number; breakAtCardRow: boolean }
export const LETTER_PAGE_LAYOUT: PageLayout = { columns: 5, capacity: 20, breakAtCardRow: true };
export const WORD_PAGE_LAYOUT: PageLayout = { columns: 2, capacity: 10, breakAtCardRow: true };
export interface DisplayRow { positions: number[]; startsCardRow: boolean }
export interface Page {
  index: number;
  firstCardRow: number;
  lastCardRow: number;
  positions: number[];
  displayRows: DisplayRow[];
}

function chunks(positions: ReadonlyArray<number>, size: number): number[][] {
  const result: number[][] = [];
  for (let offset = 0; offset < positions.length; offset += size) {
    result.push(positions.slice(offset, offset + size));
  }
  return result;
}

export function paginate(rows: ReadonlyArray<ReadonlyArray<number>>, layout: PageLayout): Page[] {
  if (![layout.columns, layout.capacity].every(value => Number.isInteger(value) && value > 0)) {
    throw new Error('paginate: columns and capacity must be positive integers');
  }
  const pages: Page[] = [];
  let open: Page | undefined;

  function flush() {
    if (open) pages.push(open);
    open = undefined;
  }

  function append(positions: ReadonlyArray<number>, cardRow: number) {
    if (!open) {
      open = { index: pages.length, firstCardRow: cardRow, lastCardRow: cardRow, positions: [], displayRows: [] };
    }
    const followsCardRow = open.positions.length > 0;
    open.lastCardRow = cardRow;
    open.positions.push(...positions);
    if (layout.breakAtCardRow) {
      open.displayRows.push(...chunks(positions, layout.columns).map((part, index) => ({
        positions: part, startsCardRow: followsCardRow && index === 0,
      })));
    } else {
      open.displayRows = chunks(open.positions, layout.columns).map(part => ({ positions: part, startsCardRow: false }));
    }
  }

  rows.forEach((row, cardRow) => {
    if (row.length === 0) return;
    if (row.length > layout.capacity) {
      flush();
      for (const part of chunks(row, layout.capacity)) {
        append(part, cardRow);
        flush();
      }
    } else {
      if (open && open.positions.length + row.length > layout.capacity) flush();
      append(row, cardRow);
    }
  });
  flush();
  return pages;
}

export function pageIndexOf(pages: ReadonlyArray<Page>, position: number): number {
  return pages.findIndex(page => page.positions.includes(position));
}

export function pageLabel(page: Page, pageCount: number): string {
  const cardRows = page.firstCardRow === page.lastCardRow
    ? `Card row ${page.firstCardRow + 1}`
    : `Card rows ${page.firstCardRow + 1}–${page.lastCardRow + 1}`;
  return `${cardRows} · page ${page.index + 1} of ${pageCount}`;
}

export function rowsFromLengths(lengths: ReadonlyArray<number>): number[][] {
  let position = 0;
  return lengths.map(length => Array.from({ length }, () => position++));
}
