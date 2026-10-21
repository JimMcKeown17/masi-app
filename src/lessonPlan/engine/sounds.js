import { normalizeToken, splitSounds } from '../../utils/decodability';

export const letterCount = (text) => [...normalizeToken(String(text ?? ''))].length;

export const soundsOf = (text, pack) => (
  splitSounds(normalizeToken(text), pack.sound_inventory ?? [])
);
