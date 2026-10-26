import React, { useEffect, useState } from 'react';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';
import { tokens } from '../theme/tokens';
import { UiText } from './Text';

export function FlipNotice({ notice }: { notice: { id: number; text: string } | null }) {
  // Each ID owns one announcement and timer; parent re-renders keep that lifetime.
  return notice === null ? null : <Notice key={notice.id} text={notice.text} />;
}

function Notice({ text }: { text: string }) {
  const [message] = useState(text);
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(message);
    const timeout = setTimeout(() => setVisible(false), 3000);
    return () => clearTimeout(timeout);
  }, [message]);

  return visible ? (
    <View testID="flip-notice" accessibilityLiveRegion="polite" pointerEvents="none" style={styles.notice}>
      <UiText variant="captionStrong" tone="onInk">{message}</UiText>
    </View>
  ) : null;
}

const styles = StyleSheet.create({
  notice: {
    position: 'absolute', left: tokens.space.lg, right: tokens.space.lg, bottom: tokens.space.sm,
    backgroundColor: tokens.color.ink, borderRadius: tokens.radius.tile,
    paddingVertical: 10, paddingHorizontal: 14,
  },
});
