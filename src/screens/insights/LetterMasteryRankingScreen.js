import { useToast } from '../../context/ToastContext';
import InlineNote from '../../components/common/InlineNote';
import BrandButton from '../../components/common/BrandButton';
import { useAssessmentHistoryStatus } from '../../services/assessmentHistoryStatus';
import { useScrollBottomPadding } from '../../hooks/useScrollBottomPadding';
import { useHeaderHairline } from '../../components/common/ScreenHeader';
import { OKAY_YELLOW } from '../../utils/scoreBands';
import { typeRoles } from '../../constants/typography';
import { useSignedInEA } from '../../context/SignedInEAContext';
import React, { useState, useCallback, useRef } from 'react';
import { View, StyleSheet, FlatList } from 'react-native';
import { Text, ActivityIndicator } from 'react-native-paper';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { useChildren } from '../../context/ChildrenContext';
import { useClasses } from '../../context/ClassesContext';


import { getLetterMasteryRanking } from '../../utils/dashboardStats';
import RankedBarRow, { getBarColor } from '../../components/dashboard/RankedBarRow';
import StatBar from '../../components/dashboard/StatBar';
import { colors, spacing, borderRadius } from '../../constants/colors';

export default function LetterMasteryRankingScreen({ navigation }) {
  const { pageVersion, runVersion } = useAssessmentHistoryStatus();
  const onScroll = useHeaderHairline();
  const paddingBottom = useScrollBottomPadding(spacing.xxl);
  const { repositories } = useSignedInEA();
  const { assessments: assessmentsRepository, mastery: masteryRepository } = repositories;

  const { user } = useAuth();
  const { children: childrenList } = useChildren();
  const { classes } = useClasses();
  const [ranking, setRanking] = useState([]);
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
      }
      const load = async () => {
        try {
          if (!user?.id) return;
          const [assessments, letterMastery] = await Promise.all([
            assessmentsRepository.getLetterEvidenceResults({ userId: user.id }),
            masteryRepository.getLetterMastery({ childIds: childrenList.map((c) => c.id) }),
          ]);
          const ranked = getLetterMasteryRanking(childrenList, assessments, letterMastery, classes);
          if (active) {
            setRanking(ranked);
            hasSuccessfulLoad.current = true;
            setLoadError(false);
          }
        } catch (error) {
          if (active) {
            console.error('Error loading letter mastery ranking:', error);
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
    }, [assessmentsRepository, masteryRepository, childrenList, classes, user?.id, pageVersion, runVersion, retryVersion, toast])
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
      <FlatList onScroll={onScroll} scrollEventThrottle={16}
        data={ranking}
        keyExtractor={(item) => item.child.id}
        renderItem={renderItem}
        contentContainerStyle={[styles.listContent, { paddingBottom }]}
        ListHeaderComponent={
          <View>
            <Text style={styles.subtitle}>
              All children ranked by letters mastered (assessment + taught) out of 26
            </Text>
            <StatBar items={[
              { label: 'Avg Mastery', value: `${avgPercent}%` },
              { label: 'Above 70%', value: above70, color: colors.success },
              { label: 'Below 40%', value: below40, color: colors.primary },
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
        <View style={[styles.keySwatch, { backgroundColor: OKAY_YELLOW }]} />
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
    ...typeRoles.textCaption,
    color: colors.textSecondary,
  },
});
