import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, usePreventRemove } from '@react-navigation/native';
import { useSignedInEA } from '../../context/SignedInEAContext';
import { useLessonDraft } from '../../hooks/useLessonDraft';
import { useProgrammeTodayKey } from '../../hooks/useProgrammeTodayKey';
import { useHeaderHairline } from '../../components/common/ScreenHeader';
import { colors, spacing } from '../../constants/colors';
import { typeRoles } from '../../constants/typography';
import { LANGUAGE_LABELS } from '../../utils/assessmentRegistry';
import { lastSeenLabel } from '../../utils/lessonDates';
import { groupLastSeenOn } from '../../lessonPlan/engine';
import { isStaleActorError } from '../../session/staleActor';
import * as transitions from '../../lessonPlan/lessonDraftState';
import BrandButton from '../../components/common/BrandButton';
import InlineNote from '../../components/common/InlineNote';
import EmptyState from '../../components/common/EmptyState';
import ConfirmSheet from '../../components/common/ConfirmSheet';
import StickyActionFooter from '../../components/forms/StickyActionFooter';
import AttendanceChips from '../../components/lessons/AttendanceChips';
import AddChildSheet from '../../components/lessons/AddChildSheet';
import LessonLettersSection from '../../components/lessons/LessonLettersSection';
import OtherLetterSheet from '../../components/lessons/OtherLetterSheet';
import LessonChoiceSheet from '../../components/lessons/LessonChoiceSheet';
import InProgressSheet from '../../components/lessons/InProgressSheet';

const markAbsent = (draft, childId) => draft.attendance.absentChildIds.includes(childId)
  ? {} : transitions.toggleAbsent(draft, childId);

