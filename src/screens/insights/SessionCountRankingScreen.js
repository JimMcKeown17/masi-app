import { useToast } from '../../context/ToastContext';
import InlineNote from '../../components/common/InlineNote';
import BrandButton from '../../components/common/BrandButton';
import { useScrollBottomPadding } from '../../hooks/useScrollBottomPadding';
import { useHeaderHairline } from '../../components/common/ScreenHeader';
import { typeRoles } from '../../constants/typography';
import { useSignedInEA } from '../../context/SignedInEAContext';
import React, { useState, useCallback, useRef } from 'react';
import { View, StyleSheet, FlatList } from 'react-native';
import { Text, ActivityIndicator } from 'react-native-paper';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { useChildren } from '../../context/ChildrenContext';

import { useSessionHistoryStatus } from '../../services/sessionHistoryStatus';
import { getDistinctSessionCount, getSessionCountRanking } from '../../utils/dashboardStats';
import RankedBarRow from '../../components/dashboard/RankedBarRow';
import StatBar from '../../components/dashboard/StatBar';
import { colors, spacing } from '../../constants/colors';

export default function SessionCountRankingScreen() {
  const onScroll = useHeaderHairline();
  const paddingBottom = useScrollBottomPadding(spacing.xxl);
  const { repositories } = useSignedInEA();
  const { sessions: sessionsRepository } = repositories;

  const { user } = useAuth();
  const { children: childrenList } = useChildren();
  const { pageVersion, runVersion } = useSessionHistoryStatus();
  const [ranking, setRanking] = useState([]);
  const [totalSessions, setTotalSessions] = useState(0);
  const [loading, setLoading] = useState(true);
  const toast = useToast();
  const loadingUserId = useRef(user?.id);
  const hasSuccessfulLoad = useRef(false);
  const [loadError, setLoadError] = useState(false);
  const [retryVersion, setRetryVersion] = useState(0);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      // Only a different EA starts a new first load; refreshes keep the list mounted.
      if (loadingUserId.current !== user?.id) {
        loadingUserId.current = user?.id;
        hasSuccessfulLoad.current = false;
        setLoadError(false);
        setLoading(true);
        setRanking([]);
        setTotalSessions(0);
      }
      const load = async () => {
        try {
          if (!user?.id) return;
          const sessions = await sessionsRepository.getSessions({ userId: user.id });
          const ranked = getSessionCountRanking(childrenList, sessions);
          if (active) {
            setRanking(ranked);
            setTotalSessions(getDistinctSessionCount(childrenList, sessions));
            hasSuccessfulLoad.current = true;
            setLoadError(false);
          }
        } catch (error) {
          if (active) {
            console.error('Error loading session count ranking:', error);
            if (hasSuccessfulLoad.current) {
              toast.show({ message: "Couldn't refresh this ranking.", tone: 'error', duration: 3000 });
            } else {
              setLoadError(true);
            }
          }
        } finally {
          if (active) setLoading(false);
        }
      };
      load();
      return () => { active = false; };
    }, [sessionsRepository, childrenList, user?.id, pageVersion, runVersion, retryVersion, toast])
  );

  if (loading || loadingUserId.current !== user?.id) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (loadError) {
    return (
      <View style={styles.errorContainer}>
        <InlineNote>Couldn't load this ranking. Try again.</InlineNote>
        <BrandButton label="Try again" onPress={() => { setLoading(true); setRetryVersion(version => version + 1); }} />
      </View>
    );
  }

  const childSessions = ranking.reduce((sum, r) => sum + r.count, 0);
  const avgPerChild = ranking.length > 0
    ? Math.round((childSessions / ranking.length) * 10) / 10
    : 0;
  const maxCount = ranking.length > 0 ? ranking[0].count : 1;
  const zeroSessions = ranking.filter(r => r.count === 0).length;

  const renderItem = ({ item, index }) => (
    <RankedBarRow
      rank={index + 1}
      name={`${item.child.first_name} ${(item.child.last_name || '').charAt(0)}.`}
      value={item.count}
      maxValue={maxCount || 1}
      barColor={colors.red500}
      label={`${item.count}`}
    />
  );

  return (
    <View style={styles.container}>
      <FlatList onScroll={onScroll} scrollEventThrottle={16}
        data={ranking}
        keyExtractor={(item) => item.child.id}
        renderItem={renderItem}
        contentContainerStyle={[styles.listContent, { paddingBottom }]}
        ListHeaderComponent={
          <View>
            <Text style={styles.subtitle}>
              Children ranked by total sessions received (all time)
            </Text>
            <StatBar items={[
              { label: 'Total Sessions', value: totalSessions },
              { label: 'Avg / Child', value: avgPerChild },
              { label: '0 Sessions', value: zeroSessions, color: colors.primary },
            ]} />
          </View>
        }
        ListEmptyComponent={
          <Text style={styles.emptyText}>No children to display</Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.md,
    gap: spacing.md,
    backgroundColor: colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  listContent: {
    padding: spacing.md,
  },
  subtitle: {
    ...typeRoles.textCaption,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  emptyText: {
    textAlign: 'center',
    color: colors.textSecondary,
    marginTop: spacing.xl,
  },
});
