import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useSignedInEA } from '../context/SignedInEAContext';
import { useProgrammeTodayKey } from './useProgrammeTodayKey';
import { loadLessonBase, loadLessonInput } from '../lessonPlan/inputs/lessonInputs';
import { computeLessonPlan, computeLessonChoices, isPlanRecomputable, resolveLessonClass } from '../lessonPlan/engine';
import { getPack } from '../lessonPlan/packs';
import { isPreviewContentEnabled } from '../lessonPlan/packs/previewContent';
import { languageCodeForHomeLanguage } from '../utils/assessmentRegistry';
import { presentChildIds } from '../db/repositories/lessonDraftsRepository';
import * as transitions from '../lessonPlan/lessonDraftState';

export const useLessonDraft = ({ draftId, start } = {}) => {
  const { handle } = useSignedInEA();
  const { repositories, services } = handle;
  const controller = services.lessonDraft;
  const today = useProgrammeTodayKey();
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const { draft } = snapshot;
  const [loaded, setLoaded] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const openingKey = JSON.stringify({ draftId, start });
  useEffect(() => {
    let active = true;
    const open = async () => {
      if (draftId) return controller.open({ draftId });
      if (!start) return null;
      const base = await loadLessonBase({ handle, repositories, today });
      if (base.missing) throw new Error(`Lesson inputs missing: ${base.missing}`);
      let group = start.group;
      let members = start.members;
      if (!group) group = (await repositories.groups.getGroups({ userId: handle.userId }))
        .find(row => row.id === start.groupId);
      if (!group) throw new Error('This group is no longer on this phone.');
      if (!members) {
        const memberships = await repositories.groups.getVisibleChildrenGroups({ userId: handle.userId });
        const ids = memberships.filter(row => row.group_id === group.id && !row.removed_at).map(row => row.child_id);
        const children = await repositories.children.getChildrenByIds(ids);
        members = ids.map(id => children[id] ?? { id });
      }
      const classes = await repositories.classes.getClasses();
      const { classId } = resolveLessonClass({
        groupClassId: group.class_id, memberClassIds: members.map(child => child.class_id),
      });
      const languageCode = languageCodeForHomeLanguage(classes.find(row => row.id === classId)?.home_language);
      const pack = getPack(languageCode, { allowPreview: isPreviewContentEnabled() });
      if (!active) return null;
      return controller.open({ start: transitions.newLessonDraftInput({
        group, members, programmeId: base.programmeId, classId, languageCode,
        packId: pack?.id ?? null, lessonDate: today,
      }) });
    };
    void open().catch(error => { if (active) setLoadError(error); });
    return () => { active = false; };
    // The start is a value, so rerenders with a new options object only attach once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controller, handle, repositories, openingKey]);

  const presentKey = JSON.stringify(draft ? presentChildIds(draft.attendance) : []);
  const inputKey = draft ? JSON.stringify([
    draft.programme_id, draft.group_id, draft.class_id, draft.language_code, draft.pack_id, presentKey, today,
  ]) : null;
  useEffect(() => {
    let active = true;
    if (!draft || !inputKey || ['empty', 'closed', 'missing', 'corrupt', 'exists'].includes(snapshot.status)) return undefined;
    const load = async () => {
      const [base, classes] = await Promise.all([
        loadLessonBase({ handle, repositories, today, programmeId: draft.programme_id }),
        repositories.classes.getClasses(),
      ]);
      if (base.missing) throw new Error(`Lesson inputs missing: ${base.missing}`);
      const input = await loadLessonInput({ handle, repositories, services, base, lesson: {
        groupId: draft.group_id, upNextGroupId: draft.plan?.up_next_group_id ?? start?.upNextGroupId ?? null,
        languageCode: draft.language_code, packId: draft.pack_id,
        isEcd: classes.find(row => row.id === draft.class_id)?.grade === 'ECD',
        presentChildIds: JSON.parse(presentKey),
      } });
      if (active) { setLoaded({ key: inputKey, input, classes }); setLoadError(null); }
    };
    void load().catch(error => { if (active) setLoadError(error); });
    return () => { active = false; };
    // Only pedagogical inputs reload; ticks, notes and confirmation of an identical plan do not.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handle, repositories, services, inputKey]);

  const lessonInput = loaded?.key === inputKey ? loaded.input : null;
  const needs = draft ? !draft.class_id ? 'class' : !draft.language_code ? 'language' : null : null;
  const storedPlanKey = JSON.stringify(draft?.plan ?? null);
  const recomputable = draft && isPlanRecomputable({
    lessonDate: draft.lesson_date, today, frozen: !!draft.plan_fixed_at,
  });
  const plan = useMemo(() => {
    if (!lessonInput || needs) return draft?.plan ?? null;
    if (!draft.plan || recomputable && JSON.stringify(draft.plan.present_child_ids) !== presentKey) {
      return computeLessonPlan(lessonInput);
    }
    return draft.plan;
    // JSON keys preserve memoisation when SQLite decodes an unchanged plan into a new object.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lessonInput, needs, storedPlanKey, presentKey, recomputable]);
  const planKey = JSON.stringify(plan);
  const choices = useMemo(() => lessonInput && plan && !needs
    ? computeLessonChoices(lessonInput, { plan }) : null,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [lessonInput, planKey, needs]);
  useEffect(() => {
    // Opening alone never creates a draft. Fold the initial plan into the first user change.
    // A persisted plan is refreshed only for a changed attendance on the lesson's own day.
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
      const classes = loaded?.classes ?? await repositories.classes.getClasses();
      const classId = option.classId ?? draft.class_id;
      const lessonClass = classes.find(row => row.id === classId);
      const languageCode = option.languageCode ?? languageCodeForHomeLanguage(lessonClass?.home_language);
      const packId = option.packId ?? getPack(languageCode, { allowPreview: isPreviewContentEnabled() })?.id ?? null;
      const base = await loadLessonBase({ handle, repositories, today, programmeId: draft.programme_id });
      const input = await loadLessonInput({ handle, repositories, services, base, lesson: {
        groupId: draft.group_id, upNextGroupId: start?.upNextGroupId ?? null,
        languageCode, packId, isEcd: lessonClass?.grade === 'ECD', presentChildIds: JSON.parse(presentKey),
      } });
      return controller.apply(transition, { ...option, classId, languageCode, packId,
        plan: languageCode ? computeLessonPlan(input) : null });
    }
    if (transition === transitions.toggleTick || transition === transitions.toggleBookRead) {
      assertPlan();
      const index = transition === transitions.toggleTick ? 2 : 1;
      args[index] = { ...args[index], plan, nowIso: args[index]?.nowIso ?? new Date().toISOString() };
    }
    return controller.apply((row, ...captured) => ({
      ...(!row.plan && plan ? { plan } : {}), ...transition(row, ...captured),
    }), ...args);
  }, [controller, draft, loaded, repositories, handle, services, today, presentKey, plan, start?.upNextGroupId, assertPlan]);
  const ensureDraft = useCallback(async () => {
    assertPlan();
    if (!controller.getSnapshot().draft.plan) await controller.apply(transitions.setPlan, plan);
    return controller.ensureDraft();
  }, [controller, assertPlan, plan]);
  const beginSave = useCallback(async () => {
    assertPlan();
    // Admit the initial plan before taking the save lock, without yielding to another edit.
    // beginSave observes a failure of this write through the controller's failure barrier.
    if (!controller.getSnapshot().draft.plan) void controller.apply(transitions.setPlan, plan).catch(() => {});
    return controller.beginSave();
  }, [controller, assertPlan, plan]);
  return { ...snapshot, plan, choices, lessonInput, needs, apply, ensureDraft, beginSave,
    endSave: controller.endSave, discard: controller.discard, error: snapshot.error ?? loadError };
};
