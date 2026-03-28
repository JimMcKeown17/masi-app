import React, { useState, useCallback } from 'react';
import { View, StyleSheet, Pressable, useWindowDimensions, ScrollView } from 'react-native';
import { Text, ActivityIndicator } from 'react-native-paper';
import { useFocusEffect } from '@react-navigation/native';
import { v4 as uuidv4 } from 'uuid';
import { colors, spacing, borderRadius } from '../../constants/colors';
import { LETTER_SETS, PEDAGOGICAL_ORDERS } from '../../constants/egraConstants';
import { computeAssessmentMastery, normalizeLanguageKey } from '../../utils/letterMastery';
import { storage } from '../../utils/storage';
import { useAuth } from '../../context/AuthContext';

const GRID_COLUMNS = 5;
const GRID_GAP = spacing.sm;

// Cell color palette
const CELL_COLORS = {
  assessment: { bg: '#FB8C00', text: '#FFFFFF' },
  taught: { bg: colors.success, text: '#FFFFFF' },
  default: { bg: colors.surface, text: colors.text, border: colors.border },
};

export default function LetterTrackerScreen({ route }) {
  const { child, classItem } = route.params;
  const { user } = useAuth();
  const { width: screenWidth } = useWindowDimensions();

  const [assessmentMastered, setAssessmentMastered] = useState(new Set());
  const [taughtLetters, setTaughtLetters] = useState({}); // { letter: recordId }
  const [loading, setLoading] = useState(true);
  const [latestAssessmentDate, setLatestAssessmentDate] = useState(null);

  const languageKey = normalizeLanguageKey(classItem?.home_language);
  const letterSet = LETTER_SETS[languageKey];
  const pedagogicalOrder = PEDAGOGICAL_ORDERS[languageKey];

  // Compute tile size based on screen width
  const gridPadding = spacing.md * 2;
  const totalGapWidth = (GRID_COLUMNS - 1) * GRID_GAP;
  const tileSize = Math.floor((screenWidth - gridPadding - totalGapWidth) / GRID_COLUMNS);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);

      // 1. Find the child's most recent assessment for this language
      const allAssessments = await storage.getAssessments();
      const childAssessments = allAssessments
        .filter(a => a.child_id === child.id && a.letter_language === letterSet.language)
        .sort((a, b) => {
          const dateCmp = b.date_assessed.localeCompare(a.date_assessed);
          if (dateCmp !== 0) return dateCmp;
          return b.created_at.localeCompare(a.created_at);
        });
      const latestAssessment = childAssessments[0] || null;
      setLatestAssessmentDate(latestAssessment?.date_assessed || null);

      // 2. Compute assessment mastery
      const masteredSet = computeAssessmentMastery(latestAssessment, letterSet, pedagogicalOrder);
      setAssessmentMastered(masteredSet);

      // 3. Load coach-taught letters
      const allMastery = await storage.getLetterMastery();
      const childTaught = allMastery.filter(
        r => r.child_id === child.id &&
             r.language === letterSet.language &&
             !r._deleted
      );
      const taughtMap = {};
      childTaught.forEach(r => { taughtMap[r.letter] = r.id; });
      setTaughtLetters(taughtMap);
    } catch (error) {
      console.error('Error loading letter tracker data:', error);
    } finally {
      setLoading(false);
    }
  }, [child.id, letterSet.language, pedagogicalOrder]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const handleCellTap = async (letter) => {
    // Assessment-mastered cells are locked
    if (assessmentMastered.has(letter)) return;

    if (taughtLetters[letter]) {
      // Currently green -> toggle OFF (soft-delete)
      const recordId = taughtLetters[letter];
      await storage.updateLetterMasteryRecord(recordId, {
        _deleted: true,
        synced: false,
        updated_at: new Date().toISOString(),
      });
      setTaughtLetters(prev => {
        const next = { ...prev };
        delete next[letter];
        return next;
      });
    } else {
      // Currently gray -> toggle ON
      // Check for existing soft-deleted record to reuse (avoids duplicate key on sync)
      const allMastery = await storage.getLetterMastery();
      const existing = allMastery.find(
        r => r.child_id === child.id && r.letter === letter && r.language === letterSet.language && r._deleted
      );
      if (existing) {
        // Reactivate the soft-deleted record
        await storage.updateLetterMasteryRecord(existing.id, {
          _deleted: false,
          synced: false,
          updated_at: new Date().toISOString(),
        });
        setTaughtLetters(prev => ({ ...prev, [letter]: existing.id }));
      } else {
        // Create new record
        const record = {
          id: uuidv4(),
          user_id: user.id,
          child_id: child.id,
          letter,
          source: 'taught',
          language: letterSet.language,
          synced: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        await storage.saveLetterMasteryRecord(record);
        setTaughtLetters(prev => ({ ...prev, [letter]: record.id }));
      }
    }
  };

  const getCellState = (letter) => {
    if (assessmentMastered.has(letter)) return 'assessment';
    if (taughtLetters[letter]) return 'taught';
    return 'default';
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const childName = `${child.first_name} ${child.last_name}`;
  const languageLabel = letterSet.language;
  const allMastered = new Set([...assessmentMastered, ...Object.keys(taughtLetters)]);
  const masteredCount = allMastered.size;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.header}>
        <Text variant="titleLarge" style={styles.childName}>{childName}</Text>
        <View style={styles.headerMeta}>
          <View style={[styles.languageBadge, { backgroundColor: colors.primary }]}>
            <Text style={styles.languageBadgeText}>{languageLabel}</Text>
          </View>
          <Text variant="bodySmall" style={styles.progressText}>
            {masteredCount} / 26 letters mastered
          </Text>
        </View>
        {latestAssessmentDate && (
          <Text variant="bodySmall" style={styles.assessmentDateText}>
            Last assessed: {latestAssessmentDate}
          </Text>
        )}
      </View>

      {/* Legend */}
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendSwatch, { backgroundColor: CELL_COLORS.assessment.bg }]} />
          <Text variant="bodySmall" style={styles.legendLabel}>Assessment</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendSwatch, { backgroundColor: CELL_COLORS.taught.bg }]} />
          <Text variant="bodySmall" style={styles.legendLabel}>Taught</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendSwatch, styles.legendSwatchDefault]} />
          <Text variant="bodySmall" style={styles.legendLabel}>Not yet</Text>
        </View>
      </View>

      {/* Letter Grid */}
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
              accessibilityRole="button"
              accessibilityLabel={`${letter}, ${state === 'assessment' ? 'mastered from assessment' : state === 'taught' ? 'taught by coach' : 'not mastered'}`}
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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.md,
    paddingBottom: spacing.xxl,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  header: {
    marginBottom: spacing.md,
  },
  childName: {
    fontWeight: '700',
  },
  headerMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xs,
    gap: spacing.sm,
  },
  languageBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: 10,
  },
  languageBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  progressText: {
    color: colors.textSecondary,
  },
  assessmentDateText: {
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  legend: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.lg,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.sm,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  legendSwatch: {
    width: 14,
    height: 14,
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
