import React, { createContext, useCallback, useContext, useLayoutEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

const RegisterSheetContext = createContext(null);
const OpenSheetCountContext = createContext(0);

export function SheetAccessibilityProvider({ children }) {
  const [openCount, setOpenCount] = useState(0);
  const register = useCallback(() => {
    setOpenCount(count => count + 1);
    return () => setOpenCount(count => count - 1);
  }, []);

  return <RegisterSheetContext.Provider value={register}>
    <OpenSheetCountContext.Provider value={openCount}>{children}</OpenSheetCountContext.Provider>
  </RegisterSheetContext.Provider>;
}

export function useSheetAccessibility(visible) {
  const register = useContext(RegisterSheetContext);
  useLayoutEffect(() => {
    if (visible) return register?.();
    return undefined;
  }, [visible, register]);
}

// Keep this inside PaperProvider: Portal.Host renders sheets after its children,
// outside this native wrapper. The root toast is also outside it.
export function SheetAccessibilityBackground({ children }) {
  const hidden = useContext(OpenSheetCountContext) > 0;
  return <View testID="sheet-accessibility-background" style={styles.background} collapsable={false}
    accessibilityElementsHidden={hidden} importantForAccessibility={hidden ? 'no-hide-descendants' : 'auto'}>
    {children}
  </View>;
}

const styles = StyleSheet.create({ background: { flex: 1 } });
