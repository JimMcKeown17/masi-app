import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { v4 as uuid } from 'uuid';
import { batteryFor, bundledItemSetFor, questionComponentFor } from '../../../assessment-questions';
import MaterialsBlock from '../../../components/assessments/MaterialsBlock';
import TestFrame from '../../../components/assessments/TestFrame';
import TestSheet from '../../../components/assessments/TestSheet';
import BrandButton from '../../../components/common/BrandButton';
import InlineNote from '../../../components/common/InlineNote';
import { colors, spacing } from '../../../constants/colors';
import { useAuth } from '../../../context/AuthContext';
import { useOffline } from '../../../context/OfflineContext';
import { useSignedInEA } from '../../../context/SignedInEAContext';
import { useAssessableChildren } from '../../../hooks/useAssessableChildren';
import { useGuardedQuestionSave } from '../../../hooks/useGuardedQuestionSave';
import { getActiveProgrammeGate } from '../../../services/activeProgrammeGate';
import { isStaleActorError } from '../../../session/staleActor';
import { LANGUAGE_LABELS } from '../../../utils/assessmentRegistry';
import { buildRunView, materialsLine, runCode } from '../../../utils/batteryRun';

const FATAL_CODES = ['RUN_NOT_WRITABLE', 'QUESTION_ALREADY_DECIDED'];

export default function BatteryQuestionScreen({ navigation, route }) {
  const { runId, questionCode } = route.params;
  const { handle, repositories } = useSignedInEA();
  const { user } = useAuth();
  const { all, loading: rosterLoading } = useAssessableChildren();
  const [data, setData] = useState(null);
  const ready = data?.handle === handle && data.runId === runId
    && data.questionCode === questionCode && handle.isCurrent();

  useEffect(() => {
    // Resolve access before presenting capture. Once presented, retain the same
    // Question instance; repository run guards handle changes during capture.
    if (ready || rosterLoading) return undefined;
    let current = true;
    const active = () => current && handle.isCurrent();
    void (async () => {
      try {
        const [run, gate] = await Promise.all([
          repositories.batteryRuns.getRunWithResults(runId),
          getActiveProgrammeGate({ handle, userId: user.id }),
        ]);
        if (!active()) return;
        const child = run && all.find(row => row.id === run.child_id);
        let childName = child && [child.first_name, child.last_name].filter(Boolean).join(' ');
        if (run && !childName) {
          const names = await repositories.children.getChildNamesByIds([run.child_id]);
          if (!active()) return;
          childName = names[run.child_id]?.name;
        }
        const battery = run && batteryFor(run.battery_code, run.battery_version);
        const view = battery && buildRunView(battery, run, {
          activeProgrammeId: gate.programme?.id ?? null, childAssigned: Boolean(child),
        });
        const question = battery?.questions.find(row => row.question_code === questionCode);
        if (active()) setData({ handle, runId, questionCode, run, battery, question,
          childName: childName ?? '', firstName: child?.first_name ?? childName?.split(' ')[0] ?? '',
          writable: Boolean(view?.writable && view.next?.question_code === questionCode) });
      } catch (error) {
        if (active() && !isStaleActorError(error)) setData({ handle, runId, questionCode, error: true });
      }
    })();
    return () => { current = false; };
  }, [ready, rosterLoading, handle, repositories, runId, questionCode, user.id, all]);

  if (!ready) return <View style={styles.center}>
    <ActivityIndicator color={colors.primary} size="large" accessibilityLabel="Loading assessment Question" />
  </View>;
  if (data.error) return <View style={styles.message}>
    <InlineNote>Couldn't load this assessment. Try again.</InlineNote>
    <BrandButton label="Try again" onPress={() => setData(null)} />
  </View>;
  return <QuestionHost key={`${runId}:${questionCode}`} data={data} navigation={navigation} />;
}

