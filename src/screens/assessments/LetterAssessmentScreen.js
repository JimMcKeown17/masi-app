import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, StyleSheet, Alert, ScrollView } from 'react-native';
import { Text, Button, Portal, Dialog } from 'react-native-paper';
import { useAuth } from '../../context/AuthContext';
import { useOffline } from '../../context/OfflineContext';
import { storage } from '../../utils/storage';
import { v4 as uuidv4 } from 'uuid';
import { ASSESSMENT_DURATION } from '../../constants/egraConstants';
import EgraLetterGrid from '../../components/assessment/EgraLetterGrid';
import AssessmentTimer from '../../components/assessment/AssessmentTimer';
import { colors, spacing, borderRadius } from '../../constants/colors';

function computeAssessmentResult(letterStates, lastTappedIndex, letters) {
  if (lastTappedIndex < 0) {
    return {
      lettersAttempted: 0,
      correctResponses: 0,
      incorrectLetters: [],
      correctLetters: [],
      accuracy: 0,
    };
  }

  const lettersAttempted = lastTappedIndex + 1;
  const correctLetters = [];
  const incorrectLetters = [];

  for (let i = 0; i <= lastTappedIndex; i++) {
    if (letterStates[i] === true) {
      correctLetters.push({ index: i, letter: letters[i] });
    } else {
      incorrectLetters.push({ index: i, letter: letters[i] });
    }
  }

  const correctResponses = correctLetters.length;
  const accuracy = lettersAttempted > 0
    ? Math.round((correctResponses / lettersAttempted) * 100)
    : 0;

  return { lettersAttempted, correctResponses, incorrectLetters, correctLetters, accuracy };
}

