// src/components/home/sessionGaugeGeometry.js
import { colors } from '../../constants/colors';
import { getGaugeColor } from '../../utils/sessionGoalPresentation';

export const GAUGE = { width: 176, height: 97, cx: 88, cy: 88, r: 79.5, stroke: 16, gapDeg: 5, maxSegments: 6 };

const fmt = (n) => n.toFixed(2);
const point = (deg) => {
  const rad = (deg * Math.PI) / 180;
  return [GAUGE.cx + GAUGE.r * Math.cos(rad), GAUGE.cy - GAUGE.r * Math.sin(rad)];
};
// From the larger angle to the smaller one, i.e. left to right over the top.
const arcPath = (fromDeg, toDeg) => {
  const [x1, y1] = point(fromDeg);
  const [x2, y2] = point(toDeg);
  return `M ${fmt(x1)} ${fmt(y1)} A ${GAUGE.r} ${GAUGE.r} 0 0 1 ${fmt(x2)} ${fmt(y2)}`;
};

export function buildGaugeGeometry(goal) {
  const { state, count = 0, target } = goal;
  const color = getGaugeColor(goal);

  if (state === 'no_target' || !target) {
    return {
      arcs: [{ d: arcPath(180, 0), color: colors.ringNeutral }],
      startDot: { color: colors.ringNeutral },
      endDot: { color: colors.ringNeutral },
    };
  }

  const full = state === 'met' || state === 'exceeded';

  if (target > GAUGE.maxSegments) {
    const fraction = full ? 1 : Math.min(Math.max(count, 0) / target, 1);
    const arcs = [{ d: arcPath(180, 0), color: colors.border }];
    if (fraction > 0) arcs.push({ d: arcPath(180, 180 - 180 * fraction), color });
    return {
      arcs,
      startDot: { color: count > 0 ? color : colors.ringNeutral },
      endDot: { color: fraction >= 1 ? color : colors.border },
    };
  }

  const span = (180 - GAUGE.gapDeg * (target - 1)) / target;
  const filled = full ? target : Math.min(Math.max(count, 0), target);
  const arcs = Array.from({ length: target }, (_, i) => {
    const from = 180 - i * (span + GAUGE.gapDeg);
    return { d: arcPath(from, from - span), color: i < filled ? color : colors.border };
  });
  return {
    arcs,
    startDot: { color: filled > 0 ? arcs[0].color : colors.ringNeutral },
    endDot: { color: arcs[arcs.length - 1].color },
  };
}
