import React from 'react';
import type { CaptureBody as Body } from './captureTypes';
import { MarkTile, type TileState, type TileVariant } from '../ui/MarkTile';
import { PagedGrid } from '../ui/PagedGrid';
import type { Page } from '../ui/paginate';

type TileProps = {
  variant: TileVariant;
  state: TileState;
  text: string;
  gloss?: string;
  caption?: string;
  accessibilityLabel: string;
  tappable: boolean;
  position: number;
  onTapPosition: (position: number) => void;
  width?: number;
  height?: number;
};

const CaptureTile = React.memo(function CaptureTile({ tappable, position, onTapPosition, ...props }: TileProps) {
  return <MarkTile {...props} testID={`tile-${position}`}
    onPress={tappable ? () => onTapPosition(position) : undefined} />;
});

export function CaptureBody({ body, pages, pageIndex, tileFor, onTapPosition }: {
  body: Body;
  pages: ReadonlyArray<Page>;
  pageIndex: number;
  tileFor: (position: number) => Omit<TileProps, 'variant' | 'position' | 'onTapPosition' | 'width' | 'height'>;
  onTapPosition: (position: number) => void;
}) {
  // Cards and groups renderers arrive in Task 4; the public body type is shared now.
  if (body.kind !== 'grid' || !pages[pageIndex]) return null;
  return <PagedGrid pages={pages} pageIndex={pageIndex} layout={body.layout} variant={body.variant}
    testID={body.testID} groupTestID={body.rowTestID}
    renderTile={(position, size) => <CaptureTile {...tileFor(position)} {...size}
      variant={body.variant} position={position} onTapPosition={onTapPosition} />} />;
}
