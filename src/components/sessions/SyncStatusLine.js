import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle, Path } from 'react-native-svg';
import { colors, tints } from '../../constants/colors';
import { duration } from '../../constants/motion';
import { typeRoles } from '../../constants/typography';
import { useMotion } from '../../context/MotionContext';
import { useOffline } from '../../context/OfflineContext';
import { useSignedInEA } from '../../context/SignedInEAContext';
import { deriveSyncState, describeSyncState } from '../../utils/syncStatusPresenter';

const GLYPHS = {
  waiting: 'cloud-upload-outline',
  offline: 'cloud-offline-outline',
  synced: 'cloud-done-outline',
  needs_attention: 'alert-circle-outline',
  syncing: 'spinner',
};

export function describeSyncLine({ phase, state, message }) {
  if (phase === 'pending') return null;
  if (phase === 'fallback') {
    return {
      glyph: 'cloud-outline', glyphColor: colors.textSecondary,
      textColor: colors.textSecondary, message: 'Saved on this phone',
    };
  }
  return {
    glyph: GLYPHS[state],
    glyphColor: state === 'synced' ? colors.successText
      : state === 'needs_attention' ? colors.warningText : colors.textSecondary,
    textColor: state === 'needs_attention' ? colors.warningText : colors.textSecondary,
    message,
  };
}

function SyncSpinner() {
  const { reduceMotion, motionLevel } = useMotion();
  const rotates = !reduceMotion && motionLevel !== 'still';
  const spin = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!rotates) return undefined;
    const loop = Animated.loop(Animated.timing(spin, {
      toValue: 1, duration: 1000, easing: Easing.linear, useNativeDriver: true,
    }));
    loop.start();
    return () => { loop.stop(); spin.setValue(0); };
  }, [rotates, spin]);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  return (
    <Animated.View style={[styles.spinner, rotates && { transform: [{ rotate }] }]}>
      <Svg width={18} height={18} viewBox="0 0 18 18" fill="none">
        <Circle cx={9} cy={9} r={7.7} stroke={tints.spinnerTrack} strokeWidth={2.6} />
        <Path d="M9 1.3 A7.7 7.7 0 0 1 16.7 9" stroke={colors.textSecondary} strokeWidth={2.6} strokeLinecap="round" />
      </Svg>
    </Animated.View>
  );
}

function LineContent({ line }) {
  return (
    <Text style={[styles.text, { color: line.textColor }]}>
      <View style={styles.glyph} accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {line.glyph === 'spinner' ? <SyncSpinner /> : <Ionicons name={line.glyph} size={18} color={line.glyphColor} />}
      </View>
      {line.message}
    </Text>
  );
}

export default function SyncStatusLine() {
  const { isOnline, isSyncing, waitingCount, needsAttentionCount, refreshSyncStatus } = useOffline();
  const { handle } = useSignedInEA();
  const [phase, setPhase] = useState('pending');
  const mounted = useRef(false);
  // This is a mount-time proof for this actor, never a retry on context/callback changes.
  const initialRead = useRef({ handle, refreshSyncStatus }).current;

  useEffect(() => {
    mounted.current = true;
    let active = true;
    const refresh = async () => {
      try {
        const snapshot = await initialRead.refreshSyncStatus({ autoTrigger: false });
        if (!mounted.current || !active) return;
        const fresh = snapshot !== null && typeof snapshot === 'object' && initialRead.handle.isCurrent();
        setPhase(fresh ? 'live' : 'fallback');
      } catch {
        if (mounted.current && active) setPhase('fallback');
      }
    };
    void refresh();
    return () => { active = false; mounted.current = false; };
  }, [initialRead]);

  const state = phase === 'live' ? deriveSyncState({ isOnline, isSyncing, waitingCount, needsAttentionCount }) : null;
  const message = phase === 'live' ? describeSyncState(state, { waitingCount, needsAttentionCount }).message : null;
  const line = useMemo(() => describeSyncLine({ phase, state, message }), [phase, state, message]);
  const [layers, setLayers] = useState({ current: null, previous: null });
  const currentLine = useRef(null);
  const fade = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!line) return undefined;
    const previous = currentLine.current;
    currentLine.current = line;
    fade.setValue(previous ? 0 : 1);
    setLayers({ current: line, previous });
    if (!previous) return undefined;

    let active = true;
    const animation = Animated.timing(fade, {
      toValue: 1, duration: duration.fade, easing: Easing.linear, useNativeDriver: true,
    });
    animation.start(({ finished }) => {
      if (mounted.current && active && finished) setLayers({ current: line, previous: null });
    });
    return () => { active = false; animation.stop(); };
  }, [line, fade]);

  return (
    <View style={styles.slot}>
      {layers.current ? (
        <Animated.View testID="sync-line-current" style={{ opacity: fade }}>
          <LineContent line={layers.current} />
        </Animated.View>
      ) : null}
      {layers.previous ? (
        <Animated.View testID="sync-line-previous" accessible={false} accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants" pointerEvents="none"
          style={[styles.previous, { opacity: fade.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) }]}>
          <LineContent line={layers.previous} />
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  slot: { minHeight: 18 },
  text: { ...typeRoles.textNote, textAlign: 'center' },
  glyph: { width: 26, height: 18 },
  spinner: { width: 18, height: 18 },
  previous: { position: 'absolute', top: 0, left: 0, right: 0 },
});
