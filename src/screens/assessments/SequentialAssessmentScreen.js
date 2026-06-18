import React, { useReducer, useEffect, useCallback, useRef } from 'react';
import { View, StyleSheet, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, Button } from 'react-native-paper';
import { CAPTURE_MODES } from '../../constants/egraConstants';
import EgraLetterGrid from '../../components/assessment/EgraLetterGrid';
import AssessmentTimer from '../../components/assessment/AssessmentTimer';
import { useAssessmentSession } from '../../hooks/useAssessmentSession';
import { initSequentialState, sequentialReducer } from '../../utils/sequentialAssessmentReducer';
import { colors, spacing, borderRadius } from '../../constants/colors';

export default function SequentialAssessmentScreen({ navigation, route }) {
  const {
    child, letterSet, attemptNumber = 1,
    assessmentType = 'letter_egra', captureMode = CAPTURE_MODES.SEQUENTIAL,
  } = route.params;
  const isWordAssessment = assessmentType === 'word_egra';

  const [state, dispatch] = useReducer(sequentialReducer, undefined, initSequentialState);
  const stateRef = useRef(state);
  stateRef.current = state;

  const insets = useSafeAreaInsets();
  const session = useAssessmentSession({
    navigation, child, letterSet, attemptNumber, assessmentType, captureMode, isWordAssessment,
  });
  // Destructure stable members so callback/effect deps don't depend on the per-render session object.
  const { phase, timeRemaining, isPaused, layout, finishAndSave, setOnTimerExpire, hasFinishedRef } = session;
  const { tileWidth, tileHeight, tileSize, GAP } = layout;

  const totalLetters = letterSet.letters.length;
  const totalPages = Math.ceil(totalLetters / letterSet.lettersPerPage);

  const finishWith = useCallback((s) => {
    finishAndSave({ letterStates: s.letterStates, finalLastIndex: s.cursor - 1, correctionCount: s.correctionCount });
  }, [finishAndSave]);

  // Timer expiry: hard stop at the cursor. The handler reads stateRef (a ref) so it is
  // safe even as a closure over an earlier render.
  useEffect(() => { setOnTimerExpire(() => finishWith(stateRef.current)); }, [setOnTimerExpire, finishWith]);

  const decide = useCallback((correct) => {
    // Guard on finish-state AND the cursor bound: queued/rapid taps on the final item must
    // not push the cursor past the last index (which would over-count letters_attempted).
    if (hasFinishedRef.current || stateRef.current.cursor >= totalLetters) return;
    dispatch({ type: 'decide', correct, totalLetters });
  }, [hasFinishedRef, totalLetters]);

  // Early-finish from COMMITTED state — NOT a hand-rolled `next` + stale-ref last-item check.
  // Once the cursor has consumed the final item, save. Deriving this from committed state
  // closes a double-tap race (two decides before a commit could otherwise skip the finish and
  // strand the EA). Idempotent via finishAndSave's hasFinishedRef guard.
  useEffect(() => {
    if (phase === 'active' && state.cursor >= totalLetters) finishWith(state);
  }, [state, phase, totalLetters, finishWith]);

  const goBack = useCallback(() => dispatch({ type: 'back' }), []);

  const handleEndAssessment = useCallback(() => {
    Alert.alert('End Assessment?', 'End the assessment now and record current results?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'End', style: 'destructive', onPress: () => finishWith(stateRef.current) },
    ]);
  }, [finishWith]);

  // Clamp the display cursor: deciding the last item advances state.cursor past the final
  // index (triggering finish), which would otherwise compute an out-of-range page.
  const displayCursor = Math.min(state.cursor, totalLetters - 1);
  const currentPage = Math.floor(displayCursor / letterSet.lettersPerPage);
  const startPage = currentPage * letterSet.lettersPerPage;
  const pageLetters = letterSet.letters.slice(startPage, startPage + letterSet.lettersPerPage);

  if (phase === 'instructions') {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.instructionsContainer}>
          <Text variant="headlineSmall" style={styles.instructionsTitle}>
            {isWordAssessment ? 'Word Reading Assessment' : 'Letter Sound Assessment'}
          </Text>
          <Text variant="bodyLarge" style={styles.instructionsChild}>{child.first_name} {child.last_name}</Text>
          <Text variant="bodyMedium" style={styles.instructionsLanguage}>{letterSet.language} - Attempt #{attemptNumber}</Text>
          <View style={styles.instructionsBox}>
            <Text variant="bodyMedium" style={styles.instructionsText}>1. Tap "Start" to begin the 60-second timer</Text>
            <Text variant="bodyMedium" style={styles.instructionsText}>2. The highlighted {isWordAssessment ? 'word' : 'letter'} is the one the child is reading</Text>
            <Text variant="bodyMedium" style={styles.instructionsText}>3. Tap the green ✓ if correct or the red ✗ if incorrect — it moves to the next automatically</Text>
            <Text variant="bodyMedium" style={styles.instructionsText}>4. Use the ← back button to fix a mistake</Text>
          </View>
          <Button mode="contained" onPress={session.startActive} style={styles.startButton} contentStyle={styles.startButtonContent}>Start Assessment</Button>
          <Button mode="outlined" onPress={() => navigation.goBack()}>Cancel</Button>
        </View>
      </View>
    );
  }

  const finished = phase === 'finished';
  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.timerRow}><AssessmentTimer timeRemaining={timeRemaining} isPaused={isPaused} /></View>
      <View style={styles.pageInfo}>
        <Text variant="bodySmall" style={styles.pageText}>Grid {currentPage + 1} of {totalPages}</Text>
        <View style={styles.dots}>
          {Array.from({ length: totalPages }).map((_, i) => (<View key={i} style={[styles.dot, i === currentPage && styles.dotActive]} />))}
        </View>
      </View>
      <View style={styles.gridContainer}>
        <EgraLetterGrid
          letters={pageLetters} pageOffset={startPage} letterStates={state.letterStates}
          readOnly currentIndex={finished ? -1 : displayCursor} tileSize={tileSize}
          tileWidth={isWordAssessment ? tileWidth : undefined} tileHeight={isWordAssessment ? tileHeight : undefined} gap={GAP}
        />
      </View>
      <View style={[styles.controls, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
        <View style={styles.decisionRow}>
          <Button mode="contained" buttonColor={colors.success} onPress={() => decide(true)} disabled={finished} style={styles.decisionButton} contentStyle={styles.decisionButtonContent} icon="check">Correct</Button>
          <Button mode="contained" buttonColor={colors.error} onPress={() => decide(false)} disabled={finished} style={styles.decisionButton} contentStyle={styles.decisionButtonContent} icon="close">Incorrect</Button>
        </View>
        <Button mode="outlined" onPress={goBack} disabled={finished || state.cursor === 0} contentStyle={styles.backButtonContent} icon="arrow-left">Back</Button>
        {phase === 'active' && (<Button mode="text" onPress={handleEndAssessment} textColor={colors.emphasis} compact>End Assessment</Button>)}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  instructionsContainer: { flex: 1, padding: spacing.lg, justifyContent: 'center' },
  instructionsTitle: { textAlign: 'center', color: colors.text, marginBottom: spacing.sm },
  instructionsChild: { textAlign: 'center', color: colors.primary, fontWeight: '600', marginBottom: spacing.xs },
  instructionsLanguage: { textAlign: 'center', color: colors.textSecondary, marginBottom: spacing.xl },
  instructionsBox: { backgroundColor: colors.surface, borderRadius: borderRadius.md, padding: spacing.lg, marginBottom: spacing.xl, gap: spacing.sm },
  instructionsText: { color: colors.text },
  startButton: { marginBottom: spacing.md },
  startButtonContent: { paddingVertical: spacing.sm },
  timerRow: { paddingVertical: spacing.md },
  pageInfo: { alignItems: 'center', marginBottom: spacing.sm },
  pageText: { color: colors.textSecondary, marginBottom: spacing.xs },
  dots: { flexDirection: 'row', gap: spacing.sm },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.border },
  dotActive: { backgroundColor: colors.primary },
  gridContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  controls: { padding: spacing.md, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border, gap: spacing.sm },
  decisionRow: { flexDirection: 'row', gap: spacing.md },
  decisionButton: { flex: 1 },
  decisionButtonContent: { paddingVertical: spacing.md },
  backButtonContent: { paddingVertical: spacing.sm },
});
