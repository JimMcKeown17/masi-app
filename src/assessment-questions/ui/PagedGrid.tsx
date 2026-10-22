import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Line } from 'react-native-svg';
import { tokens } from '../theme/tokens';
import { GRID_TILE_HEIGHTS } from './MarkTile';
import type { DisplayRow, Page, PageLayout } from './paginate';

const GAP = 10;
const MIN_GAP = 6;
const MIN_TILE_HEIGHT = 40;

export type TileSize = { width?: number; height?: number };
const styles = StyleSheet.create({
  grid: { flex: 1, alignSelf: 'stretch', justifyContent: 'center', paddingHorizontal: tokens.space.lg },
  row: { flexDirection: 'row' },
  unmeasuredTile: { flex: 1 },
});

export function PagedGrid({ page, testID, groupTestID, renderTile, layout, variant }: {
  page: Page;
  variant: 'letter' | 'word';
  testID?: string;
  groupTestID?: (cardRow: number) => string;
  // Unmeasured dimensions stay undefined: equal-flex widths and natural tile heights
  // keep the first frame (and Jest) visible until a positive measurement arrives.
  renderTile: (position: number, size: TileSize) => React.ReactNode;
  layout: PageLayout;
}): React.JSX.Element {
  const [{ width, height }, setSize] = useState<TileSize>({});
  const contentWidth = width === undefined ? undefined : width - 2 * tokens.space.lg;
  const groups: { cardRow: number; rows: DisplayRow[] }[] = [];
  for (const row of page.displayRows) {
    if (groups.length === 0 || row.startsCardRow) {
      groups.push({ cardRow: page.firstCardRow + groups.length, rows: [] });
    }
    groups[groups.length - 1].rows.push(row);
  }
  const rowCount = page.displayRows.length;
  const dividerCount = groups.filter(group => group.rows[0].startsCardRow).length;
  // Each divider contributes two gap-sized margins and a 1dp line. Groups
  // contribute gaps only between their own display rows.
  const gapCount = rowCount - groups.length + 2 * dividerCount;
  const nominalHeight = GRID_TILE_HEIGHTS[variant];
  const gap = height === undefined || gapCount === 0 ? GAP
    : Math.max(MIN_GAP, Math.min(GAP, (height - rowCount * nominalHeight - dividerCount) / gapCount));
  const tileHeight = height === undefined || rowCount === 0 ? undefined
    : Math.max(MIN_TILE_HEIGHT, Math.min(nominalHeight, (height - gapCount * gap - dividerCount) / rowCount));
  const tileWidth = contentWidth === undefined ? undefined : (contentWidth - gap * (layout.columns - 1)) / layout.columns;
  // Below the 40dp tile / 6dp gap floor, overflow is intentional: pagination
  // and minimum usable tile height stay fixed, rather than silently scrolling.
  return (
    <View testID={testID} style={styles.grid} onLayout={event => {
      const measured = event.nativeEvent.layout;
      setSize({
        width: measured.width > 0 ? measured.width : undefined,
        height: measured.height > 0 ? measured.height : undefined,
      });
    }}>
      {groups.map(group => <React.Fragment key={group.rows[0].positions[0]}>
        {group.rows[0].startsCardRow && <Svg testID="card-row-divider" accessible={false} width={contentWidth ?? '100%'} height={1} style={{ marginVertical: gap }}>
          <Line x1={0} y1={0.5} x2="100%" y2={0.5} stroke={tokens.color.line} strokeWidth={1} strokeDasharray="4 4" />
        </Svg>}
        <View testID={groupTestID?.(group.cardRow)} style={{ gap }}>
          {group.rows.map(row => <View key={row.positions[0]} style={[styles.row, { gap }]}>
            {row.positions.map(position => <View key={position} style={tileWidth === undefined ? styles.unmeasuredTile : { width: tileWidth }}>
              {renderTile(position, { width: tileWidth, height: tileHeight })}
            </View>)}
          </View>)}
        </View>
      </React.Fragment>)}
    </View>
  );
}
