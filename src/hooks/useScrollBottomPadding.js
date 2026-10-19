import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { spacing } from '../constants/colors';

// Root-stack scroll content owns this inset only when no sibling footer does.
export function useScrollBottomPadding(extra = spacing.lg) {
  const insets = useSafeAreaInsets();
  return insets.bottom + extra;
}
