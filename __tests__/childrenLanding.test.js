import { getChildrenLanding } from '../src/utils/childrenLanding';

// The Children tab auto-routes a single-class EA straight into that class, and
// shows the class list otherwise. It keys off the count of classes the EA has
// children in — NOT the EA's programme.

describe('getChildrenLanding', () => {
  test('exactly one class → auto-route into it', () => {
    expect(getChildrenLanding([{ id: 'class-a' }])).toEqual({
      autoRoute: true,
      classId: 'class-a',
    });
  });

  test('no classes → show the list (no auto-route)', () => {
    expect(getChildrenLanding([])).toEqual({ autoRoute: false });
    // Missing input must not crash.
    expect(getChildrenLanding(undefined)).toEqual({ autoRoute: false });
  });

  test('two or more classes → show the list (no auto-route)', () => {
    expect(getChildrenLanding([{ id: 'class-a' }, { id: 'class-b' }])).toEqual({ autoRoute: false });
    expect(
      getChildrenLanding([{ id: 'a' }, { id: 'b' }, { id: 'c' }])
    ).toEqual({ autoRoute: false });
  });
});
