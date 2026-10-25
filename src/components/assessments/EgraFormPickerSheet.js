import React from 'react';
import SelectSheet from '../common/SelectSheet';
import { listEgraForms } from '../../assessment-questions/egra';

const VARIANT_LABELS = { hl: 'Home Language', fal: 'First Additional Language', smrs: 'SMRS' };
const OPTIONS = listEgraForms().map(form => ({
  key: form.id,
  label: form.title,
  description: `${form.languageName} · ${VARIANT_LABELS[form.variant]}`,
}));

export default function EgraFormPickerSheet({ visible, onDismiss, onConfirm }) {
  // Remount the selection on each opening: choosing a form is always explicit.
  if (!visible) return null;
  return <SelectSheet visible title="Choose an EGRA form" options={OPTIONS}
    selectedKey={null} onSelect={onConfirm} onDismiss={onDismiss}
    confirmLabel="Continue" cancelLabel="Cancel" />;
}
