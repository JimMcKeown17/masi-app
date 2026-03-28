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

const COLUMNS = 5;
const TILE_SIZE = 48;
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
          Last Letter Attempted
        </Text>
        <Text variant="bodyMedium" style={styles.instruction}>
          Tap the last letter the child attempted
        </Text>

        <ScrollView
          style={styles.scrollArea}
          contentContainerStyle={styles.gridContainer}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.grid}>
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
                    isCorrect && styles.tileCorrect,
                    isDisabled && styles.tileDisabled,
                    isSelected && styles.tileSelected,
                  ]}
                >
                  <Text
                    style={[
                      styles.tileText,
                      isCorrect && styles.tileTextCorrect,
                      isDisabled && !isCorrect && styles.tileTextDisabled,
                      letter.length > 1 && styles.tileTextDigraph,
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
            Selected: letter "{letters[selectedIndex]}" (#{selectedIndex + 1} of {letters.length})
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
    width: COLUMNS * TILE_SIZE + (COLUMNS - 1) * GAP,
  },
  tile: {
    width: TILE_SIZE,
    height: TILE_SIZE,
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
