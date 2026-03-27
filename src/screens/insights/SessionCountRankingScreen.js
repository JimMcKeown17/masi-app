import React, { useState, useCallback } from 'react';
import { View, StyleSheet, FlatList } from 'react-native';
import { Text, ActivityIndicator } from 'react-native-paper';
import { useFocusEffect } from '@react-navigation/native';
import { useChildren } from '../../context/ChildrenContext';
import { storage } from '../../utils/storage';
import { getSessionCountRanking } from '../../utils/dashboardStats';
import RankedBarRow from '../../components/dashboard/RankedBarRow';
import StatBar from '../../components/dashboard/StatBar';
import { colors, spacing } from '../../constants/colors';

export default function SessionCountRankingScreen() {
  const { children: childrenList } = useChildren();
  const [ranking, setRanking] = useState([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      const load = async () => {
        setLoading(true);
        const sessions = await storage.getSessions();
        const ranked = getSessionCountRanking(childrenList, sessions);
        setRanking(ranked);
        setLoading(false);
      };
      load();
    }, [childrenList])
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const totalSessions = ranking.reduce((sum, r) => sum + r.count, 0);
  const avgPerChild = ranking.length > 0
    ? Math.round((totalSessions / ranking.length) * 10) / 10
    : 0;
  const maxCount = ranking.length > 0 ? ranking[0].count : 1;
  const zeroSessions = ranking.filter(r => r.count === 0).length;

  const renderItem = ({ item, index }) => (
    <RankedBarRow
      rank={index + 1}
      name={`${item.child.first_name} ${(item.child.last_name || '').charAt(0)}.`}
      value={item.count}
      maxValue={maxCount || 1}
      barColor={colors.primary}
      label={`${item.count}`}
    />
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={ranking}
        keyExtractor={(item) => item.child.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View>
            <Text style={styles.subtitle}>
              Children ranked by total sessions received (all time)
            </Text>
            <StatBar items={[
              { label: 'Total Sessions', value: totalSessions },
              { label: 'Avg / Child', value: avgPerChild },
              { label: '0 Sessions', value: zeroSessions, color: zeroSessions > 0 ? colors.emphasis : colors.primary },
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  listContent: {
    padding: spacing.md,
    paddingBottom: spacing.xxl,
  },
  subtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  emptyText: {
    textAlign: 'center',
    color: colors.textSecondary,
    marginTop: spacing.xl,
  },
});
