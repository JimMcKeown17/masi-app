import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { tokens } from '../theme/tokens';

export function MissingItemSet({ language }: { language: string }) {
  return (
    <View style={styles.root} testID={`missing-item-set-${language}`}>
      <Text accessibilityRole="alert" style={styles.message}>
        This test has no card for this language yet.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: tokens.space.xl,
    backgroundColor: tokens.color.surface,
  },
  message: {
    color: tokens.color.ink,
    fontSize: tokens.font.body,
    textAlign: 'center',
  },
});
