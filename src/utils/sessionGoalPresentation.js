// src/utils/sessionGoalPresentation.js
import { colors } from '../constants/colors';

// Locked R3 colour rule, shared by every session gauge.
export function getGaugeColor({ state, count }) {
  switch (state) {
    case 'met': return colors.success;
    case 'exceeded': return colors.accent;
    case 'no_target': return colors.ringNeutral;
    default:
      if (count <= 0) return colors.ringNeutral;
      if (count === 1) return colors.ringStart;
      return colors.primary;
  }
}

export function getGaugeAccessibilityLabel({ state, count, target, ceiling }) {
  switch (state) {
    case 'met': return `${count} of ${target} sessions today. Goal met.`;
    case 'exceeded': return `${count} sessions today. Above the usual maximum of ${ceiling}.`;
    case 'no_target': return `${count} sessions today.`;
    default: return `${count} of ${target} sessions today. Below target.`;
  }
}

// Moved verbatim from HomeScreen.js.
export const getGoalCopy = (goal, isSignedIn) => {
  if (!goal) return null;
  if (goal.state === 'no_target') {
    return {
      title: goal.count + ' ' + (goal.count === 1 ? 'session' : 'sessions') + ' today',
      subtitle: 'This programme has no daily target.',
    };
  }
  if (goal.count === 0) {
    return {
      title: 'No sessions yet today',
      subtitle: isSignedIn ? 'Record your first session.' : 'Clock in to start your day.',
    };
  }
  if (goal.state === 'exceeded') {
    return {
      title: goal.count + ' sessions today',
      subtitle: 'Above the usual maximum of ' + goal.ceiling + '.',
    };
  }
  if (goal.state === 'met') {
    return {
      title: goal.count + ' of ' + goal.target + ' sessions today',
      subtitle: 'Daily target reached.',
    };
  }
  const remaining = goal.target - goal.count;
  return {
    title: goal.count + ' of ' + goal.target + ' sessions today',
    subtitle: remaining === 1
      ? 'One more pair reaches your target.'
      : remaining + ' more pairs reach your target.',
  };
};
