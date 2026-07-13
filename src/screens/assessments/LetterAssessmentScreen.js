import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from 'react-native-paper';
import { CAPTURE_MODES } from '../../constants/egraConstants';
import EgraLetterGrid from '../../components/assessment/EgraLetterGrid';
import AssessmentInstructions from '../../components/assessment/AssessmentInstructions';
import CaptureHeader from '../../components/assessment/CaptureHeader';
import EndAssessmentButton from '../../components/assessment/EndAssessmentButton';
import LastAttemptedBottomSheet from '../../components/assessment/LastAttemptedBottomSheet';
import { captureStyles } from '../../components/assessment/captureStyles';
import { useAssessmentSession } from '../../hooks/useAssessmentSession';
import { colors, spacing } from '../../constants/colors';

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

  const startPage = currentPage * letterSet.lettersPerPage;
  const pageLetters = letterSet.letters.slice(startPage, startPage + letterSet.lettersPerPage);
  const isLastPage = currentPage === totalPages - 1;

  // --- Instructions Phase ---
  if (phase === 'instructions') {
    return (
      <AssessmentInstructions
        title={isWordAssessment ? 'Word Reading Assessment' : 'Letter Sound Assessment'}
        childName={`${child.first_name} ${child.last_name}`}
        language={letterSet.language}
        attemptNumber={attemptNumber}
        steps={[
          '1. Tap "Start" to begin the 60-second timer',
          `2. Point to each ${isWordAssessment ? 'word' : 'letter'} and ask the child to ${isWordAssessment ? 'read the word' : 'say the sound'}`,
          `3. Tap ${isWordAssessment ? 'words' : 'letters'} the child gets CORRECT (they turn green)`,
          `4. Skip incorrect ${isWordAssessment ? 'words' : 'letters'} (leave them unmarked)`,
          '5. Use Next/Prev to navigate pages',
        ]}
        onStart={session.startActive}
        onCancel={() => navigation.goBack()}
      />
    );
  }

  // --- Active / Finished Phase ---
  return (
    <View style={[captureStyles.container, { paddingTop: insets.top }]}> 
      <CaptureHeader
        getElapsedMs={getElapsedMs}
        pageLabel="Page"
        currentPage={currentPage}
        totalPages={totalPages}
      />

      <View style={captureStyles.gridContainer}>
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
          <EndAssessmentButton onEnd={handleFinish} />
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
