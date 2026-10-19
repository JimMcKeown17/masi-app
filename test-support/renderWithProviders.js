import React from 'react';
import { render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { PaperProvider } from 'react-native-paper';
import { DEFAULT_MOTION, MotionProvider } from '../src/context/MotionContext';
import { ToastProvider } from '../src/context/ToastContext';
import { SheetAccessibilityBackground, SheetAccessibilityProvider } from '../src/context/SheetAccessibilityContext';
import { paperTheme } from '../src/theme/paperTheme';

const DEFAULT_INSETS = { top: 0, bottom: 0, left: 0, right: 0 };
export function AllProviders({ children, motion = DEFAULT_MOTION, insets = DEFAULT_INSETS }) {
  return (
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets }}>
      <MotionProvider value={motion}>
        <ToastProvider>
          <SheetAccessibilityProvider>
            <PaperProvider theme={paperTheme}>
              <SheetAccessibilityBackground>{children}</SheetAccessibilityBackground>
            </PaperProvider>
          </SheetAccessibilityProvider>
        </ToastProvider>
      </MotionProvider>
    </SafeAreaProvider>
  );
}

export function renderWithProviders(ui, { motion = DEFAULT_MOTION, insets = DEFAULT_INSETS, ...options } = {}) {
  return render(ui, { wrapper: ({ children }) => <AllProviders motion={motion} insets={insets}>{children}</AllProviders>, ...options });
}
