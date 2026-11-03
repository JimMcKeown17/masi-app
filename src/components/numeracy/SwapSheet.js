import React from 'react';
import BottomSheet from '../common/BottomSheet';
import SelectableRow from '../forms/SelectableRow';
import { stepTitle, readyLine } from '../../numeracyLesson/copy';

export default function SwapSheet({ visible, onDismiss, options, currentStepKey, curriculum, readinessFor, onPick }) {
  return <BottomSheet visible={visible} onDismiss={onDismiss} title="Choose a step">
    {options.map(({ step_key, review }, index) => <SelectableRow key={step_key} variant="radio"
      title={stepTitle(curriculum, step_key)} subtitle={review ? 'Practise again' : readyLine(readinessFor(step_key))}
      selected={step_key === currentStepKey} onPress={() => onPick(step_key)}
      position={options.length === 1 ? 'only' : index === 0 ? 'first' : index === options.length - 1 ? 'last' : undefined} />)}
  </BottomSheet>;
}
