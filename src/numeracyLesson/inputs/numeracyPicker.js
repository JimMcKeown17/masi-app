import { getCurriculum } from '../../../content/numeracy-curriculum';
import { loadNumeracyLessonInputs, numeracyPlanInput } from './numeracyInputs';
import { planNumeracyLesson } from '../../numeracy/planLesson';
import { stepPhrase } from '../copy';

export const loadNumeracyPickerNext = async ({ handle, repositories, services, base, ranking, curriculum = getCurriculum() }) => {
  const participantChildIds = [...new Set(ranking.rows.flatMap(row => row.members.map(child => child.id)))];
  const loaded = await loadNumeracyLessonInputs({ handle, repositories, services, base, participantChildIds, curriculum });
  const nextByGroup = {};
  let historyComplete = true;
  for (const row of ranking.rows) {
    const input = numeracyPlanInput({ base, loaded, groupId: row.groupId,
      presentChildIds: row.members.map(child => child.id), lessonDate: base.today, curriculum });
    historyComplete = historyComplete && input.complete.history;
    nextByGroup[row.groupId] = planNumeracyLesson(input).cards
      .filter(card => card.slot === 'activity').map(card => stepPhrase(curriculum, card.step_key));
  }
  return { nextByGroup, historyComplete };
};
