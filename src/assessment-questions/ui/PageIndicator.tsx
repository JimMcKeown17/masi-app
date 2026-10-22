import React from 'react';
import { StyleSheet, View } from 'react-native';
import { tokens } from '../theme/tokens';
import { IconButton } from './Button';
import { UiText } from './Text';
import { pageLabel, type Page } from './paginate';

export function PageIndicator({ pages, current, onPrevious, onNext }: {
  pages: ReadonlyArray<Page>;
  current: number;
  onPrevious?: () => void;
  onNext?: () => void;
}): React.JSX.Element | null {
  if (pages.length <= 1) return null;
  const currentIndex = Number.isFinite(current) ? Math.max(0, Math.min(pages.length - 1, Math.trunc(current))) : 0;
  const label = pageLabel(pages[currentIndex], pages.length);
  const [cardRows, rest] = label.split(' · ');

  return (
    <View testID="page-indicator" style={styles.indicator}>
      <UiText testID="page-label" variant="caption" tone="muted" align="center" accessibilityLabel={label}>
        <UiText variant="captionStrong" tone="ink">{cardRows}</UiText>{` · ${rest}`}
      </UiText>
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

const styles = StyleSheet.create({
  indicator: { alignItems: 'center', gap: tokens.space.xs },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: tokens.space.md },
  dots: { flexDirection: 'row', alignItems: 'center', gap: tokens.space.sm },
});
