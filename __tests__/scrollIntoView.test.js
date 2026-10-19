import { computeScrollTarget } from '../src/utils/scrollIntoView';

test.each([
  ['fully visible', { blockY: 20, blockHeight: 60, scrollY: 10, viewportHeight: 108 }, null],
  ['exactly fills the viewport', { blockY: 10, blockHeight: 108, scrollY: 10, viewportHeight: 108 }, null],
  ['touches the bottom edge', { blockY: 50, blockHeight: 68, scrollY: 10, viewportHeight: 108 }, null],
  ['below the viewport', { blockY: 140, blockHeight: 102, scrollY: 0, viewportHeight: 108 }, 134],
  ['partly below a scrolled viewport', { blockY: 140, blockHeight: 102, scrollY: 120, viewportHeight: 108 }, 134],
  ['partly above the viewport', { blockY: 20, blockHeight: 60, scrollY: 40, viewportHeight: 108 }, 20],
  ['taller than the viewport', { blockY: 140, blockHeight: 120, scrollY: 0, viewportHeight: 90 }, 140],
  ['tall block straddles the viewport', { blockY: 20, blockHeight: 120, scrollY: 40, viewportHeight: 90 }, 20],
])('%s scrolls only as far as needed', (_name, layout, expected) => {
  expect(computeScrollTarget(layout)).toBe(expected);
});
