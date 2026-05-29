import React, { useState, useCallback } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Text, Button } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { colors, spacing, borderRadius } from '../../constants/colors';
import { useChildren } from '../../context/ChildrenContext';
import { sessionsRepository } from '../../db/repositories/sessionsRepository';
import { getSessionsTabStats } from '../../utils/dashboardStats';
import StatBar from '../../components/dashboard/StatBar';
import SessionsTodayRing from '../../components/sessions/SessionsTodayRing';
import { getSessionsTodayGoal } from '../../services/sessionsTodayGoal';
import { useSessionLaunchGuard } from '../../hooks/useSessionLaunchGuard';
import ClockInBeforeSessionDialog from '../../components/sessions/ClockInBeforeSessionDialog';

export default function SessionsScreen({ navigation }) {
  const { user } = useAuth();
  const { children: childrenList } = useChildren();
  const [stats, setStats] = useState(null);
  const [goal, setGoal] = useState(null);
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

  useFocusEffect(
    useCallback(() => {
      const loadStats = async () => {
        const sessions = await sessionsRepository.getSessions({ userId: user.id });
        setStats(getSessionsTabStats(sessions, childrenList));
        // Re-resolved on every focus, so the ring reflects a session the EA just
        // recorded the moment they navigate back to this tab.
        setGoal(await getSessionsTodayGoal({ userId: user.id }));
      };
      loadStats();
    }, [childrenList, user.id])
  );

  return (
    <View style={styles.container}>
      {/* Tab Stats */}
      {stats && (
        <View>
          <StatBar items={[
            { label: 'This Week', value: stats.thisWeek },
            { label: 'This Month', value: stats.thisMonth },
            { label: 'Avg / Child', value: stats.avgPerChild },
          ]} />
          {stats.notSeenThisWeek.length > 0 && (
            <TouchableOpacity
              style={styles.callout}
              onPress={() => navigation.navigate('SessionCountRanking')}
              activeOpacity={0.7}
            >
              <Text style={styles.calloutText}>
                {stats.notSeenThisWeek.length} {stats.notSeenThisWeek.length === 1 ? 'child' : 'children'} not seen this week
              </Text>
              <Ionicons name="chevron-forward" size={14} color={colors.primary} />
            </TouchableOpacity>
          )}
        </View>
      )}

      {goal && (
        <View style={styles.ringSection}>
          <SessionsTodayRing goal={goal} />
          <Text style={styles.ringCaption}>Sessions today</Text>
        </View>
      )}

      <Text variant="titleLarge" style={styles.title}>Sessions</Text>
      <Text variant="bodyMedium" style={styles.description}>
        Record new sessions and view session history.
      </Text>

      <View style={styles.buttonContainer}>
        <Button
          mode="contained"
          onPress={() => requestSessionLaunch()}
          style={styles.button}
        >
          Record New Session
        </Button>

        <Button
          mode="outlined"
          onPress={() => navigation.navigate('SessionHistory')}
          style={styles.button}
        >
          View History
        </Button>
      </View>
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
  container: {
    flex: 1,
    padding: spacing.lg,
    backgroundColor: colors.background,
  },
  ringSection: {
    alignItems: 'center',
    marginVertical: spacing.lg,
  },
  ringCaption: {
    marginTop: spacing.sm,
    fontSize: 12,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  title: {
    marginBottom: spacing.sm,
  },
  description: {
    marginBottom: spacing.xl,
    color: colors.textSecondary,
  },
  buttonContainer: {
    gap: spacing.md,
  },
  button: {
    marginBottom: spacing.md,
  },
  callout: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.sm,
    padding: spacing.sm + 2,
    marginBottom: spacing.md,
  },
  calloutText: {
    fontSize: 12,
    color: colors.emphasis,
    fontWeight: '600',
  },
});
