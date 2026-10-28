import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { batteryFor, batteryForNewRun } from '../../../assessment-questions';
import BrandButton from '../../../components/common/BrandButton';
import InlineNote from '../../../components/common/InlineNote';
import ListGroup from '../../../components/common/ListGroup';
import ListRow from '../../../components/common/ListRow';
import StatusBadge from '../../../components/common/StatusBadge';
import { useHeaderHairline } from '../../../components/common/ScreenHeader';
import { colors, spacing } from '../../../constants/colors';
import { typeRoles } from '../../../constants/typography';
import { useAuth } from '../../../context/AuthContext';
import { useSignedInEA } from '../../../context/SignedInEAContext';
import { useAssessableChildren } from '../../../hooks/useAssessableChildren';
import { getActiveProgrammeGate } from '../../../services/activeProgrammeGate';
import { isStaleActorError } from '../../../session/staleActor';
import { LANGUAGE_LABELS } from '../../../utils/assessmentRegistry';
import { buildRunView, runCode } from '../../../utils/batteryRun';

export default function BatteryRunSummaryScreen({ navigation, route }) {
  const { runId } = route.params;
  const { handle, repositories } = useSignedInEA();
  const { user } = useAuth();
  const { all, loading: rosterLoading } = useAssessableChildren();
  const rosterRef = useRef({ all, loading: rosterLoading });
  rosterRef.current = { all, loading: rosterLoading };
  const observedRosterLoading = useRef(rosterLoading);
  const onScroll = useHeaderHairline(navigation);
  const insets = useSafeAreaInsets();
  const [data, setData] = useState({ loading: true });
  const [expanded, setExpanded] = useState(false);
  const focused = useRef(false);
  const generation = useRef(0);
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
  // Keep the last accepted child visible while the roster reloads.
  const child = run && (rosterLoading ? data.child : all.find(row => row.id === run.child_id));
  const childName = [child?.first_name, child?.last_name].filter(Boolean).join(' ') || data.childName;
  const view = battery && buildRunView(battery, run, {
    activeProgrammeId: data.activeProgrammeId, childAssigned: Boolean(child),
  });
  useEffect(() => {
    navigation.setOptions({ title: 'Assessment summary' });
  }, [navigation]);
  const status = run?.status === 'completed' ? { label: 'Finalized', tone: 'success' }
    : run?.status === 'abandoned' ? { label: 'Abandoned', tone: 'neutral' } : { label: 'Open', tone: 'warning' };

  const finalized = route.params.finalized === true && run?.status === 'completed';
  const nextBattery = finalized && batteryForNewRun(run.battery_code, run.battery_version);
  const footer = finalized && <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
    {nextBattery && <BrandButton label="Assess next child" size="lg" onPress={() => navigation.replace('AssessmentChildSelect', {
      batteryCode: run.battery_code, batteryVersion: run.battery_version,
    })} />}
    <BrandButton label="Back to Assess" variant="tertiary" tone="ink" size="lg"
      onPress={() => navigation.popTo('MainTabs', { screen: 'Assessments' })} />
  </View>;

  if (!ready) return <View style={styles.center}>
    <ActivityIndicator size="large" color={colors.primary} accessibilityLabel="Loading assessment" />
  </View>;
  if (data.error || !run) return <View style={styles.message}>
    <InlineNote>{data.error ? "Couldn't load this assessment. Try again." : 'This assessment is no longer available.'}</InlineNote>
    {data.error && <BrandButton label="Try again" onPress={load} />}
  </View>;
  if (!battery) return <View style={styles.page}>
    <View style={styles.message}>
      <Text style={styles.name}>{childName}</Text>
      <StatusBadge label={runCode(run.id)} />
      <StatusBadge {...status} />
      <InlineNote tone="warning">This assessment isn't available in this version of the app.</InlineNote>
    </View>
    {footer}
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
          accessibilityLabel={`${row.number}. ${row.question.title}, ${row.state === 'skipped' ? 'Skipped, ' : ''}${row.detail}${row.scoreText ? `, ${row.scoreText}` : ''}`}
          accessibilityRole="text" disabled lead={<Text style={styles.number}>{row.number}</Text>}
          trailing={row.state === 'done' ? <StatusBadge tone="success" label={row.scoreText ?? 'Done'} />
            : row.state === 'skipped' ? <StatusBadge tone="neutral" label="Skipped" /> : null} />
      ))}</ListGroup>
      {!expanded && view.rows.length > 4 && <BrandButton variant="tertiary" size="sm"
        label={`Show all ${view.totalCount}`} onPress={() => setExpanded(true)} />}
    </ScrollView>
    {footer}
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
  number: { ...typeRoles.textData, color: colors.textSecondary },
  footer: { backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border,
    padding: spacing.md, gap: spacing.xs },
});
