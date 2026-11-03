import { getStep } from '../../content/numeracy-curriculum';
import { formatNameList } from '../utils/childNames';
import { LessonDraftWriteError } from '../services/lessonDraftController';

/** Curriculum = { edition, skills: Array<{ key, label, steps: Step[] }> }
 * Step = { key, skill, label, size, tick_when: { setup, ask, expected, rule } }
 * All content is resolved against the supplied curriculum. Unknown or retired keys
 * (including drafts spanning a content update) never throw: titles, phrases and
 * chips use the raw key; tickWhenLines and stripSummary return null. Help lines
 * use the raw key too, or "not ready yet" for a null step key.
 */
export const CHIP_WORDS = Object.freeze({
  finger_flash: 'Flash', count: 'Count', read_numbers: 'Read', compare: 'Compare',
  before_after: 'Before/after', add: 'Add', subtract: 'Take away', number_pairs: 'Pairs',
  count_aloud: 'Say', skip_count: 'Skip',
});

export const PROGRAMME_CHANGED_NOTE = 'Your programme has changed. Go back and open it again.';

export function keepSumsTogether(text) {
  if (typeof text !== 'string') return text;
  return text.replace(/\d+(?: [+−\-=] \d+)+/g, sum => sum.replace(/ /g, '\u00a0'));
}

export function stepTitle(curriculum, stepKey) {
  const step = getStep(curriculum, stepKey);
  const skill = step && curriculum.skills.find(skill => skill.key === step.skill);
  return keepSumsTogether(skill ? `${skill.label} · ${step.label}` : stepKey);
}

export function stepPhrase(curriculum, stepKey) {
  const step = getStep(curriculum, stepKey);
  const skill = step && curriculum.skills.find(skill => skill.key === step.skill);
  return keepSumsTogether(skill ? `${skill.label} ${step.label}` : stepKey);
}

export function nextLine(curriculum, stepKeys) {
  return stepKeys.length ? keepSumsTogether(`Next: ${stepKeys.map(key => stepPhrase(curriculum, key)).join(' · ')}`) : null;
}

export function chipLabel(curriculum, stepKey) {
  const step = getStep(curriculum, stepKey);
  if (!step) return keepSumsTogether(stepKey);
  if (step.skill === 'skip_count') return keepSumsTogether(`Skip ${step.label}`);
  if (step.skill === 'number_pairs') return keepSumsTogether(`Make ${step.size}`);
  if (!Object.prototype.hasOwnProperty.call(CHIP_WORDS, step.skill)) return stepPhrase(curriculum, stepKey);
  return keepSumsTogether(`${CHIP_WORDS[step.skill]} to ${step.size}`);
}

export const readyLine = ({ readyCount, presentCount }) => keepSumsTogether(
  `${readyCount} of ${presentCount} ${readyCount === 1 ? 'is' : 'are'} ready`,
);

export function needHelpLine({ curriculum, cardStepKey, stillOn }) {
  if (!stillOn.length) return null;
  const cardStep = getStep(curriculum, cardStepKey);
  const groups = new Map();
  for (const { name, stepKey } of stillOn) {
    const key = stepKey ?? null;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(name);
  }
  const keys = [...groups.keys()].filter(key => key !== null);
  if (groups.has(null)) keys.push(null);
  return keepSumsTogether(keys.map(key => {
    const names = groups.get(key);
    const subject = `${formatNameList(names, { spoken: true })} ${names.length === 1 ? 'is' : 'are'}`;
    if (key === null) return `${subject} not ready yet`;
    const step = getStep(curriculum, key);
    const label = step && cardStep && step.skill === cardStep.skill ? step.label : stepPhrase(curriculum, key);
    return `${subject} still on ${label}`;
  }).join(' · '));
}

export const canHelpLine = names => names.length
  ? keepSumsTogether(`${formatNameList(names, { spoken: true })} can help a partner`) : null;

export const lessonHeader = ({ groupNumber, minutes }) => keepSumsTogether(`Group ${groupNumber} · ${minutes} min lesson`);

export function tickWhenLines(curriculum, stepKey) {
  const step = getStep(curriculum, stepKey);
  if (!step) return null;
  const { setup, ask, expected, rule } = step.tick_when;
  return {
    setup: keepSumsTogether(setup),
    items: ask.map((text, index) => ({ ask: keepSumsTogether(text), expected: keepSumsTogether(expected[index]) })),
    rule: keepSumsTogether(rule),
  };
}

export function stripSummary(curriculum, stepKey) {
  const step = getStep(curriculum, stepKey);
  return step ? keepSumsTogether(`${stepPhrase(curriculum, stepKey)}: ${step.tick_when.ask.join(' · ')}`) : null;
}

export function numeracySaveErrorMessage(error, names) {
  switch (error.code) {
    case 'GROUP_MISSING': return 'This group is no longer on this phone. Discard this lesson to start again.';
    case 'CHILD_NOT_WRITABLE': return `${names.join(' & ')} ${names.length === 1 ? 'is' : 'are'} no longer one of your children. Go back and remove them from the lesson.`;
    case 'CHANGES_NOT_WRITABLE': return `You can't update ${names.join(' & ')}'s steps any more.`;
    case 'PROGRAMME_NOT_ACTIVE': return "This lesson is for a programme you're no longer assigned to. Discard it to start again.";
    case 'PROGRAMME_NOT_NUMERACY': return 'This is a numeracy lesson, but your programme has changed. Discard it to start again.';
    case 'ALREADY_SAVED': return 'This lesson was already saved.';
    default: return error instanceof LessonDraftWriteError
      ? "Couldn't save your last change. Check the lesson and press Save again."
      : "Couldn't save the lesson. Try again.";
  }
}
