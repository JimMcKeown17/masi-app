import React, { useCallback, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Snackbar, Text } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { useChildren } from '../../context/ChildrenContext';
import { useClasses } from '../../context/ClassesContext';
import { useTimeTracking } from '../../hooks/useTimeTracking';
import { sessionsRepository } from '../../db/repositories/sessionsRepository';
import { assessmentsRepository } from '../../db/repositories/assessmentsRepository';
import ElapsedTime from '../../components/common/ElapsedTime';
import SyncIndicator from '../../components/common/SyncIndicator';
import SessionsTodayGauge from '../../components/sessions/SessionsTodayGauge';
import { getSessionsTodayGoal } from '../../services/sessionsTodayGoal';
import { getActiveProgrammeGate } from '../../services/activeProgrammeGate';
import {
  getAssessmentCoverage,
  getSessionsTabStats,
  getWeekSessionCounts,
} from '../../utils/dashboardStats';
import { formatDisplayTime, toLocalDateString } from '../../utils/localDate';
import { borderRadius, colors, spacing } from '../../constants/colors';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

const getChildName = (child) => (
  child?.first_name || child?.firstName || child?.name || 'Child'
);

const formatChildNames = (session, children) => {
  const names = (session.children_ids || [])
    .map((id) => children.find((child) => child.id === id))
    .filter(Boolean)
    .map(getChildName);
  if (names.length <= 1) return names[0] || 'Session';
  if (names.length === 2) return names[0] + ' & ' + names[1];
  return names.slice(0, -1).join(', ') + ' & ' + names[names.length - 1];
};

const getGoalCopy = (goal, isSignedIn) => {
  if (!goal) return null;
  if (goal.state === 'no_target') {
    return {
      title: goal.count + ' ' + (goal.count === 1 ? 'session' : 'sessions') + ' today',
      subtitle: 'This programme has no daily target.',
    };
  }
  if (goal.count === 0) {
    return {
      title: 'No sessions yet today',
      subtitle: isSignedIn ? 'Record your first session.' : 'Clock in to start your day.',
    };
  }
  if (goal.state === 'exceeded') {
    return {
      title: goal.count + ' sessions today',
      subtitle: 'Above the usual maximum of ' + goal.ceiling + '.',
    };
  }
  if (goal.state === 'met') {
    return {
      title: goal.count + ' of ' + goal.target + ' sessions today',
      subtitle: 'Daily target reached.',
    };
  }
  const remaining = goal.target - goal.count;
  return {
    title: goal.count + ' of ' + goal.target + ' sessions today',
    subtitle: remaining === 1
      ? 'One more pair reaches your target.'
      : remaining + ' more pairs reach your target.',
  };
};

