import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  TouchableWithoutFeedback,
  ScrollView,
  Modal,
  Pressable,
} from 'react-native';
import { Text, Button } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing, borderRadius } from '../../constants/colors';

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
  const insets = useSafeAreaInsets();
  const [selectedIndex, setSelectedIndex] = useState(defaultIndex);

  // Reset selection when sheet opens with a new defaultIndex
  React.useEffect(() => {
    if (visible) setSelectedIndex(defaultIndex);
  }, [visible, defaultIndex]);

  const letters = letterSet.letters;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onCancel}
    >
      <TouchableWithoutFeedback onPress={onCancel}>
        <View style={styles.backdrop} />
      </TouchableWithoutFeedback>

      <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
        <View style={styles.handle} />

        <Text variant="titleMedium" style={styles.title}>
          Last {isWord ? 'Word' : 'Letter'} Attempted
        </Text>
        <Text variant="bodyMedium" style={styles.instruction}>
          Tap the last {isWord ? 'word' : 'letter'} the child attempted
        </Text>

        <ScrollView
          style={styles.scrollArea}
          contentContainerStyle={styles.gridContainer}
          showsVerticalScrollIndicator={false}
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
        </ScrollView>

        <View style={styles.footer}>
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
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    maxHeight: '80%',
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
  title: {
    color: colors.text,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  instruction: {
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  scrollArea: {
    flexShrink: 1,
  },
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
    backgroundColor: '#F0F0F0',
    borderColor: '#E0E0E0',
    opacity: 0.5,
  },
  tileTextDisabled: {
    color: '#BDBDBD',
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
  footer: {
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
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
