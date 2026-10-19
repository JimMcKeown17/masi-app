import { computeHeroArtLayout } from '../src/components/auth/loginHeroGeometry';

const layout = (windowWidth, windowHeight, anchorPanelTop, panelTop = anchorPanelTop) =>
  computeHeroArtLayout({ windowWidth, windowHeight, anchorPanelTop, panelTop });

test('390x844 reproduces red-login-final', () => {
  const r = layout(390, 844, 446);
  expect(r.scale).toBe(1);
  expect(r.offsetX).toBe(0);
  expect(r.offsetY).toBeCloseTo(0, 5);
  expect(r.visible).toBe(true);
});

test('360x640 reproduces red-login-s-compact', () => {
  const r = layout(360, 640, 260);
  expect(r.scale).toBeCloseTo(0.74, 5);
  expect(r.offsetX).toBeCloseTo(71.4, 5);
  expect(r.offsetY).toBeCloseTo(-11.388, 3);
  expect(r.visible).toBe(true);
});

test('a tall phone keeps the learner tucked behind the panel', () => {
  const r = layout(430, 932, 520);
  expect(r.scale).toBe(1);
  expect(r.offsetX).toBe(40);
  expect(r.offsetY).toBeCloseTo(74, 5);
  // The learner bottom sits 94dp behind the panel top.
  expect(r.offsetY + 540 * r.scale - 520).toBeCloseTo(94, 5);
});

test('scale clamps to [0.74, 1]', () => {
  expect(layout(360, 560, 200).scale).toBeCloseTo(0.74, 5);
  expect(layout(430, 1000, 600).scale).toBe(1);
});

test('a growing panel does not move the art (offset follows the anchor)', () => {
  const rest = layout(390, 844, 446, 446);
  const withNote = layout(390, 844, 446, 380);
  expect(withNote.offsetY).toBe(rest.offsetY);
  expect(withNote.offsetX).toBe(rest.offsetX);
  expect(withNote.scale).toBe(rest.scale);
  expect(withNote.visible).toBe(true);
});

test('large text on a short phone hides a lone head', () => {
  expect(layout(360, 640, 150).visible).toBe(false);
  // Exactly 120dp visible is still shown; less than that is hidden.
  const r = layout(390, 844, 446);
  expect(layout(390, 844, 446, r.offsetY + 110 + 120).visible).toBe(true);
  expect(layout(390, 844, 446, r.offsetY + 110 + 119).visible).toBe(false);
});
