import React from 'react';
import { StyleSheet } from 'react-native';
import { tokens } from '../theme/tokens';
import { Canvas, UiText } from '../ui';

export function MissingItemSet({ language }: { language: string }) {
  return (
    <Canvas style={styles.root} testID={`missing-item-set-${language}`}>
      <UiText accessibilityRole="alert" align="center">
        This test has no card for this language yet.
      </UiText>
    </Canvas>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: tokens.space.xl,
  },
});
