import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSignedInEA } from '../../context/SignedInEAContext';
import { useNumeracyLessonDraft } from '../../hooks/useNumeracyLessonDraft';
import { useLessonExitGuard } from '../../hooks/useLessonExitGuard';
import { useHeaderHairline } from '../../components/common/ScreenHeader';
import { colors, spacing } from '../../constants/colors';
import { typeRoles } from '../../constants/typography';
import { visibleRosterChildren } from '../../utils/childVisibility';
import { groupNumber } from '../../utils/groupHelpers';
import { isStaleActorError } from '../../session/staleActor';
import { presentChildIds } from '../../db/repositories/lessonDraftsRepository';
import { swapOptions, cardReadiness } from '../../numeracy/cards';
import { lessonHeader, PROGRAMME_CHANGED_NOTE } from '../../numeracyLesson/copy';
import * as transitions from '../../numeracyLesson/numeracyDraftState';
import BrandButton from '../../components/common/BrandButton';
import InlineNote from '../../components/common/InlineNote';
import EmptyState from '../../components/common/EmptyState';
import ConfirmSheet from '../../components/common/ConfirmSheet';
import StickyActionFooter from '../../components/forms/StickyActionFooter';
import AttendanceChips from '../../components/lessons/AttendanceChips';
import AddChildSheet from '../../components/lessons/AddChildSheet';
import InProgressSheet from '../../components/lessons/InProgressSheet';
import LessonCard from '../../components/numeracy/LessonCard';
import SwapSheet from '../../components/numeracy/SwapSheet';

const markAbsent = (draft, childId) => draft.attendance.absentChildIds.includes(childId)
  ? {} : transitions.toggleAbsent(draft, childId);

