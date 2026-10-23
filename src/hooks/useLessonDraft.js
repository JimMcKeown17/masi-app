import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useSignedInEA } from '../context/SignedInEAContext';
import { useProgrammeTodayKey } from './useProgrammeTodayKey';
import { loadLessonBase, loadLessonParticipants, presentLessonInput } from '../lessonPlan/inputs/lessonInputs';
import { computeLessonPlan, computeLessonChoices, isPlanRecomputable, resolveLessonClass } from '../lessonPlan/engine';
import { getPack } from '../lessonPlan/packs';
import { isPreviewContentEnabled } from '../lessonPlan/packs/previewContent';
import { languageCodeForHomeLanguage } from '../utils/assessmentRegistry';
import { presentChildIds } from '../db/repositories/lessonDraftsRepository';
import * as transitions from '../lessonPlan/lessonDraftState';
import { visibleRosterChildren } from '../utils/childVisibility';
import { compareChildNames } from '../utils/childNames';
import { useSessionHistoryStatus } from '../services/sessionHistoryStatus';

// A lesson with no change yet is dated by its first change, so a lesson opened before
// midnight and first touched after it keeps a plan made for its own date (C14).
const datedOnFirstChange = (row, today) => (!row.id && row.lesson_date !== today ? { lesson_date: today } : {});

