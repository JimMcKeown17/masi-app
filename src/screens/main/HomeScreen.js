import { isKnownMaths, isMathsProgramme, rememberProgrammeSubject } from '../../utils/programmeSubject';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { AppState, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';
import { useAuth } from '../../context/AuthContext';
import { useAssessableChildren } from '../../hooks/useAssessableChildren';
import { useChildren } from '../../context/ChildrenContext';
import { useClasses } from '../../context/ClassesContext';
import { useOffline } from '../../context/OfflineContext';
import { useTimeTracking } from '../../hooks/useTimeTracking';
import SyncIndicator from '../../components/common/SyncIndicator';
import HomeClockRow from '../../components/home/HomeClockRow';
import SegmentedSessionGauge from '../../components/sessions/SegmentedSessionGauge';
import WeekStrip from '../../components/home/WeekStrip';
import AttentionArea from '../../components/home/AttentionArea';
import FocusAwareStatusBar from '../../components/common/FocusAwareStatusBar';
import { FAB_OVERHANG } from '../../components/navigation/LockedBottomTabBar';
import { getSessionsTodayGoal } from '../../services/sessionsTodayGoal';
import { getActiveProgrammeGate } from '../../services/activeProgrammeGate';
import { useSignedInEA } from '../../context/SignedInEAContext';
import { useAssessmentHistoryStatus } from '../../services/assessmentHistoryStatus';
import { useSessionHistoryStatus } from '../../services/sessionHistoryStatus';
import { isStaleActorError } from '../../session/staleActor';
import { LessonDraftCorruptError } from '../../db/repositories/lessonDraftsRepository';
import { getCoverageFromCounts, getWeekSessionCounts } from '../../utils/dashboardStats';
import { deriveHomeAttentionItems, lessonInProgressFromDraft } from '../../utils/homeAttention';
import { getGoalCopy } from '../../utils/sessionGoalPresentation';
import { toLocalDateString } from '../../utils/localDate';
import { colors, shadows } from '../../constants/colors';
import { typeRoles } from '../../constants/typography';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const SIDE = 24;
const CARD_STRADDLE = 56; // the red field ends this far below the card's top
const RING = { stroke: 50, r: 236, dxFromRight: 170, cy: 40 };

export default function HomeScreen({ navigation }) {
  const { handle, repositories, services } = useSignedInEA();
  const { sessions: sessionsRepository, assessments: assessmentsRepository, lessonDrafts } = repositories;
  const { homeAttention } = services;
  const { pageVersion, runVersion } = useSessionHistoryStatus();
  const assessmentHistory = useAssessmentHistoryStatus();
  const insets = useSafeAreaInsets();
  const { width, fontScale } = useWindowDimensions();
  const { user, profile } = useAuth();
  const { all: assessableChildren } = useAssessableChildren();
  const { children: childrenList } = useChildren();
  const { classBootstrapStatus, incompleteOnboardingClassId } = useClasses();
  const { needsAttentionCount = 0 } = useOffline();
  const {
    isSignedIn, activeEntry, loadingLocation,
    handleSignIn, handleSignOut, autoClockOutNotice, dismissAutoClockOutNotice,
  } = useTimeTracking();
  const onboardingEnteredRef = useRef(false);
  const loadSeqRef = useRef(0);

  const [weekCounts, setWeekCounts] = useState([]);
  const [coverage, setCoverage] = useState(null); // null until the first successful load
  const [sessionGoal, setSessionGoal] = useState(null);
  const [programmeName, setProgrammeName] = useState('');
  const [hasActiveProgramme, setHasActiveProgramme] = useState(true);
  const [statsFailed, setStatsFailed] = useState(false); // the latest load rejected
  const [assessmentDismissedOn, setAssessmentDismissedOn] = useState(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [subjectReady, setSubjectReady] = useState(false);
  const [isMaths, setIsMaths] = useState(false);
  const [lessonDraft, setLessonDraft] = useState(null);
  const [now, setNow] = useState(() => new Date());

  // Unchanged onboarding routing.
  useFocusEffect(
    useCallback(() => {
      const shouldEnterOnboarding = classBootstrapStatus === 'confirmed_empty'
        || classBootstrapStatus === 'unconfirmed_empty';
      if (incompleteOnboardingClassId && !onboardingEnteredRef.current) {
        onboardingEnteredRef.current = true;
        navigation.navigate('ChildOnboarding', { classId: incompleteOnboardingClassId });
      } else if (shouldEnterOnboarding && !onboardingEnteredRef.current) {
        onboardingEnteredRef.current = true;
        navigation.navigate('ClassOnboarding');
      } else if (!incompleteOnboardingClassId && !shouldEnterOnboarding) {
        onboardingEnteredRef.current = false;
      }
    }, [classBootstrapStatus, incompleteOnboardingClassId, navigation])
  );

  const loadStats = useCallback(async () => {
    const seq = ++loadSeqRef.current;
    setNow(new Date());
    const programmeGatePromise = getActiveProgrammeGate({ handle, userId: user.id });
    // Publish the subject independently of statistics, so a failed stats load
    // cannot keep a retained literacy draft visible after a programme change.
    void programmeGatePromise.then(gate => {
      if (seq !== loadSeqRef.current || !handle.isCurrent()) return;
      setIsMaths(rememberProgrammeSubject(handle, gate.programme) === 'maths');
      setSubjectReady(true);
    }, () => {
      // A failed read keeps what Home knew and prefers maths known by any screen; it never
      // turns a known numeracy EA back to literacy.
      if (seq !== loadSeqRef.current || !handle.isCurrent()) return;
      if (isKnownMaths(handle)) setIsMaths(true);
      setSubjectReady(true);
    });
    // Draft availability is independent of statistics, including their failures and timing.
    void (async () => {
      try {
        const draft = await lessonDrafts.getActive();
        if (seq === loadSeqRef.current) setLessonDraft(draft);
      } catch (error) {
        if (seq !== loadSeqRef.current || isStaleActorError(error)) return;
        if (error instanceof LessonDraftCorruptError) setLessonDraft(error);
        else console.error('Error loading lesson in progress:', error);
      }
    })();
    // The initial load owns the skeleton; later loads update existing content in place.
    try {
      const recentCutoff = toLocalDateString(new Date(Date.now() - THIRTY_DAYS_MS));
      const [assessmentCounts, dailyGoal, sessions, programmeGate, dismissedOn] = await Promise.all([
        // The repository counts non-skipped letter results in the active academic year, from any EA.
        programmeGatePromise.then(gate => isMathsProgramme(gate.programme)
          ? null : assessmentsRepository.getAssessmentCountsSince({ userId: user.id })),
        getSessionsTodayGoal({ handle, userId: user.id }),
        sessionsRepository.getSessions({
          userId: user.id, recordedByUserId: user.id, sinceDate: recentCutoff, order: 'desc',
        }),
        programmeGatePromise,
        homeAttention.getAssessmentDismissedOn(),
      ]);
      if (seq !== loadSeqRef.current) return; // a newer load superseded this one
      setWeekCounts(getWeekSessionCounts(sessions));
      setCoverage(isMathsProgramme(programmeGate.programme) ? null : getCoverageFromCounts(assessableChildren, assessmentCounts));
      setSessionGoal(dailyGoal);
      setProgrammeName(programmeGate.programme?.name || '');
      setHasActiveProgramme(Boolean(programmeGate.hasActiveProgramme));
      setAssessmentDismissedOn((current) => (
        current && (!dismissedOn || current > dismissedOn) ? current : dismissedOn
      ));
      setStatsFailed(false);
    } catch (error) {
      if (isStaleActorError(error)) return;
      console.error('Error loading Home statistics:', error);
      if (seq === loadSeqRef.current) setStatsFailed(true);
    } finally {
      if (seq === loadSeqRef.current) setStatsLoading(false);
    }
  }, [handle, sessionsRepository, assessmentsRepository, lessonDrafts, homeAttention, assessableChildren, user.id, pageVersion, runVersion, assessmentHistory.pageVersion, assessmentHistory.runVersion]);

  // Load on focus, roster or history changes; reload on foreground.
  useFocusEffect(
    useCallback(() => {
      loadStats();
      const sub = AppState.addEventListener('change', (next) => {
        if (next === 'active') loadStats();
      });
      return () => sub.remove();
    }, [loadStats])
  );
  const attentionItems = useMemo(() => deriveHomeAttentionItems({
    lessonInProgress: !subjectReady || isMaths ? null : lessonDraft instanceof LessonDraftCorruptError
      ? { draftId: lessonDraft.draftId, childNames: [] }
      : lessonInProgressFromDraft(lessonDraft, childrenList),
    needsAttentionCount,
    autoClockOut: autoClockOutNotice,
    coverage: !subjectReady || isMaths ? null : coverage,
    assessmentDismissedOn,
    now,
  }), [subjectReady, isMaths, lessonDraft, childrenList, needsAttentionCount, autoClockOutNotice, coverage, assessmentDismissedOn, now]);

  const openItem = useCallback((item) => item.params
    ? navigation.navigate(item.route, item.params) : navigation.navigate(item.route), [navigation]);
  const dismissItem = useCallback(async (item) => {
    if (item.kind === 'auto_clock_out') {
      await dismissAutoClockOutNotice(item.entryId);
    } else if (item.kind === 'assessment_due') {
      const today = toLocalDateString(new Date());
      setAssessmentDismissedOn((current) => (current && current > today ? current : today));
      try {
        await homeAttention.dismissAssessmentForDay(today);
      } catch (error) {
        if (!isStaleActorError(error)) console.error('Error dismissing assessment card:', error);
      }
    }
  }, [dismissAutoClockOutNotice, homeAttention]);

  const goalCopy = getGoalCopy(sessionGoal, isSignedIn);
  const subtitle = [programmeName, profile?.schoolName].filter(Boolean).join(' · ');

  return (
    <View style={styles.screen}>
      <FocusAwareStatusBar style="light" />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: FAB_OVERHANG + 16 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Red above the content top so an iOS overscroll never shows the canvas. */}
        <View style={styles.overscrollRed} />
        <View style={[styles.hero, { paddingTop: insets.top + 6 }]}>
          <Svg
            width={width}
            height={RING.cy + RING.r + RING.stroke}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            <Circle
              cx={width + RING.dxFromRight}
              cy={RING.cy}
              r={RING.r}
              stroke={colors.red500}
              strokeWidth={RING.stroke}
              fill="none"
            />
          </Svg>

          <View style={styles.topRow}>
            <SyncIndicator variant="hero" onPress={() => navigation.navigate('SyncStatus')} />
            <Pressable
              onPress={() => navigation.navigate('Profile')}
              accessibilityRole="button"
              accessibilityLabel="Settings. Open profile"
              style={styles.heroButton}
            >
              <Ionicons name="settings-outline" size={22} color={colors.onDark} />
            </Pressable>
          </View>

          <Text accessibilityRole="header" maxFontSizeMultiplier={1.2} style={styles.greeting}>
            Molo, {profile?.first_name || 'there'}.
          </Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}

          <View style={styles.clockWrap}>
            <HomeClockRow
              isSignedIn={isSignedIn}
              loadingLocation={loadingLocation}
              signInTime={activeEntry?.sign_in_time}
              fontScale={fontScale}
              onOpenHistory={() => navigation.navigate('TimeEntriesList')}
              onClockIn={handleSignIn}
              onClockOut={handleSignOut}
            />
          </View>
        </View>

        <View style={styles.body}>
          <View style={[styles.card, shadows.elevated]} accessibilityLabel="Today’s sessions">
            {sessionGoal && goalCopy ? (
              // Previously loaded stats stay on screen while a refresh runs or
              // if it fails; only a successful load replaces them.
              <>
                <SegmentedSessionGauge goal={sessionGoal} />
                <Text style={styles.cardTitle}>{goalCopy.title}</Text>
                <Text style={styles.cardSubtitle}>{goalCopy.subtitle}</Text>
              </>
            ) : statsLoading ? (
              <View accessible accessibilityLabel="Loading statistics" style={styles.skeleton}>
                <View style={styles.skelGauge} />
                <View style={styles.skelTitle} />
                <View style={styles.skelLine} />
              </View>
            ) : statsFailed ? (
              <>
                <Text style={styles.cardTitle}>Couldn’t load today’s sessions</Text>
                <Text style={styles.cardSubtitle}>They’ll refresh next time you open Home.</Text>
              </>
            ) : !hasActiveProgramme ? (
              // getSessionsTodayGoal returns null without an active programme: a
              // valid state, not a failure. Same wording as NoActiveProgrammeNotice.
              <>
                <Text style={styles.cardTitle}>No active programme</Text>
                <Text style={styles.cardSubtitle}>Contact your supervisor to be assigned.</Text>
              </>
            ) : (
              <>
                <Text style={styles.cardTitle}>Programme details aren’t on this phone yet</Text>
                <Text style={styles.cardSubtitle}>They’ll appear after the next sync.</Text>
              </>
            )}
          </View>

          <WeekStrip days={weekCounts} />

          <AttentionArea items={attentionItems} onOpen={openItem} onDismiss={dismissItem} />
        </View>
      </ScrollView>

      {/* Fixed behind the status bar: the red hero scrolls away at large text
          sizes, and the light status bar must keep its contrast. */}
      <View
        testID="home-status-bar-backdrop"
        pointerEvents="none"
        style={{ position: 'absolute', top: 0, left: 0, right: 0, height: insets.top, backgroundColor: colors.red600 }}
      />

    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  scroll: { flex: 1 },
  overscrollRed: { position: 'absolute', top: -1000, left: 0, right: 0, height: 1000, backgroundColor: colors.red600 },
  hero: {
    backgroundColor: colors.red600,
    paddingHorizontal: SIDE,
    paddingBottom: 16 + CARD_STRADDLE,
    overflow: 'hidden',
  },
  topRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  heroButton: {
    width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.red700,
  },
  greeting: { ...typeRoles.displayXL, color: colors.onDark, marginTop: 10 },
  subtitle: { ...typeRoles.textBody, color: colors.red50, marginTop: 4, maxWidth: 280 },
  clockWrap: { marginTop: 20 },
  body: { paddingHorizontal: SIDE, marginTop: -CARD_STRADDLE, gap: 20 },
  card: {
    backgroundColor: colors.surface, borderRadius: 22, alignItems: 'center',
    paddingTop: 18, paddingHorizontal: 16, paddingBottom: 16,
  },
  cardTitle: { ...typeRoles.displayM, color: colors.text, marginTop: 10, textAlign: 'center' },
  cardSubtitle: { ...typeRoles.textBody, color: colors.textSecondary, marginTop: 4, textAlign: 'center' },
  skeleton: { alignItems: 'center' },
  skelGauge: { width: 176, height: 97, borderRadius: 12, backgroundColor: colors.border },
  skelTitle: { width: 200, height: 22, borderRadius: 6, marginTop: 12, backgroundColor: colors.border },
  skelLine: { width: 240, height: 16, borderRadius: 6, marginTop: 8, backgroundColor: colors.border },
});
