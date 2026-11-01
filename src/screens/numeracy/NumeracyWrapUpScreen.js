import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, usePreventRemove } from '@react-navigation/native';
import { useSignedInEA } from '../../context/SignedInEAContext';
import { useAuth } from '../../context/AuthContext';
import { useChildren } from '../../context/ChildrenContext';
import { useOffline } from '../../context/OfflineContext';
import { useLookupsContext } from '../../context/LookupsContext';
import { useNumeracyLessonDraft } from '../../hooks/useNumeracyLessonDraft';
import { useProgrammeTodayKey } from '../../hooks/useProgrammeTodayKey';
import { useHeaderHairline } from '../../components/common/ScreenHeader';
import { presentChildIds } from '../../db/repositories/lessonDraftsRepository';
import { saveNumeracyLesson } from '../../services/numeracyLessonSave';
import * as transitions from '../../numeracyLesson/numeracyDraftState';
import { lessonDateLabel } from '../../utils/lessonDates';
import { buildNumeracyCompleteParams } from '../../utils/sessionCompleteView';
import { buildSessionTypeFields } from '../../utils/sessionTypeResolver';
import { isStaleActorError } from '../../session/staleActor';
import { colors, spacing } from '../../constants/colors';
import { typeRoles } from '../../constants/typography';
import { NO_TEXT_SUGGESTIONS } from '../../constants/textInputProps';
import IconCircleButton from '../../components/common/IconCircleButton';
import MonthCalendar from '../../components/common/MonthCalendar';
import BottomSheet from '../../components/common/BottomSheet';
import TextField from '../../components/common/TextField';
import BrandButton from '../../components/common/BrandButton';
import InlineNote from '../../components/common/InlineNote';
import StickyActionFooter from '../../components/forms/StickyActionFooter';
import { computeStepEvidence } from '../../numeracy/evidence';
import { buildTrackerModel } from '../../numeracyLesson/trackerModel';
import { toggleChipChange } from '../../numeracyLesson/trackerChanges';
import { numeracySaveErrorMessage } from '../../numeracyLesson/copy';
import WrapUpStepRow from '../../components/numeracy/WrapUpStepRow';
import TickWhenStrip from '../../components/numeracy/TickWhenStrip';
import NumberTrackerSheet from '../../components/numeracy/NumberTrackerSheet';

