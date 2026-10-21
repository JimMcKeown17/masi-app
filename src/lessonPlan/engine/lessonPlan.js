import { ENGINE_VERSION } from './constants';
import { planLetters, uniquePresentChildren } from './letters';

export const computeLessonPlan = (input) => {
  const presentChildren = uniquePresentChildren(input?.presentChildren);
  const letters = planLetters({
    languageCode: input?.languageCode,
    pack: input?.pack,
    alphabet: input?.alphabet,
    children: presentChildren,
    childSessions: () => [],
  });

  return {
    engine_version: ENGINE_VERSION,
    made_on: input?.today,
    reason: letters.reason,
    history_complete: letters.historyComplete,
    mastery_complete: letters.masteryComplete,
    present_child_ids: presentChildren.map((child) => child.id),
    known_letters: letters.known,
    suggested_letters: letters.suggested,
    review_letters: letters.review,
    unlocked_letters: letters.unlocked,
    blend_tier: null,
    suggested_blends: [],
    suggested_book: null,
    up_next_group_id: input?.upNextGroupId ?? null,
  };
};
