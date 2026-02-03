import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { Text } from 'react-native-paper';
import { LETTER_ORDER } from '../../constants/literacyConstants';
import { colors, spacing, borderRadius } from '../../constants/colors';

export default function LetterGrid({ selectedLetters, onToggleLetter }) {
  return (
    <View style={styles.grid}>
      {LETTER_ORDER.map((letter) => {
        const isSelected = selectedLetters.includes(letter);
        return (
          <Pressable
            key={letter}
            onPress={() => onToggleLetter(letter)}
            style={({ pressed }) => [
              styles.tile,
              isSelected && styles.tileSelected,
              pressed && styles.tilePressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel={`${letter.toUpperCase()}, ${isSelected ? 'selected' : 'not selected'}`}
          >
            <Text
              variant="titleMedium"
              style={[styles.tileText, isSelected && styles.tileTextSelected]}
            >
              {letter.toUpperCase()}
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
  tileSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  tilePressed: {
    opacity: 0.7,
  },
  tileText: {
    color: colors.text,
  },
  tileTextSelected: {
    color: '#FFFFFF',
  },
});
