import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSignedInEA } from '../../context/SignedInEAContext';
import { useChildren } from '../../context/ChildrenContext';
import { useClasses } from '../../context/ClassesContext';
import { compareChildNames, formatChildName } from '../../utils/childNames';
import { useSessionHistoryStatus } from '../../services/sessionHistoryStatus';
import { useProgrammeTodayKey } from '../../hooks/useProgrammeTodayKey';
import { useScrollBottomPadding } from '../../hooks/useScrollBottomPadding';
import { loadLessonBase, loadPickerRanking, loadPickerLetters } from '../../lessonPlan/inputs/lessonInputs';
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

import { confirmNumeracyProgramme } from '../../services/numeracyProgramme';
import { loadNumeracyPickerNext } from '../../numeracyLesson/inputs/numeracyPicker';
import { PROGRAMME_CHANGED_NOTE } from '../../numeracyLesson/copy';
import { lessonRouteForDraft } from '../../utils/lessonDraftRoutes';
import ConfirmSheet from '../../components/common/ConfirmSheet';

const itemKey = item => item.key;
const UngroupedChildRow = React.memo(function UngroupedChildRow({ child, className, onPut }) {
  const put = useCallback(() => onPut(child.id), [onPut, child.id]);
  return <View style={styles.childRow}>
    <View style={styles.childDetails}>
      <Text style={styles.childName}>{formatChildName(child)}</Text>
      {className ? <Text style={styles.childClass}>{className}</Text> : null}
    </View>
    <BrandButton label="Put in a group" variant="tertiary" size="sm" onPress={put} />
  </View>;
});
export default function LessonPickerScreen({ navigation, kind = 'literacy' }) {
  const { handle } = useSignedInEA();
  const { repositories, services } = handle;
  const { children, groups, childrenGroups, getChildrenInGroup, makeGroup, addChildToGroup } = useChildren();
  const { classes = [] } = useClasses();
  const sortedMembers = useCallback(id => [...getChildrenInGroup(id)].sort(compareChildNames), [getChildrenInGroup]);
  const { pageVersion, runVersion } = useSessionHistoryStatus();
  const today = useProgrammeTodayKey();
  const bottomPadding = useScrollBottomPadding();
  const onScroll = useHeaderHairline(navigation);
  const [model, setModel] = useState(null);
  const [error, setError] = useState(null);
  const [missing, setMissing] = useState(null);
  const [makingGroup, setMakingGroup] = useState(false);
  const [putChildId, setPutChildId] = useState(null);

  const [leftover, setLeftover] = useState(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [reload, setReload] = useState(0);
  const [programmeId, setProgrammeId] = useState(null);
  useFocusEffect(useCallback(() => {
    let active = true;
    const routeDraft = draft => {
      if (draft.kind === kind) navigation.replace(lessonRouteForDraft(draft), { draftId: draft.id });
      else { setLeftover(draft); setModel(null); setError(null); setMissing(null); }
    };
    const load = async () => {
      try {
        // A refresh keeps the current rows on screen until the new read lands, as literacy does.
        let base;
        if (kind === 'numeracy') {
          const confirmed = await confirmNumeracyProgramme({ handle, userId: handle.userId });
          if (!active || !handle.isCurrent()) return;
          setProgrammeId(confirmed);
          if (!confirmed) { setLeftover(null); setModel(null); setMissing(null); setError(PROGRAMME_CHANGED_NOTE); return; }
          base = await loadLessonBase({ handle, repositories, today, programmeId: confirmed });
        }
        const picker = await loadPickerRanking({ handle, repositories, base, today, groups,
          getChildrenInGroup: sortedMembers, children, childrenGroups });
        if (!active || !handle.isCurrent()) return;
        if (picker.draftId) { routeDraft({ id: picker.draftId, kind: picker.draftKind }); return; }
        setLeftover(null);
        if (picker.missing) { setMissing(picker.missing); setModel(null); setError(null); return; }
        setModel(picker); setError(null); setMissing(null);
        if (kind === 'numeracy') {
          const next = await loadNumeracyPickerNext({ handle, repositories, services, base: picker.base, ranking: picker });
          if (!active || !handle.isCurrent()) return;
          setModel({ ...picker, historyComplete: next.historyComplete,
            rows: picker.rows.map(row => ({ ...row, nextSteps: next.nextByGroup[row.groupId] })) });
          return;
        }
        const letters = await loadPickerLetters({ handle, repositories, services, base: picker.base, ranking: picker });
        if (!active || !handle.isCurrent()) return;
        setModel({ ...picker, historyComplete: letters.historyComplete,
          rows: picker.rows.map(row => ({ ...row, ...letters.lettersByGroup[row.groupId] })) });
      } catch (caught) {
        if (!active || !handle.isCurrent() || isStaleActorError(caught)) return;
        if (caught.name === 'LessonDraftCorruptError') routeDraft({ id: caught.draftId, kind: caught.kind });
        else setError(caught.message);
      }
    };
    void load();
    return () => { active = false; };
  }, [handle, repositories, services, navigation, today, groups, sortedMembers,
    children, childrenGroups, pageVersion, runVersion, kind, reload]));

  const start = useCallback(groupId => navigation.navigate(kind === 'numeracy' ? 'NumeracyLesson' : 'Lesson', {
    groupId, upNextGroupId: model.upNextGroupId,
    ...(kind === 'numeracy' ? { programmeId } : {}),
  }), [navigation, model?.upNextGroupId, kind, programmeId]);
  const discard = async () => {
    setConfirmDiscard(false);
    try {
      await services.lessonDraft.open({ draftId: leftover.id });
      await services.lessonDraft.discard();
      if (handle.isCurrent()) setReload(value => value + 1);
    } catch (caught) {
      if (handle.isCurrent() && !isStaleActorError(caught)) setError(caught.message);
    }
  };
  const leftoverSubject = leftover?.kind === 'numeracy' ? 'numeracy' : 'reading';
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
        ...[...model.ungrouped].sort(compareChildNames).map(child => ({ key: `child-${child.id}`, kind: 'child', child }))] : []),
    ];
  }, [model, children.length]);
  const renderItem = useCallback(({ item }) => {
    if (item.kind === 'heading') return <SectionHeader title={item.title} style={styles.section} />;
    if (item.kind === 'group') return <GroupLessonRow row={item.row} today={today}
      onStart={start} showDivider={item.showDivider} index={item.index} count={item.count} />;
    if (item.kind === 'make') return <ListGroup style={styles.makeGroup}>
      <ListRow title="+ Make a group" onPress={openMakeGroup} />
    </ListGroup>;
    return <UngroupedChildRow child={item.child} className={classes.find(row => row.id === item.child.class_id)?.name} onPut={setPutChildId} />;
  }, [today, start, openMakeGroup, classes]);

  if (missing === 'programme') return <View style={styles.screen}>
    <NoActiveProgrammeNotice action="start lessons" />
  </View>;
  return <View style={styles.screen}>
    <FlatList data={rows} keyExtractor={itemKey} renderItem={renderItem} onScroll={onScroll} scrollEventThrottle={16}
      contentContainerStyle={[styles.content, { paddingBottom: bottomPadding }]}
      ListHeaderComponent={<View style={styles.header}>
        {error ? <InlineNote>{error}</InlineNote> : null}
        {missing === 'academic_year' ? <InlineNote>The school year hasn't downloaded yet. Connect to the internet, then open this again.</InlineNote> : null}
        {leftover ? <>
          <InlineNote>{`An older ${leftoverSubject} lesson is still open. It can't be saved now.`}</InlineNote>
          <BrandButton label="Discard it" onPress={() => setConfirmDiscard(true)} />
        </> : null}
        {!model && !error && !missing && !leftover ? <ActivityIndicator color={colors.primary} /> : null}
        {model && model.historyComplete === false ? <InlineNote tone="warning">Still downloading past lessons. Suggestions may repeat.</InlineNote> : null}
        {upNext ? <UpNextCard row={upNext} today={today} onStart={start} /> : null}
      </View>}
      ListEmptyComponent={model && children.length === 0 ? <EmptyState title="No children yet"
        body="Add children to a class to start lessons." /> : null} />
    <ConfirmSheet visible={confirmDiscard} title={`Discard the ${leftoverSubject} lesson?`}
      body="Its ticks and notes will be deleted." confirmLabel="Discard" cancelLabel="Keep lesson" onConfirm={discard} onCancel={() => setConfirmDiscard(false)} />
    <MakeGroupSheet visible={makingGroup} onDismiss={closeMakeGroup} ungrouped={model?.ungrouped ?? []}
      classes={classes} makeGroup={makeGroup} handle={handle} />
    <PutInGroupSheet visible={putChildId !== null} onDismiss={closePutGroup} childId={putChildId}
      groups={groups} getChildrenInGroup={sortedMembers} addChildToGroup={addChildToGroup} makeGroup={makeGroup} handle={handle} />
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
  childDetails: { flexGrow: 1, flexShrink: 1 },
  childName: { ...typeRoles.textRowTitle, color: colors.text },
  childClass: { ...typeRoles.textCaption, color: colors.textSecondary },
});
