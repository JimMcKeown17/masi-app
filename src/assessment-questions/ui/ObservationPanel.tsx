import React, { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { tokens } from '../theme/tokens';
import { BottomBar } from './BottomBar';
import { PrimaryButton } from './Button';
import { Canvas } from './Canvas';
import { SelectChip } from './SelectChip';
import { UiText } from './Text';

export function ObservationPanel({ title, options, confirmLabel, onConfirm, testID }: {
  title: string;
  options: ReadonlyArray<{ key: string; label: string; exclusive?: boolean }>;
  confirmLabel: string;
  onConfirm: (keys: string[]) => void;
  testID: string;
}): React.JSX.Element {
  const [selected, setSelected] = useState<string[]>([]);
  const keys = options.filter(option => selected.includes(option.key)).map(option => option.key);

  function toggle(option: typeof options[number]) {
    setSelected(previous => {
      if (previous.includes(option.key)) return previous.filter(key => key !== option.key);
      if (option.exclusive) return [option.key];
      const exclusiveKeys = new Set(options.filter(value => value.exclusive).map(value => value.key));
      return [...previous.filter(key => !exclusiveKeys.has(key)), option.key];
    });
  }

  return (
    <Canvas testID={testID}>
      <ScrollView contentContainerStyle={styles.content}>
        <UiText variant="heading" accessibilityRole="header">{title}</UiText>
        <View style={styles.chips}>
          {options.map(option => <SelectChip key={option.key} label={option.label}
            testID={`${testID}-choice-${option.key}`} selected={selected.includes(option.key)} onPress={() => toggle(option)} />)}
        </View>
      </ScrollView>
      <BottomBar><PrimaryButton label={confirmLabel} disabled={keys.length === 0}
        onPress={() => { if (keys.length > 0) onConfirm(keys); }} /></BottomBar>
    </Canvas>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, padding: tokens.space.lg, gap: tokens.space.lg },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: tokens.space.sm },
});
