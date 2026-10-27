import { useAssessmentHistoryStatus } from '../../services/assessmentHistoryStatus';
import { useSignedInEA } from '../../context/SignedInEAContext';
import React, { useState, useCallback, useRef } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Text, ActivityIndicator } from 'react-native-paper';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { colors, spacing } from '../../constants/colors';
import { useAssessableChildren } from '../../hooks/useAssessableChildren';

import InlineNote from '../../components/common/InlineNote';
import Avatar from '../../components/common/Avatar';
import { formatRunStart, runCode } from '../../utils/batteryRun';
import { useScrollBottomPadding } from '../../hooks/useScrollBottomPadding';
import { getAssessmentsTabStats } from '../../utils/dashboardStats';
import StatBar from '../../components/dashboard/StatBar';
import { getActiveProgrammeGate } from '../../services/activeProgrammeGate';
import NoActiveProgrammeNotice from '../../components/common/NoActiveProgrammeNotice';
import { batteryFor, batteryForNewRun, FULL_EGRA_2026_1 } from '../../assessment-questions';
import SurfaceCard from '../../components/common/SurfaceCard';
import SectionHeader from '../../components/common/SectionHeader';
import ListGroup from '../../components/common/ListGroup';
import ListRow from '../../components/common/ListRow';
import BrandButton from '../../components/common/BrandButton';
import { typeRoles } from '../../constants/typography';
import { languageList, STANDALONE_TESTS } from '../../utils/assessmentRegistry';