export default function LetterAssessmentScreen({ navigation, route }) {
  const { child, letterSet, attemptNumber = 1 } = route.params;
  const { user } = useAuth();
  const { refreshSyncStatus } = useOffline();

  const [phase, setPhase] = useState('instructions');
  const [currentPage, setCurrentPage] = useState(0);
  const [letterStates, setLetterStates] = useState({});
  const [timeRemaining, setTimeRemaining] = useState(ASSESSMENT_DURATION);
  const [isPaused, setIsPaused] = useState(false);
  const [lastTappedIndex, setLastTappedIndex] = useState(-1);

  const timerRef = useRef(null);
  const hasFinishedRef = useRef(false);
  const letterStatesRef = useRef(letterStates);
  const lastTappedIndexRef = useRef(lastTappedIndex);
  const timeRemainingRef = useRef(timeRemaining);

  // Keep refs in sync so timer callback reads current values
  letterStatesRef.current = letterStates;
  lastTappedIndexRef.current = lastTappedIndex;
  timeRemainingRef.current = timeRemaining;

  const totalLetters = letterSet.letters.length;
  const totalPages = Math.ceil(totalLetters / letterSet.lettersPerPage);

  // Back-button guard during active assessment
  useEffect(() => {
    if (phase !== 'active') return;

    const unsubscribe = navigation.addListener('beforeRemove', (e) => {
      e.preventDefault();
      Alert.alert(
        'End Assessment?',
        'Are you sure you want to leave? Your progress will be lost.',
        [
          { text: 'Stay', style: 'cancel' },
          { text: 'Leave', style: 'destructive', onPress: () => {
            clearInterval(timerRef.current);
            navigation.dispatch(e.data.action);
          }},
        ]
      );
    });

    return unsubscribe;
  }, [navigation, phase]);

  // Timer
  useEffect(() => {
    if (phase === 'active' && !isPaused) {
      timerRef.current = setInterval(() => {
        setTimeRemaining((prev) => {
          if (prev <= 1) {
            clearInterval(timerRef.current);
            handleFinish();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => clearInterval(timerRef.current);
  }, [phase, isPaused]);

  const handleToggle = useCallback((globalIndex) => {
    if (hasFinishedRef.current) return;

    setLetterStates((prev) => {
      const next = { ...prev };
      if (next[globalIndex]) {
        delete next[globalIndex];
      } else {
        next[globalIndex] = true;
      }
      return next;
    });

    setLastTappedIndex((prev) => Math.max(prev, globalIndex));
  }, []);

  const handleFinish = useCallback(() => {
    if (hasFinishedRef.current) return;
    hasFinishedRef.current = true;
    clearInterval(timerRef.current);
    setPhase('finished');
    saveAssessment();
  }, []);

  const saveAssessment = async () => {
    const elapsed = ASSESSMENT_DURATION - timeRemainingRef.current;
    const currentLetterStates = letterStatesRef.current;
    const currentLastTapped = lastTappedIndexRef.current;
    const result = computeAssessmentResult(currentLetterStates, currentLastTapped, letterSet.letters);

    const now = new Date();
    const dateAssessed = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    const assessment = {
      id: uuidv4(),
      user_id: user.id,
      child_id: child.id,
      assessment_type: 'letter_egra',
      attempt_number: attemptNumber,
      letter_set_id: letterSet.id,
      letter_language: letterSet.language,
      completion_time: elapsed,
      letters_attempted: result.lettersAttempted,
      correct_responses: result.correctResponses,
      accuracy: result.accuracy,
      correct_letters: result.correctLetters,
      incorrect_letters: result.incorrectLetters,
      last_letter_attempted: currentLastTapped >= 0
        ? { index: currentLastTapped, letter: letterSet.letters[currentLastTapped] }
        : null,
      date_assessed: dateAssessed,
      device_info: {},
      synced: false,
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    };

    await storage.saveAssessment(assessment);
    await refreshSyncStatus();

    navigation.navigate('AssessmentResults', {
      assessment,
      child,
      letterSet,
      attemptNumber,
    });
  };

  const handleEndAssessment = () => {
    Alert.alert(
      'End Assessment?',
      'End the assessment now and record current results?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'End', style: 'destructive', onPress: handleFinish },
      ]
    );
  };

  const startPage = currentPage * letterSet.lettersPerPage;
  const pageLetters = letterSet.letters.slice(startPage, startPage + letterSet.lettersPerPage);
  const isLastPage = currentPage === totalPages - 1;

  // --- Instructions Phase ---
  if (phase === 'instructions') {
    return (
      <View style={styles.container}>
        <View style={styles.instructionsContainer}>
          <Text variant="headlineSmall" style={styles.instructionsTitle}>
            Letter Sound Assessment
          </Text>
          <Text variant="bodyLarge" style={styles.instructionsChild}>
            {child.first_name} {child.last_name}
          </Text>
          <Text variant="bodyMedium" style={styles.instructionsLanguage}>
            {letterSet.language} - Attempt #{attemptNumber}
          </Text>

          <View style={styles.instructionsBox}>
            <Text variant="bodyMedium" style={styles.instructionsText}>
              1. Tap "Start" to begin the 60-second timer
            </Text>
            <Text variant="bodyMedium" style={styles.instructionsText}>
              2. Point to each letter and ask the child to say the sound
            </Text>
            <Text variant="bodyMedium" style={styles.instructionsText}>
              3. Tap letters the child gets CORRECT (they turn green)
            </Text>
            <Text variant="bodyMedium" style={styles.instructionsText}>
              4. Skip incorrect letters (leave them unmarked)
            </Text>
            <Text variant="bodyMedium" style={styles.instructionsText}>
              5. Use Next/Prev to navigate pages
            </Text>
          </View>

          <Button
            mode="contained"
            onPress={() => setPhase('active')}
            style={styles.startButton}
            contentStyle={styles.startButtonContent}
          >
            Start Assessment
          </Button>
          <Button
            mode="outlined"
            onPress={() => navigation.goBack()}
            style={styles.cancelButton}
          >
            Cancel
          </Button>
        </View>
      </View>
    );
  }

  // --- Active / Finished Phase ---
  return (
    <View style={styles.container}>
      <View style={styles.timerRow}>
        <AssessmentTimer timeRemaining={timeRemaining} isPaused={isPaused} />
      </View>

      <View style={styles.pageInfo}>
        <Text variant="bodySmall" style={styles.pageText}>
          Page {currentPage + 1} of {totalPages}
        </Text>
        <View style={styles.dots}>
          {Array.from({ length: totalPages }).map((_, i) => (
            <View
              key={i}
              style={[styles.dot, i === currentPage && styles.dotActive]}
            />
          ))}
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.gridContainer}>
        <EgraLetterGrid
          letters={pageLetters}
          pageOffset={startPage}
          letterStates={letterStates}
          onToggle={handleToggle}
          disabled={phase === 'finished'}
        />
      </ScrollView>

      <View style={styles.navRow}>
        <Button
          mode="outlined"
          onPress={() => setCurrentPage((p) => p - 1)}
          disabled={currentPage === 0}
          compact
        >
          Prev
        </Button>

        {phase === 'active' && (
          <Button
            mode="text"
            onPress={handleEndAssessment}
            textColor={colors.emphasis}
            compact
          >
            End Assessment
          </Button>
        )}

        {isLastPage && phase === 'active' ? (
          <Button mode="contained" onPress={handleFinish} compact>
            Finish
          </Button>
        ) : (
          <Button
            mode="outlined"
            onPress={() => setCurrentPage((p) => p + 1)}
            disabled={isLastPage}
            compact
          >
            Next
          </Button>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingTop: 60,
  },
  // Instructions
  instructionsContainer: {
    flex: 1,
    padding: spacing.lg,
    justifyContent: 'center',
  },
  instructionsTitle: {
    textAlign: 'center',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  instructionsChild: {
    textAlign: 'center',
    color: colors.primary,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  instructionsLanguage: {
    textAlign: 'center',
    color: colors.textSecondary,
    marginBottom: spacing.xl,
  },
  instructionsBox: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    marginBottom: spacing.xl,
    gap: spacing.sm,
  },
  instructionsText: {
    color: colors.text,
  },
  startButton: {
    marginBottom: spacing.md,
  },
  startButtonContent: {
    paddingVertical: spacing.sm,
  },
  cancelButton: {},
  // Active phase
  timerRow: {
    paddingVertical: spacing.md,
  },
  pageInfo: {
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  pageText: {
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  dots: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.border,
  },
  dotActive: {
    backgroundColor: colors.primary,
  },
  gridContainer: {
    flexGrow: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  navRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.md,
    paddingBottom: spacing.xl,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});
