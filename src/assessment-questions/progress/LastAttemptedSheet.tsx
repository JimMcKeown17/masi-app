import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { tokens } from '../theme/tokens';
import { BottomBar, Canvas, MarkTile, PrimaryButton, TextLink, TileGroups, UiText } from '../ui';
import { NO_ATTEMPT } from './applyProgress';

export function LastAttemptedSheet({
  labels,
  rowLengths,
  defaultIndex,
  onConfirm,
  onCancel,
}: {
  labels: string[];
  rowLengths?: number[];
  defaultIndex: number | null;
  onConfirm: (index: number) => void;
  onCancel?: () => void;
}) {
  const [selected, setSelected] = useState(defaultIndex);
  const rows: number[][] = [];
  let cursor = 0;
  for (const len of rowLengths ?? [labels.length]) {
    rows.push(Array.from({ length: len }, (_, i) => cursor + i).filter((i) => i < labels.length));
    cursor += len;
  }
  if (cursor < labels.length) rows.push(Array.from({ length: labels.length - cursor }, (_, i) => cursor + i));

  return (
    <Canvas>
      <TileGroups
        header={
          <View style={styles.header}>
            <UiText variant="heading">Last item attempted</UiText>
            <UiText tone="muted">Tap the last item the child attempted.</UiText>
          </View>
        }
        groups={rows.map((row, r) => ({ key: String(r), items: row }))}
        renderTile={(i) => (
          <MarkTile
            variant="pill"
            state={i === selected ? 'current' : selected !== null && selected >= 0 && i > selected ? 'notReached' : 'idle'}
            text={labels[i]}
            accessibilityLabel={`${labels[i]}, item ${i + 1}`}
            onPress={() => setSelected(i)}
          />
        )}
      />
      <BottomBar>
        <View style={styles.navigation}>
          <TextLink label="Reached the end" onPress={() => onConfirm(labels.length - 1)} />
          <TextLink label="Nothing attempted" onPress={() => onConfirm(NO_ATTEMPT)} />
          {onCancel ? (
            <TextLink label="Cancel" onPress={onCancel} />
          ) : null}
        </View>
        <PrimaryButton
          label="Confirm"
          disabled={selected === null}
          onPress={() => { if (selected !== null) onConfirm(selected); }}
        />
      </BottomBar>
    </Canvas>
  );
}

const styles = StyleSheet.create({
  header: { gap: tokens.space.sm },
  navigation: {
    flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center',
    columnGap: tokens.space.xl, rowGap: tokens.space.xs,
  },
});
