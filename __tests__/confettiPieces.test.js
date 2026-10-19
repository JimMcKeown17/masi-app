import { CONFETTI_PIECES, CONFETTI_SIZES, placeConfetti } from '../src/components/sessions/confettiPieces';
import { colors } from '../src/constants/colors';
import { haloGeometry } from '../src/utils/haloGeometry';

const extents = ({ kind, rot, w, h }) => {
  if (kind === 'dot') return [w / 2, h / 2];
  const c = Math.abs(Math.cos((rot * Math.PI) / 180));
  const s = Math.abs(Math.sin((rot * Math.PI) / 180));
  return [(w / 2) * c + (h / 2) * s, (w / 2) * s + (h / 2) * c];
};

test('22 pieces in white, red100 and red200 only (never green)', () => {
  expect(CONFETTI_PIECES).toHaveLength(22);
  expect(new Set(CONFETTI_PIECES.map((p) => p.color)))
    .toEqual(new Set([colors.surface, colors.red100, colors.red200]));
});

test('the three piece sizes match the storyboard', () => {
  expect(CONFETTI_SIZES).toEqual({
    sliver: { w: 3.5, h: 14, radius: 1.5 },
    dot: { w: 8, h: 8, radius: 4 },
    square: { w: 8, h: 8, radius: 1.2 },
  });
});

test.each([360, 390])('at rest at %idp nothing touches the frame, card or headline', (width) => {
  const { headlineGap } = haloGeometry(width);
  for (const piece of placeConfetti(width)) {
    const [hx, hy] = extents(piece);
    expect(piece.x - hx).toBeGreaterThanOrEqual(12);
    expect(width - (piece.x + hx)).toBeGreaterThanOrEqual(12);
    expect(piece.y + hy).toBeLessThanOrEqual(-12);
    expect(piece.y - hy).toBeGreaterThanOrEqual(-headlineGap + 8);
  }
});

test('outer pieces scale in on narrow phones without stretching above 390dp', () => {
  expect(placeConfetti(360)[7].x).toBeCloseTo(180 - 163.1 * (360 / 390), 5);
  expect(placeConfetti(430)[7].x).toBeCloseTo(215 - 163.1, 5);
});

test('placement keeps the table and vertical coordinates unchanged', () => {
  for (const width of [360, 390, 430]) {
    placeConfetti(width).forEach((piece, index) => {
      expect(piece).toEqual(expect.objectContaining({
        ...CONFETTI_PIECES[index], ...CONFETTI_SIZES[piece.kind], y: CONFETTI_PIECES[index].dy,
      }));
    });
  }
});
