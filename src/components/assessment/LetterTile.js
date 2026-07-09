import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { colors, borderRadius } from '../../constants/colors';

function LetterTileBase({ letter, index, state, isCurrent, onPress, disabled, readOnly, width, height, fontSize }) {
  const isCorrect = state === true;
  const isIncorrect = state === false;
  const handlePress = () => { if (disabled || readOnly) return; if (onPress) onPress(index); };

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [
        styles.tile,
        { width, height },
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
          { fontSize },
          isCorrect && styles.tileTextCorrect,
          isIncorrect && styles.tileTextIncorrect,
        ]}
      >
        {letter}
      </Text>
    </Pressable>
  );
}

export const LetterTile = React.memo(LetterTileBase);
export default LetterTile;

const styles = StyleSheet.create({
  tile: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.sm,
  },
  tileCorrect: { backgroundColor: colors.success, borderColor: colors.success },
  tileIncorrect: { backgroundColor: colors.error, borderColor: colors.error },
  tileCurrent: { borderColor: colors.primary, borderWidth: 2 },
  tilePressed: { transform: [{ scale: 0.95 }], opacity: 0.85 },
  tileDisabled: { opacity: 0.6 },
  tileText: { color: colors.text, fontWeight: '600' },
  tileTextCorrect: { color: '#FFFFFF' },
  tileTextIncorrect: { color: '#FFFFFF' },
});
