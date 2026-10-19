import { Animated } from 'react-native';
import { act, renderHook } from '@testing-library/react-native';
import NativeAnimatedHelper from 'react-native/src/private/animated/NativeAnimatedHelper';
import { TIMELINE, useCelebrationTimeline } from '../src/components/sessions/celebrationTimeline';
import { deriveSessionCompleteView } from '../src/utils/sessionCompleteView';
import { deriveGoalState } from '../src/utils/sessionGoal';
import { easing } from '../src/constants/motion';

// RN's native Jest mock ends in 16ms without updating the value. Keep the real
// production configs, but run their timing/stop behaviour on the JS test driver.
let timingSpy;
beforeEach(() => {
  jest.useFakeTimers();
  jest.spyOn(NativeAnimatedHelper, 'shouldUseNativeDriver').mockReturnValue(false);
  timingSpy = jest.spyOn(Animated, 'timing');
});
afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });

const configFor = (value) => timingSpy.mock.calls.find(([v]) => v === value)?.[1];
const goal = (count, target = 3) => ({ count, target, ceiling: 5, state: deriveGoalState({ count, target, ceiling: 5 }) });
const viewFor = (value, motionLevel = 'full', over = {}) => deriveSessionCompleteView({
  goal: value, goalStatus: 'ready', now: new Date('2026-10-13T10:00:00+02:00'), motionLevel,
  params: { childCount: 2, sessionDate: '2026-10-13' }, ...over,
});
const advance = (ms) => act(() => { jest.advanceTimersByTime(ms); });
const readValues = (values) => Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value.__getValue()]));
const loadingThenReady = (view) => {
  const hook = renderHook((props) => useCelebrationTimeline(props), { initialProps: { view, goalStatus: 'loading' } });
  hook.rerender({ view, goalStatus: 'ready' });
  return hook;
};

test('the harness honours native-configured delays, durations, final values and stop', () => {
  const value = new Animated.Value(0);
  const stoppedValue = new Animated.Value(0);
  const config = { toValue: 1, duration: 150, delay: 50, useNativeDriver: true };
  const animation = Animated.timing(value, config);
  const stopped = Animated.timing(stoppedValue, config);
  animation.start();
  stopped.start();
  act(() => { jest.advanceTimersByTime(40); });
  expect(value.__getValue()).toBe(0);
  act(() => { jest.advanceTimersByTime(80); });
  expect(value.__getValue()).toBeGreaterThan(0);
  expect(value.__getValue()).toBeLessThan(1);
  const frozen = stoppedValue.__getValue();
  expect(frozen).toBeGreaterThan(0);
  expect(frozen).toBeLessThan(1);
  stopped.stop();
  act(() => { jest.advanceTimersByTime(140); });
  expect(value.__getValue()).toBe(1);
  expect(stoppedValue.__getValue()).toBe(frozen);
  act(() => { jest.advanceTimersByTime(2000); });
  expect(stoppedValue.__getValue()).toBe(frozen);
});

test('timeline constants preserve every storyboard beat', () => {
  expect(TIMELINE).toEqual({
    cardEnter: { delay: 0, duration: 300 }, pillEnter: { delay: 0, duration: 200 },
    content: { delay: 0, duration: 150 }, earned: { delay: 250, duration: 300 },
    flip: { delay: 650, duration: 150 }, confettiLayer: { delay: 700, duration: 0 },
    confettiTravel: { delay: 700, duration: 300 }, confettiFade: { delay: 1000, duration: 300 },
    headlineTarget: { delay: 800, duration: 300 }, headlineOther: { delay: 100, duration: 300 },
    still: { delay: 0, duration: 150 },
  });
});

