import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSignedInEA } from '../../context/SignedInEAContext';
import { useAuth } from '../../context/AuthContext';
import { useChildren } from '../../context/ChildrenContext';
import { useOffline } from '../../context/OfflineContext';
import { useLookupsContext } from '../../context/LookupsContext';
import { useLessonDraft } from '../../hooks/useLessonDraft';
import { useProgrammeTodayKey } from '../../hooks/useProgrammeTodayKey';
import { useHeaderHairline } from '../../components/common/ScreenHeader';
import { presentChildIds } from '../../db/repositories/lessonDraftsRepository';
import { LessonDraftWriteError } from '../../services/lessonDraftController';
import { saveLesson } from '../../services/lessonSave';
import * as transitions from '../../lessonPlan/lessonDraftState';
import { deriveSessionReadingLevel } from '../../lessonPlan/engine';
import { loadMasteryState } from '../../utils/masteryState';
import { PEDAGOGICAL_ORDERS } from '../../utils/assessmentRegistry';
import { startedLabel } from '../../utils/lessonDates';
import { buildSessionCompleteParams } from '../../utils/sessionCompleteView';
import { buildSessionTypeFields } from '../../utils/sessionTypeResolver';
import { isStaleActorError } from '../../session/staleActor';
import { colors, spacing } from '../../constants/colors';
import { typeRoles } from '../../constants/typography';
import { READING_LEVEL_OPTIONS } from '../../constants/literacyConstants';
import { NO_TEXT_SUGGESTIONS } from '../../constants/textInputProps';
import WrapUpChildRow from '../../components/lessons/WrapUpChildRow';
import LetterTrackerBottomSheet from '../../components/session/LetterTrackerBottomSheet';
import SelectField from '../../components/common/SelectField';
import SelectSheet from '../../components/common/SelectSheet';
import MonthCalendar from '../../components/common/MonthCalendar';
import BottomSheet from '../../components/common/BottomSheet';
import TextField from '../../components/common/TextField';
import BrandButton from '../../components/common/BrandButton';
import InlineNote from '../../components/common/InlineNote';
import ConfirmSheet from '../../components/common/ConfirmSheet';
import StickyActionFooter from '../../components/forms/StickyActionFooter';

const toggleMark = (draft, childId, letter, change) => {
  const changes = { ...draft.tracker_changes[childId] };
  if (changes[letter]) delete changes[letter];
  else changes[letter] = change;
  return transitions.setTrackerChanges(draft, childId, changes);
};
const errorMessage = (error, names) => {
  switch (error.code) {
    case 'GROUP_MISSING': return 'This group is no longer on this phone. Discard this lesson to start again.';
    case 'CHILD_NOT_WRITABLE': return `${names.join(' & ')} ${names.length === 1 ? 'is' : 'are'} no longer one of your children. Go back and remove them from the lesson.`;
    case 'CHANGES_NOT_WRITABLE': return `You can't update ${names.join(' & ')}'s letters or reading level any more.`;
    case 'PROGRAMME_NOT_ACTIVE': return "This lesson is for a programme you're no longer assigned to. Discard it to start again.";
    case 'ALREADY_SAVED': return 'This lesson was already saved.';
    default: return error instanceof LessonDraftWriteError
      ? "Couldn't save your last change. Check the lesson and press Save again."
      : "Couldn't save the lesson. Try again.";
  }
};

