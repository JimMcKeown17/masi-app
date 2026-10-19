import { colors } from '../../constants/colors';
import { getGaugeColor } from '../../utils/sessionGoalPresentation';

function gaugeSize(width, stroke) {
  const cx = width / 2;
  const cy = cx;
  return {
    width, height: cy + stroke / 2 + 1, cx, cy,
    r: width / 2 - stroke / 2 - 0.5, stroke, gapDeg: 5, maxSegments: 6,
  };
}

export const GAUGE_SIZES = {
  home: gaugeSize(176, 16),
  celebration: gaugeSize(232, 22),
};

const fmt = (n) => n.toFixed(2);
const point = (deg, size) => {
  const rad = (deg * Math.PI) / 180;
  return [size.cx + size.r * Math.cos(rad), size.cy - size.r * Math.sin(rad)];
};
// From the larger angle to the smaller one, i.e. left to right over the top.
const arcPath = (fromDeg, toDeg, size) => {
  const [x1, y1] = point(fromDeg, size);
  const [x2, y2] = point(toDeg, size);
  return `M ${fmt(x1)} ${fmt(y1)} A ${size.r} ${size.r} 0 0 1 ${fmt(x2)} ${fmt(y2)}`;
};

export function buildGaugeGeometry(goal, size = GAUGE_SIZES.home) {
  const { state, count = 0, target } = goal;
  const color = getGaugeColor(goal);

  if (state === 'no_target' || !target) {
    return {
      arcs: [{ d: arcPath(180, 0, size), color: colors.ringNeutral }],
      startDot: { color: colors.ringNeutral },
      endDot: { color: colors.ringNeutral },
    };
  }

  const full = state === 'met' || state === 'exceeded';

  if (target > size.maxSegments) {
    const fraction = full ? 1 : Math.min(Math.max(count, 0) / target, 1);
    const arcs = [{ d: arcPath(180, 0, size), color: colors.border }];
    if (fraction > 0) arcs.push({ d: arcPath(180, 180 - 180 * fraction, size), color });
    return {
      arcs,
      startDot: { color: count > 0 ? color : colors.ringNeutral },
      endDot: { color: fraction >= 1 ? color : colors.border },
    };
  }

  const span = (180 - size.gapDeg * (target - 1)) / target;
  const filled = full ? target : Math.min(Math.max(count, 0), target);
  const arcs = Array.from({ length: target }, (_, i) => {
    const from = 180 - i * (span + size.gapDeg);
    return { d: arcPath(from, from - span, size), color: i < filled ? color : colors.border };
  });
  return {
    arcs,
    startDot: { color: filled > 0 ? arcs[0].color : colors.ringNeutral },
    endDot: { color: arcs[arcs.length - 1].color },
  };
}

export function buildEarnedArc({ target, count, state }, size = GAUGE_SIZES.home) {
  if (state === 'no_target' || !target || count < 1 || count > target) return null;

  const continuous = target > size.maxSegments;
  const span = continuous ? 180 / target : (180 - size.gapDeg * (target - 1)) / target;
  const from = continuous
    ? 180 - 180 * (count - 1) / target
    : 180 - (count - 1) * (span + size.gapDeg);
  const to = continuous ? 180 - 180 * count / target : from - span;
  return { d: arcPath(from, to, size), length: size.r * span * Math.PI / 180 };
}

export function buildSkeletonGeometry(size) {
  return {
    arcs: [{ d: arcPath(180, 0, size), color: colors.border }],
    startDot: { color: colors.border },
    endDot: { color: colors.border },
  };
}
