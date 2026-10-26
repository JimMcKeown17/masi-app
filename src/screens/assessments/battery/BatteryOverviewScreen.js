import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { v4 as uuid } from 'uuid';
import { batteryFor, MANUAL_SKIP_REASONS, skippedResult } from '../../../assessment-questions';
import BrandButton from '../../../components/common/BrandButton';
import SkipNoticeSheet from '../../../components/assessments/SkipNoticeSheet';
import ConfirmSheet from '../../../components/common/ConfirmSheet';
import InlineNote from '../../../components/common/InlineNote';
import ListGroup from '../../../components/common/ListGroup';
import ListRow from '../../../components/common/ListRow';
import SelectSheet from '../../../components/common/SelectSheet';
import StatusBadge from '../../../components/common/StatusBadge';
import { useHeaderHairline } from '../../../components/common/ScreenHeader';
import { borderRadius, colors, spacing } from '../../../constants/colors';
import { fontFamilies, typeRoles } from '../../../constants/typography';
import { useAuth } from '../../../context/AuthContext';
import { useOffline } from '../../../context/OfflineContext';
import { useSignedInEA } from '../../../context/SignedInEAContext';
import { useToast } from '../../../context/ToastContext';
import { useAssessableChildren } from '../../../hooks/useAssessableChildren';
import { getActiveProgrammeGate } from '../../../services/activeProgrammeGate';
import { isStaleActorError } from '../../../session/staleActor';
import { LANGUAGE_LABELS } from '../../../utils/assessmentRegistry';
import { buildRunView, runCode, skipNoticeFor } from '../../../utils/batteryRun';
import { hasSeenSkipNotice, markSkipNoticeSeen } from '../../../utils/skipNoticeSeen';

const SKIP_OPTIONS = MANUAL_SKIP_REASONS.map(({ reason, label }) => ({ key: reason, label }));
const UNASSIGNED = 'This child is no longer assigned to you — you can abandon this assessment.';
const UNAVAILABLE = "This assessment isn't available in this version of the app.";

