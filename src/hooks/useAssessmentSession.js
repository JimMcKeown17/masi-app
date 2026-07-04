import { useState, useEffect, useRef, useCallback } from 'react';
import { Alert, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { v4 as uuidv4 } from 'uuid';
import { useAuth } from '../context/AuthContext';
import { useOffline } from '../context/OfflineContext';
import { assessmentsRepository } from '../db/repositories/assessmentsRepository';
import { ASSESSMENT_DURATION } from '../constants/egraConstants';
import { buildAssessmentRecord } from '../utils/assessmentScoring';
import { spacing } from '../constants/colors';

export function useAssessmentSession({
  navigation, child, letterSet, attemptNumber = 1, assessmentType, captureMode, isWordAssessment,
}) {
  const { user } = useAuth();
  const { triggerBackgroundSync, refreshSyncStatus } = useOffline();

  const [phase, setPhase] = useState('instructions');
  const [timeRemaining, setTimeRemaining] = useState(ASSESSMENT_DURATION);
  const [isPaused, setIsPaused] = useState(false);

  const timerRef = useRef(null);
  const hasFinishedRef = useRef(false);
  const allowLeaveRef = useRef(false);
  const abandonedRef = useRef(false);
  const elapsedRef = useRef(0);

  const onTimerExpireRef = useRef(() => {});
  const setOnTimerExpire = useCallback((fn) => { onTimerExpireRef.current = fn; }, []);

  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const COLUMNS = letterSet.columns || 5;
  const ROWS = (letterSet.lettersPerPage || 20) / COLUMNS;
  const GAP = spacing.sm;
  const timerRowHeight = spacing.md * 2 + 14;
  const pageInfoHeight = 20 + spacing.xs + 8 + spacing.sm;
  const navRowHeight = 48 + spacing.md + spacing.md;
  const gridVerticalPadding = spacing.sm * 2;
  const availableHeight = screenHeight - insets.top - timerRowHeight - pageInfoHeight
    - navRowHeight - Math.max(insets.bottom, spacing.md) - gridVerticalPadding;
  const availableWidth = screenWidth - spacing.md * 2;
  const tileWidthFromColumns = (availableWidth - GAP * (COLUMNS - 1)) / COLUMNS;
  const tileHeightFromRows = (availableHeight - GAP * (ROWS - 1)) / ROWS;
  const tileWidth = Math.max(44, Math.floor(tileWidthFromColumns));
  const tileHeight = Math.max(44, Math.floor(Math.min(tileHeightFromRows, isWordAssessment ? 64 : tileWidthFromColumns)));
  const tileSize = Math.min(tileWidth, tileHeight);
  const layout = { COLUMNS, GAP, tileWidth, tileHeight, tileSize };

  const startActive = useCallback(() => setPhase('active'), []);
  // Synchronously stop the timer — used by the grid's last-attempted path to freeze precisely
  // (parity with the original screen's clearInterval) WITHOUT setting hasFinishedRef, which would
  // block the save that finishAndSave performs after the EA confirms the sheet.
  const stopTimer = useCallback(() => clearInterval(timerRef.current), []);

  useEffect(() => {
    if (phase === 'active' && !isPaused) {
      timerRef.current = setInterval(() => {
        elapsedRef.current += 1;
        setTimeRemaining(Math.max(0, ASSESSMENT_DURATION - elapsedRef.current));
        if (elapsedRef.current >= ASSESSMENT_DURATION) {
          clearInterval(timerRef.current);
          onTimerExpireRef.current();
        }
      }, 1000);
    }
    return () => clearInterval(timerRef.current);
  }, [phase, isPaused]);

  useEffect(() => {
    if (phase !== 'active' && phase !== 'finished') return undefined;
    const unsubscribe = navigation.addListener('beforeRemove', (e) => {
      if (allowLeaveRef.current) return;
      e.preventDefault();
      Alert.alert('End Assessment?', 'Are you sure you want to leave? Your progress will be lost.', [
        { text: 'Stay', style: 'cancel' },
        { text: 'Leave', style: 'destructive', onPress: () => { clearInterval(timerRef.current); abandonedRef.current = true; allowLeaveRef.current = true; navigation.dispatch(e.data.action); } },
      ]);
    });
    return unsubscribe;
  }, [navigation, phase]);

  const finishAndSave = useCallback(async ({ letterStates, finalLastIndex, correctionCount }) => {
    if (hasFinishedRef.current) return;
    hasFinishedRef.current = true;
    clearInterval(timerRef.current);
    setPhase('finished');

    const record = buildAssessmentRecord({
      id: uuidv4(), userId: user.id, childId: child.id, assessmentType, letterSet,
      attemptNumber, captureMode, correctionCount,
      elapsedSeconds: elapsedRef.current,
      finalLastIndex, letterStates, now: new Date(),
    });

    const saveThenNavigate = async () => {
      try {
        await assessmentsRepository.saveAssessment(record);
      } catch (error) {
        Alert.alert('Could not save', 'Saving the assessment failed. Please try again.', [
          { text: 'Retry', onPress: () => { saveThenNavigate(); } },
          { text: 'Discard', style: 'destructive', onPress: () => { abandonedRef.current = true; allowLeaveRef.current = true; navigation.goBack(); } },
        ]);
        return;
      }
      if (abandonedRef.current) return;
      allowLeaveRef.current = true;
      navigation.replace('AssessmentResults', { assessment: record, child, letterSet, attemptNumber, assessmentType });
      triggerBackgroundSync?.();
      refreshSyncStatus?.().catch(() => {});
    };
    await saveThenNavigate();
  }, [user, child, assessmentType, letterSet, attemptNumber, captureMode, navigation, triggerBackgroundSync, refreshSyncStatus]);

  return {
    phase, setPhase, timeRemaining, isPaused, setIsPaused, layout,
    hasFinishedRef, startActive, stopTimer, finishAndSave, setOnTimerExpire,
  };
}
