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
import { now as monotonicNow } from '../utils/monotonicClock';

const DURATION_MS = ASSESSMENT_DURATION * 1000;

export function useAssessmentSession({
  navigation, child, letterSet, attemptNumber = 1, assessmentType, captureMode, isWordAssessment,
}) {
  const { user } = useAuth();
  const { triggerBackgroundSync, refreshSyncStatus } = useOffline();

  const [phase, setPhase] = useState('instructions');
  // Transitional display state; removed in the render-isolation cleanup task.
  const [timeRemaining, setTimeRemaining] = useState(ASSESSMENT_DURATION);
  const [isPaused, setIsPaused] = useState(false);

  const timerRef = useRef(null);
  const hasFinishedRef = useRef(false);
  const allowLeaveRef = useRef(false);
  const abandonedRef = useRef(false);

  // Monotonic timekeeping: monotonicNow()-delta accounting means no tick-counting and no drift.
  const runningRef = useRef(false);    // intent: clock should accrue (between startActive and stop/finish)
  const startedAtRef = useRef(null);   // monotonicNow() of the current accruing segment; null while paused/frozen/stopped
  const accumulatedMsRef = useRef(0);  // ms banked from earlier segments (before pauses/freezes)

  const onTimerExpireRef = useRef(() => {});
  const setOnTimerExpire = useCallback((fn) => { onTimerExpireRef.current = fn; }, []);

  const getElapsedMs = useCallback(() => {
    const running = startedAtRef.current != null;
    const raw = accumulatedMsRef.current + (running ? monotonicNow() - startedAtRef.current : 0);
    return Math.min(DURATION_MS, Math.max(0, raw));
  }, []);

  const isExpired = useCallback(() => getElapsedMs() >= DURATION_MS, [getElapsedMs]);

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

  const startActive = useCallback(() => {
    accumulatedMsRef.current = 0;
    startedAtRef.current = monotonicNow();
    runningRef.current = true;
    setPhase('active');
  }, []);

  // Freeze the clock precisely (parity with the original clearInterval) WITHOUT setting
  // hasFinishedRef, so a later finishAndSave can still save. Banks elapsed, stops accrual.
  const stopTimer = useCallback(() => {
    if (startedAtRef.current != null) {
      accumulatedMsRef.current += monotonicNow() - startedAtRef.current;
      startedAtRef.current = null;
    }
    runningRef.current = false;
    clearInterval(timerRef.current);
  }, []);

  // Display + expiry watchdog. Display is derived from the monotonic clock (drift-free);
  // the watchdog fires onTimerExpire authoritatively.
  useEffect(() => {
    if (phase === 'active' && !isPaused) {
      timerRef.current = setInterval(() => {
        setTimeRemaining(Math.max(0, ASSESSMENT_DURATION - Math.floor(getElapsedMs() / 1000)));
        if (isExpired()) {
          clearInterval(timerRef.current);
          onTimerExpireRef.current();
        }
      }, 1000);
    }
    return () => clearInterval(timerRef.current);
  }, [phase, isPaused, getElapsedMs, isExpired]);

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
    const elapsedSeconds = Math.min(ASSESSMENT_DURATION, Math.round(getElapsedMs() / 1000));
    stopTimer();
    setPhase('finished');

    const record = buildAssessmentRecord({
      id: uuidv4(), userId: user.id, childId: child.id, assessmentType, letterSet,
      attemptNumber, captureMode, correctionCount,
      elapsedSeconds,
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
  }, [user, child, assessmentType, letterSet, attemptNumber, captureMode, navigation, triggerBackgroundSync, refreshSyncStatus, getElapsedMs, stopTimer]);

  return {
    phase, setPhase, timeRemaining, isPaused, setIsPaused, layout,
    hasFinishedRef, startActive, stopTimer, finishAndSave, setOnTimerExpire,
    getElapsedMs, isExpired,
  };
}
