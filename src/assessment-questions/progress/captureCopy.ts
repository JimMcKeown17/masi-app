import type { CaptureCopy, LinePart } from './captureTypes';

const capitalise = (text: string) => text[0].toUpperCase() + text.slice(1);

export function flatCopy(noun: 'letter' | 'word' | 'question' | 'number' | 'pair' | 'problem' | 'item', total: number): CaptureCopy {
  const name = capitalise(noun);
  return {
    noun,
    position: position => [{ text: `${name} ` }, { text: `${position + 1} of ${total}`, strong: true }],
    itemName: position => `${name} ${position + 1}`,
  };
}

export function nestedCopy(outer: 'Word' | 'Sentence', inner: 'letter' | 'word',
  groups: ReadonlyArray<ReadonlyArray<number>>): CaptureCopy {
  function locate(position: number) {
    const group = groups.findIndex(positions => positions.includes(position));
    return { outerPosition: group + 1, innerPosition: (groups[group]?.indexOf(position) ?? -1) + 1,
      total: groups[group]?.length ?? 0 };
  }
  return {
    noun: inner,
    position: position => {
      const at = locate(position);
      return [{ text: `${outer} ` }, { text: String(at.outerPosition), strong: true },
        { text: ` · ${inner} ` }, { text: `${at.innerPosition} of ${at.total}`, strong: true }];
    },
    itemName: position => {
      const at = locate(position);
      return `${capitalise(inner)} ${at.innerPosition} of ${outer.toLowerCase()} ${at.outerPosition}`;
    },
  };
}

export function reviewLine(total: number, correct: number, noun: string): LinePart[] {
  return [{ text: `All ${total} marked`, strong: true }, { text: ` · ${correct} correct. Tap any ${noun} to change it.` }];
}

export function endMessage(marked: number, total: number): string {
  return `${marked} marked. The ${total - marked} not marked won't count towards the score.`;
}
