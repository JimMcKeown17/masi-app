import { READING_LEVELS } from '../../constants/literacyConstants';
import { normalizeToken } from '../../utils/decodability';
import { BLEND_RECENT_SESSIONS, BLEND_SUGGESTION_COUNT, BLEND_TIERS } from './constants';
import { lessonBlends } from './history';
import { letterCount } from './sounds';

export const tierForLetterCount = (n) => {
  if (n <= 2) return BLEND_TIERS[0];
  if (n === 3) return BLEND_TIERS[1];
  if (n === 4) return BLEND_TIERS[2];
  return BLEND_TIERS[3];
};

export const blendTierForReadingLevel = (level) => {
  const index = READING_LEVELS.indexOf(level);
  return BLEND_TIERS[Math.max(0, Math.min(index - 1, BLEND_TIERS.length - 1))];
};

export const deriveSessionReadingLevel = (blendsDone) => {
  if (!Array.isArray(blendsDone)) return null;
  const longest = blendsDone.reduce((count, text) => Math.max(count, letterCount(text)), 0);
  return longest === 0 ? null : tierForLetterCount(longest);
};

export const rotationOffset = (groupId, today, count) => {
  let hash = 0;
  for (const ch of String(groupId)) hash = (Math.imul(hash, 31) + ch.charCodeAt(0)) >>> 0;
  const day = Date.parse(`${today}T00:00:00Z`) / 86400000;
  const offset = ((hash + day) % count + count) % count;
  return Number.isFinite(offset) ? offset : 0;
};

const blendItems = (pack) => {
  const tiers = BLEND_TIERS.map(() => []);
  const seen = new Set();
  const add = (text, display, isSyllable) => {
    if (typeof text !== 'string') return;
    const count = letterCount(text);
    if (isSyllable ? count !== 2 : count < 3) return;
    const normalized = normalizeToken(text);
    if (seen.has(normalized)) return;
    seen.add(normalized);
    const tier = tierForLetterCount(count);
    tiers[BLEND_TIERS.indexOf(tier)].push({ text, display: display || text, tier });
  };
  const steps = Array.isArray(pack.letter_steps) ? pack.letter_steps : [];
  [...steps].sort((a, b) => (a?.step ?? 0) - (b?.step ?? 0)).forEach((step) => {
    (Array.isArray(step?.blends) ? step.blends : []).forEach((text) => add(text, text, true));
  });
  (Array.isArray(pack.word_bank) ? pack.word_bank : []).forEach((entry) => {
    add(entry?.text, entry?.syllables, false);
  });
  return tiers;
};

export const blendChoices = ({
  pack, children, childSessions, suggestedLetters, unlockedLetters, groupId, today, plan, soundsFor,
}) => {
  const items = blendItems(pack);
  const unlocked = new Set(unlockedLetters);
  const suggested = new Set(suggestedLetters);
  const recent = new Set(children.flatMap((child) => (
    childSessions(child.id).slice(0, BLEND_RECENT_SESSIONS).flatMap(lessonBlends)
  )));
  const ranked = items.map((tierItems) => {
    const usable = tierItems.filter((item) => {
      const sounds = soundsFor(item.text);
      return sounds !== null && sounds.length > 0 && sounds.every((sound) => unlocked.has(sound));
    });
    const offset = rotationOffset(groupId, today, usable.length);
    const buckets = [[], [], [], []];
    usable.forEach((_, i) => {
      const item = usable[(offset + i) % usable.length];
      const containsSuggested = soundsFor(item.text).some((sound) => suggested.has(sound));
      const bucket = (containsSuggested ? 0 : 2) + (recent.has(normalizeToken(item.text)) ? 1 : 0);
      buckets[bucket].push(item);
    });
    return buckets.flat();
  });
  const poolFor = (index) => {
    const pool = [...ranked[index]];
    for (let lower = index - 1; pool.length < BLEND_SUGGESTION_COUNT && lower >= 0; lower -= 1) {
      pool.push(...ranked[lower]);
    }
    return pool;
  };
  const childTiers = children.map((child) => BLEND_TIERS.indexOf(blendTierForReadingLevel(child.readingLevel)));
  const frozenIndex = BLEND_TIERS.indexOf(plan?.blend_tier);
  const defaultIndex = frozenIndex >= 0 ? frozenIndex : Math.min(...childTiers);
  return BLEND_TIERS.flatMap((tier, index) => {
    if (index < defaultIndex || (index > defaultIndex && !childTiers.includes(index))) return [];
    const pool = poolFor(index);
    const childIds = children.filter((_, i) => (
      index === defaultIndex ? childTiers[i] <= index : childTiers[i] === index
    )).map((child) => child.id);
    if (index === frozenIndex) {
      const catalogue = new Map(items.flat().map((item) => [normalizeToken(item.text), item]));
      const frozen = (Array.isArray(plan.suggested_blends) ? plan.suggested_blends : [])
        .filter((text) => typeof text === 'string')
        .map((text) => catalogue.get(normalizeToken(text)))
        .filter(Boolean);
      const frozenTexts = new Set(frozen.map((item) => normalizeToken(item.text)));
      return [{ tier, childIds, suggested: frozen, pool: [
        ...frozen, ...pool.filter((item) => !frozenTexts.has(normalizeToken(item.text))),
      ] }];
    }
    return [{ tier, childIds, suggested: pool.slice(0, BLEND_SUGGESTION_COUNT), pool }];
  });
};
