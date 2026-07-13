import React, { useReducer, useEffect, useCallback, useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from 'react-native-paper';
import { CAPTURE_MODES } from '../../constants/egraConstants';
import EgraLetterGrid from '../../components/assessment/EgraLetterGrid';
import AssessmentInstructions from '../../components/assessment/AssessmentInstructions';
import CaptureHeader from '../../components/assessment/CaptureHeader';
import EndAssessmentButton from '../../components/assessment/EndAssessmentButton';
import { captureStyles } from '../../components/assessment/captureStyles';
import { useAssessmentSession } from '../../hooks/useAssessmentSession';
import { initSequentialState, sequentialReducer } from '../../utils/sequentialAssessmentReducer';
import { colors, spacing } from '../../constants/colors';

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
  const { phase, layout, finishAndSave, setOnTimerExpire, hasFinishedRef, getElapsedMs, isExpired } = session;
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
    if (isExpired()) { finishWith(stateRef.current); return; } // authoritative hard-stop
    dispatch({ type: 'decide', correct, totalLetters });
  }, [hasFinishedRef, totalLetters, isExpired, finishWith]);

  // Early-finish from COMMITTED state — NOT a hand-rolled `next` + stale-ref last-item check.
  // Once the cursor has consumed the final item, save. Deriving this from committed state
  // closes a double-tap race (two decides before a commit could otherwise skip the finish and
  // strand the EA). Idempotent via finishAndSave's hasFinishedRef guard.
  useEffect(() => {
    if (phase === 'active' && state.cursor >= totalLetters) finishWith(state);
  }, [state, phase, totalLetters, finishWith]);

  const goBack = useCallback(() => {
    if (isExpired()) { finishWith(stateRef.current); return; } // no corrections after time is up
    dispatch({ type: 'back' });
  }, [isExpired, finishWith]);

  const handleEndAssessment = useCallback(() => {
    finishWith(stateRef.current);
  }, [finishWith]);

  // Clamp the display cursor: deciding the last item advances state.cursor past the final
  // index (triggering finish), which would otherwise compute an out-of-range page.
  const displayCursor = Math.min(state.cursor, totalLetters - 1);
  const currentPage = Math.floor(displayCursor / letterSet.lettersPerPage);
  const startPage = currentPage * letterSet.lettersPerPage;
  const pageLetters = letterSet.letters.slice(startPage, startPage + letterSet.lettersPerPage);

  if (phase === 'instructions') {
    return (
      <AssessmentInstructions
        title={isWordAssessment ? 'Word Reading Assessment' : 'Letter Sound Assessment'}
        childName={`${child.first_name} ${child.last_name}`}
        language={letterSet.language}
        attemptNumber={attemptNumber}
        steps={[
          '1. Tap "Start" to begin the 60-second timer',
          `2. The highlighted ${isWordAssessment ? 'word' : 'letter'} is the one the child is reading`,
          '3. Tap the green ✓ if correct or the red ✗ if incorrect — it moves to the next automatically',
          '4. Use the ← back button to fix a mistake',
        ]}
        onStart={session.startActive}
        onCancel={() => navigation.goBack()}
      />
    );
  }

  const finished = phase === 'finished';
  return (
    <View style={[captureStyles.container, { paddingTop: insets.top }]}> 
      <CaptureHeader
        getElapsedMs={getElapsedMs}
        pageLabel="Grid"
        currentPage={currentPage}
        totalPages={totalPages}
      />
      <View style={captureStyles.gridContainer}>
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
        <Button mode="outlined" onPress={goBack} disabled={finished || state.cursor === 0} textColor={colors.text} contentStyle={styles.backButtonContent} icon="arrow-left">Back</Button>
        {phase === 'active' && <EndAssessmentButton onEnd={handleEndAssessment} />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  controls: { padding: spacing.md, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border, gap: spacing.sm },
  decisionRow: { flexDirection: 'row', gap: spacing.md },
  decisionButton: { flex: 1 },
  decisionButtonContent: { paddingVertical: spacing.md },
  backButtonContent: { paddingVertical: spacing.sm },
});
