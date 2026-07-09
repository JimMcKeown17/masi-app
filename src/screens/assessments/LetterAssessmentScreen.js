import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, StyleSheet, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, Button } from 'react-native-paper';
import { CAPTURE_MODES } from '../../constants/egraConstants';
import EgraLetterGrid from '../../components/assessment/EgraLetterGrid';
import CountdownTimer from '../../components/assessment/CountdownTimer';
import LastAttemptedBottomSheet from '../../components/assessment/LastAttemptedBottomSheet';
import { useAssessmentSession } from '../../hooks/useAssessmentSession';
import { colors, spacing, borderRadius } from '../../constants/colors';

export default function LetterAssessmentScreen({ navigation, route }) {
  const {
    child, letterSet, attemptNumber = 1, assessmentType = 'letter_egra',
    captureMode = CAPTURE_MODES.GRID,
  } = route.params;
  const isWordAssessment = assessmentType === 'word_egra';
  const insets = useSafeAreaInsets();

  const session = useAssessmentSession({
    navigation, child, letterSet, attemptNumber, assessmentType, captureMode, isWordAssessment,
  });
  const {
    phase, layout, finishAndSave, setOnTimerExpire, setPhase, stopTimer, hasFinishedRef, getElapsedMs, isExpired,
  } = session;
  const { tileSize, tileWidth, tileHeight, GAP } = layout;

  const [currentPage, setCurrentPage] = useState(0);
  const [letterStates, setLetterStates] = useState({});
  const [lastTappedIndex, setLastTappedIndex] = useState(-1);
  const [showLastAttempted, setShowLastAttempted] = useState(false);

  const letterStatesRef = useRef(letterStates);
  const lastTappedIndexRef = useRef(lastTappedIndex);
  const finishStartedRef = useRef(false);
  const correctionCountRef = useRef(0);

  letterStatesRef.current = letterStates;
  lastTappedIndexRef.current = lastTappedIndex;

  const totalPages = Math.ceil(letterSet.letters.length / letterSet.lettersPerPage);

  const handleFinish = useCallback(() => {
    if (finishStartedRef.current) return;
    finishStartedRef.current = true;
    const lastIndex = letterSet.letters.length - 1;
    if (letterStatesRef.current[lastIndex] === true) {
      finishAndSave({
        letterStates: letterStatesRef.current,
        finalLastIndex: lastIndex,
        correctionCount: correctionCountRef.current,
      });
    } else {
      stopTimer();          // synchronous timer freeze — parity with the original clearInterval
      setPhase('finished'); // freeze the grid (disabled) before the last-attempted sheet
      setShowLastAttempted(true);
    }
  }, [finishAndSave, letterSet, setPhase, stopTimer]);

  const handleToggle = useCallback((globalIndex) => {
    if (hasFinishedRef.current) return;
    if (isExpired()) { handleFinish(); return; } // authoritative hard-stop
    setLetterStates((prev) => {
      const next = { ...prev };
      if (next[globalIndex]) {
        delete next[globalIndex];
        correctionCountRef.current += 1;
      } else {
        next[globalIndex] = true;
      }
      return next;
    });
    setLastTappedIndex((prev) => Math.max(prev, globalIndex));
  }, [hasFinishedRef, isExpired, handleFinish]);

  useEffect(() => { setOnTimerExpire(handleFinish); }, [setOnTimerExpire, handleFinish]);

  const handleLastAttemptedConfirm = (selectedIndex) => {
    setShowLastAttempted(false);
    finishAndSave({
      letterStates: letterStatesRef.current,
      finalLastIndex: selectedIndex,
      correctionCount: correctionCountRef.current,
    });
  };

  const handleLastAttemptedCancel = () => {
    setShowLastAttempted(false);
    finishAndSave({
      letterStates: letterStatesRef.current,
      finalLastIndex: lastTappedIndexRef.current,
      correctionCount: correctionCountRef.current,
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
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.instructionsContainer}>
          <Text variant="headlineSmall" style={styles.instructionsTitle}>
            {isWordAssessment ? 'Word Reading Assessment' : 'Letter Sound Assessment'}
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
              2. Point to each {isWordAssessment ? 'word' : 'letter'} and ask the child to {isWordAssessment ? 'read the word' : 'say the sound'}
            </Text>
            <Text variant="bodyMedium" style={styles.instructionsText}>
              3. Tap {isWordAssessment ? 'words' : 'letters'} the child gets CORRECT (they turn green)
            </Text>
            <Text variant="bodyMedium" style={styles.instructionsText}>
              4. Skip incorrect {isWordAssessment ? 'words' : 'letters'} (leave them unmarked)
            </Text>
            <Text variant="bodyMedium" style={styles.instructionsText}>
              5. Use Next/Prev to navigate pages
            </Text>
          </View>

          <Button
            mode="contained"
            onPress={session.startActive}
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
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.timerRow}>
        <CountdownTimer getElapsedMs={getElapsedMs} />
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

      <View style={styles.gridContainer}>
        <EgraLetterGrid
          letters={pageLetters}
          pageOffset={startPage}
          letterStates={letterStates}
          onToggle={handleToggle}
          disabled={phase === 'finished'}
          tileSize={tileSize}
          tileWidth={isWordAssessment ? tileWidth : undefined}
          tileHeight={isWordAssessment ? tileHeight : undefined}
          gap={GAP}
        />
      </View>

      <View style={[styles.navRow, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
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

      <LastAttemptedBottomSheet
        visible={showLastAttempted}
        letterSet={letterSet}
        letterStates={letterStates}
        defaultIndex={lastTappedIndex}
        minIndex={Object.keys(letterStates).reduce((max, k) => letterStates[k] === true ? Math.max(max, Number(k)) : max, 0)}
        onConfirm={handleLastAttemptedConfirm}
        onCancel={handleLastAttemptedCancel}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
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
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  navRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});
