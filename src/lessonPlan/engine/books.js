import { normalizeToken, tokenizeText } from '../../utils/decodability';
import { BLEND_TIERS, BOOK_RECENT_SESSIONS } from './constants';
import { lessonBookIds } from './history';
import { soundsOf } from './sounds';

export const bookCatalogue = (pack) => {
  const readers = pack?.readers ?? {};
  const steps = [
    ...(Array.isArray(pack?.letter_steps) ? pack.letter_steps : []),
    ...(Array.isArray(pack?.sound_steps) ? pack.sound_steps : []),
  ];
  const entries = Object.keys(readers)
    .filter((id) => readers[id] && pack?.reader_details?.[id]?.retired !== true)
    .map((id) => {
      const step = readers[id].step ?? 0;
      const entry = steps.find((item) => item?.step === step);
      const position = Array.isArray(entry?.readers) ? entry.readers.indexOf(id) : -1;
      return { id, step, position: position < 0 ? Infinity : position };
    });
  entries.sort((a, b) => a.step - b.step || a.position - b.position || (
    a.id === b.id ? 0 : a.id < b.id ? -1 : 1
  ));
  return entries.map(({ id }) => id);
};

const readableWith = (pack, readerId, unlockedSet, tokensFor, soundsFor) => {
  if (!Object.prototype.hasOwnProperty.call(pack?.readers ?? {}, readerId)) return false;
  const reader = pack.readers[readerId];
  if (!reader) return false;
  const tricky = new Set((Array.isArray(reader.tricky_words) ? reader.tricky_words : [])
    .filter((text) => typeof text === 'string').map(normalizeToken));
  return (Array.isArray(reader.pages) ? reader.pages : []).every((page) => (
    tokensFor(page).every((token) => {
      if (tricky.has(token)) return true;
      const sounds = soundsFor(token);
      return sounds !== null && sounds.length > 0 && sounds.every((sound) => unlockedSet.has(sound));
    })
  ));
};

export const isReadable = (pack, readerId, unlockedSet) => readableWith(
  pack, readerId, unlockedSet, tokenizeText, (text) => soundsOf(text, pack)
);

const compareReads = (a, b) => {
  for (const key of ['session_date', 'created_at', 'id']) {
    const left = a[key] ?? '';
    const right = b[key] ?? '';
    if (left !== right) return left < right ? -1 : 1;
  }
  return 0;
};

export const bookChoices = ({ pack, catalogue, children, childSessions, unlockedLetters, plan, tokensFor, soundsFor }) => {
  const recent = new Set(children.flatMap((child) => (
    childSessions(child.id).slice(0, BOOK_RECENT_SESSIONS).flatMap(lessonBookIds)
  )));
  const latest = new Map();
  children.forEach((child) => childSessions(child.id).forEach((session) => {
    lessonBookIds(session).forEach((id) => {
      if (!latest.has(id) || compareReads(session, latest.get(id)) > 0) latest.set(id, session);
    });
  }));
  const unlockedSet = new Set(unlockedLetters);
  const books = catalogue.map((id) => ({
    id,
    title: pack.readers[id].title,
    step: pack.readers[id].step,
    readable: readableWith(pack, id, unlockedSet, tokensFor, soundsFor),
    suggested: false,
    lastReadOn: latest.get(id)?.session_date ?? null,
  }));
  const readable = books.filter((book) => book.readable);
  const notRecent = readable.filter((book) => !recent.has(book.id));
  const candidates = notRecent.length > 0 ? notRecent : readable;
  const chosen = candidates.reduce((best, book) => {
    if (!best) return book;
    const comparison = notRecent.length > 0 ? 0 : compareReads(latest.get(book.id), latest.get(best.id));
    return comparison < 0 || (comparison === 0 && book.step > best.step) ? book : best;
  }, null);
  const suggestedId = BLEND_TIERS.includes(plan?.blend_tier) ? plan.suggested_book : chosen?.id;
  return books.map((book) => ({ ...book, suggested: book.id === suggestedId }));
};
