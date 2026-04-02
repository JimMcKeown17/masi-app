import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { Text } from 'react-native-paper';
import { colors, spacing, borderRadius } from '../../constants/colors';

export default function EgraLetterGrid({ letters, pageOffset, letterStates, onToggle, disabled, tileSize, tileWidth, tileHeight, gap }) {
  const effectiveWidth = tileWidth || tileSize;
  const effectiveHeight = tileHeight || tileSize;
  const baseFontSize = Math.max(14, Math.floor(tileSize * 0.35));
  const digraphFontSize = Math.max(12, Math.floor(tileSize * 0.28));
  const wordFontSize = Math.max(11, Math.floor(tileSize * 0.18));

  return (
    <View style={[styles.grid, { gap }]}>
      {letters.map((letter, i) => {
        const globalIndex = pageOffset + i;
        const isCorrect = letterStates[globalIndex] === true;
        return (
          <Pressable
            key={`${globalIndex}-${letter}`}
            onPress={() => !disabled && onToggle(globalIndex)}
            style={({ pressed }) => [
              styles.tile,
              { width: effectiveWidth, height: effectiveHeight },
              isCorrect && styles.tileCorrect,
              pressed && !disabled && styles.tilePressed,
              disabled && styles.tileDisabled,
            ]}
            accessibilityRole="button"
            accessibilityLabel={`${letter}, ${isCorrect ? 'correct' : 'not marked'}`}
          >
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.5}
              style={[
                styles.tileText,
                { fontSize: baseFontSize },
                isCorrect && styles.tileTextCorrect,
                letter.length === 2 && { fontSize: digraphFontSize },
                letter.length > 2 && { fontSize: wordFontSize },
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
    justifyContent: 'center',
  },
  tile: {
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
    transform: [{ scale: 0.95 }],
    opacity: 0.85,
  },
  tileDisabled: {
    opacity: 0.6,
  },
  tileText: {
    color: colors.text,
    fontWeight: '600',
  },
  tileTextCorrect: {
    color: '#FFFFFF',
  },
});
