import React from 'react';
import { StyleSheet } from 'react-native';
import type { CaptureBody as Body } from './captureTypes';
import { MarkTile, type TileState, type TileVariant } from '../ui/MarkTile';
import { PagedGrid } from '../ui/PagedGrid';
import type { Page } from '../ui/paginate';
import { FollowScrollView, FollowTarget } from '../ui/FollowScrollView';
import { TileGroup } from '../ui/TileGroup';
import { tokens } from '../theme/tokens';

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

export function CaptureBody({ body, pages, pageIndex, itemCount, tileFor, onTapPosition }: {
  body: Body;
  pages: ReadonlyArray<Page>;
  pageIndex: number;
  itemCount: number;
  tileFor: (position: number) => Omit<TileProps, 'variant' | 'position' | 'onTapPosition' | 'width' | 'height'>;
  onTapPosition: (position: number) => void;
}) {
  if (body.kind !== 'grid') {
    const positions = body.kind === 'cards'
      ? Array.from({ length: itemCount }, (_, position) => position)
      : body.groups.flatMap(group => group.positions);
    const tiles = new Map(positions.map(position => [position, tileFor(position)]));
    const focus = positions.find(position => tiles.get(position)?.state === 'current');
    const renderTile = (position: number) => <FollowTarget key={position} index={position}>
      <CaptureTile {...tiles.get(position)!} variant={body.kind === 'cards' ? 'promptCard' : body.variant}
        width={body.kind === 'groups' && body.variant === 'letter' ? body.tileWidth : undefined}
        position={position} onTapPosition={onTapPosition} />
    </FollowTarget>;
    return <FollowScrollView testID={body.testID} focus={focus}
      contentContainerStyle={body.kind === 'cards' ? styles.cards : styles.groups}>
      {body.kind === 'cards' ? positions.map(renderTile) : body.groups.map(group =>
        <TileGroup key={group.key} testID={group.testID} heading={group.heading} card={body.card}>
          {group.positions.map(renderTile)}
        </TileGroup>)}
    </FollowScrollView>;
  }
  if (!pages[pageIndex]) return null;
  return <PagedGrid pages={pages} pageIndex={pageIndex} layout={body.layout} variant={body.variant}
    testID={body.testID} groupTestID={body.rowTestID}
    renderTile={(position, size) => <CaptureTile {...tileFor(position)} {...size}
      variant={body.variant} position={position} onTapPosition={onTapPosition} />} />;
}

const styles = StyleSheet.create({
  cards: { padding: tokens.space.lg, gap: 10 },
  groups: { gap: tokens.space.lg, paddingHorizontal: tokens.space.lg, paddingVertical: tokens.space.lg },
});
