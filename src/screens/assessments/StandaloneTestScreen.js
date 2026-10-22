import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { usePreventRemove } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { v4 as uuid } from 'uuid';
import { CURRENT_ITEM_SETS, LetterSoundsQuestion, ReadWordsQuestion } from '../../assessment-questions';
import { MissingItemSet } from '../../assessment-questions/progress/MissingItemSet';
import BottomSheet from '../../components/common/BottomSheet';
import BrandButton from '../../components/common/BrandButton';
import ConfirmSheet from '../../components/common/ConfirmSheet';
import IconCircleButton from '../../components/common/IconCircleButton';
import { colors, spacing } from '../../constants/colors';
import { typeRoles } from '../../constants/typography';
import { useAuth } from '../../context/AuthContext';
import { useOffline } from '../../context/OfflineContext';
import { useSignedInEA } from '../../context/SignedInEAContext';
import { LANGUAGE_LABELS, STANDALONE_TESTS } from '../../utils/assessmentRegistry';

const COMPONENTS = { LetterSoundsQuestion, ReadWordsQuestion };

export default function StandaloneTestScreen({ navigation, route }) {
  const { testCode, child, languageCode } = route.params;
  const { repositories } = useSignedInEA();
  const { user } = useAuth();
  const { triggerBackgroundSync } = useOffline();
  const insets = useSafeAreaInsets();
  const definition = STANDALONE_TESTS.find(test => test.code === testCode);
  const Question = definition && COMPONENTS[definition.component];
  const itemSet = CURRENT_ITEM_SETS[testCode]?.[languageCode];
  const assessmentId = useRef(null);
  if (assessmentId.current === null) assessmentId.current = uuid();

  const allowLeave = useRef(false);
  const inFlight = useRef(false);
  const saved = useRef(false);
  const discarded = useRef(false);
  const mounted = useRef(true);
  const capturedResult = useRef(null);
  const pendingNavigation = useRef(null);
  const [preventLeave, setPreventLeave] = useState(false);
  const [result, setResult] = useState(null);
  const [saveError, setSaveError] = useState(false);
  const [leaveAction, setLeaveAction] = useState(null);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  usePreventRemove(preventLeave, ({ data }) => {
    if (allowLeave.current) return;
    setSaveError(false);
    setLeaveAction(data.action);
  });

  // Native-stack dismissal must also be released before dispatching a replacement.
  // Keep this effect after usePreventRemove so its committed state releases first.
  useEffect(() => {
    if (preventLeave || !pendingNavigation.current) return;
    const next = pendingNavigation.current;
    pendingNavigation.current = null;
    if (next.kind === 'discard') {
      navigation.dispatch(next.action);
      return;
    }
    navigation.replace('AssessmentResults', {
      assessmentId: assessmentId.current, testCode, child, languageCode,
    });
    triggerBackgroundSync();
  }, [preventLeave, navigation, testCode, child, languageCode, triggerBackgroundSync]);

  const save = useCallback(async nextResult => {
    if (inFlight.current || saved.current || discarded.current) return;
    inFlight.current = true;
    setSaveError(false);
    try {
      await repositories.assessments.saveQuestionResult({
        assessmentId: assessmentId.current, result: nextResult,
        childId: child.id, userId: user.id, captureMode: 'sequential',
      });
    } catch {
      if (mounted.current && !discarded.current) setSaveError(true);
      return;
    } finally {
      inFlight.current = false;
    }
    saved.current = true;
    allowLeave.current = true;
    if (!mounted.current || discarded.current) return;
    setLeaveAction(null);
    pendingNavigation.current = { kind: 'saved' };
    setPreventLeave(false);
  }, [repositories, child.id, user.id]);

  const onComplete = useCallback(nextResult => {
    // Capture once, before React commits: queued completions cannot replace this result.
    if (capturedResult.current || allowLeave.current) return;
    capturedResult.current = nextResult;
    setResult(nextResult);
    void save(nextResult);
  }, [save]);

  const onStart = useCallback(() => {
    setPreventLeave(true);
  }, []);

  const discard = () => {
    discarded.current = true;
    allowLeave.current = true;
    pendingNavigation.current = { kind: 'discard', action: leaveAction };
    setLeaveAction(null);
    setPreventLeave(false);
  };
  const keepTesting = () => {
    setLeaveAction(null);
    if (capturedResult.current && !inFlight.current) setSaveError(true);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <IconCircleButton icon="close" accessibilityLabel="Close test" onPress={() => navigation.goBack()} />
        <View style={styles.headerCopy}>
          <Text style={styles.title}>{definition?.title}</Text>
          <Text style={styles.subtitle}>
            {[child.first_name, child.last_name].filter(Boolean).join(' ')} · {LANGUAGE_LABELS[languageCode] ?? languageCode}
          </Text>
        </View>
      </View>
      <View style={styles.question}>
        {Question && itemSet ? (
          <Question
            itemSet={itemSet}
            durationSec={definition.durationSec}
            instructions={definition.instructions}
            language={languageCode}
            childName={[child.first_name, child.last_name].filter(Boolean).join(' ')}
            allowSkip={false}
            captureMode="sequential"
            onStart={onStart}
            onComplete={onComplete}
          />
        ) : <MissingItemSet language={languageCode} />}
      </View>
      <BottomSheet
        visible={saveError && leaveAction === null}
        title="Couldn't save — try again"
        dismissLabel="Dismiss save error"
        onDismiss={() => setSaveError(false)}
        footer={<BrandButton label="Try again" size="lg" onPress={() => save(result)} />}
      >
        <Text style={styles.message}>Your result is still here. Try saving it again.</Text>
      </BottomSheet>
      <ConfirmSheet
        visible={leaveAction !== null}
        title={result ? "This result isn't saved yet." : 'End the test?'}
        body={result ? 'Discard this result and leave the test?' : 'Leave without saving a result?'}
        confirmLabel="Discard"
        cancelLabel={result ? 'Keep result' : 'Keep testing'}
        onConfirm={discard}
        onCancel={keepTesting}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm, gap: spacing.ms },
  headerCopy: { flex: 1 },
  title: { ...typeRoles.displayHeading, color: colors.text },
  subtitle: { ...typeRoles.textCaption, color: colors.textSecondary },
  question: { flex: 1 },
  message: { ...typeRoles.textParagraph, color: colors.textSecondary },
});
