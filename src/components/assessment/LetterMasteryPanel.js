import { typeRoles } from '../../constants/typography';
import { useSignedInEA } from '../../context/SignedInEAContext';
import React, { useState, useCallback, useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, ActivityIndicator } from 'react-native-paper';
import { useFocusEffect } from '@react-navigation/native';
import { colors, spacing, borderRadius } from '../../constants/colors';
import LetterToggleGrid from '../sessions/LetterToggleGrid';
import { letterStateColors } from '../../constants/letterStateColors';
import { PEDAGOGICAL_ORDERS, languageCodeForHomeLanguage } from '../../utils/assessmentRegistry';
import { loadMasteryState } from '../../utils/masteryState';
import useLetterMasterySyncRefresh from '../../hooks/useLetterMasterySyncRefresh';

import { useAuth } from '../../context/AuthContext';
import { useOffline } from '../../context/OfflineContext';


export default function LetterMasteryPanel({ child, classItem }) {
  const { repositories } = useSignedInEA();
  const { mastery: masteryRepository } = repositories;

  const { user } = useAuth();
  const { refreshSyncStatus, triggerBackgroundSync } = useOffline();

  const [assessmentMastered, setAssessmentMastered] = useState(new Set());
  const [taughtLetters, setTaughtLetters] = useState({}); // { letter: true }
  const [loading, setLoading] = useState(true);
  const [latestAssessmentDate, setLatestAssessmentDate] = useState(null);
  const [mutationError, setMutationError] = useState(null);
  const [updatingLetter, setUpdatingLetter] = useState(null);

  const languageCode = languageCodeForHomeLanguage(classItem?.home_language);
  const pedagogicalOrder = PEDAGOGICAL_ORDERS[languageCode];
  const loadGeneration = useRef(0);
  const writeInFlight = useRef(false);

  const loadData = useCallback(async ({ background = false } = {}) => {
    const generation = ++loadGeneration.current;
    if (!background) setLoading(true);
    try {

      const { assessmentMastered: masteredSet, latestAssessment, taughtRecords } = await loadMasteryState({ repositories,
        userId: user.id,
        childId: child.id,
        languageCode,
      });
      if (generation !== loadGeneration.current || writeInFlight.current) return;
      setLatestAssessmentDate(latestAssessment?.assessment_date || null);
      setAssessmentMastered(masteredSet);

      const taughtMap = {};
      taughtRecords.forEach(r => { taughtMap[r.letter] = true; });
      setTaughtLetters(taughtMap);
    } catch (error) {
      console.error('Error loading letter tracker data:', error);
    } finally {
      if (generation === loadGeneration.current && !writeInFlight.current) setLoading(false);
    }
  }, [child.id, languageCode, user.id]);

  const onRefresh = useCallback(() => loadData({ background: true }), [loadData]);
  useLetterMasterySyncRefresh(onRefresh);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const handleCellTap = async (letter) => {
    // Assessment-mastered cells are locked
    if (!pedagogicalOrder || assessmentMastered.has(letter)) return;
    if (updatingLetter || writeInFlight.current) return;

    writeInFlight.current = true;
    ++loadGeneration.current;
    setMutationError(null);
    setUpdatingLetter(letter);

    try {
      const record = await masteryRepository.setLetterMastery({
        childId: child.id,
        letter,
        language: languageCode,
        confirmed: !taughtLetters[letter],
      });
      setTaughtLetters(prev => {
        const next = { ...prev };
        if (record.confirmed) next[letter] = true;
        else delete next[letter];
        return next;
      });
      refreshSyncStatus().catch(() => {});
      triggerBackgroundSync?.();
    } catch (error) {
      console.error('Error saving letter mastery:', error);
      setMutationError('Letter update was not saved. Please try again.');
    } finally {
      writeInFlight.current = false;
      setUpdatingLetter(null);
      loadData({ background: true });
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

  if (!pedagogicalOrder) {
    return <Text style={styles.missingSetText}>No letter set for this class language.</Text>;
  }

  const languageLabel = classItem.home_language;
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
  missingSetText: { ...typeRoles.textBody, color: colors.textSecondary, paddingVertical: spacing.md },
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
