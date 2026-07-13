import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
} from 'react-native';
import { Text, Button } from 'react-native-paper';
import { colors, spacing, borderRadius } from '../../constants/colors';
import BottomSheet from '../common/BottomSheet';

const DEFAULT_COLUMNS = 5;
const TILE_SIZE = 48;
const WORD_TILE_WIDTH = 120;
const GAP = 6;

export default function LastAttemptedBottomSheet({
  visible,
  letterSet,
  letterStates,
  defaultIndex,
  minIndex = 0,
  onConfirm,
  onCancel,
}) {
  const isWord = letterSet.type === 'word';
  const columns = letterSet.columns || DEFAULT_COLUMNS;
  const tileWidth = isWord ? WORD_TILE_WIDTH : TILE_SIZE;
  const [selectedIndex, setSelectedIndex] = useState(defaultIndex);

  // Reset selection when sheet opens with a new defaultIndex
  React.useEffect(() => {
    if (visible) setSelectedIndex(defaultIndex);
  }, [visible, defaultIndex]);

  const letters = letterSet.letters;

  return (
    <BottomSheet
      visible={visible}
      onDismiss={onCancel}
      title={`Last ${isWord ? 'Word' : 'Letter'} Attempted`}
      subtitle={`Tap the last ${isWord ? 'word' : 'letter'} the child attempted`}
      dismissLabel="Dismiss last attempted selector"
      keyboardAvoiding={false}
      bodyContentStyle={styles.gridContainer}
      scrollViewProps={{ showsVerticalScrollIndicator: false }}
      footer={(
        <>
          <Text variant="bodySmall" style={styles.selectedLabel}>
            Selected: {isWord ? 'word' : 'letter'} "{letters[selectedIndex]}" (#{selectedIndex + 1} of {letters.length})
          </Text>
          <Button
            mode="contained"
            onPress={() => onConfirm(selectedIndex)}
            style={styles.confirmButton}
          >
            Confirm
          </Button>
        </>
      )}
    >
      <View style={[styles.grid, { width: columns * tileWidth + (columns - 1) * GAP }]}>
            {letters.map((letter, i) => {
              const isCorrect = letterStates[i] === true;
              const isSelected = i === selectedIndex;
              const isDisabled = i < minIndex;

              return (
                <Pressable
                  key={`${i}-${letter}`}
                  onPress={() => !isDisabled && setSelectedIndex(i)}
                  accessibilityRole="button"
                  accessibilityLabel={`Select ${isWord ? 'word' : 'letter'} ${letter} as last attempted`}
                  accessibilityState={{ disabled: isDisabled, selected: isSelected }}
                  style={[
                    styles.tile,
                    { width: tileWidth, height: TILE_SIZE },
                    isCorrect && styles.tileCorrect,
                    isDisabled && styles.tileDisabled,
                    isSelected && styles.tileSelected,
                  ]}
                >
                  <Text
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.5}
                    style={[
                      styles.tileText,
                      isCorrect && styles.tileTextCorrect,
                      isDisabled && !isCorrect && styles.tileTextDisabled,
                      letter.length === 2 && styles.tileTextDigraph,
                      letter.length > 2 && styles.tileTextWord,
                    ]}
                  >
                    {letter}
                  </Text>
                </Pressable>
              );
            })}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  gridContainer: {
    alignItems: 'center',
    paddingBottom: spacing.md,
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
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.sm,
  },
  tileCorrect: {
    backgroundColor: colors.success,
    borderColor: colors.success,
  },
  tileDisabled: {
    backgroundColor: colors.background,
    borderColor: colors.border,
    opacity: 0.5,
  },
  tileTextDisabled: {
    color: colors.disabled,
  },
  tileSelected: {
    borderWidth: 3,
    borderColor: colors.primary,
  },
  tileText: {
    color: colors.text,
    fontWeight: '600',
    fontSize: 16,
  },
  tileTextCorrect: {
    color: '#FFFFFF',
  },
  tileTextDigraph: {
    fontSize: 13,
  },
  tileTextWord: {
    fontSize: 11,
  },
  selectedLabel: {
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  confirmButton: {
    marginBottom: spacing.sm,
  },
});
