import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { colors, spacing, borderRadius } from '../../constants/colors';

const DEFAULT_COLUMNS = 5;
const LETTER_TILE_SIZE = 44;
const WORD_TILE_WIDTH = 100;
const TILE_HEIGHT = 44;
const GAP = 5;

export default function AssessmentDetailGrid({ assessment, letterSet }) {
  if (!letterSet) return null;

  const isWord = letterSet.type === 'word';
  const columns = letterSet.columns || DEFAULT_COLUMNS;
  const tileWidth = isWord ? WORD_TILE_WIDTH : LETTER_TILE_SIZE;

  const correctSet = new Set(
    (assessment.correct_letters || []).map((l) => l.index)
  );
  const incorrectSet = new Set(
    (assessment.incorrect_letters || []).map((l) => l.index)
  );
  const lastIndex = assessment.last_letter_attempted?.index ?? -1;

  return (
    <View style={styles.container}>
      <Text variant="titleSmall" style={styles.title}>{isWord ? 'Word' : 'Letter'} Results</Text>

      <View style={[styles.grid, { width: columns * tileWidth + (columns - 1) * GAP }]}>
        {letterSet.letters.map((letter, i) => {
          const notAttempted = i > lastIndex;
          const isCorrect = correctSet.has(i);
          const isIncorrect = incorrectSet.has(i);

          return (
            <View
              key={`${i}-${letter}`}
              style={[
                styles.tile,
                { width: tileWidth, height: TILE_HEIGHT },
                isCorrect && styles.tileCorrect,
                isIncorrect && styles.tileIncorrect,
                notAttempted && styles.tileNotAttempted,
              ]}
            >
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.5}
                style={[
                  styles.tileText,
                  (isCorrect || isIncorrect) && styles.tileTextWhite,
                  notAttempted && styles.tileTextMuted,
                  letter.length === 2 && styles.tileTextDigraph,
                  letter.length > 2 && styles.tileTextWord,
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
  },
  tile: {
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
  tileTextWord: {
    fontSize: 10,
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
