import { computeLoginLayout } from '../src/screens/auth/loginLayout';

test('rest reproduces both boards’ lockup top', () => {
  expect(computeLoginLayout({ windowHeight: 844, insetsTop: 47, keyboardHeight: 0, standardPanelHeight: 360 }))
    .toEqual({ mode: 'rest', lockupTop: 56, showLockup: true });
  expect(computeLoginLayout({ windowHeight: 640, insetsTop: 24, keyboardHeight: 0, standardPanelHeight: 348 }).lockupTop)
    .toBe(40);
});

test('a 390x844 phone keeps the standard keyboard layout', () => {
  expect(computeLoginLayout({ windowHeight: 844, insetsTop: 47, keyboardHeight: 336, standardPanelHeight: 360 }))
    .toEqual({ mode: 'keyboard', lockupTop: 56, showLockup: true });
});

test('360x640 with a 280 keyboard goes compact and hides the lockup', () => {
  expect(computeLoginLayout({ windowHeight: 640, insetsTop: 24, keyboardHeight: 280, standardPanelHeight: 348 }))
    .toEqual({ mode: 'keyboardCompact', lockupTop: 40, showLockup: false });
});

test('a note pushes a 360x780 phone into compact', () => {
  const base = { windowHeight: 780, insetsTop: 24, keyboardHeight: 300 };
  expect(computeLoginLayout({ ...base, standardPanelHeight: 348 }).mode).toBe('keyboard');
  expect(computeLoginLayout({ ...base, standardPanelHeight: 398 }).mode).toBe('keyboardCompact');
});

test('an unmeasured panel never forces compact', () => {
  expect(computeLoginLayout({ windowHeight: 640, insetsTop: 24, keyboardHeight: 280, standardPanelHeight: null }).mode)
    .toBe('keyboard');
});

test('an exact fit keeps the lockup; one extra dp switches to compact', () => {
  const base = { windowHeight: 780, insetsTop: 24, keyboardHeight: 300 };
  expect(computeLoginLayout({ ...base, standardPanelHeight: 366 }).mode).toBe('keyboard');
  expect(computeLoginLayout({ ...base, standardPanelHeight: 367 }).mode).toBe('keyboardCompact');
});
