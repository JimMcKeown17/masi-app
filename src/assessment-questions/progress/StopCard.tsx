import React from 'react';
import { ConfirmSheet, TextLink } from '../ui';

export function StopCard({ childName, stopAt, onSave, onUndo }: {
  childName?: string;
  stopAt: number;
  onSave: () => void;
  onUndo: () => void;
}) {
  return (
    <ConfirmSheet testID="stop-card"
      title={`${childName ?? 'The child'} got ${stopAt} in a row wrong. The test has stopped.`}
      confirmLabel="Save result" onConfirm={onSave}>
      <TextLink label="Undo last mark" onPress={onUndo} />
    </ConfirmSheet>
  );
}
