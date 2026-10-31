import { useActiveProgrammeSubject } from '../../hooks/useActiveProgrammeSubject';
import { useAssessableChildren } from '../../hooks/useAssessableChildren';
import { useAssessmentHistoryStatus } from '../../services/assessmentHistoryStatus';
import { useSignedInEA } from '../../context/SignedInEAContext';
import React, { useState, useCallback, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { colors } from '../../constants/colors';
import { typeRoles } from '../../constants/typography';
import { useChildren } from '../../context/ChildrenContext';
import { useClasses } from '../../context/ClassesContext';
import { useOffline } from '../../context/OfflineContext';
import { getChildrenTabStats } from '../../utils/dashboardStats';
import { getChildrenLanding } from '../../utils/childrenLanding';
import { classMonogram, childMetaLine, countLabel } from '../../utils/childrenPresentation';
import { describeSyncBanner } from '../../utils/syncStatusPresenter';
import { getInitials } from '../../utils/initials';
import StatBar from '../../components/dashboard/StatBar';
import SearchField from '../../components/common/SearchField';
import SyncBanner from '../../components/common/SyncBanner';
import ListGroup, { listGroupItemFrame, ListGroupDivider } from '../../components/common/ListGroup';
import ListRow from '../../components/common/ListRow';
import Avatar from '../../components/common/Avatar';
import SectionHeader from '../../components/common/SectionHeader';
import EmptyState from '../../components/common/EmptyState';
import InlineLoading from '../../components/common/InlineLoading';
import BrandButton from '../../components/common/BrandButton';
import { useHeaderHairline } from '../../components/common/ScreenHeader';
import { FAB_OVERHANG } from '../../components/navigation/LockedBottomTabBar';
import ClassRow from '../../components/children/ClassRow';

// Keep this component type stable so filtering and background pulls preserve the input.
function ChildrenListHeader({ isMaths, isLoading, tabStats, hasClasses, searchTerm, onSearch, showClasses, onAssess, onSyncNow }) {
  const hasBanner = Boolean(describeSyncBanner(useOffline()));
  return <View>
    {!isLoading && tabStats ? <View style={styles.statBarWrapper}>
      <StatBar items={[
        { label: 'Children', value: tabStats.childrenCount, accessibilityLabel: countLabel(tabStats.childrenCount, 'child', 'children') },
        { label: 'Classes', value: tabStats.classCount, accessibilityLabel: countLabel(tabStats.classCount, 'class', 'classes') },
        ...(!isMaths ? [{
          label: 'Unassessed', value: tabStats.unassessedCount,
          onPress: tabStats.unassessedCount > 0 ? onAssess : undefined,
          accessibilityLabel: `${countLabel(tabStats.unassessedCount, 'unassessed child', 'unassessed children')}${tabStats.unassessedCount > 0 ? '. Open Assess' : ''}`,
        }] : []),
      ]} />
    </View> : null}
    {hasClasses ? <View style={styles.gutter}>
      <SearchField value={searchTerm} onChangeText={onSearch} placeholder="Search classes…" accessibilityLabel="Search classes" />
    </View> : null}
    {!isLoading && hasBanner ? <View style={styles.banner}><SyncBanner onSyncNow={onSyncNow} /></View> : null}
    {showClasses ? <SectionHeader title="Classes" style={styles.classesSection} /> : null}
  </View>;
}

export default function ChildrenListScreen({ navigation }) {
  const { isMaths, loading: subjectLoading } = useActiveProgrammeSubject();
  const { pageVersion, runVersion } = useAssessmentHistoryStatus();
  const { repositories } = useSignedInEA();
  const { assessments: assessmentsRepository, academicYears: academicYearsRepository } = repositories;

  const { user } = useAuth();
  const { all: assessableChildren } = useAssessableChildren();
  const {
    children,
    childrenGroups,
    loading,
    loadChildren: pullChildrenFromServer,
  } = useChildren();
  const {
    classes,
    schools,
    loading: classesLoading,
    classBootstrapStatus,
    incompleteOnboardingClassId,
    loadClasses: pullClassesFromServer,
    getChildrenInClass,
  } = useClasses();
  const { refreshSyncStatus, syncNow } = useOffline();

  const onScroll = useHeaderHairline(navigation);

  const [searchTerm, setSearchTerm] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [tabStats, setTabStats] = useState(null);
  // Auto-route at most once per mount: a single-class EA is sent straight into
  // their class on entry, but once that has happened (or they've reached the list
  // via Manage classes), the tab leaves them where they are.
  const hasAutoRouted = useRef(false);
  const onboardingEntered = useRef(false);

  useFocusEffect(
    useCallback(() => {
      const shouldEnterOnboarding = classBootstrapStatus === 'confirmed_empty'
        || classBootstrapStatus === 'unconfirmed_empty';
      if (incompleteOnboardingClassId && !onboardingEntered.current) {
        onboardingEntered.current = true;
        navigation.navigate('ChildOnboarding', {
          classId: incompleteOnboardingClassId,
        });
      } else if (shouldEnterOnboarding && !onboardingEntered.current) {
        onboardingEntered.current = true;
        navigation.navigate('ClassOnboarding');
      } else if (!incompleteOnboardingClassId && !shouldEnterOnboarding) {
        onboardingEntered.current = false;
      }
    }, [classBootstrapStatus, incompleteOnboardingClassId, navigation])
  );

  useFocusEffect(
    useCallback(() => {
      if (subjectLoading) return;
      let active = true;
      const loadStats = async () => {
        const [results, academicYears] = await Promise.all([
          isMaths ? [] : assessmentsRepository.getLetterResults({ userId: user.id }),
          academicYearsRepository.getAll(),
        ]);
        const activeAcademicYear = academicYears.find(year => year.is_active === true || year.is_active === 1) ?? null;
        if (!active) return;
        setTabStats(getChildrenTabStats(children, assessableChildren, classes, results, activeAcademicYear));
      };
      loadStats();
      return () => { active = false; };
    }, [isMaths, subjectLoading, children, assessableChildren, classes, user.id, pageVersion, runVersion])
  );

  // Count-aware landing: jump a single-class EA directly into that class. Keys off
  // the classes the EA actually has children in, not their programme. Waits for
  // classes to load and routes only once (see hasAutoRouted).
  useFocusEffect(
    useCallback(() => {
      if (classesLoading || hasAutoRouted.current) return;
      const classesWithChildren = classes.filter((c) => getChildrenInClass(c.id).length > 0);
      const landing = getChildrenLanding(classesWithChildren);
      if (landing.autoRoute) {
        hasAutoRouted.current = true;
        navigation.navigate('ClassDetail', { classId: landing.classId, autoRouted: true });
      }
    }, [classes, classesLoading, getChildrenInClass, navigation])
  );

  // Filter classes by search term (searches class name, school name, teacher)
  const filteredClasses = useMemo(() => {
    if (!searchTerm) return classes;
    const lower = searchTerm.toLowerCase();
    return classes.filter(cls => {
      const school = schools.find(s => s.id === cls.school_id);
      return (
        cls.name.toLowerCase().includes(lower) ||
        (school?.name || '').toLowerCase().includes(lower) ||
        cls.teacher.toLowerCase().includes(lower)
      );
    });
  }, [classes, schools, searchTerm]);

  /**
   * Count unique groups that have at least one child in this class.
   */
  const getGroupCountForClass = (classId) => {
    const classChildIds = new Set(
      getChildrenInClass(classId).map(c => c.id)
    );
    const groupIdsInClass = new Set();
    childrenGroups.forEach(cg => {
      if (classChildIds.has(cg.child_id)) {
        groupIdsInClass.add(cg.group_id);
      }
    });
    return groupIdsInClass.size;
  };

  const onRefresh = async () => {
    setRefreshing(true);
    // Pull-to-refresh is a manual gesture, so force a sync (bypass backoff) like Work History,
    // then run exactly one server pull per context. autoTrigger:false on the status refresh
    // avoids scheduling another background sync on top of the forced one.
    await syncNow({ force: true });
    await pullChildrenFromServer();
    await pullClassesFromServer();
    await refreshSyncStatus({ autoTrigger: false });
    setRefreshing(false);
  };

  const hasClasses = classes.length > 0;

  // Children with no class_id (orphaned from pre-load or class deletion)
  const unassignedChildren = useMemo(() => {
    return children.filter(c => !c.class_id);
  }, [children]);

  const isLoading = (loading || classesLoading) && classes.length === 0;
  const noMatch = Boolean(searchTerm && hasClasses && filteredClasses.length === 0);

  const renderClass = ({ item: cls, index }) => {
    const school = schools.find(s => s.id === cls.school_id);
    const roster = getChildrenInClass(cls.id);
    return <View style={[listGroupItemFrame(index, filteredClasses.length), styles.rowFrame]}>
      {index > 0 ? <ListGroupDivider inset={70} /> : null}
      <ClassRow
        name={cls.name} grade={cls.grade} teacher={cls.teacher} language={cls.home_language}
        monogram={classMonogram(cls, classes)} schoolName={school?.name || 'Unknown school'}
        childCount={roster.length} groupCount={getGroupCountForClass(cls.id)}
        rosterInitials={roster.slice(0, 3).map(c => getInitials(c.first_name, c.last_name))}
        unsynced={!cls.synced}
        onPress={() => navigation.navigate('ClassDetail', { classId: cls.id })}
      />
    </View>;
  };

  const renderEmptyState = () => {
    if (isLoading) {
      return <View style={styles.loading}><InlineLoading label="Loading classes and children…" /></View>;
    }
    if (noMatch) {
      return <View style={styles.noMatch}>
        <Ionicons name="search-outline" size={20} color={colors.textSecondary} />
        <View style={styles.message}>
          <Text accessibilityRole="header" style={styles.rowTitle}>{`No matching classes for “${searchTerm}”`}</Text>
          <Text style={styles.hint}>Searches class name, school and teacher.</Text>
        </View>
      </View>;
    }
    if (classBootstrapStatus === 'checking') {
      return <View style={styles.checking}><InlineLoading label="Checking for assigned classes…" /></View>;
    }
    if (classBootstrapStatus === 'no_active_programme') {
      return <View style={styles.emptyState}>
        <EmptyState title="Programme setup needed"
          body="Ask Head Office to assign your active programme before creating a class."
          footnote={<View style={styles.refreshNote}>
            <Ionicons name="refresh-outline" size={16} color={colors.textSecondary} />
            <Text style={styles.note}>Then pull down to refresh.</Text>
          </View>}
        />
      </View>;
    }
    return <View style={styles.emptyState}>
      <EmptyState title="No classes yet" body="Create your first class to start adding children"
        action={{ label: 'Start setup', icon: 'add', onPress: () => navigation.navigate('ClassOnboarding'), style: styles.setupAction }} />
    </View>;
  };

  const footer = isLoading ? null : <View>
    {unassignedChildren.length > 0 ? <View style={[styles.unassignedSection, noMatch && styles.unassignedAfterNoMatch]}>
      <SectionHeader title={`Unassigned children (${unassignedChildren.length})`}
        hint="These children are not in a class yet. Tap to edit and assign them." style={styles.unassignedHeading} />
      <ListGroup>{unassignedChildren.map(child => {
        const name = [child.first_name, child.last_name].filter(Boolean).join(' ');
        const meta = childMetaLine(child);
        return <ListRow key={child.id} title={name} subtitle={meta} trailing="chevron"
          lead={<Avatar size={40} label={getInitials(child.first_name, child.last_name)} />}
          accessibilityLabel={`${name}${meta ? `, ${meta}` : ''}. Not in a class. Edit to assign`}
          onPress={() => navigation.navigate('EditChild', { childId: child.id })} />;
      })}</ListGroup>
    </View> : null}
    {hasClasses ? <BrandButton variant="tertiary" icon="add" label="Add another class" style={styles.addClassLink}
      onPress={() => navigation.navigate('CreateClass')} /> : null}
  </View>;

  return <View style={styles.container}>
    <FlatList data={filteredClasses} keyExtractor={item => item.id} renderItem={renderClass}
      ListHeaderComponent={<ChildrenListHeader isMaths={isMaths || subjectLoading} isLoading={isLoading} tabStats={tabStats} hasClasses={hasClasses}
        searchTerm={searchTerm} onSearch={setSearchTerm} showClasses={filteredClasses.length > 0 || noMatch}
        onAssess={() => navigation.navigate('MainTabs', { screen: 'Assessments' })}
        onSyncNow={() => syncNow({ force: true })} />}
      ListEmptyComponent={renderEmptyState()} ListFooterComponent={footer}
      onScroll={onScroll} scrollEventThrottle={16}
      keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"
      contentContainerStyle={styles.listContent}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />}
    />
  </View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  gutter: { paddingHorizontal: 24 },
  statBarWrapper: { paddingHorizontal: 24, paddingTop: 8 },
  banner: { marginHorizontal: 24, marginTop: 12 },
  classesSection: { marginHorizontal: 24, marginTop: 18, marginBottom: 10 },
  rowFrame: { marginHorizontal: 24 },
  listContent: { paddingBottom: FAB_OVERHANG + 16 },
  loading: { paddingHorizontal: 24, marginTop: 16 },
  checking: { paddingHorizontal: 24 },
  emptyState: { paddingHorizontal: 24, marginTop: 16 },
  noMatch: { paddingHorizontal: 24, marginTop: 2, flexDirection: 'row', gap: 12 },
  message: { flex: 1 },
  rowTitle: { ...typeRoles.textRowTitle, color: colors.text },
  hint: { ...typeRoles.textCaption, color: colors.textSecondary, marginTop: 2 },
  refreshNote: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  note: { ...typeRoles.textNote, color: colors.textSecondary, flexShrink: 1 },
  setupAction: { marginTop: 12, alignSelf: 'flex-start' },
  unassignedSection: { marginHorizontal: 24, marginTop: 18 },
  unassignedAfterNoMatch: { marginTop: 28 },
  unassignedHeading: { marginBottom: 10 },
  addClassLink: { marginTop: 6, marginLeft: 20, alignSelf: 'flex-start' },
});