test('native tracks ask for the native driver; only the earned sweep is JS-driven', () => {
  const { result } = loadingThenReady(viewFor(goal(3)));
  const v = result.current.values;
  for (const key of ['cardEnter', 'pillEnter', 'content', 'flip', 'confettiLayer', 'confettiTravel', 'confettiFade', 'headline']) {
    const timing = TIMELINE[key === 'headline' ? 'headlineTarget' : key];
    expect(configFor(v[key])).toEqual(expect.objectContaining({ toValue: 1, useNativeDriver: true, duration: timing.duration }));
  }
  expect(configFor(v.earned)).toEqual(expect.objectContaining({ toValue: 1, useNativeDriver: false, duration: 300, easing: easing.sweep }));
  expect(configFor(v.flip).easing).toBe(easing.enter);
  expect(configFor(v.confettiTravel).easing).toBe(easing.sweep);
  expect(configFor(v.content).easing(0.25)).toBe(0.25);
  expect(configFor(v.confettiFade).easing(0.25)).toBe(0.25);
});

test.each(['full', 'calm'])('3/3 %s: flip waits until 650 and finishes by 850; settles after 1300', (level) => {
  const { result } = loadingThenReady(viewFor(goal(3), level));
  advance(649);
  expect(result.current.values.flip.__getValue()).toBe(0);
  expect(result.current.values.confettiLayer.__getValue()).toBe(0);
  advance(50); // 699
  expect(result.current.values.flip.__getValue()).toBeGreaterThan(0);
  expect(result.current.values.flip.__getValue()).toBeLessThan(1);
  expect(result.current.values.confettiLayer.__getValue()).toBe(0);
  advance(151); // 850
  expect(result.current.values.flip.__getValue()).toBe(1);
  expect(result.current.values.confettiLayer.__getValue()).toBe(1);
  expect(result.current.values.confettiTravel.__getValue()).toBeGreaterThan(0);
  expect(result.current.values.confettiTravel.__getValue()).toBeLessThan(1);
  expect(result.current.values.confettiFade.__getValue()).toBe(0);
  expect(result.current.settled).toBe(false);
  advance(440); // 1290
  expect(result.current.settled).toBe(false);
  advance(60); // 1350
  expect(result.current.settled).toBe(true);
  expect(result.current.values.confettiFade.__getValue()).toBe(1);
});

test('the earned sweep is part-way at 400ms (JS driver)', () => {
  const { result } = loadingThenReady(viewFor(goal(3)));
  advance(249);
  expect(result.current.values.earned.__getValue()).toBe(0);
  advance(151);
  expect(result.current.values.earned.__getValue()).toBeGreaterThan(0);
  expect(result.current.values.earned.__getValue()).toBeLessThan(1);
  advance(200);
  expect(result.current.values.earned.__getValue()).toBe(1);
});

test('still: one 150ms fade, no rise, sweep, flip or confetti tracks', () => {
  const view = viewFor(goal(3), 'still');
  const { result, rerender } = renderHook((props) => useCelebrationTimeline(props), { initialProps: { view, goalStatus: 'loading' } });
  expect(result.current.values.cardEnter.__getValue()).toBe(1);
  expect(result.current.values.pillEnter.__getValue()).toBe(1);
  expect(timingSpy).not.toHaveBeenCalled();
  rerender({ view, goalStatus: 'ready' });
  expect(result.current.values.earned.__getValue()).toBe(1);
  expect(result.current.values.flip.__getValue()).toBe(1);
  expect(result.current.settled).toBe(false);
  advance(160);
  expect(readValues(result.current.values)).toEqual({
    cardEnter: 1, pillEnter: 1, content: 1, headline: 1, earned: 1, flip: 1,
    confettiLayer: 0, confettiTravel: 0, confettiFade: 0,
  });
  expect(result.current.settled).toBe(true);
  for (const key of ['cardEnter', 'pillEnter', 'earned', 'flip', 'confettiLayer', 'confettiTravel', 'confettiFade']) {
    expect(configFor(result.current.values[key])).toBeUndefined();
  }
});

