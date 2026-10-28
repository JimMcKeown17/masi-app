import React, { useCallback } from 'react';
import BottomSheet from '../common/BottomSheet';
import BrandButton from '../common/BrandButton';
import InlineNote from '../common/InlineNote';
import LetterToggleGrid from '../sessions/LetterToggleGrid';

export default function OtherLetterSheet({ visible, onDismiss, letters, selected, onToggle, error }) {
  const tileFor = useCallback(letter => ({
    tone: selected.includes(letter) ? 'selected' : 'rest',
    accessibilityLabel: `${letter.toUpperCase()}, ${selected.includes(letter) ? 'selected' : 'not selected'}`,
    accessibilityState: { selected: selected.includes(letter) },
  }), [selected]);
  return <BottomSheet visible={visible} title="Choose the letters you teach" onDismiss={onDismiss}
    dismissLabel="Close" keyboardAvoiding={false}
    footer={<BrandButton label="Done" onPress={onDismiss} />}>
    {error ? <InlineNote>{error}</InlineNote> : null}
    <LetterToggleGrid letters={letters} tileFor={tileFor} onPressLetter={onToggle} />
  </BottomSheet>;
}
