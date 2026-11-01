import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useSignedInEA } from '../context/SignedInEAContext';
import { useProgrammeTodayKey } from './useProgrammeTodayKey';
import { loadLessonBase } from '../lessonPlan/inputs/lessonInputs';
import { isPlanRecomputable, resolveLessonClass } from '../lessonPlan/engine';
import { presentChildIds } from '../db/repositories/lessonDraftsRepository';
import { visibleRosterChildren } from '../utils/childVisibility';
import { compareChildNames } from '../utils/childNames';
import { useSessionHistoryStatus } from '../services/sessionHistoryStatus';
import useMasterySyncRefresh from './useMasterySyncRefresh';
import { confirmNumeracyProgramme } from '../services/numeracyProgramme';
import { getCurriculum, CURRENT_EDITION } from '../../content/numeracy-curriculum';
import { loadNumeracyLessonInputs, numeracyPlanInput } from '../numeracyLesson/inputs/numeracyInputs';
import * as planLessonModule from '../numeracy/planLesson';
import { storeNumeracyPlan, isNumeracyPlanSuperseded } from '../numeracy/planRecord';
import { cardReadiness, cardHelpLists, stillOnStep, pickNumeracyActivity } from '../numeracy/cards';
import * as transitions from '../numeracyLesson/numeracyDraftState';

const datedOnFirstChange = (row, today) => (!row.id && row.lesson_date !== today ? { lesson_date: today } : {});
const setPlan = (row, plan) => ({ plan });

