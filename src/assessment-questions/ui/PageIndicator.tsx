import React from 'react';
import { StyleSheet, View } from 'react-native';
import { tokens } from '../theme/tokens';
import { IconButton } from './Button';
import type { LinePart } from './PositionLine';
import { PositionLine } from './PositionLine';
import { pageLabel, type Page } from './paginate';

export function PageIndicator({ pages, current, onPrevious, onNext, labelFor }: {
  pages: ReadonlyArray<Page>;
  current: number;
  onPrevious?: () => void;
  onNext?: () => void;
  labelFor?: (page: Page, count: number) => ReadonlyArray<LinePart>;
}): React.JSX.Element | null {
  if (pages.length <= 1) return null;
  const currentIndex = Number.isFinite(current) ? Math.max(0, Math.min(pages.length - 1, Math.trunc(current))) : 0;
  const parts = (labelFor ?? defaultLabel)(pages[currentIndex], pages.length);

  return (
    <View testID="page-indicator" style={styles.indicator}>
      <PositionLine testID="page-label" parts={parts} />
      <View style={styles.controls}>
        {onPrevious && <IconButton icon="chevronLeft" accessibilityLabel="Previous page" onPress={onPrevious} disabled={currentIndex === 0} />}
        <View style={styles.dots}>
          {pages.map((page, index) => (
            <View key={page.index} testID="page-dot" accessible={false} style={{
              width: 8, height: 8, borderRadius: tokens.radius.pill,
              backgroundColor: index === currentIndex ? tokens.color.ink : tokens.color.line,
            }} />
          ))}
        </View>
        {onNext && <IconButton icon="chevronRight" accessibilityLabel="Next page" onPress={onNext} disabled={currentIndex === pages.length - 1} />}
      </View>
    </View>
  );
}

function defaultLabel(page: Page, count: number): ReadonlyArray<LinePart> {
  const [cardRows, rest] = pageLabel(page, count).split(' · ');
  return [{ text: cardRows, strong: true }, { text: ' · ' + rest }];
}

const styles = StyleSheet.create({
  indicator: { alignItems: 'center', gap: tokens.space.xs },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: tokens.space.md },
  dots: { flexDirection: 'row', alignItems: 'center', gap: tokens.space.sm },
});
