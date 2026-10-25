import type { Page, PageLayout } from '../ui/paginate';
import type { LinePart } from '../ui/PositionLine';
export type { LinePart } from '../ui/PositionLine';

export interface CaptureItem {
  item_key: string;
  prompt: string;
  text?: string;
  label?: string;
  gloss?: string;
  caption?: string;
  metadata?: Record<string, unknown>;
}

export interface CaptureCopy {
  noun: string;
  position: (position: number) => ReadonlyArray<LinePart>;
  itemName: (position: number) => string;
}

export type CaptureBody =
  | { kind: 'grid'; rows: number[][]; layout: PageLayout; variant: 'letter' | 'word' | 'picture'; testID: string;
      rowTestID?: (cardRow: number) => string; labelFor?: (page: Page, count: number) => ReadonlyArray<LinePart> }
  | { kind: 'cards'; testID: string }
  | { kind: 'groups'; testID: string; card: boolean; variant: 'letter' | 'pill'; tileWidth?: number;
      groups: ReadonlyArray<{ key: string; heading?: string; testID?: string; positions: ReadonlyArray<number> }> };