export default function LessonWrapUpScreen({ navigation, route }) {
  const { handle } = useSignedInEA();
  const repositories = handle.repositories;
  const { profile } = useAuth();
  const { jobTitles } = useLookupsContext();
  const { refreshFromCache } = useChildren();
  const { triggerBackgroundSync, refreshSyncStatus } = useOffline();
  const lesson = useLessonDraft({ draftId: route.params.draftId });
  const { draft, apply, beginSave, endSave } = lesson;
  const today = useProgrammeTodayKey();
  const onScroll = useHeaderHairline(navigation);
  const [metadata, setMetadata] = useState(null);
  const [dateVisible, setDateVisible] = useState(false);
  const [trackerId, setTrackerId] = useState(null);
  const [levelId, setLevelId] = useState(null);
  const [emptyConfirm, setEmptyConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [completion, setCompletion] = useState(null);
  const savingRef = useRef(false);
  const active = useRef(true);
  useEffect(() => () => { active.current = false; }, []);
  const childKey = JSON.stringify(draft ? presentChildIds(draft.attendance) : []);
  const languageCode = draft?.language_code;
  const languageOrder = PEDAGOGICAL_ORDERS[languageCode];
  useFocusEffect(useCallback(() => {
    let current = true;
    if (!draft) return undefined;
    const load = async () => {
      const childIds = JSON.parse(childKey);
      const [children, authority] = await Promise.all([
        repositories.children.getChildrenByIds(childIds),
        repositories.children.getWriteAuthority({ userId: handle.userId, childIds }),
      ]);
      const mastery = Object.fromEntries(await Promise.all(childIds.map(async id => [id,
        authority[id]?.deliver && languageOrder
          ? await loadMasteryState({ repositories, userId: handle.userId, childId: id, languageCode }) : null,
      ])));
      if (current && handle.isCurrent()) setMetadata({ children, authority, mastery });
    };
    void load().catch(caught => {
      if (current && !isStaleActorError(caught)) setError({ message: "Couldn't save the lesson. Try again." });
    });
    return () => { current = false; };
    // Tick and note edits do not reload the child's stored mastery or reading level.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handle, repositories, draft?.id, childKey, languageCode, languageOrder]));

  // endSave has published empty before this committed render, releasing Lesson's leave guard.
  useEffect(() => {
    if (!completion || !handle.isCurrent()) return;
    navigation.replace('SessionComplete', completion);
    void Promise.resolve().then(() => triggerBackgroundSync?.()).catch(() => {});
    void Promise.resolve().then(() => refreshSyncStatus()).catch(() => {});
  }, [completion, handle, navigation, triggerBackgroundSync, refreshSyncStatus]);

  const edit = (transition, ...args) => {
    void apply(transition, ...args).catch(caught => {
      if (active.current && !isStaleActorError(caught)) setError(null);
    });
  };
  const save = async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    setEmptyConfirm(false); setSaving(true); setError(null);
    let snapshot;
    let saved = false;
    try {
      snapshot = await beginSave();
      // Deferred blending/book UI may supply neither key. Their saved representation is empty.
      snapshot = { ...snapshot, ticks: { ...snapshot.ticks,
        blends: snapshot.ticks.blends ?? [], books: snapshot.ticks.books ?? [] } };
      const children = await repositories.children.getChildrenByIds(presentChildIds(snapshot.attendance));
      await saveLesson({ handle, draft: snapshot, sessionTypeFields: buildSessionTypeFields({ profile, jobTitlesCache: jobTitles }) });
      saved = true;
      endSave({ saved: true });
      await Promise.resolve(refreshFromCache()).catch(() => {});
      if (active.current && handle.isCurrent()) setCompletion({
        ...buildSessionCompleteParams({ selectedChildren: presentChildIds(snapshot.attendance).map(id => children[id] ?? { id }),
          selectedLetters: snapshot.ticks.letters, sessionReadingLevel: deriveSessionReadingLevel(snapshot.ticks.blends),
          sessionDateKey: snapshot.lesson_date }), languageCode: snapshot.language_code,
      });
    } catch (caught) {
      if (isStaleActorError(caught) || !handle.isCurrent()) return;
      // Release the controller even if this screen has gone, or the lesson stays locked as saving.
      if (snapshot && !saved) endSave({ saved: caught.code === 'ALREADY_SAVED' });
      if (!active.current) return;
      const ids = caught.childIds ?? [];
      let children = {};
      try { if (ids.length) children = await repositories.children.getChildrenByIds(ids); }
      catch (lookupError) { if (isStaleActorError(lookupError)) return; }
      if (!active.current || !handle.isCurrent()) return;
      setError({ code: caught.code, childIds: ids, message: errorMessage(caught, ids.map(id => children[id]?.first_name ?? 'Child')) });
    } finally {
      savingRef.current = false;
      if (active.current) setSaving(false);
    }
  };
  const clearRefusedChanges = async () => {
    const ids = error.childIds;
    try {
      const [authority, children] = await Promise.all([
        repositories.children.getWriteAuthority({ userId: handle.userId, childIds: ids }),
        repositories.children.getChildrenByIds(ids),
      ]);
      await apply(row => {
        let next = row;
        for (const id of ids) {
          if (!authority[id]?.deliver) next = { ...next, ...transitions.setTrackerChanges(next, id, {}) };
          if (!authority[id]?.level) next = { ...next, ...transitions.setReadingLevel(next, id, children[id]?.reading_level, children[id]?.reading_level) };
        }
        return { tracker_changes: next.tracker_changes, reading_level_changes: next.reading_level_changes, ticks: next.ticks };
      });
      if (active.current && handle.isCurrent()) {
        setMetadata(previous => previous ? { ...previous,
          authority: { ...previous.authority, ...authority }, children: { ...previous.children, ...children },
        } : previous);
        setError(null);
      }
    } catch (caught) { if (active.current && !isStaleActorError(caught)) setError({ message: errorMessage(caught, []) }); }
  };
  const ids = JSON.parse(childKey);
  const letters = draft?.ticks.letters ?? [];
  const askSave = () => {
    if (!draft || ids.length === 0 || savingRef.current) return;
    if (!letters.length && !draft.ticks.blends?.length && !draft.ticks.books?.length) setEmptyConfirm(true);
    else void save();
  };
  const displayedError = error?.message ?? (typeof lesson.error === 'string' ? lesson.error : null);
  return <View style={styles.screen}>
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content} onScroll={onScroll} scrollEventThrottle={16}
      keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}>
      {letters.length ? <View style={styles.heading}>
        <Text accessibilityRole="header" style={styles.title}>{`Who knows ${letters.join(' ')} without help?`}</Text>
        <Text style={styles.note}>Teaching it today doesn't count.</Text>
      </View> : null}
      {draft && metadata ? ids.map(id => metadata.children[id] ? <WrapUpChildRow key={id}
        child={metadata.children[id]} letters={letters} languageOrder={languageOrder}
        authority={metadata.authority[id] ?? {}} mastery={metadata.mastery[id]}
        changes={draft.tracker_changes[id] ?? {}} noOneNew={draft.ticks.noOneNew?.includes(id)}
        readingLevel={draft.reading_level_changes[id] ?? metadata.children[id].reading_level}
        onLetter={letter => edit(toggleMark, id, letter, { mastered: true, languageCode, madeAt: new Date().toISOString() })}
        onNoOneNew={() => edit(transitions.toggleNoOneNew, id)}
        onOpenTracker={() => setTrackerId(id)} onOpenLevel={() => setLevelId(id)} /> : null) : null}
      {draft ? <>
        <SelectField label="Date" value={startedLabel(draft.lesson_date, today) ?? 'Today'} onPress={() => setDateVisible(true)} />
        <TextField label="Notes (optional)" value={draft.notes ?? ''} multiline
          onChangeText={text => edit(transitions.setNotes, text)} placeholder="Add session notes…" {...NO_TEXT_SUGGESTIONS} />
      </> : null}
    </ScrollView>
    <StickyActionFooter hideOnKeyboard style={styles.footer}>
      {ids.length === 0 && draft ? <InlineNote live="assertive">Mark at least one child as here.</InlineNote> : null}
      {displayedError ? <InlineNote live="assertive">{displayedError}</InlineNote> : null}
      {error?.code === 'CHANGES_NOT_WRITABLE' ? <BrandButton variant="tertiary" label="Clear their changes" onPress={clearRefusedChanges} /> : null}
      {error?.code === 'ALREADY_SAVED' ? <BrandButton label="Done" onPress={() => navigation.popTo('MainTabs')} />
        : <BrandButton label="Save session" disabled={ids.length === 0} loading={saving} loadingLabel="Saving…" onPress={askSave} />}
    </StickyActionFooter>
    <ConfirmSheet visible={emptyConfirm} title="Save without letters, blends or a book?"
      confirmLabel="Save session" confirmVariant="primary" cancelLabel="Go back" onConfirm={() => void save()} onCancel={() => setEmptyConfirm(false)} />
    <BottomSheet visible={dateVisible} title="Date" onDismiss={() => setDateVisible(false)} keyboardAvoiding={false}
      dismissLabel="Dismiss session date picker"
      footer={<BrandButton variant="tertiary" tone="ink" label="Cancel" onPress={() => setDateVisible(false)} />}>
      {dateVisible && draft ? <MonthCalendar selectedKey={draft.lesson_date} todayKey={today}
        onSelect={key => { edit(transitions.setLessonDate, key); setDateVisible(false); }} /> : null}
    </BottomSheet>
    <SelectSheet visible={levelId !== null} title="Reading level" cancelLabel="Cancel" options={READING_LEVEL_OPTIONS}
      selectedKey={draft?.reading_level_changes[levelId] ?? metadata?.children[levelId]?.reading_level}
      onDismiss={() => setLevelId(null)} onSelect={value => edit(transitions.setReadingLevel, levelId, value, metadata?.children[levelId]?.reading_level)} />
    <LetterTrackerBottomSheet visible={trackerId !== null} onDismiss={() => setTrackerId(null)}
      child={metadata?.children[trackerId] ?? null} userId={handle.userId} languageCode={languageCode}
      pendingChanges={draft?.tracker_changes[trackerId] ?? {}}
      onChangesUpdate={changes => edit(transitions.setTrackerChanges, trackerId, changes)} />
  </View>;
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background }, scroll: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.lg }, heading: { gap: spacing.sm },
  title: { ...typeRoles.displayHeading, color: colors.text }, note: { ...typeRoles.textBody, color: colors.textSecondary },
  footer: { gap: spacing.ms },
});
