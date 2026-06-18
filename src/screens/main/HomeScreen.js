import React, { useState, useCallback } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Text, Button, ActivityIndicator, Snackbar } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { useOffline } from '../../context/OfflineContext';
import { useChildren } from '../../context/ChildrenContext';
import { useTimeTracking } from '../../hooks/useTimeTracking';
import { useSessionLaunchGuard } from '../../hooks/useSessionLaunchGuard';
import { timeEntriesRepository } from '../../db/repositories/timeEntriesRepository';
import { sessionsRepository } from '../../db/repositories/sessionsRepository';
import { assessmentsRepository } from '../../db/repositories/assessmentsRepository';
import ClockInBeforeSessionDialog from '../../components/sessions/ClockInBeforeSessionDialog';
import BrandButton from '../../components/common/BrandButton';
import {
  getDaysWorkedThisMonth,
  getWeekSessionCounts,
  getSessionsThisMonth,
  getAssessmentCoverage,
  getMonthlyStatsFootnote,
} from '../../utils/dashboardStats';
import { colors, spacing, borderRadius, shadows } from '../../constants/colors';

export default function HomeScreen({ navigation }) {
  const { user, profile } = useAuth();
  const { isOnline, unsyncedCount, syncStatus } = useOffline();
  const { children: childrenList } = useChildren();
  const {
    isSignedIn,
    activeEntry,
    loadingLocation,
    elapsedTime,
    snackbarMessage,
    snackbarVisible,
    setSnackbarVisible,
    handleSignIn,
    handleSignOut,
    formatElapsedTime,
    formatTime,
  } = useTimeTracking();
  const {
    warningVisible,
    requestSessionLaunch,
    continueAnyway,
    clockInNow,
    dismissWarning,
  } = useSessionLaunchGuard({
    navigation,
    userId: user?.id,
  });

  // Dashboard stats
  const [daysWorked, setDaysWorked] = useState(0);
  const [sessionsThisMonth, setSessionsThisMonth] = useState(0);
  // Captured at load time so the footnote's month always matches the counts
  // above, even if Home stays mounted across a month boundary (a re-render from
  // the clock timer must not relabel last month's counts as this month).
  const [statsFootnote, setStatsFootnote] = useState('');
  const [weekCounts, setWeekCounts] = useState([]);
  const [weekTotal, setWeekTotal] = useState(0);
  const [coverage, setCoverage] = useState({ assessed: 0, total: 0, percent: 0 });

  useFocusEffect(
    useCallback(() => {
      const loadStats = async () => {
        const [timeEntries, sessions, assessments] = await Promise.all([
          timeEntriesRepository.getTimeEntries({ userId: user.id }),
          sessionsRepository.getSessions({ userId: user.id }),
          assessmentsRepository.getAssessments({ userId: user.id }),
        ]);

        setDaysWorked(getDaysWorkedThisMonth(timeEntries));

        const monthCount = getSessionsThisMonth(sessions);
        setSessionsThisMonth(monthCount);
        // Same load moment as the counts above — keeps the period label in sync.
        setStatsFootnote(getMonthlyStatsFootnote());

        const week = getWeekSessionCounts(sessions);
        setWeekCounts(week);
        setWeekTotal(week.reduce((sum, d) => sum + d.count, 0));

        setCoverage(getAssessmentCoverage(childrenList, assessments));
      };
      loadStats();
    }, [childrenList, user.id])
  );

  // Sync banner config (unchanged from original)
  const failedCount = syncStatus?.failedItems?.length ?? 0;
  const showBanner = !isOnline || unsyncedCount > 0 || failedCount > 0;
  const bannerVariant = failedCount > 0 ? 'failed' : !isOnline ? 'offline' : 'unsynced';

  const bannerConfig = {
    failed: {
      icon: 'alert-circle-outline',
      text: `${failedCount} item${failedCount !== 1 ? 's' : ''} failed to sync`,
      backgroundColor: colors.emphasis,
      textColor: '#FFFFFF',
      iconColor: '#FFFFFF',
    },
    offline: {
      icon: 'cloud-offline-outline',
      text: 'Offline — data will sync when connected',
      backgroundColor: colors.disabled,
      textColor: '#FFFFFF',
      iconColor: '#FFFFFF',
    },
    unsynced: {
      icon: 'cloud-upload-outline',
      text: `${unsyncedCount} item${unsyncedCount !== 1 ? 's' : ''} waiting to sync`,
      backgroundColor: colors.accent,
      textColor: colors.text,
      iconColor: colors.text,
    },
  };
  const banner = bannerConfig[bannerVariant];

  // Coverage bar color
  const coverageColor = coverage.percent >= 75 ? colors.success
    : coverage.percent >= 50 ? colors.primary
    : colors.emphasis;

  return (
    <View style={styles.outerContainer}>
      <ScrollView style={styles.container}>
        {/* ── Header with Stats ── */}
        <View style={styles.header}>
          <Text variant="titleLarge" style={styles.welcomeText}>
            Welcome, {profile?.first_name || 'User'}!
          </Text>
          <Text variant="bodyMedium" style={styles.roleText}>
            {[profile?.jobTitleName, profile?.schoolName].filter(Boolean).join(' · ')}
          </Text>
          <View style={styles.headerStats}>
            <View style={styles.headerStat}>
              <Text style={styles.headerStatValue}>{daysWorked}</Text>
              <Text style={styles.headerStatLabel}>days worked</Text>
            </View>
            <View style={styles.headerStat}>
              <Text style={styles.headerStatValue}>{sessionsThisMonth}</Text>
              <Text style={styles.headerStatLabel}>sessions</Text>
            </View>
            <View style={styles.headerStat}>
              <Text style={styles.headerStatValue}>{childrenList.length}</Text>
              <Text style={styles.headerStatLabel}>children</Text>
            </View>
          </View>
          {statsFootnote ? <Text style={styles.statsFootnote}>{statsFootnote}</Text> : null}
        </View>

        <View style={styles.content}>
          {/* ── Sync Banner ── */}
          {showBanner && (
            <TouchableOpacity
              style={[styles.syncBanner, { backgroundColor: banner.backgroundColor }]}
              onPress={() => navigation.navigate('SyncStatus')}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={`Open sync status, ${banner.text}`}
            >
              <Ionicons name={banner.icon} size={18} color={banner.iconColor} style={styles.bannerIcon} />
              <Text variant="bodySmall" style={[styles.bannerText, { color: banner.textColor }]}>
                {banner.text}
              </Text>
              <Ionicons name="chevron-forward" size={16} color={banner.iconColor} />
            </TouchableOpacity>
          )}

          {/* ── Clock Card (Compact) ── */}
          <View style={[styles.clockCard, !isSignedIn && !loadingLocation && styles.clockCardNotSignedIn]}>
            {loadingLocation ? (
              <View style={styles.clockLoading}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={styles.clockLoadingText}>Getting location...</Text>
              </View>
            ) : !isSignedIn ? (
              <View style={styles.clockRow}>
                <View>
                  <Text style={styles.clockTitle}>Today</Text>
                  <Text style={styles.clockSubtitle}>Not clocked in</Text>
                </View>
                <BrandButton
                  label="Clock In"
                  onPress={handleSignIn}
                  style={styles.clockButton}
                />
              </View>
            ) : (
              <View>
                <View style={styles.clockRow}>
                  <View>
                    <Text style={styles.clockTitle}>Today</Text>
                    <Text style={[styles.clockSubtitle, { color: colors.success }]}>
                      Clocked in at {formatTime(activeEntry?.sign_in_time)}
                    </Text>
                  </View>
                  <Text style={styles.elapsedText}>{formatElapsedTime(elapsedTime)}</Text>
                </View>
                <Button
                  mode="contained"
                  onPress={handleSignOut}
                  style={styles.clockOutButton}
                  buttonColor={colors.emphasis}
                  icon="logout"
                  compact
                >
                  Clock Out
                </Button>
              </View>
            )}
            <TouchableOpacity
              onPress={() => navigation.navigate('TimeEntriesList')}
              style={styles.viewHistoryLink}
              accessibilityRole="button"
              accessibilityLabel="View work history"
            >
              <Ionicons name="time-outline" size={14} color={colors.primary} />
              <Text style={styles.viewHistoryText}>View Work History</Text>
              <Ionicons name="chevron-forward" size={14} color={colors.primary} />
            </TouchableOpacity>
          </View>

          {/* ── Sessions This Week ── */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>Sessions This Week</Text>
              <Text style={styles.cardHeaderRight}>{weekTotal} total</Text>
            </View>
            <View style={styles.weekRow}>
              {weekCounts.map((d) => (
                <View
                  key={d.day}
                  style={[
                    styles.daySquare,
                    d.count > 0 && styles.daySquareActive,
                    d.isToday && styles.daySquareToday,
                  ]}
                >
                  <Text style={[styles.dayLabel, d.count > 0 && styles.dayLabelActive]}>
                    {d.day.charAt(0)}
                  </Text>
                  <Text style={[styles.dayCount, d.count > 0 && styles.dayCountActive]}>
                    {d.isFuture ? '—' : d.count}
                  </Text>
                </View>
              ))}
            </View>
            <BrandButton
              label="Record Session"
              icon="add-circle-outline"
              onPress={() => requestSessionLaunch()}
              style={styles.recordSessionButton}
            />
          </View>

          {/* ── Assessment Coverage ── */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>Assessment Coverage</Text>
              <Text style={[styles.coveragePercent, { color: coverageColor }]}>
                {coverage.percent}%
              </Text>
            </View>
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, {
                width: `${Math.max(coverage.percent, 2)}%`,
                backgroundColor: coverageColor,
              }]} />
            </View>
            <Text style={styles.coverageLabel}>
              {coverage.assessed} of {coverage.total} children assessed
            </Text>
          </View>

          {/* ── Performance Insights ── */}
          <Text style={styles.sectionTitle}>Performance Insights</Text>
          <View style={styles.insightsRow}>
            <TouchableOpacity
              style={styles.insightCard}
              onPress={() => navigation.navigate('LetterMasteryRanking')}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="View letter mastery rankings"
            >
              <View style={styles.insightIcon}>
                <Ionicons name="school-outline" size={20} color={colors.primary} />
              </View>
              <Text style={styles.insightLabel}>Letter{'\n'}Mastery</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.insightCard}
              onPress={() => navigation.navigate('AssessmentRanking')}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="View assessment score rankings"
            >
              <View style={styles.insightIcon}>
                <Ionicons name="clipboard-outline" size={20} color={colors.primary} />
              </View>
              <Text style={styles.insightLabel}>Assessment{'\n'}Scores</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.insightCard}
              onPress={() => navigation.navigate('SessionCountRanking')}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="View session count rankings"
            >
              <View style={styles.insightIcon}>
                <Ionicons name="people-outline" size={20} color={colors.primary} />
              </View>
              <Text style={styles.insightLabel}>Session{'\n'}Count</Text>
            </TouchableOpacity>
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
      <ClockInBeforeSessionDialog
        visible={warningVisible}
        onDismiss={dismissWarning}
        onClockInNow={clockInNow}
        onContinueAnyway={continueAnyway}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  outerContainer: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },

  // ── Header ──
  header: {
    backgroundColor: colors.heroDark,
    padding: spacing.lg,
    paddingBottom: spacing.md,
  },
  welcomeText: {
    color: '#FFFFFF',
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  roleText: {
    color: '#FFFFFF',
    opacity: 0.85,
  },
  headerStats: {
    flexDirection: 'row',
    gap: spacing.lg,
    marginTop: spacing.md,
  },
  headerStat: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  headerStatValue: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
  },
  headerStatLabel: {
    color: '#FFFFFF',
    fontSize: 10,
    opacity: 0.8,
  },
  statsFootnote: {
    color: '#FFFFFF',
    fontSize: 10,
    opacity: 0.7,
    marginTop: spacing.sm,
  },

  // ── Content ──
  content: {
    padding: spacing.md,
  },

  // ── Sync Banner ──
  syncBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    marginBottom: spacing.md,
  },
  bannerIcon: {
    marginRight: spacing.sm,
  },
  bannerText: {
    flex: 1,
  },

  // ── Clock Card ──
  clockCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    ...shadows.card,
  },
  clockCardNotSignedIn: {
    backgroundColor: 'rgba(231, 45, 77, 0.08)',
  },
  clockRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  clockTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  clockSubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  clockButton: {
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 20,
  },
  elapsedText: {
    color: colors.primary,
    fontSize: 18,
    fontWeight: '700',
  },
  clockOutButton: {
    marginTop: spacing.sm,
  },
  clockLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  clockLoadingText: {
    color: colors.textSecondary,
    fontSize: 13,
  },
  viewHistoryLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  viewHistoryText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
  },

  // ── Cards ──
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    ...shadows.card,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  cardHeaderRight: {
    fontSize: 12,
    color: colors.textSecondary,
  },

  // ── Week Squares ──
  weekRow: {
    flexDirection: 'row',
    gap: spacing.xs + 2,
    marginBottom: spacing.md,
  },
  daySquare: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    backgroundColor: colors.background,
    borderRadius: borderRadius.sm,
  },
  daySquareActive: {
    backgroundColor: colors.red50,
  },
  daySquareToday: {
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  dayLabel: {
    fontSize: 9,
    color: colors.textSecondary,
    marginBottom: 2,
  },
  dayLabelActive: {
    color: colors.primary,
  },
  dayCount: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  dayCountActive: {
    color: colors.primary,
  },

  // ── Record Session Button ──
  recordSessionButton: {
    borderRadius: borderRadius.sm,
    paddingVertical: 10,
  },

  // ── Assessment Coverage ──
  coveragePercent: {
    fontSize: 20,
    fontWeight: '700',
  },
  progressBar: {
    backgroundColor: colors.red50,
    borderRadius: 4,
    height: 8,
    overflow: 'hidden',
    marginBottom: spacing.xs,
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  coverageLabel: {
    fontSize: 11,
    color: colors.textSecondary,
  },

  // ── Performance Insights ──
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: spacing.sm,
    marginTop: spacing.xs,
  },
  insightsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  insightCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
    ...shadows.card,
  },
  insightIcon: {
    width: 36,
    height: 36,
    backgroundColor: colors.red50,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  insightLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.primary,
    textAlign: 'center',
    lineHeight: 15,
  },
});
