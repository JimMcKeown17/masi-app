import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSignedInEA } from '../../context/SignedInEAContext';
import { useChildren } from '../../context/ChildrenContext';
import { useSessionHistoryStatus } from '../../services/sessionHistoryStatus';
import { useProgrammeTodayKey } from '../../hooks/useProgrammeTodayKey';
import { useScrollBottomPadding } from '../../hooks/useScrollBottomPadding';
import { loadLessonBase, loadPickerModel } from '../../lessonPlan/inputs/lessonInputs';
import { isStaleActorError } from '../../session/staleActor';
import { colors, spacing } from '../../constants/colors';
import { typeRoles } from '../../constants/typography';
import { useHeaderHairline } from '../../components/common/ScreenHeader';
import ListRow from '../../components/common/ListRow';
import ListGroup from '../../components/common/ListGroup';
import SectionHeader from '../../components/common/SectionHeader';
import BrandButton from '../../components/common/BrandButton';
import InlineNote from '../../components/common/InlineNote';
import EmptyState from '../../components/common/EmptyState';
import NoActiveProgrammeNotice from '../../components/common/NoActiveProgrammeNotice';
import UpNextCard from '../../components/lessons/UpNextCard';
import GroupLessonRow from '../../components/lessons/GroupLessonRow';
import MakeGroupSheet from '../../components/lessons/MakeGroupSheet';
import PutInGroupSheet from '../../components/lessons/PutInGroupSheet';

const itemKey = item => item.key;
const UngroupedChildRow = React.memo(function UngroupedChildRow({ child, onPut }) {
  const put = useCallback(() => onPut(child.id), [onPut, child.id]);
  return <View style={styles.childRow}>
    <Text style={styles.childName}>{child.first_name}</Text>
    <BrandButton label="Put in a group" variant="tertiary" size="sm" onPress={put} />
  </View>;
});
export default function LessonPickerScreen({ navigation }) {
  const { handle } = useSignedInEA();
  const { repositories, services } = handle;
  const { children, groups, childrenGroups, getChildrenInGroup, makeGroup, addChildToGroup } = useChildren();
  const { pageVersion, runVersion } = useSessionHistoryStatus();
  const today = useProgrammeTodayKey();
  const bottomPadding = useScrollBottomPadding();
  const onScroll = useHeaderHairline(navigation);
  const [model, setModel] = useState(null);
  const [error, setError] = useState(null);
  const [missing, setMissing] = useState(null);
  const [makingGroup, setMakingGroup] = useState(false);
  const [putChildId, setPutChildId] = useState(null);

  useFocusEffect(useCallback(() => {
    let active = true;
    const load = async () => {
      try {
        const draft = await repositories.lessonDrafts.getActive();
        if (!active || !handle.isCurrent()) return;
        if (draft) { navigation.replace('Lesson', { draftId: draft.id }); return; }
        const base = await loadLessonBase({ handle, repositories, today });
        if (!active || !handle.isCurrent()) return;
        // Without a programme or school year there is nothing to rank; say so rather than spin.
        if (base.missing) { setMissing(base.missing); setModel(null); setError(null); return; }
        const picker = await loadPickerModel({ handle, repositories, services, base, groups,
          getChildrenInGroup, children, childrenGroups });
        if (active && handle.isCurrent()) { setModel(picker); setError(null); setMissing(null); }
      } catch (caught) {
        if (!active || !handle.isCurrent() || isStaleActorError(caught)) return;
        if (caught.name === 'LessonDraftCorruptError') navigation.replace('Lesson', { draftId: caught.draftId });
        else setError(caught.message);
      }
    };
    void load();
    return () => { active = false; };
  }, [handle, repositories, services, navigation, today, groups, getChildrenInGroup,
    children, childrenGroups, pageVersion, runVersion]));

  const start = useCallback(groupId => navigation.navigate('Lesson', {
    groupId, upNextGroupId: model.upNextGroupId,
  }), [navigation, model?.upNextGroupId]);
  const openMakeGroup = useCallback(() => setMakingGroup(true), []);
  const closeMakeGroup = useCallback(() => setMakingGroup(false), []);
  const closePutGroup = useCallback(() => setPutChildId(null), []);
  const upNext = model?.rows.find(row => row.groupId === model.upNextGroupId);
  const rows = useMemo(() => {
    if (!model || children.length === 0) return [];
    const other = model.rows.filter(row => row.groupId !== model.upNextGroupId);
    return [
      ...(other.length ? [{ key: 'other', kind: 'heading', title: 'Other groups' },
        ...other.map((row, index) => ({ key: row.groupId, kind: 'group', row, index, count: other.length, showDivider: index < other.length - 1 }))] : []),
      { key: 'make', kind: 'make' },
      ...(model.ungrouped.length ? [{ key: 'ungrouped', kind: 'heading', title: 'Not in a group yet' },
        ...model.ungrouped.map(child => ({ key: `child-${child.id}`, kind: 'child', child }))] : []),
    ];
  }, [model, children.length]);
  const renderItem = useCallback(({ item }) => {
    if (item.kind === 'heading') return <SectionHeader title={item.title} style={styles.section} />;
    if (item.kind === 'group') return <GroupLessonRow row={item.row} today={today}
      onStart={start} showDivider={item.showDivider} index={item.index} count={item.count} />;
    if (item.kind === 'make') return <ListGroup style={styles.makeGroup}>
      <ListRow title="+ Make a group" onPress={openMakeGroup} />
    </ListGroup>;
    return <UngroupedChildRow child={item.child} onPut={setPutChildId} />;
  }, [today, start, openMakeGroup]);

  if (missing === 'programme') return <View style={styles.screen}>
    <NoActiveProgrammeNotice action="start lessons" />
  </View>;
  return <View style={styles.screen}>
    <FlatList data={rows} keyExtractor={itemKey} renderItem={renderItem} onScroll={onScroll} scrollEventThrottle={16}
      contentContainerStyle={[styles.content, { paddingBottom: bottomPadding }]}
      ListHeaderComponent={<View style={styles.header}>
        {error ? <InlineNote>{error}</InlineNote> : null}
        {missing === 'academic_year' ? <InlineNote>The school year hasn't downloaded yet. Connect to the internet, then open this again.</InlineNote> : null}
        {!model && !error && !missing ? <ActivityIndicator color={colors.primary} /> : null}
        {model && !model.historyComplete ? <InlineNote tone="warning">Still downloading past lessons. Suggestions may repeat.</InlineNote> : null}
        {upNext ? <UpNextCard row={upNext} today={today} onStart={start} /> : null}
      </View>}
      ListEmptyComponent={model && children.length === 0 ? <EmptyState title="No children yet"
        body="Add children to a class to start lessons." /> : null} />
    <MakeGroupSheet visible={makingGroup} onDismiss={closeMakeGroup} ungrouped={model?.ungrouped ?? []}
      makeGroup={makeGroup} handle={handle} />
    <PutInGroupSheet visible={putChildId !== null} onDismiss={closePutGroup} childId={putChildId}
      groups={groups} addChildToGroup={addChildToGroup} makeGroup={makeGroup} handle={handle} />
  </View>;
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  header: { gap: spacing.md },
  section: { marginTop: spacing.lg },
  makeGroup: { marginTop: spacing.md },
  childRow: { minHeight: 64, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center',
    gap: spacing.ms, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  childName: { ...typeRoles.textRowTitle, color: colors.text, flexGrow: 1, flexShrink: 1 },
});
