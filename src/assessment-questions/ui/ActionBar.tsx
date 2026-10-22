import React from 'react';
import { View } from 'react-native';
import { tokens } from '../theme/tokens';
import { BottomBar } from './BottomBar';
import { PrimaryButton, SecondaryButton, TextLink } from './Button';

export function DecisionBar({ testIDPrefix: p, onCorrect, onIncorrect, onBack, backDisabled, onEnd, endLabel = 'End test', onSkip }: {
  testIDPrefix: string;
  onCorrect: () => void;
  onIncorrect: () => void;
  onBack: () => void;
  backDisabled: boolean;
  onEnd: () => void;
  endLabel?: string;
  onSkip?: () => void;
}) {
  return (
    <BottomBar>
      <View testID={`${p}-decisions`} style={{ flexDirection: 'row', gap: tokens.space.md }}>
        <PrimaryButton tone="marked" icon="check" label="Correct" onPress={onCorrect} flex />
        <PrimaryButton tone="error" icon="cross" label="Incorrect" onPress={onIncorrect} flex />
      </View>
      <SecondaryButton icon="back" label="Back" onPress={onBack} disabled={backDisabled} />
      <View testID={`${p}-navigation`} style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', columnGap: tokens.space.xl, rowGap: tokens.space.xs }}>
        {onSkip && <TextLink label="Skip question" onPress={onSkip} />}
        <TextLink tone="danger" label={endLabel} onPress={onEnd} testID={`${p}-end`} />
      </View>
    </BottomBar>
  );
}

export function ToggleBar({ primary, onSkip, header }: {
  primary: { label: string; onPress: () => void }; onSkip?: () => void; header?: React.ReactNode;
}) {
  return (
    <BottomBar>
      {header}
      <PrimaryButton {...primary} />
      {onSkip && <View style={{ alignItems: 'center', justifyContent: 'center' }}><TextLink label="Skip question" onPress={onSkip} /></View>}
    </BottomBar>
  );
}
