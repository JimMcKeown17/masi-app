import React, { useState, useCallback } from 'react';
import { View, StyleSheet, FlatList } from 'react-native';
import { Text, ActivityIndicator } from 'react-native-paper';
import { useFocusEffect } from '@react-navigation/native';
import { useChildren } from '../../context/ChildrenContext';
import { storage } from '../../utils/storage';
import { getAssessmentRanking } from '../../utils/dashboardStats';
import RankedBarRow, { getBarColor } from '../../components/dashboard/RankedBarRow';
import StatBar from '../../components/dashboard/StatBar';
import { colors, spacing, borderRadius } from '../../constants/colors';

export default function AssessmentRankingScreen() {
  const { children: childrenList } = useChildren();
  const [ranking, setRanking] = useState([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      const load = async () => {
        setLoading(true);
        const assessments = await storage.getAssessments();
        const ranked = getAssessmentRanking(childrenList, assessments);
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

  const assessed = ranking.filter(r => r.accuracy !== null);
  const notAssessed = ranking.filter(r => r.accuracy === null);

  const avgAccuracy = assessed.length > 0
    ? Math.round(assessed.reduce((sum, r) => sum + r.accuracy, 0) / assessed.length)
    : 0;
  const highest = assessed.length > 0 ? assessed[0].accuracy : 0;

  const renderItem = ({ item, index }) => {
    if (item.accuracy === null) {
      return (
        <View style={styles.unassessedRow}>
          <Text style={styles.unassessedName}>
            {item.child.first_name} {(item.child.last_name || '').charAt(0)}.
          </Text>
          <Text style={styles.unassessedLabel}>Not assessed</Text>
        </View>
      );
    }

    return (
      <RankedBarRow
        rank={index + 1}
        name={`${item.child.first_name} ${(item.child.last_name || '').charAt(0)}.`}
        value={item.accuracy}
        maxValue={100}
        barColor={getBarColor(item.accuracy)}
        label={`${item.accuracy}%`}
      />
    );
  };

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
              Children ranked by most recent EGRA assessment accuracy
            </Text>
            <StatBar items={[
              { label: 'Avg Accuracy', value: `${avgAccuracy}%` },
              { label: 'Highest', value: `${highest}%`, color: colors.success },
              { label: 'Not Assessed', value: notAssessed.length, color: colors.emphasis },
            ]} />
          </View>
        }
        ListFooterComponent={
          <View style={styles.colorKey}>
            <View style={styles.keyItem}>
              <View style={[styles.keySwatch, { backgroundColor: colors.success }]} />
              <Text style={styles.keyLabel}>70%+</Text>
            </View>
            <View style={styles.keyItem}>
              <View style={[styles.keySwatch, { backgroundColor: '#FFBB00' }]} />
              <Text style={styles.keyLabel}>40–69%</Text>
            </View>
            <View style={styles.keyItem}>
              <View style={[styles.keySwatch, { backgroundColor: colors.emphasis }]} />
              <Text style={styles.keyLabel}>Under 40%</Text>
            </View>
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
  unassessedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.sm,
    padding: spacing.sm + 2,
    marginBottom: spacing.xs + 2,
    borderLeftWidth: 3,
    borderLeftColor: colors.disabled,
  },
  unassessedName: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  unassessedLabel: {
    fontSize: 11,
    color: colors.disabled,
    fontStyle: 'italic',
  },
  colorKey: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.md,
    marginTop: spacing.md,
    padding: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.sm,
  },
  keyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  keySwatch: {
    width: 10,
    height: 10,
    borderRadius: 2,
  },
  keyLabel: {
    fontSize: 10,
    color: colors.textSecondary,
  },
});
