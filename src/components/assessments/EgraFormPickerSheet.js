import React, { useState } from 'react';
import SelectSheet from '../common/SelectSheet';
import { listEgraForms } from '../../assessment-questions/egra';

const VARIANT_LABELS = { hl: 'Home Language', fal: 'First Additional Language', smrs: 'SMRS' };
const OPTIONS = listEgraForms().map(form => ({
  key: form.id,
  label: form.title,
  description: `${form.languageName} · ${VARIANT_LABELS[form.variant]}`,
}));

export default function EgraFormPickerSheet({ visible, onDismiss, onConfirm }) {
  // Choosing a form is always explicit, so each opening gets a fresh sheet with nothing selected.
  // The sheet stays mounted while closed so it can play its closing animation.
  const [openCount, setOpenCount] = useState(0);
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) setOpenCount(count => count + 1);
  }
  return <SelectSheet key={openCount} visible={visible} title="Choose an EGRA form" options={OPTIONS}
    selectedKey={null} onSelect={onConfirm} onDismiss={onDismiss}
    confirmLabel="Continue" cancelLabel="Cancel" />;
}
