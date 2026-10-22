import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Line } from 'react-native-svg';
import { tokens } from '../theme/tokens';
import type { DisplayRow, Page, PageLayout } from './paginate';

const GAP = 10;
const styles = StyleSheet.create({
  grid: { flex: 1, alignSelf: 'stretch', justifyContent: 'center', paddingHorizontal: tokens.space.lg },
  group: { gap: GAP },
  row: { flexDirection: 'row', gap: GAP },
  unmeasuredTile: { flex: 1 },
  divider: { marginVertical: GAP },
});

export function PagedGrid({ page, testID, groupTestID, renderTile, layout }: {
  page: Page;
  testID?: string;
  groupTestID?: (cardRow: number) => string;
  // Before the first positive onLayout, tiles fill equal-flex wrappers. Consumers
  // must accept undefined so the first frame (and Jest) still renders every tile.
  renderTile: (position: number, width: number | undefined) => React.ReactNode;
  layout: PageLayout;
}): React.JSX.Element {
  const [width, setWidth] = useState<number>();
  const contentWidth = width === undefined ? undefined : width - 2 * tokens.space.lg;
  const tileWidth = contentWidth === undefined ? undefined : (contentWidth - GAP * (layout.columns - 1)) / layout.columns;
  const groups: { cardRow: number; rows: DisplayRow[] }[] = [];
  for (const row of page.displayRows) {
    if (groups.length === 0 || row.startsCardRow) {
      groups.push({ cardRow: page.firstCardRow + groups.length, rows: [] });
    }
    groups[groups.length - 1].rows.push(row);
  }
  return (
    <View testID={testID} style={styles.grid} onLayout={event => {
      const measured = event.nativeEvent.layout.width;
      setWidth(measured > 0 ? measured : undefined);
    }}>
      {groups.map(group => <React.Fragment key={group.rows[0].positions[0]}>
        {group.rows[0].startsCardRow && <Svg testID="card-row-divider" accessible={false} width={contentWidth ?? '100%'} height={1} style={styles.divider}>
          <Line x1={0} y1={0.5} x2="100%" y2={0.5} stroke={tokens.color.line} strokeWidth={1} strokeDasharray="4 4" />
        </Svg>}
        <View testID={groupTestID?.(group.cardRow)} style={styles.group}>
          {group.rows.map(row => <View key={row.positions[0]} style={styles.row}>
            {row.positions.map(position => <View key={position} style={tileWidth === undefined ? styles.unmeasuredTile : { width: tileWidth }}>
              {renderTile(position, tileWidth)}
            </View>)}
          </View>)}
        </View>
      </React.Fragment>)}
    </View>
  );
}
