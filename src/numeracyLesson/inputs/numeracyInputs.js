import { getCurriculum } from '../../../content/numeracy-curriculum';
import { computeStepEvidence } from '../../numeracy/evidence';
import { knownStepsForChild } from '../../numeracy/knownSteps';

export const loadKnownSteps = async ({ repositories, userId, childIds, curriculum = getCurriculum(), programmeId, academicYear }) => {
  const ids = [...new Set(childIds)];
  const [ticks, results] = await Promise.all([
    repositories.skillMastery.getSkillMastery({ childIds: ids }),
    repositories.assessments.getMathsEvidenceResults({ userId, programmeId, childIds: ids, academicYear }),
  ]);
  const ticksByChild = new Map(ids.map(id => [id, []]));
  const resultsByChild = new Map(ids.map(id => [id, []]));
  for (const tick of ticks) ticksByChild.get(tick.child_id)?.push(tick);
  for (const result of results) resultsByChild.get(result.child_id)?.push(result);
  return new Map(ids.map(id => [id, knownStepsForChild({
    curriculum, ticks: ticksByChild.get(id),
    evidence: computeStepEvidence({ curriculum, results: resultsByChild.get(id) }),
  })]));
};

export const loadNumeracyCompleteness = async ({ services, childIds, programmeId, academicYear }) => {
  const [ticks, evidence] = await Promise.all([
    services.assessmentHistory.skillMasteryCompletenessByChild({ childIds }),
    services.assessmentHistory.assessmentCompletenessByChild({ childIds, programmeId, academicYear }),
  ]);
  return { ticks, evidence };
};

export const numeracyHistoryForGroup = (sessions, groupId) => sessions
  .filter(session => session.group_id === groupId && Array.isArray(session.activities?.numeracy?.taught))
  .map(session => ({ date: session.session_date, createdAt: session.created_at, id: session.id,
    taught: session.activities.numeracy.taught }));

export const loadNumeracyLessonInputs = async ({ handle, repositories, services, base, participantChildIds, curriculum = getCurriculum() }) => {
  const childIds = [...new Set(participantChildIds)];
  const { programmeId, academicYear } = base;
  // Pull pages commit with their cursors: read coverage before the data it describes.
  const completeByChild = await loadNumeracyCompleteness({ services, childIds, programmeId, academicYear });
  const knownByChild = await loadKnownSteps({ repositories, userId: handle.userId, childIds, curriculum, programmeId, academicYear });
  return { knownByChild, completeByChild };
};

export const numeracyPlanInput = ({ base, loaded, groupId, presentChildIds, lessonDate, curriculum = getCurriculum() }) => {
  const ids = [...new Set(presentChildIds)];
  return {
    curriculum, presentChildIds: ids, knownByChild: loaded.knownByChild,
    history: numeracyHistoryForGroup(base.sessions, groupId), lessonDate, activityCardCount: 2,
    complete: {
      history: ids.every(id => base.sessionHistoryCoveredChildIds?.has(id) === true),
      ticks: ids.every(id => loaded.completeByChild.ticks[id] === true),
      evidence: ids.every(id => loaded.completeByChild.evidence[id] === true),
    },
  };
};