export default function LessonScreen({ navigation, route }) {
  const { handle } = useSignedInEA();
  const repositories = handle.repositories;
  const { draftId, groupId, upNextGroupId } = route.params ?? {};
  const start = useMemo(() => draftId ? undefined : { groupId, upNextGroupId }, [draftId, groupId, upNextGroupId]);
  const lesson = useLessonDraft({ draftId, start });
  const { status, draft, plan, choices, needs, lessonInput, apply, ensureDraft, discard } = lesson;
  const today = useProgrammeTodayKey();
  const onScroll = useHeaderHairline(navigation);
  const [metadata, setMetadata] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [addVisible, setAddVisible] = useState(false);
  const [otherVisible, setOtherVisible] = useState(false);
  const [discardVisible, setDiscardVisible] = useState(false);
  const [leaveAction, setLeaveAction] = useState(null);
  const [pendingExit, setPendingExit] = useState(null);
  const childKey = JSON.stringify(draft?.attendance.childIds ?? []);
  const error = typeof lesson.error === 'string' ? lesson.error : lesson.error?.message ?? actionError;

  usePreventRemove(status === 'ready', ({ data }) => setLeaveAction(data.action));
  // These actions run after the committed empty render has released usePreventRemove.
  useEffect(() => {
    if (status === 'missing') navigation.goBack();
    if (status !== 'empty' || !pendingExit) return;
    setPendingExit(null);
    if (pendingExit === 'back') navigation.goBack();
    else navigation.replace('Lesson', { groupId, upNextGroupId });
  }, [status, pendingExit, navigation, groupId, upNextGroupId]);

  useFocusEffect(useCallback(() => {
    let active = true;
    if (!draft || ['corrupt', 'missing', 'closed', 'exists', 'empty'].includes(status)) return undefined;
    const load = async () => {
      try {
        const childIds = JSON.parse(childKey);
        const [childrenById, authority, classes, roster] = await Promise.all([
          repositories.children.getChildrenByIds(childIds),
          repositories.children.getWriteAuthority({ userId: handle.userId, childIds }),
          repositories.classes.getClasses(), repositories.children.getMyChildren(handle.userId),
        ]);
        if (!active || !handle.isCurrent()) return;
        // A resumed draft pins its class even after that class leaves the active list.
        const pinnedClass = draft.class_id && !classes.some(row => row.id === draft.class_id)
          ? await repositories.classes.getClassById(draft.class_id)
          : null;
        if (active && handle.isCurrent()) setMetadata({
          childrenById, authority, classes: pinnedClass ? [...classes, pinnedClass] : classes, roster,
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
  const toggleAttendance = useCallback(id => attempt(() => apply(transitions.toggleAbsent, id)), [attempt, apply]);
  const remove = useCallback(id => attempt(() => apply(markAbsent, id)), [attempt, apply]);
  const toggleLetter = useCallback(letter => attempt(() => apply(transitions.toggleTick, 'letters', letter)), [attempt, apply]);
  const wrapUp = () => attempt(async () => {
    const row = await ensureDraft();
    navigation.navigate('LessonWrapUp', { draftId: row.id });
  });
  const discardAndExit = restart => attempt(async () => {
    await discard();
    setDiscardVisible(false);
    setPendingExit(restart ? 'restart' : 'back');
  });
  const chooseClass = id => attempt(() => apply(transitions.chooseClass, { classId: id }));
  const chooseLanguage = languageCode => attempt(() => apply(transitions.chooseLanguage, { languageCode }));
  const childrenClasses = new Set(participants.map(child => child.class_id).filter(Boolean));
  const classOptions = metadata?.classes.filter(row => childrenClasses.has(row.id)) ?? [];
  const lessonClass = metadata?.classes.find(row => row.id === draft?.class_id);
  const originalIds = draft?.attendance.childIds.filter(id => !draft.attendance.addedChildIds.includes(id)) ?? [];
  const seen = lessonInput ? groupLastSeenOn({ today, academicYearStart: lessonInput.academicYearStart,
    programmeId: lessonInput.programmeId, sessions: lessonInput.sessions, memberIds: originalIds }) : null;
  const grade = lessonClass?.grade?.replace(/^Grade\s*/i, '');
  const presentCount = draft ? draft.attendance.childIds.length - draft.attendance.absentChildIds.length : 0;
  const confirmDiscard = <ConfirmSheet visible={discardVisible} title="Discard this lesson?"
    body="Its ticks and notes will be deleted." confirmLabel="Discard lesson" cancelLabel="Keep lesson"
    onConfirm={() => discardAndExit(false)} onCancel={() => setDiscardVisible(false)} />;

  if (status === 'exists') return <InProgressSheet visible onDismiss={navigation.goBack}
    onResume={() => navigation.replace('Lesson', { draftId: lesson.existingDraftId })}
    onDiscard={() => discardAndExit(true)} error={actionError} />;
  if (status === 'corrupt') return <View style={styles.empty}>
    <EmptyState title="This lesson can't be opened" action={{ label: 'Discard lesson', onPress: () => setDiscardVisible(true) }} />
    {confirmDiscard}
  </View>;
  return <View style={styles.screen}>
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content} onScroll={onScroll} scrollEventThrottle={16}>
      {error ? <InlineNote>{error}</InlineNote> : null}
      {draft && metadata ? <>
        {draft.class_id && draft.language_code ? <Text style={styles.detail}>
          {`${grade ? `Gr ${grade} · ` : ''}${LANGUAGE_LABELS[draft.language_code]} · last seen ${lastSeenLabel(seen, today)}`}
        </Text> : null}
        <AttendanceChips children={participants} attendance={draft.attendance} authority={metadata.authority}
          onToggle={toggleAttendance} onRemove={remove} />
        <BrandButton label="+ Add a child" variant="tertiary" onPress={() => setAddVisible(true)} />
        {!needs && plan && choices ? <>
          {!plan.history_complete ? <InlineNote tone="warning">Still downloading past lessons. Suggestions may repeat.</InlineNote> : null}
          {!plan.mastery_complete ? <InlineNote tone="warning">Still downloading what children know. Suggestions may repeat.</InlineNote> : null}
          <LessonLettersSection draft={draft} plan={plan} choices={choices} onToggle={toggleLetter} onOther={() => setOtherVisible(true)} />
        </> : null}
        {draft.id ? <BrandButton label="Discard lesson" variant="tertiary" onPress={() => setDiscardVisible(true)} /> : null}
      </> : <ActivityIndicator color={colors.primary} />}
    </ScrollView>
    <StickyActionFooter><BrandButton label="Wrap up →" onPress={wrapUp}
      disabled={!draft || !!needs || !plan || !choices || !metadata || presentCount === 0 || status === 'saving'} /></StickyActionFooter>
    <AddChildSheet visible={addVisible} onDismiss={() => setAddVisible(false)} error={error}
      children={metadata?.roster.filter(child => !draft?.attendance.childIds.includes(child.id)) ?? []}
      onAdd={id => apply(transitions.addChildForToday, id)} />
    <OtherLetterSheet visible={otherVisible} onDismiss={() => setOtherVisible(false)} error={error}
      letters={choices?.letterChoices ?? []} selected={draft?.ticks.letters ?? []} onToggle={toggleLetter} />
    <LessonChoiceSheet needs={draft && metadata ? needs : null} classes={classOptions}
      onDismiss={navigation.goBack} onChooseClass={chooseClass} onChooseLanguage={chooseLanguage} error={error} />
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
  content: { padding: spacing.lg, gap: spacing.lg },
  detail: { ...typeRoles.textBody, color: colors.textSecondary },
  empty: { flex: 1, backgroundColor: colors.background, padding: spacing.lg },
});
