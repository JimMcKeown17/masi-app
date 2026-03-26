import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  TouchableWithoutFeedback,
  Pressable,
  Modal,
  useWindowDimensions,
} from 'react-native';
import { Text, ActivityIndicator } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing, borderRadius } from '../../constants/colors';
import { LETTER_SETS, PEDAGOGICAL_ORDERS } from '../../constants/egraConstants';
import { computeAssessmentMastery, normalizeLanguageKey } from '../../utils/letterMastery';
import { storage } from '../../utils/storage';

const GRID_COLUMNS = 5;
const GRID_GAP = spacing.sm;

const CELL_COLORS = {
  assessment: { bg: '#FB8C00', text: '#FFFFFF' },
  taught: { bg: colors.success, text: '#FFFFFF' },
  default: { bg: colors.surface, text: colors.text, border: colors.border },
};

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
  languageKey,
  pendingChanges,
  onChangesUpdate,
}) {
  const insets = useSafeAreaInsets();
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
        // 1. Compute assessment mastery from latest assessment
        const allAssessments = await storage.getAssessments();
        const childAssessments = allAssessments
          .filter(a => a.child_id === child.id && a.letter_language === letterSet.language)
          .sort((a, b) => {
            const dateCmp = b.date_assessed.localeCompare(a.date_assessed);
            if (dateCmp !== 0) return dateCmp;
            return b.created_at.localeCompare(a.created_at);
          });
        const latestAssessment = childAssessments[0] || null;
        const masteredSet = computeAssessmentMastery(latestAssessment, letterSet, pedagogicalOrder);
        setAssessmentMastered(masteredSet);

        // 2. Load existing taught letters from storage
        const allMastery = await storage.getLetterMastery();
        const childTaught = allMastery.filter(
          r => r.child_id === child.id &&
               r.language === letterSet.language &&
               !r._deleted
        );
        setExistingTaught(new Set(childTaught.map(r => r.letter)));
      } catch (error) {
        console.error('Error loading tracker data for bottom sheet:', error);
      } finally {
        setLoading(false);
      }
    })();
  }, [visible, child?.id, letterSet.language]);

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
    ? pedagogicalOrder.filter(l => getCellState(l) !== 'default').length
    : 0;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onDismiss}>
      <TouchableWithoutFeedback onPress={onDismiss}>
        <View style={styles.backdrop} />
      </TouchableWithoutFeedback>
      <View style={styles.sheetWrapper}>
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
          {/* Handle */}
          <View style={styles.handleContainer}>
            <View style={styles.handle} />
          </View>

          {/* Header */}
          <Text variant="titleMedium" style={styles.title}>Letter Tracker</Text>
          <Text variant="bodySmall" style={styles.subtitle}>
            {childName} — {masteredCount}/26 letters
          </Text>

          {loading ? (
            <View style={styles.loadingArea}>
              <ActivityIndicator size="small" color={colors.primary} />
            </View>
          ) : (
            <>
              {/* Legend */}
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

              {/* Grid */}
              <View style={[styles.grid, { gap: GRID_GAP, paddingHorizontal: spacing.lg }]}>
                {pedagogicalOrder.map((letter) => {
                  const state = getCellState(letter);
                  const cellColors = CELL_COLORS[state];
                  const isLocked = state === 'assessment';

                  return (
                    <Pressable
                      key={letter}
                      onPress={() => handleCellTap(letter)}
                      disabled={isLocked}
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
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

/**
 * Compute the display count for the button label (total mastered letters).
 * Exported so the parent form can call this without opening the bottom sheet.
 */
export async function getTrackerCount(childId, languageKey, pendingChanges = {}) {
  const letterSet = LETTER_SETS[languageKey];
  const pedagogicalOrder = PEDAGOGICAL_ORDERS[languageKey];
  if (!letterSet || !pedagogicalOrder) return 0;

  // Assessment mastery
  const allAssessments = await storage.getAssessments();
  const childAssessments = allAssessments
    .filter(a => a.child_id === childId && a.letter_language === letterSet.language)
    .sort((a, b) => {
      const dateCmp = b.date_assessed.localeCompare(a.date_assessed);
      if (dateCmp !== 0) return dateCmp;
      return b.created_at.localeCompare(a.created_at);
    });
  const masteredSet = computeAssessmentMastery(childAssessments[0] || null, letterSet, pedagogicalOrder);

  // Existing taught
  const allMastery = await storage.getLetterMastery();
  const existingTaught = new Set(
    allMastery
      .filter(r => r.child_id === childId && r.language === letterSet.language && !r._deleted)
      .map(r => r.letter)
  );

  // Count
  let count = 0;
  for (const letter of pedagogicalOrder) {
    if (masteredSet.has(letter)) { count++; continue; }
    if (pendingChanges[letter] === true) { count++; continue; }
    if (pendingChanges[letter] === false) continue;
    if (existingTaught.has(letter)) { count++; continue; }
  }
  return count;
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  sheetWrapper: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius.lg,
    borderTopRightRadius: borderRadius.lg,
  },
  handleContainer: {
    alignItems: 'center',
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  handle: {
    width: 36,
    height: 4,
    backgroundColor: colors.border,
    borderRadius: 2,
  },
  title: {
    fontWeight: '700',
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
  },
  subtitle: {
    color: colors.textSecondary,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  loadingArea: {
    padding: spacing.xl,
    alignItems: 'center',
  },
  legend: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.lg,
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