function QuestionRow({ row, writable, onStart, onSkip, showDivider, onLayout }) {
  const undecided = row.state === 'next' || row.state === 'not_started';
  const startable = writable && row.state === 'next';
  const trailing = row.state === 'done'
    ? <StatusBadge tone="success" label={row.scoreText ?? 'Done'} />
    : row.state === 'skipped' ? <StatusBadge tone="neutral" label="Skipped" />
      : writable ? <View style={styles.skipSpace} /> : null;
  // Re-measure a newly highlighted row even when its outer bounds did not change.
  return <View key={row.state} testID={`battery-row-${row.question.question_code}`} onLayout={onLayout}>
    <ListRow title={row.question.title} subtitle={row.detail} showDivider={showDivider}
      accessibilityLabel={`${row.number}. ${row.question.title}, ${row.detail}${row.scoreText ? `, ${row.scoreText}` : ''}`}
      disabled={!startable} onPress={() => onStart(row.question.question_code)}
      style={row.state === 'next' ? styles.next : null}
      lead={<View style={[styles.number, row.state === 'done' && styles.numberDone,
        row.state === 'next' && styles.numberNext]}>
        <Text style={[styles.numberText, row.state === 'done' && styles.numberDoneText,
          row.state === 'next' && styles.numberNextText]}>{row.number}</Text>
      </View>}
      trailing={trailing} />
    {writable && undecided && <View style={styles.skipPosition}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Skip ${row.question.title}`}
        onPress={() => onSkip(row.question)} style={styles.skipButton}>
        <Text style={styles.dots}>⋯</Text>
      </Pressable>
    </View>}
  </View>;
}

export default function BatteryOverviewScreen({ navigation, route }) {
  const { runId } = route.params;
  const { handle, repositories } = useSignedInEA();
  const { user } = useAuth();
  const { all, loading: rosterLoading } = useAssessableChildren();
  const rosterRef = useRef({ all, loading: rosterLoading });
  rosterRef.current = { all, loading: rosterLoading };
  const observedRosterLoading = useRef(rosterLoading);
  const { triggerBackgroundSync } = useOffline();
  const { show: showToast } = useToast();
  const insets = useSafeAreaInsets();
  const onScroll = useHeaderHairline(navigation);
  const [data, setData] = useState({ loading: true });
  const [skipQuestion, setSkipQuestion] = useState(null);
  const [abandonVisible, setAbandonVisible] = useState(false);
  const [, refreshSkipNotice] = useState(0);
  const isFocused = useIsFocused();
  const [mutation, setMutation] = useState(null);
  const focused = useRef(false);
  const generation = useRef(0);
  const launching = useRef(false);
  const mutationRef = useRef(null);
  const autoSaving = useRef(null);
  const current = useRef(null);
  const scrollRef = useRef(null);
  const scrollY = useRef(0);
  const revealed = useRef(null);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [listLayout, setListLayout] = useState(null);
  const [rowLayouts, setRowLayouts] = useState({});
  const setScrollRef = useCallback(node => {
    scrollRef.current = node;
    if (!node) {
      // Reveal state and geometry belong to this mounted list, which restarts at the top.
      revealed.current = null;
      scrollY.current = 0;
      setViewportHeight(0);
      setListLayout(null);
      setRowLayouts({});
    }
  }, []);

  const load = useCallback(async () => {
    const ticket = ++generation.current;
    const active = () => focused.current && handle.isCurrent() && generation.current === ticket;
    if (!active()) return;
    // Keep showing the last loaded run while refreshing (e.g. back from a Question); spinner only on first load.
    setData(previous => (previous.handle === handle && previous.run && previous.run.id === runId
      ? { ...previous, refreshing: true } : { handle, loading: true }));
    if (rosterRef.current.loading) return;
    try {
      // A previous focus/load may still be committing auto-skips. Read only after it settles.
      if (autoSaving.current?.handle === handle) await autoSaving.current.promise.catch(() => {});
      if (!active()) return;
      let [run, gate] = await Promise.all([
        repositories.batteryRuns.getRunWithResults(runId),
        getActiveProgrammeGate({ handle, userId: user.id }),
      ]);
      if (!active()) return;
      const battery = run && batteryFor(run.battery_code, run.battery_version);
      const child = run && rosterRef.current.all.find(row => row.id === run.child_id);
      if (battery) {
        const view = buildRunView(battery, run, {
          activeProgrammeId: gate.programme?.id ?? null, childAssigned: Boolean(child),
        });
        if (view.writable && view.autoSkips.length) {
          const batch = { handle, promise: null };
          batch.promise = (async () => {
            for (const skip of view.autoSkips) {
              if (!active()) return;
              const question = battery.questions.find(row => row.question_code === skip.question_code);
              try {
                await repositories.assessments.saveQuestionResult({ assessmentId: uuid(), userId: user.id,
                  childId: run.child_id, batteryRunId: run.id, result: skippedResult(question, run.language, skip.reason) });
              } catch (error) {
                if (error.code === 'QUESTION_ALREADY_DECIDED') continue;
                if (error.code === 'RUN_NOT_WRITABLE') break;
                throw error;
              }
            }
            if (active()) triggerBackgroundSync();
          })();
          autoSaving.current = batch;
          try { await batch.promise; } finally {
            if (autoSaving.current === batch) autoSaving.current = null;
          }
          if (!active()) return;
          [run, gate] = await Promise.all([
            repositories.batteryRuns.getRunWithResults(runId),
            getActiveProgrammeGate({ handle, userId: user.id }),
          ]);
          if (!active()) return;
        }
      }
      let childName = child && [child.first_name, child.last_name].filter(Boolean).join(' ');
      if (run && !childName) {
        const names = await repositories.children.getChildNamesByIds([run.child_id]);
        if (!active()) return;
        childName = names[run.child_id]?.name;
      }
      if (!active()) return;
      if (childName) navigation.setOptions({ title: childName });
      const view = run && battery && buildRunView(battery, run, {
        activeProgrammeId: gate.programme?.id ?? null, childAssigned: Boolean(child),
      });
      if (view?.readOnlyReason === 'closed' || view?.readOnlyReason === 'other_phone') {
        navigation.replace('BatteryRunSummary', { runId });
      }
      setData({ handle, loading: false, run, childFirstName: child?.first_name || childName?.split(' ')[0],
        activeProgrammeId: gate.programme?.id ?? null });
    } catch (error) {
      if (active() && !isStaleActorError(error)) setData({ handle, loading: false, error: true });
    }
  }, [handle, repositories, runId, user.id, navigation, triggerBackgroundSync]);

  useFocusEffect(useCallback(() => {
    focused.current = true;
    launching.current = false;
    // A save can finish while native stack keeps this screen mounted but blurred.
    setMutation(mutationRef.current);
    void load();
    return () => {
      focused.current = false;
      generation.current += 1;
      setSkipQuestion(null);
      setAbandonVisible(false);
    };
  }, [load]));

  // Resume a first load deferred for the roster. Later roster identities update
  // the rendered child and writability without restarting focus or reading the run.
  useEffect(() => {
    const wasLoading = observedRosterLoading.current;
    observedRosterLoading.current = rosterLoading;
    if (wasLoading && !rosterLoading && focused.current) void load();
  }, [rosterLoading, load]);

  const ready = data.handle === handle && !data.loading && !rosterLoading && handle.isCurrent();
  const run = ready ? data.run : null;
  const battery = run && batteryFor(run.battery_code, run.battery_version);
  const child = run && all.find(row => row.id === run.child_id);
  const view = battery && buildRunView(battery, run, {
    activeProgrammeId: data.activeProgrammeId, childAssigned: Boolean(child),
  });
  const notice = view?.writable && run && !hasSeenSkipNotice(run.id)
    ? skipNoticeFor({ battery, view, firstName: data.childFirstName }) : null;
  // Actions wait for a refresh to finish, so a just-finished Question can't be started from stale rows.
  current.current = ready && view && !data.refreshing ? { run, battery, view } : null;
  const mutating = mutation?.handle === handle || Boolean(data.refreshing);
  useEffect(() => {
    if (!ready || data.refreshing || data.error) return;
    setSkipQuestion(question => view?.writable && view.rows.some(row =>
      row.question.question_code === question?.question_code && ['next', 'not_started'].includes(row.state))
      ? question : null);
    // Losing an assignment still allows abandoning; a closed/remote run does not.
    if (!run || ['closed', 'other_phone'].includes(view?.readOnlyReason)) setAbandonVisible(false);
  }, [ready, data.refreshing, data.error, run, view?.writable, view?.readOnlyReason]);

  const canPublish = () => focused.current && handle.isCurrent();
  const nextCode = view?.next?.question_code;
  const writingSheetReminder = Boolean(view?.writable && view.writingSheetReminder);

  useEffect(() => {
    const row = rowLayouts[nextCode];
    if (!ready || !focused.current || !view?.writable || !nextCode || !row?.isNext || !viewportHeight || !listLayout
      || listLayout.writingSheetReminder !== writingSheetReminder) return;
    if (revealed.current?.handle === handle && revealed.current.runId === runId
      && revealed.current.nextCode === nextCode) return;
    revealed.current = { handle, runId, nextCode };
    const top = listLayout.y + row.y;
    const bottom = top + row.height;
    let y;
    if (top < scrollY.current) y = Math.max(0, top - spacing.md);
    else if (bottom > scrollY.current + viewportHeight) y = bottom - viewportHeight + spacing.md;
    if (y !== undefined) scrollRef.current?.scrollTo({ y, animated: true });
  }, [ready, view?.writable, nextCode, rowLayouts, viewportHeight, listLayout,
    writingSheetReminder, handle, runId]);

  const launch = questionCode => {
    const snapshot = current.current;
    if (!canPublish() || launching.current || mutationRef.current?.handle === handle || !snapshot?.view.writable) return;
    if (questionCode !== snapshot.view.next?.question_code) return;
    launching.current = true;
    navigation.navigate('BatteryQuestion', { runId, questionCode });
  };
  const review = () => {
    if (!canPublish() || launching.current || mutationRef.current?.handle === handle
      || !current.current?.view.writable || !current.current.view.eligibleToFinalize) return;
    launching.current = true;
    navigation.navigate('BatteryRunSummary', { runId });
  };
  const beginMutation = () => {
    if (!canPublish() || launching.current || mutationRef.current?.handle === handle) return null;
    const token = { handle };
    mutationRef.current = token;
    setMutation(token);
    return token;
  };
  const endMutation = token => {
    if (mutationRef.current !== token) return;
    mutationRef.current = null;
    if (canPublish()) setMutation(null);
  };
  const saveSkip = async reason => {
    const snapshot = current.current;
    if (!snapshot?.view.writable || !skipQuestion) return;
    const row = snapshot.view.rows.find(item => item.question.question_code === skipQuestion.question_code);
    if (!row || (row.state !== 'next' && row.state !== 'not_started')) return;
    const token = beginMutation();
    if (!token) return;
    try {
      await repositories.assessments.saveQuestionResult({ assessmentId: uuid(), userId: user.id,
        childId: snapshot.run.child_id, batteryRunId: runId,
        result: skippedResult(skipQuestion, snapshot.run.language, reason) });
      if (canPublish()) triggerBackgroundSync();
    } catch (error) {
      if (canPublish() && !isStaleActorError(error)
        && !['QUESTION_ALREADY_DECIDED', 'RUN_NOT_WRITABLE'].includes(error.code)) {
        showToast({ tone: 'error', message: "Couldn't skip this Question. Try again." });
      }
    } finally {
      if (canPublish()) await load();
      endMutation(token);
    }
  };
  const abandon = async () => {
    const snapshot = current.current;
    if (!snapshot || ['closed', 'other_phone'].includes(snapshot.view.readOnlyReason)) return;
    const token = beginMutation();
    if (!token) return;
    try {
      await repositories.batteryRuns.abandonRun(runId);
      if (!canPublish()) return;
      setAbandonVisible(false);
      triggerBackgroundSync();
      navigation.goBack();
    } catch (error) {
      if (canPublish() && !isStaleActorError(error)) {
        showToast({ tone: 'error', message: "Couldn't abandon this assessment. Try again." });
      }
    } finally { endMutation(token); }
  };

  if (!ready || (view && ['closed', 'other_phone'].includes(view.readOnlyReason))) {
    return <View style={styles.center}><ActivityIndicator color={colors.primary} size="large" accessibilityLabel="Loading assessment" /></View>;
  }
  if (data.error || !run) return <View style={styles.message}>
    <InlineNote>{data.error ? "Couldn't load this assessment. Try again." : 'This assessment is no longer available.'}</InlineNote>
    {data.error && <BrandButton label="Try again" onPress={load} />}
  </View>;
  if (!battery) return <View style={styles.message}>
    <StatusBadge label={runCode(run.id)} />
    <InlineNote tone="warning">{UNAVAILABLE}</InlineNote>
  </View>;

  return <View style={styles.page}>
    <ScrollView ref={setScrollRef} testID="battery-overview-scroll" style={styles.scroll}
      contentContainerStyle={styles.content} onLayout={event => setViewportHeight(event.nativeEvent.layout.height)}
      onScroll={event => { scrollY.current = event.nativeEvent.contentOffset.y; onScroll(event); }} scrollEventThrottle={16}>
      <View style={styles.headerLine}>
        <Text style={styles.meta}>{battery.title} · {LANGUAGE_LABELS[run.language] ?? run.language} · {view.decidedCount} of {view.totalCount} decided</Text>
        <StatusBadge label={view.code} />
      </View>
      {view.readOnlyReason === 'unassigned' && <InlineNote tone="warning">{UNASSIGNED}</InlineNote>}
      {view.writable && view.writingSheetReminder && <InlineNote tone="warning">
        {`Next is ${view.next.title}. Write assessment code `}<Text style={styles.runCode}>{view.code}</Text>{` and ${child.first_name}'s name on the Writing Sheet before you hand it over.`}
      </InlineNote>}
      <View testID="battery-question-list" onLayout={event => setListLayout({
        y: event.nativeEvent.layout.y, writingSheetReminder,
      })}>
        <ListGroup>{view.rows.map(row => <QuestionRow key={row.question.question_code} row={row}
          onLayout={event => {
            const { y, height } = event.nativeEvent.layout;
            setRowLayouts(previous => ({ ...previous, [row.question.question_code]: { y, height, isNext: row.state === 'next' } }));
          }}
          writable={view.writable && !mutating} onStart={launch}
          onSkip={question => { if (!launching.current) setSkipQuestion(question); }} />)}</ListGroup>
      </View>
    </ScrollView>
    <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
      {view.writable && (view.eligibleToFinalize
        ? <BrandButton label="Review and finalize" size="lg" onPress={review} disabled={mutating} />
        : view.next && <BrandButton label={`Start ${view.next.title}`} size="lg"
          onPress={() => launch(view.next.question_code)} disabled={mutating} />)}
      <BrandButton label="Abandon assessment" variant="tertiary" tone="ink" size="lg"
        disabled={mutating} onPress={() => { if (!launching.current) setAbandonVisible(true); }} />
    </View>
    <SkipNoticeSheet visible={Boolean(isFocused && !data.refreshing && notice)}
      title={notice?.title} body={notice?.body}
      stillToDo={notice?.stillToDo ?? []} skipped={notice?.skipped ?? []}
      onDismiss={() => {
        markSkipNoticeSeen(run.id);
        refreshSkipNotice(value => value + 1);
      }} />
    <SelectSheet key={skipQuestion?.question_code ?? 'closed'} visible={Boolean(skipQuestion)}
      title={`Skip ${skipQuestion?.title ?? ''}?`}
      subtitle="It is saved as skipped with your reason. You can't undo a skip in this assessment."
      options={SKIP_OPTIONS} selectedKey={null} onSelect={saveSkip}
      confirmLabel="Skip Question" cancelLabel="Cancel" onDismiss={() => setSkipQuestion(null)} />
    <ConfirmSheet visible={abandonVisible} title="Abandon this assessment?"
      body={view.decidedCount === 0 ? "Nothing was saved in this assessment yet. You can't continue it."
        : `The ${view.decidedCount} saved ${view.decidedCount === 1 ? 'Question stays' : 'Questions stay'} in ${child?.first_name || data.childFirstName || 'this child'}'s history. You can't continue this assessment.`}
      confirmLabel="Abandon" cancelLabel="Keep going" onConfirm={abandon} onCancel={() => setAbandonVisible(false)} />
  </View>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },
  message: { flex: 1, backgroundColor: colors.background, padding: spacing.md, gap: spacing.md },
  scroll: { flex: 1 },
  content: { padding: spacing.md, gap: spacing.ms },
  headerLine: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  meta: { ...typeRoles.textCaption, color: colors.textSecondary, flexGrow: 1, flexShrink: 1 },
  runCode: { fontFamily: fontFamilies.textBold },
  next: { backgroundColor: colors.red50 },
  number: { width: 32, minHeight: 32, borderRadius: borderRadius.pill, backgroundColor: colors.background,
    alignItems: 'center', justifyContent: 'center' },
  numberText: { ...typeRoles.textData, color: colors.textSecondary },
  numberDone: { backgroundColor: colors.successBg },
  numberDoneText: { color: colors.successText },
  numberNext: { backgroundColor: colors.primary },
  numberNextText: { color: colors.onDark },
  skipSpace: { width: 44 },
  skipPosition: { position: 'absolute', top: 0, bottom: 0, right: spacing.sm, justifyContent: 'center' },
  skipButton: { width: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  dots: { ...typeRoles.displayHeading, color: colors.text },
  footer: { backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border,
    padding: spacing.md, gap: spacing.xs },
});
