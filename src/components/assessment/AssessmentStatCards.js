import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { Text } from 'react-native-paper';
import SurfaceCard from '../common/SurfaceCard';
import { colors, spacing } from '../../constants/colors';
import { typeRoles } from '../../constants/typography';

function MeasuredCards({ stats, width }) {
  const [measurement, setMeasurement] = useState({ lineCounts: {}, stacked: null });
  const active = useRef(true);
  const stacked = measurement.stacked === true;
  const decided = measurement.stacked !== null;
  const ready = width > 0 && decided;

  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);

  useEffect(() => {
    if (width <= 0 || decided) return;
    const timer = setTimeout(() => {
      if (!active.current) return;
      setMeasurement(current => current.stacked !== null ? current : { ...current, stacked: true });
    }, 1000);
    return () => clearTimeout(timer);
  }, [width, decided]);

  return (
    <View testID="assessment-stat-layout" style={[styles.row, stacked && styles.stack, { opacity: ready ? 1 : 0 }]}>
      {stats.map(({ key, value, label, accentColor }) => {
        const labelText = (
          <Text accessible={false} style={[styles.label, stacked && styles.stackedLabel]}
            onTextLayout={decided ? undefined : ({ nativeEvent: { lines } }) => {
              if (!active.current) return;
              // A generation decides once; late native callbacks cannot change
              // either its measured layout or its timeout fallback.
              setMeasurement(current => {
                if (current.stacked !== null) return current;
                if (lines.length !== 1) return { ...current, stacked: true };
                if (current.lineCounts[key] === lines.length) return current;
                const lineCounts = { ...current.lineCounts, [key]: lines.length };
                return { lineCounts, stacked: stats.every(stat => lineCounts[stat.key] === 1) ? false : null };
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
