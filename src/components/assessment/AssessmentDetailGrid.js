import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { colors, spacing, borderRadius } from '../../constants/colors';

const COLUMNS = 5;
const TILE_SIZE = 44;
const GAP = 5;

export default function AssessmentDetailGrid({ assessment, letterSet }) {
  if (!letterSet) return null;

  const correctSet = new Set(
    (assessment.correct_letters || []).map((l) => l.index)
  );
  const incorrectSet = new Set(
    (assessment.incorrect_letters || []).map((l) => l.index)
  );
  const lastIndex = assessment.last_letter_attempted?.index ?? -1;

  return (
    <View style={styles.container}>
      <Text variant="titleSmall" style={styles.title}>Letter Results</Text>

      <View style={styles.grid}>
        {letterSet.letters.map((letter, i) => {
          const notAttempted = i > lastIndex;
          const isCorrect = correctSet.has(i);
          const isIncorrect = incorrectSet.has(i);

          return (
            <View
              key={`${i}-${letter}`}
              style={[
                styles.tile,
                isCorrect && styles.tileCorrect,
                isIncorrect && styles.tileIncorrect,
                notAttempted && styles.tileNotAttempted,
              ]}
            >
              <Text
                style={[
                  styles.tileText,
                  (isCorrect || isIncorrect) && styles.tileTextWhite,
                  notAttempted && styles.tileTextMuted,
                  letter.length > 1 && styles.tileTextDigraph,
                ]}
              >
                {letter}
              </Text>
            </View>
          );
        })}
      </View>

      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.success }]} />
          <Text variant="bodySmall" style={styles.legendText}>Correct</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.emphasis }]} />
          <Text variant="bodySmall" style={styles.legendText}>Incorrect</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.border }]} />
          <Text variant="bodySmall" style={styles.legendText}>Not Attempted</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  title: {
    color: colors.text,
    fontWeight: '600',
    alignSelf: 'flex-start',
    marginBottom: spacing.sm,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: GAP,
    width: COLUMNS * TILE_SIZE + (COLUMNS - 1) * GAP,
  },
  tile: {
    width: TILE_SIZE,
    height: TILE_SIZE,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  tileCorrect: {
    backgroundColor: colors.success,
    borderColor: colors.success,
  },
  tileIncorrect: {
    backgroundColor: colors.emphasis,
    borderColor: colors.emphasis,
  },
  tileNotAttempted: {
    backgroundColor: colors.border,
    borderColor: colors.border,
    opacity: 0.5,
  },
  tileText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  tileTextWhite: {
    color: '#FFFFFF',
  },
  tileTextMuted: {
    color: colors.textSecondary,
  },
  tileTextDigraph: {
    fontSize: 12,
  },
  legend: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  legendDot: {
    width: 12,
    height: 12,
    borderRadius: 3,
  },
  legendText: {
    color: colors.textSecondary,
  },
});
