import React from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { tokens } from '../theme/tokens';
import { BottomBar, Canvas, SecondaryButton, TextLink, UiText } from '../ui';
import { MANUAL_SKIP_REASONS, type ManualSkipReason } from './skipReasons';

export function SkipReasonPicker({
  onChoose,
  onCancel,
}: {
  onChoose: (reason: ManualSkipReason) => void;
  onCancel: () => void;
}) {
  return (
    <Canvas>
      <ScrollView style={styles.content} contentContainerStyle={styles.reasons}>
        <UiText variant="heading" style={styles.title}>Why are you skipping this question?</UiText>
        {MANUAL_SKIP_REASONS.map(({ reason, label }) => (
          <SecondaryButton key={reason} label={label} onPress={() => onChoose(reason)} />
        ))}
      </ScrollView>
      <BottomBar>
        <TextLink label="Cancel" onPress={onCancel} />
      </BottomBar>
    </Canvas>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1 },
  reasons: { padding: tokens.space.lg, gap: tokens.space.sm },
  title: { marginBottom: tokens.space.sm },
});
