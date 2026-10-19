import { colors } from '../../constants/colors';

// C3 three-fan storyboard, relative to the screen centre and card top.
export const CONFETTI_PIECES = [
  { kind: 'sliver', color: colors.surface, dx: -100.8, dy: -33.7, rot: -31, ux: -0.51, uy: -0.86 },
  { kind: 'dot', color: colors.surface, dx: -122.9, dy: -23.3, rot: 0, ux: -0.62, uy: -0.79 },
  { kind: 'square', color: colors.surface, dx: -100.6, dy: -63.5, rot: 18, ux: -0.45, uy: -0.89 },
  { kind: 'sliver', color: colors.surface, dx: -124.0, dy: -49.8, rot: -34, ux: -0.56, uy: -0.83 },
  { kind: 'dot', color: colors.red100, dx: -148.1, dy: -36.3, rot: 0, ux: -0.66, uy: -0.75 },
  { kind: 'dot', color: colors.red200, dx: -100.7, dy: -92.3, rot: 0, ux: -0.40, uy: -0.92 },
  { kind: 'sliver', color: colors.surface, dx: -132.3, dy: -77.7, rot: -32, ux: -0.53, uy: -0.85 },
  { kind: 'square', color: colors.red200, dx: -163.1, dy: -60.3, rot: 5, ux: -0.64, uy: -0.76 },
  { kind: 'dot', color: colors.surface, dx: 0.0, dy: -19.7, rot: 0, ux: 0.00, uy: -1.00 },
  { kind: 'square', color: colors.red200, dx: 18.4, dy: -40.7, rot: 51, ux: 0.11, uy: -0.99 },
  { kind: 'dot', color: colors.surface, dx: -18.4, dy: -40.7, rot: 0, ux: -0.11, uy: -0.99 },
  { kind: 'dot', color: colors.red100, dx: 44.9, dy: -60.6, rot: 0, ux: 0.22, uy: -0.97 },
  { kind: 'square', color: colors.surface, dx: 0.0, dy: -63.7, rot: 45, ux: 0.00, uy: -1.00 },
  { kind: 'dot', color: colors.red100, dx: -44.9, dy: -60.6, rot: 0, ux: -0.22, uy: -0.97 },
  { kind: 'sliver', color: colors.surface, dx: 103.9, dy: -38.9, rot: 31, ux: 0.52, uy: -0.86 },
  { kind: 'dot', color: colors.surface, dx: 119.2, dy: -18.6, rot: 0, ux: 0.62, uy: -0.79 },
  { kind: 'square', color: colors.surface, dx: 98.8, dy: -60.0, rot: 72, ux: 0.45, uy: -0.89 },
  { kind: 'sliver', color: colors.surface, dx: 127.3, dy: -54.8, rot: 34, ux: 0.55, uy: -0.83 },
  { kind: 'dot', color: colors.red100, dx: 148.3, dy: -30.7, rot: 0, ux: 0.67, uy: -0.75 },
  { kind: 'dot', color: colors.red200, dx: 99.1, dy: -88.6, rot: 0, ux: 0.41, uy: -0.91 },
  { kind: 'sliver', color: colors.surface, dx: 134.4, dy: -81.1, rot: 32, ux: 0.53, uy: -0.85 },
  { kind: 'square', color: colors.red200, dx: 159.2, dy: -55.7, rot: 85, ux: 0.64, uy: -0.77 },
];

export const CONFETTI_SIZES = {
  sliver: { w: 3.5, h: 14, radius: 1.5 },
  dot: { w: 8, h: 8, radius: 4 },
  square: { w: 8, h: 8, radius: 1.2 },
};

export function placeConfetti(width) {
  const scale = Math.min(1, width / 390);
  return CONFETTI_PIECES.map((piece) => ({
    ...piece, ...CONFETTI_SIZES[piece.kind], x: width / 2 + piece.dx * scale, y: piece.dy,
  }));
}
