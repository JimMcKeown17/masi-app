import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { Text } from 'react-native-paper';
import { colors, spacing, borderRadius } from '../../constants/colors';

export default function EgraLetterGrid({ letters, pageOffset, letterStates, onToggle, disabled }) {
  return (
    <View style={styles.grid}>
      {letters.map((letter, i) => {
        const globalIndex = pageOffset + i;
        const isCorrect = letterStates[globalIndex] === true;
        return (
          <Pressable
            key={`${globalIndex}-${letter}`}
            onPress={() => !disabled && onToggle(globalIndex)}
            style={({ pressed }) => [
              styles.tile,
              isCorrect && styles.tileCorrect,
              pressed && !disabled && styles.tilePressed,
              disabled && styles.tileDisabled,
            ]}
            accessibilityRole="button"
            accessibilityLabel={`${letter}, ${isCorrect ? 'correct' : 'not marked'}`}
          >
            <Text
              style={[
                styles.tileText,
                isCorrect && styles.tileTextCorrect,
                letter.length > 1 && styles.tileTextDigraph,
              ]}
            >
              {letter}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    justifyContent: 'center',
  },
  tile: {
    width: '18%',
    aspectRatio: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.sm,
  },
  tileCorrect: {
    backgroundColor: colors.success,
    borderColor: colors.success,
  },
  tilePressed: {
    opacity: 0.7,
  },
  tileDisabled: {
    opacity: 0.6,
  },
  tileText: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '600',
  },
  tileTextCorrect: {
    color: '#FFFFFF',
  },
  tileTextDigraph: {
    fontSize: 16,
  },
});
