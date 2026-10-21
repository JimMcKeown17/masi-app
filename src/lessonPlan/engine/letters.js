import {
  PACK_LANGUAGE_BY_CODE,
  SUGGESTED_LETTER_COUNT,
} from './constants';
import { isLessonPlanSession } from './history';

const letterStepsFromPack = (pack) => {
  const steps = Array.isArray(pack?.letter_steps) ? pack.letter_steps : [];
  return [...steps].sort((left, right) => (left?.step ?? 0) - (right?.step ?? 0));
};

export const teachingOrderFromPack = (pack) => letterStepsFromPack(pack)
  .flatMap((entry) => (Array.isArray(entry?.new_letters) ? entry.new_letters : []));

export const isLetterGroupMastered = (covered, present) => {
  if (present <= 0) return false;
  if (present < 3) return covered === present;
  return 5 * covered >= 4 * present || present - covered <= 1;
};

export const usablePack = ({ pack, languageCode }) => {
  if (!pack || !Object.prototype.hasOwnProperty.call(PACK_LANGUAGE_BY_CODE, languageCode)) return null;
  if (pack.language !== PACK_LANGUAGE_BY_CODE[languageCode]) return null;
  return teachingOrderFromPack(pack).length > 0 ? pack : null;
};

export const uniquePresentChildren = (children) => {
  const seen = new Set();
  return (Array.isArray(children) ? children : []).filter((child) => {
    if (seen.has(child?.id)) return false;
    seen.add(child?.id);
    return true;
  });
};

const knownLettersFor = (child) => new Set(
  (Array.isArray(child?.knownLetters) ? child.knownLetters : [])
    .filter((letter) => typeof letter === 'string')
    .map((letter) => letter.toLowerCase())
);

export const planLetters = ({ languageCode, pack, alphabet, children, childSessions }) => {
  const presentChildren = uniquePresentChildren(children);
  const historyComplete = presentChildren.every((child) => child?.historyComplete === true);
  const masteryComplete = presentChildren.every((child) => child?.masteryComplete === true);

  if (presentChildren.length === 0) {
    return {
      reason: 'no_children',
      order: [],
      known: [],
      suggested: [],
      review: [],
      unlocked: [],
      historyComplete,
      masteryComplete,
    };
  }

  const resolvedPack = usablePack({ pack, languageCode });
  const order = resolvedPack
    ? teachingOrderFromPack(resolvedPack)
    : (Array.isArray(alphabet) ? alphabet : [])
      .filter((letter) => typeof letter === 'string')
      .map((letter) => letter.toLowerCase());
  const childKnown = presentChildren.map(knownLettersFor);
  const known = order.filter((letter) => isLetterGroupMastered(
    childKnown.filter((letters) => letters.has(letter.toLowerCase())).length,
    presentChildren.length
  ));

  if (!resolvedPack) {
    return {
      reason: 'no_pack',
      order,
      known,
      suggested: [],
      review: [],
      unlocked: [],
      historyComplete,
      masteryComplete,
    };
  }

  const knownSet = new Set(known);
  const steps = letterStepsFromPack(resolvedPack);
  const stepOne = steps.find((entry) => entry?.step === 1);
  const stepOneLetters = Array.isArray(stepOne?.new_letters) ? stepOne.new_letters : [];
  const firstSession = historyComplete
    && stepOneLetters.some((letter) => !knownSet.has(letter))
    && !presentChildren.some((child) => childSessions(child.id).some(isLessonPlanSession));
  const suggested = firstSession
    ? stepOneLetters.filter((letter) => !knownSet.has(letter))
    : order.filter((letter) => !knownSet.has(letter)).slice(0, SUGGESTED_LETTER_COUNT);
  if (suggested.length === 0) {
    return {
      reason: 'all_letters_known',
      order,
      known,
      suggested,
      review: [...order],
      unlocked: [...order],
      historyComplete,
      masteryComplete,
    };
  }

  const lastSuggested = suggested[suggested.length - 1];
  const lastSuggestedStep = firstSession ? 1 : steps.find((entry) => (
    Array.isArray(entry?.new_letters) && entry.new_letters.includes(lastSuggested)
  ))?.step;
  const unlocked = order.filter((letter) => knownSet.has(letter) || steps.some((entry) => (
    entry?.step <= lastSuggestedStep
      && Array.isArray(entry?.new_letters)
      && entry.new_letters.includes(letter)
  )));
  const suggestedSet = new Set(suggested);

  return {
    reason: firstSession ? 'first_session' : 'ok',
    order,
    known,
    suggested,
    review: unlocked.filter((letter) => !suggestedSet.has(letter)),
    unlocked,
    historyComplete,
    masteryComplete,
  };
};
