import React, { useState, useCallback } from 'react';
import { View, StyleSheet, FlatList } from 'react-native';
import { Text, ActivityIndicator } from 'react-native-paper';
import { useFocusEffect } from '@react-navigation/native';
import { useChildren } from '../../context/ChildrenContext';
import { useClasses } from '../../context/ClassesContext';
import { storage } from '../../utils/storage';
import { getLetterMasteryRanking } from '../../utils/dashboardStats';
import RankedBarRow, { getBarColor } from '../../components/dashboard/RankedBarRow';
import StatBar from '../../components/dashboard/StatBar';
import { colors, spacing, borderRadius } from '../../constants/colors';

export default function LetterMasteryRankingScreen({ navigation }) {
  const { children: childrenList } = useChildren();
  const { classes } = useClasses();
  const [ranking, setRanking] = useState([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      const load = async () => {
        setLoading(true);
        const [assessments, letterMastery] = await Promise.all([
          storage.getAssessments(),
          storage.getLetterMastery(),
        ]);
        const ranked = getLetterMasteryRanking(childrenList, assessments, letterMastery, classes);
        setRanking(ranked);
        setLoading(false);
      };
      load();
    }, [childrenList, classes])
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const assessed = ranking.filter(r => r.masteredCount > 0);
  const avgPercent = ranking.length > 0
    ? Math.round(ranking.reduce((sum, r) => sum + r.percent, 0) / ranking.length)
    : 0;
  const above70 = ranking.filter(r => r.percent >= 70).length;
  const below40 = ranking.filter(r => r.percent < 40).length;

  const renderItem = ({ item, index }) => {
    const classItem = classes.find(c => c.id === item.child.class_id) || null;
    return (
      <RankedBarRow
        rank={index + 1}
        name={`${item.child.first_name} ${(item.child.last_name || '').charAt(0)}.`}
        value={item.masteredCount}
        maxValue={item.total}
        barColor={getBarColor(item.percent)}
        label={`${item.masteredCount}/${item.total}`}
        onPress={classItem ? () => navigation.navigate('LetterTracker', {
          child: item.child,
          classItem,
        }) : undefined}
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
              All children ranked by letters mastered (assessment + taught) out of 26
            </Text>
            <StatBar items={[
              { label: 'Avg Mastery', value: `${avgPercent}%` },
              { label: 'Above 70%', value: above70, color: colors.success },
              { label: 'Below 40%', value: below40, color: colors.emphasis },
            ]} />
          </View>
        }
        ListFooterComponent={<ColorKey />}
        ListEmptyComponent={
          <Text style={styles.emptyText}>No children to display</Text>
        }
      />
    </View>
  );
}

function ColorKey() {
  return (
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
