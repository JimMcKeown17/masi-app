import { ENGINE_VERSION } from './constants';
import { tokenizeText } from '../../utils/decodability';
import { blendChoices } from './blends';
import { bookCatalogue, bookChoices } from './books';
import { sessionsByChild, windowSessions } from './history';
import { planLetters, teachingOrderFromPack, uniquePresentChildren, usablePack } from './letters';
import { soundsOf } from './sounds';

const evaluateLesson = (input, plan = null) => {
  const presentChildren = uniquePresentChildren(input?.presentChildren);
  const childSessions = sessionsByChild(windowSessions(input?.sessions, {
    programmeId: input?.programmeId,
    academicYearStart: input?.academicYearStart,
    today: input?.today,
  }));
  const currentLetters = planLetters({
    languageCode: input?.languageCode,
    pack: input?.pack,
    alphabet: input?.alphabet,
    children: presentChildren,
    childSessions,
  });
  const letters = plan ? {
    ...currentLetters,
    reason: plan.reason,
    suggested: plan.suggested_letters,
    unlocked: plan.unlocked_letters,
  } : currentLetters;
  const pack = usablePack({ pack: input?.pack, languageCode: input?.languageCode });
  const soundCache = new Map();
  const soundsFor = (text) => {
    if (!soundCache.has(text)) soundCache.set(text, soundsOf(text, pack));
    return soundCache.get(text);
  };
  const pageCache = new Map();
  const tokensFor = (page) => {
    if (!pageCache.has(page)) pageCache.set(page, tokenizeText(page));
    return pageCache.get(page);
  };
  const catalogue = bookCatalogue(pack);
  const choices = {
    letterChoices: pack ? teachingOrderFromPack(pack) : (input?.alphabet ?? []),
    tiers: pack && presentChildren.length > 0 ? blendChoices({
      pack,
      children: presentChildren,
      childSessions,
      suggestedLetters: letters.suggested,
      unlockedLetters: letters.unlocked,
      groupId: input?.groupId,
      today: plan ? plan.made_on : input?.today,
      plan,
      soundsFor,
    }) : [],
    books: pack && presentChildren.length > 0 && !input?.isEcd ? bookChoices({
      pack,
      catalogue,
      children: presentChildren,
      childSessions,
      unlockedLetters: letters.unlocked,
      plan,
      tokensFor,
      soundsFor,
    }) : [],
    contentAvailable: {
      blends: Boolean(pack && (
        (Array.isArray(pack.word_bank) && pack.word_bank.length > 0)
        || (Array.isArray(pack.letter_steps) && pack.letter_steps.some((step) => (
          Array.isArray(step?.blends) && step.blends.length > 0
        )))
      )),
      books: catalogue.length > 0,
    },
  };
  return { presentChildren, letters, choices };
};

export const computeLessonChoices = (input, options) => evaluateLesson(input, options?.plan).choices;

export const computeLessonPlan = (input) => {
  const { presentChildren, letters, choices } = evaluateLesson(input);

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
    blend_tier: choices.tiers[0]?.tier ?? null,
    suggested_blends: (choices.tiers[0]?.suggested ?? []).map((item) => item.text),
    suggested_book: choices.books.find((book) => book.suggested)?.id ?? null,
    up_next_group_id: input?.upNextGroupId ?? null,
  };
};

export const planForSave = ({ plan, lessonDate }) => {
  if (!plan) throw new TypeError('planForSave needs a plan');
  return lessonDate === plan.made_on
    ? { plan, plan_reason: null }
    : { plan: null, plan_reason: 'past_date' };
};

export const isPlanRecomputable = ({ lessonDate, today, frozen }) => (
  !frozen && lessonDate === today
);