export const useNumeracyLessonDraft = ({ draftId, start } = {}) => {
  const { handle } = useSignedInEA();
  const { repositories, services } = handle;
  const controller = services.lessonDraft;
  const curriculum = getCurriculum();
  const today = useProgrammeTodayKey();
  const { pageVersion, runVersion } = useSessionHistoryStatus();
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const { draft } = snapshot;
  const [baseLoaded, setBaseLoaded] = useState(null);
  const [inputsLoaded, setInputsLoaded] = useState(null);
  const [baseError, setBaseError] = useState(null);
  const [inputError, setInputError] = useState(null);
  const [openError, setOpenError] = useState(null);
  const [wrongProgramme, setWrongProgramme] = useState(false);
  const [baseRetryCount, setBaseRetryCount] = useState(0);
  const [retryCount, setRetryCount] = useState(0);
  const [inputsVersion, setInputsVersion] = useState(0);
  const bumpInputs = useCallback(() => setInputsVersion(value => value + 1), []);
  useMasterySyncRefresh('skill_mastery', bumpInputs);
  const programmeId = draft?.programme_id ?? start?.programmeId;
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
      const nextBase = await loadLessonBase({ handle, repositories, today, programmeId });
      if (nextBase.missing) throw new Error(`Lesson inputs missing: ${nextBase.missing}`);
      if (active) setBaseLoaded({ base: nextBase, retryCount: baseRetryCount, pageVersion, runVersion });
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
      const confirmed = await confirmNumeracyProgramme({ handle, userId: handle.userId });
      if (!active) return null;
      if (!confirmed || confirmed !== start.programmeId) {
        setWrongProgramme(true);
        return null;
      }
      setWrongProgramme(false);
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
      // A screen left during the reads above must not replace the shared controller's lesson.
      if (!active) return null;
      await controller.open({ start: transitions.newNumeracyDraftInput({
        group, members, programmeId: confirmed, classId, lessonDate: today,
      }) });
      if (active) opened.current = openingKey;
    };
    setOpenError(null);
    void open().catch(error => { if (active) setOpenError(error); });
    return () => { active = false; };
  }, [controller, handle, repositories, openingKey, openingBase, retryCount]);

  const participantKey = JSON.stringify(draft?.attendance.childIds ?? []);
  const presentKey = JSON.stringify(draft ? presentChildIds(draft.attendance) : []);
  const inputKey = draft && base ? JSON.stringify([
    draft.group_id, draft.programme_id, base.academicYear, participantKey, retryCount, inputsVersion,
  ]) : null;
  useEffect(() => {
    let active = true;
    if (!inputKey || ['empty', 'closed', 'missing', 'corrupt', 'exists'].includes(snapshot.status)) return undefined;
    setInputError(null);
    void loadNumeracyLessonInputs({ handle, repositories, services, base,
      participantChildIds: JSON.parse(participantKey), curriculum,
    }).then(loaded => { if (active) setInputsLoaded({ key: inputKey, loaded }); })
      .catch(error => { if (active) setInputError(error); });
    return () => { active = false; };
    // The key captures the participant set, year and refresh version.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handle, repositories, services, inputKey]);

  const input = useMemo(() => base && inputsLoaded?.key === inputKey
    ? numeracyPlanInput({ base, loaded: inputsLoaded.loaded, groupId: draft.group_id,
      presentChildIds: JSON.parse(presentKey), lessonDate: draft.lesson_date, curriculum }) : null,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [base, inputsLoaded, inputKey, presentKey, draft?.lesson_date]);
  const storedPlanKey = JSON.stringify(draft?.plan ?? null);
  const recomputable = draft && isPlanRecomputable({ lessonDate: draft.lesson_date, today, frozen: !!draft.plan_fixed_at });
  const needsCurrentPlan = !draft?.plan || recomputable
    && (JSON.stringify(draft.plan.present_child_ids) !== presentKey
      || (!!input && isNumeracyPlanSuperseded(draft.plan, input.complete)));
  const currentPlan = useMemo(() => input && needsCurrentPlan ? storeNumeracyPlan({
    plan: planLessonModule.planNumeracyLesson(input), curriculumEdition: CURRENT_EDITION,
    lessonDate: input.lessonDate, presentChildIds: input.presentChildIds, complete: input.complete,
  }) : null, [input, needsCurrentPlan]);
  const plan = useMemo(() => input ? currentPlan ?? draft.plan : null,
  // JSON keys survive SQLite decoding the same stored value into a fresh object.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [input, currentPlan, storedPlanKey]);
  const planKey = JSON.stringify(plan);
  useEffect(() => {
    if (!draft?.plan || !plan || !recomputable || storedPlanKey === planKey) return;
    const current = controller.getSnapshot();
    if (current.status === 'saving' || current.draft !== draft || current.error) return;
    void controller.apply(setPlan, plan).catch(() => {});
  }, [controller, draft, plan, recomputable, storedPlanKey, planKey]);

  // Presentation uses live knowledge and attendance even after the suggestion freezes.
  const knownByChild = inputsLoaded?.key === inputKey ? inputsLoaded.loaded.knownByChild : null;
  const cards = useMemo(() => draft && plan && knownByChild ? transitions.taughtCards({ ...draft, plan }).map(card => {
    const step = curriculum.skills.flatMap(skill => skill.steps).find(item => item.key === card.step_key);
    const readiness = cardReadiness({ curriculum, presentChildIds: JSON.parse(presentKey), knownByChild, stepKey: card.step_key });
    return { ...card, minutes: step.activities.find(activity => activity.name === card.activity)?.minutes ?? 0,
      readiness, help: cardHelpLists(readiness), stillOn: readiness.needHelp.map(childId => ({ childId,
        stepKey: stillOnStep({ curriculum, knownByChild, childId, stepKey: card.step_key }),
      })) };
  }) : [], [draft, plan, knownByChild, curriculum, presentKey]);
  const assertPlan = useCallback(() => {
    if (!input || !plan) throw new Error('Lesson suggestions are still loading.');
  }, [input, plan]);
  const apply = useCallback((transition, ...args) => controller.apply((row, ...captured) => ({
    ...datedOnFirstChange(row, today), ...(!row.plan && plan ? { plan } : {}), ...transition(row, ...captured),
  }), ...args), [controller, today, plan]);
  const swap = useCallback((index, stepKey) => {
    assertPlan();
    const slot = index === cards.length ? 'activity' : cards[index].slot;
    const activity = pickNumeracyActivity({ curriculum, history: input.history, lessonDate: draft.lesson_date, stepKey, slot });
    return apply(transitions.swapCard, index, { step_key: stepKey, activity }, { plan, nowIso: new Date().toISOString() });
  }, [assertPlan, cards, curriculum, input, draft, apply, plan]);
  const ensureDraft = useCallback(async () => {
    assertPlan();
    await apply(transitions.freezeForWrapUp, { plan, nowIso: new Date().toISOString() });
    return controller.ensureDraft();
  }, [assertPlan, apply, plan, controller]);
  const beginSave = useCallback(() => {
    assertPlan();
    // Queue admission before the lock; the controller's failure barrier covers this write.
    void apply(transitions.freezeForWrapUp, { plan, nowIso: new Date().toISOString() }).catch(() => {});
    return controller.beginSave();
  }, [assertPlan, apply, plan, controller]);
  const retry = useCallback(() => {
    if (baseError) setBaseRetryCount(value => value + 1);
    else setRetryCount(value => value + 1);
  }, [baseError]);
  return { ...snapshot, status: wrongProgramme ? 'wrong_programme' : snapshot.status,
    plan, cards, knownByChild, curriculum, base, inputError: baseError ?? inputError,
    error: snapshot.error ?? openError ?? baseError ?? inputError,
    apply, swap, ensureDraft, beginSave, endSave: controller.endSave, discard: controller.discard, retry };
};
