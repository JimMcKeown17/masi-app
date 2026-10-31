import React from 'react';
import { View } from 'react-native';
import { tokens } from '../theme/tokens';
import { UiText } from './Text';
import { BottomBar } from './BottomBar';
import { PrimaryButton, SecondaryButton, TextLink } from './Button';

export function DecisionBar({ testIDPrefix: p, onCorrect, onIncorrect, onBack, backDisabled, onEnd, endLabel = 'End test', onSkip, mode = 'deciding', onFinish, correctChoices, onChoose, correcting }: {
  correctChoices?: ReadonlyArray<{ key: string; label: string }>;
  onChoose?: (key: string) => void;
  correcting?: { title: string; detail: string; onCancel: () => void };
  mode?: 'deciding' | 'review';
  onFinish?: () => void;
  testIDPrefix: string;
  onCorrect: () => void;
  onIncorrect: () => void;
  onBack: () => void;
  backDisabled: boolean;
  onEnd: () => void;
  endLabel?: string;
  onSkip?: () => void;
}) {
  if (correctChoices || correcting) {
    const stacked = (correctChoices?.length ?? 0) > 2;
    return (
      <BottomBar>
        {correcting && <>
          <UiText variant="heading" accessibilityRole="header">{correcting.title}</UiText>
          <UiText variant="body" tone="muted">{correcting.detail}</UiText>
        </>}
        {mode === 'review' && !correcting
          ? <PrimaryButton label="Finish" testID={`${p}-finish`} onPress={() => onFinish?.()} />
          : <View testID={`${p}-decisions`} style={{ flexDirection: stacked ? 'column' : 'row', gap: tokens.space.md }}>
            {correctChoices ? correctChoices.map(choice => <PrimaryButton key={choice.key}
              tone="marked" icon="check" label={choice.label} testID={`${p}-choice-${choice.key}`}
              onPress={() => onChoose?.(choice.key)} flex={!stacked} />)
              : <PrimaryButton tone="marked" icon="check" label="Correct" onPress={onCorrect} flex />}
            <PrimaryButton tone="error" icon="cross" label="Incorrect" onPress={onIncorrect} flex={!stacked} />
          </View>}
        {correcting ? <SecondaryButton label="Cancel" onPress={correcting.onCancel} /> : <>
          <SecondaryButton icon="back" label="Back" onPress={onBack} disabled={backDisabled} />
          <View testID={`${p}-navigation`} style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', columnGap: tokens.space.xl, rowGap: tokens.space.xs }}>
            {onSkip && <TextLink label="Skip question" onPress={onSkip} />}
            {mode === 'deciding' && <TextLink tone="danger" label={endLabel} onPress={onEnd} testID={`${p}-end`} />}
          </View>
        </>}
      </BottomBar>
    );
  }
  return (
    <BottomBar>
      {mode === 'review' ? <PrimaryButton label="Finish" testID={`${p}-finish`} onPress={() => onFinish?.()} /> : <View testID={`${p}-decisions`} style={{ flexDirection: 'row', gap: tokens.space.md }}>
        <PrimaryButton tone="marked" icon="check" label="Correct" onPress={onCorrect} flex />
        <PrimaryButton tone="error" icon="cross" label="Incorrect" onPress={onIncorrect} flex />
      </View>}
      <SecondaryButton icon="back" label="Back" onPress={onBack} disabled={backDisabled} />
      <View testID={`${p}-navigation`} style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', columnGap: tokens.space.xl, rowGap: tokens.space.xs }}>
        {onSkip && <TextLink label="Skip question" onPress={onSkip} />}
        {mode === 'deciding' && <TextLink tone="danger" label={endLabel} onPress={onEnd} testID={`${p}-end`} />}
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
