import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { Text } from 'react-native-paper';
import { colors, spacing, borderRadius } from '../../constants/colors';

export default function EgraLetterGrid({ letters, pageOffset, letterStates, onToggle, disabled, readOnly = false, currentIndex = -1, tileSize, tileWidth, tileHeight, gap }) {
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
        const isIncorrect = letterStates[globalIndex] === false;
        const isCurrent = globalIndex === currentIndex;
        return (
          <Pressable
            key={`${globalIndex}-${letter}`}
            onPress={() => { if (disabled || readOnly) return; onToggle(globalIndex); }}
            style={({ pressed }) => [
              styles.tile,
              { width: effectiveWidth, height: effectiveHeight },
              isCorrect && styles.tileCorrect,
              isIncorrect && styles.tileIncorrect,
              isCurrent && styles.tileCurrent,
              pressed && !disabled && !readOnly && styles.tilePressed,
              disabled && styles.tileDisabled,
            ]}
            accessibilityRole="button"
            accessibilityLabel={`${letter}, ${isCorrect ? 'correct' : isIncorrect ? 'incorrect' : 'not marked'}${isCurrent ? ', current' : ''}`}
          >
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.5}
              style={[
                styles.tileText,
                { fontSize: baseFontSize },
                isCorrect && styles.tileTextCorrect,
                isIncorrect && styles.tileTextIncorrect,
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
  tileIncorrect: {
    backgroundColor: colors.error,
    borderColor: colors.error,
  },
  tileCurrent: {
    borderColor: colors.primary,
    borderWidth: 2,
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
  tileTextIncorrect: {
    color: '#FFFFFF',
  },
});
