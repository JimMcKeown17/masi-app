import React, { useState, useCallback, useLayoutEffect } from 'react';
import { View, Text, StyleSheet, FlatList } from 'react-native';
import { colors } from '../../constants/colors';
import { typeRoles } from '../../constants/typography';
import { useClasses } from '../../context/ClassesContext';
import { useChildren } from '../../context/ChildrenContext';
import GroupPickerBottomSheet from '../../components/children/GroupPickerBottomSheet';
import ClassChildRow from '../../components/children/ClassChildRow';
import BrandButton from '../../components/common/BrandButton';
import IconCircleButton from '../../components/common/IconCircleButton';
import SectionHeader from '../../components/common/SectionHeader';
import InlineLoading from '../../components/common/InlineLoading';
import { listGroupItemFrame, ListGroupDivider } from '../../components/common/ListGroup';
import { useHeaderHairline } from '../../components/common/ScreenHeader';
import { FAB_OVERHANG } from '../../components/navigation/LockedBottomTabBar';
import { compareGroups, getGroupDotColor } from '../../utils/groupHelpers';

export default function ClassDetailScreen({ route, navigation }) {
  const { classId } = route.params;
  const { classes, schools, loading, getChildrenInClass } = useClasses();
  const { groups, childrenGroups } = useChildren();

  const classItem = classes.find(c => c.id === classId);
  const childrenInClass = getChildrenInClass(classId);
  const school = schools.find(s => s.id === classItem?.school_id);

  // Persistent "Manage classes" affordance — always returns to the full class
  // list, so an auto-routed single-class EA can still reach another class or
  // add one. (ChildrenListScreen won't re-auto-route them on return.)
  useLayoutEffect(() => {
    navigation.setOptions({
      title: classItem?.name ?? '',
      headerRight: () => (
        // ClassDetail is a screen in the Children stack; popToTop returns to the
        // live ChildrenList root (ref intact → no re-route), so navigate() does
        // not remount the tab, reset hasAutoRouted, or bounce a single-class EA
        // straight back here.
        <BrandButton variant="tertiary" label="Manage classes" onPress={() => navigation.popToTop()} />
      ),
    });
  }, [navigation, classItem?.name]);

  const onScroll = useHeaderHairline(navigation);

  // Bottom sheet state
  const [pickerVisible, setPickerVisible] = useState(false);
  const [selectedChild, setSelectedChild] = useState(null);

  // Force re-render when groups change (after assignment)
  const [, setRefreshKey] = useState(0);
  const handleGroupChanged = useCallback(() => {
    setRefreshKey(k => k + 1);
  }, []);

  /**
   * Get the current group for a child (for this user's groups only).
   * Returns { group, groupIndex } or { group: null, groupIndex: -1 }
   */
  const getChildGroup = (childId) => {
    const groupIds = new Set(groups.map(g => g.id));
    const membership = childrenGroups.find(
      cg => cg.child_id === childId && groupIds.has(cg.group_id)
    );
    if (!membership) return { group: null, groupIndex: -1 };

    const sortedGroups = [...groups].sort(compareGroups);
    const groupIndex = sortedGroups.findIndex(g => g.id === membership.group_id);
    return { group: sortedGroups[groupIndex], groupIndex };
  };

  const openGroupPicker = (child) => {
    setSelectedChild(child);
    setPickerVisible(true);
  };

  if (loading && !classItem) {
    return <View style={styles.container}>
      <View style={styles.status}><InlineLoading label="Loading class…" /></View>
    </View>;
  }
  if (!classItem) {
    return <View style={styles.container}>
      <Text style={[styles.status, styles.notFound]}>Class not found.</Text>
    </View>;
  }

  const renderChildItem = ({ item: child, index }) => {
    const { group, groupIndex } = getChildGroup(child.id);
    return <View style={[listGroupItemFrame(index, childrenInClass.length), styles.rowFrame]}>
      {index > 0 ? <ListGroupDivider inset={68} /> : null}
      <ClassChildRow child={child} groupName={group?.name} groupColor={group ? getGroupDotColor(groupIndex) : undefined}
        onPressResults={() => navigation.navigate('ChildResults', { child, classItem })}
        onPressGroup={() => openGroupPicker(child)}
        onPressLetterTracker={() => navigation.navigate('LetterTracker', { child, classItem })}
        onPressEdit={() => navigation.navigate('EditChild', { childId: child.id })} />
    </View>;
  };

  return <View style={styles.container}>
    <FlatList data={childrenInClass} keyExtractor={item => item.id} renderItem={renderChildItem}
      onScroll={onScroll} scrollEventThrottle={16} contentContainerStyle={styles.listContent}
      ListHeaderComponent={<View>
        <View style={styles.classInfo}>
          <View style={styles.infoText}>
            <Text style={styles.school}>{school?.name || 'Unknown school'}</Text>
            <Text style={styles.detail}>{`${classItem.grade} • ${classItem.teacher}`}</Text>
            <Text style={styles.detail}>{`Language: ${classItem.home_language?.trim() ? classItem.home_language : 'Not set'}`}</Text>
          </View>
          <IconCircleButton icon="create-outline" accessibilityLabel="Edit class"
            onPress={() => navigation.navigate('EditClass', { classId })} />
        </View>
        <SectionHeader title={`Children (${childrenInClass.length})`} style={styles.section}
          action={{ icon: 'add', label: 'Add child', onPress: () => navigation.navigate('AddChild', { classId }) }} />
      </View>}
      ListEmptyComponent={<View style={styles.emptyState}>
        <Text accessibilityRole="header" style={styles.emptyTitle}>No children in this class yet.</Text>
        <Text style={styles.emptyHint}>Tap Add child to add a child.</Text>
      </View>}
    />
    {selectedChild ? <GroupPickerBottomSheet visible={pickerVisible}
      onDismiss={() => {
        setPickerVisible(false);
        setSelectedChild(null);
      }}
      childId={selectedChild.id} childName={`${selectedChild.first_name} ${selectedChild.last_name}`}
      currentGroupId={getChildGroup(selectedChild.id).group?.id || null} onGroupChanged={handleGroupChanged}
    /> : null}
  </View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  status: { marginTop: 16, paddingHorizontal: 24 },
  notFound: { ...typeRoles.textBody, color: colors.textSecondary },
  classInfo: { marginTop: 6, paddingHorizontal: 24, flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  infoText: { flex: 1 },
  school: { ...typeRoles.textBodySemi, color: colors.text },
  detail: { ...typeRoles.textSmall, color: colors.textSecondary, marginTop: 2 },
  section: { marginHorizontal: 24, marginTop: 20, marginBottom: 10 },
  rowFrame: { marginHorizontal: 24 },
  listContent: { paddingBottom: FAB_OVERHANG + 16 },
  emptyState: { paddingHorizontal: 24, marginTop: 4 },
  emptyTitle: { ...typeRoles.textRowTitle, color: colors.text },
  emptyHint: { ...typeRoles.textCaption, color: colors.textSecondary, marginTop: 2 },
});
