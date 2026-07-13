import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  useWindowDimensions,
} from 'react-native';
import { Text, ActivityIndicator } from 'react-native-paper';
import { colors, spacing, borderRadius } from '../../constants/colors';
import { letterStateColors } from '../../constants/letterStateColors';
import { LETTER_SETS, PEDAGOGICAL_ORDERS } from '../../constants/egraConstants';
import { loadMasteryState, countMastered } from '../../utils/masteryState';
import BottomSheet from '../common/BottomSheet';

const GRID_COLUMNS = 5;
const GRID_GAP = spacing.sm;
const CELL_COLORS = letterStateColors;

/**
 * Bottom sheet for updating a child's letter tracker from the session form.
 *
 * Props:
 *   visible         - boolean
 *   onDismiss       - () => void
 *   child           - child object { id, first_name, last_name }
 *   languageKey     - 'english' or 'isixhosa'
 *   pendingChanges  - { [letter]: true/false } changes made this session
 *   onChangesUpdate - (changes: { [letter]: true/false }) => void
 */
export default function LetterTrackerBottomSheet({
  visible,
  onDismiss,
  child,
  userId,
  languageKey,
  pendingChanges,
  onChangesUpdate,
}) {
  const { width: screenWidth } = useWindowDimensions();

  const [assessmentMastered, setAssessmentMastered] = useState(new Set());
  const [existingTaught, setExistingTaught] = useState(new Set());
  const [loading, setLoading] = useState(true);

  const letterSet = LETTER_SETS[languageKey];
  const pedagogicalOrder = PEDAGOGICAL_ORDERS[languageKey];

  // Compute tile size for the bottom sheet grid
  const sheetPadding = spacing.lg * 2;
  const totalGapWidth = (GRID_COLUMNS - 1) * GRID_GAP;
  const tileSize = Math.floor((screenWidth - sheetPadding - totalGapWidth) / GRID_COLUMNS);

  useEffect(() => {
    if (!visible || !child) return;

    (async () => {
      setLoading(true);
      try {
        const { assessmentMastered: masteredSet, taughtRecords } = await loadMasteryState({
          userId,
          childId: child.id,
          languageKey,
        });
        setAssessmentMastered(masteredSet);
        setExistingTaught(new Set(taughtRecords.map(r => r.letter)));
      } catch (error) {
        console.error('Error loading tracker data for bottom sheet:', error);
      } finally {
        setLoading(false);
      }
    })();
  }, [visible, child?.id, languageKey, userId]);

  const getCellState = (letter) => {
    if (assessmentMastered.has(letter)) return 'assessment';

    // Check pending changes first (overrides existing state)
    if (pendingChanges[letter] === true) return 'taught';
    if (pendingChanges[letter] === false) return 'default';

    // Fall back to existing stored state
    if (existingTaught.has(letter)) return 'taught';
    return 'default';
  };

  const handleCellTap = (letter) => {
    // Assessment-mastered cells are locked
    if (assessmentMastered.has(letter)) return;

    const currentState = getCellState(letter);
    const newChanges = { ...pendingChanges };

    if (currentState === 'taught') {
      // Toggle OFF
      if (existingTaught.has(letter)) {
        // Was already taught before this session — mark for removal
        newChanges[letter] = false;
      } else {
        // Was added during this session — just remove the pending add
        delete newChanges[letter];
      }
    } else {
      // Toggle ON
      if (existingTaught.has(letter)) {
        // Was taught before, then un-taught in this session — cancel the removal
        delete newChanges[letter];
      } else {
        // Brand new — mark for addition
        newChanges[letter] = true;
      }
    }

    onChangesUpdate(newChanges);
  };

  const childName = child ? `${child.first_name} ${child.last_name}` : '';

  // Count total mastered for display
  const masteredCount = pedagogicalOrder
    ? countMastered({ assessmentMastered, taughtLetters: existingTaught, pendingChanges, pedagogicalOrder })
    : 0;

  const legend = loading ? null : (
    <View style={styles.legend}>
      <View style={styles.legendItem}>
        <View style={[styles.legendSwatch, { backgroundColor: CELL_COLORS.assessment.bg }]} />
        <Text variant="labelSmall" style={styles.legendLabel}>Assessment</Text>
      </View>
      <View style={styles.legendItem}>
        <View style={[styles.legendSwatch, { backgroundColor: CELL_COLORS.taught.bg }]} />
        <Text variant="labelSmall" style={styles.legendLabel}>Taught</Text>
      </View>
      <View style={styles.legendItem}>
        <View style={[styles.legendSwatch, styles.legendSwatchDefault]} />
        <Text variant="labelSmall" style={styles.legendLabel}>Not yet</Text>
      </View>
    </View>
  );

  return (
    <BottomSheet
      visible={visible}
      onDismiss={onDismiss}
      title="Letter Tracker"
      subtitle={`${childName} \u2014 ${masteredCount}/26 letters`}
      dismissLabel="Dismiss letter tracker"
      headerExtras={legend}
      scrollable={false}
      keyboardAvoiding={false}
    >
      {loading ? (
        <View style={styles.loadingArea}>
          <ActivityIndicator size="small" color={colors.primary} />
        </View>
      ) : (
        <View style={[styles.grid, { gap: GRID_GAP }]}>
          {pedagogicalOrder.map((letter) => {
            const state = getCellState(letter);
            const cellColors = CELL_COLORS[state];
            const isLocked = state === 'assessment';

            return (
              <Pressable
                key={letter}
                onPress={() => handleCellTap(letter)}
                disabled={isLocked}
                accessibilityRole="button"
                accessibilityLabel={`${letter}, ${state === 'assessment' ? 'mastered from assessment' : state === 'taught' ? 'taught by coach' : 'not mastered'}`}
                accessibilityState={{ disabled: isLocked, selected: state !== 'default' }}
                style={({ pressed }) => [
                  styles.cell,
                  {
                    width: tileSize,
                    height: tileSize,
                    backgroundColor: cellColors.bg,
                    borderColor: state === 'default' ? cellColors.border : cellColors.bg,
                  },
                  pressed && !isLocked && styles.cellPressed,
                  isLocked && styles.cellLocked,
                ]}
              >
                <Text style={[
                  styles.cellText,
                  { color: cellColors.text, fontSize: Math.max(16, Math.floor(tileSize * 0.35)) },
                ]}>
                  {letter.toUpperCase()}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  loadingArea: {
    padding: spacing.xl,
    alignItems: 'center',
  },
  legend: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  legendSwatch: {
    width: 12,
    height: 12,
    borderRadius: 3,
  },
  legendSwatchDefault: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  legendLabel: {
    color: colors.textSecondary,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingBottom: spacing.md,
  },
  cell: {
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: borderRadius.sm,
  },
  cellPressed: {
    transform: [{ scale: 0.95 }],
    opacity: 0.85,
  },
  cellLocked: {
    opacity: 0.9,
  },
  cellText: {
    fontWeight: '700',
  },
});
