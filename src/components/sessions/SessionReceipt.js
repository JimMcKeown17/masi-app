import React, { useState } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { colors, spacing, tints } from '../../constants/colors';
import { typeRoles } from '../../constants/typography';
import LetterReceiptTile from './LetterReceiptTile';

export function ReceiptRow({ label, value, accessibilityLabel, isLast }) {
  const [wrapped, setWrapped] = useState(false);
  const { fontScale } = useWindowDimensions();
  const stacked = fontScale >= 1.6;
  const letters = Array.isArray(value);

  return (
    <View accessible accessibilityLabel={accessibilityLabel}
      style={[styles.row, !isLast && styles.divider, (letters || wrapped) && styles.topAligned, stacked && styles.stackedRow]}>
      <Text accessible={false} importantForAccessibility="no" numberOfLines={stacked ? undefined : 1}
        style={[styles.label, letters ? styles.letterLabel : wrapped && styles.wrappedLabel, stacked && styles.stackedLabel]}>{label}</Text>
      {letters ? (
        <View testID="receipt-letters" style={[styles.letters, wrapped && styles.wrappedLetters, stacked && styles.stackedLetters]}
          onLayout={({ nativeEvent: { layout } }) => {
            // onLayout includes padding: compare the tile content, not the padded 52dp row.
            setWrapped(layout.height - 2 * styles.letters.paddingVertical > 36);
          }}>
          {value.map(letter => <LetterReceiptTile key={letter} letter={letter} />)}
        </View>
      ) : (
        <Text accessible={false} importantForAccessibility="no"
          style={[styles.value, wrapped && styles.wrappedValue, stacked && styles.stackedValue]}
          onTextLayout={({ nativeEvent: { lines } }) => setWrapped(lines.length > 1)}>{value}</Text>
      )}
    </View>
  );
}

export default function SessionReceipt({ rows }) {
  if (rows.length === 0) return null;
  return (
    <View style={styles.receipt}>
      {rows.map((row, index) => <ReceiptRow {...row} key={row.key} isLast={index === rows.length - 1} />)}
    </View>
  );
}

const styles = StyleSheet.create({
  receipt: { marginTop: 20, marginHorizontal: 24 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 16, minHeight: 52 },
  divider: { borderBottomWidth: 1, borderBottomColor: tints.rule },
  topAligned: { alignItems: 'flex-start' },
  stackedRow: { flexDirection: 'column', alignItems: 'stretch', justifyContent: 'flex-start', gap: 0, paddingTop: spacing.sm },
  label: { ...typeRoles.textSectionLabel, color: colors.textSecondary },
  wrappedLabel: { marginTop: 11 },
  letterLabel: { marginTop: 18 },
  stackedLabel: { marginTop: 0 },
  value: { ...typeRoles.textRowTitle, color: colors.text, flex: 1, paddingVertical: 8, textAlign: 'right' },
  wrappedValue: { textAlign: 'left' },
  stackedValue: { flex: 0, textAlign: 'left' },
  letters: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, maxWidth: 246, flex: 1, paddingVertical: 8, justifyContent: 'flex-end' },
  wrappedLetters: { justifyContent: 'flex-start' },
  stackedLetters: { flex: 0, justifyContent: 'flex-start' },
});
