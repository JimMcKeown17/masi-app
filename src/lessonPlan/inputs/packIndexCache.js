import { indexPack } from '../engine/packIndex';

const indices = new WeakMap();

export const packIndexFor = (pack) => {
  if (!pack) return null;
  if (!indices.has(pack)) indices.set(pack, indexPack(pack));
  return indices.get(pack);
};
