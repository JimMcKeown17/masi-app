import React, { useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { Text } from 'react-native-paper';
import SurfaceCard from '../common/SurfaceCard';
import { colors, spacing } from '../../constants/colors';
import { typeRoles } from '../../constants/typography';

function MeasuredCards({ stats, width }) {
  const [lineCounts, setLineCounts] = useState({});
  const stacked = Object.values(lineCounts).some(count => count > 1);
  const ready = width > 0 && (stacked || stats.every(stat => lineCounts[stat.key] > 0));

  return (
    <View testID="assessment-stat-layout" style={[styles.row, stacked && styles.stack, { opacity: ready ? 1 : 0 }]}>
      {stats.map(({ key, value, label, accentColor }) => {
        const labelText = (
          <Text accessible={false} style={[styles.label, stacked && styles.stackedLabel]}
            onTextLayout={stacked ? undefined : ({ nativeEvent: { lines } }) => {
              if (!lines.length) return;
              // Only row measurements decide the layout. Late callbacks must not
              // undo a wrap decision after the wider stacked cards have mounted.
              setLineCounts(current => {
                if (Object.values(current).some(count => count > 1) || current[key] === lines.length) return current;
                return { ...current, [key]: lines.length };
              });
            }}>{label}</Text>
        );
        const valueText = (
          <Text accessible={false}
            style={[styles.value, stacked && styles.stackedValue,
              { color: accentColor === colors.emphasis ? colors.primary : accentColor }]}>
            {value}
          </Text>
        );
        return (
          <View key={key} accessible accessibilityLabel={`${label}, ${value}`}
            style={[styles.cardFrame, stacked && styles.stackedFrame]}>
            <SurfaceCard style={[styles.card, stacked && styles.stackedCard, { borderTopColor: accentColor }]}>
              {stacked ? <>{labelText}{valueText}</> : <>{valueText}{labelText}</>}
            </SurfaceCard>
          </View>
        );
      })}
    </View>
  );
}

export default function AssessmentStatCards({ stats }) {
  const [width, setWidth] = useState(0);
  const { fontScale } = useWindowDimensions();
  // Remount only the measuring subtree when its constraints or labels change.
  // This also discards callbacks from the previous row's measurement pass.
  const measurementKey = JSON.stringify([width, fontScale, stats.map(({ key, label }) => [key, label])]);
  return (
    <View testID="assessment-stat-cards" style={styles.container}
      onLayout={({ nativeEvent: { layout } }) => setWidth(layout.width)}>
      <MeasuredCards key={measurementKey} stats={stats} width={width} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%' },
  row: { flexDirection: 'row', gap: spacing.sm },
  stack: { flexDirection: 'column' },
  cardFrame: { flex: 1 },
  stackedFrame: { flex: 0 },
  card: { flex: 1, borderTopWidth: 3, paddingVertical: spacing.md, alignItems: 'center' },
  stackedCard: { flex: 0, flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  value: { ...typeRoles.displayTitle, fontVariant: ['tabular-nums'], marginBottom: spacing.xs },
  stackedValue: { marginBottom: 0, textAlign: 'right' },
  label: { ...typeRoles.textLabel, color: colors.textSecondary, alignSelf: 'stretch', textAlign: 'center' },
  stackedLabel: { alignSelf: 'auto', textAlign: 'left', flexShrink: 1 },
});