function QuestionHost({ data, navigation }) {
  const { handle, run, question, battery, childName, firstName, writable } = data;
  const { repositories } = useSignedInEA();
  const { user } = useAuth();
  const { triggerBackgroundSync } = useOffline();
  const [started, setStarted] = useState(false);
  const assessmentId = useRef(null);
  if (assessmentId.current === null) assessmentId.current = uuid();
  const completed = useRef(false);
  const persist = useCallback(async result => {
    await repositories.assessments.saveQuestionResult({
      assessmentId: assessmentId.current, result, childId: run.child_id, userId: user.id,
      batteryRunId: run.id, captureMode: result.derived.capture_mode ?? null,
    });
  }, [repositories, run, user.id]);
  const onSaved = useCallback(() => {
    if (!handle.isCurrent()) return;
    navigation.goBack();
    triggerBackgroundSync();
  }, [handle, navigation, triggerBackgroundSync]);
  const guarded = useGuardedQuestionSave({ navigation, persist, onSaved, fatalCodes: FATAL_CODES });
  const onStart = () => {
    if (completed.current || !handle.isCurrent()) return;
    guarded.onStart();
    setStarted(true);
  };
  const onComplete = result => {
    if (completed.current || !handle.isCurrent()) return;
    completed.current = true;
    // Intro skips need the same pending-result guard and committed release as
    // capture completions, even though the package has not called onStart.
    guarded.onStart();
    guarded.onComplete(result);
  };
  const entry = writable && question && battery.languages.includes(run.language)
    ? questionComponentFor(question.question_code) : null;
  const Question = entry?.Component;
  const itemSet = entry && bundledItemSetFor(question.question_code, question.question_version, run.language);
  const closed = Boolean(guarded.fatalError || !writable || !Question || !itemSet);
  const close = () => navigation.goBack();
  return <TestFrame title={question && `${battery.questions.indexOf(question) + 1} · ${question.title}`}
    subtitle={run && `${childName} · ${LANGUAGE_LABELS[run.language] ?? run.language} · ${runCode(run.id)}`}
    onClose={close}>
    {!closed && <>
      {!started && <MaterialsBlock firstName={firstName} materials={materialsLine(question, run.language, battery)} />}
      <View style={styles.question}>
        <Question {...entry.extraProps} itemSet={itemSet} language={run.language}
          instructions={question.instructions?.[run.language]} durationSec={question.durationSec}
          childName={childName} allowSkip onStart={onStart} onComplete={onComplete} />
      </View>
    </>}
    <TestSheet visible={closed} testID="assessment-closed" title="This assessment is closed"
      message="This answer can't be saved because the assessment is no longer open."
      confirmLabel="Back to assessment" confirmTone="ink" onConfirm={close} onCancel={close} />
    <TestSheet visible={!closed && guarded.saveError && !guarded.leaveSheet.visible} testID="save-error"
      title="Couldn't save — try again" message="Your result is still here. Try saving it again."
      confirmLabel="Try again" confirmTone="ink" onConfirm={guarded.retry}
      cancelLabel="Not now" onCancel={guarded.dismissSaveError} />
    <TestSheet visible={guarded.leaveSheet.visible} testID="leave-confirmation"
      title="Leave without saving?"
      message={guarded.leaveSheet.hasResult
        ? `${firstName ? `${firstName}'s result` : 'This result'} isn't saved yet. If you leave now, it will be lost.`
        : `${firstName ? `${firstName}'s answers` : 'The answers'} on this question won't be saved. Finished questions stay saved.`}
      confirmLabel={guarded.leaveSheet.hasResult ? 'Discard result' : 'Discard answers'}
      confirmTone="danger" cancelLabel={guarded.leaveSheet.hasResult ? 'Keep result' : 'Keep marking'}
      onConfirm={guarded.leaveSheet.onConfirm} onCancel={guarded.leaveSheet.onCancel} />
  </TestFrame>;
}

const styles = StyleSheet.create({
  question: { flex: 1 },
  center: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },
  message: { flex: 1, backgroundColor: colors.background, padding: spacing.md, gap: spacing.md },
});
