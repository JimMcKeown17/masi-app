import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { tokens } from '../theme/tokens';
import { UiText } from './Text';

export function SelectChip({ label, selected, onPress, testID, accessibilityLabel }: {
  label: string;
  selected: boolean;
  onPress: () => void;
  testID: string;
  accessibilityLabel?: string;
}): React.JSX.Element {
  return (
    <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected }} onPress={onPress}
      style={({ pressed }) => [styles.chip, {
        backgroundColor: selected ? tokens.color.ink : tokens.color.surface,
        borderColor: selected ? tokens.color.ink : tokens.color.line,
        opacity: pressed ? 0.85 : 1,
      }]}>
      <UiText variant="label" tone={selected ? 'onInk' : 'ink'} align="center" style={{ flexShrink: 1 }}>{label}</UiText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: 48, maxWidth: '100%', borderRadius: tokens.radius.tile, borderWidth: 1,
    paddingHorizontal: tokens.space.lg, paddingVertical: tokens.space.sm,
    alignItems: 'center', justifyContent: 'center',
  },
});
