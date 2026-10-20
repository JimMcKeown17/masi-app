import { fontFamilies, typeRoles } from '../../constants/typography';
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { colors, spacing, borderRadius } from '../../constants/colors';
import * as bundledItemSets from '../../assessment-questions/itemsets';

function storedRows(assessment) {
  const items = [...(assessment.items || [])].sort((a, b) => a.position - b.position);
  // Historical layouts belong to the saved set id, never the current set for its language.
  const itemSet = Object.values(bundledItemSets).find(set => set?.item_set_id === assessment.item_set_id);
  const lengths = assessment.question_code === 'word_reading' ? itemSet?.row_lengths : null;
  const rows = new Map();
  for (const item of items) {
    let row = item.metadata?.row;
    if (row == null && lengths) {
      let end = 0;
      row = lengths.findIndex(length => { end += length; return item.position < end; });
      if (row < 0) row = null;
    }
    const key = row == null ? 'wrap' : `row-${row}`;
    if (!rows.has(key)) rows.set(key, { key, wrap: row == null, items: [] });
    rows.get(key).items.push(item);
  }
  return [...rows.values()];
}

export default function AssessmentDetailGrid({ assessment }) {
  const rows = storedRows(assessment);
  const isWord = assessment.question_code === 'word_reading';
  return (
    <View style={styles.container}>
      <Text variant="titleSmall" style={styles.title}>{isWord ? 'Word' : 'Letter'} Results</Text>
      {rows.map(row => (
        <View key={row.key} testID="assessment-detail-row" style={[styles.row, row.wrap && styles.wrapRow]}>
          {row.items.map(item => {
            const reached = item.metadata?.reached !== false;
            const prompt = item.prompt ?? item.item_key;
            return (
              <View key={item.id || item.position} testID="assessment-detail-item"
                accessibilityLabel={`${prompt}: ${!reached ? 'Not attempted' : item.is_correct ? 'Correct' : 'Incorrect'}`}
                style={[styles.tile, row.wrap ? styles.wrapTile : styles.rowTile,
                  !reached ? styles.tileNotAttempted : item.is_correct ? styles.tileCorrect : styles.tileIncorrect]}>
                <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5}
                  style={[styles.tileText, reached ? styles.tileTextWhite : styles.tileTextMuted,
                    isWord && styles.tileTextWord]}>{prompt}</Text>
              </View>
            );
          })}
        </View>
      ))}
      <View style={styles.legend}>
        {[[colors.success, 'Correct'], [colors.emphasis, 'Incorrect'], [colors.border, 'Not Attempted']].map(([color, label]) => (
          <View key={label} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: color }]} />
            <Text variant="bodySmall" style={styles.legendText}>{label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%', alignItems: 'center', gap: spacing.xs },
  title: { color: colors.text, fontFamily: fontFamilies.textSemi, alignSelf: 'flex-start', marginBottom: spacing.sm },
  row: { width: '100%', flexDirection: 'row', gap: spacing.xs },
  wrapRow: { flexWrap: 'wrap' },
  tile: { height: 44, justifyContent: 'center', alignItems: 'center', borderRadius: borderRadius.sm,
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  rowTile: { flex: 1, minWidth: 0 },
  wrapTile: { minWidth: 44, paddingHorizontal: spacing.sm },
  tileCorrect: { backgroundColor: colors.success, borderColor: colors.success },
  tileIncorrect: { backgroundColor: colors.emphasis, borderColor: colors.emphasis },
  tileNotAttempted: { backgroundColor: colors.border, borderColor: colors.border, opacity: 0.5 },
  tileText: { ...typeRoles.textBodySemi, color: colors.text },
  tileTextWhite: { color: colors.onDark },
  tileTextMuted: { color: colors.textSecondary },
  tileTextWord: { ...typeRoles.textNavInactive },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.md },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  legendDot: { width: 12, height: 12, borderRadius: 3 },
  legendText: { color: colors.textSecondary },
});
