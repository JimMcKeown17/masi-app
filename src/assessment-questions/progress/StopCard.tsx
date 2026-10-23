import React from 'react';
import type { StopRule } from './stepByStep';
import { ConfirmSheet, TextLink } from '../ui';

export function StopCard({ childName, stopRule, onSave, onUndo }: {
  childName?: string;
  stopRule: StopRule;
  onSave: () => void;
  onUndo: () => void;
}) {
  return (
    <ConfirmSheet testID="stop-card"
      title={stopRule.kind === 'consecutive_wrong'
        ? `${childName ?? 'The child'} got ${stopRule.stop_at} in a row wrong. The test has stopped.`
        : `${childName ?? 'The child'} got every item in the first row wrong. The test has stopped.`}
      confirmLabel="Save result" onConfirm={onSave}>
      <TextLink label="Undo last mark" onPress={onUndo} />
    </ConfirmSheet>
  );
}
