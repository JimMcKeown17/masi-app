import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';
import * as Device from 'expo-device';
import { classifyTier, motionLevelForTier } from '../utils/deviceTier';

export const DEFAULT_MOTION = { tier: 'high', reduceMotion: false, motionLevel: 'full' };
const MotionContext = createContext(DEFAULT_MOTION);

export function MotionProvider({ value, children }) {
  const [reduceMotion, setReduceMotion] = useState(false);
  const overridden = value != null;
  useEffect(() => {
    if (overridden) return undefined;
    let mounted = true;
    let changed = false;
    const signals = {
      platform: Platform.OS, totalMemory: Device.totalMemory, deviceYearClass: Device.deviceYearClass,
    };
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled) => {
      changed = true;
      if (mounted) setReduceMotion(Boolean(enabled));
    });
    AccessibilityInfo.isReduceMotionEnabled().catch(() => false).then((enabled) => {
      if (!mounted) return;
      if (!changed) setReduceMotion(Boolean(enabled));
      console.log('[motion] device tier', { ...signals, tier: classifyTier({ ...signals, reduceMotion: Boolean(enabled) }) });
    });
    return () => { mounted = false; subscription.remove(); };
  }, [overridden]);

  const detected = useMemo(() => {
    const tier = classifyTier({
      platform: Platform.OS, totalMemory: Device.totalMemory, deviceYearClass: Device.deviceYearClass, reduceMotion,
    });
    return { tier, reduceMotion, motionLevel: motionLevelForTier(tier) };
  }, [reduceMotion]);
  return <MotionContext.Provider value={value ?? detected}>{children}</MotionContext.Provider>;
}

export function useMotion() {
  return useContext(MotionContext);
}
