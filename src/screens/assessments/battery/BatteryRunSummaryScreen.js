import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CommonActions, useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { batteryFor } from '../../../assessment-questions';
import ChecklistRow from '../../../components/assessments/ChecklistRow';
import BrandButton from '../../../components/common/BrandButton';
import InlineNote from '../../../components/common/InlineNote';
import ListGroup from '../../../components/common/ListGroup';
import ListRow from '../../../components/common/ListRow';
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
import { buildRunView, runCode } from '../../../utils/batteryRun';

export default function BatteryRunSummaryScreen({ navigation, route }) {
  const { runId } = route.params;
  const { handle, repositories } = useSignedInEA();
  const { user } = useAuth();
  const { triggerBackgroundSync } = useOffline();
  const { show: showToast } = useToast();
  const { all, loading: rosterLoading } = useAssessableChildren();
  const rosterRef = useRef({ all, loading: rosterLoading });
  rosterRef.current = { all, loading: rosterLoading };
  const observedRosterLoading = useRef(rosterLoading);
  const onScroll = useHeaderHairline(navigation);
  const insets = useSafeAreaInsets();
  const [data, setData] = useState({ loading: true });
  const [expanded, setExpanded] = useState(false);
  const [confirmation, setConfirmation] = useState(null);
  const [operation, setOperation] = useState(null);
  const focused = useRef(false);
  const generation = useRef(0);
  const inFlight = useRef(null);
  const finalizedHere = useRef(null);
  const current = useRef(null);
  const owner = useRef(null);
  owner.current = { handle, runId };
  const canPublish = () => focused.current && handle.isCurrent()
    && owner.current.handle === handle && owner.current.runId === runId;

  const load = useCallback(async () => {
    const ticket = ++generation.current;
    const active = () => focused.current && handle.isCurrent() && generation.current === ticket;
    if (!active()) return;
    // Preserve the summary during refresh; first load alone owns the spinner.
    setData(previous => previous.handle === handle && previous.run?.id === runId
      ? { ...previous, refreshing: true } : { handle, runId, loading: true });
    if (rosterRef.current.loading) return;
    try {
      const [run, gate] = await Promise.all([
        repositories.batteryRuns.getRunWithResults(runId),
        getActiveProgrammeGate({ handle, userId: user.id }),
      ]);
      if (!active()) return;
      const child = run && rosterRef.current.all.find(row => row.id === run.child_id);
      let childName = child && [child.first_name, child.last_name].filter(Boolean).join(' ');
      if (run && !childName) {
        const names = await repositories.children.getChildNamesByIds([run.child_id]);
        if (!active()) return;
        childName = names[run.child_id]?.name;
      }
      if (active()) setData({ handle, runId, loading: false, run, child, childName: childName ?? '',
        activeProgrammeId: gate.programme?.id ?? null });
    } catch (error) {
      if (active() && !isStaleActorError(error)) setData({ handle, runId, loading: false, error: true });
    }
  }, [handle, repositories, runId, user.id]);

  useFocusEffect(useCallback(() => {
    focused.current = true;
    // Native stack can retain this screen while a finalize settles off screen.
    setOperation(inFlight.current);
    void load();
    return () => { focused.current = false; generation.current += 1; };
  }, [load]));

  // A first read deferred for the roster must resume when it settles. Later
  // roster identities update the rendered child without restarting focus/load.
  useEffect(() => {
    const wasLoading = observedRosterLoading.current;
    observedRosterLoading.current = rosterLoading;
    if (wasLoading && !rosterLoading && focused.current) void load();
  }, [rosterLoading, load]);

  const ready = data.handle === handle && data.runId === runId && !data.loading && handle.isCurrent();
  const run = ready ? data.run : null;
  const battery = run && batteryFor(run.battery_code, run.battery_version);
  // While the roster reloads, render its last accepted child without authorizing writes.
  const child = run && (rosterLoading ? data.child : all.find(row => row.id === run.child_id));
  const childName = [child?.first_name, child?.last_name].filter(Boolean).join(' ') || data.childName;
  const view = battery && buildRunView(battery, run, {
    activeProgrammeId: data.activeProgrammeId, childAssigned: Boolean(child),
  });
  const canFinalize = Boolean(view?.writable && view.eligibleToFinalize);
  useEffect(() => {
    if (ready && run) navigation.setOptions({ title: canFinalize ? 'Review assessment' : 'Assessment summary' });
  }, [ready, run, canFinalize, navigation]);
  const checked = confirmation?.handle === handle && confirmation.runId === runId;
  const refreshing = Boolean(data.refreshing || rosterLoading);
  const busy = refreshing || (operation?.handle === handle && operation.runId === runId);
  current.current = ready && view && !refreshing ? { run, battery, view, checked } : null;
  const hasOperation = () => inFlight.current?.handle === handle && inFlight.current.runId === runId;
  const toggle = () => {
    const snapshot = current.current;
    if (!canPublish() || hasOperation() || !snapshot?.view.writable || !snapshot.view.eligibleToFinalize) return;
    setConfirmation(previous => previous?.handle === handle && previous.runId === runId ? null : { handle, runId });
  };
  const finalize = async () => {
    const snapshot = current.current;
    if (!canPublish() || hasOperation() || !snapshot?.view.writable || !snapshot.view.eligibleToFinalize
      || (snapshot.view.hasWritingSheet && !snapshot.checked)) return;
    const token = { handle, runId };
    inFlight.current = token;
    setOperation(token);
    try {
      await repositories.batteryRuns.finalizeRun(runId, {
        questionCodes: snapshot.battery.questions.map(question => question.question_code),
      });
      // A committed write still needs sync when this screen has blurred.
      if (handle.isCurrent()) {
        finalizedHere.current = { handle, runId };
        triggerBackgroundSync();
      }
      if (!canPublish()) return;
      await load();
    } catch (error) {
      if (!canPublish() || isStaleActorError(error)) return;
      if (error.code === 'RUN_INCOMPLETE') {
        navigation.goBack();
        return;
      }
      showToast({ tone: 'error', message: "Couldn't finalize this assessment. Try again." });
      await load();
    } finally {
      if (inFlight.current === token) {
        inFlight.current = null;
        if (canPublish()) setOperation(null);
      }
    }
  };
  const status = run?.status === 'completed' ? { label: 'Finalized', tone: 'success' }
    : run?.status === 'abandoned' ? { label: 'Abandoned', tone: 'neutral' } : { label: 'Open', tone: 'warning' };

  useEffect(() => {
    if (!ready || data.refreshing || run?.status !== 'completed' || !focused.current || !handle.isCurrent()
      || finalizedHere.current?.handle !== handle || finalizedHere.current.runId !== runId) return;
    // Wait for the read-only summary to commit, including after a failed read's
    // retry. Back must not refocus a closed overview that replaces itself here.
    finalizedHere.current = null;
    navigation.dispatch(state => {
      const filtered = state.routes.filter((candidate, index) => index >= state.index
        || candidate.name !== 'BatteryOverview' || candidate.params?.runId !== runId);
      return CommonActions.reset({ ...state, routes: filtered, index: filtered.length - 1 });
    });
  }, [ready, data.refreshing, run, handle, runId, navigation]);

  if (!ready) return <View style={styles.center}>
    <ActivityIndicator size="large" color={colors.primary} accessibilityLabel="Loading assessment" />
  </View>;
  if (data.error || !run) return <View style={styles.message}>
    <InlineNote>{data.error ? "Couldn't load this assessment. Try again." : 'This assessment is no longer available.'}</InlineNote>
    {data.error && <BrandButton label="Try again" onPress={load} />}
  </View>;
  if (!battery) return <View style={styles.message}>
    <Text style={styles.name}>{childName}</Text>
    <StatusBadge label={runCode(run.id)} />
    <StatusBadge {...status} />
    <InlineNote tone="warning">This assessment isn't available in this version of the app.</InlineNote>
  </View>;

  return <View style={styles.page}>
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content} onScroll={onScroll} scrollEventThrottle={16}>
      <View style={styles.identity}>
        <Text style={[styles.name, styles.identityName]}>{childName}</Text>
        <StatusBadge label={runCode(run.id)} />
      </View>
      <Text style={styles.meta}>{battery.title} · {LANGUAGE_LABELS[run.language] ?? run.language} · {view.decidedCount} of {view.totalCount} decided</Text>
      <StatusBadge {...status} />
      {view.readOnlyReason === 'other_phone' && <InlineNote tone="warning">Started on another phone</InlineNote>}
      {view.readOnlyReason === 'unassigned' && <InlineNote tone="warning">
        This child is no longer assigned to you — you can abandon this assessment.
      </InlineNote>}
      <ListGroup>{(expanded ? view.rows : view.rows.slice(0, 4)).map(row => (
        <ListRow key={row.question.question_code} title={row.question.title} subtitle={row.detail}
          accessibilityLabel={`${row.number}. ${row.question.title}, ${row.detail}${row.scoreText ? `, ${row.scoreText}` : ''}`}
          accessibilityRole="text" disabled lead={<Text style={styles.number}>{row.number}</Text>}
          trailing={row.state === 'done' ? <StatusBadge tone="success" label={row.scoreText ?? 'Done'} />
            : row.state === 'skipped' ? <StatusBadge tone="neutral" label="Skipped" /> : null} />
      ))}</ListGroup>
      {!expanded && view.rows.length > 4 && <BrandButton variant="tertiary" size="sm"
        label={`Show all ${view.totalCount}`} onPress={() => setExpanded(true)} />}
      {canFinalize && view.hasWritingSheet && <>
        <Text style={styles.section}>Before you finish</Text>
        <View style={styles.checklist}>
          <ChecklistRow label={`Write assessment code ${runCode(run.id)} and ${child.first_name}'s name on the Writing Sheet`}
            checked={checked} onToggle={busy ? undefined : toggle}>
            Write assessment code <Text style={styles.runCode}>{runCode(run.id)}</Text>{` and ${child.first_name}'s name on the Writing Sheet`}
          </ChecklistRow>
        </View>
      </>}
    </ScrollView>
    {canFinalize && <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
      <BrandButton label="Finalize assessment" size="lg" onPress={finalize}
        disabled={busy || (view.hasWritingSheet && !checked)} />
      {view.hasWritingSheet && !checked && <Text style={styles.caption}>Tick the box to finalize</Text>}
    </View>}
  </View>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  scroll: { flex: 1 },
  center: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },
  message: { flex: 1, backgroundColor: colors.background, padding: spacing.md, gap: spacing.md },
  content: { padding: spacing.md, gap: spacing.ms },
  identity: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  name: { ...typeRoles.textRowTitle, color: colors.text },
  identityName: { flexGrow: 1, flexShrink: 1 },
  meta: { ...typeRoles.textCaption, color: colors.textSecondary },
  runCode: { fontFamily: fontFamilies.textBold },
  number: { ...typeRoles.textData, color: colors.textSecondary },
  section: { ...typeRoles.textSectionLabel, color: colors.textSecondary },
  checklist: { backgroundColor: colors.surface, borderRadius: borderRadius.lg, paddingHorizontal: spacing.md },
  footer: { backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border,
    padding: spacing.md, gap: spacing.sm },
  caption: { ...typeRoles.textCaption, color: colors.textSecondary, textAlign: 'center' },
});
