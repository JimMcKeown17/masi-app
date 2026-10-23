import { useChildren } from '../../context/ChildrenContext';
import { useScrollBottomPadding } from '../../hooks/useScrollBottomPadding';
import { useHeaderHairline } from '../../components/common/ScreenHeader';
import React from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { colors, spacing } from '../../constants/colors';
import LetterMasteryPanel from '../../components/assessment/LetterMasteryPanel';

export default function LetterTrackerScreen({ route }) {
  const onScroll = useHeaderHairline();
  const paddingBottom = useScrollBottomPadding(spacing.xxl);
  const { child, classItem: routeClassItem } = route.params;
  const { children: deliveryChildren } = useChildren();
  const isDelivery = deliveryChildren.some(deliveryChild => deliveryChild.id === child.id);
  // Assessment routes carry the chosen membership's class metadata. Older
  // delivery routes still supply their class separately.
  const classItem = child.home_language !== undefined ? {
    ...routeClassItem, id: child.class_id, grade: child.grade, home_language: child.home_language,
  } : routeClassItem;
  const childName = `${child.first_name} ${child.last_name}`;

  return (
    <ScrollView onScroll={onScroll} scrollEventThrottle={16} style={styles.container} contentContainerStyle={[styles.content, { paddingBottom }]}>
      <Text variant="titleLarge" style={styles.childName}>{childName}</Text>
      <LetterMasteryPanel child={child} classItem={classItem} isDelivery={isDelivery} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.md,
  },
  childName: {
    marginBottom: spacing.sm,
  },
});