export default function NumeracyWrapUpScreen({ navigation, route }) {
  const { handle } = useSignedInEA();
  const repositories = handle.repositories;
  const { profile } = useAuth();
  const { jobTitles } = useLookupsContext();
  const { refreshFromCache } = useChildren();
  const { triggerBackgroundSync, refreshSyncStatus } = useOffline();
  const lesson = useNumeracyLessonDraft({ draftId: route.params.draftId });
  const { draft, apply, beginSave, endSave } = lesson;
  const today = useProgrammeTodayKey();
  const onScroll = useHeaderHairline(navigation);
  const [metadata, setMetadata] = useState(null);
  const [dateVisible, setDateVisible] = useState(false);
  const dateLabel = draft ? lessonDateLabel(draft.lesson_date, today) : null;
  const hasDraft = Boolean(draft);
  useLayoutEffect(() => {
    navigation.setOptions({ headerRight: hasDraft ? () => <IconCircleButton icon="calendar-outline"
      accessibilityLabel={`Lesson date, ${dateLabel ?? 'Today'}`} testID="wrap-up-date-button"
      onPress={() => setDateVisible(true)} /> : null });
  }, [navigation, hasDraft, dateLabel]);
  const [trackerId, setTrackerId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [completion, setCompletion] = useState(null);
  // A save in flight decides what comes next (Session complete or its error), so Back waits for it.
  usePreventRemove(saving && !completion, () => {});
  const savingRef = useRef(false);
  const active = useRef(true);
  useEffect(() => () => { active.current = false; }, []);
  const childKey = JSON.stringify(draft ? presentChildIds(draft.attendance) : []);
  const { curriculum } = lesson;
  useFocusEffect(useCallback(() => {
    let current = true;
    if (!draft) return undefined;
    const load = async () => {
      const childIds = JSON.parse(childKey);
      const [children, authority] = await Promise.all([
        repositories.children.getChildrenByIds(childIds),
        repositories.children.getWriteAuthority({ userId: handle.userId, childIds }),
      ]);
      const deliveryIds = childIds.filter(id => authority[id]?.deliver);
      const [ticks, results] = await Promise.all([
        repositories.skillMastery.getSkillMastery({ childIds: deliveryIds }),
        repositories.assessments.getMathsEvidenceResults({ userId: handle.userId, programmeId: draft.programme_id, childIds: deliveryIds }),
      ]);
      const evidence = Object.fromEntries(deliveryIds.map(id => [id, computeStepEvidence({ curriculum, results: results.filter(result => result.child_id === id) })]));
      if (current && handle.isCurrent()) setMetadata({ children, authority, ticks, evidence });
    };
    void load().catch(caught => {
      if (current && !isStaleActorError(caught)) setError({ message: "Couldn't save the lesson. Try again." });
    });
    return () => { current = false; };
    // Chip, sheet and note edits never reload stored ticks; a sync pass does not either.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handle, repositories, draft?.id, childKey, curriculum]));

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
    setSaving(true); setError(null);
    let snapshot;
    let saved = false;
    try {
      snapshot = await beginSave();
      const children = await repositories.children.getChildrenByIds(presentChildIds(snapshot.attendance));
      await saveNumeracyLesson({ handle, draft: snapshot, sessionTypeFields: buildSessionTypeFields({ profile, jobTitlesCache: jobTitles }) });
      saved = true;
      endSave({ saved: true });
      await Promise.resolve(refreshFromCache()).catch(() => {});
      if (active.current && handle.isCurrent()) setCompletion({
        ...buildNumeracyCompleteParams({ selectedChildren: presentChildIds(snapshot.attendance).map(id => children[id] ?? { id }),
          taught: transitions.taughtCards(snapshot), curriculum, sessionDateKey: snapshot.lesson_date }),
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
      setError({ code: caught.code, childIds: ids, message: numeracySaveErrorMessage(caught, ids.map(id => children[id]?.first_name ?? 'Child')) });
    } finally {
      savingRef.current = false;
      if (active.current) setSaving(false);
    }
  };
  const clearRefusedChanges = async () => {
    const ids = error.childIds;
    try {
      const authority = await repositories.children.getWriteAuthority({ userId: handle.userId, childIds: ids });
      for (const id of ids) if (!authority[id]?.deliver) await apply(transitions.clearChildStepChanges, id);
      if (active.current && handle.isCurrent()) {
        setMetadata(previous => previous ? { ...previous,
          authority: { ...previous.authority, ...authority },
        } : previous);
        setError(null);
      }
    } catch (caught) { if (active.current && !isStaleActorError(caught)) setError({ message: numeracySaveErrorMessage(caught, []) }); }
  };
  const ids = JSON.parse(childKey);
  const taught = draft ? transitions.taughtCards(draft) : [];
  const steps = [...new Set(taught.map(card => card.step_key))];
  const askSave = () => { if (draft && ids.length && !savingRef.current) void save(); };
  const displayedError = error?.message ?? (typeof lesson.error === 'string' ? lesson.error : null);
  return <View style={styles.screen}>
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content} onScroll={onScroll} scrollEventThrottle={16}
      keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}>
      {dateLabel ? <Text testID="wrap-up-lesson-date" style={styles.note}>Lesson on {dateLabel}</Text> : null}
      <View style={styles.heading}>
        <Text accessibilityRole="header" style={styles.title}>Who can do these without help?</Text>
        <Text style={styles.note}>Teaching it today doesn't count.</Text>
      </View>
      {steps.map(stepKey => <TickWhenStrip key={stepKey} curriculum={curriculum} stepKey={stepKey} />)}
      {draft && metadata ? ids.map(id => {
        const pending = draft.tracker_changes[id] ?? {};
        const model = buildTrackerModel({ curriculum, ticks: metadata.ticks.filter(tick => tick.child_id === id), evidence: metadata.evidence[id], pending, userId: handle.userId });
        return metadata.children[id] ? <WrapUpStepRow key={id} child={metadata.children[id]} steps={steps} model={model} pending={pending}
          isDelivery={!!metadata.authority[id]?.deliver} onOpenTracker={() => setTrackerId(id)}
          onToggle={(stepKey, known) => edit(transitions.setStepChanges, id, toggleChipChange({ known, pending, stepKey, nowIso: new Date().toISOString() }))} /> : null;
      }) : null}
      {draft ? <>
        <TextField label="Notes (optional)" value={draft.notes ?? ''} multiline
          onChangeText={text => edit(transitions.setNotes, text)} placeholder="Add session notes…" {...NO_TEXT_SUGGESTIONS} />
      </> : null}
    </ScrollView>
    <StickyActionFooter hideOnKeyboard style={styles.footer}>
      {ids.length === 0 && draft ? <InlineNote live="assertive">Mark at least one child as here.</InlineNote> : null}
      {displayedError ? <InlineNote live="assertive">{displayedError}</InlineNote> : null}
      {error?.code === 'CHANGES_NOT_WRITABLE' ? <BrandButton variant="tertiary" label="Clear their changes" onPress={clearRefusedChanges} /> : null}
      {error?.code === 'ALREADY_SAVED' ? <BrandButton label="Done" onPress={() => navigation.popTo('MainTabs')} />
        : <BrandButton label="Save lesson" disabled={ids.length === 0} loading={saving} loadingLabel="Saving…" onPress={askSave} />}
    </StickyActionFooter>
    <BottomSheet visible={dateVisible} title="Lesson date" onDismiss={() => setDateVisible(false)} keyboardAvoiding={false}
      dismissLabel="Dismiss session date picker"
      footer={<BrandButton variant="tertiary" tone="ink" label="Cancel" onPress={() => setDateVisible(false)} />}>
      {dateVisible && draft ? <MonthCalendar selectedKey={draft.lesson_date} todayKey={today}
        onSelect={key => { edit(transitions.setLessonDate, key); setDateVisible(false); }} /> : null}
    </BottomSheet>
    <NumberTrackerSheet visible={trackerId !== null} onDismiss={() => setTrackerId(null)}
      child={metadata?.children[trackerId] ?? null} curriculum={curriculum} userId={handle.userId}
      programmeId={draft?.programme_id} academicYear={lesson.base?.academicYear}
      pendingChanges={draft?.tracker_changes[trackerId] ?? {}}
      onChangesUpdate={changes => edit(transitions.setStepChanges, trackerId, changes)} />
  </View>;
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background }, scroll: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.lg }, heading: { gap: spacing.sm },
  title: { ...typeRoles.displayHeading, color: colors.text }, note: { ...typeRoles.textBody, color: colors.textSecondary },
  footer: { gap: spacing.ms },
});