export const useLessonDraft = ({ draftId, start } = {}) => {
  const { handle } = useSignedInEA();
  const { repositories, services } = handle;
  const controller = services.lessonDraft;
  const today = useProgrammeTodayKey();
  const { pageVersion, runVersion } = useSessionHistoryStatus();
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const { draft } = snapshot;
  const [baseLoaded, setBaseLoaded] = useState(null);
  const [participantsLoaded, setParticipantsLoaded] = useState(null);
  const [baseError, setBaseError] = useState(null);
  const [participantError, setParticipantError] = useState(null);
  const [openError, setOpenError] = useState(null);
  const [baseRetryCount, setBaseRetryCount] = useState(0);
  const [retryCount, setRetryCount] = useState(0);
  const programmeId = draft?.programme_id ?? start?.group?.programme_id;
  const baseKey = JSON.stringify([programmeId, today, baseRetryCount, pageVersion, runVersion]);
  const baseInScope = baseLoaded?.base.today === today
    && (programmeId === undefined || baseLoaded.base.programmeId === programmeId);
  const baseReady = baseInScope && baseLoaded.retryCount === baseRetryCount;
  const base = baseReady ? baseLoaded.base : null;
  // History refreshes keep the last base visible; first load, date/programme changes and retry do not.
  const baseCurrent = baseReady && baseLoaded.pageVersion === pageVersion && baseLoaded.runVersion === runVersion;
  useEffect(() => {
    let active = true;
    if ((!draft && !start) || baseCurrent) return undefined;
    setBaseError(null);
    const load = async () => {
      const [nextBase, classes] = await Promise.all([
        loadLessonBase({ handle, repositories, today, programmeId }),
        repositories.classes.getClasses(),
      ]);
      if (nextBase.missing) throw new Error(`Lesson inputs missing: ${nextBase.missing}`);
      if (active) setBaseLoaded({ base: nextBase, classes, retryCount: baseRetryCount,
        pageVersion, runVersion, refreshed: baseInScope });
    };
    void load().catch(error => {
      if (!active) return;
      // A failed history refresh keeps the coherent base on screen; the next history version tries again.
      if (baseReady) console.warn('[lesson] history refresh failed:', error?.message);
      else setBaseError(error);
    });
    return () => { active = false; };
    // The resolved programme reuses the base that opened this lesson.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handle, repositories, baseKey]);

  const opened = useRef(null);
  const openingKey = JSON.stringify({ draftId, start });
  const openingBase = draftId ? null : base;
  useEffect(() => {
    let active = true;
    const open = async () => {
      if (opened.current === openingKey) return null;
      if (draftId) {
        await controller.open({ draftId });
        if (active) opened.current = openingKey;
        return null;
      }
      if (!start || !openingBase) return null;
      let group = start.group;
      let members = start.members;
      if (!group) group = (await repositories.groups.getGroups({ userId: handle.userId }))
        .find(row => row.id === start.groupId);
      if (!group) throw new Error('This group is no longer on this phone.');
      if (!members) {
        const [memberships, roster] = await Promise.all([
          repositories.groups.getVisibleChildrenGroups({ userId: handle.userId }),
          repositories.children.getMyChildren(handle.userId),
        ]);
        const ids = new Set(memberships.filter(row => row.group_id === group.id && !row.removed_at).map(row => row.child_id));
        // The picker's order, so the chips and title read as the row did.
        members = visibleRosterChildren(roster).filter(child => ids.has(child.id)).sort(compareChildNames);
      }
      const { classId } = resolveLessonClass({
        groupClassId: group.class_id, memberClassIds: members.map(child => child.class_id),
      });
      const languageCode = languageCodeForHomeLanguage(baseLoaded.classes.find(row => row.id === classId)?.home_language);
      const pack = getPack(languageCode, { allowPreview: isPreviewContentEnabled() });
      if (!active) return null;
      await controller.open({ start: transitions.newLessonDraftInput({
        group, members, programmeId: openingBase.programmeId, classId, languageCode,
        packId: pack?.id ?? null, lessonDate: today,
      }) });
      if (active) opened.current = openingKey;
    };
    void open().catch(error => { if (active) setOpenError(error); });
    return () => { active = false; };
    // The start is a value, so rerenders with a new options object only attach once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controller, handle, repositories, openingKey, openingBase]);

  const participantKey = JSON.stringify(draft?.attendance.childIds ?? []);
  const presentKey = JSON.stringify(draft ? presentChildIds(draft.attendance) : []);
  const inputKey = draft ? JSON.stringify([
    draft.group_id, draft.class_id, draft.language_code, draft.pack_id, participantKey, retryCount,
  ]) : null;
  useEffect(() => {
    let active = true;
    if (!draft || !inputKey || ['empty', 'closed', 'missing', 'corrupt', 'exists'].includes(snapshot.status)) return undefined;
    setParticipantError(null);
    const load = async () => {
      const loaded = await loadLessonParticipants({ handle, repositories, services,
        programmeId: draft.programme_id, languageCode: draft.language_code, packId: draft.pack_id,
        participantChildIds: JSON.parse(participantKey),
      });
      const lessonClass = await repositories.classes.getClassById(draft.class_id);
      if (active) setParticipantsLoaded({ key: inputKey, loaded, lessonClass });
    };
    void load().catch(error => { if (active) setParticipantError(error); });
    return () => { active = false; };
    // Attendance projects the same facts; only participant or lesson identity reloads them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handle, repositories, services, inputKey]);

  const lessonInput = useMemo(() => base && participantsLoaded?.key === inputKey
    ? presentLessonInput({ base, loaded: participantsLoaded.loaded, presentChildIds: JSON.parse(presentKey), lesson: {
      groupId: draft.group_id, upNextGroupId: draft.plan?.up_next_group_id ?? start?.upNextGroupId ?? null,
      languageCode: draft.language_code, isEcd: participantsLoaded.lessonClass?.grade === 'ECD',
    } }) : null,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [base, participantsLoaded, inputKey, presentKey]);
  const needs = draft ? !draft.class_id ? 'class' : !draft.language_code ? 'language' : null : null;
  const storedPlanKey = JSON.stringify(draft?.plan ?? null);
  const recomputable = draft && isPlanRecomputable({
    lessonDate: draft.lesson_date, today, frozen: !!draft.plan_fixed_at,
  });
  // Keep a resumed plan on initial load; attendance changes and a replacement base refresh it before freezing.
  const needsCurrentPlan = !draft?.plan || recomputable
    && (JSON.stringify(draft.plan.present_child_ids) !== presentKey || baseLoaded?.refreshed === true);
  const currentPlan = useMemo(() => lessonInput && !needs && needsCurrentPlan ? computeLessonPlan(lessonInput) : null,
  [lessonInput, needs, needsCurrentPlan]);
  const plan = useMemo(() => {
    if (!lessonInput) return null;
    if (needs) return draft?.plan ?? null;
    return currentPlan ?? draft.plan ?? computeLessonPlan(lessonInput);
    // JSON keys preserve memoisation when SQLite decodes an unchanged plan into a new object.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lessonInput, needs, storedPlanKey, currentPlan]);
  const planKey = JSON.stringify(plan);
  const choices = useMemo(() => lessonInput && plan && !needs
    ? computeLessonChoices(lessonInput, { plan }) : null,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [lessonInput, planKey, needs]);
  useEffect(() => {
    // Opening alone never creates a draft. Fold the initial plan into the first user change.
    // A persisted, unfrozen plan follows refreshed inputs only on the lesson's own day.
    if (!draft?.plan || !plan || !recomputable || storedPlanKey === planKey) return;
    const current = controller.getSnapshot();
    if (current.status === 'saving' || current.draft !== draft) return;
    void controller.apply(transitions.setPlan, plan).catch(() => {});
  }, [controller, draft, plan, recomputable, storedPlanKey, planKey]);

  const assertPlan = useCallback(() => {
    if (needs) throw new Error(`Choose a lesson ${needs} first.`);
    if (!lessonInput || !plan) throw new Error('Lesson suggestions are still loading.');
  }, [needs, lessonInput, plan]);
  const apply = useCallback(async (transition, ...args) => {
    if (transition === transitions.chooseClass || transition === transitions.chooseLanguage) {
      const option = args[0];
      const classes = baseLoaded?.classes ?? await repositories.classes.getClasses();
      const classId = option.classId ?? draft.class_id;
      const lessonClass = classes.find(row => row.id === classId)
        ?? await repositories.classes.getClassById(classId);
      const languageCode = option.languageCode ?? languageCodeForHomeLanguage(lessonClass?.home_language);
      const packId = option.packId ?? getPack(languageCode, { allowPreview: isPreviewContentEnabled() })?.id ?? null;
      const choiceBase = base ?? await loadLessonBase({ handle, repositories, today, programmeId: draft.programme_id });
      const loaded = await loadLessonParticipants({ handle, repositories, services,
        programmeId: draft.programme_id, languageCode, packId, participantChildIds: JSON.parse(participantKey),
      });
      const input = presentLessonInput({ base: choiceBase, loaded, presentChildIds: JSON.parse(presentKey), lesson: {
        groupId: draft.group_id, upNextGroupId: start?.upNextGroupId ?? null,
        languageCode, isEcd: lessonClass?.grade === 'ECD',
      } });
      return controller.apply((row, choice) => ({ ...datedOnFirstChange(row, today), ...transition(row, choice) }),
        { ...option, classId, languageCode, packId, plan: languageCode ? computeLessonPlan(input) : null });
    }
    if (transition === transitions.toggleTick || transition === transitions.toggleBookRead) {
      assertPlan();
      const index = transition === transitions.toggleTick ? 2 : 1;
      args[index] = { ...args[index], plan, nowIso: args[index]?.nowIso ?? new Date().toISOString() };
    }
    return controller.apply((row, ...captured) => ({
      ...datedOnFirstChange(row, today), ...(!row.plan && plan ? { plan } : {}), ...transition(row, ...captured),
    }), ...args);
  }, [controller, draft, baseLoaded, base, repositories, handle, services, today, participantKey, presentKey, plan, start?.upNextGroupId, assertPlan]);
  const ensureDraft = useCallback(async () => {
    assertPlan();
    if (!controller.getSnapshot().draft.plan) {
      await controller.apply(row => ({ ...datedOnFirstChange(row, today), ...transitions.setPlan(row, plan) }));
    }
    return controller.ensureDraft();
  }, [controller, assertPlan, plan, today]);
  const beginSave = useCallback(async () => {
    assertPlan();
    // Admit the initial plan before taking the save lock, without yielding to another edit.
    // beginSave observes a failure of this write through the controller's failure barrier.
    const current = controller.getSnapshot().draft;
    if (!current.plan) {
      void controller.apply(row => ({ ...datedOnFirstChange(row, today), ...transitions.setPlan(row, plan) })).catch(() => {});
    }
    // A chosen blend tier whose children have all gone is saved as the default tier the screen
    // shows. This write sits behind the same failure barrier, so a stale tier is never saved.
    const shownTier = current.ticks.blendTierShown;
    if (shownTier && choices && !choices.tiers.some(item => item.tier === shownTier)) {
      void controller.apply(transitions.setBlendTierShown, null).catch(() => {});
    }
    return controller.beginSave();
  }, [controller, assertPlan, plan, today, choices]);
  const retry = useCallback(() => {
    if (baseError) setBaseRetryCount(count => count + 1);
    else setRetryCount(count => count + 1);
  }, [baseError]);
  return { ...snapshot, plan, choices, lessonInput, base, needs, apply, ensureDraft, beginSave, retry,
    inputError: baseError ?? participantError,
    endSave: controller.endSave, discard: controller.discard, error: snapshot.error ?? openError ?? baseError ?? participantError };
};