export default function AssessmentsScreen({ navigation }) {
  const paddingBottom = useScrollBottomPadding();
  const { pageVersion, runVersion } = useAssessmentHistoryStatus();
  const { handle, repositories } = useSignedInEA();
  const { assessments: assessmentsRepository, academicYears: academicYearsRepository, batteryRuns } = repositories;

  const { user } = useAuth();
  const { all: assessableChildren, loading: rosterLoading } = useAssessableChildren();
  const launchingRef = useRef(false);
  const focusedRef = useRef(false);
  const [runsError, setRunsError] = useState(null);
  const [retryCount, setRetryCount] = useState(0);
  const [referenceNames, setReferenceNames] = useState({});
  const [unfinishedRuns, setUnfinishedRuns] = useState([]);
  const [stats, setStats] = useState(null);
  const [gateChecking, setGateChecking] = useState(true);
  const [programmeGate, setProgrammeGate] = useState(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      focusedRef.current = true;
      launchingRef.current = false;
      const canPublish = () => active && handle.isCurrent();
      setGateChecking(true);
      setRunsError(null);
      const load = async () => {
        let gate;
        try {
          gate = await getActiveProgrammeGate({ handle, userId: user.id });
        } catch (error) {
          if (!canPublish()) return;
          console.error('Error resolving active programme gate:', error);
          // Preserve the existing usable quick-assessment fallback on a gate read error.
          gate = { hasActiveProgramme: true, programme: null };
        }
        if (!canPublish()) return;
        setProgrammeGate(gate);
        setGateChecking(false);
        const loadStats = async () => {
          try {
            const [results, academicYears] = await Promise.all([
              assessmentsRepository.getLetterResults({ userId: user.id }),
              academicYearsRepository.getAll(),
            ]);
            if (!canPublish()) return;
            const activeAcademicYear = academicYears.find(year => year.is_active === true || year.is_active === 1) ?? null;
            setStats(getAssessmentsTabStats(assessableChildren, results, activeAcademicYear));
          } catch (error) {
            if (canPublish()) console.error('Error loading assessment stats:', error);
          }
        };
        const loadRuns = async () => {
          if (!gate.hasActiveProgramme) return;
          try {
            const runs = await batteryRuns.getUnfinishedRunsForUser(user.id);
            if (!canPublish()) return;
            const missingIds = [...new Set(runs.filter(run => !assessableChildren.some(child => child.id === run.child_id))
              .map(run => run.child_id))];
            const names = missingIds.length ? await repositories.children.getChildNamesByIds(missingIds) : {};
            if (!canPublish()) return;
            setReferenceNames(names);
            setUnfinishedRuns(runs);
          } catch {
            if (canPublish()) setRunsError("Couldn't load unfinished assessments. Try again.");
          }
        };
        await Promise.all([loadStats(), loadRuns()]);
      };
      void load();
      return () => { active = false; focusedRef.current = false; };
    }, [handle, assessmentsRepository, academicYearsRepository, batteryRuns, repositories.children, assessableChildren, user.id, pageVersion, runVersion, retryCount])
  );

  const navigateToRun = (screen, params) => {
    if (launchingRef.current || !focusedRef.current || gateChecking || !handle.isCurrent()) return;
    launchingRef.current = true;
    navigation.navigate(screen, params);
  };

  // Hold the capture UI until the programme check resolves, so an unassigned EA
  // can't tap through to a failing flow during the first (cold) gate resolve.
  if (programmeGate === null) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  // Gate programme-dependent capture: an unassigned EA sees an actionable
  // empty-state instead of an assessment that fails at save.
  if (!programmeGate.hasActiveProgramme) {
    return (
      <View style={[styles.container, styles.noticeContainer]}>
        <NoActiveProgrammeNotice action="assess children" />
      </View>
    );
  }

  const programme = programmeGate.programme;
  const battery = batteryForNewRun(programme?.default_battery_code, programme?.default_battery_version);
  const languages = battery ? languageList(battery.fixedLanguage ? [battery.fixedLanguage] : battery.languages) : '';
  const egra = FULL_EGRA_2026_1;

  return (
    <ScrollView style={styles.container} contentContainerStyle={[styles.content, { paddingBottom }]}>
      {/* Tab Stats */}
      {stats && (
        <StatBar items={[
          { label: '% Assessed', value: `${stats.percentAssessed}%`, color: stats.percentAssessed >= 75 ? colors.success : colors.primary },
          { label: 'Total', value: stats.totalAssessments },
          { label: 'Avg score', value: stats.avgScore },
        ]} />
      )}

      <Text style={styles.hint}>Assess children and view results.</Text>

      {battery && <SurfaceCard style={styles.card}>
        <Text accessibilityRole="header" style={styles.cardTitle}>{battery.title}</Text>
        <Text style={styles.cardDescription}>
          {`All ${battery.questions.length} Questions · ${languages} · about\u00A0${battery.aboutMinutes}\u00A0min`}
        </Text>
        <BrandButton label="Start an assessment" variant="primary" style={styles.startButton} disabled={gateChecking}
          onPress={() => navigateToRun('AssessmentChildSelect', {
            batteryCode: battery.battery_code, batteryVersion: battery.battery_version,
          })} />
      </SurfaceCard>}
      {!battery && Boolean(programme?.default_battery_code) && <InlineNote>
        Your programme uses a newer assessment. Update the app to start it.
      </InlineNote>}

      <SurfaceCard style={styles.card}>
        <Text accessibilityRole="header" style={styles.cardTitle}>{egra.title}</Text>
        <Text style={styles.cardDescription}>
          {`All ${egra.questions.length} Questions · ${languageList(egra.languages)} · about\u00A0${egra.aboutMinutes}\u00A0min`}
        </Text>
        <BrandButton label="Start an assessment" accessibilityLabel="Start a Full EGRA" variant="primary"
          style={styles.startButton} disabled={gateChecking} onPress={() => navigateToRun('AssessmentChildSelect', {
            batteryCode: egra.battery_code, batteryVersion: egra.battery_version,
          })} />
      </SurfaceCard>

      {runsError && <View style={styles.section}>
        <InlineNote>{runsError}</InlineNote>
        <BrandButton label="Retry" variant="tertiary" onPress={() => setRetryCount(value => value + 1)} />
      </View>}
      {unfinishedRuns.length > 0 && <View style={styles.section}>
        <SectionHeader title="Unfinished assessments" />
        <ListGroup>
          {unfinishedRuns.map(run => {
            const child = assessableChildren.find(row => row.id === run.child_id);
            const childName = child ? [child.first_name, child.last_name].filter(Boolean).join(' ')
              : referenceNames[run.child_id]?.name;
            const unassigned = !rosterLoading && !child;
            const name = childName || (rosterLoading ? 'Loading child…' : 'Child no longer assigned');
            // Name the assessment: an EA can have WelaPLUS and Full EGRA assessments open at once.
            const runBattery = batteryFor(run.battery_code, run.battery_version);
            const total = runBattery?.questions.length;
            const progress = run.question_count === 0 ? 'Not started'
              : total == null ? `${run.question_count} done` : `${run.question_count} of ${total} done`;
            const subtitle = [runBattery?.title, progress, formatRunStart(run.started_at, new Date()), runCode(run.id)]
              .filter(Boolean).join(' · ');
            const parts = name.split(' ').filter(Boolean);
            const initials = childName ? `${parts[0]?.[0] ?? ''}${parts.length > 1 ? parts[parts.length - 1][0] : ''}`.toUpperCase() : '';
            return <ListRow key={run.id} title={name} subtitle={subtitle}
              titleAccessory={unassigned && childName ? <Text style={styles.unassigned}>Child no longer assigned</Text> : undefined}
              accessibilityLabel={[name, unassigned && childName ? 'Child no longer assigned' : null, subtitle].filter(Boolean).join(', ')}
              lead={<Avatar label={initials} />} trailing="chevron" disabled={gateChecking}
              onPress={() => navigateToRun('BatteryOverview', { runId: run.id })} />;
          })}
        </ListGroup>
      </View>}

      <SectionHeader title="Quick assessments" />
      <ListGroup>
        {STANDALONE_TESTS.map(test => (
          <ListRow key={test.code} title={test.title}
            subtitle={test.code === 'letter_sounds' ? '60-second letter sound test' : '60-second word reading test'}
            trailing="chevron" disabled={gateChecking}
            onPress={() => navigation.navigate('AssessmentChildSelect', { testCode: test.code })} />
        ))}
      </ListGroup>

      <BrandButton size="md"
        variant="secondary"
        onPress={() => navigation.navigate('AssessmentHistory')}
        style={styles.historyButton}
        label="View history"
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  noticeContainer: { padding: spacing.lg },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  hint: { ...typeRoles.textParagraph, color: colors.textSecondary, marginBottom: spacing.md },
  card: {
    marginBottom: spacing.md,
  },
  cardTitle: {
    ...typeRoles.displayHeading,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  cardDescription: {
    ...typeRoles.textCaption,
    color: colors.textSecondary,
  },
  unassigned: { ...typeRoles.textCaption, color: colors.textSecondary },
  section: { marginBottom: spacing.lg },
  startButton: { marginTop: spacing.md },
  historyButton: {
    marginTop: spacing.sm,
  },
});
