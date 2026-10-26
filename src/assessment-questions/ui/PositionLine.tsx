import React from 'react';
import { StyleSheet, View } from 'react-native';
import { tokens } from '../theme/tokens';
import { UiText } from './Text';

export type LinePart = { text: string; strong?: boolean };

export function PositionLine({ parts, testID }: { parts: ReadonlyArray<LinePart>; testID?: string }) {
  // The wrapper sizes the Text to its content: a stretched, centred Text with nested spans
  // drew flush-left on Android (A03, 2026-10-26).
  return (
    <View style={styles.line}>
      <UiText testID={testID} variant="caption" tone="muted" align="center" accessibilityLabel={parts.map(part => part.text).join('')}>
        {parts.map((part, index) => part.strong
          ? <UiText key={index} variant="captionStrong" tone="ink">{part.text}</UiText>
          : part.text)}
      </UiText>
    </View>
  );
}

const styles = StyleSheet.create({
  line: { paddingHorizontal: tokens.space.lg, alignItems: 'center' },
});