export default function NumeracyLessonScreen({ navigation, route }) {
  const { handle } = useSignedInEA();
  const repositories = handle.repositories;
  const { draftId, groupId, upNextGroupId, programmeId } = route.params ?? {};
  const start = useMemo(() => draftId ? undefined : { groupId, upNextGroupId, programmeId }, [draftId, groupId, upNextGroupId, programmeId]);
  const lesson = useNumeracyLessonDraft({ draftId, start });
  const { status, draft, plan, cards, knownByChild, curriculum, inputError, retry, apply, swap, ensureDraft, discard } = lesson;
  const onScroll = useHeaderHairline(navigation);
  const [metadata, setMetadata] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [addVisible, setAddVisible] = useState(false);
  const [discardVisible, setDiscardVisible] = useState(false);
  const [swapIndex, setSwapIndex] = useState(null);
  const { leaveAction, setLeaveAction, requestExit } = useLessonExitGuard({ navigation, route, status,
    restartRoute: 'NumeracyLesson', restartParams: { groupId, upNextGroupId, programmeId } });
  const childKey = JSON.stringify(draft?.attendance.childIds ?? []);
  const error = lesson.error && lesson.error !== inputError
    ? typeof lesson.error === 'string' ? lesson.error : lesson.error.message : actionError;
  useFocusEffect(useCallback(() => {
    let active = true;
    if (!draft || ['corrupt', 'missing', 'closed', 'exists', 'empty'].includes(status)) return undefined;
    const load = async () => {
      try {
        const childIds = JSON.parse(childKey);
        const [childrenById, authority, classes, roster, group] = await Promise.all([
          repositories.children.getChildrenByIds(childIds),
          repositories.children.getWriteAuthority({ userId: handle.userId, childIds }),
          repositories.classes.getClasses(), repositories.children.getMyChildren(handle.userId),
          repositories.groups.getGroups({ userId: handle.userId, programmeId: draft.programme_id }),
        ]);
        if (!active || !handle.isCurrent()) return;
        // A resumed draft pins its class even after that class leaves the active list.
        const pinnedClass = draft.class_id && !classes.some(row => row.id === draft.class_id)
          ? await repositories.classes.getClassById(draft.class_id)
          : null;
        if (active && handle.isCurrent()) setMetadata({
          childrenById, authority, group: group.find(row => row.id === draft.group_id), classes: pinnedClass ? [...classes, pinnedClass] : classes,
          roster: visibleRosterChildren(roster),
        });
      } catch (caught) { if (active && !isStaleActorError(caught)) setActionError(caught.message); }
    };
    void load();
    return () => { active = false; };
    // Attendance changes keep the same participant names and authority; additions reload in one batch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handle, repositories, childKey, draft?.group_id, draft?.class_id]));

  const participants = useMemo(() => draft?.attendance.childIds.map(id => metadata?.childrenById[id] ?? { id }) ?? [],
    [childKey, metadata]);
  const names = participants.map(child => child.first_name).filter(Boolean).join(' & ');
  useEffect(() => { if (names) navigation.setOptions({ title: names }); }, [navigation, names]);
  const attempt = useCallback(action => {
    setActionError(null);
    void action().then(() => setActionError(null), caught => {
      // Repository write failures already have the controller's recoverable error.
      if (!isStaleActorError(caught) && !handle.services.lessonDraft.getSnapshot().error) setActionError(caught.message);
    });
  }, [handle]);
  const toggleAttendance = id => attempt(() => apply(transitions.toggleAbsent, id));
  const remove = id => attempt(() => apply(markAbsent, id));
  const wrapUp = () => attempt(async () => {
    const row = await ensureDraft();
    navigation.navigate('NumeracyWrapUp', { draftId: row.id });
  });
  // Teaching starts here: save and freeze the cards first, so new maths data cannot change
  // what Wrap up records as taught while the EA is reading the instructions.
  const openHowToTeach = card => attempt(async () => {
    await ensureDraft();
    navigation.navigate('HowToTeach', { stepKey: card.step_key, activity: card.activity });
  });
  const discardAndExit = restart => attempt(async () => {
    await discard();
    setDiscardVisible(false);
    requestExit(restart ? 'restart' : 'back');
  });
  const present = draft ? presentChildIds(draft.attendance) : [];
  const childNames = Object.fromEntries(participants.map(child => [child.id, child.first_name]));
  const selected = swapIndex === null ? null : cards[swapIndex];
  const options = swapIndex !== null && knownByChild ? swapOptions({ curriculum, presentChildIds: present, knownByChild,
    slot: selected?.slot ?? 'activity', takenStepKeys: cards.filter((_, index) => index !== swapIndex).map(card => card.step_key) }) : [];
  const confirmDiscard = <ConfirmSheet visible={discardVisible} title="Discard this lesson?"
    body="Its ticks and notes will be deleted." confirmLabel="Discard lesson" cancelLabel="Keep lesson"
    onConfirm={() => discardAndExit(false)} onCancel={() => setDiscardVisible(false)} />;
  const suggestionsStatus = inputError ? <View>
    <InlineNote>Couldn't load this lesson's suggestions.</InlineNote>
    <BrandButton label="Try again" variant="tertiary" onPress={retry} />
  </View> : !plan || !metadata ? <ActivityIndicator color={colors.primary} /> : null;
  if (status === 'wrong_programme') return <View style={styles.empty}><InlineNote>{PROGRAMME_CHANGED_NOTE}</InlineNote></View>;
  if (status === 'exists') return <InProgressSheet visible onDismiss={navigation.goBack}
    onResume={() => navigation.replace('NumeracyLesson', { draftId: lesson.existingDraftId })}
    onDiscard={() => discardAndExit(true)} error={actionError} />;
  if (status === 'corrupt') return <View style={styles.empty}>
    <EmptyState title="This lesson can't be opened" action={{ label: 'Discard lesson', onPress: () => setDiscardVisible(true) }} />
    {confirmDiscard}
  </View>;
  return <View style={styles.screen}>
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content} onScroll={onScroll} scrollEventThrottle={16}>
      {error ? <InlineNote>{error}</InlineNote> : null}
      {draft && metadata ? <>
        <AttendanceChips children={participants} attendance={draft.attendance} authority={metadata.authority}
          onToggle={toggleAttendance} onRemove={remove} />
        <BrandButton label="+ Add a child" variant="tertiary" onPress={() => setAddVisible(true)} />
        {suggestionsStatus}
        {plan ? <>
          {metadata.group ? <Text style={styles.heading}>{lessonHeader({ groupNumber: groupNumber(metadata.group) ?? metadata.group.name,
            minutes: cards.reduce((sum, card) => sum + card.minutes, 0) })}</Text> : null}
          {plan.reason === 'incomplete_inputs' ? <InlineNote tone="warning">Still downloading what children know. Suggestions may repeat.</InlineNote> : null}
          {cards.map((card, index) => <LessonCard key={index} card={card} curriculum={curriculum} names={childNames}
            onOpen={() => openHowToTeach(card)}
            onSwap={() => setSwapIndex(index)} />)}
          {!cards.some(card => card.slot === 'activity') ? <>
            <Text style={styles.body}>This group knows every step that's ready. Use Swap to choose a step.</Text>
            <BrandButton label="Choose a step" onPress={() => setSwapIndex(cards.length)} />
          </> : null}
        </> : null}
        {draft.id ? <BrandButton label="Discard lesson" variant="tertiary" onPress={() => setDiscardVisible(true)} /> : null}
      </> : suggestionsStatus}
    </ScrollView>
    <StickyActionFooter><BrandButton label="Wrap up →" onPress={wrapUp}
      disabled={!draft || !plan || !metadata || present.length === 0 || status === 'saving'} /></StickyActionFooter>
    <AddChildSheet visible={addVisible} onDismiss={() => setAddVisible(false)} error={error}
      classes={metadata?.classes ?? []}
      children={metadata?.roster.filter(child => !draft?.attendance.childIds.includes(child.id)) ?? []}
      onAdd={id => apply(transitions.addChildForToday, id)} />
    <SwapSheet visible={swapIndex !== null} onDismiss={() => setSwapIndex(null)} options={options}
      currentStepKey={selected?.step_key} curriculum={curriculum}
      readinessFor={stepKey => cardReadiness({ curriculum, presentChildIds: present, knownByChild, stepKey })}
      onPick={stepKey => attempt(async () => { await swap(swapIndex, stepKey); setSwapIndex(null); })} />
    {confirmDiscard}
    <ConfirmSheet visible={leaveAction !== null} title="Leave this lesson?"
      body="It's saved on this phone. You can finish it later from Home." confirmLabel="Leave lesson"
      confirmVariant="secondary" cancelLabel="Keep teaching" onCancel={() => setLeaveAction(null)}
      onConfirm={() => { const action = leaveAction; setLeaveAction(null); if (action) navigation.dispatch(action); }} />
  </View>;
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  scroll: { flex: 1 },
  empty: { flex: 1, backgroundColor: colors.background, padding: spacing.lg },
  content: { padding: spacing.lg, gap: spacing.lg },
  heading: { ...typeRoles.displayHeading, color: colors.text },
  body: { ...typeRoles.textBody, color: colors.text },
});
