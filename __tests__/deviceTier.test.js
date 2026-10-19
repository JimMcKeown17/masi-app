import { classifyTier, motionLevelForTier } from '../src/utils/deviceTier';

const GIB = 1024 ** 3;
test.each([
  [{ platform: 'android', totalMemory: 2.9 * GIB, deviceYearClass: 2021, reduceMotion: true }, 'static'],
  [{ platform: 'ios', totalMemory: 1 * GIB }, 'high'],
  [{ platform: 'android', totalMemory: 1.49 * GIB, deviceYearClass: 2022 }, 'static'],
  [{ platform: 'android', totalMemory: 1.5 * GIB, deviceYearClass: 2022 }, 'low'],
  [{ platform: 'android', totalMemory: 6 * GIB, deviceYearClass: 2018 }, 'low'],
  [{ platform: 'android', totalMemory: 3 * GIB - 1, deviceYearClass: 2022 }, 'low'],
  [{ platform: 'android', totalMemory: 3 * GIB, deviceYearClass: 2022 }, 'high'],
  [{ platform: 'android' }, 'low'],
  [{ platform: 'android', deviceYearClass: 2022 }, 'high'],
  [{ platform: 'android', totalMemory: 4 * GIB, deviceYearClass: null }, 'high'],
])('classifyTier(%o) is %s', (signals, tier) => {
  expect(classifyTier(signals)).toBe(tier);
});
test('levels map static→still, low→calm, high→full', () => {
  expect(['static', 'low', 'high'].map(motionLevelForTier)).toEqual(['still', 'calm', 'full']);
});
