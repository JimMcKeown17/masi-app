import { typeRoles } from '../../constants/typography';
import { useSignedInEA } from '../../context/SignedInEAContext';
import React, { useState, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, ActivityIndicator } from 'react-native-paper';
import { useFocusEffect } from '@react-navigation/native';
import { v4 as uuidv4 } from 'uuid';
import { colors, spacing, borderRadius } from '../../constants/colors';
import LetterToggleGrid from '../sessions/LetterToggleGrid';
import { letterStateColors } from '../../constants/letterStateColors';
import { LETTER_SETS, PEDAGOGICAL_ORDERS } from '../../constants/egraConstants';
import { normalizeLanguageKey } from '../../utils/letterMastery';
import { loadMasteryState } from '../../utils/masteryState';

import { useAuth } from '../../context/AuthContext';
import { useOffline } from '../../context/OfflineContext';


export default function LetterMasteryPanel({ child, classItem }) {
  const { repositories } = useSignedInEA();
  const { mastery: masteryRepository } = repositories;

  const { user } = useAuth();
  const { refreshSyncStatus, triggerBackgroundSync } = useOffline();

  const [assessmentMastered, setAssessmentMastered] = useState(new Set());
  const [taughtLetters, setTaughtLetters] = useState({}); // { letter: recordId }
  const [loading, setLoading] = useState(true);
  const [latestAssessmentDate, setLatestAssessmentDate] = useState(null);
  const [mutationError, setMutationError] = useState(null);
  const [updatingLetter, setUpdatingLetter] = useState(null);

  const languageKey = normalizeLanguageKey(classItem?.home_language);
  const letterSet = LETTER_SETS[languageKey];
  const pedagogicalOrder = PEDAGOGICAL_ORDERS[languageKey];

  const loadData = useCallback(async () => {
    try {
      setLoading(true);

      const { assessmentMastered: masteredSet, latestAssessment, taughtRecords } = await loadMasteryState({ repositories,
        userId: user.id,
        childId: child.id,
        languageKey,
      });
      setLatestAssessmentDate(latestAssessment?.date_assessed || null);
      setAssessmentMastered(masteredSet);

      const taughtMap = {};
      taughtRecords.forEach(r => { taughtMap[r.letter] = r.id; });
      setTaughtLetters(taughtMap);
    } catch (error) {
      console.error('Error loading letter tracker data:', error);
    } finally {
      setLoading(false);
    }
  }, [child.id, languageKey, user.id]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const handleCellTap = async (letter) => {
    // Assessment-mastered cells are locked
    if (assessmentMastered.has(letter)) return;
    if (updatingLetter) return;

    setMutationError(null);
    setUpdatingLetter(letter);

    try {
      if (taughtLetters[letter]) {
        // Currently green -> toggle OFF (soft-delete). Re-resolve the active row by its logical
        // key rather than trusting the cached id: that id can drift under us (deterministic-id
        // canonicalisation, or a background canonical-id adoption renaming the row), and a stale
        // id would make the update a silent no-op, leaving the letter mastered.
        const allMastery = await masteryRepository.getLetterMastery({
          userId: user.id,
          childId: child.id,
        });
        const active = allMastery.find(
          r => r.child_id === child.id && r.letter === letter && r.language === letterSet.language && !r._deleted
        );
        if (active) {
          await masteryRepository.updateLetterMasteryRecord(active.id, {
            _deleted: true,
            synced: false,
            updated_at: new Date().toISOString(),
          });
        }
        setTaughtLetters(prev => {
          const next = { ...prev };
          delete next[letter];
          return next;
        });
        if (active) {
          refreshSyncStatus().catch(() => {});
          triggerBackgroundSync?.();
        }
      } else {
        // Currently gray -> toggle ON
        // Check for existing soft-deleted record to reuse (avoids duplicate key on sync)
        const allMastery = await masteryRepository.getLetterMastery({
          userId: user.id,
          childId: child.id,
        });
        const existing = allMastery.find(
          r => r.child_id === child.id && r.letter === letter && r.language === letterSet.language && r._deleted
        );
        if (existing) {
          // Reactivate the soft-deleted record
          await masteryRepository.updateLetterMasteryRecord(existing.id, {
            _deleted: false,
            deleted_at: null,
            synced: false,
            updated_at: new Date().toISOString(),
          });
          setTaughtLetters(prev => ({ ...prev, [letter]: existing.id }));
          refreshSyncStatus().catch(() => {});
          triggerBackgroundSync?.();
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
          // saveLetterMasteryRecord canonicalises the id (deterministic logical-key id), so
          // track the returned id — not the discarded local uuid — or toggle-off no-ops.
          const savedId = await masteryRepository.saveLetterMasteryRecord(record);
          setTaughtLetters(prev => ({ ...prev, [letter]: savedId }));
          refreshSyncStatus().catch(() => {});
          triggerBackgroundSync?.();
        }
      }
    } catch (error) {
      console.error('Error saving letter mastery:', error);
      setMutationError('Letter update was not saved. Please try again.');
    } finally {
      setUpdatingLetter(null);
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
        <ActivityIndicator size="large" color={colors.text} />
      </View>
    );
  }

  const languageLabel = letterSet.language;
  const allMastered = new Set([...assessmentMastered, ...Object.keys(taughtLetters)]);
  const masteredCount = allMastered.size;

  return (
    <View>
      {/* Meta row (NO child name — the consumer renders that) */}
      <View style={styles.header}>
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
        {mutationError && (
          <Text variant="bodyMedium" style={styles.mutationErrorText}>
            {mutationError}
          </Text>
        )}
      </View>

      <View style={styles.legend}>
        {[
          ['Taught', 'taught'], ['Not yet', 'default'], ['Assessment (locked)', 'assessment'],
        ].map(([label, state]) => {
          const palette = letterStateColors[state];
          return <View key={label} style={styles.legendItem}>
            <View style={[styles.legendSwatch, { backgroundColor: palette.bg, borderColor: palette.border }]} />
            <Text style={styles.legendLabel}>{label}</Text>
          </View>;
        })}
      </View>

      <LetterToggleGrid letters={pedagogicalOrder} onPressLetter={handleCellTap} tileFor={(letter) => {
        const state = getCellState(letter);
        const locked = state === 'assessment';
        const disabled = locked || Boolean(updatingLetter);
        return {
          tone: locked ? 'locked' : state === 'taught' ? 'taught' : 'rest', disabled,
          accessibilityState: { disabled, selected: state !== 'default' },
          accessibilityLabel: `${letter}, ${locked ? 'mastered from assessment, locked' : state === 'taught' ? 'taught by coach' : 'not mastered'}`,
        };
      }} />
    </View>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  header: {
    marginBottom: spacing.md,
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
    color: colors.onDark,
    ...typeRoles.textNote,
  },
  progressText: {
    color: colors.textSecondary,
  },
  assessmentDateText: {
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  mutationErrorText: {
    color: colors.error,
    marginTop: spacing.sm,
  },
  legend: {
    flexDirection: 'row', flexWrap: 'wrap', rowGap: 8, columnGap: 16,
    marginBottom: spacing.lg, paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md, backgroundColor: colors.surface, borderRadius: borderRadius.sm,
  },
  legendItem: { flexBasis: '45%', flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendSwatch: { width: 16, height: 16, borderRadius: 5, borderWidth: 1.5 },
  legendLabel: { ...typeRoles.textCaption, color: colors.textSecondary, flexShrink: 1 },
});