test('a goal that fails still fades the headline in (headlineOther)', () => {
  const view = viewFor(null, 'full', { goalStatus: 'failed' });
  const { result } = renderHook(() => useCelebrationTimeline({ view, goalStatus: 'failed' }));
  advance(99);
  expect(result.current.values.headline.__getValue()).toBe(0);
  advance(321);
  expect(result.current.values.headline.__getValue()).toBe(1);
  expect(result.current.settled).toBe(true);
  expect(configFor(result.current.values.earned)).toBeUndefined();
  expect(configFor(result.current.values.flip)).toBeUndefined();
});

test.each([
  ['back-dated', viewFor(goal(3), 'full', { params: { sessionDate: '2026-10-12' } })],
  ['zero', viewFor(goal(0))],
])('%s goal keeps the gauge static and uses the earlier headline', (_, view) => {
  const { result } = loadingThenReady(view);
  expect(result.current.values.earned.__getValue()).toBe(1);
  expect(result.current.values.flip.__getValue()).toBe(1);
  expect(configFor(result.current.values.earned)).toBeUndefined();
  expect(configFor(result.current.values.flip)).toBeUndefined();
  advance(420);
  expect(result.current.values.headline.__getValue()).toBe(1);
  expect(result.current.values.confettiLayer.__getValue()).toBe(0);
  expect(result.current.settled).toBe(true);
});

test.each([goal(2), goal(4, null), goal(6, 3)])('non-target count %j never starts confetti', (value) => {
  const { result } = loadingThenReady(viewFor(value));
  expect(configFor(result.current.values.confettiLayer)).toBeUndefined();
  expect(configFor(result.current.values.confettiTravel)).toBeUndefined();
  expect(configFor(result.current.values.confettiFade)).toBeUndefined();
  if (value.count > value.target || value.target == null) {
    expect(configFor(result.current.values.earned)).toBeUndefined();
    expect(result.current.values.earned.__getValue()).toBe(1);
  }
  advance(420);
  expect(result.current.values.headline.__getValue()).toBe(1);
  expect(result.current.settled).toBe(false);
  advance(430);
  expect(result.current.settled).toBe(true);
});

test('entrances run from mount; the goal tracks wait for resolution and run once with stable values', () => {
  const loading = viewFor(null, 'full', { goalStatus: 'loading' });
  const view = viewFor(goal(3));
  const { result, rerender } = renderHook((props) => useCelebrationTimeline(props), { initialProps: { view: loading, goalStatus: 'loading' } });
  const values = result.current.values;
  advance(100);
  expect(values.cardEnter.__getValue()).toBeGreaterThan(0);
  expect(values.cardEnter.__getValue()).toBeLessThan(1);
  advance(400);
  expect(values.cardEnter.__getValue()).toBe(1);
  expect(values.pillEnter.__getValue()).toBe(1);
  expect(values.content.__getValue()).toBe(0);
  expect(values.headline.__getValue()).toBe(0);
  expect(result.current.settled).toBe(false);
  rerender({ view, goalStatus: 'ready' });
  const calls = timingSpy.mock.calls.length;
  advance(400);
  expect(values.earned.__getValue()).toBeGreaterThan(0);
  expect(values.earned.__getValue()).toBeLessThan(1);
  rerender({ view: { ...view }, goalStatus: 'ready' });
  expect(result.current.values).toBe(values);
  expect(timingSpy.mock.calls).toHaveLength(calls);
  advance(950);
  expect(result.current.settled).toBe(true);
  rerender({ view: { ...view }, goalStatus: 'ready' });
  expect(timingSpy.mock.calls).toHaveLength(calls);
});

test.each([100, 400])('unmounting at %ims stops both composites and delayed tracks without warnings', (ms) => {
  const error = jest.spyOn(console, 'error').mockImplementation(() => {});
  const { result, unmount } = loadingThenReady(viewFor(goal(3)));
  advance(ms);
  const values = result.current.values;
  const frozen = readValues(values);
  expect(result.current.settled).toBe(false);
  unmount();
  advance(2000);
  expect(readValues(values)).toEqual(frozen);
  expect(result.current.settled).toBe(false);
  expect(error).not.toHaveBeenCalled();
});