export default function HomeScreen({ navigation }) {
  const { user, profile } = useAuth();
  const { children: childrenList } = useChildren();
  const { classBootstrapStatus, incompleteOnboardingClassId } = useClasses();
  const onboardingEnteredRef = useRef(false);
  const {
    isSignedIn,
    activeEntry,
    loadingLocation,
    snackbarMessage,
    snackbarVisible,
    setSnackbarVisible,
    handleSignIn,
    handleSignOut,
  } = useTimeTracking();

  const [weekCounts, setWeekCounts] = useState([]);
  const [coverage, setCoverage] = useState({ assessed: 0, total: 0, percent: 0 });
  const [sessionGoal, setSessionGoal] = useState(null);
  const [programmeName, setProgrammeName] = useState('');
  const [whoToSeeNext, setWhoToSeeNext] = useState([]);
  const [recentSessions, setRecentSessions] = useState([]);
  const [statsLoading, setStatsLoading] = useState(true);
  const statsLoadStartedRef = useRef(false);

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

  useFocusEffect(
    useCallback(() => {
      if (statsLoadStartedRef.current) return undefined;
      statsLoadStartedRef.current = true;

      const loadStats = async () => {
        setStatsLoading(true);
        try {
          const recentCutoff = toLocalDateString(new Date(Date.now() - THIRTY_DAYS_MS));
          const [assessmentCounts, dailyGoal, sessions, programmeGate] = await Promise.all([
            assessmentsRepository.getAssessmentCountsSince({
              userId: user.id,
            }),
            getSessionsTodayGoal({ userId: user.id }),
            sessionsRepository.getSessions({
              userId: user.id,
              recordedByUserId: user.id,
              sinceDate: recentCutoff,
              order: 'desc',
            }),
            getActiveProgrammeGate({ userId: user.id }),
          ]);

          setWeekCounts(getWeekSessionCounts(sessions));
          setCoverage(getAssessmentCoverage(childrenList, assessmentCounts));
          setSessionGoal(dailyGoal);
          setProgrammeName(programmeGate.programme?.name || '');
          setWhoToSeeNext(
            getSessionsTabStats(sessions, childrenList, user.id).notSeenThisWeek.slice(0, 3)
          );
          setRecentSessions(sessions.slice(0, 2));
        } catch (error) {
          console.error('Error loading Home statistics:', error);
        } finally {
          setStatsLoading(false);
        }
      };
      loadStats();

      return () => {
        statsLoadStartedRef.current = false;
      };
    }, [childrenList, user.id])
  );

  const goalCopy = getGoalCopy(sessionGoal, isSignedIn);
  const coverageRemaining = Math.max(coverage.total - coverage.assessed, 0);
  const subtitle = [programmeName, profile?.schoolName].filter(Boolean).join(' · ');

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.outerContainer}>
        <ScrollView
          style={styles.container}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.hero}>
            <View style={styles.heroTopRow}>
              <View style={styles.heroIdentity}>
                <Text style={styles.greeting}>Molo, {profile?.first_name || 'there'}.</Text>
                {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
              </View>
              <Pressable
                onPress={() => navigation.navigate('Profile')}
                accessibilityRole="button"
                accessibilityLabel="Open profile"
                hitSlop={8}
                style={styles.settingsButton}
              >
                <Ionicons name="settings-outline" size={20} color={colors.onDarkMuted} />
              </Pressable>
            </View>

            <View style={styles.syncRow}>
              <SyncIndicator
                onPress={() => navigation.navigate('SyncStatus')}
                showLabel
                dark
              />
            </View>

            <View style={[styles.clockPill, !isSignedIn ? styles.clockPillOut : null]}>
              {loadingLocation ? (
                <View style={styles.clockStatus}>
                  <ActivityIndicator size="small" color={colors.onDarkMuted} />
                  <Text style={styles.clockText}>Getting location...</Text>
                </View>
              ) : isSignedIn ? (
                <Pressable
                  onPress={() => navigation.navigate('TimeEntriesList')}
                  accessibilityRole="button"
                  accessibilityLabel="View work history"
                  style={styles.clockStatus}
                >
                  <View style={styles.clockLed} />
                  <Text style={styles.clockText}>On the clock ·</Text>
                  <ElapsedTime signInTime={activeEntry?.sign_in_time} style={styles.clockElapsed} />
                </Pressable>
              ) : (
                <View style={styles.clockStatus}>
                  <View style={styles.clockLedOut} />
                  <Text style={styles.clockTextMuted}>Not clocked in</Text>
                </View>
              )}
              {!loadingLocation ? (
                <Pressable
                  onPress={isSignedIn ? handleSignOut : handleSignIn}
                  accessibilityRole="button"
                  accessibilityLabel={isSignedIn ? 'Clock Out' : 'Clock In'}
                  style={[styles.clockAction, !isSignedIn ? styles.clockInAction : null]}
                >
                  <Text style={[
                    styles.clockActionText,
                    !isSignedIn ? styles.clockInActionText : null,
                  ]}>
                    {isSignedIn ? 'Clock Out' : 'Clock In'}
                  </Text>
                </Pressable>
              ) : null}
            </View>

            {sessionGoal && goalCopy ? (
              <View style={styles.heroGoal}>
                <SessionsTodayGauge goal={sessionGoal} />
                <View style={styles.goalCopy}>
                  <Text style={[
                    styles.heroGoalTitle,
                    sessionGoal.count === 0 ? styles.heroGoalTitleMuted : null,
                  ]}>
                    {goalCopy.title}
                  </Text>
                  <Text style={styles.heroGoalSubtitle}>{goalCopy.subtitle}</Text>
                </View>
              </View>
            ) : statsLoading ? (
              <ActivityIndicator
                size="small"
                color={colors.onDark}
                accessibilityLabel="Loading statistics"
                style={styles.heroLoader}
              />
            ) : null}
          </View>

          <View style={styles.content}>
            <Text style={styles.sectionLabel}>WHO TO SEE NEXT</Text>
            <View style={styles.nextChildrenRow}>
              {whoToSeeNext.map((child) => {
                const name = getChildName(child);
                return (
                  <View
                    key={child.id}
                    style={styles.childChip}
                    accessible
                    accessibilityLabel={'Who to see next: ' + name}
                  >
                    <View style={styles.childAvatar}>
                      <Text style={styles.childInitial}>{name.slice(0, 2).toUpperCase()}</Text>
                    </View>
                    <Text style={styles.childName}>{name}</Text>
                  </View>
                );
              })}
              {!statsLoading && whoToSeeNext.length === 0 ? (
                <Text style={styles.emptyHint}>
                  {childrenList.length > 0
                    ? 'Everyone has been seen this week.'
                    : 'Your roster will appear here after setup.'}
                </Text>
              ) : null}
            </View>

            <View style={styles.weekRow}>
              {weekCounts.map((day) => (
                <View key={day.day} style={styles.dayColumn}>
                  <Text style={[styles.dayLabel, day.isToday ? styles.dayLabelToday : null]}>
                    {day.day.toUpperCase()}
                  </Text>
                  <View style={[
                    styles.daySquare,
                    day.count > 0 ? styles.daySquareDone : null,
                    day.isToday ? styles.daySquareToday : null,
                  ]}>
                    <Text style={[
                      styles.dayCount,
                      day.count > 0 ? styles.dayCountDone : null,
                      day.isToday ? styles.dayCountToday : null,
                    ]}>
                      {day.isFuture ? '-' : day.count}
                    </Text>
                  </View>
                </View>
              ))}
            </View>

            <Pressable
              onPress={() => navigation.navigate('Assessments')}
              accessibilityRole="button"
              accessibilityLabel={
                coverage.assessed + ' of ' + coverage.total + ' children assessed. '
                + coverageRemaining + ' to go.'
              }
              style={styles.coverageRow}
            >
              <Text style={styles.coverageText}>
                <Text style={styles.coverageStrong}>
                  {coverage.assessed} of {coverage.total}
                </Text>
                {' children assessed'}
              </Text>
              <Text style={styles.coverageLink}>{coverageRemaining} to go →</Text>
            </Pressable>

            <View style={styles.recentHeader}>
              <Text style={styles.sectionLabel}>RECENT</Text>
              <Pressable
                onPress={() => navigation.navigate('SessionHistory')}
                accessibilityRole="button"
                accessibilityLabel="View all session history"
                hitSlop={8}
              >
                <Text style={styles.viewAllText}>View all →</Text>
              </Pressable>
            </View>
            <View style={styles.recentList}>
              {recentSessions.map((session) => (
                <View key={session.id} style={styles.recentRow}>
                  <Text style={styles.recentTime}>
                    {formatDisplayTime(session.started_at || session.created_at) || '--:--'}
                  </Text>
                  <View style={styles.recentSummary}>
                    <Text style={styles.recentChildren}>
                      {formatChildNames(session, childrenList)}
                    </Text>
                    <Text style={styles.recentActivity}>
                      {session.session_type_lookup?.name || session.session_type || 'Session'}
                    </Text>
                  </View>
                </View>
              ))}
              {!statsLoading && recentSessions.length === 0 ? (
                <Text style={styles.emptyHint}>No sessions recorded yet.</Text>
              ) : null}
            </View>
          </View>
        </ScrollView>

        <Snackbar
          visible={snackbarVisible}
          onDismiss={() => setSnackbarVisible(false)}
          duration={3000}
        >
          {snackbarMessage}
        </Snackbar>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.heroDark,
  },
  outerContainer: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    paddingBottom: spacing.lg,
  },
  hero: {
    backgroundColor: colors.heroDark,
    padding: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg + 2,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  heroIdentity: {
    flex: 1,
  },
  greeting: {
    color: colors.onDark,
    fontSize: 27,
    fontWeight: '800',
    letterSpacing: -0.6,
    lineHeight: 31,
  },
  subtitle: {
    color: colors.onDarkMuted,
    fontSize: 13,
    fontWeight: '500',
    marginTop: 6,
  },
  settingsButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 11,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: colors.heroBorder,
    backgroundColor: colors.heroSurface,
  },
  syncRow: {
    alignItems: 'flex-end',
    marginTop: spacing.sm,
  },
  clockPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    borderRadius: borderRadius.md,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: colors.heroBorder,
    backgroundColor: colors.heroSurface,
    paddingVertical: 8,
    paddingLeft: spacing.md,
    paddingRight: spacing.sm,
    marginTop: spacing.sm,
    minHeight: 48,
  },
  clockPillOut: {
    backgroundColor: 'transparent',
    borderColor: colors.heroBorder,
  },
  clockStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexShrink: 1,
  },
  clockLed: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.success,
  },
  clockLedOut: {
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: colors.textSecondary,
  },
  clockText: {
    color: colors.onDark,
    fontSize: 13,
    fontWeight: '700',
  },
  clockTextMuted: {
    color: colors.onDarkMuted,
    fontSize: 13,
    fontWeight: '700',
  },
  clockElapsed: {
    color: colors.onDark,
    fontSize: 13,
    fontWeight: '700',
  },
  clockAction: {
    borderWidth: 1,
    borderColor: colors.heroBorder,
    borderRadius: 999,
    paddingVertical: 7,
    paddingHorizontal: 13,
  },
  clockActionText: {
    color: colors.onDarkMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  clockInAction: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
    paddingVertical: 9,
    paddingHorizontal: spacing.md,
  },
  clockInActionText: {
    color: colors.onDark,
  },
  heroGoal: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg - 4,
    marginTop: spacing.lg - 2,
  },
  goalCopy: {
    flex: 1,
  },
  heroGoalTitle: {
    color: colors.onDark,
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.2,
    lineHeight: 22,
  },
  heroGoalTitleMuted: {
    color: colors.onDarkMuted,
  },
  heroGoalSubtitle: {
    color: colors.onDarkMuted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: spacing.xs,
  },
  heroLoader: {
    marginTop: spacing.lg,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg - 2,
  },
  sectionLabel: {
    color: colors.textSecondary,
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 1.1,
  },
  nextChildrenRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: 12,
  },
  childChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
    paddingLeft: spacing.xs,
    paddingRight: spacing.sm + 2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    backgroundColor: colors.surface,
  },
  childAvatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.red50,
  },
  childInitial: {
    color: colors.red700,
    fontSize: 10,
    fontWeight: '700',
  },
  childName: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  emptyHint: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
  },
  weekRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.lg - 2,
  },
  dayColumn: {
    alignItems: 'center',
    gap: 7,
    width: 52,
  },
  daySquare: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 13,
    borderCurve: 'continuous',
  },
  daySquareDone: {
    backgroundColor: colors.successBg,
    borderColor: colors.successBorder,
  },
  daySquareToday: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  dayLabel: {
    fontSize: 10,
    color: colors.disabled,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  dayLabelToday: {
    color: colors.primaryDark,
  },
  dayCount: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.disabled,
  },
  dayCountDone: {
    color: colors.successText,
  },
  dayCountToday: {
    color: colors.onDark,
  },
  coverageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    borderCurve: 'continuous',
    paddingVertical: 14,
    paddingHorizontal: spacing.md,
    marginTop: spacing.lg - 2,
  },
  coverageText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  coverageStrong: {
    color: colors.text,
    fontWeight: '800',
  },
  coverageLink: {
    color: colors.primaryDark,
    fontSize: 12,
    fontWeight: '800',
  },
  recentHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginTop: spacing.lg,
  },
  viewAllText: {
    color: colors.primaryDark,
    fontSize: 12,
    fontWeight: '700',
  },
  recentList: {
    marginBottom: spacing.md,
  },
  recentRow: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingVertical: spacing.sm + 3,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  recentTime: {
    width: 48,
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  recentSummary: {
    flex: 1,
  },
  recentChildren: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  recentActivity: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
});
