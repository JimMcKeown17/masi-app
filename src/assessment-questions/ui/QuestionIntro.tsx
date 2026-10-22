import React from 'react';
import { ScrollView, View } from 'react-native';
import { tokens } from '../theme/tokens';
import { BottomBar } from './BottomBar';
import { PrimaryButton } from './Button';
import { UiText } from './Text';

export function QuestionIntro({ testID, instructions, startLabel = 'Start', onStart, children }: {
  testID?: string; instructions?: string; startLabel?: string; onStart: () => void; children?: React.ReactNode;
}) {
  return (
    <View testID={testID} style={{ flex: 1, backgroundColor: tokens.color.canvas }}>
      <ScrollView testID={testID ? `${testID}-scroll` : undefined} style={{ flex: 1 }} contentContainerStyle={{ padding: tokens.space.lg, gap: tokens.space.lg }}>
        {instructions && <View style={{ backgroundColor: tokens.color.surface, borderRadius: tokens.radius.card, padding: tokens.space.lg }}><UiText>{instructions}</UiText></View>}
        {children}
      </ScrollView>
      <BottomBar><PrimaryButton label={startLabel} onPress={onStart} /></BottomBar>
    </View>
  );
}
